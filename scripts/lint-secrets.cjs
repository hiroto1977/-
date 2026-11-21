#!/usr/bin/env node
'use strict';

/*
 * lint:secrets — 追跡されているファイルに、資格情報の形をした文字列が入っていないか。
 *
 * ## なぜ要るか
 *
 * このリポジトリは公開されており、利用者の端末へ配るインストーラ・単一 HTML・
 * 公開サイトを GitHub Actions で作る。資格情報が 1 つ commit されると、
 * 履歴に残り、公開物にも入りうる。`lint:forbidden` は**危険な API の綴り**を、
 * `lint:charset` は**不可視・双方向の文字**を見るが、**鍵の形**は誰も見ていなかった。
 *
 * ## 何を見るか
 *
 * `git ls-files` の追跡ファイル (テキストだけ) の中の、発行元の接頭辞を持つ高信頼の形。
 * 偽陽性を避けるため、接頭辞と長さが固定の物だけを選ぶ。汎用の「高エントロピー」検出は
 * 偽陽性が多く、門が赤を無視される習慣を生むので入れない (`lint:forbidden` と同じ判断)。
 *
 * ## 台帳
 *
 * テストの見本や説明文に、形だけ本物らしい文字列が**意図して**在る場合がある。
 * それは `ALLOWED` に「ファイル・規則・件数・理由」で載せる。**件数が合わなければ
 * 落ちる** —— 新しい出現が増えても、消えても、どちらも台帳を直させる (双方向)。
 *
 * 見つけた値は**表示しない** (先頭 4 字と長さだけ)。ログに鍵を出してはいけない。
 *
 * Run: node scripts/lint-secrets.cjs [--self-test]
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

/**
 * 走査する本数の床 (2026-10-13 · パス 513 · F2)。
 *
 * この門の母集団は追跡ファイル全部 (`trackedFiles()` に濾しは無い)。台帳 (ALLOWED) は
 * **一致した件数**しか見ないので、**一致を 1 つも持たない大きな塊を落としても
 * 件数は変わらず exit 0** になる —— 実測 (2026-10-13 · 隔離した写し):
 *   `trackedFiles` を `!f.startsWith('knowledge-vault/')` で濾す (6,087 本を落とす)
 *   → `✅ 追跡ファイル 1874 件を走査` exit 0 (資格情報の形が 1 つも無い塊なので台帳は満たされたまま)。
 *
 * 床はこの「一致の無い塊を大きく落とす」編集を、台帳に依らず捕まえる。実測の母集団は
 * 9,276 本。床 5,000 は silent-pass の 1,874 本の上・実測の 54% の余裕を残す。
 * ★ `knowledge-vault/` (6,087 本 · 生成物) を追跡から外すのは正当な変更になりうるが、
 *   そのときは「資格情報の走査対象が 66% 減った」ことなので**割って気付かせる**のが正しい
 *   —— 意図した変更なら床を意識して下げること (実測に張り付けた値ではなく、
 *   silent-pass の上に置いた床である)。
 */
const MIN_SCANNED = 5000;

/** 走査本数が床を割っていたら断りの文、満たしていれば null (純関数 —— self-test が当てる)。 */
function floorProblem(scanned) {
  if (scanned >= MIN_SCANNED) return null;
  return (
    `走査した本数 ${scanned} が床 ${MIN_SCANNED} を下回りました —— 母集団が狭まっています `
    + '(trackedFiles の濾しを疑ってください)。一致の無い塊を落としても台帳は満たされたままなので、'
    + '「0 件だから健全」を避けるため fail closed で落とします。'
  );
}

/** 高信頼の形だけを置く。接頭辞と長さが固定のもの。 */
const PATTERNS = [
  { id: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g, what: 'GitHub の個人・アプリ・更新トークン' },
  { id: 'github-fine-grained', re: /\bgithub_pat_[A-Za-z0-9_]{60,255}\b/g, what: 'GitHub の細粒度トークン' },
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, what: 'AWS のアクセスキー ID' },
  { id: 'slack-token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, what: 'Slack のトークン' },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, what: 'Anthropic の API キー' },
  { id: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}/g, what: 'OpenAI の API キー' },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, what: 'Google の API キー' },
  { id: 'stripe-live-key', re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b/g, what: 'Stripe の本番キー' },
  { id: 'private-key-block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g, what: '秘密鍵の PEM ヘッダ' },
];

/**
 * 台帳: 追跡ファイルのうち、形が一致してよい物。`count` は**その規則で一致する件数**。
 * 件数が変わったら落ちる (増えた = 新しい資格情報かもしれない / 減った = 台帳が古い)。
 */
const ALLOWED = [
  { path: "docs/REMAINING_WORK.md", id: "slack-token", count: 1, reason: "記録の中の見本 (実在しない値。規則の説明として引いている)" },
  { path: "scripts/lint-forbidden-patterns.cjs", id: "private-key-block", count: 1, reason: "禁止規則の見本 (秘密鍵の直書きを検出する規則の文言。資格情報ではない)" },
  { path: "src/main/clients/__tests__/shopify.test.ts", id: "slack-token", count: 2, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/main/clients/__tests__/slack.test.ts", id: "slack-token", count: 2, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/main/clients/__tests__/types.test.ts", id: "anthropic-key", count: 1, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/main/clients/__tests__/types.test.ts", id: "github-token", count: 1, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/main/clients/__tests__/types.test.ts", id: "slack-token", count: 2, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/renderer/__tests__/webShimAiResponseFailures.test.ts", id: "anthropic-key", count: 4, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/renderer/__tests__/webShimEmotionsAndRecordEntry.test.ts", id: "anthropic-key", count: 3, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/renderer/__tests__/webShimInvokeNeverRejects.test.ts", id: "github-token", count: 2, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/renderer/__tests__/webShimPayloadRedaction.test.ts", id: "anthropic-key", count: 1, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/renderer/cloud/__tests__/cloudProviderAdapter.test.ts", id: "anthropic-key", count: 1, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/renderer/components/__tests__/pageErrorBoundary.test.ts", id: "github-token", count: 4, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/renderer/data/__tests__/localWrite.test.ts", id: "github-token", count: 4, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/renderer/data/__tests__/saasWriteWeb.test.ts", id: "github-token", count: 1, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/renderer/security/__tests__/vault.test.ts", id: "slack-token", count: 3, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/renderer/security/__tests__/vaultLockRace.test.ts", id: "slack-token", count: 1, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/renderer/security/__tests__/vaultRecordBinding.test.ts", id: "slack-token", count: 1, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/shared/__tests__/jsonBodyCensus.test.ts", id: "github-token", count: 1, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/shared/__tests__/redactionCoverage.test.ts", id: "slack-token", count: 2, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/shared/__tests__/safeErrorMessage.test.ts", id: "anthropic-key", count: 3, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/shared/__tests__/safeErrorMessage.test.ts", id: "github-token", count: 3, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/shared/ai/__tests__/chat.test.ts", id: "anthropic-key", count: 2, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
  { path: "src/shared/api/__tests__/http.test.ts", id: "github-token", count: 2, reason: "秘匿化・認証失敗の検査の見本 (実在しない値。形だけ本物らしく、伏せられることを確かめるため)" },
];

/** 出力用: 値そのものは出さず、先頭 4 字と長さだけ。 */
function redactedShape(value) {
  return `${value.slice(0, 4)}…(${value.length} 字)`;
}

/** テキストを走査し、一致の一覧 (規則 id・行・伏せた形) を返す。 */
function scanText(text) {
  const hits = [];
  const lines = text.split('\n');
  for (const pattern of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      pattern.re.lastIndex = 0;
      let m;
      while ((m = pattern.re.exec(lines[i])) !== null) {
        hits.push({ id: pattern.id, line: i + 1, shape: redactedShape(m[0]) });
        if (m[0].length === 0) pattern.re.lastIndex++;
      }
    }
  }
  return hits;
}

/** バイナリ (NUL を含む) は走査しない。 */
function isText(buf) {
  const head = buf.subarray(0, Math.min(buf.length, 8000));
  return !head.includes(0);
}

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean);
}

/** 規則ごとの件数を台帳と突き合わせ、問題の一覧を返す。 */
function ledgerProblems(counts, ledger = ALLOWED) {
  const problems = [];
  const seen = new Set();
  for (const row of ledger) {
    const key = `${row.path}::${row.id}`;
    seen.add(key);
    if (!row.reason || row.reason.trim().length < 10) {
      problems.push(`台帳の理由が空か短すぎます: ${key}`);
      continue;
    }
    const got = counts.get(key) ?? 0;
    if (got !== row.count) {
      problems.push(`${key}: 台帳 ${row.count} 件 / 実測 ${got} 件 (増えた = 新しい資格情報かもしれない。減った = 台帳を直す)`);
    }
  }
  for (const [key, got] of counts) {
    if (!seen.has(key)) problems.push(`${key}: 台帳に無い一致 ${got} 件 (資格情報か確かめ、見本なら理由つきで ALLOWED へ)`);
  }
  return problems;
}

/** 追跡ファイルを走査し、規則×ファイルの件数と、その行の一覧を返す。 */
function scanTree(files = trackedFiles()) {
  const counts = new Map();
  const details = [];
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    let buf;
    try {
      buf = fs.readFileSync(abs);
    } catch {
      continue; // 追跡されているが削除済み (作業ツリーに無い) は対象外
    }
    if (!isText(buf)) continue;
    const hits = scanText(buf.toString('utf8'));
    for (const h of hits) {
      const key = `${rel}::${h.id}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      details.push({ file: rel, ...h });
    }
  }
  return { counts, details, scanned: files.length };
}

function selfTest() {
  let bad = 0;
  const check = (label, ok) => {
    if (ok) console.log(`  ✓ ${label}`);
    else { bad++; console.log(`  ✗ ${label}`); }
  };
  // 見本は実行時に組み立てる (この file が自分の規則に当たらないように)。
  const gh = 'gh' + 'p_' + 'a'.repeat(36);
  const aws = 'AK' + 'IA' + 'A'.repeat(16);
  const pem = '-----BEGIN ' + 'RSA ' + 'PRIVATE KEY-----';
  check('GitHub の個人トークンの形を捕まえる', scanText(`token = "${gh}"`).some((h) => h.id === 'github-token'));
  check('AWS のアクセスキー ID の形を捕まえる', scanText(aws).some((h) => h.id === 'aws-access-key'));
  check('PEM の秘密鍵ヘッダを捕まえる', scanText(pem).some((h) => h.id === 'private-key-block'));
  check('短い gh_ は捕まえない (長さの床)', scanText('ghp_short').length === 0);
  check('普通の英単語は捕まえない', scanText('github token sk-learn ask').length === 0);
  check('値は伏せた形だけ出す (先頭 4 字と長さ)', scanText(gh)[0].shape === `ghp_…(${gh.length} 字)`);
  check('台帳: 件数が一致すれば問題は無い', ledgerProblems(new Map([['a.ts::github-token', 1]]), [{ path: 'a.ts', id: 'github-token', count: 1, reason: '見本として在る文字列の説明' }]).length === 0);
  check('台帳: 増えたら鳴る', ledgerProblems(new Map([['a.ts::github-token', 2]]), [{ path: 'a.ts', id: 'github-token', count: 1, reason: '見本として在る文字列の説明' }]).length === 1);
  check('台帳: 台帳に無い一致は鳴る', ledgerProblems(new Map([['b.ts::aws-access-key', 1]]), []).length === 1);
  check('台帳: 理由が空なら鳴る', ledgerProblems(new Map(), [{ path: 'a.ts', id: 'x', count: 0, reason: '' }]).length === 1);
  // F2 (パス 513): 母集団が大きく狭まったら鳴る床 (一致の無い塊を落としても台帳は満たされるため)。
  check('床: 実測どおりなら問題は無い', floorProblem(9276) === null);
  check('床: 床ちょうどは通す', floorProblem(MIN_SCANNED) === null);
  check('床: 狭まった母集団 (1874 本) は鳴る', floorProblem(1874) !== null);
  check('床: 0 件は鳴る (「無いので健全」を避ける)', floorProblem(0) !== null);
  console.log(bad === 0 ? '✅ self-test 全件一致' : `❌ self-test ${bad} 件不一致`);
  return bad === 0 ? 0 : 1;
}

function main() {
  let scan;
  try {
    scan = scanTree();
  } catch (err) {
    console.error(`❌ git ls-files が読めませんでした (fail closed): ${err.message}`);
    return 1;
  }
  const problems = ledgerProblems(scan.counts);
  const floor = floorProblem(scan.scanned);
  if (problems.length === 0 && !floor) {
    console.log(`✅ 追跡ファイル ${scan.scanned} 件を走査: 資格情報の形の一致は台帳どおり (${[...scan.counts.values()].reduce((a, b) => a + b, 0)} 件)`);
    return 0;
  }
  if (floor) console.error(`❌ ${floor}`);
  for (const p of problems) console.error(`❌ ${p}`);
  for (const d of scan.details.slice(0, 20)) console.error(`   ${d.file}:${d.line} ${d.id} ${d.shape}`);
  return 1;
}

module.exports = { PATTERNS, ALLOWED, scanText, scanTree, ledgerProblems, isText, MIN_SCANNED, floorProblem, trackedFiles };

if (require.main === module) {
  if (process.argv.includes('--self-test')) process.exit(selfTest());
  process.exit(main());
}

#!/usr/bin/env node
/**
 * 見本データに**実在の個人データ**が混ざっていないか。
 *
 * ## なぜ要るか
 *
 * `src/renderer/data/snapshot.ts` は 74 サービスの初期表示に使う見本データで、
 * **そのままバンドルに載り、GitHub Pages で公開される**。2026-08-23 に出荷物
 * (`dist/standalone.html`) を走査したところ、そこに載っていたのは見本ではなく
 * **持ち主本人の実データ**だった:
 *
 *   - 本人の Gmail アドレス (カレンダーのプライマリ ID) と家族カレンダーの ID
 *   - 実際の受信箱の差出人と件名 7 件 —— 使っている取引所・証券・不動産情報サイト、
 *     求人メールの地名から**居住地域**まで読み取れる
 *   - Google ドキュメント / ドライブの**実ファイル ID** 6 件
 *     (「リンクを知っている全員」で共有していれば、その ID だけで開ける)
 *   - Canva の実デザイン ID とサムネイル CDN トークン、実 Slack ワークスペース
 *     とチャンネル ID、Atlassian の cloudId、本人の WordPress ブログ 3 件
 *
 * 出荷物を見るまで誰も気付かなかった。ソースを読んでいるだけでは
 * 「もっともらしい見本」に見えるからで、**配る物の側から数える**必要がある。
 *
 * ## 規則 (実測で誤検知 0)
 *
 *  1. `package.json` の author メールとその local-part が
 *     `src/` `scripts/` `orchestration/` に無いこと
 *  2. `src/renderer/` のメールは `example.*` ドメインだけ (台帳あり)
 *  3. 業者ごとの URL の形で取り出した ID は `example` を含むこと (走査は上と同じ範囲)
 *     —— 形だけで実物と見本を見分けるのは無理なので、**見本には
 *     example と名乗らせる**。Google ドキュメント / ドライブ / Canva /
 *     Slack のように、ID そのものが到達手段になりうるものだけを見る。
 *
 * GitHub の login (`hiroto1977`) は対象外。このアプリ自身の公開リポジトリで、
 * 更新確認の宛先 (`api.github.com/repos/…`) にも Pages のオリジンにも出る。
 * 伏せても意味が無く、伏せた振りをするほうが害がある。
 *
 * 使い方:  node scripts/lint-sample-data.cjs
 *          node scripts/lint-sample-data.cjs --self-test
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
// 見本・プレースホルダは `data/` だけでなく画面側にも書かれる
// (実測: `AtlassianPage.tsx` の入力欄が `you@x.com` を出していた —— `x.com` は
// 実在ドメインで、RFC 2606 が見本用に取ってあるのは `example.*` のほう)。
// レンダラー全体を見る。`src/main` / `src/shared` は入れない —— あちらの
// 非 example は `attacker@evil.com` のような**攻撃側の見本**で、
// example に直すと何を試しているのか読めなくなる。
const DATA_DIR = path.join(REPO_ROOT, 'src/renderer');
// 規則 1 と 3 はビルド用スクリプトも見る。**実際にここへ書いてしまった**:
// `build-integration-demo.cjs` のコメントが Canva の実 ID を持っていて、
// `src/` だけを見ていた最初の版は素通りさせた (2026-08-23)。
const SCANNED_DIRS = ['src', 'scripts', 'orchestration'].map((d) => path.join(REPO_ROOT, d));

const EMAIL = /[A-Za-z0-9._%+#-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SAMPLE_DOMAIN = /@([a-z0-9-]+\.)*example\.(com|jp|org|net|co\.jp)$/i;

/**
 * 見本ではないが載ってよいもの。**理由を書けないものは載せない。**
 */
const EMAIL_ALLOW = {
  'ja.japanese#holiday@group.v.calendar.google.com':
    'Google が公開している日本の祝日カレンダーの ID。誰のものでもない公開値。',
  'family000000000000000000@group.calendar.google.com':
    '差し替え済みの見本。ドメインは Google だが local-part は 0 埋めの偽値。',
};

/**
 * Slack 自身のホスト。ワークスペースの部分ドメインではないので対象外。
 * (走査範囲をレンダラー全体へ広げたとき `api.slack.com/apps` —— 資格情報の
 * 発行先として画面に出しているリンク —— を掴んで誤検知した。)
 */
const SLACK_OWN_HOSTS = new Set(['api', 'app', 'files', 'hooks', 'status', 'my', 'edgeapi', 'www']);

/**
 * ID が到達手段になりうる業者の URL 形。取り出した ID は `example` を含むこと。
 * (形だけで実物と見本は見分けられないので、見本の側に名乗らせる。)
 */
const VENDOR_ID_SHAPES = [
  { name: 'Google ドキュメント', re: /docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{20,})/g },
  { name: 'Google ドライブ', re: /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{20,})/g },
  { name: 'Canva デザイン', re: /canva\.com\/design\/([A-Za-z0-9_-]{8,})/g },
  { name: 'Canva サムネイル', re: /design\.canva\.ai\/([A-Za-z0-9_-]{8,})/g },
  { name: 'Slack ワークスペース', re: /https:\/\/([a-z0-9][a-z0-9-]{2,})\.slack\.com/g, skip: SLACK_OWN_HOSTS },
];


function listFiles(dir, exts = /\.tsx?$/) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, exts));
    // この門自身は除く。自己検査は「鳴るべき形」を標本として抱えているので、
    // 自分を走査すると必ず自分を指す (このリポジトリで 4 度出た 0-a-17 と同型)。
    else if (exts.test(e.name) && path.resolve(p) !== __filename) out.push(p);
  }
  return out;
}

const read = (p) => ({ rel: path.relative(REPO_ROOT, p), text: fs.readFileSync(p, 'utf8') });

/** package.json の author メール (と local-part)。 */
function ownerIdentifiers(pkgJson) {
  const email = pkgJson?.author?.email;
  if (typeof email !== 'string' || !email.includes('@')) return [];
  return [email, email.slice(0, email.indexOf('@'))];
}

function check({ srcFiles, dataFiles, owner }) {
  const problems = [];

  // 1. 持ち主の識別子が src/ に無いこと。
  for (const { rel, text } of srcFiles) {
    for (const id of owner) {
      if (!text.includes(id)) continue;
      const line = text.slice(0, text.indexOf(id)).split('\n').length;
      problems.push({
        where: `${rel}:${line}`,
        why: `package.json の author の値 (${id}) がソースに入っています — 出荷物に載り公開されます`,
      });
    }
  }

  // 2. 見本データのメールは example.* だけ。
  for (const { rel, text } of dataFiles) {
    EMAIL.lastIndex = 0;
    let m;
    while ((m = EMAIL.exec(text)) !== null) {
      const addr = m[0];
      if (SAMPLE_DOMAIN.test(addr)) continue;
      if (Object.hasOwn(EMAIL_ALLOW, addr)) continue;
      problems.push({
        where: `${rel}:${text.slice(0, m.index).split('\n').length}`,
        why: `見本データに example 以外のメール (${addr}) —— 実在のアドレスなら公開ビルドに載ります`,
      });
    }
  }

  // 3. 到達手段になりうる ID は example を名乗ること。ビルド用スクリプトも見る
  //    (コメントに書いた ID も、公開リポジトリでは同じこと)。
  const seen = new Set(dataFiles.map((d) => d.rel));
  const idScanned = [...dataFiles, ...srcFiles.filter((f) => !seen.has(f.rel))];
  for (const { rel, text } of idScanned) {
    for (const { name, re, skip } of VENDOR_ID_SHAPES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (/example/i.test(m[1])) continue;
        if (skip !== undefined && skip.has(m[1].toLowerCase())) continue;
        problems.push({
          where: `${rel}:${text.slice(0, m.index).split('\n').length}`,
          why: `${name} の ID (${m[1]}) が見本と名乗っていません —— 実 ID なら共有リンクで開かれます`,
        });
      }
    }
  }
  return problems;
}

function selfTest() {
  const f = (text) => [{ rel: 'x.ts', text }];
  const cases = [
    ['持ち主のメールがソースに入っていたら鳴る', { srcFiles: f("const a = 'me@corp.jp';"), dataFiles: [], owner: ['me@corp.jp', 'me'] }, 2],
    ['持ち主の local-part だけでも鳴る', { srcFiles: f("const u = 'me';"), dataFiles: [], owner: ['me@corp.jp', 'me'] }, 1],
    ['持ち主の識別子が無ければ鳴らない', { srcFiles: f("const a = 'x@example.com';"), dataFiles: [], owner: ['me@corp.jp', 'me'] }, 0],
    ['見本の example メールは通す', { srcFiles: [], dataFiles: f("email: 'taro@example.com'"), owner: [] }, 0],
    ['サブドメイン付きの example も通す', { srcFiles: [], dataFiles: f("email: 'a@law.example.com'"), owner: [] }, 0],
    ['example.co.jp も通す', { srcFiles: [], dataFiles: f("email: 'a@example.co.jp'"), owner: [] }, 0],
    ['実在ドメインのメールは鳴る', { srcFiles: [], dataFiles: f("sender: 'support@vendor.invalid-demo'"), owner: [] }, 1],
    // 入力欄のプレースホルダも見本データ。`x.com` は実在ドメイン。
    ['画面のプレースホルダが実在ドメインでも鳴る', { srcFiles: [], dataFiles: f("placeholder: 'you@x.com'"), owner: [] }, 1],
    ['台帳にあるものは通す', { srcFiles: [], dataFiles: f("id: 'ja.japanese#holiday@group.v.calendar.google.com'"), owner: [] }, 0],
    [
      'Google ドキュメントの実 ID は鳴る',
      { srcFiles: [], dataFiles: f("url: 'https://docs.google.com/document/d/1AaBbCcDdEeFfGgHhIiJjKkLlMmNn/edit'"), owner: [] },
      1,
    ],
    [
      'example と名乗る ID は通す',
      { srcFiles: [], dataFiles: f("url: 'https://docs.google.com/document/d/1ExampleDocumentIdAAAAAAAAAAAAA/edit'"), owner: [] },
      0,
    ],
    ['Canva の実デザイン ID は鳴る', { srcFiles: [], dataFiles: f("u: 'https://www.canva.com/design/DAGzz11yy22'"), owner: [] }, 1],
    ['Slack の実ワークスペースは鳴る', { srcFiles: [], dataFiles: f("p: 'https://acme-corp-9x1.slack.com/archives/C1'"), owner: [] }, 1],
    ['example のワークスペースは通す', { srcFiles: [], dataFiles: f("p: 'https://example-team.slack.com/archives/C1'"), owner: [] }, 0],
    // Slack 自身のホストはワークスペースではない (資格情報の発行先として画面に出す)。
    ['api.slack.com は通す', { srcFiles: [], dataFiles: f("helpUrl: 'https://api.slack.com/apps'"), owner: [] }, 0],
    ['app.slack.com も通す', { srcFiles: [], dataFiles: f("u: 'https://app.slack.com/client'"), owner: [] }, 0],
    ['短い ID (業者の形に当たらない) は見ない', { srcFiles: [], dataFiles: f("id: 'C0AL7N42GBH'"), owner: [] }, 0],
  ];
  let bad = 0;
  console.log('self-test:');
  for (const [label, input, expected] of cases) {
    const n = check(input).length;
    const ok = n === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${n} 件 (期待 ${expected})`);
  }
  // 台帳の掃除 — 実物に無い許可が残っていたら消す。
  const dataText = listFiles(DATA_DIR).map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  for (const addr of Object.keys(EMAIL_ALLOW)) {
    if (!dataText.includes(addr)) {
      bad++;
      console.log(`  ✗ 台帳に実物が無い許可が残っている: ${addr}`);
    }
  }
  if (Object.values(EMAIL_ALLOW).some((r) => r.trim() === '')) {
    bad++;
    console.log('  ✗ 台帳に理由の無い項目がある');
  }
  console.log(`  ✓ 台帳 ${Object.keys(EMAIL_ALLOW).length} 件はすべて実物に在り、理由がある`);
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const owner = ownerIdentifiers(pkg);
  if (owner.length === 0) {
    console.error('❌ package.json の author.email を読めません — 規則 1 が空振りします');
    return 1;
  }
  const dataFiles = listFiles(DATA_DIR).map(read);
  const srcFiles = SCANNED_DIRS.flatMap((d) => listFiles(d, /\.(tsx?|cjs|mjs|js)$/)).map(read);
  const problems = check({ srcFiles, dataFiles, owner });
  console.log(
    `見本データ ${dataFiles.length} ファイル / ソース・スクリプト ${srcFiles.length} ファイルを検査 ` +
      `(持ち主の識別子 / example 以外のメール / 到達しうる ID・台帳 ${Object.keys(EMAIL_ALLOW).length} 件)`,
  );
  if (problems.length === 0) {
    console.log('✅ 見本データに実在の個人データは混ざっていません');
    return 0;
  }
  console.error(`❌ ${problems.length} 件:`);
  for (const p of problems) console.error(`  ${p.where}: ${p.why}`);
  return 1;
}

module.exports = { check, ownerIdentifiers, EMAIL_ALLOW, VENDOR_ID_SHAPES };

if (require.main === module) process.exit(main(process.argv.slice(2)));

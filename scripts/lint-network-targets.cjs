#!/usr/bin/env node
/**
 * lint:network-targets — 送り先ホストが定数でない通信を台帳で管理する。
 *
 * 2026-08 の監査で**同じ穴が 3 回**出た。送り先が保存内容や renderer の
 * payload で決まる経路が 4 つあり、そのうち 3 つはホスト名を絞っていて、
 * 1 つずつ絞り忘れていた:
 *
 *   - Shopify → Discord     : `hostname !== 'discord.com'` で拒否   ✅
 *   - Shopify → Salesforce  : プロトコルしか見ていなかった          ❌
 *   - main の Atlassian     : `.atlassian.net` を要求               ✅
 *   - ブラウザ版の Atlassian: ホスト名の判定が無かった              ❌
 *
 * どれも `Authorization` を付けて送るので、絞り忘れはそのまま資格情報の
 * 流出になる。人の目で 4 つ目を見つけるのは無理なので、**送り先が変数の
 * 通信は台帳に載っていなければ落とす**。
 *
 * 台帳は双方向に効く:
 *   - 台帳に無い変数送り先が現れたら fail (新しい未レビューの経路)
 *   - 台帳の項目が実在しなくなったら fail (直したら消す)
 *
 * 見るのは**ホスト部だけ**。パスやクエリの補間は対象外で、それは
 * encodeURIComponent の話 (別の関心事)。混ぜると無害な経路まで台帳に載り、
 * 本当に危ない数件が埋もれる。
 *
 * 検出は行ベースで、完全な構文解析ではない。狙いは「新しい経路が黙って
 * 増えないこと」であって、あらゆる書き方を捕まえることではない。
 *
 * Run: node scripts/lint-network-targets.cjs   /   npm run lint:network-targets
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
// 走査対象。**ここに書き忘れると、そのディレクトリは丸ごと見えない。**
// 2026-08 に実際そうなっていた: `src/shared/ai` が入っておらず、
// 5 プロバイダ分の「変数ホスト + Authorization」が 1 件も台帳に載っていなかった。
const ROOTS = [
  'src/main/clients',
  'src/shared/api',
  'src/shared/ai',
  'src/renderer/data',
  'src/renderer/network',
];

const NETWORK_CALL = /\b(jsonFetch|apiFetch|apiFetchOkFlag|transport|postExpectOk|fetchViaProxy)\b/;

/**
 * 送信そのものではなく「送り先の組み立て」を捕まえるための印。
 *
 * `src/shared/ai/providers.ts` の `buildRequest` は `{ url, headers, body }` を
 * 返すだけで fetch しない。送信は別モジュール (`chat.ts`) が
 * `f(httpReq.url, …)` と**変数**で呼ぶので、テンプレートリテラルを探す
 * 検出器はどちらの側にも掛からなかった。**組み立てと送信を別モジュールに
 * 分けると素通りする**のが 2026-08 に見つかった穴で、
 * 組み立て側の見た目 (`url:` / `const url =`) も入口として数える。
 */
// バッククォートを直後に要求しない。`const url = cond ? `${base}/a` : `${base}/b`;`
// のように三項で組み立てる形（互換 API がこれ）を取りこぼすため。
// 行に URL 形のテンプレートリテラルがあることは呼び出し側で既に確認済み。
const URL_ASSIGNMENT = /\b(url|endpoint|target)\s*[:=]/i;

/**
 * 送り先が変数で決まる通信の台帳。
 *
 * `template` は原文そのまま。行番号ではなく本文で照合するので、行が
 * 動いても壊れない。`guard` はその送り先をどう絞っているか — **ここに
 * 書けないなら、それは絞っていないということ。**
 */
const REVIEWED = [
  {
    file: 'src/main/clients/atlassian.ts',
    template: '`${creds.site}/rest/api/3/issue`',
    guard: 'parseAtlassianToken → shared/atlassianSite.ts で *.atlassian.net のみ許可し hostname から組み直す',
  },
  {
    file: 'src/main/clients/shopify.ts',
    template: '`${base.origin}/services/data/v59.0/sobjects/Contact/`',
    guard: 'syncToSalesforce が *.salesforce.com のみ許可 (2026-08 監査で追加)',
  },
  {
    file: 'src/shared/api/atlassian.ts',
    template: '`${site}/rest/api/3/search`',
    guard: 'normalizeAtlassianSite → shared/atlassianSite.ts',
  },
  {
    file: 'src/shared/api/atlassian.ts',
    template: '`${site}/wiki/api/v2/pages/${encodeURIComponent(pageId)}`',
    guard: 'normalizeAtlassianSite → shared/atlassianSite.ts',
  },
  {
    file: 'src/renderer/data/saasWriteWeb.ts',
    template: '`${creds.site}/rest/api/3/issue`',
    guard: 'parseAtlassianToken → shared/atlassianSite.ts (2026-08 監査で追加)',
  },
  {
    file: 'src/main/clients/atlassian.ts',
    template: '`${creds.site}/rest/api/3/project/search?maxResults=50`',
    guard: 'parseAtlassianToken → shared/atlassianSite.ts。2026-08 に検出器を直すまで台帳から漏れていた（jsonFetch が次の行にあり、直前 3 行しか見ない文脈判定に掛からなかった）',
  },
  {
    file: 'src/main/clients/atlassian.ts',
    template: '`${creds.site}/browse/${res.key}`',
    guard: '同上のホスト検証済み。これは送信ではなく画面へ返す表示用 URL（openExternal で開く）で、資格情報は乗らない',
  },
  {
    file: 'src/renderer/data/saasWriteWeb.ts',
    template: '`${creds.site}/browse/${data.key}`',
    guard: '同上（ブラウザ版の表示用 URL）',
  },
  {
    file: 'src/shared/ai/providers.ts',
    template: '`${base}/v1/messages`',
    guard: 'resolveBase → shared/aiEndpoint.ts。AI は利用者が自分でエンドポイントを決めるのが機能なのでホスト名の許可リストは張れない。代わりに送り方を絞る: http/https のみ・userinfo 禁止・制御文字禁止・クエリ/断片禁止・**鍵を送るなら loopback 以外の平文 http を禁止**',
  },
  {
    file: 'src/shared/ai/providers.ts',
    template: '`${base}/v1/chat/completions`',
    guard: '同上（OpenAI・Authorization: Bearer が乗る）',
  },
  {
    file: 'src/shared/ai/providers.ts',
    template: '`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`',
    guard: '同上（Gemini・x-goog-api-key が乗る）',
  },
  {
    file: 'src/shared/ai/providers.ts',
    template: '`${base}/api/chat`',
    guard: '同上。ただし Ollama は鍵を送らないので credentialed=false で呼び、LAN の平文 http を許す',
  },
  {
    file: 'src/shared/ai/providers.ts',
    template: '`${base}/chat/completions`',
    guard: '同上（OpenAI 互換）。鍵があるときだけ credentialed=true になる',
  },
];

/**
 * **ホスト部**が定数か。
 *
 * 見るのはホストだけで、パスやクエリの補間は対象外。ここが見張りたいのは
 * 「資格情報を付けた要求がどこへ飛ぶか」であって、パスの組み立てではない
 * (パスは encodeURIComponent の話で、別の関心事)。混ぜると、ホストが定数の
 * 無害な `${API}/x?page=${page}` まで台帳に載せることになり、
 * 台帳が長くなって**本当に危ない 5 件が埋もれる**。
 */
function hasConstantHost(template) {
  const body = template.slice(1, -1); // 前後のバッククォートを外す
  // 生のスキームで始まる = ホストはリテラル。
  if (/^https?:\/\//.test(body)) return true;
  // `${EXPR}/...` で始まる = ホストは EXPR 次第。ALL_CAPS の定数だけ許す。
  const lead = /^\$\{([^}]*)\}/.exec(body);
  if (lead) return /^[A-Z_][A-Z0-9_]*$/.test(lead[1].trim());
  return false;
}

function collect() {
  const found = [];
  for (const root of ROOTS) {
    const abs = path.join(REPO_ROOT, root);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const m = /`(https?:\/\/[^`]*|\$\{[^`]*)`/.exec(lines[i]);
        if (!m) continue;
        const template = m[0];
        // URL 引数らしさ: 同じ行か直前 3 行に通信呼び出しがある。
        const ctx = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
        if (!NETWORK_CALL.test(ctx) && !URL_ASSIGNMENT.test(lines[i])) continue;
        // パスで始まらない (= URL ではない) テンプレートは除く。
        if (!/^`(https?:\/\/|\$\{[^}]*\}\/)/.test(template)) continue;
        if (hasConstantHost(template)) continue;
        found.push({ file: rel, line: i + 1, template });
      }
    }
  }
  return found;
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__tests__' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (/\.ts$/.test(e.name)) yield full;
  }
}

function main() {
  const found = collect();
  const problems = [];

  for (const f of found) {
    const hit = REVIEWED.find((r) => r.file === f.file && r.template === f.template);
    if (!hit) {
      problems.push(
        `${f.file}:${f.line} — 送り先が変数で決まる通信が台帳にありません\n` +
          `    ${f.template}\n` +
          `    ホスト名を許可リストで絞ったうえで scripts/lint-network-targets.cjs の REVIEWED に追記してください。\n` +
          `    絞っていないなら、それは資格情報の流出経路です。`,
      );
    }
  }

  for (const r of REVIEWED) {
    const still = found.some((f) => f.file === r.file && f.template === r.template);
    if (!still) {
      problems.push(
        `${r.file} — 台帳の項目が実在しません (直したか移動した)\n` +
          `    ${r.template}\n` +
          `    REVIEWED から消してください。残すと「見張っているつもり」だけが残ります。`,
      );
    }
  }

  console.log(
    `Scanned ${ROOTS.length} directories: ${found.length} network target(s) whose destination comes from a variable`,
  );
  if (problems.length === 0) {
    console.log(`✅ 送り先が変数の通信 ${found.length} 件はすべて台帳にあり、ホスト名を絞っています`);
    return 0;
  }
  console.error(`❌ ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

process.exit(main());

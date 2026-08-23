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
// 2026-08-22: **一覧をやめて src 全体にした。**
// 上の注記は「書き忘れるとそのディレクトリは丸ごと見えない」と警告していたが、
// 直し方は「足りない 1 つを足す」だった —— 一覧である限り同じことが起きる。
// 実際もう一度起きていて、`src/main/oauth.ts` の**トークン交換と更新**
// (client secret と認可コード / refresh token を載せる送信) が
// `config.tokenUrl` という丸ごと変数の宛先へ飛んでいながら、
// `src/main/clients` の外なので台帳に一度も載っていなかった。
const ROOTS = ['src'];

// 2026-08-22 の点検で足した: **`fetch` そのものが入っていなかった。**
// 一覧はこの repo のラッパ (jsonFetch / apiFetch / transport …) だけを見て
// おり、素の `fetch(\`https://${host}/…\`)` — つまり危ない書き方の中で
// 一番素直なもの — が丸ごと視界の外だった。`Authorization: Bearer` を
// 載せた実物を差し込んでも鳴らないことを実測して気付いた。
//
// 2026-08-23: **名前の一覧を 1 つにした。** 下の `BARE_SEND` はこれとは別に
// 4 つ (`fetch|fetchFn|doFetch|f`) しか見ておらず、**この repo で一番使われる
// ラッパ `jsonFetch` が入っていなかった**。同じ宛先・同じ資格情報でも
//
//     fetch(cfg.instanceUrl, …)      → 鳴る
//     jsonFetch(cfg.instanceUrl, …)  → 鳴らない   ← 実測
//
// という差が出る。片方の検出器だけが知っている名前がある状態は、
// 同じファイルの中で「何が通信か」の定義が 2 つあるということ。一覧から
// 両方を組み立てて、ずれようがなくする。
const NETWORK_CALL_NAMES = [
  'fetch',
  'fetchFn',
  'doFetch',
  'jsonFetch',
  'apiFetch',
  'apiFetchOkFlag',
  'transport',
  'postExpectOk',
  'fetchViaProxy',
];

const NETWORK_CALL = new RegExp(`\\b(${NETWORK_CALL_NAMES.join('|')})\\b`);

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
 * 送り先が**丸ごと変数**の送信。
 *
 * 上の検出器はテンプレートリテラルを探す。組み立てを捕まえる設計なので、
 * **一度も組み立てられない送り先**は原理的に掛からない —
 * `fetch(cfg.url, …)` のように、URL がまるごと保存済みデータから来る形である。
 * 2026-08 の監査で、それがこのアプリで**最も価値の高い送り先**
 * (BYO プロキシ: 全サービスのトークンが封筒に入って通る) だと分かったので、
 * 別の入口として数える。
 *
 * 対象を「プロパティ参照」に絞るのは、`f(url, init)` のような転送ヘルパの
 * 素の引数まで拾うと台帳が「呼び出し側で検証済み」だらけになり、
 * **本当に見たい数件が埋もれる**ため。オブジェクトから読み出しているのは
 * 「どこかに保持されていた URL をここで送っている」印になる。
 *
 * **この検出器の限界**: `const u = cfg.url; fetch(u, …)` と一度ローカルへ
 * 置き換えれば掛からない。完全な検査ではなく、**新しい送り先が増えたときに
 * 台帳を書かせるための入口**である。限界を書かずに置くと「見張っているつもり」
 * になるので明記する。
 */
// 名前は `NETWORK_CALL_NAMES` と共有する (上の注記を参照)。`f` だけは
// こちら専用 —— 転送ヘルパを 1 文字で受ける書き方が実在するため。
const BARE_SEND = new RegExp(
  `\\b(?:${[...NETWORK_CALL_NAMES, 'f'].join('|')})\\s*\\(\\s*` +
    '([A-Za-z_$][\\w$]*\\.[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)\\s*,',
);

const REVIEWED_VARIABLE_DESTINATIONS = [
  {
    file: 'src/main/clients/github.ts',
    dest: 'item.pull_request.url',
    guard:
      '**応答本文から来る送り先。** /search/issues の各項目が返す PR の API URL を'
      + ' そのまま叩き直す形で、値を決めているのは相手のサーバである。'
      + ' 送信の直前に `new URL()` で解析し、`protocol === https:` かつ'
      + ' `hostname === api.github.com` でなければ叩かずに fallback を返す。'
      + ' PAT (Authorization) が乗るので、乗っ取られた検索応答が別ホストを指しても'
      + ' 出て行かない。2026-08-23 に検出器を広げるまで、この行は台帳の外にいた'
      + ' (`jsonFetch<T>(` の型引数 + 引数が次の行、の 2 点で素通りしていた)。',
  },
  {
    file: 'src/shared/ai/chat.ts',
    dest: 'httpReq.url',
    guard: 'buildRequest が組み立てた直後の値。各 provider の base は resolveBase → shared/aiEndpoint.ts を通っている (上の providers.ts の 5 件と同じ絞り)',
  },
  {
    file: 'src/main/oauth.ts',
    dest: 'config.tokenUrl',
    guard:
      'OAUTH_CONFIGS (このファイル内のハードコード表・10 プロバイダ) の値だけ。'
      + ' 呼び出し口は 2 つで、どちらも表から引いた config を渡す:'
      + ' main.ts の oauth:authorize は OAUTH_CONFIGS[serviceId] を Object.hasOwn で引き、'
      + ' renderer から差し替えられるのは clientId だけ (CLIENT_ID_RE で検証)。'
      + ' secrets.ts の更新経路も同じ表。送信直前に assertHttpsEndpoint で https を強制する (認可 URL 側も同じ関門)。'
      + ' ただし assertHttpsEndpoint が見るのは**スキームだけでホストは見ない**ので、'
      + ' 封じ込めは「表がハードコードであること」に依存している —— tokenUrl を'
      + ' 設定可能にする変更は、client secret の送り先を外部が選べるようにする変更と同義。',
  },
  {
    file: 'src/renderer/network/proxy.ts',
    dest: 'proxyChecked.url',
    guard: 'normalizeProxyEndpoint → shared/proxyEndpoint.ts。保存時・読み出し時・送信直前の 3 か所すべてで通す。http は loopback のみ (全サービスのトークンが乗るため)・userinfo 禁止・制御文字禁止・断片禁止。送るのは検証した正規化 href そのもの',
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
  // `${EXPR}/...` で始まる = ホストは EXPR 次第。ALL_CAPS の定数だけ許す。
  const lead = /^\$\{([^}]*)\}/.exec(body);
  if (lead) return /^[A-Z_][A-Z0-9_]*$/.test(lead[1].trim());
  // スキームで始まるものは、**権限部 (host[:port]) だけ**を見る。
  //
  // 2026-08-22 の点検までは「生のスキームで始まる = ホストはリテラル」と
  // 決めつけていた。ところが `https://${host}/v1/data` はスキームで始まり、
  // **かつホストが変数**である。つまりこの検査が探している当のものが、
  // 唯一の素通り口になっていた (`Authorization: Bearer` を載せた実物を
  // 差し込んでも鳴らないことを実測)。
  //
  // 権限部はスキームの後ろから最初の `/` `?` `#` まで。そこに `${` が
  // あれば送り先は実行時に決まる。
  const authority = /^https?:\/\/([^/?#]*)/.exec(body);
  if (!authority) return false;
  return !authority[1].includes('${');
}

/**
 * 陰性対照 — **このゲートが本当に鳴るか**を毎回確かめる。
 *
 * 2026-08-22 に、鳴らない穴が 2 つ同時に見つかった:
 *   (1) `hasConstantHost` が「スキームで始まる = ホストはリテラル」と決めつけ、
 *       `https://${host}/…` を定数扱いしていた
 *   (2) `NETWORK_CALL` に **`fetch` そのものが無く**、素の fetch が視界の外だった
 * どちらか片方でも残っていると、`Authorization` 付きの変数送り先が素通りする。
 */
function selfTest() {
  const hostCases = [
    ['スキームの後ろが変数なら「変数の送り先」', '`https://${host}/v1/data`', false],
    ['サブドメインの補間も変数扱い', '`https://${tenant}.example.com/v1`', false],
    ['ホストが定数ならパスの補間は無視する', '`https://api.github.com/users/${id}`', true],
    ['ALL_CAPS の定数で始まるのは許す', '`${API_BASE}/v1/x`', true],
    ['小文字の変数で始まるのは許さない', '`${base}/v1/x`', false],
    // ホストが定数でもポートが変数なら「変数の送り先」に倒す。冒頭には
    // 「見るのはホスト部だけ」と書いてあり、相手が変わらない以上リスクは
    // 小さいが、権限部 (host:port) の補間は**台帳 1 行で済む**ので閉じる側に
    // 寄せる。実コードには 1 件も無い (この判定で全件が緑のまま)。
    ['ホストが定数でもポートが変数なら変数扱い (閉じる側に倒す)', '`https://example.com:${port}/x`', false],
  ];
  let bad = 0;
  for (const [label, tpl, expected] of hostCases) {
    const got = hasConstantHost(tpl);
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got ? '定数' : '変数'} (期待 ${expected ? '定数' : '変数'})`);
  }
  const callCases = [
    ['素の fetch を通信とみなす', 'await fetch(`https://${h}/x`);', true],
    ['ラッパも通信とみなす', 'await jsonFetch(`https://${h}/x`);', true],
    ['通信でない行は拾わない', 'const label = `https://${h}/x`;', false],
  ];
  for (const [label, line, expected] of callCases) {
    const got = NETWORK_CALL.test(line);
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} (期待 ${expected})`);
  }
  // `BARE_SEND` にはこれまで self-test が 1 件も無かった。名前の一覧が
  // `NETWORK_CALL` とずれていたのも、行をまたぐ書き方と型引数を見ていなかった
  // のも、**確かめる場所が無かったから**気付けなかった。
  //
  // 実測した素通りの形をそのまま並べる。`joined` は collectBareSends と同じ
  // 前処理 (次の行を繋ぎ、型引数を落とす)。
  const prep = (a, b = '') => `${a} ${b}`.replace(/<[^<>]*>/g, '');
  const bareCases = [
    ['素の fetch + プロパティ参照', prep('await fetch(cfg.url, init);'), true],
    ['ラッパ jsonFetch でも同じ', prep('await jsonFetch(cfg.url, init);'), true],
    ['型引数が挟まっても見る', prep('await jsonFetch<Detail>(cfg.url, init);'), true],
    ['引数が次の行でも見る', prep('const r = await jsonFetch<Detail>(', '  cfg.instanceUrl,'), true],
    ['postExpectOk も通信', prep('await postExpectOk(payload.webhookUrl, init);'), true],
    // 素の識別子は**わざと**見ない (転送ヘルパの引数まで拾うと台帳が埋もれる)。
    ['素の識別子は拾わない (意図)', prep('await jsonFetch(url, init);'), false],
    ['通信でない呼び出しは拾わない', prep('await render(cfg.url, init);'), false],
  ];
  for (const [label, line, expected] of bareCases) {
    const got = BARE_SEND.test(line);
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} (期待 ${expected})`);
  }
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件 — ゲートが鳴らない / 鳴りすぎている`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
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

/** 送り先が丸ごと変数の送信を集める（BARE_SEND の説明を参照）。 */
function collectBareSends() {
  const found = [];
  for (const root of ROOTS) {
    const abs = path.join(REPO_ROOT, root);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 文字列 / コメントの中の `f(a.b, …)` を拾わない（学術コーパスの
        // 本文に `f(A,M,O)` のような記法が実在する）。
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
        // **1 行だけ見ると、この repo の書き方の大半を取りこぼす。**
        //
        //   1. 長い呼び出しは prettier が引数を次の行へ送る:
        //        const res = await jsonFetch<T>(
        //          cfg.instanceUrl,
        //   2. 型引数が名前と `(` の間に入る: `jsonFetch<StripeCustomer>(`
        //
        // どちらも実測で素通りした (2026-08-23)。次の行までを 1 つに繋ぎ、
        // 型引数を落としてから当てる。名前が今の行に在るときだけ数える
        // ので、次の行を見た分の二重計上は起きない。
        const joined = `${line} ${lines[i + 1] ?? ''}`.replace(/<[^<>]*>/g, '');
        const m = BARE_SEND.exec(joined);
        if (!m) continue;
        if (m.index >= line.replace(/<[^<>]*>/g, '').length) continue;
        if (/^\s*['"`]/.test(line) || /['"]\s*$/.test(trimmed)) continue;
        found.push({ file: rel, line: i + 1, dest: m[1] });
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
  if (process.argv.includes('--self-test')) return selfTest();
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

  const bare = collectBareSends();
  for (const f of bare) {
    const hit = REVIEWED_VARIABLE_DESTINATIONS.find((r) => r.file === f.file && r.dest === f.dest);
    if (!hit) {
      problems.push(
        `${f.file}:${f.line} — 送り先が丸ごと変数の送信が台帳にありません\n` +
          `    ${f.dest}\n` +
          `    どこで検証した URL なのかを scripts/lint-network-targets.cjs の\n` +
          `    REVIEWED_VARIABLE_DESTINATIONS に書いてください。書けないなら絞れていません。`,
      );
    }
  }
  for (const r of REVIEWED_VARIABLE_DESTINATIONS) {
    const still = bare.some((f) => f.file === r.file && f.dest === r.dest);
    if (!still) {
      problems.push(
        `${r.file} — 台帳の項目 (送り先が変数) が実在しません (直したか移動した)\n` +
          `    ${r.dest}\n` +
          `    REVIEWED_VARIABLE_DESTINATIONS から消してください。`,
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
    `Scanned ${ROOTS.length} directories: ${found.length} network target(s) whose destination comes from a variable, ` +
      `${bare.length} send(s) whose destination is a variable outright`,
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

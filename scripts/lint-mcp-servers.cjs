#!/usr/bin/env node
/**
 * lint:mcp-servers — セッション開始時に走る遠隔コードの台帳。
 *
 * ## なぜ要るのか (2026-08-25 実測)
 *
 * `.claude/settings.json` は**追跡されている**設定で、25 個の MCP サーバを
 * 宣言している。どれも起動のたびに取得して実行する形である:
 *
 *     "command": "npx", "args": ["-y", "<パッケージ>", …]
 *     "command": "uvx", "args": ["<パッケージ>", …]
 *
 * `npx -y` は確認を飛ばして**その時の最新**を取り、`uvx` も同じ。しかも
 * これらは飾りではなく能力を持って走る —— リポジトリの木
 * (`server-filesystem .`)、git (`--repository .`)、保管庫
 * (`mcp-obsidian ./knowledge-vault`)、ローカル DB (`--db-path ./data/local.db`)。
 *
 * このリポジトリは同じ危険を**他の場所では**すべて塞いでいる:
 *
 *   - 第三者の GitHub Action は SHA 固定 (`lint:workflow-security`)
 *   - npm の依存は registry のみ + integrity 必須 (`lint:deps`)
 *   - `curl | sh` は理由と固定方法つきの台帳 (`lint:shell`)
 *   - 改竄検知の鎖が 49 ファイル
 *
 * ところが `.claude/settings.json` は**どのゲートも走査していなかった**。
 * 規則は在るのに、いちばん効く場所に届いていない —— この repo で今日
 * 繰り返し出た形そのものである。
 *
 * ## 実測でわかったこと
 *
 * 名前を registry へ読み取りで問い合わせた (実行はしていない):
 *
 *   PyPI  mcp-server-filesystem   **404 — 名前が空いている**
 *   PyPI  mcp-server-git/-time/-fetch/-sqlite   200
 *   npm   20 件すべて 200
 *
 * `uvx mcp-server-filesystem .` は**今日は失敗する**。だが名前が空いている
 * ということは、誰かが登録した日から、セッション開始のたびにその人の
 * コードがリポジトリのパスを引数として走る、ということである。
 * 公式の filesystem サーバは npm 側の `@modelcontextprotocol/server-filesystem`
 * にあり (同じ maintainer)、そちらへ向け直した。
 *
 * ## この門が約束すること / しないこと
 *
 * **する**: 台帳に無いサーバが黙って増えないこと。起動子が既知のものだけで
 * あること。名前空間つき (`@org/…`) かどうかを数え、**素の名前**の数を
 * 固定すること —— 素の名前は取り違え・名前の乗っ取りが起きる場所である。
 *
 * **しない**: 版の固定そのものは要求しない。`npx -y pkg@1.2.3` へ倒すと、
 * 手元の道具が更新されなくなる (持ち主の判断であって、機械が決めることでは
 * ない)。代わりに「固定されていないサーバが何件あるか」を数として留め、
 * 増えたら気付く形にする。減らすのは持ち主の裁量。
 *
 * 使い方:  node scripts/lint-mcp-servers.cjs
 *          node scripts/lint-mcp-servers.cjs --self-test
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SETTINGS = path.join(REPO_ROOT, '.claude/settings.json');

/** 起動子として認めるもの。これ以外 (bash / sh / curl …) は理由なく置けない。 */
const ALLOWED_LAUNCHERS = new Set(['npx', 'uvx']);

/**
 * サーバの台帳。鍵は設定の名前。
 *
 *   registry : どこから取るか (npm / pypi)
 *   pkg      : 実際のパッケージ名
 *   why      : **能力を持って手元で走る**ものなので、置いてある理由
 */
const LEDGER = {
  filesystem: { registry: 'npm', pkg: '@modelcontextprotocol/server-filesystem', why: 'リポジトリの木を読ませる。公式 (Anthropic)。素の名前 mcp-server-filesystem は PyPI で未登録=乗っ取り可能だったため 2026-08-25 に付け替えた' },
  git: { registry: 'pypi', pkg: 'mcp-server-git', why: 'git 操作。公式 (Anthropic, PBC.)' },
  sqlite: { registry: 'pypi', pkg: 'mcp-server-sqlite', why: 'ローカル DB (./data/local.db) の読み書き。公式リポジトリ由来' },
  time: { registry: 'pypi', pkg: 'mcp-server-time', why: '時刻・タイムゾーン。公式リポジトリ由来 (個人 maintainer)' },
  fetch: { registry: 'pypi', pkg: 'mcp-server-fetch', why: 'URL 取得。公式 (Anthropic, PBC.)' },
  memory: { registry: 'npm', pkg: '@modelcontextprotocol/server-memory', why: '会話をまたぐ記憶。公式 (Anthropic の名前空間)' },
  'sequential-thinking': { registry: 'npm', pkg: '@modelcontextprotocol/server-sequential-thinking', why: '段階的推論の補助。公式 (Anthropic の名前空間)' },
  context7: { registry: 'npm', pkg: '@upstash/context7-mcp', why: 'ライブラリ文書の取得。Upstash の名前空間' },
  playwright: { registry: 'npm', pkg: '@executeautomation/playwright-mcp-server', why: 'ブラウザ操作。名前空間つき' },
  docker: { registry: 'npm', pkg: 'mcp-server-docker', why: 'Docker 操作。**素の名前・個人 maintainer**' },
  obsidian: { registry: 'npm', pkg: 'mcp-obsidian', why: 'knowledge-vault を読む。**素の名前・個人 maintainer**' },
  'brave-search': { registry: 'npm', pkg: '@modelcontextprotocol/server-brave-search', why: 'Web 検索。公式 (Anthropic の名前空間)。鍵は環境変数で渡す' },
  'google-maps': { registry: 'npm', pkg: '@modelcontextprotocol/server-google-maps', why: '地図・経路。公式 (Anthropic の名前空間)' },
  github: { registry: 'npm', pkg: '@modelcontextprotocol/server-github', why: 'GitHub 操作。公式 (Anthropic の名前空間)' },
  atlassian: { registry: 'npm', pkg: 'mcp-atlassian', why: 'Jira/Confluence。**素の名前・個人 maintainer**' },
  notion: { registry: 'npm', pkg: '@notionhq/notion-mcp-server', why: 'Notion。ベンダー公式の名前空間' },
  slack: { registry: 'npm', pkg: '@modelcontextprotocol/server-slack', why: 'Slack 読み書き。公式 (Anthropic の名前空間)' },
  gdrive: { registry: 'npm', pkg: '@modelcontextprotocol/server-gdrive', why: 'Google Drive。公式 (Anthropic の名前空間)' },
  linear: { registry: 'npm', pkg: 'mcp-server-linear', why: 'Linear。**素の名前・個人 maintainer**' },
  sentry: { registry: 'npm', pkg: '@sentry/mcp-server', why: 'Sentry。ベンダー公式' },
  stripe: { registry: 'npm', pkg: '@stripe/agent-toolkit', why: 'Stripe。ベンダー公式' },
  shopify: { registry: 'npm', pkg: '@shopify/dev-mcp', why: 'Shopify。ベンダー公式' },
  cloudflare: { registry: 'npm', pkg: '@cloudflare/mcp-server-cloudflare', why: 'Cloudflare。ベンダー公式' },
  discord: { registry: 'npm', pkg: 'mcp-discord', why: 'Discord。**素の名前・個人 maintainer**' },
  youtube: { registry: 'npm', pkg: 'youtube-mcp-server', why: 'YouTube。**素の名前・個人 maintainer**' },
};

/**
 * **素の名前 (名前空間なし) の数**。ここが増えるということは、取り違えや
 * 名前の乗っ取りが効く面が広がるということ。
 *
 * 実測 2026-08-25: **10 件**。内訳は PyPI 側 4 (mcp-server-git / -sqlite /
 * -time / -fetch。公式リポジトリ由来だが PyPI では名前空間を持てない) と
 * npm 側 6 (mcp-server-docker / mcp-obsidian / mcp-atlassian /
 * mcp-server-linear / mcp-discord / youtube-mcp-server。いずれも個人 maintainer)。
 *
 * この数は最初 6 と書いた —— npm 側だけを数えて PyPI 側を落としていた。
 * この門自身が鳴って気付いた。**数は数え直して書く**。
 */
const UNSCOPED_BUDGET = 10;

/**
 * 環境変数の名前が**資格情報**を指しているか。値は `${...}` の参照なので
 * 中身は見えない —— 見るのは名前だけでよい (何を渡す口が開いているか)。
 */
const SECRET_ENV = /TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL/i;

/**
 * **素の名前 かつ 資格情報を受け取る**サーバ。ここがいちばん鋭い集合である。
 *
 * 版が固定されていないので、そのパッケージの次の版は今日と別の人が出せる。
 * そこへ生きた鍵を渡しているのだから、悪い版が 1 つ出た時点で鍵はそのまま
 * 外へ出る。名前空間つき (`@stripe/…` など) なら公開できる者が組織に
 * 限られるので、同じ「未固定」でも面がまるで違う。
 *
 * 実測 2026-08-25 (registry へ読み取りで確認):
 *
 *   atlassian → mcp-atlassian      (vijay_duke)   ATLASSIAN_API_TOKEN ほか 6
 *   linear    → mcp-server-linear  (dvcrn)        LINEAR_API_KEY
 *   discord   → mcp-discord        (barry99625)   DISCORD_BOT_TOKEN
 *   youtube   → youtube-mcp-server (hk4crprasad)  YOUTUBE_API_KEY
 *
 * 減らすのは持ち主の裁量 (版を固定する / 公式のものへ替える / 外す)。
 * この門が約束するのは**増えたら鳴る**ことだけである。
 */
const CREDENTIALED_UNSCOPED = ['mcp-atlassian', 'mcp-server-linear', 'mcp-discord', 'youtube-mcp-server'];

/** 設定から `{name, launcher, pkg, env}` を取り出す。 */
function readServers(json) {
  const out = [];
  const servers = json?.mcpServers;
  if (servers === null || typeof servers !== 'object') return out;
  for (const [name, def] of Object.entries(servers)) {
    const args = Array.isArray(def?.args) ? def.args : [];
    // `npx -y <pkg>` / `uvx <pkg>` のどちらでも、旗でない最初の引数が名前。
    const pkg = args.find((a) => typeof a === 'string' && !a.startsWith('-')) ?? null;
    const env = def?.env !== null && typeof def?.env === 'object' ? Object.keys(def.env) : [];
    out.push({ name, launcher: typeof def?.command === 'string' ? def.command : null, pkg, env });
  }
  return out;
}

function check(servers, ledger = LEDGER, budget = UNSCOPED_BUDGET, credentialedUnscoped = CREDENTIALED_UNSCOPED) {
  const problems = [];
  const seen = new Set();
  for (const { name, launcher, pkg } of servers) {
    seen.add(name);
    if (launcher === null || !ALLOWED_LAUNCHERS.has(launcher)) {
      problems.push(`${name}: 起動子 "${launcher}" は認めていません (${[...ALLOWED_LAUNCHERS].join(' / ')} のみ)`);
    }
    if (!Object.hasOwn(ledger, name)) {
      problems.push(`${name}: 台帳にありません — セッション開始のたびに遠隔のコードが手元で走ります。何を許すのか理由を書いてください`);
      continue;
    }
    const e = ledger[name];
    if (pkg !== e.pkg) {
      problems.push(`${name}: パッケージが台帳と違います (設定 "${pkg}" / 台帳 "${e.pkg}")`);
    }
    if (String(e.why).trim().length < 4) {
      problems.push(`${name}: 台帳に理由がありません`);
    }
  }
  for (const name of Object.keys(ledger)) {
    if (!seen.has(name)) problems.push(`${name}: 台帳にありますが設定にありません — 消し忘れです`);
  }
  const unscoped = servers.filter((s) => typeof s.pkg === 'string' && !s.pkg.startsWith('@'));
  if (unscoped.length > budget) {
    problems.push(
      `名前空間の無いパッケージが ${unscoped.length} 件 (上限 ${budget}): ` +
        `${unscoped.map((s) => s.pkg).join(', ')} —— 素の名前は取り違え・乗っ取りが効く面です`,
    );
  }

  // **素の名前 かつ 資格情報を受け取る**もの。名指しで固定する。
  const risky = unscoped
    .filter((s) => (s.env ?? []).some((k) => SECRET_ENV.test(k)))
    .map((s) => s.pkg)
    .sort();
  const allowed = [...credentialedUnscoped].sort();
  const added = risky.filter((p) => !allowed.includes(p));
  const gone = allowed.filter((p) => !risky.includes(p));
  for (const p of added) {
    problems.push(
      `${p}: 名前空間が無く、しかも資格情報を受け取ります —— 版は固定されていないので、` +
        `悪い版が 1 つ出た時点で鍵がそのまま外へ出ます。固定する / 公式のものへ替える / ` +
        `外す のどれかを選び、残すなら台帳 CREDENTIALED_UNSCOPED へ理由つきで足してください`,
    );
  }
  for (const p of gone) {
    problems.push(`${p}: CREDENTIALED_UNSCOPED に在りますが、もう当てはまりません — 台帳を掃除してください`);
  }
  return problems;
}

function selfTest() {
  const S = (name, launcher, pkg) => ({ name, launcher, pkg });
  const L = { a: { registry: 'npm', pkg: '@x/a', why: 'これは理由です' } };
  const cases = [
    ['台帳どおりなら通る', [S('a', 'npx', '@x/a')], L, 9, 0],
    ['★ 台帳に無いサーバは鳴る', [S('a', 'npx', '@x/a'), S('b', 'npx', '@x/b')], L, 9, 1],
    ['★ 台帳の消し忘れは鳴る', [], L, 9, 1],
    ['★ パッケージのすり替えは鳴る', [S('a', 'npx', '@x/evil')], L, 9, 1],
    ['★ 知らない起動子は鳴る', [S('a', 'bash', '@x/a')], L, 9, 1],
    ['★ 起動子が無くても鳴る', [S('a', null, '@x/a')], L, 9, 1],
    ['★ 理由が空なら鳴る', [S('a', 'npx', '@x/a')], { a: { registry: 'npm', pkg: '@x/a', why: '' } }, 9, 1],
    ['★ 素の名前が上限を超えたら鳴る', [S('a', 'npx', 'plain-a')], { a: { registry: 'npm', pkg: 'plain-a', why: 'これは理由です' } }, 0, 1],
    ['素の名前が上限内なら通る', [S('a', 'npx', 'plain-a')], { a: { registry: 'npm', pkg: 'plain-a', why: 'これは理由です' } }, 1, 0],
  ];
  let bad = 0;
  console.log('self-test:');
  for (const [label, servers, ledger, budget, expected] of cases) {
    // **第 4 引数を明示する。** 省くと既定で実物の CREDENTIALED_UNSCOPED が
    // 入り、合成の標本には無い 4 件が「消し忘れ」として毎回鳴る (実測)。
    // 検査の差し込み口は、既定値が実物を指すぶんだけ漏れる。
    const n = check(servers, ledger, budget, []).length;
    const ok = n === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${n} 件 (期待 ${expected})`);
  }

  // 素の名前 かつ 資格情報 の集合。
  {
    const E = (name, pkg, env) => ({ name, launcher: 'npx', pkg, env });
    const L2 = { a: { registry: 'npm', pkg: 'plain-a', why: 'これは理由です' } };
    for (const [label, servers, allow, expected] of [
      ['台帳どおりなら通る', [E('a', 'plain-a', ['A_TOKEN'])], ['plain-a'], 0],
      ['★ 素の名前へ鍵を渡す新顔は鳴る', [E('a', 'plain-a', ['A_TOKEN'])], [], 1],
      ['★ 台帳の消し忘れは鳴る', [E('a', 'plain-a', ['NOTHING_HERE'])], ['plain-a'], 1],
      ['鍵を受け取らない素の名前は対象外', [E('a', 'plain-a', ['LOCAL_TIMEZONE'])], [], 0],
      ['env が無くても落ちない', [E('a', 'plain-a', [])], [], 0],
      ['★ KEY / SECRET / PASSWORD / CREDENTIAL も拾う', [E('a', 'plain-a', ['X_SECRET'])], [], 1],
    ]) {
      const n = check(servers, L2, 99, allow).length;
      const ok = n === expected;
      if (!ok) bad++;
      console.log(`  ${ok ? '✓' : '✗'} ${label}: ${n} 件 (期待 ${expected})`);
    }
    // 名前空間つきは、鍵を渡していてもこの集合に入らない (面が違う)。
    const scopedOk = check([{ name: 'a', launcher: 'npx', pkg: '@x/a', env: ['A_TOKEN'] }],
      { a: { registry: 'npm', pkg: '@x/a', why: 'これは理由です' } }, 99, []).length === 0;
    if (!scopedOk) bad++;
    console.log(`  ${scopedOk ? '✓' : '✗'} 名前空間つきは鍵を渡していても対象外`);
  }

  // 取り出しが実物に当たること。設定の書き方が変わって 0 件になれば、
  // 「問題 0 件」で静かに通ってしまう。
  const real = readServers(JSON.parse(fs.readFileSync(SETTINGS, 'utf8')));
  const enough = real.length >= 10;
  if (!enough) bad++;
  console.log(`  ${enough ? '✓' : '✗'} 実物から ${real.length} サーバを取り出せる (10 以上)`);
  const named = real.filter((s) => s.pkg !== null).length;
  const allNamed = named === real.length;
  if (!allNamed) bad++;
  console.log(`  ${allNamed ? '✓' : '✗'} すべてパッケージ名を取り出せている (${named} / ${real.length})`);

  // `npx -y` の `-y` を名前と読み違えないこと (旗を飛ばす実装の的)。
  const flagOk = readServers({ mcpServers: { x: { command: 'npx', args: ['-y', '@a/b'] } } })[0].pkg === '@a/b';
  if (!flagOk) bad++;
  console.log(`  ${flagOk ? '✓' : '✗'} npx の -y を名前と読み違えない`);

  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  if (!fs.existsSync(SETTINGS)) {
    console.error('❌ .claude/settings.json を読めません — 台帳が空振りします');
    return 1;
  }
  const servers = readServers(JSON.parse(fs.readFileSync(SETTINGS, 'utf8')));
  const problems = check(servers);
  const unscoped = servers.filter((s) => typeof s.pkg === 'string' && !s.pkg.startsWith('@')).length;
  const risky = servers.filter(
    (s) => typeof s.pkg === 'string' && !s.pkg.startsWith('@') && (s.env ?? []).some((k) => SECRET_ENV.test(k)),
  ).length;
  console.log(
    `MCP サーバ ${servers.length} 件を台帳と照合 ` +
      `(名前空間なし ${unscoped} / 上限 ${UNSCOPED_BUDGET}、` +
      `うち資格情報を受け取るもの ${risky} / 台帳 ${CREDENTIALED_UNSCOPED.length}・版は全件が起動時取得)`,
  );
  if (problems.length === 0) {
    console.log('✅ 起動時に走る遠隔コードはすべて台帳どおりです');
    return 0;
  }
  console.error(`❌ ${problems.length} 件:`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

module.exports = { readServers, check, LEDGER, UNSCOPED_BUDGET, CREDENTIALED_UNSCOPED, SECRET_ENV, ALLOWED_LAUNCHERS };

if (require.main === module) process.exit(main(process.argv.slice(2)));

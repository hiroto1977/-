#!/usr/bin/env node
/*
 * **多項式バックトラックの定期点検** (`npm run audit:regex-poly`)。
 *
 * `lint:regex` (`lint-regex-complexity.cjs`) は **指数だけ**を門にしている。
 * その判断そのものは正しいが、2026-09-20 (パス 337) まで**書かれていた理由が
 * 実測と食い違っていた**:
 *
 * > このリポジトリの入力は上限が掛かっており (`MAX_ANALYZE_TEXT_CHARS` 5000、
 * > `MAX_MOOD_NOTE_CHARS` 2000 等)、その長さでの O(n²) は 30ms 程度で
 * > 画面は止まらない。
 *
 * **5000 はこのリポジトリで最大の上限ではない。** 実測 (2026-09-20):
 *
 * ```
 *   MAX_TEXT_PREVIEW_CHARS      200,000   ← 最大。取り込んだファイルの本文
 *   MAX_ASSISTANT_REPLY_CHARS   100,000     モデルの応答
 *   MAX_TOKEN_INPUT_CHARS        65,536     資格情報の入口
 *   MAX_ANALYZE_TEXT_CHARS        5,000   ← 上の文が挙げていた数
 * ```
 *
 * その本当の上限で測ると、O(n²) の式は **30ms ではなく 7.7〜7.9 秒**かかる。
 * つまり「長さの議論」としては**premise が偽**だった。
 *
 * ## それでも指数だけを門にしてよい理由 (到達可能性の議論)
 *
 * 出荷 `src/` の式 **588 本**のうち n=100,000 で 250ms を超えるのは **4 本**で、
 * どれも**長い文字列が届かない所**に在る (下の `LEDGER`)。守っているのは
 * 「入力が短いから」ではなく「**その式にはそもそも長い入力が来ない**」である。
 * 理由が違えば、次に足す式を評価するときの判断も違う ——
 * 新しい式が長い本文 (プレビュー・モデル応答) に当たるなら、上限の議論は効かない。
 *
 * ## なぜ CI で走らせないか
 *
 * 判定が壁時計時間だから (`lint-regex-complexity.cjs` の docblock が
 * 「誤って鳴る門は、鳴らない門より悪い」と書いているのと同じ理由)。
 * `audit:floors` と同じ**定期点検の道具**として置く。台帳の形 (行が在ること・
 * 理由が空でないこと・引用している上限が実物の最大と一致すること) は
 * `src/shared/__tests__/regexPolynomialLedger.test.ts` が毎回の `npm test` で見る。
 */

const { collect } = require('./lint-regex-complexity.cjs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');

/** 測る長さ。このリポジトリで最大の文字上限 (`MAX_TEXT_PREVIEW_CHARS`)。 */
const N = 200_000;
/** これを超えたら台帳に載っていなければならない (ms)。 */
const LIMIT_MS = 250;

/**
 * n=100,000 で 250ms を超えた出荷 `src/` の式と、**何がその入力を短く保つか**。
 *
 * 「上限が掛かっているから安全」ではなく「**この式に長い文字列は来ない**」を書く。
 * 来るようになったら、それはこの台帳の行が偽になったということである。
 */
const LEDGER = [
  {
    body: '[(（]([^)）]+)[)）]',
    bound: 'src/renderer/data/villageData.ts の村名 —— リポジトリに同梱した静的データで、利用者の入力は 1 文字も通らない',
  },
  {
    body: '\\.+$',
    bound: 'src/shared/privateTarget.ts のホスト名 —— `new URL()` が解析したあとの host で、送り先の URL 自体が MAX_SCAN_URL_CHARS (2048) 等で先に切られている',
  },
  {
    body: '\\/+$',
    bound: 'src/shared/aiEndpoint.ts の基底 URL —— 利用者が設定欄へ打つ 1 本で MAX_AI_BASE_URL_CHARS (2048) が先に掛かる',
  },
  {
    body: '=+$',
    bound: 'base64 のパディング (oauth.ts / pkce.ts / base64.ts) —— base64 の出力の末尾 `=` は**規格上 2 文字まで**なので、病的な入力 (`=` が延々続く) は作れない',
  },
];

function attackSeeds(body, limit) {
  const seeds = new Set(['a', ' ', '0', '*', '-', '#', '.', '/', ':', '"', "'", '=', '&']);
  const literal = body.replace(/\\[a-zA-Z]/g, '').replace(/[[\]()+*?{}|^$]/g, '');
  for (const ch of literal) seeds.add(ch);
  return [...seeds].slice(0, limit);
}

/** 1 本を 1 つの長さで計り、最悪の所要時間 (ms) を返す。 */
function worstMs(re, body, n, limitMs) {
  let worst = 0;
  for (const seed of attackSeeds(body, 14)) {
    for (const tail of [' !', '']) {
      const s = seed.repeat(n) + tail;
      const t0 = process.hrtime.bigint();
      try {
        re.test(s);
      } catch {
        /* 実行時に落ちる式は対象外 */
      }
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      if (ms > worst) worst = ms;
      // 既に答えが出た後まで残りの種を試すと、遅い式ほど長く回る。
      if (worst > limitMs * 4) return worst;
    }
  }
  return worst;
}

/** 出荷 `src/` の式だけ (検査は出荷物ではないので数えない)。 */
function shippedLiterals() {
  const { items } = collect([path.join(REPO, 'src')]);
  return items
    .map((it) => ({ ...it, sites: it.sites.filter((s) => !s.includes('__tests__')) }))
    .filter((it) => it.sites.length > 0);
}

function run(n, limitMs) {
  const items = shippedLiterals();
  const hits = [];
  for (const it of items) {
    let re;
    try {
      re = new RegExp(it.body, it.flags.replace(/[gy]/g, ''));
    } catch {
      continue;
    }
    const worst = worstMs(re, it.body, n, limitMs);
    if (worst > limitMs) hits.push({ ...it, worst });
  }
  hits.sort((a, b) => b.worst - a.worst);
  return { scanned: items.length, hits };
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const n = Number(argv.find((a) => a.startsWith('--n='))?.slice(4) ?? N);
  const { scanned, hits } = run(n, LIMIT_MS);
  console.log(`出荷 src の正規表現 ${scanned} 本を n=${n.toLocaleString()} で計測 (閾 ${LIMIT_MS}ms)`);
  for (const h of hits) {
    const row = LEDGER.find((r) => r.body === h.body);
    console.log(`  ${h.worst.toFixed(0).padStart(6)}ms  /${h.body}/${h.flags}`);
    console.log(`          ${h.sites.join(' ')}`);
    console.log(`          ${row ? '台帳: ' + row.bound : '❌ 台帳に無い'}`);
  }
  const unlisted = hits.filter((h) => !LEDGER.some((r) => r.body === h.body));
  const gone = LEDGER.filter((r) => !hits.some((h) => h.body === r.body));
  if (unlisted.length > 0) {
    console.error(`\n❌ 台帳に無い式が ${unlisted.length} 本 —— 何がその入力を短く保つかを書いて台帳へ`);
  }
  if (gone.length > 0) {
    console.error(`\n❌ 台帳に在るのに挙がらなかった式が ${gone.length} 本 —— 消えたなら台帳からも消す`);
    for (const g of gone) console.error(`   /${g.body}/`);
  }
  if (unlisted.length === 0 && gone.length === 0) {
    console.log(`\n✅ ${hits.length} 本すべてが台帳どおり (双方向)`);
    return 0;
  }
  return 1;
}

function selfTest() {
  const fails = [];
  const ok = (label, cond) => {
    console.log(`  ${cond ? '✓' : '✗'} ${label}`);
    if (!cond) fails.push(label);
  };
  // 探りが実物に当たる: 既知の O(n²) は小さい n でも線形より明確に遅い。
  const poly = worstMs(/\/+$/, '\\/+$', 20000, 10_000);
  const linear = worstMs(/^abc$/, '^abc$', 20000, 10_000);
  ok('★ O(n²) の式は線形の式より遅い (探りが動いている)', poly > linear);
  ok('探りは白い式を遅いと言わない', linear < 50);
  ok('台帳は空でない', LEDGER.length > 0);
  ok('台帳の理由はどれも空でない', LEDGER.every((r) => r.bound.trim().length > 20));
  ok('台帳の式はすべて正規表現として読める', LEDGER.every((r) => {
    try { new RegExp(r.body); return true; } catch { return false; }
  }));
  ok('走査が実物に届いている (出荷 src の式が 100 本以上)', shippedLiterals().length >= 100);
  if (fails.length > 0) {
    console.error(`\n❌ self-test ${fails.length} 件失敗`);
    return 1;
  }
  console.log('\n✅ self-test 全件一致');
  return 0;
}

module.exports = { LEDGER, N, LIMIT_MS, run, shippedLiterals };

if (require.main === module) process.exit(main(process.argv.slice(2)));

#!/usr/bin/env node
/**
 * **e2e の待ちが制限にどれだけ近いかを測る** (定期点検の道具・CI では走らせない)。
 *
 * ## なぜ「再現」ではなく「余裕」なのか
 *
 * 2026-09-22 (パス 393) に `e2e` (FULL) が**連鎖の中で 1 度だけ** `TimeoutError` で
 * 落ちた。単独で再走すると 455 件 ❌ 0。忠実な条件 (`perf → e2e → e2e:lite` を
 * 続けて) で **2 反復とも再現しなかった** (パス 395 / 396)。
 *
 * **反復は費用が高く (1 回 ≒ 15 分)、外れたときに何も分からない。**
 * 時間切れは「いちばん余裕の無い待ち」から順に起きるので、落ちるのを待つ代わりに
 * **待ちごとの 実測 ÷ 制限 を測る**。すると外れても結論が出る:
 *
 * - 制限の大半を使う待ちが在る → **それが容疑者**。直しはその制限を上げるか、
 *   遅い原因を直すかに決まる。
 * - どの待ちも制限の数 % しか使っていない → **時間切れの原因は待ちの側ではない**
 *   (起動・ハング・別プロセスとの奪い合いなど、別の所を見る)。
 *
 * ## 使い方
 *
 * 捕るのは**連鎖の中で** (それが再現した条件なので):
 *
 * ```
 * npm run build:web && npm run build:web:lite   # 成果物を新しくする
 * npm run perf
 * SERVICE_HUB_E2E_WAIT_MARGIN=/tmp/margin-full.json npm run e2e
 * SERVICE_HUB_E2E_WAIT_MARGIN=/tmp/margin-lite.json npm run e2e:lite
 * npm run audit:e2e-wait-margin -- /tmp/margin-full.json /tmp/margin-lite.json
 * ```
 *
 * 記録子は `scripts/e2e/core.cjs` の `installWaitMarginRecorder` で、
 * **環境変数が無ければ何もしない** (常時有効にすると全 suite に費用が乗り、
 * 落ちたときの stack に包みが挟まる)。
 *
 * ## 母集団は明示の待ちだけではない
 *
 * `waitForSelector` / `waitForFunction` / `waitForURL` に加えて
 * **`goto` / `click` / `fill`** も測る —— Playwright はこの 3 つでも自動で待ち、
 * どれも既定 30 秒である (この runner は `setDefaultTimeout` を呼んでいない)。
 * とくに **11 MB の `file://` を読ませる `goto`** は、奪い合いの下でいちばん
 * 遅くなりうる操作で、これを母集団から外して「余裕は十分」と言うと
 * **いちばん重い容疑者を数えなかった**ことになる。
 * 行の `what` は `<メソッド>:<第 1 引数>` の形で、どちらの側かが読める。
 */
'use strict';

const fs = require('node:fs');

/** これ以上 制限を使っていたら「余裕が薄い」として名指しする。 */
const THIN_RATIO = 0.5;
/** 上位いくつを出すか。 */
const TOP = 15;

/**
 * 記録された待ちを「待った物」ごとに畳む。
 *
 * **最大を見る** —— 平均だと「たまに 12 秒」が薄まって消える。時間切れは最悪の
 * 1 回で起きるので、最悪を残す。
 */
function summarize(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const key = `${r.suite} :: ${r.what}`;
    const cur = byKey.get(key);
    if (cur === undefined || r.ms > cur.maxMs) {
      byKey.set(key, { key, suite: r.suite, what: r.what, maxMs: r.ms, limit: r.limit, n: (cur?.n ?? 0) + 1 });
    } else {
      cur.n += 1;
    }
  }
  return [...byKey.values()]
    .map((x) => ({ ...x, ratio: x.limit > 0 ? x.maxMs / x.limit : 0 }))
    .sort((a, b) => b.ratio - a.ratio);
}

function report(label, rows) {
  const sum = summarize(rows);
  const thin = sum.filter((x) => x.ratio >= THIN_RATIO);
  console.log(`\n=== ${label} — 待ち ${rows.length} 回 / 種類 ${sum.length} ===`);
  if (sum.length === 0) {
    console.log('  (記録が空 —— SERVICE_HUB_E2E_WAIT_MARGIN を付けて走らせましたか)');
    return { sum, thin };
  }
  const worst = sum[0];
  console.log(`  最も余裕が無い: ${worst.maxMs} ms / 制限 ${worst.limit} ms = ${(worst.ratio * 100).toFixed(1)}%`);
  console.log(`    ${worst.suite} :: ${worst.what}`);
  console.log(`  上位 ${Math.min(TOP, sum.length)} 件:`);
  for (const x of sum.slice(0, TOP)) {
    const pct = (x.ratio * 100).toFixed(1).padStart(5);
    console.log(`    ${pct}%  ${String(x.maxMs).padStart(6)} / ${String(x.limit).padStart(6)} ms  ${x.suite} :: ${x.what}`);
  }
  if (thin.length === 0) {
    console.log(`\n  ✅ 制限の ${THIN_RATIO * 100}% 以上を使う待ちは 1 件も無い`);
    console.log('     → **時間切れの原因は待ちの側ではない**。起動・ハング・');
    console.log('        別プロセスとの奪い合いなど、別の所を見ること。');
  } else {
    console.log(`\n  ⚠️ 制限の ${THIN_RATIO * 100}% 以上を使う待ちが ${thin.length} 件 —— これが容疑者:`);
    for (const x of thin) console.log(`     ${(x.ratio * 100).toFixed(1)}%  ${x.suite} :: ${x.what}`);
    console.log('     → 制限を上げるか、遅い原因を直すか。**どちらかを選ぶ根拠になる。**');
  }
  return { sum, thin };
}

function selfTest() {
  let bad = 0;
  const check = (name, got, want) => {
    const okay = JSON.stringify(got) === JSON.stringify(want);
    if (!okay) { bad += 1; console.log(`  ✗ ${name}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); }
    else console.log(`  ✓ ${name}`);
  };
  // **最大を残す** (平均ではない)。
  const s1 = summarize([
    { suite: 'a', what: 'x', ms: 100, limit: 15000 },
    { suite: 'a', what: 'x', ms: 12000, limit: 15000 },
  ]);
  check('同じ待ちは最大を残す', [s1.length, s1[0].maxMs], [1, 12000]);
  // 割合の降順。
  const s2 = summarize([
    { suite: 'a', what: 'slow', ms: 9000, limit: 15000 },
    { suite: 'b', what: 'fast', ms: 100, limit: 15000 },
  ]);
  check('割合の降順に並ぶ', s2.map((x) => x.what), ['slow', 'fast']);
  // 制限が違えば ms が小さくても割合は大きい。
  const s3 = summarize([
    { suite: 'a', what: 'tight', ms: 900, limit: 1000 },
    { suite: 'b', what: 'loose', ms: 9000, limit: 30000 },
  ]);
  check('制限が違えば ms でなく割合で並ぶ', s3.map((x) => x.what), ['tight', 'loose']);
  // 空の記録で落ちない。
  check('空の記録は空の要約', summarize([]), []);
  console.log(bad === 0 ? '✅ self-test 全件一致' : `❌ self-test ${bad} 件不一致`);
  return bad === 0;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const paths = args.filter((a) => !a.startsWith('--'));
  if (paths.length === 0) {
    console.error('使い方: npm run audit:e2e-wait-margin -- <margin.json> [<margin.json> …]');
    console.error('記録は SERVICE_HUB_E2E_WAIT_MARGIN=<path> を付けて e2e を走らせると出る。');
    process.exit(2);
  }
  let anyThin = false;
  for (const p of paths) {
    let rows;
    try {
      rows = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      console.error(`❌ 記録を読めません: ${p} (${e.message})`);
      process.exit(2);
    }
    const { thin } = report(p, rows);
    if (thin.length > 0) anyThin = true;
  }
  // **落とさない** —— これは点検の道具で、薄い余裕は欠陥ではなく手がかりである。
  console.log(anyThin ? '\n(薄い待ちが在る —— 上を読んで判断すること)' : '\n(薄い待ちは無い)');
}

if (require.main === module) main();
module.exports = { summarize, THIN_RATIO };

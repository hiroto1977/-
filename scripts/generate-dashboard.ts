// Generate ~/.local/business-hub/data/dashboard.html from a real snapshot.
//
// **走らせ方 (2026-09-15 に実測して書き直した)**: `npx tsx scripts/generate-dashboard.ts`。
// `tsx` は**この repo の依存ではない**ので、npx がその場で registry から取ってくる
// (オフラインでは走らない)。素の `node` では走らない —— 下の import が拡張子を
// 持たず、`moduleResolution: "bundler"` の解決は Node の ESM 解決と別物なので
// `ERR_MODULE_NOT_FOUND: .../src/main/clients/stocks` で止まる (実測)。
//
// 同じ書き出しは製品側に在る: `stocks/export-dashboard` の action (画面のボタン) が
// この `exportDashboardImpl` を呼び、`clients/__tests__/stocks.test.ts` が
// 実装を 8 件・action の口を 4 件で測っている (実測 2026-09-15)。つまりこのファイルは
// **開発時に手で 1 回叩くための口**であって、唯一の経路ではない。
//
// パス 278 まで、このファイルは `tsconfig.node.json` の include の外に在り
// **型検査を 1 度も通っていなかった** —— `exportDashboardImpl` の引数が変わっても
// 誰も鳴らない状態だった。今は include に載っている
// (`src/shared/__tests__/typecheckCoverage.test.ts` が母集団ごと留める)。
import { exportDashboardImpl } from '../src/main/clients/stocks';

async function main() {
  const r = await exportDashboardImpl(
    { token: '', payload: {} },
    { now: () => new Date() },
  );
  console.log('wrote:', r.path, '(' + (r.bytes / 1024).toFixed(1) + ' KB)');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

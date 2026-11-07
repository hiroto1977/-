/**
 * 「範囲内なら算定できる」を検査の中で宣言するための 1 行。
 *
 * 2026-09-13 (パス 198) に、年数の天井を超えた入力を `null` (算定不能) として
 * 返すようにしたので、`futureValue` / `requiredMonthly` / `cumulativeCostYen`
 * などが `number | null` になった。**範囲内の入力を与えている既存の検査では
 * `null` は契約違反**なので、`?? 0` や `!` で黙って通すのではなく、その場で
 * 落として理由を出す。
 *
 * `?? 0` は使わない —— 0 に倒すと「算定できたが 0 だった」に化け、
 * この 3 パスで直し続けている形 (パス 52 / 85 / 91) をテストの側で作ってしまう。
 */
import { expect } from 'vitest';

export function measured(v: number | null, what = '算定不能 (null) が返った'): number {
  expect(v, `${what} —— 範囲内の入力なので値が出るはず`).not.toBeNull();
  return v as number;
}

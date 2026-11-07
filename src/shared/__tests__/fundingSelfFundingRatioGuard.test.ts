/**
 * 資金調達の**自己負担比率** (`fundingCostMetrics().selfFundingRatio = 返済必要額 ÷ 確定総額`) の
 * 分母の守りを値で留める (パス 502)。
 *
 * 既存の検査 (`main/clients/__tests__/funding.test.ts`) は確定総額が **0 のとき** (補助金だけ・空の一覧) に
 * 比率が 0 になることを見ている。ところが 0 割りは `NaN` / `±Infinity` になり、`clampRate` (= `nonNeg`) が
 * 非有限を 0 へ落とすので、**守りを外しても 0 のときの答えは変わらない**。守りが実際に効くのは
 * 確定総額が**負**の手組みの集計 (`summarize` は金額を `nonNeg` で丸めるので通常は届かないが、
 * `fundingCostMetrics` は任意の `FundingSummary` を受ける純関数) —— 負 ÷ 負 が**正の比率**になって
 * 「自己負担 40%」と出る形だけである。
 */
import { describe, expect, it } from 'vitest';
import { fundingCostMetrics, type FundingSummary } from '../funding';

const summary = (over: Partial<FundingSummary>): FundingSummary => ({
  nonRepayableSecured: 0,
  repayableSecured: 0,
  totalSecured: 0,
  totalPipeline: 0,
  taxableSecured: 0,
  deferredSecured: 0,
  afterTaxSecured: 0,
  consumptionTaxExemptSecured: 0,
  consumptionTaxableSecured: 0,
  consumptionTaxEstimate: 0,
  count: 0,
  ...over,
});

describe('fundingCostMetrics — 自己負担比率の分母の守り', () => {
  it('確定総額が正なら 返済必要額 ÷ 確定総額 (対照: 守りが比率を潰していない)', () => {
    expect(fundingCostMetrics([], summary({ repayableSecured: 4_000_000, totalSecured: 10_000_000 })).selfFundingRatio).toBe(0.4);
  });

  it('返済必要額が確定総額を超える (手組みの) 集計は 1 に丸める', () => {
    expect(fundingCostMetrics([], summary({ repayableSecured: 12_000_000, totalSecured: 10_000_000 })).selfFundingRatio).toBe(1);
  });

  it('確定総額が負の (手組みの) 集計は 0 —— 負 ÷ 負を正の比率として出さない', () => {
    const m = fundingCostMetrics([], summary({ repayableSecured: -4_000_000, totalSecured: -10_000_000 }));
    expect(m.selfFundingRatio).toBe(0);
  });

  it('確定総額が 0 の集計は 0 (0 割りを比率にしない)', () => {
    expect(fundingCostMetrics([], summary({ repayableSecured: 0, totalSecured: 0 })).selfFundingRatio).toBe(0);
    expect(fundingCostMetrics([], summary({ repayableSecured: 5, totalSecured: 0 })).selfFundingRatio).toBe(0);
  });
});

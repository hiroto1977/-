import { describe, expect, it } from 'vitest';
import {
  calcCompoundingFutureValue,
  calcSharpeRatio,
  calcTotalReturn,
  calcRealCost,
  calcStdDev,
  calcDcaSimulation,
} from '../mutualFundsMetrics';

describe('calcCompoundingFutureValue', () => {
  it('returns contributions only when the return is 0%', () => {
    const r = calcCompoundingFutureValue(100_000, 0, 10);
    expect(r.totalContributed).toBe(12_000_000);
    expect(r.futureValue).toBe(12_000_000);
    expect(r.totalGain).toBe(0);
    expect(r.gainPct).toBe(0);
  });

  it('grows above contributions with a positive return', () => {
    const r = calcCompoundingFutureValue(100_000, 5, 10);
    expect(r.totalContributed).toBe(12_000_000);
    expect(r.futureValue).toBeGreaterThan(12_000_000);
    expect(r.totalGain).toBeGreaterThan(0);
    expect(r.gainPct).toBeGreaterThan(0);
  });

  it('computes gainPct = totalGain / totalContributed × 100 exactly', () => {
    // 月5万 × 年5% × 20年 → 元本1,200万、将来2,029.0224万、含み益829.0224万 → 69.09%。
    // totalGain/totalContributed や ×100 を別演算子にする mutant をリテラルで殺す。
    const r = calcCompoundingFutureValue(50_000, 5, 20);
    expect(r.totalContributed).toBe(12_000_000);
    expect(r.futureValue).toBe(20_290_224);
    expect(r.gainPct).toBe(69.09);
  });

  it('matches the annuity future-value formula', () => {
    const pmt = 50_000, annual = 6, years = 5;
    const n = years * 12;
    const rMonthly = Math.pow(1 + annual / 100, 1 / 12) - 1;
    const expected = Math.round(pmt * ((Math.pow(1 + rMonthly, n) - 1) / rMonthly));
    expect(calcCompoundingFutureValue(pmt, annual, years).futureValue).toBe(expected);
  });

  it('returns zeros for non-positive years or contribution', () => {
    // n=0 / pmt=0 でも gainPct は totalContributed>0 ガードで 0 (NaN にならない)。
    for (const r of [
      calcCompoundingFutureValue(100_000, 5, 0),
      calcCompoundingFutureValue(0, 5, 10),
      calcCompoundingFutureValue(-100, 5, 10),
    ]) {
      expect(r.futureValue).toBe(0);
      expect(r.totalContributed).toBe(0);
      expect(r.totalGain).toBe(0);
      expect(r.gainPct).toBe(0);
    }
  });

  it('longer horizons accumulate more than shorter ones', () => {
    const short = calcCompoundingFutureValue(100_000, 5, 5);
    const long = calcCompoundingFutureValue(100_000, 5, 20);
    expect(long.futureValue).toBeGreaterThan(short.futureValue);
  });
});

describe('calcSharpeRatio', () => {
  it('computes (return − risk free) / volatility', () => {
    // (14.2 − 0.5) / 18 = 0.7611… → 0.76
    expect(calcSharpeRatio(14.2, 18)).toBe(0.76);
  });

  it('honors a custom risk-free rate', () => {
    expect(calcSharpeRatio(8, 10, 1)).toBe(0.7); // (8−1)/10
  });

  it('returns 0 when volatility is zero or negative (undefined ratio)', () => {
    expect(calcSharpeRatio(10, 0)).toBe(0);
    expect(calcSharpeRatio(10, -5)).toBe(0);
  });

  it('can be negative when the return is below the risk-free rate', () => {
    expect(calcSharpeRatio(0, 10, 0.5)).toBe(-0.05);
  });
});

describe('calcTotalReturn', () => {
  it('computes total return with reinvested dividends', () => {
    // 元本100万、期末120万、分配金5万 → (120+5)/100−1 = 25% 、含み益+分配 25万。
    const r = calcTotalReturn(1_000_000, 1_200_000, 50_000);
    expect(r.totalReturnPct).toBe(25);
    expect(r.totalGain).toBe(250_000);
    expect(r.cagrPct).toBeNull(); // years 既定0 → CAGR 算出不能
  });

  it('annualizes via CAGR over multiple years', () => {
    // (1,200,000 + 0)/1,000,000 = 1.2 ; CAGR(5y) = 1.2^(1/5)−1 = 3.7137...% → 3.71
    const r = calcTotalReturn(1_000_000, 1_200_000, 0, 5);
    expect(r.totalReturnPct).toBe(20);
    expect(r.cagrPct).toBe(3.71);
  });

  it('returns nulls when principal is zero, negative, or non-finite', () => {
    for (const p of [0, -100, NaN, Infinity]) {
      const r = calcTotalReturn(p, 1_000_000, 50_000, 5);
      expect(r.totalReturnPct).toBeNull();
      expect(r.cagrPct).toBeNull();
      expect(r.totalGain).toBe(0);
    }
  });

  it('returns nulls when ending value is non-finite', () => {
    const r = calcTotalReturn(1_000_000, NaN, 0, 5);
    expect(r.totalReturnPct).toBeNull();
    expect(r.totalGain).toBe(0);
  });

  it('clamps negative dividends to zero', () => {
    const r = calcTotalReturn(1_000_000, 1_000_000, -999, 1);
    expect(r.totalReturnPct).toBe(0);
    expect(r.totalGain).toBe(0);
  });

  it('treats non-finite dividends as zero', () => {
    const r = calcTotalReturn(1_000_000, 1_100_000, NaN, 0);
    expect(r.totalReturnPct).toBe(10);
    expect(r.totalGain).toBe(100_000);
  });

  it('can be a total loss with negative return', () => {
    // 期末50万、分配0 → (50)/100−1 = −50% ; CAGR(2y) = 0.5^0.5−1 = −29.29% → −29.29
    const r = calcTotalReturn(1_000_000, 500_000, 0, 2);
    expect(r.totalReturnPct).toBe(-50);
    expect(r.cagrPct).toBe(-29.29);
    expect(r.totalGain).toBe(-500_000);
  });

  it('leaves CAGR null when final value is non-positive (no real root)', () => {
    // endingValue 0, dividends 0 → finalValue 0 → CAGR は実数解なし。
    const r = calcTotalReturn(1_000_000, 0, 0, 5);
    expect(r.totalReturnPct).toBe(-100);
    expect(r.cagrPct).toBeNull();
    expect(r.totalGain).toBe(-1_000_000);
  });

  it('leaves CAGR null for non-positive or non-finite years but keeps total return', () => {
    for (const y of [0, -3, NaN, Infinity]) {
      const r = calcTotalReturn(1_000_000, 1_200_000, 0, y);
      expect(r.totalReturnPct).toBe(20);
      expect(r.cagrPct).toBeNull();
    }
  });
});

describe('calcRealCost', () => {
  it('sums expense ratio and hidden cost into the annual rate', () => {
    // 信託報酬1.0% + 隠れ0.2% = 1.2% 、元本1,000万 → 年12万。
    const r = calcRealCost(10_000_000, 1.0, 0.2);
    expect(r.annualCostPct).toBe(1.2);
    expect(r.annualCostYen).toBe(120_000);
  });

  it('compounds the cost drag over years (gross vs net future value)', () => {
    // 元本100万、gross5%、cost1%、20年。
    // fvGross = 1e6 * 1.05^20 = 2,653,297.71 ; fvNet = 1e6 * 1.04^20 = 2,191,123.14
    // 差 = 462,174.57 → 462,175 (四捨五入)
    const r = calcRealCost(1_000_000, 1.0, 0, 5, 20);
    const fvGross = 1_000_000 * Math.pow(1.05, 20);
    const fvNet = 1_000_000 * Math.pow(1.04, 20);
    expect(r.cumulativeCostYen).toBe(Math.round(fvGross - fvNet));
  });

  it('returns zero amounts for zero invested amount', () => {
    const r = calcRealCost(0, 1.0, 0.2, 5, 10);
    expect(r.annualCostPct).toBe(1.2);
    expect(r.annualCostYen).toBe(0);
    expect(r.cumulativeCostYen).toBe(0);
  });

  it('clamps negative rates to zero', () => {
    const r = calcRealCost(1_000_000, -1, -1, 5, 10);
    expect(r.annualCostPct).toBe(0);
    expect(r.annualCostYen).toBe(0);
    expect(r.cumulativeCostYen).toBe(0); // cost 0 → gross == net
  });

  it('has zero cumulative drag when years is zero', () => {
    // years 0 → fvGross == fvNet == amount → 累計効果0、年額は残る。
    const r = calcRealCost(1_000_000, 1.0, 0, 5, 0);
    expect(r.annualCostYen).toBe(10_000);
    expect(r.cumulativeCostYen).toBe(0);
  });

  it('treats non-finite inputs defensively', () => {
    const r = calcRealCost(NaN, NaN, NaN, NaN, NaN);
    expect(r.annualCostPct).toBe(0);
    expect(r.annualCostYen).toBe(0);
    expect(r.cumulativeCostYen).toBe(0);
  });
});

describe('calcStdDev', () => {
  it('computes the population standard deviation', () => {
    // [2,4,4,4,5,5,7,9] mean 5, variance 4 → σ = 2.
    expect(calcStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });

  it('computes the sample standard deviation with n−1', () => {
    // [2,4,6,8] mean 5 ; sumSq = 9+1+1+9 = 20 ; sample var = 20/3 = 6.667 ; s = 2.582 → 2.58
    expect(calcStdDev([2, 4, 6, 8], true)).toBe(2.58);
    // population: 20/4 = 5 ; σ = 2.236 → 2.24
    expect(calcStdDev([2, 4, 6, 8], false)).toBe(2.24);
  });

  it('returns 0 for a constant series (no dispersion)', () => {
    expect(calcStdDev([3, 3, 3])).toBe(0);
  });

  it('returns null for an empty array', () => {
    expect(calcStdDev([])).toBeNull();
  });

  it('population std dev works for a single element (zero dispersion)', () => {
    expect(calcStdDev([5])).toBe(0);
  });

  it('returns null for sample std dev with fewer than two elements', () => {
    expect(calcStdDev([5], true)).toBeNull();
    expect(calcStdDev([], true)).toBeNull();
  });

  it('returns null when the series contains a non-finite value', () => {
    expect(calcStdDev([1, 2, NaN])).toBeNull();
    expect(calcStdDev([1, Infinity, 3])).toBeNull();
  });

  it('handles negative returns in the dispersion', () => {
    // [-2, 0, 2] mean 0 ; sumSq = 4+0+4 = 8 ; pop var = 8/3 = 2.667 ; σ = 1.633 → 1.63
    expect(calcStdDev([-2, 0, 2])).toBe(1.63);
  });
});

describe('calcDcaSimulation', () => {
  it('buys more units when the price is lower (averaging down)', () => {
    // 月10,000円を価格 [1000, 500, 2000] で購入。
    // units = 10 + 20 + 5 = 35 ; invested = 30,000 ; avg = 30000/35 = 857.142... → 857.14
    // final = 2000 * 35 = 70,000 ; gain = 40,000
    const r = calcDcaSimulation(10_000, [1000, 500, 2000]);
    expect(r.totalUnits).toBe(35);
    expect(r.totalInvested).toBe(30_000);
    expect(r.averageCost).toBe(857.14);
    expect(r.finalValuation).toBe(70_000);
    expect(r.gain).toBe(40_000);
  });

  it('average cost equals price for a flat series', () => {
    const r = calcDcaSimulation(10_000, [1000, 1000, 1000]);
    expect(r.totalUnits).toBe(30);
    expect(r.averageCost).toBe(1000);
    expect(r.finalValuation).toBe(30_000);
    expect(r.gain).toBe(0);
  });

  it('skips non-positive and non-finite prices but still invests on valid periods', () => {
    // 価格 [1000, 0, -5, NaN, 2000] → 有効期は 1000 と 2000 のみ。
    // units = 10 + 5 = 15 ; invested = 20,000 ; final = 2000 * 15 = 30,000 ; gain = 10,000
    const r = calcDcaSimulation(10_000, [1000, 0, -5, NaN, 2000]);
    expect(r.totalUnits).toBe(15);
    expect(r.totalInvested).toBe(20_000);
    expect(r.finalValuation).toBe(30_000);
    expect(r.gain).toBe(10_000);
  });

  it('returns an empty result for an empty price series', () => {
    const r = calcDcaSimulation(10_000, []);
    expect(r).toEqual({ totalUnits: 0, totalInvested: 0, averageCost: null, finalValuation: 0, gain: 0 });
  });

  it('returns an empty result when no price is valid', () => {
    const r = calcDcaSimulation(10_000, [0, -1, NaN, Infinity]);
    expect(r.totalUnits).toBe(0);
    expect(r.averageCost).toBeNull();
    expect(r.finalValuation).toBe(0);
  });

  it('returns an empty result for zero, negative, or non-finite monthly amount', () => {
    for (const a of [0, -100, NaN, Infinity]) {
      const r = calcDcaSimulation(a, [1000, 2000]);
      expect(r.totalInvested).toBe(0);
      expect(r.averageCost).toBeNull();
    }
  });

  it('uses the last valid price (not a later skipped one) for valuation', () => {
    // 最終価格が無効 → 直近の有効価格 1500 で評価。
    // units = 10000/1000 + 10000/1500 = 10 + 6.6667 = 16.6667 ; final = 1500 * 16.6667 = 25,000
    const r = calcDcaSimulation(10_000, [1000, 1500, 0]);
    expect(r.totalInvested).toBe(20_000);
    expect(r.finalValuation).toBe(25_000);
  });
});

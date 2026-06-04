import { describe, expect, it } from 'vitest';
import { calcCompoundingFutureValue, calcSharpeRatio } from '../mutualFundsMetrics';

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

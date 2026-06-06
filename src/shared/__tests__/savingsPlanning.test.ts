import { describe, expect, it } from 'vitest';
import {
  requiredMonthlyContribution,
  yearsToDouble,
  emergencyFund,
  futureValueWithFrequency,
  inflationAdjustedValue,
  realRateOfReturn,
  emergencyFundCoverage,
  goalProjection,
} from '../savingsPlanning';
import { calcCompoundingFutureValue } from '../mutualFundsMetrics';

describe('requiredMonthlyContribution', () => {
  it('returns 0 for a non-positive target or zero years', () => {
    expect(requiredMonthlyContribution(0, 5, 10)).toBe(0);
    expect(requiredMonthlyContribution(1_000_000, 5, 0)).toBe(0);
    // 負の目標額は計算経路だと負値を返すため、早期 return (target<=0) で 0 にする。
    expect(requiredMonthlyContribution(-1_000_000, 5, 10)).toBe(0);
  });

  it('splits the target evenly when the rate is zero', () => {
    // 1,200,000 over 10 years (120 months) at 0% → 10,000 / month
    expect(requiredMonthlyContribution(1_200_000, 0, 10)).toBe(10_000);
  });

  it('is the inverse of the compounding future-value calc', () => {
    // Find PMT to reach 10,000,000 in 10y at 3%, then feed it back in.
    const pmt = requiredMonthlyContribution(10_000_000, 3, 10);
    const fv = calcCompoundingFutureValue(pmt, 3, 10).futureValue;
    // Round-trip should land within a small rounding tolerance of the target.
    expect(Math.abs(fv - 10_000_000)).toBeLessThan(1000);
  });

  it('requires a smaller monthly amount at a higher return', () => {
    const low = requiredMonthlyContribution(10_000_000, 1, 10);
    const high = requiredMonthlyContribution(10_000_000, 8, 10);
    expect(high).toBeLessThan(low);
  });
});

describe('yearsToDouble (rule of 72)', () => {
  it('returns 72 / rate', () => {
    expect(yearsToDouble(6)).toBe(12);
    expect(yearsToDouble(8)).toBe(9);
  });

  it('rounds to one decimal place', () => {
    expect(yearsToDouble(7)).toBe(10.3); // 72/7 = 10.285…
  });

  it('returns null for a non-positive rate', () => {
    expect(yearsToDouble(0)).toBeNull();
    expect(yearsToDouble(-3)).toBeNull();
  });
});

describe('emergencyFund', () => {
  it('multiplies monthly expense by the number of months (default 6)', () => {
    expect(emergencyFund(300_000)).toBe(1_800_000);
    expect(emergencyFund(300_000, 12)).toBe(3_600_000);
  });

  it('treats negative inputs as zero', () => {
    expect(emergencyFund(-1, 6)).toBe(0);
    expect(emergencyFund(300_000, -1)).toBe(0);
  });
});

describe('futureValueWithFrequency', () => {
  it('defaults to monthly compounding and matches the annuity FV', () => {
    // 30,000/月 を 10年 3% 月複利。calcCompoundingFutureValue と一致するはず。
    const fv = futureValueWithFrequency(30_000, 3, 10);
    const ref = calcCompoundingFutureValue(30_000, 3, 10).futureValue;
    expect(fv).toBe(ref);
  });

  it('monthly compounding beats annual for the same nominal rate', () => {
    const monthly = futureValueWithFrequency(30_000, 5, 20, 'monthly');
    const annual = futureValueWithFrequency(30_000, 5, 20, 'annual');
    expect(monthly).toBeGreaterThan(annual);
  });

  it('computes annual compounding via a year-by-year accrual', () => {
    // 当年積立は無利息で年末に加算、既存残高にのみ利息付与。
    // 1年目: 0 * 1.05 + 120,000 = 120,000
    // 2年目: 120,000 * 1.05 + 120,000 = 246,000
    expect(futureValueWithFrequency(10_000, 5, 1, 'annual')).toBe(120_000);
    expect(futureValueWithFrequency(10_000, 5, 2, 'annual')).toBe(246_000);
  });

  it('annual compounding at 0% returns the sum of contributions', () => {
    // 12,000/年 × 3年 = 36,000、利息なし。
    expect(futureValueWithFrequency(1_000, 0, 3, 'annual')).toBe(36_000);
  });

  it('monthly compounding at 0% returns the principal sum', () => {
    // 10,000 × 120ヶ月 = 1,200,000、利息なし。
    expect(futureValueWithFrequency(10_000, 0, 10, 'monthly')).toBe(1_200_000);
  });

  it('returns 0 for non-positive contribution or years', () => {
    expect(futureValueWithFrequency(0, 5, 10)).toBe(0);
    expect(futureValueWithFrequency(-5_000, 5, 10)).toBe(0);
    expect(futureValueWithFrequency(30_000, 5, 0)).toBe(0);
    expect(futureValueWithFrequency(30_000, 5, -2)).toBe(0);
    expect(futureValueWithFrequency(30_000, 5, 0, 'annual')).toBe(0);
  });

  it('returns 0 for non-finite inputs', () => {
    expect(futureValueWithFrequency(Number.NaN, 5, 10)).toBe(0);
    expect(futureValueWithFrequency(30_000, Number.POSITIVE_INFINITY, 10)).toBe(0);
    expect(futureValueWithFrequency(30_000, 5, Number.NaN)).toBe(0);
  });
});

describe('inflationAdjustedValue', () => {
  it('discounts a nominal amount to real purchasing power', () => {
    // 1,000,000 を 2% インフレで 10年割引 → 1,000,000 / 1.02^10 ≈ 820,348
    expect(inflationAdjustedValue(1_000_000, 2, 10)).toBe(820_348);
  });

  it('returns the nominal amount (rounded) when years is zero or negative', () => {
    expect(inflationAdjustedValue(1_000_000, 2, 0)).toBe(1_000_000);
    expect(inflationAdjustedValue(1_000_000.6, 2, -1)).toBe(1_000_001);
  });

  it('returns the nominal amount unchanged at 0% inflation', () => {
    expect(inflationAdjustedValue(500_000, 0, 10)).toBe(500_000);
  });

  it('returns a larger real value under deflation (negative inflation)', () => {
    // −1% は割引係数 < 1 → 実質値が名目より大きい。
    expect(inflationAdjustedValue(1_000_000, -1, 5)).toBeGreaterThan(1_000_000);
  });

  it('returns 0 when inflation is -100% or below (undefined discount)', () => {
    expect(inflationAdjustedValue(1_000_000, -100, 5)).toBe(0);
    expect(inflationAdjustedValue(1_000_000, -150, 5)).toBe(0);
  });

  it('returns 0 for non-finite inputs', () => {
    expect(inflationAdjustedValue(Number.NaN, 2, 10)).toBe(0);
    expect(inflationAdjustedValue(1_000_000, Number.NaN, 10)).toBe(0);
    expect(inflationAdjustedValue(1_000_000, 2, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('realRateOfReturn (Fisher equation)', () => {
  it('computes (1+nominal)/(1+inflation) - 1 as a percent', () => {
    // (1.05 / 1.02) - 1 = 0.0294117… → 2.94%
    expect(realRateOfReturn(5, 2)).toBe(2.94);
  });

  it('equals the nominal rate when inflation is 0', () => {
    expect(realRateOfReturn(5, 0)).toBe(5);
  });

  it('can be negative when inflation exceeds the nominal rate', () => {
    const real = realRateOfReturn(2, 5);
    expect(real).not.toBeNull();
    expect(real as number).toBeLessThan(0);
  });

  it('returns null when inflation is -100% or below', () => {
    expect(realRateOfReturn(5, -100)).toBeNull();
    expect(realRateOfReturn(5, -120)).toBeNull();
  });

  it('returns null for non-finite inputs', () => {
    expect(realRateOfReturn(Number.NaN, 2)).toBeNull();
    expect(realRateOfReturn(5, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('emergencyFundCoverage', () => {
  it('reports target, coverage, shortfall and months covered', () => {
    // 月支出 300,000 × 6 = 1,800,000 目標。現預金 900,000。
    const c = emergencyFundCoverage(900_000, 300_000, 6);
    expect(c.target).toBe(1_800_000);
    expect(c.coveragePct).toBe(50);
    expect(c.shortfall).toBe(900_000);
    expect(c.monthsCovered).toBe(3);
  });

  it('caps nothing — coverage can exceed 100% with no shortfall', () => {
    const c = emergencyFundCoverage(3_600_000, 300_000, 6);
    expect(c.coveragePct).toBe(200);
    expect(c.shortfall).toBe(0);
    expect(c.monthsCovered).toBe(12);
  });

  it('defaults to 6 months', () => {
    expect(emergencyFundCoverage(0, 100_000).target).toBe(600_000);
  });

  it('handles a zero target: 100% if cash exists, else 0%', () => {
    expect(emergencyFundCoverage(50_000, 0, 6).coveragePct).toBe(100);
    expect(emergencyFundCoverage(0, 0, 6).coveragePct).toBe(0);
  });

  it('returns null monthsCovered when monthly expense is zero', () => {
    expect(emergencyFundCoverage(500_000, 0, 6).monthsCovered).toBeNull();
  });

  it('clamps negative and non-finite inputs to zero', () => {
    const c = emergencyFundCoverage(-100, -200, -3);
    expect(c.target).toBe(0);
    expect(c.shortfall).toBe(0);
    const nf = emergencyFundCoverage(Number.NaN, Number.POSITIVE_INFINITY, Number.NaN);
    expect(nf.target).toBe(0);
    expect(nf.coveragePct).toBe(0);
    expect(nf.monthsCovered).toBeNull();
  });
});

describe('goalProjection', () => {
  it('flags an on-track plan with no shortfall or extra contribution', () => {
    // 必要積立額は切り捨て丸めのため、+1 円だけ上乗せすれば確実に届く。
    const required = requiredMonthlyContribution(10_000_000, 3, 10);
    const p = goalProjection(required + 1, 10_000_000, 3, 10);
    expect(p.onTrack).toBe(true);
    expect(p.shortfall).toBe(0);
    expect(p.additionalMonthly).toBe(0);
    expect(p.requiredMonthly).toBe(required);
  });

  it('reports a shortfall and required extra when under-saving', () => {
    const p = goalProjection(10_000, 10_000_000, 3, 10);
    expect(p.onTrack).toBe(false);
    expect(p.shortfall).toBeGreaterThan(0);
    expect(p.additionalMonthly).toBeGreaterThan(0);
  });

  it('treats an exact match as on track', () => {
    // 0% で 10,000 × 120ヶ月 = 1,200,000 ちょうど。
    const p = goalProjection(10_000, 1_200_000, 0, 10);
    expect(p.projected).toBe(1_200_000);
    expect(p.onTrack).toBe(true);
    expect(p.shortfall).toBe(0);
  });

  it('clamps a negative current contribution to zero', () => {
    const p = goalProjection(-5_000, 1_200_000, 0, 10);
    expect(p.projected).toBe(0);
    expect(p.onTrack).toBe(false);
    expect(p.additionalMonthly).toBe(p.requiredMonthly);
  });

  it('returns zeros for a non-positive target', () => {
    const p = goalProjection(10_000, 0, 3, 10);
    expect(p.onTrack).toBe(true);
    expect(p.shortfall).toBe(0);
    expect(p.requiredMonthly).toBe(0);
    expect(p.additionalMonthly).toBe(0);
  });
});

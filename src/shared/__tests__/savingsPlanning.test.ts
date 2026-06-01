import { describe, expect, it } from 'vitest';
import { requiredMonthlyContribution, yearsToDouble, emergencyFund } from '../savingsPlanning';
import { calcCompoundingFutureValue } from '../mutualFundsMetrics';

describe('requiredMonthlyContribution', () => {
  it('returns 0 for a non-positive target or zero years', () => {
    expect(requiredMonthlyContribution(0, 5, 10)).toBe(0);
    expect(requiredMonthlyContribution(1_000_000, 5, 0)).toBe(0);
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

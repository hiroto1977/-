import { describe, expect, it } from 'vitest';
import {
  calcSocialInsurance,
  PENSION_MONTHLY_CAP,
  HEALTH_MONTHLY_CAP,
  PENSION_RATE,
  HEALTH_RATE,
  CARE_RATE,
  EMPLOYMENT_INSURANCE_RATE,
} from '../taxSocialInsurance';

describe('calcSocialInsurance (標準報酬月額の上限を考慮)', () => {
  it('returns zero for zero or negative income', () => {
    expect(calcSocialInsurance(0).total).toBe(0);
    expect(calcSocialInsurance(-1_000_000).total).toBe(0);
  });

  it('computes pension/health/employment for a mid income below the caps', () => {
    // 年収600万 → 月50万 (両上限未満)
    const r = calcSocialInsurance(6_000_000);
    expect(r.pension).toBe(Math.round(500_000 * PENSION_RATE * 12));
    expect(r.health).toBe(Math.round(500_000 * HEALTH_RATE * 12));
    expect(r.employment).toBe(Math.round(6_000_000 * EMPLOYMENT_INSURANCE_RATE));
    expect(r.total).toBe(r.pension + r.health + r.employment);
  });

  it('caps the pension base at the standard monthly remuneration ceiling', () => {
    // 年収1,200万 → 月100万 > 厚生年金上限65万 → 年金は上限で頭打ち
    const r = calcSocialInsurance(12_000_000);
    expect(r.pension).toBe(Math.round(PENSION_MONTHLY_CAP * PENSION_RATE * 12));
    // 月100万 < 健康保険上限139万 → 健康保険は実報酬ベース
    expect(r.health).toBe(Math.round(1_000_000 * HEALTH_RATE * 12));
  });

  it('caps the health base at its higher ceiling for very high income', () => {
    // 年収2,400万 → 月200万 > 健康保険上限139万
    const r = calcSocialInsurance(24_000_000);
    expect(r.pension).toBe(Math.round(PENSION_MONTHLY_CAP * PENSION_RATE * 12));
    expect(r.health).toBe(Math.round(HEALTH_MONTHLY_CAP * HEALTH_RATE * 12));
    // 雇用保険は上限なしで賃金総額に比例
    expect(r.employment).toBe(Math.round(24_000_000 * EMPLOYMENT_INSURANCE_RATE));
  });

  it('adds the care-insurance surcharge for ages 40-64', () => {
    const without = calcSocialInsurance(6_000_000, false);
    const withCare = calcSocialInsurance(6_000_000, true);
    expect(withCare.health).toBe(Math.round(500_000 * (HEALTH_RATE + CARE_RATE) * 12));
    expect(withCare.health).toBeGreaterThan(without.health);
    // pension and employment are unaffected by care insurance
    expect(withCare.pension).toBe(without.pension);
    expect(withCare.employment).toBe(without.employment);
  });

  it('is more accurate than a flat 15% at very high income (caps reduce the burden)', () => {
    const gross = 30_000_000;
    const r = calcSocialInsurance(gross);
    // capped social insurance is well below a naive 15% of gross
    expect(r.total).toBeLessThan(gross * 0.15);
  });

  it('exposes the cap and rate constants', () => {
    expect(PENSION_MONTHLY_CAP).toBe(650_000);
    expect(HEALTH_MONTHLY_CAP).toBe(1_390_000);
    expect(PENSION_RATE).toBeCloseTo(0.0915, 4);
  });
});

import { describe, expect, it } from 'vitest';
import {
  calcSocialInsurance,
  calcSocialInsuranceWithBonus,
  PENSION_MONTHLY_CAP,
  HEALTH_MONTHLY_CAP,
  PENSION_BONUS_CAP_PER_PAYMENT,
  HEALTH_BONUS_CAP_ANNUAL,
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

describe('calcSocialInsuranceWithBonus (標準賞与額の上限を考慮)', () => {
  it('matches the monthly-only function when there is no bonus', () => {
    const withBonus = calcSocialInsuranceWithBonus(500_000, 0, 0);
    const monthlyOnly = calcSocialInsurance(6_000_000); // 月50万×12
    expect(withBonus.pension).toBe(monthlyOnly.pension);
    expect(withBonus.health).toBe(monthlyOnly.health);
    expect(withBonus.employment).toBe(monthlyOnly.employment);
  });

  it('adds pension/health/employment on the bonus below the caps', () => {
    // 月40万 + 賞与60万×2回 (両上限未満)
    const r = calcSocialInsuranceWithBonus(400_000, 600_000, 2);
    const expectedPension = Math.round(400_000 * PENSION_RATE * 12 + 600_000 * PENSION_RATE * 2);
    expect(r.pension).toBe(expectedPension);
    const expectedHealth = Math.round(400_000 * HEALTH_RATE * 12 + 1_200_000 * HEALTH_RATE);
    expect(r.health).toBe(expectedHealth);
    // 雇用保険は賃金総額 (月40万×12 + 賞与120万)
    expect(r.employment).toBe(Math.round((4_800_000 + 1_200_000) * EMPLOYMENT_INSURANCE_RATE));
  });

  it('caps the pension bonus at 150万 per payment', () => {
    // 賞与200万 (>150万上限) × 1回 → 年金は150万ベース
    const r = calcSocialInsuranceWithBonus(0, 2_000_000, 1);
    const pensionBonus = Math.round(PENSION_BONUS_CAP_PER_PAYMENT * PENSION_RATE * 1);
    expect(r.pension).toBe(pensionBonus);
    expect(PENSION_BONUS_CAP_PER_PAYMENT).toBe(1_500_000);
  });

  it('caps the health bonus at the 573万 annual cumulative ceiling', () => {
    // 賞与300万×3回 = 900万 (>573万上限) → 健康保険は573万ベース
    const r = calcSocialInsuranceWithBonus(0, 3_000_000, 3, false);
    const healthBonus = Math.round(HEALTH_BONUS_CAP_ANNUAL * HEALTH_RATE);
    expect(r.health).toBe(healthBonus);
    expect(HEALTH_BONUS_CAP_ANNUAL).toBe(5_730_000);
  });

  it('applies the care surcharge to the bonus health portion for ages 40-64', () => {
    const without = calcSocialInsuranceWithBonus(0, 1_000_000, 2, false);
    const withCare = calcSocialInsuranceWithBonus(0, 1_000_000, 2, true);
    expect(withCare.health).toBe(Math.round(2_000_000 * (HEALTH_RATE + CARE_RATE)));
    expect(withCare.health).toBeGreaterThan(without.health);
  });

  it('clamps negative inputs and floors the payment count', () => {
    expect(calcSocialInsuranceWithBonus(-1, -1, -1).total).toBe(0);
    // fractional payment count is floored
    const r = calcSocialInsuranceWithBonus(0, 1_000_000, 2.9);
    expect(r.pension).toBe(Math.round(1_000_000 * PENSION_RATE * 2));
  });
});

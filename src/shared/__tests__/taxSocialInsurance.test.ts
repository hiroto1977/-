import { describe, expect, it } from 'vitest';
import {
  calcSocialInsurance,
  calcSocialInsuranceWithBonus,
  resolveStandardMonthly,
  resolvePensionStandardMonthly,
  resolveHealthStandardMonthly,
  resolveStandardBonus,
  PENSION_MONTHLY_CAP,
  HEALTH_MONTHLY_CAP,
  PENSION_BONUS_CAP_PER_PAYMENT,
  HEALTH_BONUS_CAP_ANNUAL,
  PENSION_RATE,
  HEALTH_RATE,
  CARE_RATE,
  EMPLOYMENT_INSURANCE_RATE,
  type RemunerationGrade,
} from '../taxSocialInsurance';

describe('resolveStandardMonthly (報酬月額 → 標準報酬月額の等級解決)', () => {
  // 単純な 3 等級テーブルで境界ルール (以上〜未満) を検証する。
  const grades: readonly RemunerationGrade[] = [
    { lowerBound: 0, standardMonthly: 100 }, // 1級 (〜200未満)
    { lowerBound: 200, standardMonthly: 250 }, // 2級 (200以上〜400未満)
    { lowerBound: 400, standardMonthly: 500 }, // 3級 (400以上で頭打ち)
  ];

  it('rounds the lowest grade for income below the first boundary', () => {
    expect(resolveStandardMonthly(0, grades)).toBe(100);
    expect(resolveStandardMonthly(50, grades)).toBe(100);
    expect(resolveStandardMonthly(199, grades)).toBe(100); // 境界直前
  });

  it('switches to the next grade exactly at the lower bound (>=, 以上)', () => {
    // 200 ちょうどは 2 級 (lowerBound 以上)。>= → > の EqualityOperator 変異を撃墜。
    expect(resolveStandardMonthly(200, grades)).toBe(250);
    expect(resolveStandardMonthly(201, grades)).toBe(250); // 境界直後
    expect(resolveStandardMonthly(399, grades)).toBe(250); // 次境界直前
  });

  it('caps at the top grade (頭打ち / 青天井)', () => {
    expect(resolveStandardMonthly(400, grades)).toBe(500); // 境界ちょうど
    expect(resolveStandardMonthly(10_000_000, grades)).toBe(500); // はるか上
  });

  it('floors negative income to the lowest grade', () => {
    expect(resolveStandardMonthly(-1, grades)).toBe(100);
    expect(resolveStandardMonthly(-9_999, grades)).toBe(100);
  });
});

describe('resolvePensionStandardMonthly (厚生年金 第1〜32級)', () => {
  it('floors at 88,000 (第1級) and caps at 650,000 (第32級)', () => {
    expect(resolvePensionStandardMonthly(0)).toBe(88_000);
    expect(resolvePensionStandardMonthly(50_000)).toBe(88_000);
    expect(resolvePensionStandardMonthly(92_999)).toBe(88_000); // 第2級境界直前
    expect(resolvePensionStandardMonthly(5_000_000)).toBe(650_000);
    expect(resolvePensionStandardMonthly(PENSION_MONTHLY_CAP)).toBe(650_000);
  });

  it('resolves a representative mid grade exactly at its boundary', () => {
    // 報酬月額 93,000 ちょうどで第2級 98,000 に上がる。
    expect(resolvePensionStandardMonthly(93_000)).toBe(98_000);
    // 第32級 (最上位) は 635,000 以上。
    expect(resolvePensionStandardMonthly(635_000)).toBe(650_000);
    expect(resolvePensionStandardMonthly(634_999)).toBe(620_000); // 第31級
  });
});

describe('resolveHealthStandardMonthly (健康保険 第1〜50級)', () => {
  it('floors at 58,000 (第1級) and caps at 1,390,000 (第50級)', () => {
    expect(resolveHealthStandardMonthly(0)).toBe(58_000);
    expect(resolveHealthStandardMonthly(62_999)).toBe(58_000); // 第2級境界直前
    expect(resolveHealthStandardMonthly(20_000_000)).toBe(1_390_000);
    expect(resolveHealthStandardMonthly(HEALTH_MONTHLY_CAP)).toBe(1_390_000);
  });

  it('resolves representative grades at their boundaries', () => {
    expect(resolveHealthStandardMonthly(63_000)).toBe(68_000); // 第2級ちょうど
    expect(resolveHealthStandardMonthly(1_000_000)).toBe(980_000); // 第43級
    expect(resolveHealthStandardMonthly(1_355_000)).toBe(1_390_000); // 第50級ちょうど
    expect(resolveHealthStandardMonthly(1_354_999)).toBe(1_330_000); // 第49級
  });

  it('health and pension tables share standard amounts in the overlapping range but differ at the ends', () => {
    // 月20万は両表とも 200,000。
    expect(resolveHealthStandardMonthly(200_000)).toBe(200_000);
    expect(resolvePensionStandardMonthly(200_000)).toBe(200_000);
    // 月80万: 厚年は頭打ち(650,000)、健保は第39級 790,000。
    expect(resolvePensionStandardMonthly(800_000)).toBe(650_000);
    expect(resolveHealthStandardMonthly(800_000)).toBe(790_000);
  });
});

describe('resolveStandardBonus (標準賞与額 = 1,000円未満切捨て)', () => {
  it('truncates to the nearest lower 1,000 yen', () => {
    expect(resolveStandardBonus(0)).toBe(0);
    expect(resolveStandardBonus(999)).toBe(0);
    expect(resolveStandardBonus(1_000)).toBe(1_000);
    expect(resolveStandardBonus(1_999)).toBe(1_000);
    expect(resolveStandardBonus(123_456)).toBe(123_000);
  });

  it('clamps negative bonus to zero', () => {
    expect(resolveStandardBonus(-1)).toBe(0);
    expect(resolveStandardBonus(-1_000_000)).toBe(0);
  });
});

describe('calcSocialInsurance (標準報酬月額の等級表ベース)', () => {
  it('returns zero for zero or negative income', () => {
    expect(calcSocialInsurance(0).total).toBe(0);
    expect(calcSocialInsurance(-1_000_000).total).toBe(0);
  });

  it('computes pension/health/employment for a mid income below the caps', () => {
    // 年収600万 → 月50万 → 標準報酬月額 500,000 (厚年第27級/健保第30級, 両表とも一致)。
    const r = calcSocialInsurance(6_000_000);
    expect(resolvePensionStandardMonthly(500_000)).toBe(500_000);
    expect(resolveHealthStandardMonthly(500_000)).toBe(500_000);
    expect(r.pension).toBe(Math.round(500_000 * PENSION_RATE * 12));
    expect(r.health).toBe(Math.round(500_000 * HEALTH_RATE * 12));
    expect(r.employment).toBe(Math.round(6_000_000 * EMPLOYMENT_INSURANCE_RATE));
    expect(r.total).toBe(r.pension + r.health + r.employment);
  });

  it('caps the pension base at the standard monthly remuneration ceiling', () => {
    // 年収1,200万 → 月100万 > 厚生年金上限65万 → 年金は上限で頭打ち
    const r = calcSocialInsurance(12_000_000);
    expect(r.pension).toBe(Math.round(PENSION_MONTHLY_CAP * PENSION_RATE * 12));
    // 月100万 → 健保は第43級 980,000 で算定 (139万上限未満)
    expect(r.health).toBe(Math.round(980_000 * HEALTH_RATE * 12));
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

  it('snaps to the grade rather than the raw remuneration (discrete steps)', () => {
    // 月報酬がわずかに違っても同じ等級内なら標準報酬月額は同一 → 保険料は同額。
    const a = calcSocialInsurance(12 * 396_000); // 月396,000 → 第24級 410,000 (厚年)
    const b = calcSocialInsurance(12 * 420_000); // 月420,000 → 同じ第24級 410,000
    expect(a.pension).toBe(b.pension);
    expect(resolvePensionStandardMonthly(396_000)).toBe(410_000);
    expect(resolvePensionStandardMonthly(420_000)).toBe(410_000);
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
    // 月40万 → 標準報酬月額 410,000 (厚年第24級) / 410,000 (健保) + 賞与60万×2回 (両上限未満)
    const r = calcSocialInsuranceWithBonus(400_000, 600_000, 2);
    const pMonthly = resolvePensionStandardMonthly(400_000); // 410,000
    const hMonthly = resolveHealthStandardMonthly(400_000); // 410,000
    const expectedPension = Math.round(pMonthly * PENSION_RATE * 12 + 600_000 * PENSION_RATE * 2);
    expect(r.pension).toBe(expectedPension);
    const expectedHealth = Math.round(hMonthly * HEALTH_RATE * 12 + 1_200_000 * HEALTH_RATE);
    expect(r.health).toBe(expectedHealth);
    // 雇用保険は賃金総額 (月40万×12 + 賞与120万)
    expect(r.employment).toBe(Math.round((4_800_000 + 1_200_000) * EMPLOYMENT_INSURANCE_RATE));
    // total = pension + health + employment (3要素とも非ゼロ → ± mutation を殺す)
    expect(r.total).toBe(r.pension + r.health + r.employment);
  });

  it('truncates the bonus to a 1,000-yen multiple before applying the rate', () => {
    // 賞与 600,999 円は標準賞与額 600,000 円に切捨て。
    const r = calcSocialInsuranceWithBonus(0, 600_999, 1);
    expect(r.pension).toBe(Math.round(600_000 * PENSION_RATE * 1));
    expect(r.health).toBe(Math.round(600_000 * HEALTH_RATE));
  });

  it('does not floor bonus-only income to the lowest monthly grade', () => {
    // monthly=0 の場合は月額報酬の保険料を 0 にする (最下位等級 88,000/58,000 で底打ちしない)。
    const r = calcSocialInsuranceWithBonus(0, 1_000_000, 1);
    expect(r.pension).toBe(Math.round(1_000_000 * PENSION_RATE * 1));
    expect(r.health).toBe(Math.round(1_000_000 * HEALTH_RATE));
  });

  it('caps the pension bonus at 150万 per payment', () => {
    // 賞与200万 (>150万上限) × 1回 → 年金は150万ベース
    const r = calcSocialInsuranceWithBonus(0, 2_000_000, 1);
    const pensionBonus = Math.round(PENSION_BONUS_CAP_PER_PAYMENT * PENSION_RATE * 1);
    expect(r.pension).toBe(pensionBonus);
    expect(PENSION_BONUS_CAP_PER_PAYMENT).toBe(1_500_000);
  });

  it('does not cap the pension bonus exactly at 150万', () => {
    // 賞与ちょうど150万 → 上限と等しく頭打ちされない (min の境界)。
    const r = calcSocialInsuranceWithBonus(0, 1_500_000, 1);
    expect(r.pension).toBe(Math.round(1_500_000 * PENSION_RATE * 1));
  });

  it('caps the health bonus at the 573万 annual cumulative ceiling', () => {
    // 賞与300万×3回 = 900万 (>573万上限) → 健康保険は573万ベース
    const r = calcSocialInsuranceWithBonus(0, 3_000_000, 3, false);
    const healthBonus = Math.round(HEALTH_BONUS_CAP_ANNUAL * HEALTH_RATE);
    expect(r.health).toBe(healthBonus);
    expect(HEALTH_BONUS_CAP_ANNUAL).toBe(5_730_000);
  });

  it('does not cap the health bonus exactly at the 573万 ceiling', () => {
    // 累計ちょうど573万 → 頭打ちされない (min の境界)。
    const r = calcSocialInsuranceWithBonus(0, 5_730_000, 1, false);
    expect(r.health).toBe(Math.round(5_730_000 * HEALTH_RATE));
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

  it('returns all-zero when monthly is zero, bonus is zero, and count is zero', () => {
    const r = calcSocialInsuranceWithBonus(0, 0, 0);
    expect(r).toEqual({ pension: 0, health: 0, employment: 0, total: 0 });
  });
});

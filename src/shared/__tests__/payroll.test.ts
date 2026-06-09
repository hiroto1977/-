import { describe, expect, it } from 'vitest';
import {
  COMMUTE_PUBLIC_TRANSPORT_CAP,
  publicTransportCommute,
  carCommuteNonTaxableLimit,
  bonusWithholdingRatePctDep0,
  bonusWithholdingTax,
  calcMonthlySocialInsurance,
  estimateMonthlyWithholding,
  calcMonthlyNetSalary,
  calcBonusNet,
  calcEmployerCost,
  EMPLOYMENT_INSURANCE_RATE_EMPLOYER,
  WORKERS_ACCIDENT_RATE,
  CHILD_CARE_CONTRIBUTION_RATE,
} from '../payroll';
import {
  PENSION_RATE,
  HEALTH_RATE,
  CARE_RATE,
  EMPLOYMENT_INSURANCE_RATE,
  PENSION_BONUS_CAP_PER_PAYMENT,
  resolvePensionStandardMonthly,
  resolveHealthStandardMonthly,
} from '../taxSocialInsurance';

describe('publicTransportCommute', () => {
  it('treats commute within the cap as fully non-taxable', () => {
    expect(publicTransportCommute(120_000)).toEqual({ nonTaxable: 120_000, taxable: 0 });
  });

  it('caps the non-taxable portion at 150,000 and taxes the excess', () => {
    expect(publicTransportCommute(180_000)).toEqual({ nonTaxable: COMMUTE_PUBLIC_TRANSPORT_CAP, taxable: 30_000 });
  });

  it('treats a negative input as zero', () => {
    expect(publicTransportCommute(-1)).toEqual({ nonTaxable: 0, taxable: 0 });
  });
});

describe('carCommuteNonTaxableLimit', () => {
  it('returns 0 below 2km and steps up by distance band', () => {
    expect(carCommuteNonTaxableLimit(1)).toBe(0);
    expect(carCommuteNonTaxableLimit(5)).toBe(4_200);
    expect(carCommuteNonTaxableLimit(12)).toBe(7_100);
    expect(carCommuteNonTaxableLimit(20)).toBe(12_900);
    expect(carCommuteNonTaxableLimit(30)).toBe(18_700);
    expect(carCommuteNonTaxableLimit(40)).toBe(24_400);
    expect(carCommuteNonTaxableLimit(50)).toBe(28_000);
    expect(carCommuteNonTaxableLimit(60)).toBe(31_600);
  });

  it('uses inclusive lower / exclusive upper band boundaries', () => {
    expect(carCommuteNonTaxableLimit(2)).toBe(4_200);
    expect(carCommuteNonTaxableLimit(10)).toBe(7_100);
    // 各境界 km は上側バンド (`<` は排他的)。`<` を `<=` にする mutant を殺す。
    expect(carCommuteNonTaxableLimit(15)).toBe(12_900);
    expect(carCommuteNonTaxableLimit(25)).toBe(18_700);
    expect(carCommuteNonTaxableLimit(35)).toBe(24_400);
    expect(carCommuteNonTaxableLimit(45)).toBe(28_000);
    expect(carCommuteNonTaxableLimit(55)).toBe(31_600);
  });
});

describe('bonusWithholdingRatePctDep0', () => {
  it('returns 0% below the first bracket', () => {
    expect(bonusWithholdingRatePctDep0(50_000)).toBe(0);
  });

  it('looks up the rate by the previous-month salary bracket', () => {
    expect(bonusWithholdingRatePctDep0(70_000)).toBe(2.042); // [68k,79k)
    expect(bonusWithholdingRatePctDep0(300_000)).toBe(8.168); // [300k,334k)
    expect(bonusWithholdingRatePctDep0(5_000_000)).toBe(45.945); // top bracket
  });
});

describe('bonusWithholdingTax', () => {
  it('taxes (bonus − social insurance) at the bracket rate, flooring to yen', () => {
    // prevMonth 300,000 → 8.168%; taxable 500,000 - 70,000 = 430,000 → floor(35,122.4) = 35,122
    const w = bonusWithholdingTax({ bonus: 500_000, socialInsurance: 70_000, prevMonthSalaryAfterSI: 300_000 });
    expect(w.taxableBonus).toBe(430_000);
    expect(w.ratePct).toBe(8.168);
    expect(w.tax).toBe(35_122);
  });

  it('is zero when the previous-month salary falls in the 0% bracket', () => {
    const w = bonusWithholdingTax({ bonus: 200_000, socialInsurance: 30_000, prevMonthSalaryAfterSI: 50_000 });
    expect(w.ratePct).toBe(0);
    expect(w.tax).toBe(0);
  });

  it('never goes negative when social insurance exceeds the bonus', () => {
    const w = bonusWithholdingTax({ bonus: 50_000, socialInsurance: 80_000, prevMonthSalaryAfterSI: 300_000 });
    expect(w.taxableBonus).toBe(0);
    expect(w.tax).toBe(0);
  });
});

describe('calcMonthlySocialInsurance (月次社会保険料, 本人負担)', () => {
  it('applies the grade-table standard remuneration with floor-to-yen', () => {
    // 報酬 300,000 → 厚年・健保とも標準報酬月額 300,000。
    const si = calcMonthlySocialInsurance(300_000);
    expect(si.pension).toBe(Math.floor(300_000 * PENSION_RATE)); // 27,450
    expect(si.health).toBe(Math.floor(300_000 * HEALTH_RATE)); // 15,000
    expect(si.employment).toBe(Math.floor(300_000 * EMPLOYMENT_INSURANCE_RATE)); // 1,800
    expect(si.total).toBe(si.pension + si.health + si.employment); // 44,250
    expect(si.total).toBe(44_250);
  });

  it('adds the long-term care rate to health when withCare is true (40-64)', () => {
    const base = calcMonthlySocialInsurance(300_000, false);
    const withCare = calcMonthlySocialInsurance(300_000, true);
    expect(withCare.health).toBe(Math.floor(300_000 * (HEALTH_RATE + CARE_RATE))); // 17,400
    expect(withCare.health).toBe(17_400);
    // pension / employment は介護で変わらない。
    expect(withCare.pension).toBe(base.pension);
    expect(withCare.employment).toBe(base.employment);
    expect(withCare.total).toBeGreaterThan(base.total);
  });

  it('uses the standard monthly grade (not raw remuneration) for pension/health', () => {
    // 報酬 305,000 は標準報酬月額 300,000 等級 (290,000以上320,000未満) に丸まる。
    const si = calcMonthlySocialInsurance(305_000);
    expect(si.pension).toBe(Math.floor(resolvePensionStandardMonthly(305_000) * PENSION_RATE));
    expect(si.health).toBe(Math.floor(resolveHealthStandardMonthly(305_000) * HEALTH_RATE));
    // 雇用保険は標準報酬ではなく実報酬。
    expect(si.employment).toBe(Math.floor(305_000 * EMPLOYMENT_INSURANCE_RATE));
  });

  it('returns all zeros at and below zero remuneration (no lowest-grade floor)', () => {
    expect(calcMonthlySocialInsurance(0)).toEqual({ pension: 0, health: 0, employment: 0, total: 0 });
    expect(calcMonthlySocialInsurance(-100)).toEqual({ pension: 0, health: 0, employment: 0, total: 0 });
  });

  it('does NOT zero out a tiny positive remuneration (the <=0 guard is exclusive at >0)', () => {
    // 1 円でも正なら最下位等級が底打ち → pension/health が 0 より大きい。
    // `<= 0` → `< 0` 変異を撃墜 (0 で計算経路に入ると最下位等級が出てしまう)。
    const si = calcMonthlySocialInsurance(1);
    expect(si.pension).toBeGreaterThan(0);
    expect(si.health).toBeGreaterThan(0);
  });
});

describe('estimateMonthlyWithholding (月次源泉所得税, 年税額の月割概算)', () => {
  it('approximates monthly withholding as annual income tax / 12, floored', () => {
    // 額面30万/月, 社保44,250/月 → 年税額72,950 → 月割 floor(6,079.16)=6,079。
    expect(estimateMonthlyWithholding(300_000, 44_250)).toBe(6_079);
  });

  it('returns 0 for zero / negative gross', () => {
    expect(estimateMonthlyWithholding(0, 0)).toBe(0);
    expect(estimateMonthlyWithholding(-300_000, 44_250)).toBe(0);
  });

  it('treats negative social insurance as zero (higher taxable income)', () => {
    const withNegSI = estimateMonthlyWithholding(300_000, -10_000);
    const withZeroSI = estimateMonthlyWithholding(300_000, 0);
    expect(withNegSI).toBe(withZeroSI);
    // 社保控除が大きいほど源泉は小さい (社保 0 < 社保 44,250)。
    expect(withZeroSI).toBeGreaterThan(estimateMonthlyWithholding(300_000, 44_250));
  });

  it('is zero when the taxable income falls to zero (low gross)', () => {
    // 低額面では給与所得控除+基礎控除で課税所得 0 → 源泉 0。
    expect(estimateMonthlyWithholding(80_000, 12_000)).toBe(0);
  });
});

describe('calcMonthlyNetSalary (月次手取り)', () => {
  it('subtracts social insurance + withholding from gross (no resident tax by default)', () => {
    const net = calcMonthlyNetSalary(300_000);
    expect(net.gross).toBe(300_000);
    expect(net.socialInsurance).toBe(44_250);
    expect(net.socialInsuranceBreakdown.total).toBe(44_250);
    expect(net.incomeTax).toBe(6_079);
    expect(net.residentTax).toBe(0);
    expect(net.totalDeductions).toBe(44_250 + 6_079);
    expect(net.takeHome).toBe(300_000 - 44_250 - 6_079); // 249,671
    expect(net.takeHome).toBe(249_671);
  });

  it('subtracts a provided monthly resident tax', () => {
    const net = calcMonthlyNetSalary(300_000, { residentTaxMonthly: 15_000 });
    expect(net.residentTax).toBe(15_000);
    expect(net.totalDeductions).toBe(44_250 + 6_079 + 15_000);
    expect(net.takeHome).toBe(300_000 - 44_250 - 6_079 - 15_000); // 234,671
  });

  it('ignores non-positive / non-finite resident tax overrides', () => {
    expect(calcMonthlyNetSalary(300_000, { residentTaxMonthly: 0 }).residentTax).toBe(0);
    expect(calcMonthlyNetSalary(300_000, { residentTaxMonthly: -5_000 }).residentTax).toBe(0);
    expect(calcMonthlyNetSalary(300_000, { residentTaxMonthly: Infinity }).residentTax).toBe(0);
    expect(calcMonthlyNetSalary(300_000, { residentTaxMonthly: NaN }).residentTax).toBe(0);
  });

  it('floors a fractional resident tax override to yen', () => {
    const net = calcMonthlyNetSalary(300_000, { residentTaxMonthly: 15_000.9 });
    expect(net.residentTax).toBe(15_000);
  });

  it('raises deductions when withCare adds the care premium', () => {
    const base = calcMonthlyNetSalary(300_000);
    const withCare = calcMonthlyNetSalary(300_000, { withCare: true });
    expect(withCare.socialInsurance).toBeGreaterThan(base.socialInsurance);
    expect(withCare.takeHome).toBeLessThan(base.takeHome);
  });

  it('returns all zeros (take-home 0) at and below zero gross', () => {
    const z = calcMonthlyNetSalary(0);
    expect(z).toEqual({
      gross: 0,
      socialInsurance: 0,
      socialInsuranceBreakdown: { pension: 0, health: 0, employment: 0, total: 0 },
      incomeTax: 0,
      residentTax: 0,
      totalDeductions: 0,
      takeHome: 0,
    });
    expect(calcMonthlyNetSalary(-300_000).takeHome).toBe(0);
  });

  it('does not apply resident tax even when provided for a zero-gross month', () => {
    // 額面 0 の早期 return は residentTax を 0 にする (控除する給与がない)。
    const z = calcMonthlyNetSalary(0, { residentTaxMonthly: 15_000 });
    expect(z.residentTax).toBe(0);
    expect(z.takeHome).toBe(0);
  });
});

describe('calcBonusNet (賞与の手取り)', () => {
  it('deducts bonus social insurance (standard bonus) and withholding', () => {
    // 賞与50万, 前月給与30万 → 率8.168%。標準賞与額50万 (1,000円未満なし)。
    const b = calcBonusNet(500_000, 300_000);
    expect(b.gross).toBe(500_000);
    expect(b.socialInsuranceBreakdown.pension).toBe(Math.floor(500_000 * PENSION_RATE)); // 45,750
    expect(b.socialInsuranceBreakdown.health).toBe(Math.floor(500_000 * HEALTH_RATE)); // 25,000
    expect(b.socialInsuranceBreakdown.employment).toBe(Math.floor(500_000 * EMPLOYMENT_INSURANCE_RATE)); // 3,000
    expect(b.socialInsurance).toBe(73_750);
    expect(b.withholdingRatePct).toBe(8.168);
    expect(b.incomeTax).toBe(34_816);
    expect(b.totalDeductions).toBe(73_750 + 34_816);
    expect(b.takeHome).toBe(500_000 - 73_750 - 34_816); // 391,434
    expect(b.takeHome).toBe(391_434);
  });

  it('floors the bonus to the standard bonus (1,000-yen floor) for SI', () => {
    // 500,999 → 標準賞与額 500,000。
    const b = calcBonusNet(500_999, 300_000);
    expect(b.socialInsuranceBreakdown.pension).toBe(Math.floor(500_000 * PENSION_RATE));
    expect(b.socialInsuranceBreakdown.health).toBe(Math.floor(500_000 * HEALTH_RATE));
    // 雇用保険は標準賞与額ではなく実額。
    expect(b.socialInsuranceBreakdown.employment).toBe(Math.floor(500_999 * EMPLOYMENT_INSURANCE_RATE));
  });

  it('caps the pension standard bonus at 1.5M per payment', () => {
    const b = calcBonusNet(2_000_000, 300_000);
    expect(b.socialInsuranceBreakdown.pension).toBe(Math.floor(PENSION_BONUS_CAP_PER_PAYMENT * PENSION_RATE));
    // 健保は 573 万まで頭打ちなので 200 万はそのまま標準賞与額。
    expect(b.socialInsuranceBreakdown.health).toBe(Math.floor(2_000_000 * HEALTH_RATE));
  });

  it('adds the care premium to bonus health when withCare is true', () => {
    const base = calcBonusNet(500_000, 300_000);
    const withCare = calcBonusNet(500_000, 300_000, { withCare: true });
    expect(withCare.socialInsuranceBreakdown.health).toBe(Math.floor(500_000 * (HEALTH_RATE + CARE_RATE)));
    expect(withCare.socialInsuranceBreakdown.health).toBeGreaterThan(base.socialInsuranceBreakdown.health);
  });

  it('uses a 0% withholding rate when the previous-month salary is low', () => {
    const b = calcBonusNet(500_000, 50_000);
    expect(b.withholdingRatePct).toBe(0);
    expect(b.incomeTax).toBe(0);
    // 社保のみ控除。
    expect(b.takeHome).toBe(500_000 - b.socialInsurance);
  });

  it('returns zeros at and below zero bonus but still reports the rate', () => {
    const z = calcBonusNet(0, 300_000);
    expect(z.gross).toBe(0);
    expect(z.socialInsurance).toBe(0);
    expect(z.incomeTax).toBe(0);
    expect(z.totalDeductions).toBe(0);
    expect(z.takeHome).toBe(0);
    expect(z.withholdingRatePct).toBe(8.168); // 率は前月給与で決まり賞与0でも参照可能
    expect(calcBonusNet(-100_000, 300_000).takeHome).toBe(0);
  });
});

describe('calcEmployerCost (人件費の会社負担総額)', () => {
  it('adds employer-side legal welfare costs on top of gross', () => {
    const c = calcEmployerCost(300_000);
    expect(c.gross).toBe(300_000);
    // 折半分は本人率と同じ (PENSION_RATE / HEALTH_RATE は折半後)。
    expect(c.pension).toBe(Math.floor(300_000 * PENSION_RATE)); // 27,450
    expect(c.health).toBe(Math.floor(300_000 * HEALTH_RATE)); // 15,000
    expect(c.employment).toBe(Math.floor(300_000 * EMPLOYMENT_INSURANCE_RATE_EMPLOYER)); // 2,850
    expect(c.workersAccident).toBe(Math.floor(300_000 * WORKERS_ACCIDENT_RATE)); // 900
    expect(c.childCare).toBe(Math.floor(300_000 * CHILD_CARE_CONTRIBUTION_RATE)); // 1,080
    expect(c.employerContributions).toBe(27_450 + 15_000 + 2_850 + 900 + 1_080); // 47,280
    expect(c.totalCost).toBe(300_000 + 47_280); // 347,280
    expect(c.totalCost).toBe(347_280);
  });

  it('uses the higher employer employment-insurance rate (not the employee rate)', () => {
    // 事業主率 0.95% > 本人率 0.6% を区別 (定数取り違えの変異を撃墜)。
    expect(EMPLOYMENT_INSURANCE_RATE_EMPLOYER).toBeGreaterThan(EMPLOYMENT_INSURANCE_RATE);
    const c = calcEmployerCost(300_000);
    expect(c.employment).toBe(Math.floor(300_000 * EMPLOYMENT_INSURANCE_RATE_EMPLOYER));
    expect(c.employment).not.toBe(Math.floor(300_000 * EMPLOYMENT_INSURANCE_RATE));
  });

  it('bases child-care contribution on the pension standard monthly grade', () => {
    // 報酬 305,000 → 厚年標準報酬月額 300,000 が拠出金の算定基礎。
    const c = calcEmployerCost(305_000);
    expect(c.childCare).toBe(Math.floor(resolvePensionStandardMonthly(305_000) * CHILD_CARE_CONTRIBUTION_RATE));
  });

  it('adds the care premium to the employer health share when withCare is true', () => {
    const base = calcEmployerCost(300_000);
    const withCare = calcEmployerCost(300_000, { withCare: true });
    expect(withCare.health).toBe(Math.floor(300_000 * (HEALTH_RATE + CARE_RATE)));
    expect(withCare.health).toBeGreaterThan(base.health);
    expect(withCare.totalCost).toBeGreaterThan(base.totalCost);
  });

  it('returns all zeros at and below zero gross', () => {
    const z = calcEmployerCost(0);
    expect(z).toEqual({
      gross: 0,
      pension: 0,
      health: 0,
      employment: 0,
      workersAccident: 0,
      childCare: 0,
      employerContributions: 0,
      totalCost: 0,
    });
    expect(calcEmployerCost(-300_000).totalCost).toBe(0);
  });

  it('total cost always exceeds gross for a positive salary (employer burden)', () => {
    const c = calcEmployerCost(250_000);
    expect(c.totalCost).toBeGreaterThan(c.gross);
    expect(c.totalCost).toBe(c.gross + c.employerContributions);
  });
});

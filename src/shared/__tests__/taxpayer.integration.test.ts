import { describe, expect, it } from 'vitest';
import {
  calcSalaryIncomeDeduction,
  calcBasicDeduction,
  calcResidentBasicDeduction,
  calcIncomeTax,
  calcResidentTax,
  BASIC_DEDUCTION,
  RESIDENT_BASIC_DEDUCTION,
} from '../taxCalc';
import { calcSocialInsurance } from '../taxSocialInsurance';
import { calcSpouseDeduction, calcLifeInsuranceDeduction } from '../taxDeductions';

/**
 * 仮想データによる「給与所得者の年税額」エンドツーエンド稼働テスト。
 *
 * 個々の税モジュールは各々の単体テストで網羅済み。ここでは現実的な納税者像を
 * 想定し、給与所得控除 → 社会保険料 → 各種所得控除 → 課税所得 → 所得税/住民税
 * までを**連結**して、組み合わせた結果が整合する(矛盾しない・単調性が崩れない)
 * ことを確認する。
 *
 * **概算試算であり税務助言ではありません。** 端数処理や控除の細部は各モジュールの
 * 仕様に従う。本テストは「パイプラインが破綻しないこと」と「経済的に妥当な大小関係」
 * を検証するもので、確定申告額の保証ではない。
 */

interface Taxpayer {
  grossAnnual: number;        // 額面年収
  spouseIncome: number;       // 配偶者の合計所得
  lifeInsuranceGeneral: number; // 一般生命保険料 (新制度)
}

/** 給与所得者の所得税・住民税を概算する連結パイプライン。 */
function assessTaxpayer(t: Taxpayer) {
  // 1. 給与所得 = 額面 − 給与所得控除
  const salaryDeduction = calcSalaryIncomeDeduction(t.grossAnnual);
  const salaryIncome = Math.max(0, t.grossAnnual - salaryDeduction);

  // 2. 社会保険料控除 (全額所得控除)
  const si = calcSocialInsurance(t.grossAnnual);

  // 3. 人的・物的控除
  const spouse = calcSpouseDeduction(salaryIncome, t.spouseIncome);
  const life = calcLifeInsuranceDeduction({ general: t.lifeInsuranceGeneral, medical: 0, pension: 0 });

  // 4. 課税所得 (所得税ベース / 住民税ベース)
  const incomeDeductions = si.total + BASIC_DEDUCTION + spouse.incomeTax + life.incomeTax;
  const residentDeductions = si.total + RESIDENT_BASIC_DEDUCTION + spouse.residentTax + life.residentTax;
  // 基礎控除の逓減を反映 (高所得者向け)
  const basicIncome = calcBasicDeduction(salaryIncome);
  const basicResident = calcResidentBasicDeduction(salaryIncome);
  const taxableIncome = Math.max(0, salaryIncome - (si.total + basicIncome + spouse.incomeTax + life.incomeTax));
  const taxableResident = Math.max(0, salaryIncome - (si.total + basicResident + spouse.residentTax + life.residentTax));

  // 5. 税額
  const incomeTax = calcIncomeTax(taxableIncome);
  const residentTax = calcResidentTax(taxableResident);

  return {
    salaryIncome, social: si.total, spouse, life,
    incomeDeductions, residentDeductions,
    taxableIncome, taxableResident, incomeTax, residentTax,
    totalTax: incomeTax + residentTax,
    takeHome: t.grossAnnual - si.total - incomeTax - residentTax,
  };
}

describe('taxpayer end-to-end — salaried employee assessment', () => {
  it('produces a coherent assessment for a mid-income employee with spouse + life insurance', () => {
    const r = assessTaxpayer({ grossAnnual: 5_000_000, spouseIncome: 0, lifeInsuranceGeneral: 80_000 });
    // 給与所得は額面より小さく正
    expect(r.salaryIncome).toBeGreaterThan(0);
    expect(r.salaryIncome).toBeLessThan(5_000_000);
    // 配偶者控除(所得無し配偶者)が効く
    expect(r.spouse.incomeTax).toBeGreaterThan(0);
    // 生命保険料控除は上限 4万 (一般のみ・新制度・8万円払込)
    expect(r.life.incomeTax).toBe(40_000);
    // 税額は正、手取りは額面未満かつ正
    expect(r.incomeTax).toBeGreaterThan(0);
    expect(r.residentTax).toBeGreaterThan(0);
    expect(r.takeHome).toBeGreaterThan(0);
    expect(r.takeHome).toBeLessThan(5_000_000);
  });

  it('keeps income-tax base ≤ resident-tax base (resident basic deduction is smaller)', () => {
    const r = assessTaxpayer({ grossAnnual: 6_000_000, spouseIncome: 0, lifeInsuranceGeneral: 80_000 });
    // 住民税の基礎控除(43万) < 所得税の基礎控除(48万) → 住民税の課税所得が大きい
    expect(r.taxableResident).toBeGreaterThanOrEqual(r.taxableIncome);
  });

  it('is monotonic: higher salary never lowers total tax', () => {
    const salaries = [3_000_000, 5_000_000, 8_000_000, 12_000_000, 20_000_000];
    const taxes = salaries.map((s) => assessTaxpayer({ grossAnnual: s, spouseIncome: 0, lifeInsuranceGeneral: 0 }).totalTax);
    for (let i = 1; i < taxes.length; i += 1) {
      expect(taxes[i]!).toBeGreaterThan(taxes[i - 1]!);
    }
  });

  it('take-home rises with salary but the marginal take-home rate falls (progressivity)', () => {
    const low = assessTaxpayer({ grossAnnual: 4_000_000, spouseIncome: 0, lifeInsuranceGeneral: 0 });
    const high = assessTaxpayer({ grossAnnual: 12_000_000, spouseIncome: 0, lifeInsuranceGeneral: 0 });
    expect(high.takeHome).toBeGreaterThan(low.takeHome);
    // 限界手取り率 (差分手取り / 差分額面) < 低所得者の平均手取り率 を期待 (累進)
    const marginal = (high.takeHome - low.takeHome) / (12_000_000 - 4_000_000);
    const avgLow = low.takeHome / 4_000_000;
    expect(marginal).toBeLessThan(avgLow);
  });

  it('a spouse with high income removes the spouse deduction (raising tax)', () => {
    const withDep = assessTaxpayer({ grossAnnual: 6_000_000, spouseIncome: 0, lifeInsuranceGeneral: 0 });
    const noDep = assessTaxpayer({ grossAnnual: 6_000_000, spouseIncome: 5_000_000, lifeInsuranceGeneral: 0 });
    expect(noDep.spouse.incomeTax).toBe(0);
    expect(noDep.totalTax).toBeGreaterThan(withDep.totalTax);
  });

  it('life-insurance deduction reduces tax versus no insurance', () => {
    const withIns = assessTaxpayer({ grossAnnual: 6_000_000, spouseIncome: 0, lifeInsuranceGeneral: 80_000 });
    const noIns = assessTaxpayer({ grossAnnual: 6_000_000, spouseIncome: 0, lifeInsuranceGeneral: 0 });
    expect(withIns.totalTax).toBeLessThan(noIns.totalTax);
  });

  it('a very low income employee owes little or no income tax', () => {
    const r = assessTaxpayer({ grossAnnual: 1_200_000, spouseIncome: 0, lifeInsuranceGeneral: 0 });
    expect(r.incomeTax).toBe(0); // 給与所得控除55万 + 基礎控除48万 で課税所得0
    expect(r.takeHome).toBeGreaterThan(0);
  });
});

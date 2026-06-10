import { describe, it, expect } from 'vitest';
import {
  monthlyCompensation,
  solveGrossForTakeHome,
  designWelfareScheme,
} from '../welfareScheme';

describe('monthlyCompensation', () => {
  it('0 / 負の額面は全 0', () => {
    expect(monthlyCompensation(0)).toEqual({
      gross: 0,
      employeeSocialInsurance: 0,
      incomeTax: 0,
      residentTax: 0,
      takeHome: 0,
      employerSocialInsurance: 0,
    });
    expect(monthlyCompensation(-100).takeHome).toBe(0);
  });

  it('手取りは額面より小さい (控除がある)', () => {
    const c = monthlyCompensation(400_000);
    expect(c.takeHome).toBeLessThan(c.gross);
    expect(c.takeHome).toBeGreaterThan(0);
    expect(c.employeeSocialInsurance).toBeGreaterThan(0);
    expect(c.incomeTax).toBeGreaterThan(0);
    expect(c.residentTax).toBeGreaterThan(0);
  });

  it('takeHome = gross − 社保 − 所得税 − 住民税', () => {
    const c = monthlyCompensation(500_000);
    expect(c.takeHome).toBe(c.gross - c.employeeSocialInsurance - c.incomeTax - c.residentTax);
  });

  it('介護保険 (40歳以上) は社保が増え手取りが減る', () => {
    const without = monthlyCompensation(400_000, false);
    const withCare = monthlyCompensation(400_000, true);
    expect(withCare.employeeSocialInsurance).toBeGreaterThan(without.employeeSocialInsurance);
    expect(withCare.takeHome).toBeLessThan(without.takeHome);
  });

  it('額面が高いほど手取りも高い (単調増加)', () => {
    expect(monthlyCompensation(600_000).takeHome).toBeGreaterThan(
      monthlyCompensation(300_000).takeHome,
    );
  });

  it('会社負担社保 > 0 (額面 > 0 のとき)', () => {
    expect(monthlyCompensation(400_000).employerSocialInsurance).toBeGreaterThan(0);
  });
});

describe('solveGrossForTakeHome', () => {
  it('0 以下の目標は 0', () => {
    expect(solveGrossForTakeHome(0)).toBe(0);
    expect(solveGrossForTakeHome(-1)).toBe(0);
  });

  it('逆算した額面の手取りが目標にほぼ一致する', () => {
    const gross = solveGrossForTakeHome(300_000);
    expect(monthlyCompensation(gross).takeHome).toBeCloseTo(300_000, -1); // ±10円
  });

  it('目標が大きいほど必要額面も大きい', () => {
    expect(solveGrossForTakeHome(400_000)).toBeGreaterThan(solveGrossForTakeHome(250_000));
  });
});

describe('designWelfareScheme', () => {
  const input = {
    targetFreeCash: 265_000,
    rentTotal: 80_000,
    rentCompanyShare: 70_000,
    mealTotal: 15_000,
    mealCompanyShare: 7_500,
    childcare: 50_000,
    ecPoints: 30_000,
  };

  it('両シナリオの手元残りが目標にほぼ一致する', () => {
    const r = designWelfareScheme(input);
    expect(r.normal.freeCash).toBeCloseTo(265_000, -2);
    expect(r.scheme.freeCash).toBeCloseTo(265_000, -2);
  });

  it('スキームは額面・社保・税が通常より低い', () => {
    const r = designWelfareScheme(input);
    expect(r.scheme.gross).toBeLessThan(r.normal.gross);
    expect(r.scheme.employeeSocialInsurance).toBeLessThan(r.normal.employeeSocialInsurance);
    expect(r.scheme.tax).toBeLessThan(r.normal.tax);
  });

  it('スキームは現物価値の分だけ従業員の実質手元残りが増える', () => {
    const r = designWelfareScheme(input);
    expect(r.scheme.inKindValue).toBe(70_000 + 7_500 + 50_000 + 30_000);
    expect(r.scheme.employeeRealValue).toBeGreaterThan(r.normal.employeeRealValue);
    expect(r.diff.employeeRealValue).toBeGreaterThan(0);
  });

  it('スキームは会社の総コストが低い', () => {
    const r = designWelfareScheme(input);
    expect(r.scheme.companyTotalCost).toBeLessThan(r.normal.companyTotalCost);
    expect(r.diff.companyTotalCost).toBeLessThan(0);
  });

  it('天引きは社宅・食事の自己負担分', () => {
    const r = designWelfareScheme(input);
    expect(r.scheme.payrollDeduction).toBe(10_000 + 7_500); // rentSelf 1万 + mealSelf 7.5千
    expect(r.normal.payrollDeduction).toBe(0);
  });

  it('差額の符号が正しい (額面・社保・税は減、実質価値は増、会社コストは減)', () => {
    const r = designWelfareScheme(input);
    expect(r.diff.gross).toBeLessThan(0);
    expect(r.diff.employeeSocialInsurance).toBeLessThan(0);
    expect(r.diff.tax).toBeLessThan(0);
    expect(r.diff.employeeRealValue).toBeGreaterThan(0);
    expect(r.diff.companyTotalCost).toBeLessThan(0);
  });

  // --- 厳密値テスト (算術変異の撃墜: 各計算式を実値で固定) ---
  it('monthlyCompensation の厳密値 (扶養なし基礎控除のみ)', () => {
    expect(monthlyCompensation(400_000)).toEqual({
      gross: 400_000,
      employeeSocialInsurance: 60_415,
      incomeTax: 10_380,
      residentTax: 19_125,
      takeHome: 310_080,
      employerSocialInsurance: 63_015,
    });
    expect(monthlyCompensation(500_000, true)).toEqual({
      gross: 500_000,
      employeeSocialInsurance: 77_750,
      incomeTax: 16_778,
      residentTax: 25_391,
      takeHome: 380_081,
      employerSocialInsurance: 81_000,
    });
  });

  it('designWelfareScheme の厳密値 (各内訳を実値で固定)', () => {
    const r = designWelfareScheme(input);
    expect(r.normal).toEqual({
      gross: 585_123,
      employeeSocialInsurance: 86_995,
      tax: 58_128,
      payrollDeduction: 0,
      netPaid: 440_000,
      freeCash: 265_000,
      inKindValue: 0,
      employeeRealValue: 265_000,
      companyTotalCost: 675_921,
    });
    expect(r.scheme).toEqual({
      gross: 360_376,
      employeeSocialInsurance: 53_102,
      tax: 24_774,
      payrollDeduction: 17_500,
      netPaid: 265_000,
      freeCash: 265_000,
      inKindValue: 157_500,
      employeeRealValue: 422_500,
      companyTotalCost: 573_320,
    });
    expect(r.diff).toEqual({
      gross: -224_747,
      employeeSocialInsurance: -33_893,
      tax: -33_354,
      employeeRealValue: 157_500,
      companyTotalCost: -102_601,
    });
  });

  it('withCare 既定は false (省略時 = false、true とは異なる)', () => {
    const omitted = designWelfareScheme(input);
    const explicitFalse = designWelfareScheme({ ...input, withCare: false });
    const explicitTrue = designWelfareScheme({ ...input, withCare: true });
    expect(omitted.scheme.gross).toBe(explicitFalse.scheme.gross);
    expect(explicitTrue.scheme.employeeSocialInsurance).not.toBe(
      explicitFalse.scheme.employeeSocialInsurance,
    );
  });

  it('会社負担が全くない設定では両シナリオがほぼ等価', () => {
    const noBenefit = {
      targetFreeCash: 250_000,
      rentTotal: 0,
      rentCompanyShare: 0,
      mealTotal: 0,
      mealCompanyShare: 0,
      childcare: 0,
      ecPoints: 0,
    };
    const r = designWelfareScheme(noBenefit);
    expect(r.scheme.inKindValue).toBe(0);
    expect(r.diff.gross).toBeCloseTo(0, -2);
  });
});

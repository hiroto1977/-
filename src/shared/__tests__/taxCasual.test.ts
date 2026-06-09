import { describe, expect, it } from 'vitest';
import {
  calcCasualIncome,
  CASUAL_INCOME_SPECIAL_DEDUCTION,
  isFinancialInstrumentMaturity,
  calcLifeInsuranceMaturity,
  calcAggregatedCasualIncome,
} from '../taxCasual';

describe('calcCasualIncome (一時所得・総合課税)', () => {
  it('applies the 50万 special deduction then halves the result', () => {
    // 満期返戻金 300万、払込保険料 250万 → 利益 50万 − 控除 50万 = 0
    const r = calcCasualIncome(3_000_000, 2_500_000);
    expect(r.specialDeduction).toBe(500_000);
    expect(r.casualIncome).toBe(0);
    expect(r.taxableAmount).toBe(0);
  });

  it('taxes half of the income above the special deduction', () => {
    // 収入 400万、経費 250万 → 利益 150万 − 控除 50万 = 100万 → ×1/2 = 50万
    const r = calcCasualIncome(4_000_000, 2_500_000);
    expect(r.specialDeduction).toBe(500_000);
    expect(r.casualIncome).toBe(1_000_000);
    expect(r.taxableAmount).toBe(500_000);
  });

  it('caps the special deduction at the profit when profit < 50万', () => {
    // 利益 30万 → 控除は 30万まで → 一時所得 0
    const r = calcCasualIncome(1_300_000, 1_000_000);
    expect(r.specialDeduction).toBe(300_000);
    expect(r.casualIncome).toBe(0);
    expect(r.taxableAmount).toBe(0);
  });

  it('defaults expenses to 0', () => {
    // 賞金 100万、経費なし → 利益 100万 − 控除 50万 = 50万 → ×1/2 = 25万
    const r = calcCasualIncome(1_000_000);
    expect(r.expenses).toBe(0);
    expect(r.casualIncome).toBe(500_000);
    expect(r.taxableAmount).toBe(250_000);
  });

  it('returns zero for no profit (expenses ≥ income)', () => {
    const r = calcCasualIncome(1_000_000, 1_200_000);
    expect(r.casualIncome).toBe(0);
    expect(r.taxableAmount).toBe(0);
    expect(r.specialDeduction).toBe(0);
  });

  it('clamps negative inputs to zero', () => {
    const r = calcCasualIncome(-100, -100);
    expect(r.grossIncome).toBe(0);
    expect(r.expenses).toBe(0);
    expect(r.taxableAmount).toBe(0);
  });

  it('rounds the half to the nearest yen', () => {
    // 利益 50万 + 1 → 控除50万 → 一時所得 1 → ×1/2 = 0.5 → round = 1 (… 0)
    // 利益 70万1円 経費0 → 一時所得 = 700001 − 500000 = 200001 → /2 = 100000.5 → 100001
    const r = calcCasualIncome(700_001, 0);
    expect(r.casualIncome).toBe(200_001);
    expect(r.taxableAmount).toBe(100_001);
  });

  it('exposes the 50万 special-deduction constant', () => {
    expect(CASUAL_INCOME_SPECIAL_DEDUCTION).toBe(500_000);
  });
});

describe('isFinancialInstrumentMaturity (金融類似商品の区分判定)', () => {
  it('is not a financial instrument when not lump-sum, regardless of years', () => {
    expect(isFinancialInstrumentMaturity(false, 1)).toBe(false);
    expect(isFinancialInstrumentMaturity(false, 100)).toBe(false);
    expect(isFinancialInstrumentMaturity(false, Infinity)).toBe(false);
  });

  it('is a financial instrument for lump-sum held 5 years or less', () => {
    expect(isFinancialInstrumentMaturity(true, 3)).toBe(true);
    expect(isFinancialInstrumentMaturity(true, 5)).toBe(true); // boundary = 5 → true
  });

  it('is NOT a financial instrument for lump-sum held more than 5 years', () => {
    expect(isFinancialInstrumentMaturity(true, 5.0001)).toBe(false); // just over boundary
    expect(isFinancialInstrumentMaturity(true, 6)).toBe(false);
    expect(isFinancialInstrumentMaturity(true, 10)).toBe(false);
  });

  it('treats a non-finite holding period for a lump-sum as held > 5 years (not split-taxed)', () => {
    // 保有年数不明 (Infinity / NaN) は控えめに「長期保有」とみなし一時所得側へ。
    expect(isFinancialInstrumentMaturity(true, Infinity)).toBe(false);
    expect(isFinancialInstrumentMaturity(true, NaN)).toBe(false);
  });
});

describe('calcLifeInsuranceMaturity (生命保険満期金の一時所得)', () => {
  it('returns null when inputs are not finite', () => {
    expect(calcLifeInsuranceMaturity(NaN, 1_000_000, false)).toBeNull();
    expect(calcLifeInsuranceMaturity(3_000_000, Infinity, false)).toBeNull();
    expect(calcLifeInsuranceMaturity(NaN, NaN, true)).toBeNull();
  });

  it('classifies a 5-year lump-sum maturity as split-taxed (not casual income)', () => {
    const r = calcLifeInsuranceMaturity(3_500_000, 3_000_000, true, 5);
    expect(r).not.toBeNull();
    expect(r!.isCasualIncome).toBe(false);
    expect(r!.casual).toBeNull();
  });

  it('treats a lump-sum maturity held over 5 years as casual income', () => {
    // 満期金 600万、払込 500万 → 利益 100万 − 控除 50万 = 50万 → ×1/2 = 25万
    const r = calcLifeInsuranceMaturity(6_000_000, 5_000_000, true, 6);
    expect(r).not.toBeNull();
    expect(r!.isCasualIncome).toBe(true);
    expect(r!.casual).not.toBeNull();
    expect(r!.casual!.casualIncome).toBe(500_000);
    expect(r!.casual!.taxableAmount).toBe(250_000);
  });

  it('treats a non-lump-sum (monthly-paid) maturity as casual income regardless of years', () => {
    // 一時払でなければ保有 3年でも一時所得。満期金 700万、払込 550万 → 利益150万 − 50万 = 100万 → ×1/2 = 50万
    const r = calcLifeInsuranceMaturity(7_000_000, 5_500_000, false, 3);
    expect(r).not.toBeNull();
    expect(r!.isCasualIncome).toBe(true);
    expect(r!.casual!.casualIncome).toBe(1_000_000);
    expect(r!.casual!.taxableAmount).toBe(500_000);
  });

  it('defaults holdingYears to Infinity (non-financial) when omitted for a lump-sum', () => {
    // holdingYears 省略 → Infinity → 一時払でも金融類似商品ではない → 一時所得。
    const r = calcLifeInsuranceMaturity(6_000_000, 5_000_000, true);
    expect(r).not.toBeNull();
    expect(r!.isCasualIncome).toBe(true);
    expect(r!.casual!.taxableAmount).toBe(250_000);
  });

  it('matches calcCasualIncome exactly for a casual-income maturity', () => {
    const r = calcLifeInsuranceMaturity(4_000_000, 2_500_000, false);
    expect(r!.casual).toEqual(calcCasualIncome(4_000_000, 2_500_000));
  });
});

describe('calcAggregatedCasualIncome (複数の一時所得の合算)', () => {
  it('returns null for an empty list', () => {
    expect(calcAggregatedCasualIncome([])).toBeNull();
  });

  it('returns null when any gross income is not finite', () => {
    expect(
      calcAggregatedCasualIncome([{ grossIncome: 1_000_000 }, { grossIncome: NaN }]),
    ).toBeNull();
  });

  it('returns null when any expense is not finite', () => {
    expect(
      calcAggregatedCasualIncome([{ grossIncome: 1_000_000, expenses: Infinity }]),
    ).toBeNull();
  });

  it('applies the 50万 special deduction once across all items', () => {
    // 賞金 60万 (経費0) + 満期益: 満期300万 払込250万 → 利益50万。合計利益 110万。
    // − 控除 50万 = 60万 → ×1/2 = 30万
    const r = calcAggregatedCasualIncome([
      { grossIncome: 600_000 },
      { grossIncome: 3_000_000, expenses: 2_500_000 },
    ]);
    expect(r).not.toBeNull();
    expect(r!.totalProfit).toBe(1_100_000);
    expect(r!.specialDeduction).toBe(500_000);
    expect(r!.casualIncome).toBe(600_000);
    expect(r!.taxableAmount).toBe(300_000);
  });

  it('deducts each item expense before aggregating (per-item loss not offset against others)', () => {
    // 件1: 収入100万 経費150万 → 利益0 (損失は他件に通算しない)。件2: 収入80万 経費0 → 利益80万。
    // 合計利益 80万 − 控除 50万 = 30万 → ×1/2 = 15万
    const r = calcAggregatedCasualIncome([
      { grossIncome: 1_000_000, expenses: 1_500_000 },
      { grossIncome: 800_000 },
    ]);
    expect(r!.totalProfit).toBe(800_000);
    expect(r!.specialDeduction).toBe(500_000);
    expect(r!.casualIncome).toBe(300_000);
    expect(r!.taxableAmount).toBe(150_000);
  });

  it('caps the special deduction at total profit when total profit < 50万 (課税0)', () => {
    // 件1: 利益20万、件2: 利益15万 → 合計35万 < 50万 → 控除35万 → 一時所得0
    const r = calcAggregatedCasualIncome([
      { grossIncome: 200_000 },
      { grossIncome: 150_000 },
    ]);
    expect(r!.totalProfit).toBe(350_000);
    expect(r!.specialDeduction).toBe(350_000);
    expect(r!.casualIncome).toBe(0);
    expect(r!.taxableAmount).toBe(0);
  });

  it('handles total profit exactly at 50万 → taxable 0', () => {
    const r = calcAggregatedCasualIncome([
      { grossIncome: 300_000 },
      { grossIncome: 200_000 },
    ]);
    expect(r!.totalProfit).toBe(500_000);
    expect(r!.specialDeduction).toBe(500_000);
    expect(r!.casualIncome).toBe(0);
    expect(r!.taxableAmount).toBe(0);
  });

  it('clamps negative inputs to zero per item', () => {
    const r = calcAggregatedCasualIncome([
      { grossIncome: -100, expenses: -50 },
      { grossIncome: 1_200_000 },
    ]);
    expect(r!.totalProfit).toBe(1_200_000);
    expect(r!.casualIncome).toBe(700_000);
    expect(r!.taxableAmount).toBe(350_000);
  });

  it('rounds the half to the nearest yen', () => {
    // 合計利益 700001 − 控除 500000 = 200001 → /2 = 100000.5 → round 100001
    const r = calcAggregatedCasualIncome([{ grossIncome: 700_001 }]);
    expect(r!.casualIncome).toBe(200_001);
    expect(r!.taxableAmount).toBe(100_001);
  });

  it('defaults expenses to 0 when omitted', () => {
    const r = calcAggregatedCasualIncome([{ grossIncome: 1_000_000 }]);
    expect(r!.totalProfit).toBe(1_000_000);
    expect(r!.casualIncome).toBe(500_000);
  });

  it('matches single-item calcCasualIncome for one entry above the deduction', () => {
    const single = calcCasualIncome(4_000_000, 2_500_000);
    const agg = calcAggregatedCasualIncome([{ grossIncome: 4_000_000, expenses: 2_500_000 }]);
    expect(agg!.casualIncome).toBe(single.casualIncome);
    expect(agg!.taxableAmount).toBe(single.taxableAmount);
    expect(agg!.specialDeduction).toBe(single.specialDeduction);
  });
});

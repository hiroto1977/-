import { describe, expect, it } from 'vitest';
import {
  SOLE_PROPRIETOR_DEDUCTION,
  businessTaxRate,
  soleProprietorDeduction,
  individualBusinessTax,
  type BusinessCategory,
} from '../taxIndividualBusiness';

describe('constants', () => {
  it('exposes the sole-proprietor deduction of 2,900,000 yen', () => {
    expect(SOLE_PROPRIETOR_DEDUCTION).toBe(2_900_000);
  });
});

describe('businessTaxRate', () => {
  it('returns 5% for category1 (第1種事業)', () => {
    expect(businessTaxRate('category1')).toBe(0.05);
  });

  it('returns 4% for category2 (第2種事業)', () => {
    expect(businessTaxRate('category2')).toBe(0.04);
  });

  it('returns 5% for category3_5pct (第3種事業 5%)', () => {
    expect(businessTaxRate('category3_5pct')).toBe(0.05);
  });

  it('returns 3% for category3_3pct (第3種事業 3%)', () => {
    expect(businessTaxRate('category3_3pct')).toBe(0.03);
  });

  it('returns 0 for nonTaxable (非課税)', () => {
    expect(businessTaxRate('nonTaxable')).toBe(0);
  });

  it('throws for an unknown category outside the whitelist', () => {
    expect(() => businessTaxRate('category4' as BusinessCategory)).toThrow(/unknown business category/);
  });
});

describe('soleProprietorDeduction', () => {
  it('returns the full 2,900,000 yen for the default 12 months', () => {
    expect(soleProprietorDeduction()).toBe(2_900_000);
  });

  it('returns the full 2,900,000 yen when 12 months is passed explicitly', () => {
    expect(soleProprietorDeduction(12)).toBe(2_900_000);
  });

  it('prorates to half (1,450,000) for 6 months', () => {
    expect(soleProprietorDeduction(6)).toBe(1_450_000);
  });

  it('prorates for 1 month with ceil rounding (2,900,000 / 12 = 241,666.67 → 241,667)', () => {
    expect(soleProprietorDeduction(1)).toBe(241_667);
  });

  it('prorates for 7 months with ceil rounding (2,900,000 × 7 / 12 = 1,691,666.67 → 1,691,667)', () => {
    expect(soleProprietorDeduction(7)).toBe(1_691_667);
  });

  it('throws for 0 months (below the lower bound)', () => {
    expect(() => soleProprietorDeduction(0)).toThrow(/businessMonths/);
  });

  it('throws for 13 months (above the upper bound)', () => {
    expect(() => soleProprietorDeduction(13)).toThrow(/businessMonths/);
  });

  it('throws for a non-integer month count', () => {
    expect(() => soleProprietorDeduction(6.5)).toThrow(/businessMonths/);
  });

  it('throws for a non-finite month count (NaN)', () => {
    expect(() => soleProprietorDeduction(Number.NaN)).toThrow(/businessMonths/);
  });

  it('throws for a non-finite month count (Infinity)', () => {
    expect(() => soleProprietorDeduction(Number.POSITIVE_INFINITY)).toThrow(/businessMonths/);
  });
});

describe('individualBusinessTax', () => {
  it('applies the 5% rate after the full deduction for category1', () => {
    // base = 10,000,000 - 2,900,000 = 7,100,000; tax = 7,100,000 × 0.05 = 355,000
    const result = individualBusinessTax({ businessIncome: 10_000_000, category: 'category1' });
    expect(result.category).toBe('category1');
    expect(result.rate).toBe(0.05);
    expect(result.taxableBase).toBe(7_100_000);
    expect(result.tax).toBe(355_000);
  });

  it('applies the 4% rate for category2', () => {
    // base = 5,000,000 - 2,900,000 = 2,100,000; tax = 2,100,000 × 0.04 = 84,000
    const result = individualBusinessTax({ businessIncome: 5_000_000, category: 'category2' });
    expect(result.rate).toBe(0.04);
    expect(result.taxableBase).toBe(2_100_000);
    expect(result.tax).toBe(84_000);
  });

  it('applies the 5% rate for category3_5pct', () => {
    // base = 4,000,000 - 2,900,000 = 1,100,000; tax = 1,100,000 × 0.05 = 55,000
    const result = individualBusinessTax({ businessIncome: 4_000_000, category: 'category3_5pct' });
    expect(result.rate).toBe(0.05);
    expect(result.taxableBase).toBe(1_100_000);
    expect(result.tax).toBe(55_000);
  });

  it('applies the 3% rate for category3_3pct', () => {
    // base = 4,000,000 - 2,900,000 = 1,100,000; tax = 1,100,000 × 0.03 = 33,000
    const result = individualBusinessTax({ businessIncome: 4_000_000, category: 'category3_3pct' });
    expect(result.rate).toBe(0.03);
    expect(result.taxableBase).toBe(1_100_000);
    expect(result.tax).toBe(33_000);
  });

  it('returns 0 tax for nonTaxable even with a positive taxable base', () => {
    const result = individualBusinessTax({ businessIncome: 10_000_000, category: 'nonTaxable' });
    expect(result.rate).toBe(0);
    expect(result.taxableBase).toBe(7_100_000);
    expect(result.tax).toBe(0);
  });

  it('clamps the taxable base to 0 when the deduction exceeds income (no tax)', () => {
    // base = max(2,000,000 - 2,900,000, 0) = 0
    const result = individualBusinessTax({ businessIncome: 2_000_000, category: 'category1' });
    expect(result.taxableBase).toBe(0);
    expect(result.tax).toBe(0);
  });

  it('clamps to 0 exactly at the deduction boundary (income == deduction)', () => {
    const result = individualBusinessTax({ businessIncome: 2_900_000, category: 'category1' });
    expect(result.taxableBase).toBe(0);
    expect(result.tax).toBe(0);
  });

  it('adds back the blue-return special deduction before applying the deduction', () => {
    // base = 2,800,000 + 650,000 - 2,900,000 = 550,000; tax = 550,000 × 0.05 = 27,500
    const result = individualBusinessTax({
      businessIncome: 2_800_000,
      blueReturnAddback: 650_000,
      category: 'category1',
    });
    expect(result.taxableBase).toBe(550_000);
    expect(result.tax).toBe(27_500);
  });

  it('subtracts carryforward deductions from the base', () => {
    // base = 10,000,000 - 1,000,000 - 2,900,000 = 6,100,000; tax = 6,100,000 × 0.05 = 305,000
    const result = individualBusinessTax({
      businessIncome: 10_000_000,
      carryforwardDeduction: 1_000_000,
      category: 'category1',
    });
    expect(result.taxableBase).toBe(6_100_000);
    expect(result.tax).toBe(305_000);
  });

  it('combines addback, carryforward and prorated deduction', () => {
    // deduction(6) = 1,450,000; base = 5,000,000 + 100,000 - 200,000 - 1,450,000 = 3,450,000
    // tax = 3,450,000 × 0.05 = 172,500
    const result = individualBusinessTax({
      businessIncome: 5_000_000,
      blueReturnAddback: 100_000,
      carryforwardDeduction: 200_000,
      category: 'category1',
      businessMonths: 6,
    });
    expect(result.taxableBase).toBe(3_450_000);
    expect(result.tax).toBe(172_500);
  });

  it('floors the tax to the nearest 100 yen (100円未満切捨)', () => {
    // base = 2,900,000 + 12,345 - 0 - 2,900,000 = 12,345; tax raw = 12,345 × 0.05 = 617.25 → floor to 600
    const result = individualBusinessTax({
      businessIncome: 2_900_000,
      blueReturnAddback: 12_345,
      category: 'category1',
    });
    expect(result.taxableBase).toBe(12_345);
    expect(result.tax).toBe(600);
  });

  it('floors a sub-100 raw tax down to 0', () => {
    // base = 1,000; raw tax = 1,000 × 0.05 = 50 → floor to 0
    const result = individualBusinessTax({
      businessIncome: 2_900_000,
      blueReturnAddback: 1_000,
      category: 'category1',
    });
    expect(result.taxableBase).toBe(1_000);
    expect(result.tax).toBe(0);
  });

  it('throws when businessIncome is negative', () => {
    expect(() => individualBusinessTax({ businessIncome: -1, category: 'category1' })).toThrow(
      /businessIncome/,
    );
  });

  it('throws when businessIncome is non-finite', () => {
    expect(() =>
      individualBusinessTax({ businessIncome: Number.NaN, category: 'category1' }),
    ).toThrow(/businessIncome/);
  });

  it('throws when blueReturnAddback is negative', () => {
    expect(() =>
      individualBusinessTax({ businessIncome: 1_000, blueReturnAddback: -1, category: 'category1' }),
    ).toThrow(/blueReturnAddback/);
  });

  it('throws when carryforwardDeduction is negative', () => {
    expect(() =>
      individualBusinessTax({
        businessIncome: 1_000,
        carryforwardDeduction: -1,
        category: 'category1',
      }),
    ).toThrow(/carryforwardDeduction/);
  });

  it('throws when category is outside the whitelist', () => {
    expect(() =>
      individualBusinessTax({ businessIncome: 1_000, category: 'bogus' as BusinessCategory }),
    ).toThrow(/unknown business category/);
  });

  it('throws when businessMonths is outside 1..12', () => {
    expect(() =>
      individualBusinessTax({ businessIncome: 1_000, category: 'category1', businessMonths: 0 }),
    ).toThrow(/businessMonths/);
  });
});

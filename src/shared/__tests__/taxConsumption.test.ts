import { describe, expect, it } from 'vitest';
import {
  calcSimplifiedConsumptionTax,
  calcStandardConsumptionTax,
  calcTwentyPercentSpecial,
  compareConsumptionTaxMethods,
  DEEMED_PURCHASE_RATES,
  TWENTY_PERCENT_RATE,
} from '../taxConsumption';

describe('calcSimplifiedConsumptionTax (簡易課税)', () => {
  it('returns 0 for non-positive sales', () => {
    expect(calcSimplifiedConsumptionTax(0, 'retail')).toBe(0);
    expect(calcSimplifiedConsumptionTax(-100, 'retail')).toBe(0);
  });

  it('applies the deemed-purchase rate per business type', () => {
    // 売上1,000万 × 10% = 100万売上税額
    // 第1種 卸売 90% → 納付 100万 × 10% = 10万
    expect(calcSimplifiedConsumptionTax(10_000_000, 'wholesale')).toBe(100_000);
    // 第6種 不動産 40% → 納付 100万 × 60% = 60万
    expect(calcSimplifiedConsumptionTax(10_000_000, 'real-estate')).toBe(600_000);
    expect(DEEMED_PURCHASE_RATES.service).toBe(0.5);
  });
});

describe('calcStandardConsumptionTax (本則課税)', () => {
  it('computes sales tax minus purchase tax across rates', () => {
    // 売上: 標準1,000万×10% + 軽減500万×8% = 100万 + 40万 = 140万
    // 仕入: 標準800万×10% + 軽減300万×8% = 80万 + 24万 = 104万
    // 納付 = 140万 − 104万 = 36万
    const r = calcStandardConsumptionTax(
      { standard: 10_000_000, reduced: 5_000_000 },
      { standard: 8_000_000, reduced: 3_000_000 },
    );
    expect(r).toBe(360_000);
  });

  it('returns a negative amount (refund) when purchases exceed sales', () => {
    const r = calcStandardConsumptionTax({ standard: 1_000_000, reduced: 0 }, { standard: 2_000_000, reduced: 0 });
    expect(r).toBeLessThan(0);
  });
});

describe('calcTwentyPercentSpecial (2割特例)', () => {
  it('charges 20% of the sales tax', () => {
    // 売上1,000万×10% = 100万売上税額 → 20% = 20万
    expect(calcTwentyPercentSpecial(10_000_000)).toBe(200_000);
    expect(TWENTY_PERCENT_RATE).toBe(0.2);
  });

  it('returns 0 for non-positive sales', () => {
    expect(calcTwentyPercentSpecial(0)).toBe(0);
    expect(calcTwentyPercentSpecial(-50)).toBe(0);
  });
});

describe('compareConsumptionTaxMethods', () => {
  it('picks the cheapest method (2割特例 best for service with few purchases)', () => {
    // service 第5種 (50%): simplified = 100万×50% = 50万
    // 2割特例 = 100万×20% = 20万 ← cheapest
    // 本則 (仕入わずか): 100万 − 10万 = 90万
    const c = compareConsumptionTaxMethods(10_000_000, { standard: 1_000_000, reduced: 0 }, 'service');
    expect(c.twentyPercent).toBe(200_000);
    expect(c.simplified).toBe(500_000);
    expect(c.standard).toBe(900_000);
    expect(c.best).toBe('twenty-percent');
  });

  it('picks 本則 when purchases are large', () => {
    // 仕入が多い → 本則が有利
    const c = compareConsumptionTaxMethods(10_000_000, { standard: 9_500_000, reduced: 0 }, 'wholesale');
    // standard = 100万 − 95万 = 5万 ← cheapest
    expect(c.standard).toBe(50_000);
    expect(c.best).toBe('standard');
  });
});

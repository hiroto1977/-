import { describe, expect, it } from 'vitest';
import {
  compareDividendMethods,
  dividendMarginalRate,
  DIVIDEND_WITHHOLDING_INCOME_RATE,
  DIVIDEND_WITHHOLDING_RESIDENT_RATE,
} from '../taxDividend';

describe('compareDividendMethods', () => {
  it('withholding and separate methods have identical tax (20.315%)', () => {
    const c = compareDividendMethods(1_000_000, 5_000_000);
    expect(c.withholding.totalTax).toBe(c.separate.totalTax);
    expect(c.withholding.incomeTax).toBe(Math.round(1_000_000 * DIVIDEND_WITHHOLDING_INCOME_RATE));
    expect(c.withholding.residentTax).toBe(Math.round(1_000_000 * DIVIDEND_WITHHOLDING_RESIDENT_RATE));
  });

  it('prefers aggregate (総合課税) at low income where the dividend credit wins', () => {
    // 課税所得が低い (例: 配当以外 100万) → 総合課税 5%+配当控除 で 20.315% より軽い
    const c = compareDividendMethods(500_000, 1_000_000);
    expect(c.best).toBe('aggregate');
    expect(c.aggregate.totalTax).toBeLessThan(c.withholding.totalTax);
  });

  it('prefers withholding at high income where progressive rates exceed 20.315%', () => {
    // 配当以外が 2,000万 → 総合課税の限界税率 40% は配当控除を引いても 20.315% 超
    const c = compareDividendMethods(1_000_000, 20_000_000);
    expect(c.best).toBe('withholding');
    expect(c.aggregate.totalTax).toBeGreaterThan(c.withholding.totalTax);
  });

  it('returns all zeros for a zero dividend', () => {
    const c = compareDividendMethods(0, 5_000_000);
    expect(c.withholding.totalTax).toBe(0);
    expect(c.aggregate.totalTax).toBe(0);
    expect(c.best).toBe('withholding');
  });

  it('clamps a negative dividend to zero', () => {
    const c = compareDividendMethods(-100, 5_000_000);
    expect(c.withholding.totalTax).toBe(0);
  });

  it('breaks ties in favor of withholding (simpler)', () => {
    // contrived: zero dividend → all methods 0 → withholding chosen
    const c = compareDividendMethods(0, 0);
    expect(c.best).toBe('withholding');
  });

  it('uses the kind to vary the dividend credit (mutual-fund vs stock)', () => {
    // 投信は配当控除率が株式の半分 → 総合課税が株式より不利 (税額が大きい)
    const stock = compareDividendMethods(500_000, 1_000_000, 'stock');
    const fund = compareDividendMethods(500_000, 1_000_000, 'mutual-fund');
    expect(fund.aggregate.totalTax).toBeGreaterThanOrEqual(stock.aggregate.totalTax);
  });
});

describe('dividendMarginalRate', () => {
  it('returns the bracket rate at the combined income level', () => {
    // 配当以外 500万 + 配当 100万 = 600万 → 20% ブラケット
    expect(dividendMarginalRate(5_000_000, 1_000_000)).toBe(0.2);
    expect(dividendMarginalRate(0, 0)).toBe(0);
  });
});

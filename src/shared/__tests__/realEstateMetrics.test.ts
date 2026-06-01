import { describe, expect, it } from 'vitest';
import { calcRealEstateYield, calcRealEstateLeverage } from '../realEstateMetrics';

describe('calcRealEstateYield', () => {
  it('computes the gross yield (annual rent / price)', () => {
    // 月16.8万 × 12 = 201.6万 / 4,200万 = 4.8%
    const r = calcRealEstateYield(168_000, 42_000_000);
    expect(r.annualGrossRent).toBe(2_016_000);
    expect(r.grossYieldPct).toBe(4.8);
    // no expenses/occupancy → net equals gross
    expect(r.netYieldPct).toBe(4.8);
  });

  it('reflects occupancy and expenses in the net yield', () => {
    // 入居率75%、年間経費16.8万 → 純収入 = 201.6万×0.75 − 16.8万 = 151.2万 − 16.8万 = 134.4万
    const r = calcRealEstateYield(168_000, 42_000_000, 0.75, 168_000);
    expect(r.annualNetIncome).toBe(1_344_000);
    expect(r.netYieldPct).toBe(3.2); // 1,344,000 / 42,000,000 × 100 = 3.2
  });

  it('includes acquisition cost in the net-yield denominator', () => {
    const r = calcRealEstateYield(168_000, 42_000_000, 1, 0, 3_000_000);
    // gross uses price only; net uses price + acquisition cost
    expect(r.grossYieldPct).toBe(4.8);
    expect(r.netYieldPct).toBe(Math.round((2_016_000 / 45_000_000) * 100 * 100) / 100);
  });

  it('guards against zero or negative purchase price', () => {
    const r = calcRealEstateYield(168_000, 0);
    expect(r.grossYieldPct).toBe(0);
    expect(r.netYieldPct).toBe(0);
    expect(r.annualGrossRent).toBe(2_016_000);
  });

  it('clamps occupancy to [0,1] and negatives to zero', () => {
    expect(calcRealEstateYield(168_000, 42_000_000, 2).netYieldPct).toBe(4.8); // occ clamped to 1
    expect(calcRealEstateYield(-100, 42_000_000).annualGrossRent).toBe(0); // rent clamped to 0
  });

  it('allows a negative net income when expenses exceed rent', () => {
    const r = calcRealEstateYield(100_000, 42_000_000, 1, 2_000_000);
    // 120万 − 200万 = −80万
    expect(r.annualNetIncome).toBe(-800_000);
    expect(r.netYieldPct).toBeLessThan(0);
  });
});

describe('calcRealEstateLeverage (CCR・イールドギャップ)', () => {
  it('computes cash-on-cash return = post-debt cashflow / own equity', () => {
    // 純収入200万 − 返済120万 = 手残り80万; 自己資金1,000万 → CCR 8%
    const r = calcRealEstateLeverage(2_000_000, 10_000_000, 1_200_000, 5.0, 2.0);
    expect(r.annualCashflow).toBe(800_000);
    expect(r.cashOnCashReturnPct).toBe(8);
  });

  it('computes the yield gap = net yield − loan rate', () => {
    const r = calcRealEstateLeverage(2_000_000, 10_000_000, 1_200_000, 5.0, 2.0);
    expect(r.yieldGapPct).toBe(3); // 5.0 − 2.0
  });

  it('flags negative leverage when the loan rate exceeds the net yield', () => {
    const r = calcRealEstateLeverage(1_000_000, 5_000_000, 800_000, 1.5, 3.0);
    expect(r.yieldGapPct).toBe(-1.5);
  });

  it('guards zero own equity (CCR 0, no division by zero)', () => {
    const r = calcRealEstateLeverage(2_000_000, 0, 1_200_000, 5.0, 2.0);
    expect(r.cashOnCashReturnPct).toBe(0);
  });

  it('clamps negative debt service to zero', () => {
    const r = calcRealEstateLeverage(2_000_000, 10_000_000, -100, 5.0, 2.0);
    expect(r.annualDebtService).toBe(0);
    expect(r.annualCashflow).toBe(2_000_000);
  });

  it('produces negative cashflow when debt service exceeds net income', () => {
    const r = calcRealEstateLeverage(1_000_000, 5_000_000, 1_500_000, 3.0, 2.0);
    expect(r.annualCashflow).toBe(-500_000);
    expect(r.cashOnCashReturnPct).toBe(-10); // -500k / 5M
  });
});

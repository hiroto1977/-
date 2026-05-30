import { describe, expect, it } from 'vitest';
import { calcCasualIncome, CASUAL_INCOME_SPECIAL_DEDUCTION } from '../taxCasual';

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

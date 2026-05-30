import { describe, expect, it } from 'vitest';
import {
  calcPublicPensionDeduction,
  calcPublicPensionIncome,
  PENSION_DEDUCTION_MIN_UNDER65,
  PENSION_DEDUCTION_MIN_OVER65,
} from '../taxPublicPension';

describe('calcPublicPensionDeduction', () => {
  it('returns 0 for no pension income', () => {
    expect(calcPublicPensionDeduction(0, true)).toBe(0);
    expect(calcPublicPensionDeduction(-100, false)).toBe(0);
  });

  it('applies the minimum deduction within the low bracket (under 65)', () => {
    // ≤130万 → 60万
    expect(calcPublicPensionDeduction(1_000_000, false)).toBe(600_000);
    expect(calcPublicPensionDeduction(1_300_000, false)).toBe(PENSION_DEDUCTION_MIN_UNDER65);
  });

  it('applies the higher minimum for 65+', () => {
    // ≤330万 → 110万
    expect(calcPublicPensionDeduction(3_000_000, true)).toBe(1_100_000);
    expect(calcPublicPensionDeduction(3_300_000, true)).toBe(PENSION_DEDUCTION_MIN_OVER65);
  });

  it('uses the common speed-table formula above the low bracket', () => {
    // 400万 (both ages, since >330万 and >130万): 400万×25%+27.5万 = 127.5万
    expect(calcPublicPensionDeduction(4_000_000, false)).toBe(Math.round(4_000_000 * 0.25 + 275_000));
    expect(calcPublicPensionDeduction(4_000_000, true)).toBe(Math.round(4_000_000 * 0.25 + 275_000));
  });

  it('handles the upper brackets and cap', () => {
    // 500万: ×15%+68.5万
    expect(calcPublicPensionDeduction(5_000_000, true)).toBe(Math.round(5_000_000 * 0.15 + 685_000));
    // 900万: ×5%+145.5万
    expect(calcPublicPensionDeduction(9_000_000, true)).toBe(Math.round(9_000_000 * 0.05 + 1_455_000));
    // >1000万: cap 195.5万
    expect(calcPublicPensionDeduction(12_000_000, true)).toBe(1_955_000);
  });

  it('differs between ages only in the low bracket', () => {
    // 200万: under65 → 200万×25%+27.5万; over65 → 110万 (still in ≤330万 band)
    expect(calcPublicPensionDeduction(2_000_000, false)).toBe(Math.round(2_000_000 * 0.25 + 275_000));
    expect(calcPublicPensionDeduction(2_000_000, true)).toBe(1_100_000);
  });
});

describe('calcPublicPensionIncome', () => {
  it('computes taxable pension income = income − deduction', () => {
    // 65歳以上, 300万 → 控除110万 → 雑所得190万
    const r = calcPublicPensionIncome(3_000_000, true);
    expect(r.deduction).toBe(1_100_000);
    expect(r.taxableIncome).toBe(1_900_000);
  });

  it('never goes negative when the deduction exceeds income', () => {
    // 65歳以上, 80万 → 控除110万 > 収入 → 雑所得0
    const r = calcPublicPensionIncome(800_000, true);
    expect(r.taxableIncome).toBe(0);
  });
});

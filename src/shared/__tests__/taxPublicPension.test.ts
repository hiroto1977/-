import { describe, expect, it } from 'vitest';
import {
  calcPublicPensionDeduction,
  calcPublicPensionIncome,
  calcPublicPensionDeductionWithOtherIncome,
  calcPublicPensionIncomeWithOtherIncome,
  classifyOtherIncome,
  PENSION_DEDUCTION_MIN_UNDER65,
  PENSION_DEDUCTION_MIN_OVER65,
  OTHER_INCOME_TIER1,
  OTHER_INCOME_TIER2,
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

describe('classifyOtherIncome', () => {
  it('classifies the ≤1,000万 band as le10m (inclusive boundary)', () => {
    expect(classifyOtherIncome(0)).toBe('le10m');
    expect(classifyOtherIncome(9_999_999)).toBe('le10m');
    // 境界 1,000万ちょうどは le10m (≤)。1円超で 10mTo20m。
    expect(classifyOtherIncome(OTHER_INCOME_TIER1)).toBe('le10m');
    expect(classifyOtherIncome(OTHER_INCOME_TIER1 + 1)).toBe('10mTo20m');
  });

  it('classifies the 1,000万超〜2,000万 band as 10mTo20m (inclusive upper boundary)', () => {
    expect(classifyOtherIncome(15_000_000)).toBe('10mTo20m');
    // 境界 2,000万ちょうどは 10mTo20m (≤)。1円超で gt20m。
    expect(classifyOtherIncome(OTHER_INCOME_TIER2)).toBe('10mTo20m');
    expect(classifyOtherIncome(OTHER_INCOME_TIER2 + 1)).toBe('gt20m');
  });

  it('classifies above 2,000万 as gt20m', () => {
    expect(classifyOtherIncome(25_000_000)).toBe('gt20m');
  });

  it('guards non-finite / negative inputs to the most favourable le10m band', () => {
    expect(classifyOtherIncome(NaN)).toBe('le10m');
    expect(classifyOtherIncome(Infinity)).toBe('le10m');
    expect(classifyOtherIncome(-Infinity)).toBe('le10m');
    expect(classifyOtherIncome(-5_000_000)).toBe('le10m');
  });

  it('exposes the two tier constants', () => {
    expect(OTHER_INCOME_TIER1).toBe(10_000_000);
    expect(OTHER_INCOME_TIER2).toBe(20_000_000);
  });
});

describe('calcPublicPensionDeductionWithOtherIncome', () => {
  it('equals the base table when other income ≤ 1,000万 (no reduction)', () => {
    // 65歳以上, 300万, 他所得500万 → 110万 (基本表どおり)
    expect(calcPublicPensionDeductionWithOtherIncome(3_000_000, true, 5_000_000)).toBe(1_100_000);
    // 65歳未満, 400万, 他所得0 → 基本式どおり 127.5万
    expect(calcPublicPensionDeductionWithOtherIncome(4_000_000, false, 0)).toBe(
      Math.round(4_000_000 * 0.25 + 275_000),
    );
    // 境界 1,000万ちょうどはまだ減額なし。
    expect(calcPublicPensionDeductionWithOtherIncome(3_000_000, true, OTHER_INCOME_TIER1)).toBe(1_100_000);
  });

  it('reduces the deduction by 10万 when other income is 1,000万超2,000万以下', () => {
    // 65歳以上 最低控除: 110万 → 100万
    expect(calcPublicPensionDeductionWithOtherIncome(3_000_000, true, 15_000_000)).toBe(1_000_000);
    // 65歳未満 最低控除: 60万 → 50万
    expect(calcPublicPensionDeductionWithOtherIncome(1_000_000, false, 15_000_000)).toBe(500_000);
    // 速算式区分でも一律 −10万: 65歳以上 400万 → 127.5万 − 10万 = 117.5万
    expect(calcPublicPensionDeductionWithOtherIncome(4_000_000, true, 15_000_000)).toBe(
      Math.round(4_000_000 * 0.25 + 275_000) - 100_000,
    );
    // 上限 195.5万 → 185.5万
    expect(calcPublicPensionDeductionWithOtherIncome(12_000_000, true, 15_000_000)).toBe(1_855_000);
    // ちょうど 2,000万 はまだ 10mTo20m 区分 (−10万)。
    expect(calcPublicPensionDeductionWithOtherIncome(3_000_000, true, OTHER_INCOME_TIER2)).toBe(1_000_000);
  });

  it('reduces the deduction by 20万 when other income is 2,000万超', () => {
    // 65歳以上 最低控除: 110万 → 90万
    expect(calcPublicPensionDeductionWithOtherIncome(3_000_000, true, 25_000_000)).toBe(900_000);
    // 65歳未満 最低控除: 60万 → 40万
    expect(calcPublicPensionDeductionWithOtherIncome(1_000_000, false, 25_000_000)).toBe(400_000);
    // 上限 195.5万 → 175.5万
    expect(calcPublicPensionDeductionWithOtherIncome(12_000_000, true, 25_000_000)).toBe(1_755_000);
    // 2,000万 + 1円 から gt20m。
    expect(calcPublicPensionDeductionWithOtherIncome(3_000_000, true, OTHER_INCOME_TIER2 + 1)).toBe(900_000);
  });

  it('returns 0 (and never negative) when there is no pension income, regardless of other income', () => {
    expect(calcPublicPensionDeductionWithOtherIncome(0, true, 25_000_000)).toBe(0);
    expect(calcPublicPensionDeductionWithOtherIncome(-100, false, 15_000_000)).toBe(0);
  });

  it('keeps the 65歳 age boundary intact under reduction', () => {
    // 200万: under65 は速算式 (200万×25%+27.5万 −10万), over65 は最低控除 (110万 −10万 = 100万)
    expect(calcPublicPensionDeductionWithOtherIncome(2_000_000, false, 15_000_000)).toBe(
      Math.round(2_000_000 * 0.25 + 275_000) - 100_000,
    );
    expect(calcPublicPensionDeductionWithOtherIncome(2_000_000, true, 15_000_000)).toBe(1_000_000);
  });

  it('guards non-finite other income to the no-reduction (le10m) path', () => {
    expect(calcPublicPensionDeductionWithOtherIncome(3_000_000, true, NaN)).toBe(1_100_000);
  });
});

describe('calcPublicPensionIncomeWithOtherIncome', () => {
  it('computes taxable income with the reduced deduction', () => {
    // 65歳以上, 年金300万, 他所得1,500万 → 控除100万 → 雑所得200万
    const r = calcPublicPensionIncomeWithOtherIncome(3_000_000, true, 15_000_000);
    expect(r.deduction).toBe(1_000_000);
    expect(r.taxableIncome).toBe(2_000_000);
  });

  it('matches the base helper when other income ≤ 1,000万', () => {
    const r = calcPublicPensionIncomeWithOtherIncome(3_000_000, true, 5_000_000);
    expect(r.deduction).toBe(1_100_000);
    expect(r.taxableIncome).toBe(1_900_000);
  });

  it('never goes negative even with a reduced deduction', () => {
    // 年金80万, 他所得2,500万 → 控除90万 > 収入 → 雑所得0
    const r = calcPublicPensionIncomeWithOtherIncome(800_000, true, 25_000_000);
    expect(r.taxableIncome).toBe(0);
  });
});

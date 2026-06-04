import { describe, expect, it } from 'vitest';
import {
  straightLineAnnual,
  straightLineSchedule,
  decliningBalanceSchedule,
  classifySmallAsset,
} from '../depreciation';

describe('straightLineAnnual', () => {
  it('divides acquisition cost by useful life', () => {
    expect(straightLineAnnual(1_000_000, 5)).toBe(200_000);
  });
  it('returns 0 for non-positive inputs', () => {
    expect(straightLineAnnual(0, 5)).toBe(0);
    expect(straightLineAnnual(1_000_000, 0)).toBe(0);
    expect(straightLineAnnual(-1_000, 5)).toBe(0); // 負値は早期 return (計算経路は負)
  });
});

describe('straightLineSchedule', () => {
  it('depreciates evenly and leaves a 1-yen memo value in the final year', () => {
    const s = straightLineSchedule(1_000_000, 5);
    expect(s).toHaveLength(5);
    expect(s.slice(0, 4).map((r) => r.depreciation)).toEqual([200_000, 200_000, 200_000, 200_000]);
    expect(s[4]!.depreciation).toBe(199_999); // 200,000 - 1 (memo)
    expect(s[4]!.bookValue).toBe(1);
    const total = s.reduce((sum, r) => sum + r.depreciation, 0);
    expect(total).toBe(999_999);
  });

  it('final-year memo differs from the even amount when rounding leaves >1 yen', () => {
    // 12 ÷ 5 → annual=2。4年で 8 償却 → 残4。最終年は備忘1円のため 3 (=book−1)、
    // 均等 (min(annual, book−1)=2) とは異なる。y===usefulLife 分岐と book−1 を kill。
    const s = straightLineSchedule(12, 5);
    expect(s.map((r) => [r.depreciation, r.bookValue])).toEqual([
      [2, 10], [2, 8], [2, 6], [2, 4], [3, 1],
    ]);
  });

  it('returns [] for non-positive cost / life (loop yields [])', () => {
    expect(straightLineSchedule(0, 5)).toEqual([]); // cost=0 は計算経路だと 0 行が出る
    expect(straightLineSchedule(-100, 5)).toEqual([]);
    expect(straightLineSchedule(1_000, 0)).toEqual([]);
  });
});

describe('decliningBalanceSchedule (200% declining balance)', () => {
  it('applies book-value × rate then switches to even depreciation, ending at 1 yen', () => {
    const s = decliningBalanceSchedule(1_000_000, 5, 2); // rate 0.4
    expect(s.map((r) => r.depreciation)).toEqual([400_000, 240_000, 144_000, 108_000, 107_999]);
    expect(s[4]!.bookValue).toBe(1);
    expect(s.reduce((sum, r) => sum + r.depreciation, 0)).toBe(999_999);
  });

  it('front-loads depreciation relative to the straight-line method', () => {
    const db = decliningBalanceSchedule(1_000_000, 5);
    const sl = straightLineSchedule(1_000_000, 5);
    expect(db[0]!.depreciation).toBeGreaterThan(sl[0]!.depreciation);
  });

  it('switches to even depreciation and caps at book−1 (life 4, mult 2)', () => {
    // rate=0.5。y3 で declining(125,000)=even(125,000) の同値。最終年は備忘1円。
    const s = decliningBalanceSchedule(1_000_000, 4, 2);
    expect(s.map((r) => [r.depreciation, r.bookValue])).toEqual([
      [500_000, 500_000], [250_000, 250_000], [125_000, 125_000], [124_999, 1],
    ]);
    expect(s.reduce((sum, r) => sum + r.depreciation, 0)).toBe(999_999);
  });

  it('caps the declining amount at book−1 with a high multiplier', () => {
    // mult=4, life=2 → rate=2。1年目の定率額 200万 は book−1 (999,999) で頭打ち。
    // Math.min(dep, book−1) の cap が binding する経路を踏み、cap 系 mutant を kill。
    const s = decliningBalanceSchedule(1_000_000, 2, 4);
    expect(s.map((r) => [r.depreciation, r.bookValue])).toEqual([[999_999, 1], [0, 1]]);
  });

  it('returns [] for non-positive cost / life', () => {
    expect(decliningBalanceSchedule(0, 5)).toEqual([]);
    expect(decliningBalanceSchedule(-100, 5)).toEqual([]);
    expect(decliningBalanceSchedule(1_000, 0)).toEqual([]);
  });
});

describe('classifySmallAsset', () => {
  it('classifies by acquisition-cost thresholds', () => {
    expect(classifySmallAsset(90_000)).toBe('immediate');
    expect(classifySmallAsset(150_000)).toBe('lump-3year');
    expect(classifySmallAsset(250_000)).toBe('sme-special');
    expect(classifySmallAsset(300_000)).toBe('normal');
    expect(classifySmallAsset(500_000)).toBe('normal');
  });

  it('treats the boundaries exclusively (10万/20万/30万)', () => {
    expect(classifySmallAsset(100_000)).toBe('lump-3year');
    expect(classifySmallAsset(200_000)).toBe('sme-special');
  });
});

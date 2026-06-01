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

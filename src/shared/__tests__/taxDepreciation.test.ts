import { describe, expect, it } from 'vitest';
import {
  depreciationRate,
  isImmediateExpense,
  straightLineDepreciation,
  decliningBalanceDepreciation,
  type DepreciationRow,
} from '../taxDepreciation';

/** スケジュールを [opening, depreciation, closing, accumulated] の行列に畳む照合ヘルパ。 */
function rows(s: readonly DepreciationRow[]): number[][] {
  return s.map((r) => [r.year, r.opening, r.depreciation, r.closing, r.accumulated]);
}

describe('depreciationRate', () => {
  it('returns 1/n rounded up at the 4th decimal for life 2', () => {
    expect(depreciationRate(2)).toBe(0.5);
  });

  it('returns 0.2 for life 5', () => {
    expect(depreciationRate(5)).toBe(0.2);
  });

  it('returns 0.1 for life 10', () => {
    expect(depreciationRate(10)).toBe(0.1);
  });

  it('rounds 1/3 up to 0.334', () => {
    expect(depreciationRate(3)).toBe(0.334);
  });

  it('rounds 1/7 up to 0.143', () => {
    expect(depreciationRate(7)).toBe(0.143);
  });

  it('rounds 1/6 up to 0.167', () => {
    // 1/6 = 0.16666… → ceil at 3rd decimal → 0.167
    expect(depreciationRate(6)).toBe(0.167);
  });

  it('returns 1 for life 1', () => {
    expect(depreciationRate(1)).toBe(1);
  });

  it('throws on zero useful life', () => {
    expect(() => depreciationRate(0)).toThrow('耐用年数は 1 以上の整数で指定してください: 0');
  });

  it('throws on negative useful life', () => {
    expect(() => depreciationRate(-3)).toThrow('耐用年数は 1 以上の整数で指定してください: -3');
  });

  it('throws on non-integer useful life', () => {
    expect(() => depreciationRate(2.5)).toThrow('耐用年数は 1 以上の整数で指定してください: 2.5');
  });
});

describe('isImmediateExpense', () => {
  it('is true just below 100,000 (99,999)', () => {
    expect(isImmediateExpense(99_999)).toBe(true);
  });

  it('is false exactly at 100,000', () => {
    expect(isImmediateExpense(100_000)).toBe(false);
  });

  it('is true at 0', () => {
    expect(isImmediateExpense(0)).toBe(true);
  });

  it('is true at 50,000', () => {
    expect(isImmediateExpense(50_000)).toBe(true);
  });

  it('is false at 150,000', () => {
    expect(isImmediateExpense(150_000)).toBe(false);
  });

  it('throws on negative cost', () => {
    expect(() => isImmediateExpense(-1)).toThrow('取得価額は 0 以上で指定してください: -1');
  });

  it('throws on non-finite cost', () => {
    expect(() => isImmediateExpense(Number.POSITIVE_INFINITY)).toThrow(
      '取得価額は 0 以上で指定してください',
    );
  });
});

describe('straightLineDepreciation — full-year acquisition', () => {
  it('depreciates evenly over the useful life and leaves a 1-yen memo value', () => {
    const s = straightLineDepreciation({ acquisitionCost: 1_000_000, usefulLifeYears: 5 });
    expect(rows(s)).toEqual([
      [1, 1_000_000, 200_000, 800_000, 200_000],
      [2, 800_000, 200_000, 600_000, 400_000],
      [3, 600_000, 200_000, 400_000, 600_000],
      [4, 400_000, 200_000, 200_000, 800_000],
      [5, 200_000, 199_999, 1, 999_999],
    ]);
  });

  it('handles a 2-year life leaving the memo value', () => {
    const s = straightLineDepreciation({ acquisitionCost: 600_000, usefulLifeYears: 2 });
    expect(rows(s)).toEqual([
      [1, 600_000, 300_000, 300_000, 300_000],
      [2, 300_000, 299_999, 1, 599_999],
    ]);
  });

  it('handles a 10-year life ending at exactly 1 yen', () => {
    const s = straightLineDepreciation({ acquisitionCost: 1_000_000, usefulLifeYears: 10 });
    expect(s).toHaveLength(10);
    expect(s[9]!.closing).toBe(1);
    expect(s[9]!.accumulated).toBe(999_999);
    expect(s[8]!.depreciation).toBe(100_000);
    expect(s[9]!.depreciation).toBe(99_999);
  });

  it('final closing book value is always 1 yen (memo value)', () => {
    const s = straightLineDepreciation({ acquisitionCost: 1_000_000, usefulLifeYears: 5 });
    expect(s[s.length - 1]!.closing).toBe(1);
  });

  it('accumulated equals acquisition cost minus 1 in the last row', () => {
    const s = straightLineDepreciation({ acquisitionCost: 1_000_000, usefulLifeYears: 5 });
    expect(s[s.length - 1]!.accumulated).toBe(999_999);
  });
});

describe('straightLineDepreciation — mid-year acquisition (proration)', () => {
  it('prorates the first year for an October acquisition (3 months / 12)', () => {
    const s = straightLineDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 5,
      acquisitionMonth: 10,
      fiscalYearEndMonth: 12,
    });
    expect(rows(s)).toEqual([
      [1, 1_000_000, 50_000, 950_000, 50_000],
      [2, 950_000, 200_000, 750_000, 250_000],
      [3, 750_000, 200_000, 550_000, 450_000],
      [4, 550_000, 200_000, 350_000, 650_000],
      [5, 350_000, 200_000, 150_000, 850_000],
      [6, 150_000, 149_999, 1, 999_999],
    ]);
  });

  it('a January acquisition with December year-end depreciates a full 12 months', () => {
    const s = straightLineDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 5,
      acquisitionMonth: 1,
      fiscalYearEndMonth: 12,
    });
    expect(s[0]!.depreciation).toBe(200_000);
    expect(s).toHaveLength(5);
  });

  it('a December acquisition with December year-end depreciates only 1 month in year 1', () => {
    const s = straightLineDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 5,
      acquisitionMonth: 12,
      fiscalYearEndMonth: 12,
    });
    // 200,000 × 1/12 = 16,667 (rounded).
    expect(s[0]!.depreciation).toBe(16_667);
    // Proration pushes the schedule one extra year to reach the memo value.
    expect(s).toHaveLength(6);
    expect(s[5]!.closing).toBe(1);
  });

  it('handles a fiscal year that wraps the calendar (March year-end, April acquisition = 12 months)', () => {
    const s = straightLineDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 5,
      acquisitionMonth: 4,
      fiscalYearEndMonth: 3,
    });
    expect(s[0]!.depreciation).toBe(200_000);
  });

  it('handles a March year-end with January acquisition (3 months)', () => {
    const s = straightLineDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 5,
      acquisitionMonth: 1,
      fiscalYearEndMonth: 3,
    });
    expect(s[0]!.depreciation).toBe(50_000);
  });
});

describe('straightLineDepreciation — invariants', () => {
  it('keeps accumulated monotonically non-decreasing', () => {
    const s = straightLineDepreciation({ acquisitionCost: 730_000, usefulLifeYears: 7 });
    for (let i = 1; i < s.length; i += 1) {
      expect(s[i]!.accumulated).toBeGreaterThanOrEqual(s[i - 1]!.accumulated);
    }
  });

  it('keeps closing book value monotonically non-increasing toward 1', () => {
    const s = straightLineDepreciation({ acquisitionCost: 730_000, usefulLifeYears: 7 });
    for (let i = 1; i < s.length; i += 1) {
      expect(s[i]!.closing).toBeLessThanOrEqual(s[i - 1]!.closing);
    }
    expect(s[s.length - 1]!.closing).toBe(1);
  });

  it('closing equals opening minus depreciation for every row', () => {
    const s = straightLineDepreciation({ acquisitionCost: 555_555, usefulLifeYears: 4 });
    for (const r of s) {
      expect(r.closing).toBe(r.opening - r.depreciation);
    }
  });

  it('accumulated equals the running sum of depreciation', () => {
    const s = straightLineDepreciation({ acquisitionCost: 555_555, usefulLifeYears: 4 });
    let sum = 0;
    for (const r of s) {
      sum += r.depreciation;
      expect(r.accumulated).toBe(sum);
    }
  });

  it('returns an empty schedule for acquisition cost of 1 yen or less', () => {
    expect(straightLineDepreciation({ acquisitionCost: 1, usefulLifeYears: 5 })).toEqual([]);
    expect(straightLineDepreciation({ acquisitionCost: 0, usefulLifeYears: 5 })).toEqual([]);
  });

  it('writes off a tiny asset whose annual amount rounds to zero in one year', () => {
    // 2 × 0.2 = 0.4 → annual rounds to 0; the schedule still depreciates to the 1-yen memo.
    const s = straightLineDepreciation({ acquisitionCost: 2, usefulLifeYears: 5 });
    expect(rows(s)).toEqual([[1, 2, 1, 1, 1]]);
  });

  it('writes off a small asset to the memo value when the annual rounds to zero', () => {
    // 10 × 0.02 = 0.2 → annual rounds to 0; year 1 writes off 9 to leave the 1-yen memo.
    const s = straightLineDepreciation({ acquisitionCost: 10, usefulLifeYears: 50 });
    expect(rows(s)).toEqual([[1, 10, 9, 1, 9]]);
  });
});

describe('straightLineDepreciation — input validation', () => {
  it('throws on negative acquisition cost', () => {
    expect(() => straightLineDepreciation({ acquisitionCost: -1, usefulLifeYears: 5 })).toThrow(
      '取得価額は 0 以上で指定してください: -1',
    );
  });

  it('throws on zero useful life', () => {
    expect(() =>
      straightLineDepreciation({ acquisitionCost: 1_000_000, usefulLifeYears: 0 }),
    ).toThrow('耐用年数は 1 以上の整数で指定してください: 0');
  });

  it('throws on non-integer useful life', () => {
    expect(() =>
      straightLineDepreciation({ acquisitionCost: 1_000_000, usefulLifeYears: 3.5 }),
    ).toThrow('耐用年数は 1 以上の整数で指定してください: 3.5');
  });

  it('throws when acquisition month is below 1', () => {
    expect(() =>
      straightLineDepreciation({ acquisitionCost: 1_000_000, usefulLifeYears: 5, acquisitionMonth: 0 }),
    ).toThrow('取得月 は 1〜12 の月で指定してください: 0');
  });

  it('throws when acquisition month is above 12', () => {
    expect(() =>
      straightLineDepreciation({ acquisitionCost: 1_000_000, usefulLifeYears: 5, acquisitionMonth: 13 }),
    ).toThrow('取得月 は 1〜12 の月で指定してください: 13');
  });

  it('throws when fiscal year-end month is out of range', () => {
    expect(() =>
      straightLineDepreciation({
        acquisitionCost: 1_000_000,
        usefulLifeYears: 5,
        fiscalYearEndMonth: 13,
      }),
    ).toThrow('期末月 は 1〜12 の月で指定してください: 13');
  });
});

describe('decliningBalanceDepreciation — 200% method', () => {
  it('depreciates on the declining base and switches to even depreciation, leaving 1 yen', () => {
    const s = decliningBalanceDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 5,
      method: '200%',
    });
    expect(rows(s)).toEqual([
      [1, 1_000_000, 400_000, 600_000, 400_000],
      [2, 600_000, 240_000, 360_000, 640_000],
      [3, 360_000, 120_000, 240_000, 760_000],
      [4, 240_000, 120_000, 120_000, 880_000],
      [5, 120_000, 119_999, 1, 999_999],
    ]);
  });

  it("'定率' behaves identically to '200%'", () => {
    const a = decliningBalanceDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 5,
      method: '定率',
    });
    const b = decliningBalanceDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 5,
      method: '200%',
    });
    expect(rows(a)).toEqual(rows(b));
  });

  it('switches to even depreciation at year 3 for a 5-year life', () => {
    // Year 3 declining = 360,000 × 0.4 = 144,000 < guarantee 200,000 → switch.
    const s = decliningBalanceDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 5,
      method: '200%',
    });
    // After the switch, years 3 and 4 depreciate the equal amount.
    expect(s[2]!.depreciation).toBe(120_000);
    expect(s[3]!.depreciation).toBe(120_000);
  });

  it('produces the full 10-year schedule with the revised-rate switch', () => {
    const s = decliningBalanceDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 10,
      method: '200%',
    });
    expect(rows(s)).toEqual([
      [1, 1_000_000, 200_000, 800_000, 200_000],
      [2, 800_000, 160_000, 640_000, 360_000],
      [3, 640_000, 128_000, 512_000, 488_000],
      [4, 512_000, 102_400, 409_600, 590_400],
      [5, 409_600, 68_267, 341_333, 658_667],
      [6, 341_333, 68_267, 273_066, 726_934],
      [7, 273_066, 68_267, 204_799, 795_201],
      [8, 204_799, 68_267, 136_532, 863_468],
      [9, 136_532, 68_267, 68_265, 931_735],
      [10, 68_265, 68_264, 1, 999_999],
    ]);
  });

  it('collapses to a single full year for a 2-year life (rate 1.0)', () => {
    const s = decliningBalanceDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 2,
      method: '200%',
    });
    expect(rows(s)).toEqual([[1, 1_000_000, 999_999, 1, 999_999]]);
  });

  it('does NOT switch when the declining amount exactly equals the guarantee (strict <)', () => {
    // Life 4, cost 1,000,000: at year 2 book=500,000, declining = 500,000 × 0.5 = 250,000
    // which exactly equals the guarantee 1,000,000 / 4 = 250,000. With strict `<` the year
    // stays on the declining base (250,000); a `<=` would switch early to 166,667.
    const s = decliningBalanceDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 4,
      method: '200%',
    });
    expect(rows(s)).toEqual([
      [1, 1_000_000, 500_000, 500_000, 500_000],
      [2, 500_000, 250_000, 250_000, 750_000],
      [3, 250_000, 125_000, 125_000, 875_000],
      [4, 125_000, 124_999, 1, 999_999],
    ]);
  });
});

describe('decliningBalanceDepreciation — 250% method', () => {
  it('uses a steeper 2.5/n rate and still lands on 1 yen', () => {
    const s = decliningBalanceDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 5,
      method: '250%',
    });
    expect(rows(s)).toEqual([
      [1, 1_000_000, 500_000, 500_000, 500_000],
      [2, 500_000, 250_000, 250_000, 750_000],
      [3, 250_000, 83_333, 166_667, 833_333],
      [4, 166_667, 83_333, 83_334, 916_666],
      [5, 83_334, 83_333, 1, 999_999],
    ]);
  });

  it('250% first-year depreciation exceeds the 200% first-year depreciation', () => {
    const at250 = decliningBalanceDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 5,
      method: '250%',
    });
    const at200 = decliningBalanceDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 5,
      method: '200%',
    });
    expect(at250[0]!.depreciation).toBeGreaterThan(at200[0]!.depreciation);
  });
});

describe('decliningBalanceDepreciation — mid-year acquisition', () => {
  it('prorates only the first year (October acquisition, December year-end)', () => {
    const s = decliningBalanceDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 5,
      method: '200%',
      acquisitionMonth: 10,
      fiscalYearEndMonth: 12,
    });
    // Year 1 = 400,000 × 3/12 = 100,000.
    expect(s[0]!.depreciation).toBe(100_000);
    expect(s[0]!.closing).toBe(900_000);
    // Year 2 resumes the full declining amount on the new book value.
    expect(s[1]!.depreciation).toBe(yenRef(900_000 * (2 / 5)));
  });

  it('still leaves a 1-yen memo value when prorated', () => {
    const s = decliningBalanceDepreciation({
      acquisitionCost: 1_000_000,
      usefulLifeYears: 5,
      method: '200%',
      acquisitionMonth: 10,
      fiscalYearEndMonth: 12,
    });
    expect(s[s.length - 1]!.closing).toBe(1);
  });
});

describe('decliningBalanceDepreciation — invariants', () => {
  it('keeps accumulated monotonically non-decreasing', () => {
    const s = decliningBalanceDepreciation({
      acquisitionCost: 880_000,
      usefulLifeYears: 8,
      method: '200%',
    });
    for (let i = 1; i < s.length; i += 1) {
      expect(s[i]!.accumulated).toBeGreaterThanOrEqual(s[i - 1]!.accumulated);
    }
  });

  it('keeps closing book value strictly positive until the 1-yen memo value', () => {
    const s = decliningBalanceDepreciation({
      acquisitionCost: 880_000,
      usefulLifeYears: 8,
      method: '200%',
    });
    for (const r of s) {
      expect(r.closing).toBeGreaterThanOrEqual(1);
    }
    expect(s[s.length - 1]!.closing).toBe(1);
  });

  it('closing equals opening minus depreciation for every row', () => {
    const s = decliningBalanceDepreciation({
      acquisitionCost: 777_777,
      usefulLifeYears: 6,
      method: '250%',
    });
    for (const r of s) {
      expect(r.closing).toBe(r.opening - r.depreciation);
    }
  });

  it('accumulated equals the running sum of depreciation', () => {
    const s = decliningBalanceDepreciation({
      acquisitionCost: 777_777,
      usefulLifeYears: 6,
      method: '250%',
    });
    let sum = 0;
    for (const r of s) {
      sum += r.depreciation;
      expect(r.accumulated).toBe(sum);
    }
  });

  it('returns an empty schedule for acquisition cost of 1 yen or less', () => {
    expect(
      decliningBalanceDepreciation({ acquisitionCost: 1, usefulLifeYears: 5, method: '200%' }),
    ).toEqual([]);
    expect(
      decliningBalanceDepreciation({ acquisitionCost: 0, usefulLifeYears: 5, method: '200%' }),
    ).toEqual([]);
  });

  it('writes off a tiny asset to the 1-yen memo in a single year', () => {
    // 2 × 0.2 = 0.4 → rounds to 0; the dep<=0 guard writes off the remainder to the memo.
    const s = decliningBalanceDepreciation({
      acquisitionCost: 2,
      usefulLifeYears: 10,
      method: '200%',
    });
    expect(rows(s)).toEqual([[1, 2, 1, 1, 1]]);
  });

  it('writes off the remainder when the declining amount later rounds to zero', () => {
    // Year 1: 5 × 0.1 = 0.5 → 1. Year 2: 4 × 0.1 = 0.4 → rounds to 0 → write off 3 to the memo.
    const s = decliningBalanceDepreciation({
      acquisitionCost: 5,
      usefulLifeYears: 20,
      method: '200%',
    });
    expect(rows(s)).toEqual([
      [1, 5, 1, 4, 1],
      [2, 4, 3, 1, 4],
    ]);
  });
});

describe('decliningBalanceDepreciation — input validation', () => {
  it('throws on negative acquisition cost', () => {
    expect(() =>
      decliningBalanceDepreciation({ acquisitionCost: -100, usefulLifeYears: 5, method: '200%' }),
    ).toThrow('取得価額は 0 以上で指定してください: -100');
  });

  it('throws on zero useful life', () => {
    expect(() =>
      decliningBalanceDepreciation({ acquisitionCost: 1_000_000, usefulLifeYears: 0, method: '200%' }),
    ).toThrow('耐用年数は 1 以上の整数で指定してください: 0');
  });

  it('throws on out-of-range acquisition month', () => {
    expect(() =>
      decliningBalanceDepreciation({
        acquisitionCost: 1_000_000,
        usefulLifeYears: 5,
        method: '200%',
        acquisitionMonth: 0,
      }),
    ).toThrow('取得月 は 1〜12 の月で指定してください: 0');
  });

  it('throws on out-of-range fiscal year-end month', () => {
    expect(() =>
      decliningBalanceDepreciation({
        acquisitionCost: 1_000_000,
        usefulLifeYears: 5,
        method: '200%',
        fiscalYearEndMonth: 0,
      }),
    ).toThrow('期末月 は 1〜12 の月で指定してください: 0');
  });
});

/** テスト内で本体と同じ丸めを再現する補助 (期待値計算用)。 */
function yenRef(n: number): number {
  return Math.round(n);
}

import { describe, expect, it } from 'vitest';
import { revenueForMonth, salesMonths, salesToFundamentals } from '../salesKpiBridge';
import type { SalesEntry } from '../sales';

const ENTRIES: SalesEntry[] = [
  { date: '2026-04-15', channel: 'amazon', amount: 100, orders: 1 },
  { date: '2026-05-01', channel: 'amazon', amount: 200, orders: 2 },
  { date: '2026-05-20', channel: 'shopify', amount: 50, orders: 1 },
];

describe('revenueForMonth', () => {
  it('sums only the matching month', () => {
    expect(revenueForMonth(ENTRIES, '2026-05')).toBe(250);
    expect(revenueForMonth(ENTRIES, '2026-04')).toBe(100);
    expect(revenueForMonth(ENTRIES, '2026-03')).toBe(0);
  });
});

describe('salesMonths', () => {
  it('returns distinct months newest-first', () => {
    expect(salesMonths(ENTRIES)).toEqual(['2026-05', '2026-04']);
    expect(salesMonths([])).toEqual([]);
  });

  it('sorts descending from an unsorted input (comparator must truly compare)', () => {
    // 出現順 (Set 挿入順) = [01, 03, 02] とソート済みでない並びにする。正しい降順は
    // [03, 02, 01]。比較子の `a < b` を false 固定する mutant は入力順かその反転しか
    // 返せず正しい降順にならないため、この期待値で殺せる。
    const mixed: SalesEntry[] = [
      { date: '2026-01-10', channel: 'amazon', amount: 1, orders: 1 },
      { date: '2026-03-10', channel: 'amazon', amount: 1, orders: 1 },
      { date: '2026-02-10', channel: 'amazon', amount: 1, orders: 1 },
    ];
    expect(salesMonths(mixed)).toEqual(['2026-03', '2026-02', '2026-01']);
  });
});

describe('salesToFundamentals', () => {
  it('fills revenue from sales and leaves costs at 0', () => {
    expect(salesToFundamentals(ENTRIES, '2026-05')).toEqual({
      revenue: 250,
      cogs: 0,
      advertising: 0,
      sga: 0,
      depreciation: 0,
    });
  });

  it('yields zero revenue for a month with no sales', () => {
    expect(salesToFundamentals(ENTRIES, '2026-01').revenue).toBe(0);
  });
});

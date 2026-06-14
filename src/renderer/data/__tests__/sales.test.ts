import { describe, expect, it } from 'vitest';
import {
  isSalesChannel,
  isValidDate,
  parseSalesEntry,
  summarizeSales,
  monthlyTotals,
  SALES_COLLECTION,
  CHANNEL_LABEL,
  type SalesEntry,
} from '../sales';

describe('sales constants', () => {
  it('exposes the collection key and every channel label', () => {
    expect(SALES_COLLECTION).toBe('sales-entries');
    expect(CHANNEL_LABEL).toEqual({
      amazon: 'Amazon', shopify: 'Shopify', base: 'BASE',
      rakuten: '楽天市場', mercari: 'メルカリ', other: 'その他',
    });
  });
});

describe('isSalesChannel', () => {
  it('accepts known channels and rejects others', () => {
    expect(isSalesChannel('amazon')).toBe(true);
    expect(isSalesChannel('other')).toBe(true);
    expect(isSalesChannel('ebay')).toBe(false);
    expect(isSalesChannel(3)).toBe(false);
  });
});

describe('isValidDate', () => {
  it('accepts YYYY-MM-DD with in-range month/day', () => {
    expect(isValidDate('2026-05-29')).toBe(true);
    expect(isValidDate('2026-12-31')).toBe(true);
  });
  it('accepts the January / day-01 lower boundary (>= strict)', () => {
    // month=01 / day=01 を valid に。`>= 1` を `> 1` にする mutant を kill。
    expect(isValidDate('2026-01-01')).toBe(true);
  });
  it('rejects month 00 / day 00 and anchored junk', () => {
    expect(isValidDate('2026-00-15')).toBe(false); // month 0 → `>=1` を true 固定する mutant を kill
    expect(isValidDate('2026-05-00')).toBe(false); // day 0
    expect(isValidDate('x2026-05-29')).toBe(false); // ^ アンカー
    expect(isValidDate('2026-05-29x')).toBe(false); // $ アンカー
  });
  it('rejects malformed or out-of-range', () => {
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-05-32')).toBe(false);
    expect(isValidDate('2026/05/29')).toBe(false);
    expect(isValidDate(20260529)).toBe(false);
  });
});

describe('parseSalesEntry', () => {
  const base = { date: '2026-05-29', channel: 'amazon', amount: '50000', orders: '10' };

  it('coerces strings and drops an empty note', () => {
    expect(parseSalesEntry(base)).toEqual({
      date: '2026-05-29',
      channel: 'amazon',
      amount: 50000,
      orders: 10,
    });
    expect(parseSalesEntry({ ...base, note: '  ' })).not.toHaveProperty('note');
  });

  it('keeps a trimmed note', () => {
    expect(parseSalesEntry({ ...base, note: '  セール  ' }).note).toBe('セール');
  });

  it('rejects bad date / channel', () => {
    expect(() => parseSalesEntry({ ...base, date: 'nope' })).toThrow(/日付/);
    expect(() => parseSalesEntry({ ...base, channel: 'ebay' })).toThrow(/チャネル/);
  });

  it('rejects bad amount / orders', () => {
    expect(() => parseSalesEntry({ ...base, amount: -1 })).toThrow(/売上金額/);
    expect(() => parseSalesEntry({ ...base, orders: 0 })).toThrow(/注文件数/);
    expect(() => parseSalesEntry({ ...base, orders: 1.5 })).toThrow(/注文件数/);
  });

  it('rejects an oversized note', () => {
    expect(() => parseSalesEntry({ ...base, note: 'x'.repeat(201) })).toThrow(/メモ/);
  });

  it('accepts boundary values: amount 0 and a 200-char note (> strict)', () => {
    // amount===0 は許容 (< 0)、note===200 は許容 (> 200)。<= / >= にする mutant を kill。
    expect(parseSalesEntry({ ...base, amount: 0 }).amount).toBe(0);
    expect(parseSalesEntry({ ...base, note: 'x'.repeat(200) }).note).toBe('x'.repeat(200));
  });
});

describe('summarizeSales', () => {
  const entries: SalesEntry[] = [
    { date: '2026-05-01', channel: 'amazon', amount: 60000, orders: 12 },
    { date: '2026-05-02', channel: 'shopify', amount: 30000, orders: 6 },
    { date: '2026-05-03', channel: 'amazon', amount: 40000, orders: 8 },
  ];

  it('totals amount, orders and AOV', () => {
    const s = summarizeSales(entries);
    expect(s.totalAmount).toBe(130000);
    expect(s.totalOrders).toBe(26);
    expect(s.aov).toBeCloseTo(5000);
  });

  it('breaks down by channel sorted by amount desc with shares', () => {
    const s = summarizeSales(entries);
    expect(s.byChannel.map((c) => c.channel)).toEqual(['amazon', 'shopify']);
    const amazon = s.byChannel[0]!;
    expect(amazon.amount).toBe(100000);
    expect(amazon.orders).toBe(20);
    expect(amazon.share).toBeCloseTo((100000 / 130000) * 100);
    expect(amazon.aov).toBeCloseTo(5000);
    expect(amazon.label).toBe('Amazon');
  });

  it('handles an empty set without dividing by zero', () => {
    const s = summarizeSales([]);
    expect(s.totalAmount).toBe(0);
    expect(s.aov).toBe(0);
    expect(s.byChannel).toEqual([]);
  });

  it('sorts byChannel by amount desc even when insertion order is ascending', () => {
    // 先に低額 shopify、後に高額 amazon を挿入 → Map 順は [shopify, amazon]。
    // 比較子を無くす / + にする mutant は降順にならないため、[amazon, shopify] で kill。
    const s = summarizeSales([
      { date: '2026-05-01', channel: 'shopify', amount: 10_000, orders: 1 },
      { date: '2026-05-02', channel: 'amazon', amount: 90_000, orders: 1 },
    ]);
    expect(s.byChannel.map((c) => c.channel)).toEqual(['amazon', 'shopify']);
  });

  it('yields a 0 share when total amount is zero (no division by zero)', () => {
    // 全額 0 → totalAmount 0 → share 0。totalAmount>0 を true 固定 / >=0 にする mutant を kill。
    const s = summarizeSales([{ date: '2026-05-01', channel: 'amazon', amount: 0, orders: 2 }]);
    expect(s.totalAmount).toBe(0);
    expect(s.byChannel[0]!.share).toBe(0);
  });
});

describe('monthlyTotals', () => {
  it('groups by YYYY-MM newest-first', () => {
    const entries: SalesEntry[] = [
      { date: '2026-04-15', channel: 'amazon', amount: 100, orders: 1 },
      { date: '2026-05-01', channel: 'amazon', amount: 200, orders: 1 },
      { date: '2026-05-20', channel: 'shopify', amount: 50, orders: 1 },
    ];
    expect(monthlyTotals(entries)).toEqual([
      { month: '2026-05', amount: 250 },
      { month: '2026-04', amount: 100 },
    ]);
  });

  it('sorts months descending from an unsorted insertion order', () => {
    // 挿入順 03, 05, 04 → 正しい降順 [05, 04, 03]。比較子を false 固定する mutant は
    // 入力順かその反転しか返せず正しい降順にならないため kill。
    const entries: SalesEntry[] = [
      { date: '2026-03-10', channel: 'amazon', amount: 1, orders: 1 },
      { date: '2026-05-10', channel: 'amazon', amount: 1, orders: 1 },
      { date: '2026-04-10', channel: 'amazon', amount: 1, orders: 1 },
    ];
    expect(monthlyTotals(entries).map((m) => m.month)).toEqual(['2026-05', '2026-04', '2026-03']);
  });
});

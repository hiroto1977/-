import { describe, expect, it } from 'vitest';
import {
  isSalesChannel,
  isValidDate,
  parseSalesEntry,
  summarizeSales,
  monthlyTotals,
  type SalesEntry,
} from '../sales';

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
});

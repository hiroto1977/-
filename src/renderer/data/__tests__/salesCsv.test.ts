import { describe, expect, it } from 'vitest';
import { salesToCsv, salesFromCsv } from '../salesCsv';
import type { SalesEntry } from '../sales';

const ENTRIES: SalesEntry[] = [
  { date: '2026-05-01', channel: 'amazon', amount: 200, orders: 2, note: 'セール' },
  { date: '2026-05-02', channel: 'shopify', amount: 50, orders: 1 },
];

describe('salesToCsv', () => {
  it('emits a header + one row per entry, blanking a missing note', () => {
    expect(salesToCsv(ENTRIES)).toBe(
      'date,channel,amount,orders,note\r\n2026-05-01,amazon,200,2,セール\r\n2026-05-02,shopify,50,1,',
    );
  });
});

describe('salesFromCsv', () => {
  it('parses valid rows into entries', () => {
    const csv = 'date,channel,amount,orders,note\r\n2026-05-01,amazon,200,2,セール';
    const { entries, errors } = salesFromCsv(csv);
    expect(errors).toEqual([]);
    expect(entries).toEqual([{ date: '2026-05-01', channel: 'amazon', amount: 200, orders: 2, note: 'セール' }]);
  });

  it('collects per-row errors without aborting the whole import', () => {
    const csv = [
      'date,channel,amount,orders,note',
      '2026-05-01,amazon,200,2,',
      'bad-date,amazon,10,1,',
      '2026-05-03,ebay,10,1,', // unknown channel
    ].join('\r\n');
    const { entries, errors } = salesFromCsv(csv);
    expect(entries).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ row: 2 });
    expect(errors[1]).toMatchObject({ row: 3 });
  });

  it('round-trips export → import', () => {
    const { entries, errors } = salesFromCsv(salesToCsv(ENTRIES));
    expect(errors).toEqual([]);
    expect(entries).toEqual([
      { date: '2026-05-01', channel: 'amazon', amount: 200, orders: 2, note: 'セール' },
      { date: '2026-05-02', channel: 'shopify', amount: 50, orders: 1 },
    ]);
  });

  it('returns empty for a header-only or empty file', () => {
    expect(salesFromCsv('date,channel,amount,orders,note').entries).toEqual([]);
    expect(salesFromCsv('').entries).toEqual([]);
  });
});

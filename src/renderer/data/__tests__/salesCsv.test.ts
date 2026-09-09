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

describe('salesFromCsv — 同じファイルを 2 度読んだか (パス 126)', () => {
  const rows: SalesEntry[] = [
    { date: '2026-05-01', channel: 'amazon', amount: 200, orders: 2, note: 'セール' },
    { date: '2026-05-02', channel: 'shopify', amount: 300, orders: 1 },
  ];

  it('★ 読めた行がすべて既存の記録と同じ内容なら allStored (画面はここで断る)', () => {
    const r = salesFromCsv(salesToCsv(rows), rows);
    expect(r.entries).toHaveLength(2);
    expect(r.stored).toBe(2);
    expect(r.allStored).toBe(true);
  });

  it('一部だけ同じなら取り込みの対象のまま、stored に数える (同じ内容の別の売上はありうる)', () => {
    const r = salesFromCsv(salesToCsv([...rows, { date: '2026-05-03', channel: 'rakuten', amount: 400, orders: 1 }]), rows);
    expect(r.entries).toHaveLength(3);
    expect(r.stored).toBe(2);
    expect(r.allStored).toBe(false);
  });

  it('対照: 既存が無い・既定の existing は空 → stored 0・allStored false。読めた行が 0 なら allStored も false', () => {
    const r = salesFromCsv(salesToCsv(rows));
    expect(r.stored).toBe(0);
    expect(r.allStored).toBe(false);
    const empty = salesFromCsv('date,channel,amount,orders,note\n', rows);
    expect(empty.entries).toHaveLength(0);
    expect(empty.allStored).toBe(false);
  });
});

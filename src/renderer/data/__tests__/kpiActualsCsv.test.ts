import { describe, expect, it } from 'vitest';
import { kpiActualsToCsv, kpiActualsFromCsv } from '../kpiActualsCsv';
import type { KpiActual } from '../kpiActuals';

const ROWS: KpiActual[] = [
  { period: '2026-05', unit: 'EC', revenue: 1000, cogs: 400, advertising: 100, sga: 200, depreciation: 50 },
];

describe('kpiActualsToCsv', () => {
  it('emits header + rows in column order', () => {
    expect(kpiActualsToCsv(ROWS)).toBe(
      'period,unit,revenue,cogs,advertising,sga,depreciation\r\n2026-05,EC,1000,400,100,200,50',
    );
  });
});

describe('kpiActualsFromCsv', () => {
  it('parses valid rows', () => {
    const { entries, errors } = kpiActualsFromCsv(kpiActualsToCsv(ROWS));
    expect(errors).toEqual([]);
    expect(entries).toEqual(ROWS);
  });

  it('collects per-row errors without aborting', () => {
    const csv = [
      'period,unit,revenue,cogs,advertising,sga,depreciation',
      '2026-05,EC,1000,400,100,200,50',
      '2026-99,EC,1,1,1,1,1', // bad period
      '2026-06,,1,1,1,1,1', // empty unit
    ].join('\r\n');
    const { entries, errors } = kpiActualsFromCsv(csv);
    expect(entries).toHaveLength(1);
    expect(errors.map((e) => e.row)).toEqual([2, 3]);
  });

  it('returns empty for header-only or empty input', () => {
    expect(kpiActualsFromCsv('period,unit,revenue,cogs,advertising,sga,depreciation').entries).toEqual([]);
    expect(kpiActualsFromCsv('').entries).toEqual([]);
  });
});

describe('kpiActualsFromCsv — 同じ期・事業は 1 件 (パス 124)', () => {
  const base: KpiActual = { period: '2026-04', unit: '全社', revenue: 1_000_000, cogs: 0, advertising: 0, sga: 0, depreciation: 0 };

  it('★ 既に保存されている組はスキップされ、errors と duplicates に数えられる', () => {
    const csv = kpiActualsToCsv([base, { ...base, period: '2026-05' }]);
    const r = kpiActualsFromCsv(csv, [base]);
    expect(r.entries.map((e) => e.period)).toEqual(['2026-05']);
    expect(r.errors).toEqual([{ row: 1, message: '2026-04 の「全社」は既に入力されています（同じ期・事業の重複行はスキップ）' }]);
    expect(r.duplicates).toBe(1);
  });

  it('★ ファイル内で 2 度出た組は後の行がスキップされ、同じファイルを 2 度読んでも 2 倍にならない', () => {
    const csv = kpiActualsToCsv([base, base]);
    const first = kpiActualsFromCsv(csv);
    expect(first.entries).toHaveLength(1);
    expect(first.errors.map((e) => e.row)).toEqual([2]);
    expect(first.duplicates).toBe(1);
    // 2 度目 (1 度目の結果が既に保存されている) は 0 件
    const again = kpiActualsFromCsv(csv, first.entries);
    expect(again.entries).toHaveLength(0);
    expect(again.duplicates).toBe(2);
  });

  it('対照: 別の事業・別の期は通り、duplicates は 0・既定の existing は空', () => {
    const csv = kpiActualsToCsv([base, { ...base, unit: 'EC' }, { ...base, period: '2026-05' }]);
    const r = kpiActualsFromCsv(csv, [{ ...base, period: '2026-03' }]);
    expect(r.entries).toHaveLength(3);
    expect(r.errors).toEqual([]);
    expect(r.duplicates).toBe(0);
    expect(kpiActualsFromCsv(csv).entries).toHaveLength(3);
  });
});

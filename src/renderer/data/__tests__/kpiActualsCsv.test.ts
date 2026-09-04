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

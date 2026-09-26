import { describe, expect, it } from 'vitest';
import { kpiActualsToCsv, kpiActualsFromCsv } from '../kpiActualsCsv';
import type { KpiActual } from '../kpiActuals';

// **標本は形の全欄を埋める** —— 2026-09-23 (パス 429) まで `laborCost` (人件費) が
// 抜けており、下の `toEqual(ROWS)` は正しい不変条件 (往復の等値) を主張しながら
// **その欄が落ちることを見分けられなかった**。書き出しも取り込みも人件費を扱わず、
// 往復すると労働分配率・人件費率・一人当たり人件費と、金融機関等提出用の書面の
// 「人件費」の行が空になった。欄の被覆そのものは `csvColumnCoverage.test.ts` が
// 形の宣言から導いて数える。
const ROWS: KpiActual[] = [
  { period: '2026-05', unit: 'EC', revenue: 1000, cogs: 400, advertising: 100, sga: 200, depreciation: 50, laborCost: 150 },
];

describe('kpiActualsToCsv', () => {
  it('emits header + rows in column order', () => {
    expect(kpiActualsToCsv(ROWS)).toBe(
      'period,unit,revenue,cogs,advertising,sga,depreciation,laborCost\r\n2026-05,EC,1000,400,100,200,50,150',
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
    // 見出し行は 7 列 (人件費を持たない古い書き出し) —— 今も読めることを兼ねて留める。
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

import { describe, expect, it } from 'vitest';
import {
  CSV_TOO_MANY_ERRORS_MESSAGE,
  MAX_CSV_IMPORT_ROWS,
  MAX_CSV_ROW_ERRORS,
  csvRowLimitError,
} from '../importFile';
import { salesFromCsv } from '../salesCsv';
import { kpiActualsFromCsv } from '../kpiActualsCsv';

/**
 * CSV の行数と誤りの数に天井が在る (2026-10-16 · パス 524 · threat: T-081)。
 * 直す前: 20 MiB の `,,,,` 419 万行が全部誤りとして集められ、売上の取り込みで 37 秒止まり
 * RSS 3.7 GB を使った (KPI も同様)。バイトの上限 (20 MiB) だけでは行数を止められなかった。
 */
const SALES_HEADER = 'date,channel,amount,orders,note\n';
const KPI_HEADER = 'period,unit,revenue,cogs,advertising,sga,depreciation,laborCost\n';

describe('CSV の行数・誤りの天井 (threat: T-081)', () => {
  it('★ 行数が天井を超える CSV は解析の前に全体を断る (売上・KPI とも)', () => {
    const rows = ',,,,\n'.repeat(MAX_CSV_IMPORT_ROWS + 1);
    const started = Date.now();
    const sales = salesFromCsv(SALES_HEADER + rows);
    const kpi = kpiActualsFromCsv(KPI_HEADER + rows);
    expect(Date.now() - started, '解析せずに断るので速い').toBeLessThan(2000);
    for (const r of [sales, kpi]) {
      expect(r.entries).toEqual([]);
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]!.message).toContain('行が多すぎます');
    }
  });

  it('★ 誤りの行が天井を超えたら、良い行も取り込まず全体を断る (どこまで入ったか分からない部分取り込みにしない)', () => {
    const good = '2026-05-01,shopify,1000,1,ok\n';
    const bad = 'bad,,,,\n'.repeat(MAX_CSV_ROW_ERRORS + 5);
    const sales = salesFromCsv(SALES_HEADER + good + bad);
    expect(sales.entries).toEqual([]);
    expect(sales.errors).toEqual([expect.objectContaining({ message: CSV_TOO_MANY_ERRORS_MESSAGE })]);
    expect(sales.allStored).toBe(false);
    const kpi = kpiActualsFromCsv(KPI_HEADER + '2026-05,A,1,1,1,1,1,\n' + 'bad,,,,,,,\n'.repeat(MAX_CSV_ROW_ERRORS + 5));
    expect(kpi.entries).toEqual([]);
    expect(kpi.errors).toEqual([expect.objectContaining({ message: CSV_TOO_MANY_ERRORS_MESSAGE })]);
  });

  it('★ 対照: 天井ちょうどの行数・天井の手前の誤りは今までどおり読む (誤りは個別に報告する)', () => {
    expect(csvRowLimitError('a\n'.repeat(MAX_CSV_IMPORT_ROWS))).toBeNull();
    expect(csvRowLimitError('a\n'.repeat(MAX_CSV_IMPORT_ROWS + 1))).not.toBeNull();
    const text = SALES_HEADER + '2026-05-01,shopify,1000,1,ok\n' + 'bad,,,,\n'.repeat(3);
    const r = salesFromCsv(text);
    expect(r.entries).toHaveLength(1);
    expect(r.errors).toHaveLength(3);
  });
});

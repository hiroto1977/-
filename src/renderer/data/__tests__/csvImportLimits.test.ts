import { describe, expect, it } from 'vitest';
import {
  CSV_TOO_MANY_ERRORS_MESSAGE,
  MAX_CSV_IMPORT_CELLS,
  MAX_CSV_IMPORT_COLUMNS,
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

  /**
   * 単独の `\r` でも行は終わる (2026-10-16 · パス 525 · threat: T-093)。関門が `\n` だけを数えていたので、
   * `\r` 区切りの 20 MiB は素通りして全行を組み、メモリを 2 GB 近く使った (実測)。
   */
  it('★ CR 区切り・CRLF でも行数の天井が効く (threat: T-093)', () => {
    expect(csvRowLimitError('a\r'.repeat(MAX_CSV_IMPORT_ROWS + 1))).not.toBeNull();
    expect(csvRowLimitError('a\r\n'.repeat(MAX_CSV_IMPORT_ROWS + 1))).not.toBeNull();
    // 対照: CRLF は 1 つの改行 (倍に数えない)・天井ちょうどは読む
    expect(csvRowLimitError('a\r\n'.repeat(MAX_CSV_IMPORT_ROWS))).toBeNull();
    expect(csvRowLimitError('a\r'.repeat(MAX_CSV_IMPORT_ROWS))).toBeNull();
    const r = salesFromCsv(SALES_HEADER.replace(/\n/g, '\r') + 'bad,,,,\r'.repeat(MAX_CSV_IMPORT_ROWS + 5));
    expect(r.entries).toEqual([]);
    expect(r.errors).toHaveLength(1);
  });

  /**
   * 列数と、列数 × 行数 (2026-10-16 · パス 526 · threat: T-102)。行数の天井だけでは、ヘッダが 2,000 列の
   * 95 KB (40,000 行) が通り、`parseCsvRecords` が全行ぶん 2,000 キーの器を作って heap の上限で落ちた
   * (実測: 15 KB・2,000 列 × 2,000 行で RSS +234 MB)。
   */
  it('★ 幅の広いヘッダは、解析の前に断る (threat: T-102)', () => {
    const wide = Array.from({ length: 2000 }, (_, i) => `c${i}`).join(',');
    const text = wide + '\n' + 'x\n'.repeat(40_000);
    expect(csvRowLimitError(text)).toContain('列が多すぎます');
    const t0 = Date.now();
    const sales = salesFromCsv(text);
    expect(sales.entries).toEqual([]);
    expect(sales.errors[0]?.message).toContain('列が多すぎます');
    expect(kpiActualsFromCsv(text).errors[0]?.message).toContain('列が多すぎます');
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('★ 列数ちょうど・セル数ちょうどは読む / 1 つ超えると断る (threat: T-102)', () => {
    const cols = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`).join(',');
    expect(csvRowLimitError(cols(MAX_CSV_IMPORT_COLUMNS) + '\n')).toBeNull();
    expect(csvRowLimitError(cols(MAX_CSV_IMPORT_COLUMNS + 1) + '\n')).toContain('列が多すぎます');
    // 列 64 × 行 (31,250 + 1) = 2,000,064 > 200 万、31,249 + 1 = 2,000,000 ちょうど
    const header = cols(MAX_CSV_IMPORT_COLUMNS);
    const rowsOk = MAX_CSV_IMPORT_CELLS / MAX_CSV_IMPORT_COLUMNS - 1;
    expect(csvRowLimitError(header + '\n' + 'x\n'.repeat(rowsOk - 1))).toBeNull();
    expect(csvRowLimitError(header + '\n' + 'x\n'.repeat(rowsOk + 1))).toContain('データが大きすぎます');
  });

  it('★ 対照: 実物の売上 5 列・KPI 8 列の最大行数は今までどおり読める', () => {
    // 20 万行 × 5 列 = 100 万セル・20 万行 × 8 列 = 160 万セル (どちらも 200 万セルの内)
    expect(csvRowLimitError('a,b,c,d,e\n' + 'a,b,c,d,e\n'.repeat(MAX_CSV_IMPORT_ROWS - 1))).toBeNull();
    expect(csvRowLimitError('a,b,c,d,e,f,g,h\n' + 'a,b,c,d,e,f,g,h\n'.repeat(MAX_CSV_IMPORT_ROWS - 1))).toBeNull();
  });

  it('★ 引用符の中のカンマと改行は列にも行にも数えない', () => {
    const quoted = '"' + 'a,'.repeat(500) + '",b\n1,2\n';
    expect(csvRowLimitError(quoted)).toBeNull();
    // 引用符の中の `""` は元に戻る
    expect(csvRowLimitError('"x""y,z",b\n1,2\n')).toBeNull();
  });
});

describe('CSV の列数は 1 行目だけで数える (パス 526 · 変異検査の穴を閉じる)', () => {
  it('★ 単独の CR でヘッダは終わる (CR のあとのカンマは列に数えない)', () => {
    expect(csvRowLimitError('a\r' + ','.repeat(100))).toBeNull();
    expect(csvRowLimitError('a\n' + ','.repeat(100))).toBeNull();
    expect(csvRowLimitError('a,b\r\n' + ','.repeat(100))).toBeNull();
    // 対照: 同じ 1 行目にあれば数える
    expect(csvRowLimitError(','.repeat(100) + '\r')).toContain('列が多すぎます');
  });
  it('★ 行の数は最後の改行の無い行ごと数え、CRLF は 1 つ・CR と LF の混在は別々に数える', () => {
    expect(csvRowLimitError('a\r\nb\nc\rd')).toBeNull();
    expect(csvRowLimitError('\r\n'.repeat(MAX_CSV_IMPORT_ROWS))).toBeNull();
    expect(csvRowLimitError('\r\n'.repeat(MAX_CSV_IMPORT_ROWS + 1))).toContain('行が多すぎます');
  });
});

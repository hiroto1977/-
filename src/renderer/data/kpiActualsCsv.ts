/**
 * KPI actuals ↔ CSV mapping. Mirrors `salesCsv.ts`, reusing the generic CSV
 * core (`csv.ts`) and the KPI model's validator (`parseKpiActual`).
 */
import { recordsToCsv, parseCsvRecords } from './csv';
import { actualKey, parseKpiActual, type KpiActual } from './kpiActuals';

export const KPI_CSV_COLUMNS = [
  'period',
  'unit',
  'revenue',
  'cogs',
  'advertising',
  'sga',
  'depreciation',
] as const;

export function kpiActualsToCsv(rows: readonly KpiActual[]): string {
  return recordsToCsv(rows, KPI_CSV_COLUMNS as unknown as (keyof KpiActual & string)[]);
}

export interface KpiImportResult {
  readonly entries: KpiActual[];
  readonly errors: { row: number; message: string }[];
  /** `errors` のうち、同じ (期間, 事業) が既に在るためスキップした行の数 (パス 124)。 */
  readonly duplicates: number;
}

/**
 * Parse a KPI actuals CSV; each row validated independently.
 *
 * **同じ (期間, 事業) は 1 件** (パス 124): 既に保存されている組 (`existing`) と、同じファイルの
 * 中で先に出た組は取り込まず `errors` に数える —— 以前は同じファイルを 2 度読むと売上高が
 * 2 倍になった (`addMany` は既存と照合しない)。
 */
export function kpiActualsFromCsv(text: string, existing: readonly KpiActual[] = []): KpiImportResult {
  const records = parseCsvRecords(text);
  const entries: KpiActual[] = [];
  const errors: { row: number; message: string }[] = [];
  const seen = new Set(existing.map(actualKey));
  let duplicates = 0;

  records.forEach((rec, i) => {
    let entry: KpiActual;
    try {
      entry = parseKpiActual({
        period: rec.period,
        unit: rec.unit,
        revenue: rec.revenue,
        cogs: rec.cogs,
        advertising: rec.advertising,
        sga: rec.sga,
        depreciation: rec.depreciation,
      });
    } catch (e) {
      // parse は常に Error を throw するため else 側 '不正な行' は到達不能 (防御)。
      // Stryker disable next-line StringLiteral
      errors.push({ row: i + 1, message: e instanceof Error ? e.message : '不正な行' });
      return;
    }
    const key = actualKey(entry);
    if (seen.has(key)) {
      duplicates += 1;
      errors.push({ row: i + 1, message: `${entry.period} の「${entry.unit}」は既に入力されています（同じ期・事業の重複行はスキップ）` });
      return;
    }
    seen.add(key);
    entries.push(entry);
  });

  return { entries, errors, duplicates };
}

/**
 * KPI actuals ↔ CSV mapping. Mirrors `salesCsv.ts`, reusing the generic CSV
 * core (`csv.ts`) and the KPI model's validator (`parseKpiActual`).
 */
import { recordsToCsv, parseCsvRecords } from './csv';
import { parseKpiActual, type KpiActual } from './kpiActuals';

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
}

/** Parse a KPI actuals CSV; each row validated independently. */
export function kpiActualsFromCsv(text: string): KpiImportResult {
  const records = parseCsvRecords(text);
  const entries: KpiActual[] = [];
  const errors: { row: number; message: string }[] = [];

  records.forEach((rec, i) => {
    try {
      entries.push(
        parseKpiActual({
          period: rec.period,
          unit: rec.unit,
          revenue: rec.revenue,
          cogs: rec.cogs,
          advertising: rec.advertising,
          sga: rec.sga,
          depreciation: rec.depreciation,
        }),
      );
    } catch (e) {
      // parse は常に Error を throw するため else 側 '不正な行' は到達不能 (防御)。
      // Stryker disable next-line StringLiteral
      errors.push({ row: i + 1, message: e instanceof Error ? e.message : '不正な行' });
    }
  });

  return { entries, errors };
}

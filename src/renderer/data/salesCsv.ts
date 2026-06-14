/**
 * Sales ↔ CSV mapping. Bridges the generic CSV core (`csv.ts`) and the sales
 * model (`sales.ts`): export sales entries to a spreadsheet-friendly CSV, and
 * import rows back (reusing `parseSalesEntry` for validation).
 */
import { recordsToCsv, parseCsvRecords } from './csv';
import { parseSalesEntry, type SalesEntry } from './sales';

/** Column order for exported sales CSV (matches the import expectation). */
export const SALES_CSV_COLUMNS = ['date', 'channel', 'amount', 'orders', 'note'] as const;

export function salesToCsv(entries: readonly SalesEntry[]): string {
  const rows = entries.map((e) => ({
    date: e.date,
    channel: e.channel,
    amount: e.amount,
    orders: e.orders,
    note: e.note ?? '',
  }));
  return recordsToCsv(rows, SALES_CSV_COLUMNS as unknown as (keyof (typeof rows)[number] & string)[]);
}

export interface SalesImportResult {
  /** Successfully parsed entries, ready to persist. */
  readonly entries: SalesEntry[];
  /** Per-row errors keyed by 1-based data-row number (header excluded). */
  readonly errors: { row: number; message: string }[];
}

/**
 * Parse a sales CSV. Each data row is validated independently so one bad row
 * doesn't abort the whole import — good rows are returned alongside a list of
 * row-level errors for the user to fix.
 */
export function salesFromCsv(text: string): SalesImportResult {
  const records = parseCsvRecords(text);
  const entries: SalesEntry[] = [];
  const errors: { row: number; message: string }[] = [];

  records.forEach((rec, i) => {
    try {
      entries.push(
        parseSalesEntry({
          date: rec.date,
          channel: rec.channel,
          amount: rec.amount,
          orders: rec.orders,
          note: rec.note,
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

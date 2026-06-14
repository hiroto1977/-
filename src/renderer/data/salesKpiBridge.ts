/**
 * Sales → KPI bridge — connects the cross-channel sales feature
 * (`data/sales.ts`) to the KPI/BEP feature (`data/kpiActuals.ts`). Sales
 * entries carry revenue; this derives the revenue line for a given month so a
 * KPI actual can be pre-filled (the user still supplies the cost breakdown).
 *
 * Pure functions only — no store/IO — so the linkage is fully unit-tested.
 */
import type { SalesEntry } from './sales';
import type { KpiFundamentals } from './kpiActuals';

/** `YYYY-MM` of a `YYYY-MM-DD` date. */
function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Sum sales amount for a given `YYYY-MM` month. */
export function revenueForMonth(entries: readonly SalesEntry[], month: string): number {
  return entries.reduce((acc, e) => (monthOf(e.date) === month ? acc + e.amount : acc), 0);
}

/** Distinct months present in the sales data, newest-first. */
export function salesMonths(entries: readonly SalesEntry[]): readonly string[] {
  const set = new Set<string>();
  for (const e of entries) set.add(monthOf(e.date));
  // Set 由来で a===b は起きないため、< → <= の EqualityOperator は equivalent。
  // Stryker disable next-line EqualityOperator
  return [...set].sort((a, b) => (a < b ? 1 : -1));
}

/**
 * Build KPI fundamentals from sales for a month: revenue is taken from sales,
 * cost lines are left at 0 for the user to complete. Keeping costs at 0 (not
 * guessed) is deliberate — we never fabricate expense data.
 */
export function salesToFundamentals(entries: readonly SalesEntry[], month: string): KpiFundamentals {
  return {
    revenue: revenueForMonth(entries, month),
    cogs: 0,
    advertising: 0,
    sga: 0,
    depreciation: 0,
  };
}

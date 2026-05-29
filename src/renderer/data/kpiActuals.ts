/**
 * KPI actuals — real, user-entered monthly business figures persisted via
 * the local record store (`data/store.ts`). This is the first dashboard
 * feature backed by real data rather than the mock snapshot: the user enters
 * monthly 実績 and the KPI tiles recompute from them.
 *
 * The break-even formula here mirrors the canonical one in
 * `src/main/clients/kpi.ts` (`computeKpi`). It is re-stated rather than
 * imported because the renderer must not import from the main process
 * (enforced by `lint:imports`); both derive from docs/ARCHITECTURE.md §3.
 */

export const KPI_ACTUALS_COLLECTION = 'kpi-actuals';

/** One month of raw business figures (JPY). */
export interface KpiActual extends Record<string, unknown> {
  /** Period label, `YYYY-MM`. */
  readonly period: string;
  /** Free-form business unit label (e.g. "EC", "全社"). */
  readonly unit: string;
  readonly revenue: number;
  readonly cogs: number;
  readonly advertising: number;
  readonly sga: number;
  readonly depreciation: number;
}

export interface KpiFundamentals {
  revenue: number;
  cogs: number;
  advertising: number;
  sga: number;
  depreciation: number;
}

export interface KpiMetrics {
  variableCost: number;
  fixedCost: number;
  contribution: number;
  contributionRatio: number;
  bep: number;
  bepRatio: number;
  safetyMargin: number;
  operatingProfit: number;
}

/** `YYYY-MM`, months 01-12. */
export function isValidPeriod(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return false;
  const month = Number(m[2]);
  return month >= 1 && month <= 12;
}

/** Validate + coerce a partial input into a clean KpiActual, or throw with a
 *  user-facing message. Numbers must be finite and non-negative. */
export function parseKpiActual(input: {
  period?: unknown;
  unit?: unknown;
  revenue?: unknown;
  cogs?: unknown;
  advertising?: unknown;
  sga?: unknown;
  depreciation?: unknown;
}): KpiActual {
  if (!isValidPeriod(input.period)) throw new Error('期間は YYYY-MM 形式で入力してください');
  const unit = typeof input.unit === 'string' ? input.unit.trim() : '';
  if (unit.length === 0 || unit.length > 64) throw new Error('事業名は 1〜64 文字で入力してください');

  const num = (v: unknown, label: string): number => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label}は 0 以上の数値で入力してください`);
    return n;
  };

  return {
    period: input.period,
    unit,
    revenue: num(input.revenue, '売上高'),
    cogs: num(input.cogs, '売上原価'),
    advertising: num(input.advertising, '広告費'),
    sga: num(input.sga, '販管費'),
    depreciation: num(input.depreciation, '減価償却費'),
  };
}

/** Sum a set of actuals into a single Fundamentals roll-up. */
export function summarizeFundamentals(actuals: readonly KpiActual[]): KpiFundamentals {
  return actuals.reduce<KpiFundamentals>(
    (acc, a) => ({
      revenue: acc.revenue + a.revenue,
      cogs: acc.cogs + a.cogs,
      advertising: acc.advertising + a.advertising,
      sga: acc.sga + a.sga,
      depreciation: acc.depreciation + a.depreciation,
    }),
    { revenue: 0, cogs: 0, advertising: 0, sga: 0, depreciation: 0 },
  );
}

/** Pure break-even / KPI computation. Mirrors `computeKpi` in
 *  src/main/clients/kpi.ts (see module header). */
export function computeKpiMetrics(f: KpiFundamentals): KpiMetrics {
  const variableCost = f.cogs + f.advertising;
  const fixedCost = f.sga + f.depreciation;
  const contribution = f.revenue - variableCost;
  const contributionRatio = f.revenue > 0 ? (contribution / f.revenue) * 100 : 0;
  const bep = contribution > 0 ? (fixedCost / contribution) * f.revenue : Infinity;
  const bepRatio = f.revenue > 0 && Number.isFinite(bep) ? (bep / f.revenue) * 100 : Infinity;
  const safetyMargin = Number.isFinite(bepRatio) ? Math.max(0, 100 - bepRatio) : 0;
  const operatingProfit = contribution - fixedCost;
  return {
    variableCost,
    fixedCost,
    contribution,
    contributionRatio,
    bep,
    bepRatio,
    safetyMargin,
    operatingProfit,
  };
}

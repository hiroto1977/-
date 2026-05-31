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

/** 1 期 (`period` = YYYY-MM) の合計売上。期の昇順。 */
export interface PeriodRevenue {
  readonly period: string;
  readonly revenue: number;
}

/**
 * 実績を期 (`period` = YYYY-MM) でグルーピングし、合計売上を期の昇順で返す。
 * 成長性系の指標 (前期比 / CAGR / トレンド) が共通で使う土台。
 */
export function groupRevenueByPeriod(actuals: readonly KpiActual[]): PeriodRevenue[] {
  const byPeriod = new Map<string, number>();
  for (const a of actuals) {
    byPeriod.set(a.period, (byPeriod.get(a.period) ?? 0) + a.revenue);
  }
  return [...byPeriod.entries()]
    .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
    .map(([period, revenue]) => ({ period, revenue }));
}

/**
 * 直近期と前期の売上から売上高成長率 (%) を計算する。
 *
 * 期 (`period` = YYYY-MM) でグルーピングして合計売上を出し、最新月を前月と
 * 比較する。期が 2 つ未満なら null (成長率を算定できない)。前期売上が 0 の
 * ときも null (ゼロ除算回避)。
 */
export function computeRevenueGrowthPct(actuals: readonly KpiActual[]): number | null {
  const series = groupRevenueByPeriod(actuals);
  if (series.length < 2) return null;
  const latest = series[series.length - 1]!.revenue;
  const prior = series[series.length - 2]!.revenue;
  if (prior <= 0) return null;
  return Math.round(((latest - prior) / prior) * 1000) / 10;
}

/**
 * 期間全体の平均成長率 (CAGR 相当, 1 期あたり %) を計算する。
 *
 * 最初の期から最後の期までの複利成長率 = (最終売上 / 最初売上)^(1/(期数−1)) − 1。
 * 月次データなら「1 か月あたりの平均成長率」になる。期が 2 つ未満、または
 * 最初の期の売上が 0 以下なら null (算定不能 / 累乗の底が不正)。
 * 結果は 0.1% 単位に丸める。
 */
export function computeRevenueCagrPct(actuals: readonly KpiActual[]): number | null {
  const series = groupRevenueByPeriod(actuals);
  if (series.length < 2) return null;
  const first = series[0]!.revenue;
  const last = series[series.length - 1]!.revenue;
  if (first <= 0 || last < 0) return null;
  const periods = series.length - 1;
  const rate = Math.pow(last / first, 1 / periods) - 1;
  if (!Number.isFinite(rate)) return null;
  return Math.round(rate * 1000) / 10;
}

/** 売上トレンドの方向。期が足りない場合は null。 */
export type RevenueTrend = 'up' | 'down' | 'flat' | null;

/**
 * 直近の売上トレンドを移動平均で判定する。
 *
 * 末尾 `window` 期の移動平均と、その 1 期前を末尾とする移動平均を比べ、
 * 上昇 / 下降 / 横ばい (±1% 未満) を返す。比較に必要な `window + 1` 期に満たな
 * ければ null。`window` は 1 以上 (既定 3)。
 */
export function computeRevenueTrend(actuals: readonly KpiActual[], window = 3): RevenueTrend {
  const w = Math.max(1, Math.floor(window));
  const series = groupRevenueByPeriod(actuals);
  if (series.length < w + 1) return null;
  const mean = (from: number): number => {
    let sum = 0;
    for (let i = from; i < from + w; i += 1) sum += series[i]!.revenue;
    return sum / w;
  };
  const recent = mean(series.length - w);
  const prior = mean(series.length - w - 1);
  if (prior <= 0) return recent > 0 ? 'up' : 'flat';
  const change = (recent - prior) / prior;
  if (change > 0.01) return 'up';
  if (change < -0.01) return 'down';
  return 'flat';
}

/** 当年度の売上着地見込み (年換算)。 */
export interface RevenueLandingForecast {
  /** 対象年 (最新の期の YYYY)。 */
  readonly year: string;
  /** その年のうちデータがある月数 (経過月)。 */
  readonly monthsElapsed: number;
  /** 経過月までの実績売上合計。 */
  readonly actualToDate: number;
  /** 着地見込み = 実績 ÷ 経過月 × 12 (ランレート年換算, 円単位に丸め)。 */
  readonly runRateForecast: number;
}

/**
 * 直近年の月次実績から、当年度の売上着地見込み (ランレート年換算) を計算する。
 *
 * 最新の期 (`period` = YYYY-MM) の年 (YYYY) を対象年とし、その年のデータがある
 * 月の実績を合計して「実績 ÷ 経過月 × 12」で 12 か月分に年換算する。対象年に
 * データが無ければ null。経営の着地予測の最も素朴な指標 (季節性は考慮しない)。
 */
export function computeRevenueLandingForecast(
  actuals: readonly KpiActual[],
): RevenueLandingForecast | null {
  const series = groupRevenueByPeriod(actuals);
  if (series.length === 0) return null;
  const year = series[series.length - 1]!.period.slice(0, 4);
  const inYear = series.filter((s) => s.period.slice(0, 4) === year);
  const monthsElapsed = inYear.length;
  if (monthsElapsed === 0) return null;
  const actualToDate = inYear.reduce((sum, s) => sum + s.revenue, 0);
  const runRateForecast = Math.round((actualToDate / monthsElapsed) * 12);
  return { year, monthsElapsed, actualToDate, runRateForecast };
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

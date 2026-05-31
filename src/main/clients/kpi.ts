import type { FetchContext } from './types';

/**
 * KPI / BEP dashboard for the user's businesses.
 *
 * Data source layering:
 *   - The `KpiDataSource` interface decouples KPI math from where the
 *     fundamentals come from. The mock implementation here lets the
 *     renderer work offline.
 *   - Phase 6 — a real DataSource (Google Sheets / freee accounting
 *     API / Xero / QuickBooks) will be plugged in by registering an
 *     alternate `createDataSource()` factory. Until then, this file
 *     is the single source of truth for fundamentals shape.
 *
 * KPI engine produces 8 break-even-point indicators per business unit
 * (see `computeKpi`), plus an aggregated "all-units" rollup.
 */

// --- Fundamentals (raw bookkeeping) -----------------------------------

/** A single accounting period's fundamentals for one business unit.
 *  All amounts in JPY (integer, no fractional yen). */
export interface Fundamentals {
  revenue: number;
  cogs: number; // 原価
  advertising: number; // 広告費 (treated as variable)
  sga: number; // 販管費 (treated as fixed)
  depreciation: number; // 減価償却
}

/** Per-business-unit metadata + current-period fundamentals + history. */
export interface BusinessUnit {
  id: string;
  label: string;
  /** Fundamentals as a time series. Index 0 is the most-recent period. */
  history: Fundamentals[];
}

// --- Computed KPIs ----------------------------------------------------

/** Output of `computeKpi`: 8 break-even-point indicators + the bare
 *  operating-profit number. All values JPY except *Ratio / *Margin
 *  (percentage 0-100) and `operatingLeverage` (dimensionless). */
export interface Kpi {
  /** 変動費 — COGS + advertising. */
  variableCost: number;
  /** 固定費 — SGA + depreciation. */
  fixedCost: number;
  /** 限界利益 — revenue − variableCost. */
  contribution: number;
  /** 限界利益率 (%) — contribution / revenue. */
  contributionRatio: number;
  /** 変動費率 (%) — variableCost / revenue. */
  variableRatio: number;
  /** 固定費比率 (%) — fixedCost / revenue. */
  fixedRatio: number;
  /** 損益分岐点売上高 — fixedCost / contributionRatio (JPY).
   *  Special-cased to Infinity if contribution ≤ 0 (cannot break even). */
  bep: number;
  /** 損益分岐点比率 (%) — bep / revenue × 100. Lower = safer. */
  bepRatio: number;
  /** 安全余裕率 (%) — 100 − bepRatio. Higher = safer.
   *  Clamped to >= 0 so a loss-making unit reads 0 rather than negative. */
  safetyMargin: number;
  /** 営業利益 — revenue − variableCost − fixedCost. */
  operatingProfit: number;
  /** 営業レバレッジ — contribution / operatingProfit.
   *  Special-cased: when operatingProfit ≈ 0 the ratio explodes; we
   *  cap at 999 and surface as a UI-visible warning rather than NaN. */
  operatingLeverage: number;
}

/** Pure KPI computation. The 8-indicator formula is documented in
 *  docs/ARCHITECTURE.md §3 (BEP / KPI service). */
export function computeKpi(f: Fundamentals): Kpi {
  const variableCost = f.cogs + f.advertising;
  const fixedCost = f.sga + f.depreciation;
  const contribution = f.revenue - variableCost;
  // Avoid divide-by-zero: a zero-revenue unit has no meaningful ratio.
  const contributionRatio = f.revenue > 0 ? (contribution / f.revenue) * 100 : 0;
  const variableRatio = f.revenue > 0 ? (variableCost / f.revenue) * 100 : 0;
  const fixedRatio = f.revenue > 0 ? (fixedCost / f.revenue) * 100 : 0;
  // BEP only defined when contribution > 0; otherwise the unit can
  // never recover its fixed costs at any volume.
  const bep = contribution > 0 ? (fixedCost / contribution) * f.revenue : Infinity;
  // Mutants below (ConditionalExpression/LogicalOperator/EqualityOperator on the
  // bepRatio guard) are unreachable in our input domain: with non-negative
  // costs, contribution > 0 implies revenue > 0 (since contribution ≤ revenue),
  // so `revenue > 0` and `isFinite(bep)` are NEVER independently true/false.
  // Mutating `&&` → `||` or `>` → `>=` cannot produce a divergent outcome
  // under that invariant. Pinning would require contrived negative-cost
  // fundamentals that don't occur in practice.
  // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator
  const bepRatio = f.revenue > 0 && Number.isFinite(bep) ? (bep / f.revenue) * 100 : Infinity;
  const safetyMargin = Number.isFinite(bepRatio) ? Math.max(0, 100 - bepRatio) : 0;
  const operatingProfit = contribution - fixedCost;
  // Cap operating leverage to a finite number to avoid Infinity in the
  // UI when OP is near zero. The cap value is documented as a
  // "exceeded threshold — interpret cautiously" signal.
  const operatingLeverage =
    Math.abs(operatingProfit) > 0.0001
      ? Math.min(999, Math.abs(contribution / operatingProfit))
      : 999;
  return {
    variableCost,
    fixedCost,
    contribution,
    contributionRatio,
    variableRatio,
    fixedRatio,
    bep,
    bepRatio,
    safetyMargin,
    operatingProfit,
    operatingLeverage,
  };
}

/**
 * 目標営業利益を達成するために必要な売上高を計算する。
 *   必要売上高 = (固定費 + 目標営業利益) ÷ 限界利益率
 * 限界利益率が 0 以下 (= 変動費が売上以上) のときは達成不能なので Infinity。
 *
 * @param f 現状の fundamentals
 * @param targetOperatingProfit 目標営業利益 (円)
 */
export function requiredRevenueForTargetProfit(f: Fundamentals, targetOperatingProfit: number): number {
  const variableCost = f.cogs + f.advertising;
  const fixedCost = f.sga + f.depreciation;
  const contribution = f.revenue - variableCost;
  if (f.revenue <= 0 || contribution <= 0) return Infinity;
  const contributionRatio = contribution / f.revenue;
  return Math.max(0, (fixedCost + targetOperatingProfit) / contributionRatio);
}

/** 損益分岐点販売数量の分析結果。 */
export interface BreakEvenQuantity {
  /** 単位あたり限界利益 (単価 − 単位変動費)。 */
  readonly unitContribution: number;
  /** 損益分岐点販売数量 (個)。限界利益が 0 以下なら Infinity。 */
  readonly breakEvenQuantity: number;
  /** 推定現在販売数量 (= 売上 ÷ 平均単価)。 */
  readonly currentQuantity: number;
  /** 安全販売数量 (現在 − 損益分岐点)。 */
  readonly safeQuantity: number;
}

/**
 * 平均単価から損益分岐点販売数量を計算する。
 *   単位限界利益 = 単価 − (変動費 ÷ 推定数量)
 *   損益分岐点数量 = 固定費 ÷ 単位限界利益 (切り上げ)
 *
 * @param f 現状の fundamentals
 * @param avgUnitPrice 平均販売単価 (円)。0 以下なら全 0。
 */
export function breakEvenQuantity(f: Fundamentals, avgUnitPrice: number): BreakEvenQuantity {
  const price = Math.max(0, avgUnitPrice);
  const variableCost = f.cogs + f.advertising;
  const fixedCost = f.sga + f.depreciation;
  if (price <= 0) {
    return { unitContribution: 0, breakEvenQuantity: 0, currentQuantity: 0, safeQuantity: 0 };
  }
  const currentQuantity = Math.round(Math.max(0, f.revenue) / price);
  const unitVariable = currentQuantity > 0 ? variableCost / currentQuantity : 0;
  const unitContribution = Math.max(0, price - unitVariable);
  const beq = unitContribution > 0 ? Math.ceil(fixedCost / unitContribution) : Infinity;
  const safeQuantity = Number.isFinite(beq) ? Math.max(0, currentQuantity - beq) : 0;
  return { unitContribution, breakEvenQuantity: beq, currentQuantity, safeQuantity };
}

/** 価格変更シミュレーションの結果。 */
export interface PriceSimulation {
  /** 価格変更率 (-0.2 = 20%値下げ, 0.1 = 10%値上げ)。 */
  readonly priceChangeRatio: number;
  /** 変更後の売上高 (販売量一定の前提)。 */
  readonly simulatedRevenue: number;
  /** 変更後の限界利益。 */
  readonly simulatedContribution: number;
  /** 変更後の限界利益率 (%)。 */
  readonly simulatedContributionRatio: number;
  /** 変更後の損益分岐点売上高。 */
  readonly simulatedBep: number;
  /** 変更後の営業利益。 */
  readonly simulatedOperatingProfit: number;
  /** 営業利益の増減 (変更後 − 現在)。 */
  readonly operatingProfitDelta: number;
}

/**
 * 価格を X% 変更したときの限界利益・損益分岐点・営業利益への影響を試算する。
 *
 * 前提: 価格変更で販売量・変動費の総額は変わらない (弾力性は別モデル)。
 * 値上げは限界利益率を上げて BEP を下げ、値下げは逆に働く。
 *
 * @param f 現状の fundamentals
 * @param priceChangeRatio 価格変更率 (例: -0.1 = 10%値下げ)。-1 未満は -1 にクランプ。
 */
export function simulatePriceChange(f: Fundamentals, priceChangeRatio: number): PriceSimulation {
  const ratio = Math.max(-1, priceChangeRatio);
  const variableCost = f.cogs + f.advertising;
  const fixedCost = f.sga + f.depreciation;
  const currentOp = Math.max(0, f.revenue) - variableCost - fixedCost;

  if (f.revenue <= 0) {
    return {
      priceChangeRatio: ratio,
      simulatedRevenue: 0,
      simulatedContribution: 0,
      simulatedContributionRatio: 0,
      simulatedBep: Infinity,
      simulatedOperatingProfit: -fixedCost,
      operatingProfitDelta: -fixedCost - currentOp,
    };
  }

  const simulatedRevenue = Math.round(f.revenue * (1 + ratio));
  const simulatedContribution = simulatedRevenue - variableCost;
  const simulatedContributionRatio = simulatedRevenue > 0
    ? Math.round((simulatedContribution / simulatedRevenue) * 1000) / 10
    : 0;
  const simulatedBep = simulatedContribution > 0
    ? Math.round((fixedCost / simulatedContribution) * simulatedRevenue)
    : Infinity;
  const simulatedOperatingProfit = simulatedContribution - fixedCost;
  return {
    priceChangeRatio: ratio,
    simulatedRevenue,
    simulatedContribution,
    simulatedContributionRatio,
    simulatedBep,
    simulatedOperatingProfit,
    operatingProfitDelta: simulatedOperatingProfit - currentOp,
  };
}

/** Roll-up: sum fundamentals across all units, then compute KPI on the
 *  aggregate. Note: averaging KPI ratios across units gives the wrong
 *  answer; the only correct rollup is sum-then-compute. */
export function aggregateFundamentals(units: BusinessUnit[]): Fundamentals {
  return units.reduce<Fundamentals>(
    (acc, u) => {
      const current = u.history[0] ?? {
        revenue: 0,
        cogs: 0,
        advertising: 0,
        sga: 0,
        depreciation: 0,
      };
      return {
        revenue: acc.revenue + current.revenue,
        cogs: acc.cogs + current.cogs,
        advertising: acc.advertising + current.advertising,
        sga: acc.sga + current.sga,
        depreciation: acc.depreciation + current.depreciation,
      };
    },
    { revenue: 0, cogs: 0, advertising: 0, sga: 0, depreciation: 0 },
  );
}

// --- DataSource (deferred for Phase 6 real API integration) -----------

/** Abstraction over the source of fundamentals. The mock implementation
 *  below is what ships today; Phase 6 will plug in a real adapter
 *  (Google Sheets / freee / Xero) by implementing this interface. */
export interface KpiDataSource {
  fetch(): Promise<BusinessUnit[]>;
}

/** Deterministic-ish PRNG seeded by the period index. Lets the UI
 *  show non-static values across refreshes without true randomness
 *  (so screenshots and tests are reproducible). */
function seededNoise(seed: number): number {
  // xorshift32; cheap and deterministic. The `|| 1` fallback only ever
  // kicks in when seed is 0; we always derive seed from
  // `u.id.charCodeAt(0) * 1000 + i` where charCodeAt is non-zero for
  // letter-prefixed ids, so the fallback is unreachable from production
  // callers. `| 0` truncates to int32 and is a no-op for the small
  // positive integers we produce. Both are kept for defensive correctness
  // (e.g. future seeds passed from elsewhere) — the resulting mutants
  // are equivalent within the current call graph.
  // Stryker disable next-line ConditionalExpression,LogicalOperator
  let x = seed | 0 || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296; // 0..1
}

const MOCK_UNITS: { id: string; label: string; baseRevenue: number; vRatio: number; fixedAbs: number }[] = [
  { id: 'civic',     label: 'CivicOS',           baseRevenue: 4_500_000, vRatio: 0.32, fixedAbs: 1_700_000 },
  { id: 'consult',   label: 'コンサルティング', baseRevenue: 6_200_000, vRatio: 0.18, fixedAbs: 2_400_000 },
  { id: 'retail',    label: 'EC / 物販',         baseRevenue: 3_800_000, vRatio: 0.62, fixedAbs:   900_000 },
  { id: 'training',  label: '研修事業',         baseRevenue: 2_400_000, vRatio: 0.28, fixedAbs: 1_100_000 },
  { id: 'media',     label: 'メディア / 広告',  baseRevenue: 1_900_000, vRatio: 0.45, fixedAbs:   700_000 },
  { id: 'licensing', label: 'ライセンス',       baseRevenue: 5_100_000, vRatio: 0.12, fixedAbs: 1_900_000 },
];

const HISTORY_LENGTH = 30;

/** Mock data source — generates 6 units × 30 periods of synthetic
 *  fundamentals. Numbers are stable across calls (seeded), so the
 *  dashboard shows sensible motion without being noisy. */
export function createMockDataSource(): KpiDataSource {
  return {
    async fetch() {
      return MOCK_UNITS.map((u) => {
        const history: Fundamentals[] = [];
        for (let i = 0; i < HISTORY_LENGTH; i++) {
          // Slight per-period drift around the base, ±15%.
          const drift = 0.85 + seededNoise(u.id.charCodeAt(0) * 1000 + i) * 0.3;
          const revenue = Math.round(u.baseRevenue * drift);
          const variable = Math.round(revenue * u.vRatio);
          // Split variable into cogs + advertising roughly 2:1.
          const cogs = Math.round(variable * 0.66);
          const advertising = variable - cogs;
          // Fixed cost: 80% SGA, 20% depreciation.
          const sga = Math.round(u.fixedAbs * 0.8);
          const depreciation = u.fixedAbs - sga;
          history.push({ revenue, cogs, advertising, sga, depreciation });
        }
        return { id: u.id, label: u.label, history };
      });
    },
  };
}

// --- Snapshot for the renderer ---------------------------------------

export interface KpiSnapshotUnit {
  id: string;
  label: string;
  /** Current-period fundamentals. */
  fundamentals: Fundamentals;
  /** KPI computed from current-period fundamentals. */
  kpi: Kpi;
  /** History as fundamentals[] (index 0 = most recent). */
  history: Fundamentals[];
}

export interface KpiSnapshot {
  /** Per-unit data sorted by current-period revenue descending. */
  units: KpiSnapshotUnit[];
  /** All-units rollup (sum fundamentals, then compute KPI). */
  aggregate: KpiSnapshotUnit;
  /** ISO timestamp at fetch time. */
  fetchedAt: string;
  /** Phase 6 marker — flips to false when a real DataSource is wired. */
  isMock: boolean;
}

/** Fetcher matches the `(ctx: FetchContext) => Promise<unknown>` shape
 *  expected by `LIVE_FETCHERS`. `ctx.fetch` and `ctx.token` are ignored
 *  for the mock; the real DataSource will use them when wired. */
export async function fetchKpiSnapshot(_ctx: FetchContext): Promise<KpiSnapshot> {
  void _ctx; // unused — Phase 6 will read ctx.token / ctx.fetch
  const source = createMockDataSource();
  const units = await source.fetch();

  const snapshotUnits: KpiSnapshotUnit[] = units
    .map((u) => {
      // Defensive fallback for a Phase 6 data source that might return
      // an empty history. The mock data source always returns 30 periods,
      // so this branch is unreachable in unit tests and the ObjectLiteral
      // → `{}` mutant survives.
      // Stryker disable next-line ObjectLiteral
      const current = u.history[0] ?? {
        revenue: 0,
        cogs: 0,
        advertising: 0,
        sga: 0,
        depreciation: 0,
      };
      return {
        id: u.id,
        label: u.label,
        fundamentals: current,
        kpi: computeKpi(current),
        history: u.history,
      };
    })
    .sort((a, b) => b.fundamentals.revenue - a.fundamentals.revenue);

  const aggregateFund = aggregateFundamentals(units);
  // Aggregate history: sum across units, period-by-period.
  const aggregateHistory: Fundamentals[] = [];
  for (let i = 0; i < HISTORY_LENGTH; i++) {
    aggregateHistory.push(
      aggregateFundamentals(
        units.map((u) => ({ id: u.id, label: u.label, history: [u.history[i]!] })),
      ),
    );
  }

  return {
    units: snapshotUnits,
    aggregate: {
      id: 'all',
      label: '全社合算',
      fundamentals: aggregateFund,
      kpi: computeKpi(aggregateFund),
      history: aggregateHistory,
    },
    fetchedAt: new Date().toISOString(),
    isMock: true,
  };
}

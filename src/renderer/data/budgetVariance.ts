/**
 * 予算実績差異 (Budget vs Actual / BVA) — 経営管理 (FP&A) の中核指標。
 *
 * 予算 (計画) と実績を同じ期間粒度で集計し、売上・営業利益の差異額と達成率を
 * 出す純粋ロジック。予算は実績と同じ `KpiActual` 形で `kpi-budgets` コレクション
 * に保存し、本モジュールは IO を持たない (呼び出し側が record store から渡す)。
 *
 * 注意: 予算と実績は同じ期間粒度で入力する前提 (年間予算 vs 年間実績、または
 * 月次 vs 月次)。粒度が食い違うと達成率の意味が崩れるため、UI 側で注意喚起する。
 */
import {
  computeKpiMetrics,
  summarizeFundamentals,
  type KpiActual,
  type KpiFundamentals,
} from './kpiActuals';

/** 予算データのコレクションキー (実績 = kpi-actuals と対になる)。 */
export const KPI_BUDGETS_COLLECTION = 'kpi-budgets';

/** 1 指標の予実差異。 */
export interface VarianceLine {
  readonly budget: number;
  readonly actual: number;
  /** 差異 = 実績 − 予算 (プラスで予算超過)。 */
  readonly variance: number;
  /** 達成率 (%) = 実績 ÷ 予算 × 100。予算が 0 以下なら null。 */
  readonly achievementPct: number | null;
}

/** 売上・営業利益の予実差異。 */
export interface BudgetVariance {
  readonly revenue: VarianceLine;
  readonly operatingProfit: VarianceLine;
}

function line(budget: number, actual: number): VarianceLine {
  return {
    budget,
    actual,
    variance: actual - budget,
    achievementPct: budget > 0 ? Math.round((actual / budget) * 1000) / 10 : null,
  };
}

/** 予算・実績の Fundamentals から売上・営業利益の予実差異を計算する。 */
export function computeBudgetVarianceFromFundamentals(
  budget: KpiFundamentals,
  actual: KpiFundamentals,
): BudgetVariance {
  const budgetOp = computeKpiMetrics(budget).operatingProfit;
  const actualOp = computeKpiMetrics(actual).operatingProfit;
  return {
    revenue: line(budget.revenue, actual.revenue),
    operatingProfit: line(budgetOp, actualOp),
  };
}

/**
 * 予算・実績の明細 (`KpiActual[]`) を集計して予実差異を返す。
 * どちらかが空 (予算・実績が無い) のときは null (比較対象なし)。
 */
export function computeBudgetVariance(
  budgets: readonly KpiActual[],
  actuals: readonly KpiActual[],
): BudgetVariance | null {
  if (budgets.length === 0 || actuals.length === 0) return null;
  return computeBudgetVarianceFromFundamentals(
    summarizeFundamentals(budgets),
    summarizeFundamentals(actuals),
  );
}

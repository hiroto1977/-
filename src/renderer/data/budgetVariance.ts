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

// ---------------------------------------------------------------------------
// round 71: 予実管理の精緻化 (加算的) — 要因分解・YTD 達成率・着地見込み・有利/不利判定。
//
// **重要 — 概算の管理会計指標であり財務助言ではありません。** すべて純粋関数で、
// 入力は呼び出し側が record store から渡す前提。分母 0・負・非有限はガードして
// null を返す。
// ---------------------------------------------------------------------------

/**
 * 価格・数量の要因分解 (price-volume variance analysis)。
 *
 * 売上/費用差異を「単価の差」と「数量の差」の寄与に分ける管理会計の標準手法:
 *   価格差異 (price)  = (実績単価 − 予算単価) × 実績数量
 *   数量差異 (volume) = (実績数量 − 予算数量) × 予算単価
 * 合計 (price + volume) は総差異 (実績金額 − 予算金額) に一致する (代数的恒等式)。
 *
 * 注意: 単価 = 金額 ÷ 数量 の概算。数量が 0 や負・非有限なら分解不能で null。
 */
export interface PriceVolumeVariance {
  /** 予算金額 = 予算単価 × 予算数量。 */
  readonly budgetAmount: number;
  /** 実績金額 = 実績単価 × 実績数量。 */
  readonly actualAmount: number;
  /** 価格差異 = (実績単価 − 予算単価) × 実績数量。 */
  readonly priceVariance: number;
  /** 数量差異 = (実績数量 − 予算数量) × 予算単価。 */
  readonly volumeVariance: number;
  /** 総差異 = 実績金額 − 予算金額 (= price + volume)。 */
  readonly totalVariance: number;
}

function positiveQty(q: number): boolean {
  return Number.isFinite(q) && q > 0;
}

/**
 * 価格差異・数量差異に分解する。数量 (budgetQty / actualQty) は正の有限値である
 * 必要があり、いずれかが満たさなければ単価が定義できないため null を返す。
 */
export function decomposePriceVolumeVariance(
  budgetQty: number,
  budgetAmount: number,
  actualQty: number,
  actualAmount: number,
): PriceVolumeVariance | null {
  if (!positiveQty(budgetQty) || !positiveQty(actualQty)) return null;
  if (!Number.isFinite(budgetAmount) || !Number.isFinite(actualAmount)) return null;
  const budgetPrice = budgetAmount / budgetQty;
  const actualPrice = actualAmount / actualQty;
  const priceVariance = (actualPrice - budgetPrice) * actualQty;
  const volumeVariance = (actualQty - budgetQty) * budgetPrice;
  return {
    budgetAmount,
    actualAmount,
    priceVariance,
    volumeVariance,
    totalVariance: actualAmount - budgetAmount,
  };
}

/** 差異の有利 (favorable) / 不利 (unfavorable) / 中立 (neutral) 判定。 */
export type VarianceFavorability = 'favorable' | 'unfavorable' | 'neutral';

/**
 * 差異の有利/不利を判定する。
 * - 収益項目 (revenue): 実績 > 予算 (プラス差異) が有利。
 * - 費用項目 (cost):   実績 < 予算 (マイナス差異) が有利。
 * 差異が 0 (または非有限) なら neutral。
 */
export function classifyFavorability(
  variance: number,
  kind: 'revenue' | 'cost',
): VarianceFavorability {
  if (!Number.isFinite(variance) || variance === 0) return 'neutral';
  const good = kind === 'revenue' ? variance > 0 : variance < 0;
  return good ? 'favorable' : 'unfavorable';
}

/** 重要度判定つきの差異評価。 */
export interface VarianceAssessment {
  readonly variance: number;
  /** 差異率 (%) = 差異 ÷ |予算| × 100。予算 0 や非有限なら null。 */
  readonly variancePct: number | null;
  readonly favorability: VarianceFavorability;
  /** 差異率の絶対値がしきい値を超え要注意か。variancePct が null なら false。 */
  readonly material: boolean;
}

/**
 * 差異額・予算・項目種別と重要度しきい値 (既定 ±10%) から、有利/不利と要注意かを評価する。
 * しきい値は 0 以上の有限値である必要があり、満たさなければ既定 10 を使う。
 */
export function assessVariance(
  budget: number,
  actual: number,
  kind: 'revenue' | 'cost',
  thresholdPct = 10,
): VarianceAssessment {
  const variance = actual - budget;
  const denom = Math.abs(budget);
  const variancePct =
    denom > 0 && Number.isFinite(variance) ? Math.round((variance / denom) * 1000) / 10 : null;
  const threshold = Number.isFinite(thresholdPct) && thresholdPct >= 0 ? thresholdPct : 10;
  const material = variancePct !== null && Math.abs(variancePct) > threshold;
  return {
    variance,
    variancePct,
    favorability: classifyFavorability(variance, kind),
    material,
  };
}

/** 月次の予実達成行 + 累計 (YTD)。 */
export interface BudgetAchievementRow {
  readonly period: string;
  readonly budget: number;
  readonly actual: number;
  /** 当月達成率 (%) = 実績 ÷ 予算 × 100。予算 0 以下なら null。 */
  readonly achievementPct: number | null;
  /** 期初からの累計予算。 */
  readonly cumulativeBudget: number;
  /** 期初からの累計実績。 */
  readonly cumulativeActual: number;
  /** 累計 (YTD) 達成率 (%) = 累計実績 ÷ 累計予算 × 100。累計予算 0 以下なら null。 */
  readonly ytdAchievementPct: number | null;
}

function pct(numer: number, denom: number): number | null {
  if (!(denom > 0) || !Number.isFinite(numer)) return null;
  return Math.round((numer / denom) * 1000) / 10;
}

/**
 * 予算・実績の月次系列を突き合わせ、各月の達成率と累計 (YTD) 達成率を返す。
 *
 * 予算・実績は同じ period キーで対応づける (`Map`)。どちらかに無い period は欠損として
 * 0 とみなす (UI 側で注意喚起する前提)。period 昇順にソートして返す。両系列が空なら空配列。
 * 注意: 季節性・期ずれは考慮しない素朴な累計。
 */
export function computeMonthlyAchievement(
  budgets: readonly { period: string; revenue: number }[],
  actuals: readonly { period: string; revenue: number }[],
): BudgetAchievementRow[] {
  const budgetByPeriod = new Map<string, number>();
  for (const b of budgets) budgetByPeriod.set(b.period, b.revenue);
  const actualByPeriod = new Map<string, number>();
  for (const a of actuals) actualByPeriod.set(a.period, a.revenue);
  const periods = Array.from(new Set([...budgetByPeriod.keys(), ...actualByPeriod.keys()])).sort();
  let cumulativeBudget = 0;
  let cumulativeActual = 0;
  const rows: BudgetAchievementRow[] = [];
  for (const period of periods) {
    const budget = budgetByPeriod.get(period) ?? 0;
    const actual = actualByPeriod.get(period) ?? 0;
    cumulativeBudget += budget;
    cumulativeActual += actual;
    rows.push({
      period,
      budget,
      actual,
      achievementPct: pct(actual, budget),
      cumulativeBudget,
      cumulativeActual,
      ytdAchievementPct: pct(cumulativeActual, cumulativeBudget),
    });
  }
  return rows;
}

/** 着地見込み (ローリング予測) と予算との差。 */
export interface BudgetLandingForecast {
  /** 経過月数 (実績がある月数)。 */
  readonly monthsElapsed: number;
  /** 期の総月数 (既定 12)。 */
  readonly periodMonths: number;
  /** 進捗率 (%) = 経過月 ÷ 総月数 × 100。 */
  readonly progressPct: number;
  /** 経過月までの実績合計。 */
  readonly actualToDate: number;
  /** 着地見込み = 実績 ÷ 経過月 × 総月数 (ランレート, 円単位に丸め)。 */
  readonly forecast: number;
  /** 通期予算。 */
  readonly fullYearBudget: number;
  /** 着地見込み − 通期予算 (プラスで予算超過見込み)。 */
  readonly forecastVariance: number;
  /** 着地見込み達成率 (%) = 着地見込み ÷ 通期予算 × 100。予算 0 以下なら null。 */
  readonly forecastAchievementPct: number | null;
}

/**
 * 実績ペース (ランレート) で期末着地を予測し、通期予算との差を出す。
 *
 * 着地見込み = 実績合計 ÷ 経過月 × 総月数。経過月・総月数は正の有限値が必要で、
 * 経過月 > 総月数 のとき (=データが期超過) は予測が崩れるため null。
 * 注意: 線形ペースの素朴な予測 (季節性・案件偏在は無視)。
 */
export function computeBudgetLandingForecast(
  actualToDate: number,
  monthsElapsed: number,
  fullYearBudget: number,
  periodMonths = 12,
): BudgetLandingForecast | null {
  if (!positiveQty(monthsElapsed) || !positiveQty(periodMonths)) return null;
  if (monthsElapsed > periodMonths) return null;
  if (!Number.isFinite(actualToDate) || !Number.isFinite(fullYearBudget)) return null;
  const progressPct = Math.round((monthsElapsed / periodMonths) * 1000) / 10;
  const forecast = Math.round((actualToDate / monthsElapsed) * periodMonths);
  return {
    monthsElapsed,
    periodMonths,
    progressPct,
    actualToDate,
    forecast,
    fullYearBudget,
    forecastVariance: forecast - fullYearBudget,
    forecastAchievementPct: pct(forecast, fullYearBudget),
  };
}

/**
 * 損益感度分析 (What-if) — 売上が変動したとき営業利益がどう動くかを試算する純粋ロジック。
 *
 * 変動費 (売上原価 + 広告費) は売上に比例し、固定費 (販管費 + 減価償却費) は一定、
 * という KPI の費用構造 (computeKpiMetrics と整合) を前提に、売上を ±x% 振ったときの
 * 営業利益を再計算する。経営判断 (値引き・販促・需要変動への耐性) の感度を見る。
 * IO は持たない。
 *
 * **重要 — 概算試算であり財務助言ではありません。** 実際には変動費率や固定費も
 * 売上規模で変わりうる (本試算では一定と仮定)。
 */
import { type KpiFundamentals } from './kpiActuals';

/** 1 シナリオの感度結果。 */
export interface SensitivityRow {
  /** 売上変動率 (%)。例: -10, 0, +10。 */
  readonly deltaPct: number;
  /** そのシナリオの売上。 */
  readonly revenue: number;
  /** そのシナリオの営業利益。 */
  readonly operatingProfit: number;
  /**
   * そのシナリオの営業利益率 (%)。**売上 0 のときは `null` (割れない)。**
   *
   * 2026-09-08 まで `0` に倒していた。売上 0・固定費ありの控えでは
   * 営業利益が `-固定費` になるので、画面の同じ行が
   * **「営業利益 −300,000円 (赤) ／ 営業利益率 0.0%」**を並べた ——
   * **同時に真であり得ない 2 つの数字**である (パス 33 と同じ形)。
   *
   * 規準は**すぐ上の表**に在った —— `OverviewPage` の月次推移も
   * 同じ列名 (営業利益率) を同じ `pct1OrDash` で刷るが、
   * `monthlyTrend` は「売上 0 → 割れない」で `null` を返す。
   * `overview.ts` の `pctOfRevenue` の注記が列挙する 5 か所も同じ ——
   * このモジュールが**6 か所目**として取り残されていた。
   */
  readonly operatingMarginPct: number | null;
}

/**
 * 売上を各 deltaPct だけ振って営業利益を再計算する。
 *
 * 変動費率 = (cogs + advertising) / revenue を基準売上から求め、各シナリオの
 * 売上に乗じる。固定費 (sga + depreciation) は据え置き。
 * 営業利益 = 売上 − 売上×変動費率 − 固定費。
 * 基準売上が 0 のときは変動費率が定まらないので、どの deltaPct でも売上 0・
 * 営業利益 −固定費 の同じ行になり、**営業利益率は `null` (算定不能)** になる。
 *
 * @param f 基準の Fundamentals
 * @param deltas 売上変動率 (%) の配列。既定 [-10, -5, 0, 5, 10]
 */
export function profitSensitivity(
  f: KpiFundamentals,
  deltas: readonly number[] = [-10, -5, 0, 5, 10],
): SensitivityRow[] {
  const fixedCost = f.sga + f.depreciation;
  const variableRate = f.revenue > 0 ? (f.cogs + f.advertising) / f.revenue : 0;
  return deltas.map((deltaPct) => {
    const revenue = Math.round(f.revenue * (1 + deltaPct / 100));
    const operatingProfit = Math.round(revenue - revenue * variableRate - fixedCost);
    return {
      deltaPct,
      revenue,
      operatingProfit,
      // 売上 0 は「利益率 0%」ではなく**算定不能**。`0` に倒すと、同じ行の
      // 営業利益 (= −固定費) と矛盾する数字が並ぶ。
      operatingMarginPct: revenue > 0 ? Math.round((operatingProfit / revenue) * 1000) / 10 : null,
    };
  });
}

/**
 * 営業利益が 0 になる売上変動率 (%) を返す (損益分岐までの余地)。
 * 限界利益 (売上 − 変動費) が正のときのみ算定可能。基準が黒字なら負値 (何%まで
 * 売上が落ちても黒字か)、赤字なら正値。算定不能なら null。
 */
export function breakEvenDeltaPct(f: KpiFundamentals): number | null {
  if (f.revenue <= 0) return null;
  const variableRate = (f.cogs + f.advertising) / f.revenue;
  const contributionRate = 1 - variableRate;
  if (contributionRate <= 0) return null;
  const fixedCost = f.sga + f.depreciation;
  const breakEvenRevenue = fixedCost / contributionRate;
  return Math.round(((breakEvenRevenue - f.revenue) / f.revenue) * 1000) / 10;
}

/** 目標営業利益を達成するために必要な売上の逆算結果。 */
export interface TargetRevenue {
  /** 目標営業利益。 */
  readonly targetOperatingProfit: number;
  /**
   * 必要売上 = (固定費 + 目標利益) ÷ 限界利益率。**算定不能なら `null`。**
   *
   * 2026-09-08 まで `0` に倒していた —— **同じ return の `upliftPct` は
   * 最初から `null`** で、片方だけが倒れていた (パス 67 の `switchWindowOk` /
   * パス 69 の `accumulationRisk` と同じ位置関係)。
   * 「目標利益 100 万円を得るのに必要な売上は 0 円」は、算定不能に対して
   * **最も安心させる嘘**である。
   *
   * オブジェクト全体を `null` にする形 (`revenueConcentration.ts`) は採らない ——
   * `targetOperatingProfit` は**利用者が打ち込んだ値の控え**なので、
   * 算定できなくてもこのオブジェクトには意味が残る。
   */
  readonly requiredRevenue: number | null;
  /** 現状売上からの必要変動率 (%)。基準 0 や算定不能なら null。 */
  readonly upliftPct: number | null;
}

/**
 * 目標営業利益から必要売上を逆算する。
 * 必要売上 = (固定費 + 目標利益) ÷ 限界利益率。変動費率は基準売上から求める。
 * 限界利益率が非正、または基準売上が 0 のときは算定不能
 * (`requiredRevenue` も `upliftPct` も `null`)。
 */
export function requiredRevenueForTarget(
  f: KpiFundamentals,
  targetOperatingProfit: number,
): TargetRevenue {
  if (f.revenue <= 0) {
    return { targetOperatingProfit, requiredRevenue: null, upliftPct: null };
  }
  const variableRate = (f.cogs + f.advertising) / f.revenue;
  const contributionRate = 1 - variableRate;
  const fixedCost = f.sga + f.depreciation;
  if (contributionRate <= 0) {
    return { targetOperatingProfit, requiredRevenue: null, upliftPct: null };
  }
  const requiredRevenue = Math.round((fixedCost + targetOperatingProfit) / contributionRate);
  const upliftPct = Math.round(((requiredRevenue - f.revenue) / f.revenue) * 1000) / 10;
  return { targetOperatingProfit, requiredRevenue, upliftPct };
}

/** 固定費を削減したときのインパクト試算結果。 */
export interface FixedCostReduction {
  /** 削減率 (%)。 */
  readonly reductionPct: number;
  /** 削減後の固定費。 */
  readonly newFixedCost: number;
  /** 削減後の営業利益。 */
  readonly newOperatingProfit: number;
  /** 営業利益の改善額 (削減前比)。 */
  readonly profitImprovement: number;
}

/**
 * 固定費 (販管費 + 減価償却費) を各削減率だけ削ったときの営業利益を試算する。
 * 売上・変動費は不変。営業利益 = 限界利益 − 削減後固定費。削減額がそのまま
 * 営業利益の改善になる (固定費削減の直接効果)。
 *
 * @param f 基準の Fundamentals
 * @param reductions 固定費削減率 (%) の配列。既定 [5, 10, 20]
 */
export function fixedCostReductionImpact(
  f: KpiFundamentals,
  reductions: readonly number[] = [5, 10, 20],
): FixedCostReduction[] {
  const variableCost = f.cogs + f.advertising;
  const fixedCost = f.sga + f.depreciation;
  const contribution = f.revenue - variableCost;
  return reductions.map((reductionPct) => {
    const newFixedCost = Math.round(fixedCost * (1 - reductionPct / 100));
    const newOperatingProfit = Math.round(contribution - newFixedCost);
    return {
      reductionPct,
      newFixedCost,
      newOperatingProfit,
      profitImprovement: Math.round(fixedCost - newFixedCost),
    };
  });
}

/**
 * 営業レバレッジ (DOL: Degree of Operating Leverage) を計算する。
 *
 * DOL = 限界利益 ÷ 営業利益。「売上が 1% 増えると営業利益が DOL % 増える」という
 * 増幅率で、固定費比率が高い (＝レバレッジが高い) ほど売上変動の影響が大きい。
 * 営業利益が 0 以下のときは定義できないため null (赤字・分岐点では発散)。
 * 0.01 単位に丸める。
 *
 * @param f 基準の Fundamentals
 */
export function operatingLeverage(f: KpiFundamentals): number | null {
  const contribution = f.revenue - (f.cogs + f.advertising);
  const fixedCost = f.sga + f.depreciation;
  const operatingProfit = contribution - fixedCost;
  if (operatingProfit <= 0) return null;
  return Math.round((contribution / operatingProfit) * 100) / 100;
}

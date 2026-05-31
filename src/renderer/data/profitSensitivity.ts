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
  /** そのシナリオの営業利益率 (%)。売上 0 なら 0。 */
  readonly operatingMarginPct: number;
}

/**
 * 売上を各 deltaPct だけ振って営業利益を再計算する。
 *
 * 変動費率 = (cogs + advertising) / revenue を基準売上から求め、各シナリオの
 * 売上に乗じる。固定費 (sga + depreciation) は据え置き。
 * 営業利益 = 売上 − 売上×変動費率 − 固定費。
 * 基準売上が 0 のときは比率を出せないため、全シナリオ基準値のまま返す。
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
      operatingMarginPct: revenue > 0 ? Math.round((operatingProfit / revenue) * 1000) / 10 : 0,
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

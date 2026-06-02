/**
 * 事業別 財務インプット生成 (案A) — 各事業の月次 KPI（売上・原価・固定費・利益）から、
 * 年次の FinancialInputs（PL + 概算 BS/CF）を生成する純粋ロジック。
 *
 * 事業別の貸借対照表データは snapshot に無いため、ここで概算する。
 * - PL は月次×12 で年次化。
 * - BS は売上規模からスケールしつつ、**自己資本比率を収益性で変動**させる
 *   （高収益事業ほど自己資本が厚い）ことで、事業ごとに指標が意味のある差を持つ。
 * すべて概算であり、financialRatios.ts に渡して 15 指標を算出する。
 *
 * **重要 — 概算であり財務助言ではありません。** snapshot は模擬データ。
 */

import type { FinancialInputs } from './financialRatios';

/** deriveBusinessFinancials の入力 (月次)。 */
export interface MonthlyBusinessKpi {
  readonly revenue: number;
  readonly variableCost: number;
  readonly fixedCost: number;
  readonly profit: number; // 営業利益 (月次)
  readonly profitMargin: number; // 営業利益率 (%)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r0 = (n: number) => Math.round(n);

/** 月次 KPI → 年次 FinancialInputs (概算)。決定論的・純粋。 */
export function deriveBusinessFinancials(m: MonthlyBusinessKpi): FinancialInputs {
  // --- PL (年次) ---
  const revenue = r0(m.revenue * 12);
  const cogs = r0(m.variableCost * 12);
  const operatingProfit = r0(m.profit * 12);
  const depreciation = r0(revenue * 0.03); // 売上の約3%を減価償却と仮定
  const laborCost = r0(m.fixedCost * 12 * 0.5); // 固定費の約半分を人件費と仮定

  // --- BS (期末・概算) ---
  // 総資産は年商の約0.8倍（資産回転率≒1.25）。
  const totalAssets = Math.max(1, r0(revenue * 0.8));
  // 自己資本比率を営業利益率で変動 (15%〜65%)。高収益ほど自己資本が厚い。
  const equityRatio = clamp(0.3 + m.profitMargin / 100, 0.15, 0.65);
  const equity = r0(totalAssets * equityRatio);
  const currentAssets = r0(totalAssets * 0.55);
  const fixedAssets = totalAssets - currentAssets;
  const currentLiabilities = r0(totalAssets * 0.3);
  const fixedLiabilities = Math.max(0, totalAssets - equity - currentLiabilities);
  // 運転資本（年商/原価ベース）。
  const accountsReceivable = r0((revenue / 12) * 1.5); // 約1.5ヶ月分
  const inventory = r0((cogs / 12) * 1.0); // 約1ヶ月分
  const accountsPayable = r0((cogs / 12) * 1.2); // 約1.2ヶ月分
  // 有利子負債は固定負債の7割 + 流動負債の3割（短期借入相当）。
  const interestBearingDebt = r0(fixedLiabilities * 0.7 + currentLiabilities * 0.3);

  // --- 利息・経常・純利益 ---
  const interestExpense = r0(interestBearingDebt * 0.02); // 借入利率 約2%
  const ordinaryProfit = operatingProfit - interestExpense;
  const netProfit = r0(ordinaryProfit > 0 ? ordinaryProfit * 0.7 : ordinaryProfit); // 実効税率約30%

  return {
    revenue,
    cogs,
    operatingProfit,
    ordinaryProfit,
    netProfit,
    depreciation,
    laborCost,
    interestExpense,
    totalAssets,
    equity,
    currentAssets,
    currentLiabilities,
    fixedAssets,
    fixedLiabilities,
    accountsReceivable,
    inventory,
    accountsPayable,
    interestBearingDebt,
  };
}

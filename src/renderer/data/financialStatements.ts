/**
 * 財務三表ビルダー (Phase 3) — FinancialInputs から 損益計算書(PL) /
 * 貸借対照表(BS) / キャッシュフロー計算書(CF) の表示用ライン項目を組み立てる
 * 純粋ロジック。財務分析の指標・チャートと同じ FinancialInputs を源とするため、
 * 三表 ⇄ 指標 ⇄ チャートが自動的に連動する。
 *
 * **重要 — 概算であり財務助言ではありません。** CF は期間差データが無いため
 * 簡易間接法 (当期純利益 + 減価償却) の営業CF概算で、投資/財務CF は未モデル。
 */

import type { FinancialInputs } from './financialRatios';

export interface StatementLine {
  readonly label: string;
  /** 金額 (円)。見出し行で金額を出さない場合は null。 */
  readonly amount: number | null;
  /** インデント段数 (内訳行)。 */
  readonly indent?: number;
  /** 小計・合計などの強調行。 */
  readonly emphasis?: boolean;
}

const r0 = (n: number) => Math.round(n);

/** 損益計算書 (PL)。 */
export function buildIncomeStatement(f: FinancialInputs): StatementLine[] {
  const grossProfit = f.revenue - f.cogs;
  const sga = grossProfit - f.operatingProfit; // 販管費 = 売上総利益 − 営業利益
  const otherSga = Math.max(0, sga - f.laborCost - f.depreciation);
  const tax = Math.max(0, f.ordinaryProfit - f.netProfit); // 法人税等 (黒字時)
  return [
    { label: '売上高', amount: f.revenue, emphasis: true },
    { label: '売上原価', amount: f.cogs },
    { label: '売上総利益', amount: grossProfit, emphasis: true },
    { label: '販売費及び一般管理費', amount: sga },
    { label: '（うち 人件費）', amount: f.laborCost, indent: 1 },
    { label: '（うち 減価償却費）', amount: f.depreciation, indent: 1 },
    { label: '（うち その他）', amount: otherSga, indent: 1 },
    { label: '営業利益', amount: f.operatingProfit, emphasis: true },
    { label: '営業外費用（支払利息）', amount: f.interestExpense ?? 0 },
    { label: '経常利益', amount: f.ordinaryProfit, emphasis: true },
    { label: '法人税等', amount: tax },
    { label: '当期純利益', amount: f.netProfit, emphasis: true },
  ];
}

/** 貸借対照表 (BS)。資産の部と 負債・純資産の部。 */
export function buildBalanceSheet(f: FinancialInputs): {
  readonly assets: StatementLine[];
  readonly liabilitiesEquity: StatementLine[];
} {
  const cash = Math.max(0, f.currentAssets - f.accountsReceivable - f.inventory);
  const shortTermDebt = r0(f.currentLiabilities * 0.3);
  const otherCurrentLiab = Math.max(0, f.currentLiabilities - f.accountsPayable - shortTermDebt);
  const longTermDebt = Math.max(0, f.interestBearingDebt - shortTermDebt);
  const otherFixedLiab = Math.max(0, f.fixedLiabilities - longTermDebt);
  const totalLiabilities = f.currentLiabilities + f.fixedLiabilities;
  return {
    assets: [
      { label: '流動資産', amount: f.currentAssets, emphasis: true },
      { label: '現預金', amount: cash, indent: 1 },
      { label: '売上債権', amount: f.accountsReceivable, indent: 1 },
      { label: '棚卸資産', amount: f.inventory, indent: 1 },
      { label: '固定資産', amount: f.fixedAssets, emphasis: true },
      { label: '資産合計', amount: f.totalAssets, emphasis: true },
    ],
    liabilitiesEquity: [
      { label: '流動負債', amount: f.currentLiabilities, emphasis: true },
      { label: '仕入債務', amount: f.accountsPayable, indent: 1 },
      { label: '短期借入金', amount: shortTermDebt, indent: 1 },
      { label: '（その他流動負債）', amount: otherCurrentLiab, indent: 1 },
      { label: '固定負債', amount: f.fixedLiabilities, emphasis: true },
      { label: '長期借入金', amount: longTermDebt, indent: 1 },
      { label: '（その他固定負債）', amount: otherFixedLiab, indent: 1 },
      { label: '負債合計', amount: totalLiabilities, emphasis: true },
      { label: '純資産（自己資本）', amount: f.equity, emphasis: true },
      { label: '負債・純資産合計', amount: totalLiabilities + f.equity, emphasis: true },
    ],
  };
}

/** キャッシュフロー計算書 (簡易・間接法)。投資/財務は未モデルのため概算注記。 */
export function buildCashflowStatement(f: FinancialInputs): StatementLine[] {
  const operatingCf = f.operatingCashflow ?? f.netProfit + f.depreciation;
  // 投資CF: 設備投資 ≈ 減価償却費 と仮定 (維持投資) → マイナス。
  const investingCf = -f.depreciation;
  // 財務CF: 簡易にゼロ (借入の増減データが無い)。
  const financingCf = 0;
  return [
    { label: '営業活動によるキャッシュフロー', amount: operatingCf, emphasis: true },
    { label: '当期純利益', amount: f.netProfit, indent: 1 },
    { label: '減価償却費', amount: f.depreciation, indent: 1 },
    { label: '投資活動によるキャッシュフロー', amount: investingCf, emphasis: true },
    { label: '（維持投資 ≈ 減価償却費 と仮定）', amount: null, indent: 1 },
    { label: '財務活動によるキャッシュフロー', amount: financingCf, emphasis: true },
    { label: '（借入増減データ無し → 概算0）', amount: null, indent: 1 },
    { label: 'フリーキャッシュフロー（営業+投資）', amount: r0(operatingCf + investingCf), emphasis: true },
  ];
}

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
  /** 金額 (円)。見出し行や非金額行で金額を出さない場合は null。 */
  readonly amount: number | null;
  /** 金額セルに金額ではなくこの文字列を表示する (% や注記用)。 */
  readonly display?: string;
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

// --- 変動損益計算書 (限界利益方式) --------------------------------------
export function buildVariableCostingStatement(f: FinancialInputs): StatementLine[] {
  const variableCost = f.cogs; // 変動費 ≈ 売上原価
  const contribution = f.revenue - variableCost; // 限界利益
  const contributionRatio = f.revenue === 0 ? null : contribution / f.revenue;
  const fixedCost = contribution - f.operatingProfit; // 固定費 = 限界利益 − 営業利益
  const bep = contributionRatio == null || contributionRatio <= 0 ? null : r0(fixedCost / contributionRatio);
  return [
    { label: '売上高', amount: f.revenue, emphasis: true },
    { label: '変動費', amount: variableCost },
    { label: '限界利益', amount: contribution, emphasis: true },
    { label: '限界利益率', amount: null, display: contributionRatio == null ? '—' : `${(contributionRatio * 100).toFixed(1)}%` },
    { label: '固定費', amount: fixedCost },
    { label: '営業利益', amount: f.operatingProfit, emphasis: true },
    { label: '損益分岐点売上高', amount: bep, emphasis: true },
  ];
}

// --- 包括利益計算書 ------------------------------------------------------
export function buildComprehensiveIncome(f: FinancialInputs): StatementLine[] {
  // その他の包括利益(OCI: 有価証券評価差額金等)のデータが無いため 0 と仮定。
  const oci = 0;
  return [
    { label: '当期純利益', amount: f.netProfit, emphasis: true },
    { label: 'その他の包括利益', amount: oci },
    { label: '（データ無しのため 0 と仮定）', amount: null, indent: 1 },
    { label: '包括利益', amount: f.netProfit + oci, emphasis: true },
  ];
}

// --- 株主資本等変動計算書 -----------------------------------------------
export function buildEquityChangeStatement(f: FinancialInputs, dividendRate = 0): StatementLine[] {
  const dividend = r0(Math.max(0, f.netProfit) * dividendRate);
  const ending = f.equity; // 期末純資産
  const beginning = ending - f.netProfit + dividend; // 期首純資産 (逆算)
  return [
    { label: '当期首 純資産残高', amount: beginning, emphasis: true },
    { label: '当期純利益', amount: f.netProfit, indent: 1 },
    { label: '剰余金の配当', amount: dividend === 0 ? 0 : -dividend, indent: 1 },
    { label: '当期末 純資産残高', amount: ending, emphasis: true },
  ];
}

// --- 連結 (全事業合算) FinancialInputs ----------------------------------
/** 複数事業の FinancialInputs を合算する (連結・内部取引消去は無し=単純合算)。 */
export function sumFinancialInputs(list: readonly FinancialInputs[]): FinancialInputs {
  const z: FinancialInputs = {
    revenue: 0, cogs: 0, operatingProfit: 0, ordinaryProfit: 0, netProfit: 0,
    depreciation: 0, laborCost: 0, interestExpense: 0, totalAssets: 0, equity: 0,
    currentAssets: 0, currentLiabilities: 0, fixedAssets: 0, fixedLiabilities: 0,
    accountsReceivable: 0, inventory: 0, accountsPayable: 0, interestBearingDebt: 0,
  };
  return list.reduce<FinancialInputs>(
    (a, f) => ({
      revenue: a.revenue + f.revenue,
      cogs: a.cogs + f.cogs,
      operatingProfit: a.operatingProfit + f.operatingProfit,
      ordinaryProfit: a.ordinaryProfit + f.ordinaryProfit,
      netProfit: a.netProfit + f.netProfit,
      depreciation: a.depreciation + f.depreciation,
      laborCost: a.laborCost + f.laborCost,
      interestExpense: (a.interestExpense ?? 0) + (f.interestExpense ?? 0),
      totalAssets: a.totalAssets + f.totalAssets,
      equity: a.equity + f.equity,
      currentAssets: a.currentAssets + f.currentAssets,
      currentLiabilities: a.currentLiabilities + f.currentLiabilities,
      fixedAssets: a.fixedAssets + f.fixedAssets,
      fixedLiabilities: a.fixedLiabilities + f.fixedLiabilities,
      accountsReceivable: a.accountsReceivable + f.accountsReceivable,
      inventory: a.inventory + f.inventory,
      accountsPayable: a.accountsPayable + f.accountsPayable,
      interestBearingDebt: a.interestBearingDebt + f.interestBearingDebt,
    }),
    z,
  );
}

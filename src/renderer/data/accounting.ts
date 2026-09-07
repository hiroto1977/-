/**
 * 会計連携 (freee 等) の月次キャッシュフローを経営指標に集約する純粋ロジック。
 *
 * freee 会計サービス (`src/main/clients/freee.ts`) が取引から作る月次の
 * 収入・支出・純額 (営業CF) を受け取り、合計・平均・直近を要約し、現預金残高と
 * 合わせて資金ランウェイ (資金が尽きるまでの月数) を算出する。IO は持たない。
 *
 * **重要 — 概算であり財務助言ではありません。** 未連携 (月次が空) のときは
 * 何も算定しない (null) ため、デモ値が経営判断に混入しない。
 */

import {
  BALANCE_SHEET_STALE_AFTER_MONTHS,
  balanceSheetFreshness,
} from '../../shared/balanceSheetFreshness';

/** 会計連携の 1 か月分 (freee スナップショットの monthly と同形)。 */
export interface AccountingMonthly {
  readonly month: string;
  readonly income: number;
  readonly expense: number;
  /** 純額 (営業キャッシュフロー) = 収入 − 支出。 */
  readonly net: number;
}

/** 会計連携の月次キャッシュフロー要約。 */
export interface AccountingSummary {
  readonly months: number;
  readonly totalIncome: number;
  readonly totalExpense: number;
  /** 営業CF合計。 */
  readonly totalNet: number;
  /** 月次平均の営業CF (四捨五入)。 */
  readonly avgMonthlyNet: number;
  /**
   * 最も古い月 (`YYYY-MM`)。**位置ではなく月の綴りで決める** ——
   * 並び順は呼び手 (会計連携の返り) 任せなので、`monthly[0]` を信じると
   * 並びが変わった日に窓が逆さになる (同じ形の実害が `latestRecord` で在った)。
   */
  readonly firstMonth: string;
  readonly latestMonth: string;
  readonly latestNet: number;
  /** 期間合計の営業CF がプラスか。 */
  readonly cashflowPositive: boolean;
}

/**
 * 現預金の基準日と会計連携の最新月の隔たり (`accountingRecency` の返り)。
 * 隔たりが測れなければ `monthsBehind` は null で、`stale` も `ahead` も立たない
 * (**測れないときに「新しい」と言わない**)。
 */
export interface AccountingRecency {
  /** 会計連携の最新月 (`YYYY-MM`)。読めなければ null。 */
  readonly latestAccountingMonth: string | null;
  /** 現預金の基準日の月 (`YYYY-MM`)。読めなければ null。 */
  readonly cashAsOfMonth: string | null;
  /** 会計連携が現預金の基準日より何か月**古い**か。負なら会計のほうが新しい。 */
  readonly monthsBehind: number | null;
  /** しきい値を超えて会計が古いか。 */
  readonly stale: boolean;
  /** しきい値を超えて会計のほうが新しいか (基準日が古い側)。 */
  readonly ahead: boolean;
}

/** 月次明細を要約する。明細が無ければ null (未連携)。 */
export function summarizeAccounting(monthly: readonly AccountingMonthly[]): AccountingSummary | null {
  if (monthly.length === 0) return null;
  let totalIncome = 0;
  let totalExpense = 0;
  let totalNet = 0;
  for (const m of monthly) {
    totalIncome += m.income;
    totalExpense += m.expense;
    totalNet += m.net;
  }
  // 最新月は**綴りで**決める (`YYYY-MM` は辞書順 = 時系列順)。位置に頼らない。
  let latest = monthly[0]!;
  let first = monthly[0]!;
  for (const m of monthly) {
    if (m.month > latest.month) latest = m;
    if (m.month < first.month) first = m;
  }
  return {
    months: monthly.length,
    totalIncome,
    totalExpense,
    totalNet,
    avgMonthlyNet: Math.round(totalNet / monthly.length),
    firstMonth: first.month,
    latestMonth: latest.month,
    latestNet: latest.net,
    cashflowPositive: totalNet >= 0,
  };
}

/**
 * **現預金の基準日と、会計連携の最新月の隔たり。** (2026-09-07)
 *
 * 資金ランウェイは `貸借対照表の現預金 (基準日時点) ÷ 会計連携の月次平均営業CF` で、
 * **両辺が別の出所・別の窓**である。パス 35 の `balanceSheetFreshness` は基準日を
 * **KPI 実績の最新期**とだけ突き合わせるので、KPI を最新に保ったまま会計連携が
 * 何年も前で止まっている控えでは**何も鳴らない** —— 「今年の現預金 ÷ 2 年前の資金流出」で
 * 出したランウェイを、`critical` の所見と金融機関等提出用の書面が断言する。
 *
 * 算術は `balanceSheetFreshness` をそのまま使う (月の読み取りと差の計算を 2 つ持たない)。
 * 引数を入れ替えて呼ぶので、欄の名前だけここで付け直す。
 */
export function accountingRecency(
  balanceSheetAsOf: string | null | undefined,
  latestAccountingMonth: string | null | undefined,
  staleAfterMonths: number = BALANCE_SHEET_STALE_AFTER_MONTHS,
): AccountingRecency {
  // `balanceSheetFreshness(a, b)` は `b − a` を返す。会計が現預金の基準日より
  // どれだけ古いかが欲しいので `(会計の最新月, 基準日)` の順で渡す。
  const g = balanceSheetFreshness(latestAccountingMonth, balanceSheetAsOf, staleAfterMonths);
  return {
    latestAccountingMonth: g.asOfMonth,
    cashAsOfMonth: g.latestPeriod,
    monthsBehind: g.monthsBehind,
    stale: g.stale,
    ahead: g.ahead,
  };
}

/**
 * 資金ランウェイ (月数) = 現預金残高 ÷ 月次純流出。
 * 月次平均CF が 0 以上 (資金が増えている / 横ばい) なら null (流出していない)。
 * 現預金が 0 以下なら 0。結果は 0.1 か月単位に丸める。
 */
export function computeRunwayMonths(cash: number, avgMonthlyNet: number): number | null {
  if (avgMonthlyNet >= 0) return null;
  // cash===0 では計算経路でも 0/(-avgMonthlyNet)=0 になり <= → < は equivalent。
  // Stryker disable next-line EqualityOperator
  if (cash <= 0) return 0;
  return Math.round((cash / -avgMonthlyNet) * 10) / 10;
}

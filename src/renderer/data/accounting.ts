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
  readonly latestMonth: string;
  readonly latestNet: number;
  /** 期間合計の営業CF がプラスか。 */
  readonly cashflowPositive: boolean;
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
  const latest = monthly[monthly.length - 1]!;
  return {
    months: monthly.length,
    totalIncome,
    totalExpense,
    totalNet,
    avgMonthlyNet: Math.round(totalNet / monthly.length),
    latestMonth: latest.month,
    latestNet: latest.net,
    cashflowPositive: totalNet >= 0,
  };
}

/**
 * 資金ランウェイ (月数) = 現預金残高 ÷ 月次純流出。
 * 月次平均CF が 0 以上 (資金が増えている / 横ばい) なら null (流出していない)。
 * 現預金が 0 以下なら 0。結果は 0.1 か月単位に丸める。
 */
export function computeRunwayMonths(cash: number, avgMonthlyNet: number): number | null {
  if (avgMonthlyNet >= 0) return null;
  if (cash <= 0) return 0;
  return Math.round((cash / -avgMonthlyNet) * 10) / 10;
}

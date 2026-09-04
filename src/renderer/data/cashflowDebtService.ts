/**
 * 会計CF × 資金調達の同時連携 — 返済余力 (DSCR) の月次突合。
 *
 * 会計連携 (freee) の月次営業キャッシュフローと、資金調達レーダーの月次返済
 * スケジュールを**同じ月キーで突き合わせ**、DSCR (営業CF ÷ 返済額) を月次・全体で
 * 算出する純粋ロジック。「実際に稼いだ現金で借入返済をどれだけ賄えるか」を見る。
 * IO は持たない。
 *
 * **重要 — 概算であり財務助言ではありません。** 会計CF と返済予定の期間粒度が
 * 揃っている前提 (どちらも月次)。返済が無い月は DSCR の対象外 (分母にできない)。
 */
import type { AccountingMonthly } from './accounting';

/** 月次の返済額 (資金調達レーダーの monthly から repayment のみ取り出した形)。 */
export interface RepaymentMonthly {
  readonly month: string;
  readonly repayment: number;
}

/** 1 か月分の DSCR 突合。 */
export interface DscrMonth {
  readonly month: string;
  readonly operatingCashflow: number;
  readonly repayment: number;
  /** その月のカバー率 = 営業CF ÷ 返済額。返済が 0 なら null。 */
  readonly dscr: number | null;
}

/** 会計CF × 返済の DSCR 突合結果。 */
export interface CashflowDebtService {
  readonly months: readonly DscrMonth[];
  /** 全体カバー率 = 返済のある月の営業CF合計 ÷ 返済額合計。返済が無ければ null。 */
  readonly overallDscr: number | null;
  /** 返済のある月の最小カバー率 (ボトルネック月)。 */
  readonly worstMonthDscr: number | null;
  /** カバー率がしきい値 (既定 1.0) 未満の月数。 */
  readonly shortfallMonths: number;
  /** 評価対象 (返済がある) 月数。 */
  readonly coveredMonths: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * 会計CF (月→営業CF) と返済 (月→返済額) を月キーで突合し DSCR を算出する。
 * 返済のある月だけを評価対象とし、その月の営業CF (会計連携に無ければ 0) で割る。
 *
 * @param accounting freee 等の月次CF
 * @param repayments 資金調達の月次返済額
 * @param threshold 不足と判定するカバー率 (既定 1.0)
 */
export function combineCashflowDebtService(
  accounting: readonly AccountingMonthly[],
  repayments: readonly RepaymentMonthly[],
  threshold = 1,
): CashflowDebtService | null {
  // repayments が空 (または全て返済0) の場合は下の repayMonths.length===0 で null に
  // なるため、ここでは accounting のみ判定する (repayments の判定は冗長)。
  if (accounting.length === 0) return null;
  const cfByMonth = new Map<string, number>();
  for (const a of accounting) cfByMonth.set(a.month, (cfByMonth.get(a.month) ?? 0) + a.net);
  const repayByMonth = new Map<string, number>();
  for (const r of repayments) repayByMonth.set(r.month, (repayByMonth.get(r.month) ?? 0) + r.repayment);

  // 返済のある月だけが DSCR の対象。
  // 'YYYY-MM' 文字列は既定の辞書順ソートで時系列順になるため比較子は不要。
  const repayMonths = [...repayByMonth.keys()]
    .filter((m) => (repayByMonth.get(m) ?? 0) > 0)
    .sort();
  if (repayMonths.length === 0) return null;

  let totalCf = 0;
  let totalRepay = 0;
  let worst = Infinity;
  let shortfall = 0;
  const months: DscrMonth[] = repayMonths.map((month) => {
    const repayment = repayByMonth.get(month) ?? 0;
    const operatingCashflow = cfByMonth.get(month) ?? 0;
    const dscr = round2(operatingCashflow / repayment);
    totalCf += operatingCashflow;
    totalRepay += repayment;
    // dscr===worst のとき再代入しても同値のため < → <= は equivalent。
    // Stryker disable next-line EqualityOperator
    if (dscr < worst) worst = dscr;
    if (dscr < threshold) shortfall += 1;
    return { month, operatingCashflow, repayment, dscr };
  });

  return {
    months,
    // repayMonths は返済>0 の月のみ → totalRepay は必ず正。null 側は到達不能な防御。
    // Stryker disable next-line ConditionalExpression,EqualityOperator
    overallDscr: totalRepay > 0 ? round2(totalCf / totalRepay) : null,
    worstMonthDscr: Number.isFinite(worst) ? worst : null,
    shortfallMonths: shortfall,
    coveredMonths: months.length,
  };
}

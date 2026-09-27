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
 *
 * ## 分子が無い月も同じく対象外 (2026-09-07)
 *
 * 返済予定は**借入期間ぶん将来へ伸びる** —— `shared/funding.ts` の `monthlyFlow` は
 * 「返済が入金月より後に伸びることがあるため、返済月も対象に含める」と明記している。
 * ところが会計連携 (freee) の月次CF は**過去の月しか無い**。将来の各月を
 * `cfByMonth.get(m) ?? 0` で「営業CF 0」として割ると、DSCR 0 = 返済不足月になる。
 *
 * 実測 (営業CF 30 万/月・返済 105,167 円/月 × 60 回・会計は 6 か月):
 *
 * | | 全月を対象にする (直す前) | 会計の在る月だけ |
 * | --- | ---: | ---: |
 * | 返済余力 (DSCR) | **0.24** | 2.85 |
 * | 最悪月の返済余力 | **0** | 2.85 |
 * | カバー率 1.0 未満の月 | **55 / 60** | 0 / 5 |
 *
 * **実測した月では 2.85 倍で返せている会社が、画面でも金融機関等提出用の書面でも
 * 「返済余力 0.24・55 か月不足」と報告される。** 経営スコアカードの軸と経営ハイライトの
 * 警告にも同じ値が流れる。
 *
 * 「返済が無い月は分母にできない」のと同じ理屈で、**会計連携に月次CF が無い月は
 * 分子が無いので測れない**。測れない月は対象から外し、外した月数 (`unmatchedMonths`)
 * を返して画面と書面がそれを述べる —— **黙って狭めると、5 か月の突合が
 * 60 か月の借入についての主張に読める。**
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
  /** 評価対象 (返済があり、かつ会計連携に月次CFが在る) 月数。 */
  readonly coveredMonths: number;
  /**
   * 返済予定はあるが**会計連携に月次CFが無い**ため突合できなかった月数。
   *
   * 借入期間ぶん先まで伸びる返済予定に対し、実績CF は過去しか無いので、
   * 通常この数は大きい。**0 でない限り、上の 3 つは「突合できた月について」の
   * 数字である**ことを画面と書面が述べる。
   */
  readonly unmatchedMonths: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * 会計CF (月→営業CF) と返済 (月→返済額) を月キーで突合し DSCR を算出する。
 * **返済があり、かつ会計連携に月次CFが在る月だけ**を評価対象とする
 * (分子が無い月は測れない。上の「分子が無い月も同じく対象外」)。
 * 突合できた月が 1 つも無ければ `null` —— 0 を並べた答えを作らない。
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
  // **分子が在る月だけ**を突合する。`has` で見るので、実測して 0 だった月
  // (会計連携に載っている net 0) は対象に残る —— 未取得と実測ゼロを混ぜない。
  const matched = repayMonths.filter((m) => cfByMonth.has(m));
  const unmatchedMonths = repayMonths.length - matched.length;
  if (matched.length === 0) return null;

  let totalCf = 0;
  let totalRepay = 0;
  let worst = Infinity;
  let shortfall = 0;
  const months: DscrMonth[] = matched.map((month) => {
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
    // matched は返済>0 の月のみ → totalRepay は必ず正。null 側は到達不能な防御。
    // Stryker disable next-line ConditionalExpression,EqualityOperator
    overallDscr: totalRepay > 0 ? round2(totalCf / totalRepay) : null,
    worstMonthDscr: Number.isFinite(worst) ? worst : null,
    shortfallMonths: shortfall,
    coveredMonths: months.length,
    unmatchedMonths,
  };
}

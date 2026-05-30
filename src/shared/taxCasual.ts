/**
 * 一時所得の課税計算 (総合課税)。
 *
 * **重要 — これは概算試算であり、正確な税額計算・税務助言ではありません。**
 * 一時所得は、営利を目的とする継続的行為から生じた所得以外の一時の所得で、
 * 労務・役務の対価でも資産譲渡の対価でもないもの (国税庁 No.1490)。例:
 * 生命保険の満期返戻金・解約返戻金 (一時金)、懸賞・福引の賞金品、競馬・競輪の
 * 払戻金、法人からの贈与など。
 *
 * 計算の流れ:
 *   一時所得の金額 = 総収入金額 − 収入を得るための支出 − 特別控除額 (最高50万円)
 *   課税対象       = 一時所得の金額 × 1/2 (総合課税。給与等と合算して課税)
 *
 * 本モジュールは「課税対象に算入される 1/2 後の金額」を返す。実際の税額は
 * 他の所得と合算した課税所得に対して `taxCalc` の速算表を適用する。確定申告は
 * 公式ツール / 税理士で確認すること。
 */

function yen(n: number): number {
  return Math.round(n);
}

/** 一時所得の特別控除額の上限 (円)。 */
export const CASUAL_INCOME_SPECIAL_DEDUCTION = 500_000;

export interface CasualIncomeResult {
  /** 総収入金額。 */
  readonly grossIncome: number;
  /** 収入を得るために支出した金額 (必要経費)。 */
  readonly expenses: number;
  /** 適用された特別控除額 (最高50万円、利益額が上限)。 */
  readonly specialDeduction: number;
  /** 一時所得の金額 (1/2 する前。= max(0, 収入 − 経費 − 特別控除))。 */
  readonly casualIncome: number;
  /**
   * 総合課税の課税所得に算入される金額 (一時所得の金額 × 1/2)。
   * 他の所得と合算してから速算表を適用する。
   */
  readonly taxableAmount: number;
}

/**
 * 一時所得を計算する。
 *
 * 特別控除は「収入 − 経費」の利益額が上限 (利益が50万未満ならその額まで)。
 * 1/2 課税後の `taxableAmount` を他の所得と合算して総合課税する。
 *
 * @param grossIncome 総収入金額 (満期返戻金・賞金等)
 * @param expenses 収入を得るための支出 (払込保険料・馬券購入額等)
 */
export function calcCasualIncome(grossIncome: number, expenses = 0): CasualIncomeResult {
  const gross = Math.max(0, grossIncome);
  const cost = Math.max(0, expenses);
  // 特別控除前の利益 (収入 − 経費)。
  const profit = Math.max(0, gross - cost);
  // 特別控除は利益額が上限 (最高50万円)。
  const specialDeduction = Math.min(CASUAL_INCOME_SPECIAL_DEDUCTION, profit);
  const casualIncome = Math.max(0, profit - specialDeduction);
  return {
    grossIncome: gross,
    expenses: cost,
    specialDeduction,
    casualIncome,
    // 総合課税に算入されるのは 1/2。
    taxableAmount: yen(casualIncome / 2),
  };
}

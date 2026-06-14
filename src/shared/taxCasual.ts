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

// ---------------------------------------------------------------------------
// Round 81 — 一時所得の精緻化 (加算的)。
//
// **重要 — これらも概算試算であり、税務助言ではありません。**
// 上の `calcCasualIncome` は変更していません。以下は新規論点のみを追加します:
//   1. 生命保険満期金の一時所得 (満期金 − 既払込保険料 − 特別控除50万、×1/2)、
//      金融類似商品 (源泉分離課税) 該当時は一時所得対象外と判定。
//   2. 複数の一時所得の合算 — 各収入から「収入を得るための支出」を先に控除し、
//      残った利益の合計に対して 50万円の特別控除を一括適用 (頭打ち)、その後 ×1/2。
// ---------------------------------------------------------------------------

/** 有限な非負数に正規化する。非有限値は 0 とみなす。 */
function safeNonNeg(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * 金融類似商品 (源泉分離課税) の判定。
 *
 * 一時払の養老保険・損害保険等で、保険期間 (満期までの保有期間) が 5年以下、
 * または 5年以内に解約されたものは「金融類似商品」として 20.315% の
 * **源泉分離課税** となり、一時所得には算入されない (所得税法 174条等)。
 *
 * 一時払*でない*契約 (月払・年払の通常の養老保険等) は保有期間に関わらず
 * 一時所得 (満期金は一時、年金受取は雑所得) になる。
 *
 * @param lumpSumPremium 一時払契約かどうか (true = 一時払)
 * @param holdingYears 契約から満期/解約までの保有年数
 * @returns true = 源泉分離課税 (一時所得対象外)、false = 一時所得として総合課税
 */
export function isFinancialInstrumentMaturity(
  lumpSumPremium: boolean,
  holdingYears: number,
): boolean {
  if (!lumpSumPremium) return false;
  const years = Number.isFinite(holdingYears) ? holdingYears : Infinity;
  return years <= 5;
}

export interface LifeInsuranceMaturityResult {
  /** 一時所得として総合課税されるか (false = 源泉分離課税で対象外)。 */
  readonly isCasualIncome: boolean;
  /** 一時所得として計算した結果 (源泉分離課税の場合は null)。 */
  readonly casual: CasualIncomeResult | null;
}

/**
 * 生命保険満期金 (満期返戻金・解約返戻金の一時金) の一時所得を計算する。
 *
 * 一時所得 = 満期金 − 既払込保険料 − 特別控除50万、課税は ×1/2。
 * ただし一時払で保有 5年以下のもの (金融類似商品) は源泉分離課税となり
 * 一時所得には算入しないため `isCasualIncome: false`, `casual: null` を返す。
 *
 * @param maturityAmount 満期返戻金 (受取一時金)
 * @param paidPremiums 既払込保険料の総額
 * @param lumpSumPremium 一時払契約か (通常の月払・年払なら false)
 * @param holdingYears 保有年数 (一時払時の金融類似商品判定に使用、既定 Infinity)
 * @returns null = 入力が非有限で計算不能
 */
export function calcLifeInsuranceMaturity(
  maturityAmount: number,
  paidPremiums: number,
  lumpSumPremium: boolean,
  holdingYears = Infinity,
): LifeInsuranceMaturityResult | null {
  if (!Number.isFinite(maturityAmount) || !Number.isFinite(paidPremiums)) return null;
  if (isFinancialInstrumentMaturity(lumpSumPremium, holdingYears)) {
    return { isCasualIncome: false, casual: null };
  }
  return {
    isCasualIncome: true,
    casual: calcCasualIncome(maturityAmount, paidPremiums),
  };
}

/** 合算する一時所得 1件分の入力。 */
export interface CasualIncomeItem {
  /** 総収入金額 (満期金・賞金・払戻金等)。 */
  readonly grossIncome: number;
  /** その収入を得るために支出した金額 (払込保険料・馬券代等)。既定 0。 */
  readonly expenses?: number;
}

export interface AggregatedCasualIncomeResult {
  /** 各件の利益 (収入 − 経費、負は 0) の合計。特別控除前。 */
  readonly totalProfit: number;
  /** 一括適用した特別控除額 (最高50万円、合計利益が上限)。 */
  readonly specialDeduction: number;
  /** 一時所得の金額 (1/2 する前。= max(0, 合計利益 − 特別控除))。 */
  readonly casualIncome: number;
  /** 総合課税の課税所得に算入される金額 (× 1/2)。 */
  readonly taxableAmount: number;
}

/**
 * 同一年中の複数の一時所得を合算して計算する。
 *
 * 特別控除50万円は各件ごとではなく **合計に一度だけ** 適用する。流れ:
 *   1. 各件で「収入 − 収入を得るための支出」を先に控除 (件ごとに負は切り捨て 0)。
 *   2. 残った利益を合算。
 *   3. 合計利益から特別控除 (最高50万、合計利益が上限) を一括控除。
 *      → 控除しきれない特別控除を他の所得から控除することはできない (頭打ち)。
 *   4. 残額を ×1/2 して総合課税に算入。
 *
 * 合計利益が50万円未満なら全額が特別控除で相殺され課税0となる。
 *
 * @param items 一時所得の各件
 * @returns null = いずれかの入力が非有限で計算不能、または items が空
 */
export function calcAggregatedCasualIncome(
  items: readonly CasualIncomeItem[],
): AggregatedCasualIncomeResult | null {
  if (items.length === 0) return null;
  let totalProfit = 0;
  for (const item of items) {
    if (!Number.isFinite(item.grossIncome)) return null;
    const exp = item.expenses ?? 0;
    if (!Number.isFinite(exp)) return null;
    const gross = safeNonNeg(item.grossIncome);
    const cost = safeNonNeg(exp);
    // 件ごとに「収入を得るための支出」を先に控除 (件単位の損失は他件と通算しない)。
    totalProfit += Math.max(0, gross - cost);
  }
  // 特別控除は合計利益が上限 (最高50万円)。頭打ちで他所得には及ばない。
  const specialDeduction = Math.min(CASUAL_INCOME_SPECIAL_DEDUCTION, totalProfit);
  const casualIncome = Math.max(0, totalProfit - specialDeduction);
  return {
    totalProfit,
    specialDeduction,
    casualIncome,
    // 総合課税に算入されるのは 1/2。
    taxableAmount: yen(casualIncome / 2),
  };
}

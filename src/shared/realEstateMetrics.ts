/**
 * 不動産投資の利回り指標 (概算試算)。
 *
 * **重要 — これは概算試算であり、投資助言ではありません。**
 * 表面利回り・実質利回りは物件比較の目安です。実際の収支は空室・金利・税金・
 * 修繕・売却損益で大きく変動します。投資判断は専門家にご相談ください。
 *
 *   表面利回り = 年間満室賃料 ÷ 物件価格 × 100
 *   実質利回り = (年間賃料×入居率 − 年間経費) ÷ (物件価格 + 取得費) × 100
 */

function pct2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface RealEstateYield {
  /** 表面利回り (%)。 */
  readonly grossYieldPct: number;
  /** 実質利回り (%)。 */
  readonly netYieldPct: number;
  /** 実質の年間純収入 (賃料×入居率 − 経費)。 */
  readonly annualNetIncome: number;
  /** 年間満室賃料。 */
  readonly annualGrossRent: number;
}

/**
 * 不動産の表面利回り・実質利回りを計算する。
 *
 * @param monthlyRent 月額満室賃料 (円)
 * @param purchasePrice 物件価格 (円)。0 以下なら全指標 0 (ゼロ除算回避)。
 * @param occupancyRate 入居率 (0..1)。既定 1.0 (満室)。範囲外はクランプ。
 * @param annualExpense 年間経費 (管理費・修繕・税金等, 円)。既定 0。
 * @param acquisitionCost 取得費 (仲介手数料・登記等, 円)。既定 0。
 */
export function calcRealEstateYield(
  monthlyRent: number,
  purchasePrice: number,
  occupancyRate = 1,
  annualExpense = 0,
  acquisitionCost = 0,
): RealEstateYield {
  const rent = Math.max(0, monthlyRent);
  const price = Math.max(0, purchasePrice);
  const occ = Math.min(1, Math.max(0, occupancyRate));
  const expense = Math.max(0, annualExpense);
  const acqCost = Math.max(0, acquisitionCost);

  const annualGrossRent = rent * 12;
  const annualNetIncome = Math.round(annualGrossRent * occ - expense);

  if (price <= 0) {
    return { grossYieldPct: 0, netYieldPct: 0, annualNetIncome, annualGrossRent };
  }
  const grossYieldPct = pct2((annualGrossRent / price) * 100);
  const netYieldPct = pct2((annualNetIncome / (price + acqCost)) * 100);
  return { grossYieldPct, netYieldPct, annualNetIncome, annualGrossRent };
}

/** レバレッジ指標 (CCR・イールドギャップ) の結果。 */
export interface RealEstateLeverage {
  /** 年間のローン返済額 (元利)。 */
  readonly annualDebtService: number;
  /** ローン返済後の年間キャッシュフロー (実質純収入 − 返済額)。 */
  readonly annualCashflow: number;
  /** 自己資金回収率 CCR (%) = 返済後CF ÷ 自己資金。自己資金0なら0。 */
  readonly cashOnCashReturnPct: number;
  /** イールドギャップ (%) = 実質利回り − ローン金利。プラスなら正レバレッジ。 */
  readonly yieldGapPct: number;
}

/**
 * 不動産投資のレバレッジ指標 (CCR・イールドギャップ) を計算する。
 *
 * CCR (Cash on Cash Return) は投下した自己資金に対する手残りキャッシュフローの
 * 割合で、レバレッジ効率の目安。イールドギャップは実質利回りとローン金利の差で、
 * プラスなら借入が収益にプラスに働く (正レバレッジ)。
 *
 * @param annualNetIncome 実質の年間純収入 (calcRealEstateYield の annualNetIncome)
 * @param ownEquity 自己資金 (頭金 + 取得費の自己負担分, 円)。0 以下なら CCR 0。
 * @param annualDebtService 年間のローン返済額 (元利, 円)。既定 0。
 * @param netYieldPct 実質利回り (%, calcRealEstateYield の netYieldPct)
 * @param loanRatePct ローンの年利 (%)。
 */
export function calcRealEstateLeverage(
  annualNetIncome: number,
  ownEquity: number,
  annualDebtService: number,
  netYieldPct: number,
  loanRatePct: number,
): RealEstateLeverage {
  const debtService = Math.max(0, annualDebtService);
  const equity = Math.max(0, ownEquity);
  const annualCashflow = Math.round(annualNetIncome - debtService);
  const cashOnCashReturnPct = equity > 0 ? pct2((annualCashflow / equity) * 100) : 0;
  const yieldGapPct = pct2(netYieldPct - loanRatePct);
  return { annualDebtService: debtService, annualCashflow, cashOnCashReturnPct, yieldGapPct };
}

/**
 * 公的年金等控除・雑所得 (公的年金等) の計算。
 *
 * **重要 — これは概算試算であり、正確な税額計算・税務助言ではありません。**
 * 公的年金等 (国民年金・厚生年金・確定給付企業年金・iDeCo の年金受取等) は
 * 雑所得として「公的年金等控除」を差し引いて課税所得を求める (国税庁 No.1600)。
 * 控除額は受給者の年齢 (その年12/31時点で65歳以上か) と公的年金等の収入金額で
 * 変わる。公的年金等以外の合計所得 1,000万円超での控除引下げ等の細部は反映
 * しない簡易モデル。確定申告は公式ツール / 税理士で確認すること。
 */

function yen(n: number): number {
  return Math.round(n);
}

/** 公的年金等控除の最低額 (65歳未満)。 */
export const PENSION_DEDUCTION_MIN_UNDER65 = 600_000;
/** 公的年金等控除の最低額 (65歳以上)。 */
export const PENSION_DEDUCTION_MIN_OVER65 = 1_100_000;

/**
 * 公的年金等控除額を計算する (公的年金等以外の所得が1,000万円以下の場合)。
 *
 * 令和2年分以降の速算表 (国税庁 No.1600) に基づく:
 * - 65歳未満: 収入 ≤ 130万 → 60万 / ≤ 410万 → 収入×25%+27.5万 /
 *   ≤ 770万 → 収入×15%+68.5万 / ≤ 1,000万 → 収入×5%+145.5万 / 超 → 195.5万
 * - 65歳以上: 収入 ≤ 330万 → 110万 / ≤ 410万 → 収入×25%+27.5万 /
 *   ≤ 770万 → 収入×15%+68.5万 / ≤ 1,000万 → 収入×5%+145.5万 / 超 → 195.5万
 *
 * @param pensionIncome 公的年金等の収入金額 (円)
 * @param isOver65 その年12/31時点で65歳以上か
 */
export function calcPublicPensionDeduction(pensionIncome: number, isOver65: boolean): number {
  const income = Math.max(0, pensionIncome);
  if (income <= 0) return 0;

  if (isOver65) {
    if (income <= 3_300_000) return PENSION_DEDUCTION_MIN_OVER65;
  } else {
    if (income <= 1_300_000) return PENSION_DEDUCTION_MIN_UNDER65;
  }
  // 130万/330万超は年齢共通の速算式。
  if (income <= 4_100_000) return yen(income * 0.25 + 275_000);
  if (income <= 7_700_000) return yen(income * 0.15 + 685_000);
  if (income <= 10_000_000) return yen(income * 0.05 + 1_455_000);
  return 1_955_000;
}

export interface PublicPensionResult {
  /** 公的年金等控除額。 */
  readonly deduction: number;
  /** 公的年金等に係る雑所得 (= 収入 − 控除、負なら0)。 */
  readonly taxableIncome: number;
}

/**
 * 公的年金等の収入金額から雑所得 (課税対象) を計算する。
 * この雑所得を他の所得と合算して総合課税する。
 *
 * @param pensionIncome 公的年金等の収入金額 (円)
 * @param isOver65 その年12/31時点で65歳以上か
 */
export function calcPublicPensionIncome(pensionIncome: number, isOver65: boolean): PublicPensionResult {
  const income = Math.max(0, pensionIncome);
  const deduction = calcPublicPensionDeduction(income, isOver65);
  return { deduction, taxableIncome: Math.max(0, income - deduction) };
}

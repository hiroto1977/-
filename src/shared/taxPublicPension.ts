/**
 * 公的年金等控除・雑所得 (公的年金等) の計算。
 *
 * **重要 — これは概算試算であり、正確な税額計算・税務助言ではありません。**
 * 公的年金等 (国民年金・厚生年金・確定給付企業年金・iDeCo の年金受取等) は
 * 雑所得として「公的年金等控除」を差し引いて課税所得を求める (国税庁 No.1600)。
 * 控除額は受給者の年齢 (その年12/31時点で65歳以上か) と公的年金等の収入金額、
 * および公的年金等以外の合計所得金額の区分 (1,000万円以下 / 1,000万円超
 * 2,000万円以下 / 2,000万円超) で変わる (令和2年分以降)。後者の区分による
 * 控除逓減は `*WithOtherIncome` 関数で反映するが、それでもなお寡婦・障害者
 * 控除等を考慮しない簡易モデル。確定申告は公式ツール / 税理士で確認すること。
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

  // 公的年金等控除は連続関数: 各境界で隣接ブラケットの値が一致する
  // (例 income=1,300,000 → 600,000 = 1.3M×0.25+275,000)。そのため境界の
  // `<=` を `<` にする EqualityOperator mutation は equivalent。ブロックで無効化。
  // Stryker disable EqualityOperator
  if (isOver65) {
    if (income <= 3_300_000) return PENSION_DEDUCTION_MIN_OVER65;
  } else {
    if (income <= 1_300_000) return PENSION_DEDUCTION_MIN_UNDER65;
  }
  // 130万/330万超は年齢共通の速算式。
  if (income <= 4_100_000) return yen(income * 0.25 + 275_000);
  if (income <= 7_700_000) return yen(income * 0.15 + 685_000);
  if (income <= 10_000_000) return yen(income * 0.05 + 1_455_000);
  // Stryker restore EqualityOperator
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

// ---------------------------------------------------------------------------
// 精緻化 (round 78): 公的年金等以外の合計所得金額による控除逓減
// ---------------------------------------------------------------------------

/**
 * 公的年金等控除の計算で参照する「公的年金等に係る雑所得**以外**の
 * 合計所得金額」の区分 (令和2年分以降)。
 * - `'le10m'`   : 1,000万円以下 (基本の速算表)
 * - `'10mTo20m'`: 1,000万円超 2,000万円以下 (控除を一律 10万円 引下げ)
 * - `'gt20m'`   : 2,000万円超 (控除を一律 20万円 引下げ)
 */
export type OtherIncomeBracket = 'le10m' | '10mTo20m' | 'gt20m';

/** 合計所得 1,000万円 (区分の第1境界、円)。 */
export const OTHER_INCOME_TIER1 = 10_000_000;
/** 合計所得 2,000万円 (区分の第2境界、円)。 */
export const OTHER_INCOME_TIER2 = 20_000_000;

/**
 * 公的年金等以外の合計所得金額 (円) を区分に丸める。
 * 非有限 (NaN / ±Infinity) は判定不能なので最も有利な `'le10m'` に倒す (ガード)。
 *
 * @param otherIncome 公的年金等に係る雑所得以外の合計所得金額 (円)
 */
export function classifyOtherIncome(otherIncome: number): OtherIncomeBracket {
  if (!Number.isFinite(otherIncome)) return 'le10m';
  if (otherIncome <= OTHER_INCOME_TIER1) return 'le10m';
  if (otherIncome <= OTHER_INCOME_TIER2) return '10mTo20m';
  return 'gt20m';
}

/**
 * 各合計所得区分での控除引下げ額 (円)。基本表 (1,000万円以下) を 0 とし、
 * 1,000万円超 2,000万円以下で 10万円、2,000万円超で 20万円 を一律減額する。
 * この減額は最低控除額・速算式・上限のすべてに同額で適用される
 * (令和2年分以降の国税庁速算表 No.1600)。
 *
 * 例 (65歳以上の最低控除額): 110万 (≤1000万) → 100万 (1000万超2000万以下)
 *    → 90万 (2000万超)。65歳未満の最低控除額: 60万 → 50万 → 40万。
 */
const OTHER_INCOME_REDUCTION: Record<OtherIncomeBracket, number> = {
  le10m: 0,
  '10mTo20m': 100_000,
  gt20m: 200_000,
};

/**
 * 公的年金等控除額を、公的年金等以外の合計所得金額の区分まで考慮して計算する
 * (令和2年分以降の国税庁速算表 No.1600)。
 *
 * 基本の {@link calcPublicPensionDeduction} (= 合計所得1,000万円以下) を起点に、
 * 区分に応じた一律減額 (1,000万円超2,000万円以下 −10万円 / 2,000万円超 −20万円)
 * を行う。減額後も控除額は 0 を下回らない。
 *
 * @param pensionIncome 公的年金等の収入金額 (円)
 * @param isOver65 その年12/31時点で65歳以上か
 * @param otherIncome 公的年金等に係る雑所得以外の合計所得金額 (円)
 */
export function calcPublicPensionDeductionWithOtherIncome(
  pensionIncome: number,
  isOver65: boolean,
  otherIncome: number,
): number {
  // base は常に ≥ 0 (calcPublicPensionDeduction は 0 か正値)。最終 Math.max が
  // 下限 0 を保証するので、base=0 でも reduction を引いて 0 になり整合する。
  const base = calcPublicPensionDeduction(pensionIncome, isOver65);
  const reduction = OTHER_INCOME_REDUCTION[classifyOtherIncome(otherIncome)];
  return Math.max(0, base - reduction);
}

/**
 * 公的年金等の収入金額から雑所得 (課税対象) を、公的年金等以外の合計所得金額の
 * 区分まで考慮して計算する (令和2年分以降)。
 *
 * @param pensionIncome 公的年金等の収入金額 (円)
 * @param isOver65 その年12/31時点で65歳以上か
 * @param otherIncome 公的年金等に係る雑所得以外の合計所得金額 (円)
 */
export function calcPublicPensionIncomeWithOtherIncome(
  pensionIncome: number,
  isOver65: boolean,
  otherIncome: number,
): PublicPensionResult {
  const income = Math.max(0, pensionIncome);
  const deduction = calcPublicPensionDeductionWithOtherIncome(income, isOver65, otherIncome);
  return { deduction, taxableIncome: Math.max(0, income - deduction) };
}

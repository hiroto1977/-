/**
 * 贈与税の概算算定 (純粋ロジック・IO なし)。
 *
 * **重要 — これは概算であり税務助言ではありません。実際の申告・各種特例
 * (住宅取得等資金の贈与・教育資金の一括贈与・結婚子育て資金の一括贈与・
 * 配偶者控除 (おしどり贈与) 等) の非課税措置、および相続時精算課税の選択要件は
 * 必ず税理士に確認してください。**
 *
 * 日本の贈与税 (相続税法) の概算を、暦年課税 (`annualGiftTax`) と相続時精算課税
 * (`settlementGiftTax`) の 2 方式 (令和ベース) で単純化した教育的シミュレーション
 * です。`src/shared/taxInheritance.ts` (相続税) の姉妹モジュール。
 *
 * **本モジュールが扱わない範囲:**
 * - 各種非課税特例 (住宅取得等資金・教育資金一括贈与・結婚子育て資金一括贈与・
 *   贈与税の配偶者控除 (おしどり贈与) 等) は **一切対象外**。
 * - 相続時精算課税は「特別控除 2,500 万円 + 令和 6 年からの年 110 万円基礎控除」
 *   を反映した簡略モデルで、累計贈与額は呼び出し側が `cumulativePriorGifts` で渡す。
 *   贈与者ごとの累計管理・相続時の精算 (贈与財産の相続財産への加算) は扱わない。
 * - 贈与者・受贈者の関係 (直系尊属か否か・受贈者の年齢 18 歳以上か) の判定は
 *   呼び出し側の責務で、本モジュールは `giftType` をそのまま信頼する。
 *
 * ネットワーク / ファイル / Date.now / 乱数は一切使わない純粋関数のみ。
 */

/** 円未満を四捨五入 (内部計算の端数処理)。 */
function yen(n: number): number {
  return Math.round(n);
}

/**
 * 金額の入力検証。負値・非有限 (NaN / Infinity) は throw。
 * @param value 検証対象の金額 (円)
 * @param label エラーメッセージ用の項目名
 */
function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite number >= 0 (got ${value})`);
  }
}

// --- 暦年課税の基礎控除 --------------------------------------------------
//
// 贈与税 (暦年課税) の基礎控除 (相続税法 21 条の 5、租税特別措置法 70 条の 2 の 4):
//   その年に贈与を受けた財産の合計額から 110 万円を控除する。

/** 暦年課税の基礎控除 (110 万円 / 年)。 */
export const GIFT_ANNUAL_DEDUCTION = 1_100_000;

// --- 暦年課税の速算表 ----------------------------------------------------
//
// 贈与税の速算表 (相続税法 21 条の 7、租税特別措置法 70 条の 2 の 5、令和ベース)。
// 「基礎控除後の課税価格」(= 贈与額 − 110 万円) に対する税率と速算控除額。
// 一般贈与財産用と特例贈与財産用 (直系尊属から 18 歳以上の者への贈与) の 2 種。
// 税額 = 基礎控除後の課税価格 × 税率 − 控除額。

/** 贈与税の速算表ブラケット (基礎控除後課税価格の上限・税率・控除額)。 */
export interface GiftTaxBracket {
  /** この金額以下に適用 (Infinity = 上限なし)。 */
  readonly upTo: number;
  /** 税率 (0..1)。 */
  readonly rate: number;
  /** 速算控除額 (円)。 */
  readonly deduction: number;
}

// Stryker disable all : 以下は贈与税の速算表 (相続税法 21 条の 7 / 租特法 70 条の 2 の 5)
// の法定リテラル定義。税率・控除額・区分上限はいずれも税法上の固定値であり、
// リテラル変異は税法の改定であってテストで「正しい値」を pin しても等価変異に
// なりやすい。どの区分をどの課税価格に当てるか・税額の算式・境界比較は
// annualGiftTax の実値/境界テストで全面的に撃墜する。

/**
 * 一般贈与財産用の速算表 (基礎控除後の課税価格 昇順)。
 * 特例贈与財産以外の贈与 (兄弟間・夫婦間・親から未成年の子への贈与等) に適用。
 *   200 万円以下      10%  控除0
 *   300 万円以下      15%  控除10万
 *   400 万円以下      20%  控除25万
 *   600 万円以下      30%  控除65万
 *   1,000 万円以下    40%  控除125万
 *   1,500 万円以下    45%  控除175万
 *   3,000 万円以下    50%  控除250万
 *   3,000 万円超      55%  控除400万
 */
export const GENERAL_GIFT_BRACKETS: readonly GiftTaxBracket[] = [
  { upTo: 2_000_000, rate: 0.1, deduction: 0 },
  { upTo: 3_000_000, rate: 0.15, deduction: 100_000 },
  { upTo: 4_000_000, rate: 0.2, deduction: 250_000 },
  { upTo: 6_000_000, rate: 0.3, deduction: 650_000 },
  { upTo: 10_000_000, rate: 0.4, deduction: 1_250_000 },
  { upTo: 15_000_000, rate: 0.45, deduction: 1_750_000 },
  { upTo: 30_000_000, rate: 0.5, deduction: 2_500_000 },
  { upTo: Infinity, rate: 0.55, deduction: 4_000_000 },
];

/**
 * 特例贈与財産用の速算表 (基礎控除後の課税価格 昇順)。
 * 直系尊属 (父母・祖父母等) から贈与の年の 1 月 1 日において 18 歳以上の者
 * (子・孫等) への贈与に適用。
 *   200 万円以下      10%  控除0
 *   400 万円以下      15%  控除10万
 *   600 万円以下      20%  控除30万
 *   1,000 万円以下    30%  控除90万
 *   1,500 万円以下    40%  控除190万
 *   3,000 万円以下    45%  控除265万
 *   4,500 万円以下    50%  控除415万
 *   4,500 万円超      55%  控除640万
 */
export const SPECIAL_GIFT_BRACKETS: readonly GiftTaxBracket[] = [
  { upTo: 2_000_000, rate: 0.1, deduction: 0 },
  { upTo: 4_000_000, rate: 0.15, deduction: 100_000 },
  { upTo: 6_000_000, rate: 0.2, deduction: 300_000 },
  { upTo: 10_000_000, rate: 0.3, deduction: 900_000 },
  { upTo: 15_000_000, rate: 0.4, deduction: 1_900_000 },
  { upTo: 30_000_000, rate: 0.45, deduction: 2_650_000 },
  { upTo: 45_000_000, rate: 0.5, deduction: 4_150_000 },
  { upTo: Infinity, rate: 0.55, deduction: 6_400_000 },
];

// Stryker restore all

/**
 * 贈与の種別 (速算表の選択)。
 * - `'general'`: 一般贈与財産 (`GENERAL_GIFT_BRACKETS`)。
 * - `'special'`: 特例贈与財産 (`SPECIAL_GIFT_BRACKETS`、直系尊属から 18 歳以上の者へ)。
 */
export type GiftType = 'general' | 'special';

/** `giftType` のホワイトリスト。 */
const GIFT_TYPES: readonly GiftType[] = ['general', 'special'];

/** 種別から速算表を解決する。ホワイトリスト外は throw。 */
function bracketsFor(giftType: GiftType): readonly GiftTaxBracket[] {
  if (!GIFT_TYPES.includes(giftType)) {
    throw new Error(`giftType must be one of ${GIFT_TYPES.join(' | ')} (got ${giftType})`);
  }
  return giftType === 'special' ? SPECIAL_GIFT_BRACKETS : GENERAL_GIFT_BRACKETS;
}

/** `annualGiftTax` の入力。 */
export interface AnnualGiftTaxInput {
  /** その年に贈与を受けた財産の合計額 (円)。負値・非有限は throw。 */
  readonly giftAmount: number;
  /** 贈与の種別 (一般 / 特例)。ホワイトリスト外は throw。 */
  readonly giftType: GiftType;
}

/** `annualGiftTax` の結果。 */
export interface AnnualGiftTaxResult {
  /** 基礎控除後の課税価格 (= max(giftAmount − 110 万, 0))。 */
  readonly taxableAmount: number;
  /** 適用された税率 (0..1)。課税価格 0 のときは 0。 */
  readonly rate: number;
  /** 贈与税額 (100 円未満切捨後)。 */
  readonly tax: number;
}

/**
 * 暦年課税の贈与税を概算する。
 *
 * **概算であり税務助言ではない。実際の申告・各種非課税特例 (住宅取得等資金・
 * 教育資金一括贈与・結婚子育て資金一括贈与・贈与税の配偶者控除等) や相続時
 * 精算課税の選択要件は税理士に確認すること。** 本関数は各種非課税特例を
 * 一切反映しない。
 *
 * 手順 (相続税法 21 条の 5・21 条の 7):
 *   (1) 基礎控除後の課税価格 = max(giftAmount − 110 万円, 0)。0 なら税額 0。
 *   (2) 速算表 (`giftType` で一般 / 特例を選択) で 課税価格 × 税率 − 控除額。
 *   (3) **100 円未満を切り捨てる**。
 *
 * @throws giftAmount が負値・非有限のとき、giftType がホワイトリスト外のとき
 */
export function annualGiftTax({ giftAmount, giftType }: AnnualGiftTaxInput): AnnualGiftTaxResult {
  assertNonNegativeFinite(giftAmount, 'giftAmount');
  const brackets = bracketsFor(giftType);
  const taxableAmount = Math.max(0, giftAmount - GIFT_ANNUAL_DEDUCTION);
  // Stryker disable next-line ConditionalExpression,EqualityOperator: 課税価格 0 では速算表も税0を返すため早期returnと同値。
  if (taxableAmount === 0) return { taxableAmount: 0, rate: 0, tax: 0 };
  // 速算表は各区分の境界で連続 (速算控除額がそう設計されている) ため、区分上限
  // ちょうどの課税価格は現区分・次区分のいずれで計算しても税額が完全に一致する
  // (境界テストで実証)。したがって `<=`→`<` (EqualityOperator) は数学的に等価変異。
  // 区分選択・税率×金額−控除・Math.max(0,...)・100円未満切捨は実値テストで撃墜。
  // Stryker disable next-line EqualityOperator: 速算表は境界で連続のため <= と < が等価 (上記)。
  const bracket = brackets.find((b) => taxableAmount <= b.upTo);
  // Infinity 上限ブラケットが必ず最後に存在するため bracket は常に定義される。
  const raw = Math.max(0, yen(taxableAmount * bracket!.rate - bracket!.deduction));
  // 贈与税額は 100 円未満を切り捨てる (国税庁 贈与税の計算)。
  const tax = Math.floor(raw / 100) * 100;
  return { taxableAmount, rate: bracket!.rate, tax };
}

// --- 相続時精算課税 ------------------------------------------------------
//
// 相続時精算課税 (相続税法 21 条の 9〜21 条の 16、令和 6 年改正後):
//   特定贈与者 (60 歳以上の父母・祖父母) からの贈与について、受贈者 (18 歳以上の
//   推定相続人・孫) の選択により適用。令和 6 年 1 月 1 日以後の贈与から、毎年
//   110 万円の基礎控除が新設された。基礎控除後の累計が特別控除 2,500 万円を
//   超えた部分に一律 20% を課税する。

/** 相続時精算課税の特別控除 (2,500 万円・贈与者ごとの累計)。 */
export const SETTLEMENT_SPECIAL_DEDUCTION = 25_000_000;
/** 相続時精算課税の超過部分への一律税率 (20%)。 */
export const SETTLEMENT_TAX_RATE = 0.2;

/** `settlementGiftTax` の入力。 */
export interface SettlementGiftTaxInput {
  /** 本年に贈与を受けた財産の額 (円)。負値・非有限は throw。 */
  readonly giftAmount: number;
  /**
   * 過去年分の「基礎控除後の課税価格」の累計 (円)。任意・既定 0。負値・非有限は throw。
   * 同一の特定贈与者からの前年までの (年 110 万円控除後の) 累計を渡す簡略モデル。
   */
  readonly cumulativePriorGifts?: number;
}

/** `settlementGiftTax` の結果。 */
export interface SettlementGiftTaxResult {
  /**
   * 本年分の基礎控除後の課税価格 (= max(giftAmount − 110 万, 0))。
   * 累計ではなく本年単体の値。
   */
  readonly taxableAmount: number;
  /** 本年分の贈与税額 (特別控除超過部分 × 20%、100 円未満切捨後)。 */
  readonly tax: number;
}

/**
 * 相続時精算課税の贈与税を概算する (令和 6 年以降の年 110 万円基礎控除込み)。
 *
 * **概算であり税務助言ではない。実際の申告・各種非課税特例 (住宅取得等資金・
 * 教育資金一括贈与・結婚子育て資金一括贈与等) や相続時精算課税の選択要件
 * (対象となる贈与者・受贈者の年齢・届出) は税理士に確認すること。** 本関数は
 * 各種非課税特例・相続時の精算 (相続財産への加算) を一切反映しない簡略モデル。
 *
 * 手順 (相続税法 21 条の 12、令和 6 年改正):
 *   (1) 本年分の基礎控除後の課税価格 = max(giftAmount − 110 万円, 0)。
 *   (2) 過去累計 `cumulativePriorGifts` と合算し、特別控除 2,500 万円を超えた
 *       部分のうち **本年分が負担する額** に一律 20% を課税する。
 *   (3) **100 円未満を切り捨てる**。
 *
 * @throws giftAmount / cumulativePriorGifts が負値・非有限のとき
 */
export function settlementGiftTax({
  giftAmount,
  cumulativePriorGifts = 0,
}: SettlementGiftTaxInput): SettlementGiftTaxResult {
  assertNonNegativeFinite(giftAmount, 'giftAmount');
  assertNonNegativeFinite(cumulativePriorGifts, 'cumulativePriorGifts');
  const taxableAmount = Math.max(0, giftAmount - GIFT_ANNUAL_DEDUCTION);
  // 累計後の特別控除超過額 − 本年前の特別控除超過額 = 本年が負担する超過額。
  // 過去累計が既に特別控除を使い切っている場合は本年分の課税価格全額が超過部分。
  const priorOver = Math.max(0, cumulativePriorGifts - SETTLEMENT_SPECIAL_DEDUCTION);
  const totalOver = Math.max(0, cumulativePriorGifts + taxableAmount - SETTLEMENT_SPECIAL_DEDUCTION);
  const thisYearOver = totalOver - priorOver;
  const raw = yen(thisYearOver * SETTLEMENT_TAX_RATE);
  // 贈与税額は 100 円未満を切り捨てる (国税庁 贈与税の計算)。
  const tax = Math.floor(raw / 100) * 100;
  return { taxableAmount, tax };
}

/**
 * 国民年金保険料 (第1号被保険者) の概算算定 (純粋関数のみ、IO なし)。
 *
 * **重要 — これは概算であり税務/社会保険助言ではありません。** 保険料額は年度ごと
 * に改定され、免除の可否・前納割引・追納は日本年金機構/市区町村に確認してください。
 *
 * 自営業者・学生・無職など、厚生年金に加入しない第1号被保険者が対象。厚生年金
 * (被用者保険) の概算は別モジュール `taxSocialInsurance.ts` を参照 (別物)。また
 * 年金「受取」側の所得課税は `taxPublicPension.ts` であり、本モジュールが扱う
 * 「保険料の支払」とは別ドメイン。
 *
 * 構成:
 * - 定額保険料: 全被保険者が納める月額の基本保険料。免除区分に応じて納付割合が下がる。
 * - 付加保険料: 任意加入の上乗せ (付加年金)。免除の影響を受けず、加入時のみ月額で課される。
 *
 * **本モジュールでは扱わない**: 前納割引 (まとめ払い割引)・追納時の加算額・当期
 * 納付額を超える将来分。学生納付特例・納付猶予は当期納付額 0 として扱う (将来追納
 * は可能だが本モジュールは当期納付額のみ算定)。
 */

// --- 制度上の固定値 (令和7年度) ----------------------------------------------
//
// Stryker disable all : 制度上の固定値 (令和7年度の保険料月額)。これらの定数
// リテラル自体を書き換える変異は「別年度の制度値を表す別モジュール」であり、本
// モジュールが表現する令和7年度の制度とは等価でない (テストは月額・付加額を実値
// で pin しており、定数を経由した算定結果も実値テストで撃墜される)。

/**
 * 定額保険料の月額 (円)。令和7年度 (2025年度) は 17,510 円/月。
 *
 * 年度ごとに改定されるため定数化している。正確な額・改定は日本年金機構に確認すること。
 */
export const NATIONAL_PENSION_MONTHLY = 17_510;

/**
 * 付加保険料の月額 (円)。付加年金は月額 400 円/月の任意加入。
 *
 * 付加保険料は定額で、定額保険料の免除区分の影響を受けない。
 */
export const ADDITIONAL_PENSION_MONTHLY = 400;

// Stryker restore all

/**
 * 国民年金保険料の免除区分 (ホワイトリスト)。各区分の **納付割合** は次のとおり:
 *
 * - `none`: 免除なし → 納付 **1** (全額納付)。
 * - `quarter`: 4分の1免除 → 1/4 が免除され、納付 **3/4** (0.75)。
 * - `half`: 半額免除 → 半分が免除され、納付 **1/2** (0.5)。
 * - `threeQuarter`: 4分の3免除 → 3/4 が免除され、納付 **1/4** (0.25)。
 * - `full`: 全額免除 → 納付 **0**。
 * - `studentOrDeferral`: 学生納付特例・納付猶予 → 当期納付 **0** (将来追納可能)。
 *
 * 名称 (免除割合) と納付割合は逆数関係で紛らわしいため、納付割合を明記している。
 */
export type ExemptionLevel =
  | 'none'
  | 'quarter'
  | 'half'
  | 'threeQuarter'
  | 'full'
  | 'studentOrDeferral';

// Stryker disable all : 免除区分→納付割合の写像テーブル (制度上の固定値)。各
// リテラルの書き換えは「別の納付割合を表す別制度」であり等価でない。全区分の
// 納付割合は paymentRatio の実値テストで個別に pin して撃墜する。
const PAYMENT_RATIO: Readonly<Record<ExemptionLevel, number>> = {
  none: 1,
  quarter: 0.75,
  half: 0.5,
  threeQuarter: 0.25,
  full: 0,
  studentOrDeferral: 0,
};
// Stryker restore all

/**
 * 免除区分から **納付割合** を返す純粋写像。
 *
 * 納付割合: none=1 / quarter=0.75 / half=0.5 / threeQuarter=0.25 / full=0 /
 * studentOrDeferral=0。免除割合ではなく「納付する割合」を返す点に注意。
 *
 * **概算であり税務/社会保険助言ではありません。** 免除の可否・割合は日本年金機構/
 * 市区町村に確認してください。
 *
 * @param exemption 免除区分。ホワイトリスト外は throw。
 */
export function paymentRatio(exemption: ExemptionLevel): number {
  if (!Object.prototype.hasOwnProperty.call(PAYMENT_RATIO, exemption)) {
    throw new Error(`paymentRatio: unknown exemption level: ${exemption}`);
  }
  return PAYMENT_RATIO[exemption];
}

/** `nationalPensionPremium` の入力。 */
export interface NationalPensionPremiumInput {
  /**
   * 納付月数。既定 12 (1 年分)。1..12 の整数を想定するが、複数年分など任意の
   * 正整数も受け付ける。0 以下・非整数・非有限は throw。
   */
  readonly months?: number;
  /** 免除区分。既定 `'none'` (全額納付)。ホワイトリスト外は throw。 */
  readonly exemption?: ExemptionLevel;
  /** 付加保険料 (任意加入) に加入するか。既定 false。 */
  readonly withAdditional?: boolean;
}

/** 国民年金保険料の概算内訳 (円)。 */
export interface NationalPensionPremiumBreakdown {
  /** 定額保険料の月額 (円)。`NATIONAL_PENSION_MONTHLY`。 */
  readonly baseMonthly: number;
  /** 適用した納付割合 (免除区分に対応)。 */
  readonly paymentRatio: number;
  /** 納付月数。 */
  readonly months: number;
  /** 定額保険料の合計 (円)。round(月額 × 納付割合) × 月数。 */
  readonly basePremium: number;
  /** 付加保険料の合計 (円)。加入時 400 × 月数、未加入時 0。 */
  readonly additionalPremium: number;
  /** 基本 + 付加の合計 (円)。 */
  readonly total: number;
}

/**
 * 国民年金保険料 (第1号被保険者) の当期納付額を概算する。
 *
 * 算定:
 * - 定額保険料 = round(月額 × 納付割合) × 月数 (1 か月あたりの納付額を **四捨五入**
 *   で円単位に丸めてから月数を乗じる)。
 * - 付加保険料 = 加入時のみ 400 円 × 月数。付加保険料は免除区分の影響を受けない
 *   (定額保険料が免除されても付加は満額)。
 *
 * **重要 — これは概算であり税務/社会保険助言ではありません。** 保険料額は年度ごと
 * に改定され、免除の可否・前納割引・追納は日本年金機構/市区町村に確認してください。
 * 前納割引・追納加算は本モジュールでは扱いません。
 *
 * @param input months (既定 12)・exemption (既定 'none')・withAdditional (既定 false)。
 */
export function nationalPensionPremium(
  input: NationalPensionPremiumInput = {},
): NationalPensionPremiumBreakdown {
  const { months = 12, exemption = 'none', withAdditional = false } = input;
  if (!Number.isInteger(months) || months <= 0) {
    throw new Error(`nationalPensionPremium: months must be a positive integer, got ${months}`);
  }
  const ratio = paymentRatio(exemption);
  const basePremium = Math.round(NATIONAL_PENSION_MONTHLY * ratio) * months;
  const additionalPremium = withAdditional ? ADDITIONAL_PENSION_MONTHLY * months : 0;
  return {
    baseMonthly: NATIONAL_PENSION_MONTHLY,
    paymentRatio: ratio,
    months,
    basePremium,
    additionalPremium,
    total: basePremium + additionalPremium,
  };
}

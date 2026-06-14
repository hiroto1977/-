/**
 * 個人事業税 (地方税・都道府県) の概算算定 (純粋関数のみ、IO なし)。
 *
 * **重要 — これは概算であり税務助言ではありません。法定業種の区分判定・各種控除・
 * 税率・課税要否は都道府県税事務所に確認してください。**
 * 個人事業税 (地方税法 72 条の2 等) の標準的な仕組みを単純化したシミュレーションで、
 * 法定 70 業種の細かな区分判定・所得計算の特例・自治体ごとの運用・年度改正を
 * 完全には反映しません。業種区分の判定そのものは本モジュールの対象外で、呼び出し側が
 * {@link BusinessCategory} を確定して渡す前提です。
 *
 * **所得の計算 (所得税の事業所得) は本モジュールの対象外で、入力として受け取ります。**
 * 事業所得・青色申告特別控除の足し戻し額・繰越控除額は呼び出し側で確定してください。
 *
 * UI から切り離して単体テスト可能にするため、計算はすべてここに集約する。
 */

/**
 * 個人事業税の法定業種区分 (ホワイトリスト)。税率が区分により異なる。
 *
 * - `category1` — 第1種事業 (物品販売業・製造業・飲食店業など大多数の事業)。税率 5%。
 * - `category2` — 第2種事業 (畜産業・水産業・薪炭製造業)。税率 4%。
 * - `category3_5pct` — 第3種事業のうち税率 5% のもの (医業・弁護士業・税理士業など)。
 * - `category3_3pct` — 第3種事業のうち税率 3% のもの
 *   (あんま・マッサージ・指圧・はり・きゅう・装蹄師業)。
 * - `nonTaxable` — 法定業種に該当しない非課税の事業 (税額は常に 0)。
 */
export type BusinessCategory =
  | 'category1'
  | 'category2'
  | 'category3_5pct'
  | 'category3_3pct'
  | 'nonTaxable';

/**
 * 事業主控除の年額 (290 万円)。地方税法 72 条の49の14。
 *
 * 事業を行った期間が 1 年未満の場合は月割 ({@link soleProprietorDeduction})。
 */
export const SOLE_PROPRIETOR_DEDUCTION = 2_900_000;

/**
 * 業種区分から個人事業税の税率を返す (0..1)。
 *
 * **概算であり税務助言ではない。法定業種の区分判定・各種控除・税率・課税要否は
 * 都道府県税事務所に確認すること。**
 *
 * - `category1` = 0.05 (5%)
 * - `category2` = 0.04 (4%)
 * - `category3_5pct` = 0.05 (5%)
 * - `category3_3pct` = 0.03 (3%)
 * - `nonTaxable` = 0 (非課税)
 *
 * @param category 法定業種区分 ({@link BusinessCategory})
 * @returns 税率 (0..1)
 * @throws category がホワイトリスト外のとき
 */
export function businessTaxRate(category: BusinessCategory): number {
  switch (category) {
    // Stryker disable next-line all: 税率テーブルの固定値。法定税率であり値ミューテーションは仕様違反。境界は individualBusinessTax の実値テストで撃墜。
    case 'category1':
      return 0.05;
    // Stryker disable next-line all: 第2種事業の法定税率 4% の固定値。
    case 'category2':
      return 0.04;
    // Stryker disable next-line all: 第3種事業 (5%) の法定税率の固定値。
    case 'category3_5pct':
      return 0.05;
    // Stryker disable next-line all: 第3種事業 (3%) の法定税率の固定値。
    case 'category3_3pct':
      return 0.03;
    // Stryker disable next-line all: 非課税の固定値 0。
    case 'nonTaxable':
      return 0;
    default: {
      // 網羅性チェック (ホワイトリスト外は throw)。
      const _exhaustive: never = category;
      throw new Error(`unknown business category: ${String(_exhaustive)}`);
    }
  }
}

/**
 * 営業月数に応じた事業主控除額を返す。
 *
 * **概算であり税務助言ではない。法定業種の区分判定・各種控除・税率・課税要否は
 * 都道府県税事務所に確認すること。**
 *
 * 年額 {@link SOLE_PROPRIETOR_DEDUCTION} (290 万円) を 12 で割り営業月数を乗じる。
 * 端数の丸めは **円未満切上げ** を採用する (1 か月未満を切り上げる地方税の月割慣行に
 * 合わせ、控除を納税者有利に丸める)。営業月数の既定は 12 (通年営業)。
 *
 * @param businessMonths 営業月数 (既定 12、1〜12 の整数)
 * @returns 月割後の事業主控除額 (円、切上げ)
 * @throws businessMonths が 1 未満・12 超・非整数・非有限のとき
 */
export function soleProprietorDeduction(businessMonths: number = 12): number {
  if (!Number.isInteger(businessMonths) || businessMonths < 1 || businessMonths > 12) {
    throw new Error(`businessMonths must be an integer in [1, 12] (got ${businessMonths})`);
  }
  return Math.ceil((SOLE_PROPRIETOR_DEDUCTION * businessMonths) / 12);
}

/** 個人事業税の算定に必要な入力。金額はすべて円・有限・非負。 */
export interface IndividualBusinessTaxParams {
  /**
   * 事業所得 (所得税の事業所得。青色申告特別控除を差し引いた後の額)。
   * 所得計算そのものは本モジュールの対象外で、呼び出し側が確定する。
   */
  readonly businessIncome: number;
  /**
   * 青色申告特別控除の足し戻し額 (既定 0)。
   * 個人事業税は青色申告特別控除を認めないため、事業所得へ足し戻す。
   */
  readonly blueReturnAddback?: number;
  /**
   * 各種繰越控除の額 (既定 0)。損失の繰越控除・被災事業用資産の繰越控除など。
   */
  readonly carryforwardDeduction?: number;
  /** 法定業種区分 ({@link BusinessCategory})。 */
  readonly category: BusinessCategory;
  /** 営業月数 (既定 12、1〜12 の整数)。事業主控除の月割に使う。 */
  readonly businessMonths?: number;
}

/** 個人事業税の算定結果。 */
export interface IndividualBusinessTaxResult {
  /** 適用した業種区分。 */
  readonly category: BusinessCategory;
  /** 適用した税率 (0..1)。 */
  readonly rate: number;
  /** 課税標準額 (円、事業主控除等を差し引いた後。0 以上)。 */
  readonly taxableBase: number;
  /** 個人事業税額 (円、100 円未満切捨)。非課税のとき 0。 */
  readonly tax: number;
}

/**
 * 有限な非負数であることを検証する (不正入力は throw)。NaN / Infinity / 負値を弾く。
 * @param value 検証対象
 * @param label エラーメッセージに使うラベル
 */
function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite number >= 0 (got ${value})`);
  }
}

/**
 * 個人事業税額を概算する。
 *
 * **概算であり税務助言ではない。法定業種の区分判定・各種控除・税率・課税要否は
 * 都道府県税事務所に確認すること。** 業種区分の判定そのものは本モジュールの対象外で、
 * 呼び出し側が {@link BusinessCategory} を確定して渡す。所得計算 (所得税の事業所得) も
 * 本モジュールの対象外で、入力として受け取る。
 *
 * 課税標準 = max(businessIncome + blueReturnAddback − carryforwardDeduction
 *   − {@link soleProprietorDeduction}(businessMonths), 0)。
 * 税額 = `Math.floor(課税標準 × 税率 / 100) * 100` (100 円未満切捨)。
 * `nonTaxable` は課税標準にかかわらず税額 0。
 *
 * @param params {@link IndividualBusinessTaxParams}
 * @returns {@link IndividualBusinessTaxResult} (区分・税率・課税標準・税額)
 * @throws 金額が負・非有限のとき / category がホワイトリスト外のとき /
 *   businessMonths が 1〜12 外のとき
 */
export function individualBusinessTax({
  businessIncome,
  blueReturnAddback = 0,
  carryforwardDeduction = 0,
  category,
  businessMonths = 12,
}: IndividualBusinessTaxParams): IndividualBusinessTaxResult {
  assertNonNegativeFinite(businessIncome, 'businessIncome');
  assertNonNegativeFinite(blueReturnAddback, 'blueReturnAddback');
  assertNonNegativeFinite(carryforwardDeduction, 'carryforwardDeduction');
  // 税率解決はホワイトリスト検証と月割検証を兼ねる (不正入力は throw)。
  const rate = businessTaxRate(category);
  const deduction = soleProprietorDeduction(businessMonths);
  const taxableBase = Math.max(
    businessIncome + blueReturnAddback - carryforwardDeduction - deduction,
    0,
  );
  const tax = Math.floor((taxableBase * rate) / 100) * 100;
  return { category, rate, taxableBase, tax };
}

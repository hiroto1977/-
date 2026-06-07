/**
 * 自動車税の概算算定 (純粋ロジック・IO なし)。自家用乗用車を対象。
 *
 * **重要 — これは概算であり税務助言ではありません。** 実際の税額・グリーン化特例
 * (経年車の重課 / 新車の軽課)・自治体 (都道府県) ごとの差異・年度の税制改正は、
 * 必ず **都道府県税事務所** に確認してください。本モジュールは日本の自動車税の
 * 税率表 (令和元年10月1日以降に新規登録された自家用乗用車) を再現するだけの
 * 教育的シミュレーションです。
 *
 * 対応する算定:
 *   - 自動車税種別割 (`automobileTaxByDisplacement`) … 排気量の階段表による年税額
 *   - 環境性能割の税率 (`environmentalPerformanceRate`) … 燃費達成度区分のホワイトリスト写像
 *   - 環境性能割の税額 (`environmentalPerformanceLevy`) … 取得価額 × 税率 (100円未満切捨)
 *   - 年度途中登録の月割 (`monthlyProratedAutomobileTax`) … 種別割の月割額 (100円未満切捨)
 *
 * **グリーン化特例 (経年重課 / 新車の軽課) は本モジュールでは扱いません。**
 * 種別割は新規登録時の本則税率表のみを再現します。
 *
 * ネットワーク / ファイル / Date.now / 乱数は一切使わない純粋関数のみ。
 */

// --- 自動車税種別割: 排気量の階段表 (令和元年10月1日以降 新規登録の自家用乗用車) -----

/** 自動車税種別割の階段表の 1 ブラケット (排気量上限 cc と年税額 円)。 */
export interface AutomobileTaxBracket {
  /** この排気量 (cc) **以下** に適用 (Infinity = 上限なし)。 */
  readonly upToCc: number;
  /** 年税額 (円)。 */
  readonly annualTax: number;
}

/**
 * 排気量の階段表 (令和元年10月1日以降に新規登録された自家用乗用車の本則税率)。
 *
 * 法定の固定値のため block-level で Stryker を抑制する (根拠: 税額は地方税法で固定。
 * 階段の境界・ルックアップの振る舞いは `automobileTaxByDisplacement` とテストで全面検証)。
 */
// Stryker disable all
export const AUTOMOBILE_TAX_TABLE: readonly AutomobileTaxBracket[] = [
  { upToCc: 1_000, annualTax: 25_000 }, // 1,000cc 以下
  { upToCc: 1_500, annualTax: 30_500 }, // 〜1,500cc
  { upToCc: 2_000, annualTax: 36_000 }, // 〜2,000cc
  { upToCc: 2_500, annualTax: 43_500 }, // 〜2,500cc
  { upToCc: 3_000, annualTax: 50_000 }, // 〜3,000cc
  { upToCc: 3_500, annualTax: 57_000 }, // 〜3,500cc
  { upToCc: 4_000, annualTax: 65_500 }, // 〜4,000cc
  { upToCc: 4_500, annualTax: 75_500 }, // 〜4,500cc
  { upToCc: 6_000, annualTax: 87_000 }, // 〜6,000cc
  { upToCc: Infinity, annualTax: 110_000 }, // 6,000cc 超
];
// Stryker restore all

/**
 * 排気量 (cc) から自動車税種別割の年税額を概算する (自家用乗用車)。
 *
 * **概算であり税務助言ではない。実際の税額・グリーン化特例・自治体差異は
 * 都道府県税事務所に確認すること。** グリーン化特例 (経年重課 / 軽課) は **非対応**
 * (新規登録時の本則税率表のみ)。
 *
 * 境界は「以下 / 超」で厳密に判定する。例: 1,000cc は 25,000 円、1,001cc は 30,500 円。
 *
 * @param displacementCc 総排気量 (cc)。0 以下・非有限 (NaN / Infinity) は throw。
 * @returns 年税額 (円)
 * @throws displacementCc が 0 以下 / 非有限のとき
 */
export function automobileTaxByDisplacement(displacementCc: number): number {
  if (!Number.isFinite(displacementCc)) {
    throw new Error(`displacementCc must be a finite number: ${displacementCc}`);
  }
  if (displacementCc <= 0) {
    throw new Error(`displacementCc must be > 0: ${displacementCc}`);
  }
  const bracket = AUTOMOBILE_TAX_TABLE.find((b) => displacementCc <= b.upToCc);
  // Infinity 上限ブラケットが必ず最後に存在するため bracket は常に定義される。
  return bracket!.annualTax;
}

// --- 環境性能割: 燃費達成度区分 → 税率 (自家用乗用車) -----------------------

/**
 * 環境性能割の燃費達成度区分 (ホワイトリスト)。
 * - `electric` … 電気自動車等 (非課税 0%)
 * - `gas2030_85` … 2030年度燃費基準 85% 達成 (非課税 0%)
 * - `gas2030_75` … 2030年度燃費基準 75% 達成 (1%)
 * - `gas2030_60` … 2030年度燃費基準 60% 達成 (2%)
 * - `other` … 上記以外 (3%)
 */
export type EnvironmentalPerformanceCategory =
  | 'electric'
  | 'gas2030_85'
  | 'gas2030_75'
  | 'gas2030_60'
  | 'other';

/**
 * 燃費達成度区分 → 環境性能割税率テーブル (自家用乗用車)。
 *
 * 法定の固定値のため block-level で Stryker を抑制する (根拠: 税率は地方税法で固定。
 * 写像の振る舞い・ホワイトリスト境界は `environmentalPerformanceRate` とテストで全面検証)。
 */
// Stryker disable all
export const ENVIRONMENTAL_PERFORMANCE_RATES: Readonly<
  Record<EnvironmentalPerformanceCategory, number>
> = {
  electric: 0, // 電気自動車等 (非課税)
  gas2030_85: 0, // 2030年度基準 85% 達成 (非課税)
  gas2030_75: 0.01, // 75% 達成 = 1%
  gas2030_60: 0.02, // 60% 達成 = 2%
  other: 0.03, // それ以外 = 3%
};
// Stryker restore all

/** ホワイトリスト判定に用いる燃費達成度区分の集合。 */
const ENVIRONMENTAL_PERFORMANCE_CATEGORIES: readonly EnvironmentalPerformanceCategory[] = [
  'electric',
  'gas2030_85',
  'gas2030_75',
  'gas2030_60',
  'other',
];

/**
 * 燃費達成度区分から環境性能割の税率を返す純粋写像 (自家用乗用車のホワイトリスト)。
 *
 * **概算であり税務助言ではない。実際の税率・自治体差異は都道府県税事務所に確認すること。**
 *
 * 自家用乗用車: 電気/2030年度基準85%達成等 = 非課税 0% / 75%達成 = 1% / 60%達成 = 2% /
 * それ以外 = 3%。`isPrivatePassenger` が `false` の場合は本モジュールの対象外のため throw。
 *
 * @param category 燃費達成度区分 (ホワイトリスト)。範囲外は throw。
 * @param isPrivatePassenger 自家用乗用車か (既定 true)。false は対象外につき throw。
 * @returns 環境性能割の税率 (0 / 0.01 / 0.02 / 0.03)
 * @throws category がホワイトリスト外のとき / isPrivatePassenger が false のとき
 */
export function environmentalPerformanceRate(
  category: EnvironmentalPerformanceCategory,
  isPrivatePassenger = true,
): number {
  if (!isPrivatePassenger) {
    throw new Error('environmentalPerformanceRate supports only private passenger cars (自家用乗用車)');
  }
  if (!ENVIRONMENTAL_PERFORMANCE_CATEGORIES.includes(category)) {
    throw new Error(`unknown environmental performance category: ${String(category)}`);
  }
  return ENVIRONMENTAL_PERFORMANCE_RATES[category];
}

/** `environmentalPerformanceLevy` の入力。 */
export interface EnvironmentalPerformanceLevyInput {
  /** 取得価額 (円)。負値・非有限 (NaN / Infinity) は throw。 */
  readonly acquisitionPrice: number;
  /** 燃費達成度区分 (ホワイトリスト)。範囲外は throw。 */
  readonly category: EnvironmentalPerformanceCategory;
}

/** `environmentalPerformanceLevy` の結果。 */
export interface EnvironmentalPerformanceLevyResult {
  /** 適用した環境性能割の税率 (0 / 0.01 / 0.02 / 0.03)。 */
  readonly rate: number;
  /** 環境性能割の税額 (円、100円未満切捨後)。 */
  readonly levy: number;
}

/**
 * 環境性能割の税額を概算する (自家用乗用車)。
 *
 * **概算であり税務助言ではない。実際の税額・自治体差異は都道府県税事務所に確認すること。**
 *
 * 取得価額 × 環境性能割税率を求め、**100 円未満を切り捨て**る。
 *
 * @throws acquisitionPrice が負値・非有限のとき / category がホワイトリスト外のとき
 */
export function environmentalPerformanceLevy(
  input: EnvironmentalPerformanceLevyInput,
): EnvironmentalPerformanceLevyResult {
  const { acquisitionPrice, category } = input;
  if (!Number.isFinite(acquisitionPrice)) {
    throw new Error(`acquisitionPrice must be a finite number: ${acquisitionPrice}`);
  }
  if (acquisitionPrice < 0) {
    throw new Error(`acquisitionPrice must be >= 0: ${acquisitionPrice}`);
  }
  const rate = environmentalPerformanceRate(category);
  const levy = floorHundred(acquisitionPrice * rate);
  return { rate, levy };
}

// --- 年度途中の新規登録: 種別割の月割 -------------------------------------

/**
 * 年度途中に新規登録した場合の自動車税種別割の月割額を概算する。
 *
 * **概算であり税務助言ではない。実際の税額・自治体差異は都道府県税事務所に確認すること。**
 *
 * 自動車税の年度は 4月〜翌年3月。月割は **登録した月の翌月から年度末 (3月) まで** の
 * 月数を 12 で按分する (例: 8月登録 → 9月〜翌3月の 7 か月分)。年税額 × 月数 / 12 を求め、
 * **100 円未満を切り捨て**る。月数の早見:
 *   4月=11 / 5月=10 / … / 12月=3 / 1月=2 / 2月=1 / 3月=12 (翌月から丸 1 年)。
 *
 * @param annualTax 種別割の年税額 (円)。負値・非有限は throw。
 * @param registeredMonth 新規登録した月 (1..12)。範囲外・非整数は throw。
 * @returns 月割額 (円、100円未満切捨後)
 * @throws annualTax が負値・非有限のとき / registeredMonth が 1..12 外・非整数のとき
 */
export function monthlyProratedAutomobileTax(annualTax: number, registeredMonth: number): number {
  if (!Number.isFinite(annualTax)) {
    throw new Error(`annualTax must be a finite number: ${annualTax}`);
  }
  if (annualTax < 0) {
    throw new Error(`annualTax must be >= 0: ${annualTax}`);
  }
  if (!Number.isInteger(registeredMonth) || registeredMonth < 1 || registeredMonth > 12) {
    throw new Error(`registeredMonth must be an integer in 1..12: ${registeredMonth}`);
  }
  // 登録翌月から年度末 (3月) までの月数。年度は 4月起算なので 3月起点で逆算する。
  // ((2 - M + 12) % 12) + 1 で M+1 月から 3 月までの月数 (3月=12, 2月=1) を求める。
  const taxableMonths = ((2 - registeredMonth + 12) % 12) + 1;
  return floorHundred((annualTax * taxableMonths) / 12);
}

// --- 内部ヘルパ ----------------------------------------------------------

/** 税額の 100 円未満を切り捨てる (地方税の端数処理)。 */
function floorHundred(tax: number): number {
  return Math.floor(tax / 100) * 100;
}

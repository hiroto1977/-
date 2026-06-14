/**
 * 事業所税の概算算定 (純粋ロジック・IO なし)。
 *
 * **重要 — これは概算であり税務助言ではありません。事業所税は指定都市等のみ課税。
 * 実際の課税要否・非課税枠・自治体差異は市区町村に確認すること。**
 * 事業所税 (地方税法 701 条の30〜) は、政令指定都市・東京都23区・人口30万以上の
 * 一定の市など **課税対象の自治体 (指定都市等) でのみ** 課される地方税です。本モジュールは
 * 資産割 (事業所床面積) と従業者割 (従業者給与総額) の標準的な仕組みを単純化した
 * 教育的シミュレーションで、課税対象自治体か否かの判定・課税標準の特例 (共用部分の
 * 按分・非課税用途部分の控除・新増設に係る経過措置等) は反映しません。免税点以下の
 * 非課税は「資産割は床面積、従業者割は従業者数」で判定する簡略モデルです。
 * 実際の課税要否・非課税枠・税率・自治体差異は各市区町村に確認してください。
 *
 * ネットワーク / ファイル / Date.now / 乱数は一切使わない純粋関数のみ。
 * UI から切り離して単体テスト可能にするため、計算はすべてここに集約する。
 */

// --- 税率・免税点の法定値 ------------------------------------------------

/** 資産割の税率 (事業所床面積 1㎡ あたり 600 円。地方税法 701 条の42)。 */
export const ASSET_RATE_PER_SQM = 600;
/** 従業者割の税率 (従業者給与総額 × 0.25%。地方税法 701 条の43)。 */
export const EMPLOYEE_RATE = 0.0025;
/** 資産割の免税点 (事業所床面積 1,000㎡ **以下** は非課税。地方税法 701 条の34)。 */
export const FLOOR_AREA_THRESHOLD_SQM = 1000;
/** 従業者割の免税点 (従業者数 100 人 **以下** は非課税。地方税法 701 条の34)。 */
export const EMPLOYEE_COUNT_THRESHOLD = 100;

// --- 内部ヘルパ ----------------------------------------------------------

/**
 * 事業所税額の 100 円未満を切り捨てる (地方税法 20 条の4の2)。
 * @param tax 切捨前の税額 (円)
 * @returns 100 円未満を切り捨てた税額 (円)
 */
function floorHundred(tax: number): number {
  return Math.floor(tax / 100) * 100;
}

/**
 * 有限な非負数であることを検証する (不正入力は throw)。NaN / Infinity / 負値を弾く。
 * @param value 検証対象
 * @param label エラーメッセージに使うラベル
 * @throws value が非有限・負値のとき
 */
function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite number >= 0 (got ${value})`);
  }
}

// --- 免税点判定 ----------------------------------------------------------

/**
 * 資産割の免税点判定 — 事業所床面積が免税点 (1,000㎡) **以下** なら非課税 (true)。
 *
 * **概算であり税務助言ではない。事業所税は指定都市等のみ課税。実際の課税要否・
 * 非課税枠・自治体差異は市区町村に確認すること。** 共用部分の按分・非課税用途部分の
 * 控除等は反映しない簡略モデルで、延べ床面積で判定する。
 *
 * @param floorAreaSqm 事業所床面積 (㎡、>= 0、有限)
 * @returns 床面積が {@link FLOOR_AREA_THRESHOLD_SQM} (1,000㎡) **以下** なら true (非課税)
 * @throws floorAreaSqm が負・非有限のとき
 */
export function isAssetTaxExempt(floorAreaSqm: number): boolean {
  assertNonNegativeFinite(floorAreaSqm, 'floorAreaSqm');
  return floorAreaSqm <= FLOOR_AREA_THRESHOLD_SQM;
}

/**
 * 従業者割の免税点判定 — 従業者数が免税点 (100 人) **以下** なら非課税 (true)。
 *
 * **概算であり税務助言ではない。事業所税は指定都市等のみ課税。実際の課税要否・
 * 非課税枠・自治体差異は市区町村に確認すること。** パート・アルバイトの取扱いや
 * 非課税対象の従業者の控除等は反映しない簡略モデルで、従業者数で判定する。
 *
 * @param employeeCount 従業者数 (人、>= 0、有限)
 * @returns 従業者数が {@link EMPLOYEE_COUNT_THRESHOLD} (100 人) **以下** なら true (非課税)
 * @throws employeeCount が負・非有限のとき
 */
export function isEmployeeTaxExempt(employeeCount: number): boolean {
  assertNonNegativeFinite(employeeCount, 'employeeCount');
  return employeeCount <= EMPLOYEE_COUNT_THRESHOLD;
}

// --- 資産割 --------------------------------------------------------------

/** {@link assetBasedTax} の入力。 */
export interface AssetTaxParams {
  /** 事業所床面積 (㎡)。負値・非有限は throw。 */
  readonly floorAreaSqm: number;
}

/**
 * 資産割を概算する: 事業所床面積 × 600 円/㎡、100 円未満切捨。
 *
 * **概算であり税務助言ではない。事業所税は指定都市等のみ課税。実際の課税要否・
 * 非課税枠・自治体差異は市区町村に確認すること。** 共用部分の按分・非課税用途部分の
 * 控除等は反映しない簡略モデル。
 *
 * 免税点 (床面積 1,000㎡) **以下** なら 0 を返す。免税点は課税要否の判定にのみ
 * 用い、課税となる場合は **床面積全体** に 600 円/㎡ を乗じる (免税点超過分のみへの
 * 課税ではない)。税額 = `Math.floor(床面積 × 600 / 100) * 100`。
 *
 * @param params.floorAreaSqm 事業所床面積 (㎡、>= 0、有限)
 * @returns 100 円未満を切り捨てた資産割 (円)。免税点以下なら 0。
 * @throws floorAreaSqm が負・非有限のとき
 */
export function assetBasedTax({ floorAreaSqm }: AssetTaxParams): number {
  // 入力検証は isAssetTaxExempt 内の assertNonNegativeFinite が兼ねる
  // (同じ floorAreaSqm を検証するため、ここで重ねると等価変異の温床になる)。
  if (isAssetTaxExempt(floorAreaSqm)) {
    return 0;
  }
  return floorHundred(floorAreaSqm * ASSET_RATE_PER_SQM);
}

// --- 従業者割 ------------------------------------------------------------

/** {@link employeeBasedTax} の入力。 */
export interface EmployeeTaxParams {
  /** 従業者数 (人)。負値・非有限は throw。 */
  readonly employeeCount: number;
  /** 従業者給与総額 (円)。負値・非有限は throw。 */
  readonly totalSalary: number;
}

/**
 * 従業者割を概算する: 従業者給与総額 × 0.25%、100 円未満切捨。
 *
 * **概算であり税務助言ではない。事業所税は指定都市等のみ課税。実際の課税要否・
 * 非課税枠・自治体差異は市区町村に確認すること。** パート・アルバイトの取扱いや
 * 非課税対象の従業者・給与の控除等は反映しない簡略モデル。
 *
 * 免税点 (従業者数 100 人) **以下** なら 0 を返す。免税点は課税要否の判定にのみ
 * 用い、課税となる場合は 給与総額全体 に 0.25% を乗じる。
 * 税額 = `Math.floor(給与総額 × 0.0025 / 100) * 100`。
 *
 * @param params.employeeCount 従業者数 (人、>= 0、有限)
 * @param params.totalSalary 従業者給与総額 (円、>= 0、有限)
 * @returns 100 円未満を切り捨てた従業者割 (円)。免税点以下なら 0。
 * @throws employeeCount / totalSalary が負・非有限のとき
 */
export function employeeBasedTax({ employeeCount, totalSalary }: EmployeeTaxParams): number {
  // totalSalary は免税点判定で参照しないため、免税・課税にかかわらず常に検証する。
  assertNonNegativeFinite(totalSalary, 'totalSalary');
  // employeeCount の検証は isEmployeeTaxExempt 内の assertNonNegativeFinite が兼ねる。
  if (isEmployeeTaxExempt(employeeCount)) {
    return 0;
  }
  return floorHundred(totalSalary * EMPLOYEE_RATE);
}

// --- 合算 ----------------------------------------------------------------

/** {@link businessOfficeTax} の入力。 */
export interface BusinessOfficeTaxParams {
  /** 事業所床面積 (㎡)。負値・非有限は throw。 */
  readonly floorAreaSqm: number;
  /** 従業者数 (人)。負値・非有限は throw。 */
  readonly employeeCount: number;
  /** 従業者給与総額 (円)。負値・非有限は throw。 */
  readonly totalSalary: number;
}

/** {@link businessOfficeTax} の結果 (資産割 + 従業者割の内訳)。 */
export interface BusinessOfficeTaxResult {
  /** 資産割 (円、100 円未満切捨)。免税点以下なら 0。 */
  readonly assetTax: number;
  /** 従業者割 (円、100 円未満切捨)。免税点以下なら 0。 */
  readonly employeeTax: number;
  /** 資産割 + 従業者割の合計 (円)。 */
  readonly total: number;
  /** 資産割が免税点 (床面積 1,000㎡) 以下で非課税のとき true。 */
  readonly assetExempt: boolean;
  /** 従業者割が免税点 (従業者数 100 人) 以下で非課税のとき true。 */
  readonly employeeExempt: boolean;
}

/**
 * 事業所税 (資産割 + 従業者割) の合算内訳を概算する。
 *
 * **概算であり税務助言ではない。事業所税は指定都市等のみ課税。実際の課税要否・
 * 非課税枠・自治体差異は市区町村に確認すること。** 課税対象自治体 (指定都市等) か
 * 否かの判定・課税標準の特例 (共用部分の按分・非課税用途部分の控除等) は反映しない
 * 簡略モデル。資産割・従業者割はそれぞれ独立に免税点 (床面積 1,000㎡ / 従業者数
 * 100 人) を **以下** で判定する。
 *
 * 手順: (1) {@link assetBasedTax} で資産割 → (2) {@link employeeBasedTax} で
 * 従業者割 → (3) 各免税点フラグと合計を返す。
 *
 * @param params.floorAreaSqm 事業所床面積 (㎡、>= 0、有限)
 * @param params.employeeCount 従業者数 (人、>= 0、有限)
 * @param params.totalSalary 従業者給与総額 (円、>= 0、有限)
 * @returns 資産割・従業者割・合計・各免税フラグ {@link BusinessOfficeTaxResult}
 * @throws floorAreaSqm / employeeCount / totalSalary が負・非有限のとき
 */
export function businessOfficeTax({
  floorAreaSqm,
  employeeCount,
  totalSalary,
}: BusinessOfficeTaxParams): BusinessOfficeTaxResult {
  const assetTax = assetBasedTax({ floorAreaSqm });
  const employeeTax = employeeBasedTax({ employeeCount, totalSalary });
  return {
    assetTax,
    employeeTax,
    total: assetTax + employeeTax,
    assetExempt: isAssetTaxExempt(floorAreaSqm),
    employeeExempt: isEmployeeTaxExempt(employeeCount),
  };
}

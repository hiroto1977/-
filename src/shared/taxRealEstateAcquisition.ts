/**
 * 不動産取得税の概算算定 (純粋ロジック・IO なし)。
 *
 * **重要 — これは概算であり税務助言ではありません。** 不動産取得税 (地方税法 73 条〜)
 * の標準的な仕組みを単純化したシミュレーションです。実際の課税標準・特例・税率は
 * **都道府県税事務所に確認してください**。土地・住宅の軽減税率 3% (本則 4%)・宅地の
 * 課税標準 1/2 特例・免税点を再現するだけの教育的モデルで、年度改正・地域差・認定要件を
 * 完全には反映しません。
 *
 * とくに **住宅の課税標準の特別控除 (新築住宅 1,200 万円控除・認定長期優良住宅 1,300 万円
 * 控除・宅地の軽減額控除など) は本モジュールでは扱いません (簡略モデル)**。これらの控除を
 * 適用すると実際の税額はさらに下がるため、本モジュールの算定額は控除前の上振れした概算です。
 *
 * ネットワーク / ファイル / Date.now / 乱数は一切使わない純粋関数のみ。
 */

// --- 税率・免税点の固定値テーブル ----------------------------------------
//
// 地方税法・租税特別措置法で定まる法定の固定値。値そのものの変異 (4% → 3% 等)
// は税法の改定であってテストで「正しい値」を pin しても等価変異にはならないが、
// 算術・比較ロジックは実テストで全面的に撃墜するため、定数定義のみ block-level で
// Stryker を抑制する (根拠: 法定の固定値。乗算・切捨・境界比較は各関数のテストで検証)。

// Stryker disable all
/** 本則税率 (4%、地方税法 73 条の15)。 */
export const STANDARD_RATE = 0.04;
/** 土地・住宅の軽減税率 (3%、租税特別措置法 附則による特例)。 */
export const REDUCED_RATE = 0.03;

/** 土地の免税点 (この金額 **未満** は非課税、地方税法 73 条の15の2)。10 万円。 */
export const LAND_THRESHOLD = 100_000;
/** 新築家屋の免税点 (建築による取得)。23 万円。 */
export const NEW_BUILDING_THRESHOLD = 230_000;
/** その他家屋の免税点 (売買等による取得)。12 万円。 */
export const OTHER_BUILDING_THRESHOLD = 120_000;
// Stryker restore all

/**
 * 不動産の種別 (ホワイトリスト)。
 * - `land` … 土地 (軽減対象・宅地は 1/2 特例の対象)
 * - `residentialBuilding` … 住宅家屋 (軽減対象 3%)
 * - `nonResidentialBuilding` … 非住宅家屋 (店舗・事務所等。常に本則 4%)
 */
export type PropertyType = 'land' | 'residentialBuilding' | 'nonResidentialBuilding';

/** ホワイトリスト判定に用いる不動産種別の集合。 */
const PROPERTY_TYPES: readonly PropertyType[] = [
  'land',
  'residentialBuilding',
  'nonResidentialBuilding',
];

// --- 内部ヘルパ ----------------------------------------------------------

/**
 * 課税標準 / 評価額の入力検証。負値・非有限 (NaN / Infinity) は throw。
 * @param value 検証対象の金額 (円)
 * @param label エラーメッセージ用の項目名
 */
function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite number >= 0 (got ${value})`);
  }
}

/** 不動産種別のホワイトリスト検証。範囲外は throw。 */
function assertPropertyType(propertyType: PropertyType): void {
  if (!PROPERTY_TYPES.includes(propertyType)) {
    throw new Error(`unknown propertyType: ${String(propertyType)}`);
  }
}

/** 不動産取得税額の 100 円未満を切り捨てる (地方税法 20 条の4の2)。 */
function floorHundred(tax: number): number {
  return Math.floor(tax / 100) * 100;
}

/**
 * 種別と新築フラグから免税点を解決する。
 * 土地は {@link LAND_THRESHOLD}、家屋は新築なら {@link NEW_BUILDING_THRESHOLD}、
 * それ以外 (売買等) は {@link OTHER_BUILDING_THRESHOLD}。
 */
function resolveThreshold(propertyType: PropertyType, isNewBuilding: boolean): number {
  if (propertyType === 'land') {
    return LAND_THRESHOLD;
  }
  return isNewBuilding ? NEW_BUILDING_THRESHOLD : OTHER_BUILDING_THRESHOLD;
}

// --- 税率 ----------------------------------------------------------------

/** `acquisitionTaxRate` の入力。 */
export interface AcquisitionTaxRateInput {
  /** 不動産種別 (ホワイトリスト)。範囲外は throw。 */
  readonly propertyType: PropertyType;
  /**
   * 軽減税率を適用するか (既定 true)。
   * `true` のとき土地・住宅は軽減 3%、非住宅家屋は常に 4%。
   * `false` のとき種別を問わず一律 4% (本則)。
   */
  readonly applyReduction?: boolean;
}

/**
 * 不動産取得税の適用税率を返す。
 *
 * **概算であり税務助言ではない。実際の課税標準・特例・税率は都道府県税事務所に
 * 確認すること。**
 *
 * - `applyReduction: true` (既定): 土地 (`land`)・住宅 (`residentialBuilding`) は
 *   軽減税率 {@link REDUCED_RATE} = 3%、非住宅家屋 (`nonResidentialBuilding`) は
 *   軽減対象外のため常に本則 {@link STANDARD_RATE} = 4%。
 * - `applyReduction: false`: 種別を問わず一律本則 4%。
 *
 * @throws propertyType がホワイトリスト外のとき
 */
export function acquisitionTaxRate({
  propertyType,
  applyReduction = true,
}: AcquisitionTaxRateInput): number {
  assertPropertyType(propertyType);
  if (!applyReduction) {
    return STANDARD_RATE;
  }
  // 軽減適用時、非住宅家屋だけは軽減対象外なので本則 4%。
  if (propertyType === 'nonResidentialBuilding') {
    return STANDARD_RATE;
  }
  return REDUCED_RATE;
}

// --- 宅地の課税標準 1/2 特例 ---------------------------------------------

/** `residentialLandTaxableBase` の入力。 */
export interface ResidentialLandBaseInput {
  /** 土地の固定資産税評価額 (円)。負値・非有限は throw。 */
  readonly assessedValue: number;
  /**
   * 宅地評価額の 1/2 特例の対象か (既定 false)。
   * `true` のとき課税標準 = 評価額 × 1/2、`false` のとき評価額の全額。
   */
  readonly isUrbanLand?: boolean;
}

/**
 * 宅地評価額の 1/2 特例を適用した課税標準を返す。
 *
 * **概算であり税務助言ではない。実際の課税標準・特例・税率は都道府県税事務所に
 * 確認すること。** 宅地評価土地の課税標準は評価額の 1/2 とする特例 (租税特別措置法
 * 附則) を再現する。住宅の課税標準の特別控除 (1,200 万円控除等) や宅地の軽減額控除は
 * ここでは扱わない (簡略モデル)。
 *
 * - `isUrbanLand: true`: 課税標準 = `assessedValue / 2`。
 * - `isUrbanLand: false` (既定): 課税標準 = `assessedValue` (全額)。
 *
 * @throws assessedValue が負値・非有限のとき
 */
export function residentialLandTaxableBase({
  assessedValue,
  isUrbanLand = false,
}: ResidentialLandBaseInput): number {
  assertNonNegativeFinite(assessedValue, 'assessedValue');
  return isUrbanLand ? assessedValue / 2 : assessedValue;
}

// --- 免税点判定 ----------------------------------------------------------

/** `isBelowAcquisitionThreshold` の入力。 */
export interface AcquisitionThresholdInput {
  /** 不動産種別 (ホワイトリスト)。範囲外は throw。 */
  readonly propertyType: PropertyType;
  /** 判定対象の課税標準額 (円)。負値・非有限は throw。 */
  readonly taxableValue: number;
  /**
   * 家屋が新築 (建築による取得) か (既定 false)。
   * 土地には影響しない。家屋のとき新築なら免税点 23 万・それ以外 12 万。
   */
  readonly isNewBuilding?: boolean;
}

/**
 * 免税点判定 — 課税標準額が免税点 **未満** なら非課税 (true)。
 *
 * **概算であり税務助言ではない。実際の課税標準・特例・税率は都道府県税事務所に
 * 確認すること。** 免税点 (地方税法 73 条の15の2): 土地 10 万円・新築家屋 23 万円・
 * その他家屋 12 万円。住宅の課税標準の特別控除は本判定では考慮しない (簡略モデル)。
 *
 * @returns 免税点 **未満** なら true (非課税)、免税点以上なら false (課税)
 * @throws taxableValue が負値・非有限のとき / propertyType がホワイトリスト外のとき
 */
export function isBelowAcquisitionThreshold({
  propertyType,
  taxableValue,
  isNewBuilding = false,
}: AcquisitionThresholdInput): boolean {
  assertPropertyType(propertyType);
  assertNonNegativeFinite(taxableValue, 'taxableValue');
  const threshold = resolveThreshold(propertyType, isNewBuilding);
  return taxableValue < threshold;
}

// --- 不動産取得税の合算 --------------------------------------------------

/** `realEstateAcquisitionTax` の入力。 */
export interface RealEstateAcquisitionInput {
  /** 固定資産税評価額 (円)。負値・非有限は throw。 */
  readonly assessedValue: number;
  /** 不動産種別 (ホワイトリスト)。範囲外は throw。 */
  readonly propertyType: PropertyType;
  /** 軽減税率を適用するか (既定 true)。{@link acquisitionTaxRate} 参照。 */
  readonly applyReduction?: boolean;
  /**
   * 土地が宅地評価で 1/2 特例の対象か (既定 false)。
   * `propertyType: 'land'` のときのみ課税標準に反映する。
   */
  readonly isUrbanLand?: boolean;
  /**
   * 家屋が新築 (建築による取得) か (既定 false)。免税点の解決に使う。
   * 土地には影響しない。
   */
  readonly isNewBuilding?: boolean;
}

/** `realEstateAcquisitionTax` の結果。 */
export interface RealEstateAcquisitionResult {
  /** 適用税率 (0.03 | 0.04)。 */
  readonly rate: number;
  /** 課税標準額 (円、土地が宅地なら 1/2 特例適用後)。 */
  readonly taxableBase: number;
  /** 不動産取得税額 (円、100 円未満切捨後)。免税のとき 0。 */
  readonly tax: number;
  /** 免税点未満で非課税のとき true。 */
  readonly exempt: boolean;
}

/**
 * 不動産取得税を概算する: 課税標準 × 税率、100 円未満切捨。免税点未満は非課税 0。
 *
 * **概算であり税務助言ではない。実際の課税標準・特例・税率は都道府県税事務所に
 * 確認すること。** 住宅の課税標準の特別控除 (新築 1,200 万円控除等) は **扱わない**
 * 簡略モデルのため、控除前の上振れした概算になる。
 *
 * 手順: (1) 土地が宅地 (`isUrbanLand`) なら {@link residentialLandTaxableBase} で
 * 課税標準を 1/2 にする (家屋は評価額そのまま) → (2) {@link isBelowAcquisitionThreshold}
 * で課税標準が免税点 **未満** なら `exempt: true` で税額 0 → (3) 非課税でなければ
 * {@link acquisitionTaxRate} の税率を乗じ 100 円未満を切り捨てる。
 *
 * @throws assessedValue が負値・非有限のとき / propertyType がホワイトリスト外のとき
 */
export function realEstateAcquisitionTax({
  assessedValue,
  propertyType,
  applyReduction = true,
  isUrbanLand = false,
  isNewBuilding = false,
}: RealEstateAcquisitionInput): RealEstateAcquisitionResult {
  assertPropertyType(propertyType);
  assertNonNegativeFinite(assessedValue, 'assessedValue');
  // 課税標準: 土地が宅地なら 1/2 特例、それ以外は評価額そのまま。
  const taxableBase =
    propertyType === 'land'
      ? residentialLandTaxableBase({ assessedValue, isUrbanLand })
      : assessedValue;
  const rate = acquisitionTaxRate({ propertyType, applyReduction });
  // 免税点判定 (課税標準で判定)。
  const exempt = isBelowAcquisitionThreshold({
    propertyType,
    taxableValue: taxableBase,
    isNewBuilding,
  });
  if (exempt) {
    return { rate, taxableBase, tax: 0, exempt: true };
  }
  const tax = floorHundred(taxableBase * rate);
  return { rate, taxableBase, tax, exempt: false };
}

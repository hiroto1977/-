/**
 * 登録免許税額の概算算定 (純粋ロジック・IO なし)。
 *
 * **重要 — これは概算であり税務助言ではありません。** 実際の登記・税額は、
 * 必ず法務局または司法書士に確認してください。本モジュールは日本の登録免許税の
 * **本則税率** (登録免許税法 別表第一) を再現するだけの教育的シミュレーションです。
 * 租税特別措置法による軽減措置 (例: 土地の売買による所有権移転 1.5%・住宅用家屋の
 * 軽減税率など) は **本モジュールでは扱いません (本則のみ実装)**。
 *
 * 対応する登記:
 *   - 不動産登記 (`realEstateRegistrationTax`)
 *     - 所有権移転 (売買)         transferSale        = 課税標準 × 2.0% (本則 20/1000)
 *     - 所有権保存 (新築)         preservation        = 課税標準 × 0.4% (4/1000)
 *     - 所有権移転 (相続)         transferInheritance = 課税標準 × 0.4% (4/1000)
 *     - 所有権移転 (贈与)         transferGift        = 課税標準 × 2.0% (20/1000)
 *     - 抵当権設定               mortgage            = 債権額 × 0.4% (4/1000)
 *   - 会社設立 (`companyIncorporationTax`)
 *     - 株式会社 (kk) = max(資本金 × 0.7%, 15万円)
 *     - 合同会社 (gk) = max(資本金 × 0.7%, 6万円)
 *
 * 課税標準は不動産登記では固定資産税評価額 (抵当権設定は債権額)。税額は登録免許税法
 * 第19条に基づき **100 円未満を切り捨て** る。
 *
 * ネットワーク / ファイル / Date.now / 乱数は一切使わない純粋関数のみ。
 */

// --- 不動産登記の本則税率 ------------------------------------------------

/** 所有権移転 (売買) の本則税率 (登録免許税法 別表第一 一(二)ハ、20/1000)。 */
export const RATE_TRANSFER_SALE = 0.02;
/** 所有権保存 (新築) の本則税率 (別表第一 一(一)、4/1000)。 */
export const RATE_PRESERVATION = 0.004;
/** 相続による所有権移転の本則税率 (別表第一 一(二)イ、4/1000)。 */
export const RATE_TRANSFER_INHERITANCE = 0.004;
/** 贈与による所有権移転の本則税率 (別表第一 一(二)ハ、20/1000)。 */
export const RATE_TRANSFER_GIFT = 0.02;
/** 抵当権設定の本則税率 (債権額に対し別表第一 五、4/1000)。 */
export const RATE_MORTGAGE = 0.004;

/**
 * 不動産登記の登記種別 (ホワイトリスト)。
 * - `transferSale` … 所有権移転 (売買)
 * - `preservation` … 所有権保存 (新築)
 * - `transferInheritance` … 所有権移転 (相続)
 * - `transferGift` … 所有権移転 (贈与)
 * - `mortgage` … 抵当権設定 (課税標準は債権額)
 */
export type RegistrationType =
  | 'transferSale'
  | 'preservation'
  | 'transferInheritance'
  | 'transferGift'
  | 'mortgage';

/**
 * 不動産登記の登記種別 → 本則税率テーブル。
 *
 * 法定の固定値のため block-level で Stryker を抑制する (根拠: 税率は登録免許税法で
 * 固定。ルックアップの境界・振る舞いは `realEstateRegistrationTax` とテストで全面検証)。
 */
// Stryker disable all
export const REGISTRATION_TAX_RATES: Readonly<Record<RegistrationType, number>> = {
  transferSale: RATE_TRANSFER_SALE,
  preservation: RATE_PRESERVATION,
  transferInheritance: RATE_TRANSFER_INHERITANCE,
  transferGift: RATE_TRANSFER_GIFT,
  mortgage: RATE_MORTGAGE,
};
// Stryker restore all

/** ホワイトリスト判定に用いる登記種別の集合。 */
const REGISTRATION_TYPES: readonly RegistrationType[] = [
  'transferSale',
  'preservation',
  'transferInheritance',
  'transferGift',
  'mortgage',
];

// --- 会社設立の本則税率・最低額 ------------------------------------------

/** 会社設立 (株式会社・合同会社) の登録免許税率 (資本金の 7/1000)。 */
export const INCORPORATION_RATE = 0.007;
/** 株式会社設立の登録免許税の最低額 (円)。 */
export const KK_MINIMUM_TAX = 150_000;
/** 合同会社設立の登録免許税の最低額 (円)。 */
export const GK_MINIMUM_TAX = 60_000;

/**
 * 会社形態 (ホワイトリスト)。
 * - `kk` … 株式会社 (最低額 15万円)
 * - `gk` … 合同会社 (最低額 6万円)
 */
export type CompanyType = 'kk' | 'gk';

/**
 * 会社形態 → 設立登記の登録免許税の最低額テーブル。
 *
 * 法定の固定値のため block-level で Stryker を抑制する (根拠: 最低額は登録免許税法で
 * 固定。「大きい方」の判定・境界は `companyIncorporationTax` とテストで全面検証)。
 */
// Stryker disable all
export const INCORPORATION_MINIMUM_TAX: Readonly<Record<CompanyType, number>> = {
  kk: KK_MINIMUM_TAX,
  gk: GK_MINIMUM_TAX,
};
// Stryker restore all

/** ホワイトリスト判定に用いる会社形態の集合。 */
const COMPANY_TYPES: readonly CompanyType[] = ['kk', 'gk'];

// --- 内部ヘルパ ----------------------------------------------------------

/**
 * 登録免許税額の 100 円未満を切り捨てる (登録免許税法 第19条 / 国税通則法 端数処理)。
 * 1,000 円に満たない場合は本来 1,000 円 (最低税額) だが、本モジュールは概算のため
 * 最低税額の補正は行わない (本則税率の切捨てのみを再現)。
 */
function floorHundred(tax: number): number {
  return Math.floor(tax / 100) * 100;
}

/**
 * 課税標準 / 資本金の入力検証。負値・非有限 (NaN / Infinity) は throw。
 * @param value 検証対象の金額 (円)
 * @param label エラーメッセージ用の項目名
 */
function validateNonNegativeAmount(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number: ${value}`);
  }
  if (value < 0) {
    throw new Error(`${label} must be >= 0: ${value}`);
  }
}

/** 登記種別のホワイトリスト検証 → 本則税率を解決する。範囲外は throw。 */
function resolveRegistrationRate(registrationType: RegistrationType): number {
  if (!REGISTRATION_TYPES.includes(registrationType)) {
    throw new Error(`unknown registrationType: ${String(registrationType)}`);
  }
  return REGISTRATION_TAX_RATES[registrationType];
}

/** 会社形態のホワイトリスト検証 → 設立登記の最低額を解決する。範囲外は throw。 */
function resolveIncorporationMinimum(companyType: CompanyType): number {
  if (!COMPANY_TYPES.includes(companyType)) {
    throw new Error(`unknown companyType: ${String(companyType)}`);
  }
  return INCORPORATION_MINIMUM_TAX[companyType];
}

// --- 不動産登記の登録免許税 ----------------------------------------------

/** `realEstateRegistrationTax` の入力。 */
export interface RealEstateRegistrationInput {
  /**
   * 課税標準 (円)。所有権の登記は固定資産税評価額、抵当権設定は債権額。
   * 負値・非有限は throw。
   */
  readonly taxableValue: number;
  /** 登記種別 (ホワイトリスト)。範囲外は throw。 */
  readonly registrationType: RegistrationType;
}

/** `realEstateRegistrationTax` の結果。 */
export interface RealEstateRegistrationResult {
  /** 適用した本則税率 (0..1)。 */
  readonly rate: number;
  /** 登録免許税額 (円、100 円未満切捨後)。 */
  readonly tax: number;
}

/**
 * 不動産登記の登録免許税を概算する (本則税率)。
 *
 * **概算であり税務助言ではない。実際の登記・税額は法務局/司法書士に確認すること。**
 * 租税特別措置法による軽減措置 (土地売買 1.5%・住宅用家屋特例等) は **非対応**
 * (本則のみ実装)。
 *
 * 課税標準 (所有権登記は固定資産税評価額、抵当権設定は債権額) × 本則税率を求め、
 * 登録免許税額の 100 円未満を切り捨てる。
 *
 * @throws taxableValue が負値・非有限のとき / registrationType がホワイトリスト外のとき
 */
export function realEstateRegistrationTax(
  input: RealEstateRegistrationInput,
): RealEstateRegistrationResult {
  const { taxableValue, registrationType } = input;
  validateNonNegativeAmount(taxableValue, 'taxableValue');
  const rate = resolveRegistrationRate(registrationType);
  const tax = floorHundred(taxableValue * rate);
  return { rate, tax };
}

// --- 会社設立の登録免許税 ------------------------------------------------

/** `companyIncorporationTax` の入力。 */
export interface CompanyIncorporationInput {
  /** 資本金の額 (円)。負値・非有限は throw。 */
  readonly capital: number;
  /** 会社形態 (ホワイトリスト)。範囲外は throw。 */
  readonly companyType: CompanyType;
}

/** `companyIncorporationTax` の結果。 */
export interface CompanyIncorporationResult {
  /** 適用税率 (資本金の 7/1000)。 */
  readonly rate: number;
  /** 会社形態ごとの最低税額 (円)。 */
  readonly minimum: number;
  /** 登録免許税額 (円) = max(資本金 × 0.7% を 100 円未満切捨, 最低額)。 */
  readonly tax: number;
}

/**
 * 会社設立の登録免許税を概算する (本則税率)。
 *
 * **概算であり税務助言ではない。実際の登記・税額は法務局/司法書士に確認すること。**
 * 租税特別措置法等による軽減措置は **非対応** (本則のみ実装)。
 *
 * 株式会社 (`kk`) は max(資本金 × 0.7%, 15万円)、合同会社 (`gk`) は
 * max(資本金 × 0.7%, 6万円) の **いずれか大きい方**。資本金比例分は登録免許税額の
 * 100 円未満を切り捨ててから最低額と比較する。
 *
 * @throws capital が負値・非有限のとき / companyType がホワイトリスト外のとき
 */
export function companyIncorporationTax(
  input: CompanyIncorporationInput,
): CompanyIncorporationResult {
  const { capital, companyType } = input;
  validateNonNegativeAmount(capital, 'capital');
  const minimum = resolveIncorporationMinimum(companyType);
  const proportional = floorHundred(capital * INCORPORATION_RATE);
  const tax = Math.max(proportional, minimum);
  return { rate: INCORPORATION_RATE, minimum, tax };
}

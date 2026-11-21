/**
 * 不動産購入時の税コスト総額コンポーザ (純粋ロジック・IO なし)。
 *
 * **重要 — これは概算であり税務助言ではありません。各税の特例・軽減措置・実額は
 * 税理士/司法書士に確認すること。本コンポーザは取得税 + 登録免許税 + 印紙税の
 * 単純合算で、固定資産税の日割清算・仲介手数料・消費税等は含まない。**
 *
 * 本ファイルは **税率・税額表・計算ロジックを一切再定義しない**。算出は必ず既存の
 * 3 モジュール (単一情報源) の関数呼び出しのみで行う:
 *   - 不動産取得税   `realEstateAcquisitionTax` ({@link ./taxRealEstateAcquisition})
 *   - 登録免許税     `realEstateRegistrationTax` ({@link ./taxRegistrationLicense})
 *   - 印紙税         `stampDutyAmount`           ({@link ./taxStampDuty})
 *
 * 本ファイルが持つのは「入力マッピング + 3 結果の合算」だけ。
 *
 * ネットワーク / ファイル / Date.now / 乱数は一切使わない純粋関数のみ。
 */

import {
  realEstateAcquisitionTax,
  type PropertyType,
} from './taxRealEstateAcquisition';
import {
  realEstateRegistrationTax,
  type RegistrationType,
} from './taxRegistrationLicense';
import { stampDutyAmount } from './taxStampDuty';

/** {@link estimateRealEstatePurchaseTaxCost} の入力。 */
export interface RealEstatePurchaseInput {
  /**
   * 固定資産税評価額 (円)。不動産取得税の課税標準、および登録免許税の課税標準
   * (`taxableValue`) として用いる。負値・非有限は各サブ関数が throw。
   */
  readonly assessedValue: number;
  /**
   * 売買契約書の記載金額 (円)。印紙税 (第1号文書 = 不動産譲渡契約書) の記載金額。
   * `undefined` は記載金額のない契約書を表す。負値・非有限は印紙税モジュールが throw。
   */
  readonly contractAmount?: number;
  /** 不動産種別 (取得税の税率・課税標準・免税点に使う)。範囲外はサブ関数が throw。 */
  readonly propertyType: PropertyType;
  /** 登記種別 (登録免許税の本則税率に使う)。範囲外はサブ関数が throw。 */
  readonly registrationType: RegistrationType;
  /**
   * 土地が宅地評価で課税標準 1/2 特例の対象か (既定 false)。
   * `propertyType: 'land'` のときのみ取得税の課税標準に反映される。
   */
  readonly isUrbanLand?: boolean;
  /**
   * 不動産取得税の軽減税率 (3%) を適用するか (既定 true)。
   * `false` で本則 4%。{@link realEstateAcquisitionTax} 参照。
   */
  readonly applyAcquisitionReduction?: boolean;
  /**
   * 家屋が新築 (建築による取得) か (既定 false)。取得税の免税点解決に使う。
   * 土地には影響しない。
   */
  readonly isNewBuilding?: boolean;
}

/** {@link estimateRealEstatePurchaseTaxCost} の結果 (税コスト内訳)。 */
export interface RealEstatePurchaseTaxBreakdown {
  /** 不動産取得税額 (円)。{@link realEstateAcquisitionTax} の `tax`。 */
  readonly acquisitionTax: number;
  /** 登録免許税額 (円)。{@link realEstateRegistrationTax} の `tax`。 */
  readonly registrationTax: number;
  /** 印紙税額 (円)。{@link stampDutyAmount} の戻り値 (第1号文書)。 */
  readonly stampDuty: number;
  /** 3 税の単純合算 (円) = acquisitionTax + registrationTax + stampDuty。 */
  readonly total: number;
}

/**
 * 不動産購入時の **取得税 + 登録免許税 + 印紙税** を合算して内訳を返すコンポーザ。
 *
 * **概算であり税務助言ではない。各税の特例・軽減措置・実額は税理士/司法書士に
 * 確認すること。本コンポーザは取得税 + 登録免許税 + 印紙税の単純合算で、
 * 固定資産税の日割清算・仲介手数料・消費税等は含まない。**
 *
 * 算出は既存 3 モジュール (単一情報源) の関数呼び出しのみで行い、税率・税額表は
 * 本ファイルで再定義しない。入力検証は各サブ関数の throw に委ねるが、コンポーザ独自の
 * 必須項目 (`assessedValue` / `propertyType` / `registrationType`) の欠落 (null/undefined)
 * は本関数が明示 throw する。
 *
 * 手順:
 * 1. 不動産取得税 = `realEstateAcquisitionTax({ assessedValue, propertyType,
 *    applyReduction, isUrbanLand, isNewBuilding })` の `tax`。
 * 2. 登録免許税 = `realEstateRegistrationTax({ taxableValue: assessedValue,
 *    registrationType })` の `tax`。
 * 3. 印紙税 = `stampDutyAmount({ documentType: 'realEstateTransfer', contractAmount })`。
 * 4. `total` = (1) + (2) + (3)。
 *
 * @throws assessedValue が null/undefined のとき
 * @throws propertyType が null/undefined のとき
 * @throws registrationType が null/undefined のとき
 * @throws 各サブ関数が入力 (負値・非有限・ホワイトリスト外) で throw した場合はそのまま伝播
 */
export function estimateRealEstatePurchaseTaxCost(
  input: RealEstatePurchaseInput,
): RealEstatePurchaseTaxBreakdown {
  const {
    assessedValue,
    contractAmount,
    propertyType,
    registrationType,
    isUrbanLand,
    applyAcquisitionReduction,
    isNewBuilding,
  } = input;

  if (assessedValue === undefined || assessedValue === null) {
    throw new Error('assessedValue is required');
  }
  if (propertyType === undefined || propertyType === null) {
    throw new Error('propertyType is required');
  }
  if (registrationType === undefined || registrationType === null) {
    throw new Error('registrationType is required');
  }

  const acquisitionTax = realEstateAcquisitionTax({
    assessedValue,
    propertyType,
    applyReduction: applyAcquisitionReduction,
    isUrbanLand,
    isNewBuilding,
  }).tax;

  const registrationTax = realEstateRegistrationTax({
    taxableValue: assessedValue,
    registrationType,
  }).tax;

  const stampDuty = stampDutyAmount({
    documentType: 'realEstateTransfer',
    contractAmount,
  });

  const total = acquisitionTax + registrationTax + stampDuty;

  return { acquisitionTax, registrationTax, stampDuty, total };
}

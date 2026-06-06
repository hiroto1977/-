/**
 * 譲渡所得の税額計算 (申告分離課税)。
 *
 * **重要 — これは概算試算であり、正確な税額計算・税務助言ではありません。**
 * 譲渡所得は資産の売却益にかかる所得で、他の所得と分離して課税される
 * (国税庁 No.1440 / No.3202 / No.3208 / No.1463 等)。本モジュールは
 * 土地・建物等 (短期/長期/居住用) と上場株式等の概算に対応する。
 * 取得費不明時の概算取得費 (収入の5%)・買換特例・損益通算・繰越控除などの
 * 特殊なケースは反映しない。確定申告は公式ツール / 税理士で確認すること。
 *
 * 計算の流れ:
 *   譲渡益 = 譲渡収入 − (取得費 + 譲渡費用)
 *   課税譲渡所得 = max(0, 譲渡益 − 特別控除)
 *   税額 = 課税譲渡所得 × (所得税率 × 1.021 + 住民税率)
 */

import { RECONSTRUCTION_SURTAX_RATE } from './taxCalc';

function yen(n: number): number {
  return Math.round(n);
}

/** 譲渡資産の区分。 */
export type CapitalAssetKind =
  | 'real-estate-short' // 土地建物等・短期 (所有期間5年以下)
  | 'real-estate-long' // 土地建物等・長期 (所有期間5年超)
  | 'residential' // 居住用財産 (長期・3,000万特別控除 + 軽減税率)
  | 'listed-stock'; // 上場株式等

/** 居住用財産の3,000万円特別控除の上限 (円)。 */
export const RESIDENTIAL_SPECIAL_DEDUCTION = 30_000_000;

/** 居住用財産の軽減税率が適用される課税譲渡所得の上限 (6,000万円)。 */
export const RESIDENTIAL_REDUCED_RATE_CAP = 60_000_000;

/** 区分ごとの税率 (所得税率・住民税率)。復興特別所得税は別途 1.021 を所得税に乗じる。 */
interface CapitalRate {
  readonly incomeTaxRate: number;
  readonly residentTaxRate: number;
}

// residential は calcCapitalGainsTax 側で軽減税率処理されるため baseRate には渡さない。
// 引数型から residential を除外し、死コード (到達不能 case) を作らない。
function baseRate(kind: Exclude<CapitalAssetKind, 'residential'>): CapitalRate {
  switch (kind) {
    case 'real-estate-short':
      // 短期譲渡: 所得税30% + 住民税9%。
      return { incomeTaxRate: 0.3, residentTaxRate: 0.09 };
    case 'real-estate-long':
    case 'listed-stock':
      // 長期譲渡 / 上場株式等: 所得税15% + 住民税5%。
      return { incomeTaxRate: 0.15, residentTaxRate: 0.05 };
    // Stryker disable all — exhaustive switch の防御コード (到達不能)。
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
    // Stryker restore all
  }
}

export interface CapitalGainsResult {
  /** 譲渡益 (= 収入 − 取得費 − 譲渡費用、負なら0)。 */
  readonly gain: number;
  /** 適用された特別控除額。 */
  readonly specialDeduction: number;
  /** 課税譲渡所得金額 (特別控除後)。 */
  readonly taxableGain: number;
  /** 所得税 (復興特別所得税込み)。 */
  readonly incomeTax: number;
  /** 住民税。 */
  readonly residentTax: number;
  /** 税額合計。 */
  readonly totalTax: number;
  /** 手取り (譲渡収入 − 税額。取得費等は含まない売却代金ベース)。 */
  readonly takeHome: number;
}

/**
 * 譲渡所得にかかる所得税・住民税を試算する。
 *
 * 居住用財産 (`residential`) は 3,000万円特別控除を適用し、課税譲渡所得の
 * うち 6,000万円以下の部分には軽減税率 (所得税10% + 住民税4%)、超過部分には
 * 通常の長期税率 (所得税15% + 住民税5%) を適用する (国税庁 No.3305)。
 *
 * @param proceeds 譲渡収入金額 (売却代金)
 * @param acquisitionCost 取得費
 * @param transferCost 譲渡費用 (仲介手数料等)
 * @param kind 資産区分
 */
/** 概算取得費の割合 (取得費不明時、譲渡収入の5%を取得費とできる)。 */
export const ESTIMATED_ACQUISITION_COST_RATE = 0.05;

/**
 * 概算取得費を計算する = 譲渡収入 × 5% (国税庁 No.3258)。
 * 取得費が不明・実額が概算取得費を下回る場合に取得費として使える。
 *
 * @param proceeds 譲渡収入金額 (円)
 */
export function estimatedAcquisitionCost(proceeds: number): number {
  return Math.round(Math.max(0, proceeds) * ESTIMATED_ACQUISITION_COST_RATE);
}

/**
 * 取得費を決定する = max(実額の取得費, 概算取得費5%)。
 * 概算取得費の方が大きい場合は概算取得費を使う方が有利 (実務頻出)。
 *
 * @param proceeds 譲渡収入金額 (円)
 * @param actualAcquisitionCost 実額の取得費 (不明なら0を渡す)
 * @param useEstimate 概算取得費を考慮するか (既定 true)
 */
export function resolveAcquisitionCost(
  proceeds: number,
  actualAcquisitionCost: number,
  useEstimate = true,
): number {
  const actual = Math.max(0, actualAcquisitionCost);
  if (!useEstimate) return actual;
  return Math.max(actual, estimatedAcquisitionCost(proceeds));
}

export function calcCapitalGainsTax(
  proceeds: number,
  acquisitionCost: number,
  transferCost: number,
  kind: CapitalAssetKind,
): CapitalGainsResult {
  const gain = Math.max(0, Math.max(0, proceeds) - Math.max(0, acquisitionCost) - Math.max(0, transferCost));
  const specialDeduction = kind === 'residential' ? Math.min(RESIDENTIAL_SPECIAL_DEDUCTION, gain) : 0;
  const taxableGain = Math.max(0, gain - specialDeduction);

  let incomeTaxBase: number;
  let residentTax: number;
  if (kind === 'residential') {
    // 軽減税率: 6,000万以下は所得税10%/住民税4%、超過部分は15%/5%。
    const reduced = Math.min(taxableGain, RESIDENTIAL_REDUCED_RATE_CAP);
    const excess = Math.max(0, taxableGain - RESIDENTIAL_REDUCED_RATE_CAP);
    incomeTaxBase = reduced * 0.1 + excess * 0.15;
    residentTax = yen(reduced * 0.04 + excess * 0.05);
  } else {
    const rate = baseRate(kind);
    incomeTaxBase = taxableGain * rate.incomeTaxRate;
    residentTax = yen(taxableGain * rate.residentTaxRate);
  }
  const incomeTax = yen(incomeTaxBase * (1 + RECONSTRUCTION_SURTAX_RATE));
  const totalTax = incomeTax + residentTax;
  return {
    gain,
    specialDeduction,
    taxableGain,
    incomeTax,
    residentTax,
    totalTax,
    takeHome: Math.max(0, proceeds) - totalTax,
  };
}

// ===========================================================================
// 加算的な精緻化 (round 80)
//
// 以下はいずれも概算試算の純粋関数であり、正確な税額計算・税務助言ではない。
// 適用には各特例固有の要件 (居住要件・買換要件・親族間の制限・他特例との
// 重複適用不可など) があり、本モジュールは金額計算の骨子のみを提供する。
// 実際の申告は税理士 / 国税庁の公式ツールで確認すること。
// ===========================================================================

/** 土地建物等の譲渡が「長期」(所有期間5年超) となる所有期間のしきい値 (年)。 */
export const LONG_TERM_OWNERSHIP_YEARS = 5;

/** 居住用財産の軽減税率 (10年超所有) が適用される所有期間のしきい値 (年)。 */
export const REDUCED_RATE_OWNERSHIP_YEARS = 10;

/**
 * 所有期間 (年) から土地建物等の譲渡区分が「長期」(所有期間5年超) か判定する。
 * 取得日の翌日から譲渡した年の1月1日までで判定するのが正確だが、本ヘルパーは
 * 入力された「所有年数」がしきい値を超えるかのみを見る (国税庁 No.3208)。
 * 5年ちょうどは短期 (false)。0・負・非有限は短期 (false) として安全側に倒す。
 *
 * @param years 所有期間 (年)
 */
export function isLongTermOwnership(years: number): boolean {
  if (!Number.isFinite(years)) return false;
  return years > LONG_TERM_OWNERSHIP_YEARS;
}

/**
 * 居住用財産の軽減税率の特例 (10年超所有) の対象かを判定する。
 * 所有期間が10年を「超える」ことが要件 (ちょうど10年は対象外、国税庁 No.3305)。
 * 0・負・非有限は false。
 *
 * @param years 所有期間 (年)
 */
export function qualifiesForReducedRate(years: number): boolean {
  if (!Number.isFinite(years)) return false;
  return years > REDUCED_RATE_OWNERSHIP_YEARS;
}

/**
 * 所有期間から土地建物等の譲渡区分を返すヘルパー。
 * 5年以下 → 短期、5年超 → 長期 (国税庁 No.3208 / No.3211)。
 *
 * @param years 所有期間 (年)
 */
export function classifyRealEstateKind(
  years: number,
): Extract<CapitalAssetKind, 'real-estate-short' | 'real-estate-long'> {
  return isLongTermOwnership(years) ? 'real-estate-long' : 'real-estate-short';
}

/** 相続財産の取得費加算特例の期限 (相続開始から3年10ヶ月 = 46ヶ月)。 */
export const INHERITANCE_ADDITION_DEADLINE_MONTHS = 46;

/**
 * 相続財産を譲渡した場合の取得費加算特例 (国税庁 No.3267)。
 *
 * 相続開始の翌日から相続税の申告期限の翌日以後3年を経過する日 (= 相続開始から
 * おおむね3年10ヶ月) までに相続財産を譲渡した場合、その者が納付した相続税額の
 * うち譲渡資産に対応する部分を取得費に加算できる。
 *
 *   加算額 = 相続税額 × (譲渡資産の相続税評価額 / その者が取得した相続財産の
 *            課税価格 (債務控除前))
 *
 * ただし加算額は「譲渡益 (= 収入 − (取得費 + 譲渡費用))」を上限とする
 * (取得費加算により譲渡損を作り出すことはできない)。
 *
 * 期限超過・分母0・非有限・負入力は加算なし (0) を返す。
 *
 * @param inheritanceTaxPaid その者が納付した相続税額 (円)
 * @param soldAssetInheritanceValue 譲渡資産の相続税評価額 (円)
 * @param totalInheritedTaxableValue その者が取得した相続財産の課税価格 (円)
 * @param gainBeforeAddition 取得費加算前の譲渡益 (円、上限に使用)
 * @param monthsSinceInheritance 相続開始からの経過月数 (期限判定用)
 */
export function inheritanceAcquisitionCostAddition(
  inheritanceTaxPaid: number,
  soldAssetInheritanceValue: number,
  totalInheritedTaxableValue: number,
  gainBeforeAddition: number,
  monthsSinceInheritance: number,
): number {
  if (
    !Number.isFinite(inheritanceTaxPaid) ||
    !Number.isFinite(soldAssetInheritanceValue) ||
    !Number.isFinite(totalInheritedTaxableValue) ||
    !Number.isFinite(gainBeforeAddition) ||
    !Number.isFinite(monthsSinceInheritance)
  ) {
    return 0;
  }
  // 期限超過 (3年10ヶ月超) は適用不可。
  if (monthsSinceInheritance > INHERITANCE_ADDITION_DEADLINE_MONTHS) return 0;
  const tax = Math.max(0, inheritanceTaxPaid);
  const soldValue = Math.max(0, soldAssetInheritanceValue);
  const total = Math.max(0, totalInheritedTaxableValue);
  const cap = Math.max(0, gainBeforeAddition);
  // 分母0 は加算0 (ゼロ除算防止)。
  if (total <= 0) return 0;
  const raw = (tax * soldValue) / total;
  // 譲渡益を上限とする。
  return Math.round(Math.min(raw, cap));
}

/** 特定居住用財産の買換え特例の課税繰延を表す結果。 */
export interface ReplacementDeferralResult {
  /** 譲渡益 (= 収入 − (取得費 + 譲渡費用)、負なら0)。 */
  readonly gain: number;
  /** 今回課税される譲渡益 (買換資産でカバーされない部分)。 */
  readonly taxableGain: number;
  /** 課税が繰り延べられた譲渡益 (買換資産の取得費に引き継がれる)。 */
  readonly deferredGain: number;
}

/**
 * 特定居住用財産の買換え特例 (国税庁 No.3355) の課税部分・繰延部分を算定する。
 *
 * 譲渡資産の収入金額が買換資産の取得価額以下なら譲渡益の全額が繰延 (課税0)。
 * 譲渡収入が買換資産の取得価額を超える場合、その超過額を「収入」とみなして
 * 譲渡益を按分し、超過部分に対応する譲渡益のみ今回課税する。
 *
 *   収入超過額 = max(0, 譲渡収入 − 買換資産取得価額)
 *   課税譲渡益 = 譲渡益 × (収入超過額 / 譲渡収入)
 *   繰延譲渡益 = 譲渡益 − 課税譲渡益
 *
 * 譲渡益が無い (損 or 0) 場合・分母0 (収入0) 場合は課税0・繰延0。
 *
 * @param proceeds 譲渡収入金額 (売却代金)
 * @param acquisitionCost 譲渡資産の取得費
 * @param transferCost 譲渡費用
 * @param replacementCost 買換資産の取得価額
 */
export function replacementPropertyDeferral(
  proceeds: number,
  acquisitionCost: number,
  transferCost: number,
  replacementCost: number,
): ReplacementDeferralResult {
  const p = Math.max(0, proceeds);
  const cost = Math.max(0, acquisitionCost) + Math.max(0, transferCost);
  const replacement = Math.max(0, replacementCost);
  const gain = Math.max(0, p - cost);
  if (gain <= 0 || p <= 0) {
    return { gain, taxableGain: 0, deferredGain: 0 };
  }
  const excess = Math.max(0, p - replacement);
  if (excess <= 0) {
    // 全額買換 → 全額繰延。
    return { gain, taxableGain: 0, deferredGain: gain };
  }
  // 収入の按分比率 (0..1)。excess<=p なので比率は1以下。
  const ratio = Math.min(1, excess / p);
  const taxableGain = Math.round(gain * ratio);
  const deferredGain = gain - taxableGain;
  return { gain, taxableGain, deferredGain };
}

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

function baseRate(kind: CapitalAssetKind): CapitalRate {
  switch (kind) {
    case 'real-estate-short':
      // 短期譲渡: 所得税30% + 住民税9%。
      return { incomeTaxRate: 0.3, residentTaxRate: 0.09 };
    case 'real-estate-long':
    case 'residential':
      // 長期譲渡: 所得税15% + 住民税5%。
      return { incomeTaxRate: 0.15, residentTaxRate: 0.05 };
    case 'listed-stock':
      // 上場株式等: 所得税15% + 住民税5%。
      return { incomeTaxRate: 0.15, residentTaxRate: 0.05 };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
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

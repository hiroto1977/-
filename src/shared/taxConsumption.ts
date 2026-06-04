/**
 * 消費税の納付税額の概算 (本則課税・簡易課税・2割特例)。
 *
 * **重要 — これは概算試算であり、正確な納税額計算・税務助言ではありません。**
 * 日本の消費税制を単純化したシミュレーションです。端数処理・特例の細部・
 * 控除対象外仕入れ・地方消費税の按分・改正対応は完全には反映しません。
 * 簡易課税は基準期間の課税売上が5,000万円以下、2割特例はインボイス登録した
 * 免税事業者向けの経過措置 (令和5年10月〜令和8年分) という適用要件があります。
 * 申告・納税は税理士 / 国税庁・e-Tax で確定してください。
 */

import { CONSUMPTION_TAX_STANDARD, CONSUMPTION_TAX_REDUCED } from './taxCalc';

function yen(n: number): number {
  return Math.round(n);
}

// --- 簡易課税 (みなし仕入率) -------------------------------------------

/** 簡易課税の事業区分。 */
export type SimplifiedBusinessType =
  | 'wholesale' // 第1種 卸売業
  | 'retail' // 第2種 小売業・飲食料品の譲渡
  | 'manufacturing' // 第3種 製造業・建設業・農林漁業
  | 'other' // 第4種 その他 (飲食店業等)
  | 'service' // 第5種 サービス業・金融保険業
  | 'real-estate'; // 第6種 不動産業

/** 事業区分ごとのみなし仕入率。 */
export const DEEMED_PURCHASE_RATES: Record<SimplifiedBusinessType, number> = {
  wholesale: 0.9,
  retail: 0.8,
  manufacturing: 0.7,
  other: 0.6,
  service: 0.5,
  'real-estate': 0.4,
};

/**
 * 簡易課税制度による納付消費税額を概算する。
 *   納付税額 = 売上に係る消費税額 × (1 − みなし仕入率)
 *
 * @param taxableSales 課税売上高 (税抜, 円)
 * @param businessType 事業区分
 * @param rate 適用税率 (既定 標準10%)
 */
export function calcSimplifiedConsumptionTax(
  taxableSales: number,
  businessType: SimplifiedBusinessType,
  rate: number = CONSUMPTION_TAX_STANDARD,
): number {
  const sales = Math.max(0, taxableSales);
  const salesTax = sales * rate;
  const deemed = DEEMED_PURCHASE_RATES[businessType];
  return yen(salesTax * (1 - deemed));
}

// --- 本則課税 -----------------------------------------------------------

/** 税率別の税抜金額 (標準10% / 軽減8%)。 */
export interface AmountByRate {
  /** 標準税率10%適用分の税抜金額。 */
  readonly standard: number;
  /** 軽減税率8%適用分の税抜金額。 */
  readonly reduced: number;
}

/** 税率別の税抜金額から消費税額を求める。 */
function taxOf(a: AmountByRate): number {
  return Math.max(0, a.standard) * CONSUMPTION_TAX_STANDARD + Math.max(0, a.reduced) * CONSUMPTION_TAX_REDUCED;
}

/**
 * 本則課税による納付消費税額を概算する。
 *   納付税額 = 売上に係る消費税額 − 仕入に係る消費税額 (仕入税額控除)
 * 仕入が売上を上回る場合は負値 (還付) を返す。
 *
 * @param sales 税率別の課税売上 (税抜)
 * @param purchases 税率別の課税仕入 (税抜)
 */
export function calcStandardConsumptionTax(sales: AmountByRate, purchases: AmountByRate): number {
  return yen(taxOf(sales) - taxOf(purchases));
}

// --- 2割特例 -----------------------------------------------------------

/** 2割特例の負担割合 (売上税額の20%)。 */
export const TWENTY_PERCENT_RATE = 0.2;

/**
 * 2割特例 (インボイス発行事業者の経過措置) による納付消費税額を概算する。
 *   納付税額 = 売上に係る消費税額 × 20%
 *
 * インボイス登録により免税事業者から課税事業者になった小規模事業者向けの
 * 経過措置 (令和5年10月〜令和8年分)。適用可否は呼び出し側で判定する。
 *
 * @param taxableSales 課税売上高 (税抜, 円)
 * @param rate 適用税率 (既定 標準10%)
 */
export function calcTwentyPercentSpecial(
  taxableSales: number,
  rate: number = CONSUMPTION_TAX_STANDARD,
): number {
  const sales = Math.max(0, taxableSales);
  return yen(sales * rate * TWENTY_PERCENT_RATE);
}

// --- 方式の比較 (最も納付が少ない方式) ----------------------------------

export type ConsumptionTaxMethod = 'standard' | 'simplified' | 'twenty-percent';

export interface ConsumptionTaxComparison {
  readonly standard: number;
  readonly simplified: number;
  readonly twentyPercent: number;
  /** 納付額が最も少ない方式。 */
  readonly best: ConsumptionTaxMethod;
}

/**
 * 本則・簡易・2割特例の納付税額を比較し、最も納付が少ない方式を返す。
 *
 * @param taxableSales 課税売上高 (税抜)
 * @param purchases 本則課税で控除する課税仕入 (税率別・税抜)
 * @param businessType 簡易課税の事業区分
 */
export function compareConsumptionTaxMethods(
  taxableSales: number,
  purchases: AmountByRate,
  businessType: SimplifiedBusinessType,
): ConsumptionTaxComparison {
  const standard = calcStandardConsumptionTax({ standard: Math.max(0, taxableSales), reduced: 0 }, purchases);
  const simplified = calcSimplifiedConsumptionTax(taxableSales, businessType);
  const twentyPercent = calcTwentyPercentSpecial(taxableSales);

  let best: ConsumptionTaxMethod = 'standard';
  let min = standard;
  if (simplified < min) { best = 'simplified'; min = simplified; }
  if (twentyPercent < min) { best = 'twenty-percent'; min = twentyPercent; }
  return { standard, simplified, twentyPercent, best };
}

/**
 * 事業者向け消費税の納付税額概算 — 複数事業の加重みなし仕入率・軽減税率混在・
 * 本則/簡易/2割特例の有利判定・基準期間による免税判定。
 *
 * **重要 — これは概算試算であり、正確な納税額計算・税務助言ではありません。**
 * 日本の消費税制を単純化したシミュレーションです。端数処理 (国税/地方税の按分・
 * 仕入税額の積上げ/割戻し計算)・特例の細部・控除対象外仕入れ・非課税/免税売上の
 * 区分・改正対応は完全には反映しません。
 *
 * - **簡易課税**は基準期間の課税売上高が 5,000 万円以下の事業者が事前届出により選択。
 *   複数事業を営む場合は事業区分ごとの売上税額で加重した「加重平均みなし仕入率」を用いる。
 * - **2割特例**はインボイス登録により免税事業者から課税事業者になった小規模事業者向けの
 *   経過措置 (令和5年10月1日〜令和8年9月30日を含む課税期間)。売上税額の 8 割を控除し
 *   2 割を納付する。適用可否・期間は呼び出し側 / 申告で確認すること。
 * - 基準期間 (前々年/前々事業年度) の課税売上高が 1,000 万円以下なら原則として免税事業者。
 *
 * 申告・納税は税理士 / 国税庁・e-Tax で確定してください。
 */

import {
  CONSUMPTION_TAX_STANDARD,
  CONSUMPTION_TAX_REDUCED,
} from './taxCalc';
import {
  DEEMED_PURCHASE_RATES,
  TWENTY_PERCENT_RATE,
  type AmountByRate,
  type SimplifiedBusinessType,
  type ConsumptionTaxMethod,
} from './taxConsumption';

export type {
  AmountByRate,
  SimplifiedBusinessType,
  ConsumptionTaxMethod,
} from './taxConsumption';

/** 基準期間で免税事業者となる課税売上高の上限 (1,000万円)。 */
export const EXEMPTION_THRESHOLD = 10_000_000;

/** 簡易課税を選択できる基準期間の課税売上高の上限 (5,000万円)。 */
export const SIMPLIFIED_ELIGIBILITY_THRESHOLD = 50_000_000;

/** 円未満を四捨五入し、非有限はガードして 0 にする。 */
function yen(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** 非有限・負の金額を 0 に丸める。 */
function nonNegativeFinite(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 税率別の税抜金額から消費税額 (標準10% + 軽減8%) を求める。 */
function taxOf(a: AmountByRate): number {
  return (
    nonNegativeFinite(a.standard) * CONSUMPTION_TAX_STANDARD +
    nonNegativeFinite(a.reduced) * CONSUMPTION_TAX_REDUCED
  );
}

// --- 本則課税 (軽減税率混在) ---------------------------------------------

/**
 * 本則課税による納付消費税額を概算する (端数処理込み)。
 *   納付税額 = 売上に係る消費税額 − 仕入に係る消費税額 (仕入税額控除)
 * 仕入が売上を上回る場合は負値 (還付見込み) を返す。
 */
export function calcStandardTax(sales: AmountByRate, purchases: AmountByRate): number {
  return yen(taxOf(sales) - taxOf(purchases));
}

// --- 簡易課税 (複数事業の加重みなし仕入率) -------------------------------

/** 事業区分ごとの課税売上 (税率別・税抜)。 */
export interface BusinessSegment {
  readonly type: SimplifiedBusinessType;
  readonly sales: AmountByRate;
}

/**
 * 複数事業の加重平均みなし仕入率を求める。
 *   加重率 = Σ(区分の売上税額 × みなし仕入率) / Σ(区分の売上税額)
 * 売上税額が全区分で 0 (分母 0) の場合は 0 を返す。
 */
export function weightedDeemedRate(segments: readonly BusinessSegment[]): number {
  let weightedNumerator = 0;
  let totalSalesTax = 0;
  for (const seg of segments) {
    const salesTax = taxOf(seg.sales);
    weightedNumerator += salesTax * DEEMED_PURCHASE_RATES[seg.type];
    totalSalesTax += salesTax;
  }
  if (totalSalesTax <= 0) return 0;
  return weightedNumerator / totalSalesTax;
}

/**
 * 簡易課税による納付消費税額を概算する (複数事業対応・軽減税率混在)。
 *   納付税額 = 売上税額 × (1 − 加重平均みなし仕入率)
 */
export function calcSimplifiedTax(segments: readonly BusinessSegment[]): number {
  let totalSalesTax = 0;
  for (const seg of segments) {
    totalSalesTax += taxOf(seg.sales);
  }
  const deemed = weightedDeemedRate(segments);
  return yen(totalSalesTax * (1 - deemed));
}

// --- 2割特例 (軽減税率混在) ---------------------------------------------

/**
 * 2割特例による納付消費税額を概算する (軽減税率混在対応)。
 *   納付税額 = 売上に係る消費税額 × 20%
 */
export function calcTwentyPercentTax(sales: AmountByRate): number {
  return yen(taxOf(sales) * TWENTY_PERCENT_RATE);
}

// --- 免税 / 簡易課税の適用判定 ------------------------------------------

/**
 * 基準期間の課税売上高から免税事業者か否かを判定する。
 *   課税売上高 1,000万円以下 → 免税事業者 (true)
 * 非有限・負は 0 とみなす (= 免税)。
 */
export function isTaxExempt(baseTaxableSales: number): boolean {
  return nonNegativeFinite(baseTaxableSales) <= EXEMPTION_THRESHOLD;
}

/**
 * 基準期間の課税売上高から簡易課税を選択できるか判定する。
 *   課税売上高 5,000万円以下 → 選択可 (true)
 */
export function canUseSimplified(baseTaxableSales: number): boolean {
  return nonNegativeFinite(baseTaxableSales) <= SIMPLIFIED_ELIGIBILITY_THRESHOLD;
}

// --- 3方式の有利判定 ----------------------------------------------------

export interface BusinessTaxComparison {
  /** 本則課税の納付税額。 */
  readonly standard: number;
  /** 簡易課税の納付税額。 */
  readonly simplified: number;
  /** 2割特例の納付税額。 */
  readonly twentyPercent: number;
  /** 適用した加重平均みなし仕入率 (簡易課税)。 */
  readonly appliedDeemedRate: number;
  /** 納付額が最も少ない方式。 */
  readonly best: ConsumptionTaxMethod;
  /** 最小の納付税額。 */
  readonly bestAmount: number;
}

/**
 * 本則・簡易・2割特例の納付税額を比較し、最も納付が少ない方式を返す。
 * 同値の場合は本則 → 簡易 → 2割特例 の順 (本則を優先) で確定する
 * (`<` は厳密比較; `<=` ではない)。
 *
 * @param segments 事業区分ごとの課税売上 (税率別・税抜)
 * @param purchases 本則課税で控除する課税仕入 (税率別・税抜) の合計
 */
export function compareBusinessTaxMethods(
  segments: readonly BusinessSegment[],
  purchases: AmountByRate,
): BusinessTaxComparison {
  const totalSales: AmountByRate = segments.reduce<AmountByRate>(
    (acc, seg) => ({
      standard: acc.standard + nonNegativeFinite(seg.sales.standard),
      reduced: acc.reduced + nonNegativeFinite(seg.sales.reduced),
    }),
    { standard: 0, reduced: 0 },
  );

  const standard = calcStandardTax(totalSales, purchases);
  const simplified = calcSimplifiedTax(segments);
  const twentyPercent = calcTwentyPercentTax(totalSales);
  const appliedDeemedRate = weightedDeemedRate(segments);

  let best: ConsumptionTaxMethod = 'standard';
  let bestAmount = standard;
  if (simplified < bestAmount) {
    best = 'simplified';
    bestAmount = simplified;
  }
  if (twentyPercent < bestAmount) {
    best = 'twenty-percent';
    bestAmount = twentyPercent;
  }
  return { standard, simplified, twentyPercent, appliedDeemedRate, best, bestAmount };
}

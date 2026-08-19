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

import { yen } from './num';
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
/**
 * 円未満を四捨五入し、非有限値は 0 に落とす。
 *
 * 共通の `yen` は非有限値をそのまま伝播させる。ここだけ 0 に落とすのは、
 * このモジュールが画面の入力欄を直接受け取り、「NaN 円」と表示するくらいなら
 * 0 円と出したほうが読み手を惑わせないため（税額の 0 は「今回は納付なし」と
 * 読める）。方針が違うので別名にし、共通の `yen` を内側で使う。
 */
function yenOr0(n: number): number {
  return Number.isFinite(n) ? yen(n) : 0;
}

/** 非有限・負の金額を 0 に丸める。 */
function nonNegativeFinite(n: number): number {
  // Stryker disable next-line EqualityOperator: `> 0` ⇔ `>= 0` は等価変異。
  // n === 0 のとき両分岐とも 0 を返す (then 分岐は n=0、else 分岐は定数 0)。
  // 後段は常に金額 × 税率 or 加算で使われ、0 の寄与は皆無のため観測不能。
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
  return yenOr0(taxOf(sales) - taxOf(purchases));
}

// --- 本則課税の仕入控除税額 (全額控除 / 個別対応 / 一括比例配分) ---------
//
// 上の `calcStandardTax` は「課税仕入れ等の税額を全額控除できる」場合の式で、
// これが成り立つのは**課税売上割合 95% 以上かつ課税売上高 5億円以下**のとき
// だけである。住宅家賃・利子・保険料・医療・教育のような**非課税売上**がある
// 事業者は全額を控除できず、按分しなければならない。按分せずに全額を引くと
// **控除しすぎ = 納付が過少**に出る。以下はその按分を扱う。

/** 全額控除の要件その 1: 課税売上割合がこの値**以上**なら按分不要 (95%)。 */
export const FULL_CREDIT_RATIO_THRESHOLD = 0.95;

/** 全額控除の要件その 2: 課税売上高がこの値**以下** (5億円)。 */
export const FULL_CREDIT_SALES_THRESHOLD = 500_000_000;

/** 仕入控除税額の計算方式。 */
export type InputCreditMethod =
  | 'full' // 全額控除
  | 'itemized' // 個別対応方式
  | 'proportional'; // 一括比例配分方式

/**
 * 課税仕入れ等の用途区分 (税率別・税抜)。個別対応方式はこの 3 区分を使う。
 * 一括比例配分方式は区分せず合計だけを使うが、同じ入力から両方を出せるよう
 * 常にこの形で受け取る。
 */
export interface PurchaseByUse {
  /** 課税売上にのみ要する課税仕入れ (全額が控除対象)。 */
  readonly taxableOnly: AmountByRate;
  /** 非課税売上にのみ要する課税仕入れ (個別対応方式では 1 円も控除できない)。 */
  readonly exemptOnly: AmountByRate;
  /** 課税・非課税に共通して要する課税仕入れ (課税売上割合を掛けて控除)。 */
  readonly common: AmountByRate;
}

/** 用途区分をまとめて 1 つの税抜金額とみなす (一括比例配分方式で使う)。 */
function totalPurchaseTax(p: PurchaseByUse): number {
  return taxOf(p.taxableOnly) + taxOf(p.exemptOnly) + taxOf(p.common);
}

/**
 * 割合を 0..1 に収める。呼び出し側が実績以外の値を渡しても壊れないように。
 * 分岐で書くと「0 のとき」がどちらの枝でも同じ値になり観測できない等価変異に
 * なるので、min/max で挟む形にしてある。
 */
function clampRatio(r: number): number {
  if (!Number.isFinite(r)) return 0;
  return Math.min(1, Math.max(0, r));
}

/**
 * 課税売上割合を求める。
 *   課税売上割合 = (課税売上高 + 免税売上高) / (課税売上高 + 免税売上高 + 非課税売上高)
 *
 * すべて税抜。輸出等の免税売上は税額こそ 0 だが**分子にも分母にも入る**ため、
 * 輸出が多い事業者ほど割合は高くなる (控除できる仕入税額が増える)。
 *
 * 分母が 0 (売上がまったく無い) のときは按分のしようがないので **0** を返す。
 * 同モジュールの `weightedDeemedRate` と同じ約束にしてある。売上の立っていない
 * 課税期間の扱いは実務で分かれるので、その期は税理士に確認すること。
 */
export function taxableSalesRatio(taxableAndExportSales: number, exemptSales: number): number {
  const taxable = nonNegativeFinite(taxableAndExportSales);
  const total = taxable + nonNegativeFinite(exemptSales);
  if (total <= 0) return 0;
  return taxable / total;
}

/**
 * 課税仕入れ等の税額を**全額控除**できるかを判定する。
 *   課税売上割合 95% 以上 **かつ** 課税売上高 5億円以下 → true
 * どちらか一方でも外れると、個別対応方式か一括比例配分方式で按分する。
 */
export function canDeductFully(taxableAndExportSales: number, exemptSales: number): boolean {
  return (
    taxableSalesRatio(taxableAndExportSales, exemptSales) >= FULL_CREDIT_RATIO_THRESHOLD &&
    nonNegativeFinite(taxableAndExportSales) <= FULL_CREDIT_SALES_THRESHOLD
  );
}

/**
 * 個別対応方式の控除税額。
 *   控除税額 = 課税売上対応分 + 共通対応分 × 課税売上割合
 * 非課税売上にのみ要する仕入れは 1 円も控除できない。
 */
export function itemizedInputCredit(purchases: PurchaseByUse, ratio: number): number {
  return taxOf(purchases.taxableOnly) + taxOf(purchases.common) * clampRatio(ratio);
}

/**
 * 一括比例配分方式の控除税額。
 *   控除税額 = 課税仕入れ等の税額の合計 × 課税売上割合
 * 用途区分をしなくてよい代わりに、**選択したら 2 年間は継続適用**しなければ
 * ならない (消費税法 §30⑤)。翌期の見込みも含めて選ぶこと。
 */
export function proportionalInputCredit(purchases: PurchaseByUse, ratio: number): number {
  return totalPurchaseTax(purchases) * clampRatio(ratio);
}

/** 本則課税の内訳。 */
export interface StandardTaxBreakdown {
  /** 売上に係る消費税額。 */
  readonly salesTax: number;
  /** 課税仕入れ等に係る消費税額の合計 (按分前)。 */
  readonly inputTaxTotal: number;
  /** 課税売上割合 (0..1)。 */
  readonly ratio: number;
  /** 全額控除の要件を満たすか。 */
  readonly fullyDeductible: boolean;
  /** 実際に適用した方式。 */
  readonly method: InputCreditMethod;
  /** 仕入控除税額 (按分後)。 */
  readonly inputCredit: number;
  /** 納付税額。仕入が売上を上回れば負値 (還付見込み)。 */
  readonly payable: number;
}

/** `calcStandardTaxDetailed` の入力。 */
export interface StandardTaxInput {
  /** 課税売上 (税率別・税抜)。10% / 8% が乗るもの。 */
  readonly taxableSales: AmountByRate;
  /** 免税売上高 (輸出等・税抜)。税額 0 だが課税売上割合の分子・分母に入る。既定 0。 */
  readonly exportSales?: number;
  /** 非課税売上高 (税抜)。住宅家賃・利子・保険料・医療・教育等。分母だけに入る。既定 0。 */
  readonly exemptSales?: number;
  /** 課税仕入れ等の用途区分 (税率別・税抜)。 */
  readonly purchases: PurchaseByUse;
  /** 全額控除できないときに使う方式。既定は個別対応方式。 */
  readonly method?: Exclude<InputCreditMethod, 'full'>;
}

/**
 * 本則課税の納付税額を、仕入控除税額の按分まで含めて概算する。
 *
 *   納付税額 = 売上に係る消費税額 − 仕入控除税額
 *
 * 全額控除の要件を満たすときは `method` の指定によらず全額控除になる
 * (要件を満たすのに按分するのは不利なだけなので、方式の選択は要件を
 * 満たさないときにだけ意味がある)。
 *
 * **重要 — 概算であり税務助言ではありません。** 課税売上割合に準ずる割合の
 * 承認、たな卸資産・調整対象固定資産の調整、国税/地方税の按分の端数処理は
 * 反映しません。申告は税理士・国税庁で確定してください。
 */
export function calcStandardTaxDetailed(input: StandardTaxInput): StandardTaxBreakdown {
  const salesTax = taxOf(input.taxableSales);
  const inputTaxTotal = totalPurchaseTax(input.purchases);
  const taxableAndExport =
    nonNegativeFinite(input.taxableSales.standard) +
    nonNegativeFinite(input.taxableSales.reduced) +
    nonNegativeFinite(input.exportSales ?? 0);
  const exemptSales = nonNegativeFinite(input.exemptSales ?? 0);
  const ratio = taxableSalesRatio(taxableAndExport, exemptSales);
  const fullyDeductible = canDeductFully(taxableAndExport, exemptSales);

  const method: InputCreditMethod = fullyDeductible ? 'full' : (input.method ?? 'itemized');
  const inputCredit =
    method === 'full'
      ? inputTaxTotal
      : method === 'itemized'
        ? itemizedInputCredit(input.purchases, ratio)
        : proportionalInputCredit(input.purchases, ratio);

  return {
    salesTax: yenOr0(salesTax),
    inputTaxTotal: yenOr0(inputTaxTotal),
    ratio,
    fullyDeductible,
    method,
    inputCredit: yenOr0(inputCredit),
    payable: yenOr0(salesTax - inputCredit),
  };
}

/** 個別対応方式と一括比例配分方式の比較結果。 */
export interface InputCreditComparison {
  /** 課税売上割合 (0..1)。 */
  readonly ratio: number;
  /** 全額控除の要件を満たすか (満たすなら方式の選択に意味はない)。 */
  readonly fullyDeductible: boolean;
  /** 個別対応方式の控除税額。 */
  readonly itemized: number;
  /** 一括比例配分方式の控除税額。 */
  readonly proportional: number;
  /** 控除税額が多い方 (= 納付が少ない方)。同額なら個別対応方式。 */
  readonly better: Exclude<InputCreditMethod, 'full'>;
}

/**
 * 全額控除できないときの 2 方式を比べる。**控除税額が多い方**が有利
 * (納付が少ない)。同額のときは**個別対応方式**を返す — 一括比例配分方式には
 * 2 年間の継続適用の縛りがあり、同じ金額なら縛りの無い方を選べるため。
 */
export function compareInputCreditMethods(
  purchases: PurchaseByUse,
  taxableAndExportSales: number,
  exemptSales: number,
): InputCreditComparison {
  const ratio = taxableSalesRatio(taxableAndExportSales, exemptSales);
  const itemized = yenOr0(itemizedInputCredit(purchases, ratio));
  const proportional = yenOr0(proportionalInputCredit(purchases, ratio));
  return {
    ratio,
    fullyDeductible: canDeductFully(taxableAndExportSales, exemptSales),
    itemized,
    proportional,
    better: proportional > itemized ? 'proportional' : 'itemized',
  };
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
  return yenOr0(totalSalesTax * (1 - deemed));
}

// --- 2割特例 (軽減税率混在) ---------------------------------------------

/**
 * 2割特例による納付消費税額を概算する (軽減税率混在対応)。
 *   納付税額 = 売上に係る消費税額 × 20%
 */
export function calcTwentyPercentTax(sales: AmountByRate): number {
  return yenOr0(taxOf(sales) * TWENTY_PERCENT_RATE);
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

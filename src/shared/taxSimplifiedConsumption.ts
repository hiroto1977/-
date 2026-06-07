/**
 * 消費税「簡易課税制度」の納付税額の概算 (純粋関数のみ・IO なし)。
 *
 * **重要 — これは概算試算であり、正確な納税額計算・税務助言ではありません。**
 * 日本の消費税 簡易課税制度を単純化したシミュレーションです。複数事業の
 * みなし仕入率の按分・特定収入の調整・控除対象外仕入れ・地方消費税の按分・
 * 軽減税率の区分・年度改正は反映しません。簡易課税は基準期間の課税売上が
 * 5,000万円以下の事業者が事前届出により選択でき、2割特例はインボイス登録した
 * 免税事業者向けの経過措置 (令和5年10月〜令和8年分) という適用要件があります。
 * 実際の申告・納税は税理士に確認し、国税庁 / e-Tax で確定してください。
 *
 * このモジュールはネットワーク / ファイル / `Date.now` / 乱数を一切使わない
 * 決定的な純粋関数のみで構成されており、単体テストで完全に検証できます。
 */

/**
 * 簡易課税の事業区分 (第1種〜第6種)。
 * 範囲外の値はホワイトリスト検証で `throw` する。
 */
export type SimplifiedBusinessType = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * 事業区分ごとのみなし仕入率テーブル (国税庁 No.6505)。
 * - 第1種 卸売業 90%
 * - 第2種 小売業 80%
 * - 第3種 製造業等 70%
 * - 第4種 その他 60%
 * - 第5種 サービス業等 50%
 * - 第6種 不動産業 40%
 *
 * このテーブルは法定の固定値であり、各率の同一性 (キー→率) は
 * `deemedPurchaseRate` 経由でテストが厳密に pin する。法定定数の羅列であり
 * 算術ロジックを含まないため、block-level で Stryker を抑制する。
 */
// Stryker disable all
const DEEMED_PURCHASE_RATE_TABLE: Readonly<Record<SimplifiedBusinessType, number>> = {
  1: 0.9,
  2: 0.8,
  3: 0.7,
  4: 0.6,
  5: 0.5,
  6: 0.4,
};
// Stryker restore all

/** 適用税率として受け付ける上限 (= 100%)。 */
const MAX_TAX_RATE = 1;

/**
 * 課税売上 (税抜) が有効か検証する。負数は `throw`。
 * 非有限値 (NaN / Infinity) も不正入力として `throw`。
 */
function assertSales(taxableSalesExcludingTax: number): void {
  if (!Number.isFinite(taxableSalesExcludingTax) || taxableSalesExcludingTax < 0) {
    throw new Error(
      `課税売上 (税抜) は 0 以上の有限値で指定してください: ${taxableSalesExcludingTax}`,
    );
  }
}

/**
 * 適用税率が有効か検証する。許容範囲は (0, 1] (0 超 1 以下)。
 * 範囲外・非有限値は `throw`。
 */
function assertTaxRate(taxRate: number): void {
  if (!Number.isFinite(taxRate) || taxRate <= 0 || taxRate > MAX_TAX_RATE) {
    throw new Error(`税率は 0 超 1 以下で指定してください: ${taxRate}`);
  }
}

/**
 * 事業区分のみなし仕入率を返す。
 *
 * **概算であり税務助言ではありません。実際の申告は税理士に確認してください。**
 *
 * `businessType` は `1|2|3|4|5|6` のホワイトリスト。範囲外は `throw new Error`。
 *
 * @param businessType 事業区分 (第1種〜第6種)
 * @returns みなし仕入率 (0.9 / 0.8 / 0.7 / 0.6 / 0.5 / 0.4)
 */
export function deemedPurchaseRate(businessType: SimplifiedBusinessType): number {
  const rate = DEEMED_PURCHASE_RATE_TABLE[businessType];
  if (rate === undefined) {
    throw new Error(`事業区分は 1〜6 で指定してください: ${businessType}`);
  }
  return rate;
}

/** 簡易課税の納付税額の内訳。 */
export interface SimplifiedConsumptionTaxResult {
  /** 課税売上に係る消費税額 (売上税額)。円未満切捨て。 */
  readonly salesTax: number;
  /** みなし仕入れに係る控除税額 (= 売上税額 × みなし仕入率)。円未満切捨て。 */
  readonly deemedDeduction: number;
  /** 納付税額 (= 売上税額 − みなし控除)。 */
  readonly payable: number;
}

/** `simplifiedConsumptionTax` / `twentyPercentSpecialRule` の入力。 */
export interface SimplifiedConsumptionTaxInput {
  /** 課税売上高 (税抜, 円)。負数は `throw`。 */
  readonly taxableSalesExcludingTax: number;
  /** 適用税率 (既定 0.10)。(0, 1] 外は `throw`。 */
  readonly taxRate?: number;
}

/** `simplifiedConsumptionTax` の入力 (事業区分つき)。 */
export interface SimplifiedConsumptionTaxParams extends SimplifiedConsumptionTaxInput {
  /** 事業区分 (第1種〜第6種)。ホワイトリスト外は `throw`。 */
  readonly businessType: SimplifiedBusinessType;
}

/** 適用税率の既定値 (標準税率 10%)。 */
export const DEFAULT_TAX_RATE = 0.1;

/**
 * 簡易課税制度による納付消費税額を概算する。
 *
 * **概算であり税務助言ではありません。実際の申告は税理士に確認してください。**
 *
 *   売上税額 = floor(課税売上(税抜) × 税率)
 *   みなし控除 = floor(売上税額 × みなし仕入率)
 *   納付税額 = 売上税額 − みなし控除
 *
 * 端数処理: 国税庁の消費税額の計算では課税標準額・税額を各段階で「円未満切捨て」
 * とする。本関数も売上税額・みなし控除をそれぞれ `Math.floor` で円未満切捨てし、
 * その差額を納付税額とする (段階ごとに切捨てるため、まとめて計算した値とは
 * 1 円単位でずれることがある)。
 *
 * 入力検証:
 * - 課税売上 (税抜) が負数・非有限値 → `throw`。
 * - `taxRate` が (0, 1] の範囲外・非有限値 → `throw` (既定 0.10)。
 * - `businessType` がホワイトリスト (1〜6) 外 → `throw`。
 *
 * @param params {@link SimplifiedConsumptionTaxParams}
 * @returns {@link SimplifiedConsumptionTaxResult}
 */
export function simplifiedConsumptionTax(
  params: SimplifiedConsumptionTaxParams,
): SimplifiedConsumptionTaxResult {
  const { taxableSalesExcludingTax, businessType, taxRate = DEFAULT_TAX_RATE } = params;
  assertSales(taxableSalesExcludingTax);
  assertTaxRate(taxRate);
  const rate = deemedPurchaseRate(businessType);

  const salesTax = Math.floor(taxableSalesExcludingTax * taxRate);
  const deemedDeduction = Math.floor(salesTax * rate);
  const payable = salesTax - deemedDeduction;
  return { salesTax, deemedDeduction, payable };
}

/** 2割特例の負担割合 (売上税額の20%)。 */
export const TWENTY_PERCENT_RATE = 0.2;

/** 2割特例の納付税額の内訳。 */
export interface TwentyPercentSpecialResult {
  /** 課税売上に係る消費税額 (売上税額)。円未満切捨て。 */
  readonly salesTax: number;
  /** 納付税額 (= 売上税額 × 20%)。円未満切捨て。 */
  readonly payable: number;
}

/**
 * 2割特例 (インボイス発行事業者の経過措置) による納付消費税額を概算する。
 *
 * **概算であり税務助言ではありません。実際の申告は税理士に確認してください。**
 *
 *   売上税額 = floor(課税売上(税抜) × 税率)
 *   納付税額 = floor(売上税額 × 20%)
 *
 * インボイス登録により免税事業者から課税事業者になった小規模事業者向けの
 * 経過措置 (令和5年10月〜令和8年分)。適用可否は呼び出し側で判定すること。
 * 端数処理は `simplifiedConsumptionTax` と同様に各段階で円未満切捨て。
 *
 * 入力検証: 売上が負数・非有限値 → `throw`。`taxRate` が (0, 1] 外 → `throw`。
 *
 * @param params {@link SimplifiedConsumptionTaxInput}
 * @returns {@link TwentyPercentSpecialResult}
 */
export function twentyPercentSpecialRule(
  params: SimplifiedConsumptionTaxInput,
): TwentyPercentSpecialResult {
  const { taxableSalesExcludingTax, taxRate = DEFAULT_TAX_RATE } = params;
  assertSales(taxableSalesExcludingTax);
  assertTaxRate(taxRate);

  const salesTax = Math.floor(taxableSalesExcludingTax * taxRate);
  const payable = Math.floor(salesTax * TWENTY_PERCENT_RATE);
  return { salesTax, payable };
}

/** 有利判定で選択された計算方式の名称。 */
export type LowerBurdenMethod = '簡易課税' | '2割特例';

/** `chooseLowerBurden` の結果。 */
export interface LowerBurdenResult {
  /** 納付額が低い方の方式名。 */
  readonly method: LowerBurdenMethod;
  /** 採用した方式の納付税額 (= 2 方式の小さい方)。 */
  readonly payable: number;
  /** 簡易課税の納付税額 (比較用)。 */
  readonly simplifiedPayable: number;
  /** 2割特例の納付税額 (比較用)。 */
  readonly twentyPercentPayable: number;
}

/**
 * 簡易課税 (本人の事業区分) と 2割特例の納付額を比較し、
 * **納付が少ない方** とその方式名を返す純粋関数。
 *
 * **概算であり税務助言ではありません。実際の申告は税理士に確認してください。**
 *
 * 同額の場合は `'簡易課税'` を採用する (`<` の厳密比較。`2割特例` が厳密に
 * 少ないときのみ `'2割特例'` を選ぶ)。
 *
 * 入力検証は内部で呼ぶ {@link simplifiedConsumptionTax} /
 * {@link twentyPercentSpecialRule} に委譲する (売上・税率・事業区分)。
 *
 * @param params {@link SimplifiedConsumptionTaxParams}
 * @returns {@link LowerBurdenResult}
 */
export function chooseLowerBurden(
  params: SimplifiedConsumptionTaxParams,
): LowerBurdenResult {
  const simplifiedPayable = simplifiedConsumptionTax(params).payable;
  const twentyPercentPayable = twentyPercentSpecialRule(params).payable;

  if (twentyPercentPayable < simplifiedPayable) {
    return {
      method: '2割特例',
      payable: twentyPercentPayable,
      simplifiedPayable,
      twentyPercentPayable,
    };
  }
  return {
    method: '簡易課税',
    payable: simplifiedPayable,
    simplifiedPayable,
    twentyPercentPayable,
  };
}

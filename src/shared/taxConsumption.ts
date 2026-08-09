/**
 * 消費税の事業区分・税率別金額 — 型と率の定義。
 *
 * 納付税額そのものの算定は `taxConsumptionBusiness.ts` に一本化してある。
 * かつてはこちらにも本則・簡易・2割特例の 3 本が並んでいたが、同じ式が 2 モジュールに
 * 重複し、しかも**非有限値の扱いだけが食い違っていた** — こちらは NaN をそのまま返し、
 * 向こうは 0 に落とす。同じ入力が経路によって「NaN 円」と「0 円」に分かれる状態だった。
 * 固めてある側だけを実装として残し、こちらは型と率に絞った（計算関数はアプリのどこからも
 * 呼ばれておらず、テストだけが呼んでいた）。
 *
 * **重要 — 概算であり税務助言ではありません。** 適用要件（簡易課税は基準期間の課税売上
 * 5,000万円以下、2割特例はインボイス登録した免税事業者向けの経過措置）の判定は
 * `taxConsumptionBusiness.ts` にあります。
 */

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

/** 税率別の税抜金額 (標準10% / 軽減8%)。 */
export interface AmountByRate {
  /** 標準税率10%適用分の税抜金額。 */
  readonly standard: number;
  /** 軽減税率8%適用分の税抜金額。 */
  readonly reduced: number;
}

/** 2割特例の納付割合（売上に係る消費税額の20%）。 */
export const TWENTY_PERCENT_RATE = 0.2;

/** 納付税額の算定方式。 */
export type ConsumptionTaxMethod = 'standard' | 'simplified' | 'twenty-percent';

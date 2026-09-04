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

/**
 * 2割特例が使える最後の日 —— **期限つきの経過措置である。**
 *
 * 適用対象は令和5年(2023)10月1日から**令和8年(2026)9月30日**までの日の属する
 * 各課税期間 (出典は `complianceKnowledge.ts` の「インボイス『2割特例』」項に
 * 国税庁のページつきで載っている。ここは**その日付を機械が読める形に置くだけ**で、
 * 新しい事実を主張していない)。
 *
 * ## なぜ定数にするか (2026-08-23)
 *
 * 期限は**注記と画面の文言にはあった**が、**判定に使われている場所が無かった**。
 * 実測: `taxConsumptionBusiness.ts` は期間を見ずに `best = 'twenty-percent'` を
 * 選びうるので、期限を過ぎても**アプリが 2割特例を勧め続ける**。
 * 画面には「令和8年分まで」と出ているので、**勧めと注意書きが矛盾する**状態になる。
 *
 * これは `SOCIAL_INSURANCE_RATE_FISCAL_YEAR` と同じ形の劣化である ——
 * 「数字そのものは間違いの顔をしていない。正しかったものが黙って古くなる」。
 * あちらは 2 年度分放置されて見つかった。こちらは**期限が来る前に**
 * `lint:rate-freshness` が鳴るようにしておく。
 *
 * **この定数は計算を変えない。** 期限を過ぎたときに何をするか (勧めない/
 * 警告を出す/選ばせない) は税務上の判断なので、門が鳴った人が決めること。
 */
export const TWENTY_PERCENT_MEASURE_END = '2026-09-30';

/** 納付税額の算定方式。 */
export type ConsumptionTaxMethod = 'standard' | 'simplified' | 'twenty-percent';

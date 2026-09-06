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

import { parseIsoDate } from './bankFormat';
import { localIsoDate } from './localDate';

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
 * ## 何をするかを決めた (2026-09-06・期限まで 24 日)
 *
 * 置いた時点では「期限を過ぎたときに何をするか (勧めない/警告を出す/選ばせない) は
 * 税務上の判断なので、門が鳴った人が決めること」として**計算を変えなかった**。
 * 期限が近づいたので決めた —— `twentyPercentMeasureStatus()` (下) が課税期間の
 * 規則で 3 値に落とし、**断定できるときだけ**「最有利」の候補から外す。
 * どちらの画面も期限を文面に出し、その文面はこの定数から作る (書き写さない)。
 */
export const TWENTY_PERCENT_MEASURE_END = '2026-09-30';

/**
 * 2割特例が使えるかどうかの 3 値。
 *
 * **2 値にできない。** 適用対象は「令和8年9月30日**までの日の属する課税期間**」で、
 * 期限そのものではなく**課税期間**で決まる。今日が期限を過ぎていても、3 月決算の
 * 法人の課税期間 2026-04-01〜2027-03-31 は 2026-09-30 を含むので**対象である**。
 * 逆に 2026-10-01 に始まる課税期間は、今日が期限前でも対象にならない。
 *
 * この card は課税期間を入力として持たない (課税売上高と課税仕入高だけ) ので、
 * 今日の日付から言えるのは次の 3 つだけ:
 *
 * - `active`           … 今日が期限内。今日を含む課税期間は**必ず**期限内の日を含む
 * - `period-dependent` … 期限は過ぎたが、今日を含む課税期間が期限内の日を含む**かもしれない**
 * - `ended`            … 今日を含むどの課税期間も期限内の日を含み**えない**
 *
 * 分からないものを言い切らない (`data/eligibility.ts` の 3 値判定と同じ理由)。
 * 断定できる `ended` でだけ「選べない」に倒し、`period-dependent` は条件を画面に書く。
 *
 * ## 前提 — 課税期間は 1 年を超えない
 *
 * 法人の課税期間は事業年度 (法人税法 13 条: 会計期間が 1 年を超えるときは 1 年ごとに区分)、
 * 個人事業者は暦年で、いずれも 1 年以内。課税期間の特例 (3 か月/1 か月ごと) は
 * **短くするだけ**なので上限は変わらない。したがって今日 T を含む課税期間の開始日は
 * 必ず `T - 1年 + 1日` 以降にある。開始日が期限を過ぎているのが確実になるのは
 * **期限 + 1年 - 1日 を T が越えたとき**。
 */
export type TwentyPercentMeasureStatus = 'active' | 'period-dependent' | 'ended';

/**
 * `YYYY-MM-DD` を UTC の暦日として読み、y/m/d をずらして同じ形に戻す。
 * 読めない値・暦に無い日・日を持たない `YYYY-MM` は null。
 *
 * 読む側は `bankFormat.ts` の `parseIsoDate` を**借りる** —— 同じ判断
 * (「これは暦にある日か」) を 15 行離れた場所に 2 つ書くと、必ずどちらかが
 * 欠ける (`localDate.ts` が 2 モジュールの重複を寄せたのと同じ理由)。
 * 最初の版は自分で正規表現と繰り上がり検査を書き、**日の検査が月の検査に
 * 完全に包含されていて殺せない変異体**を作っていた (2 桁の日がどう外れても
 * 繰り上がりで月が変わるため)。
 */
function shiftIsoDate(iso: string, years: number, days: number): string | null {
  const p = parseIsoDate(iso);
  if (p === null || p.day === null) return null;
  const d = new Date(Date.UTC(p.year + years, p.month - 1, p.day + days));
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/**
 * 2割特例が今日の時点で使えるか (3 値。判定の理由は型の注記にある)。
 *
 * 日付は**利用者の時計の暦日**で比べる (`localIsoDate`)。`toISOString()` の UTC 日付で
 * 比べると、日本 (UTC+9) では 0〜9 時のあいだ前日として判定してしまう。
 * 比較は `YYYY-MM-DD` の辞書順で行う —— 桁が揃っているので時間帯もうるう年も関わらない。
 *
 * 時計が読めない (`new Date(NaN)`) ときと期限の文字列が読めないときは
 * `period-dependent` を返す。**断定しないほうへ倒す** (「使えない」と言い切ると、
 * 使える人の見積りから選択肢が消える)。
 */
export function twentyPercentMeasureStatus(
  today: Date = new Date(),
  end: string = TWENTY_PERCENT_MEASURE_END,
): TwentyPercentMeasureStatus {
  const t = localIsoDate(today);
  // 期限 + 1年 - 1日 —— この日までは「今日を含む課税期間」が期限内の日を含みうる。
  // **期限の読めなさは比較の前に判定する。** 後に置くと `t <= end` の文字列比較が
  // 先に走り、'いつか' のような値が期限として通ってしまう (最初に書いた版がそれで、
  // 標本が鳴って気づいた —— 'い' は '2' より大きいので `active` を返していた)。
  const lastMaybe = shiftIsoDate(end, 1, -1);
  if (t === '' || lastMaybe === null) return 'period-dependent';
  if (t <= end) return 'active';
  return t <= lastMaybe ? 'period-dependent' : 'ended';
}

/** 納付税額の算定方式。 */
export type ConsumptionTaxMethod = 'standard' | 'simplified' | 'twenty-percent';

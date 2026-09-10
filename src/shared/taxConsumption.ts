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

import { isCalendarDate, parseIsoDate } from './isoDate';
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
 * 消費税の納税者の区分。**分からないときは `'unknown'`** —— 区分で決まる措置 (3割特例は個人事業者
 * だけ・2割特例の期限の帯は暦年なら言い切れる) は、分からないまま勧めない。
 */
export type TaxpayerKind = 'sole-proprietor' | 'corporation' | 'unknown';

/**
 * 区分を渡されなかったときの既定。**定数で持つ** —— 既定を字面で書くと、区分で分岐しない
 * 値 (`''` など) に変えても両方の関数が同じ答えを返すので、既定の取り違えを留められない
 * (変異検査の生存 2 件。定数にすると値そのものを読み直しの検査で留められる · パス 141)。
 */
export const DEFAULT_TAXPAYER_KIND: TaxpayerKind = 'unknown';

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
  kind: TaxpayerKind = DEFAULT_TAXPAYER_KIND,
): TwentyPercentMeasureStatus {
  const t = localIsoDate(today);
  // 期限 + 1年 - 1日 —— この日までは「今日を含む課税期間」が期限内の日を含みうる。
  // **期限の読めなさは比較の前に判定する。** 後に置くと `t <= end` の文字列比較が
  // 先に走り、'いつか' のような値が期限として通ってしまう (最初に書いた版がそれで、
  // 標本が鳴って気づいた —— 'い' は '2' より大きいので `active` を返していた)。
  const lastMaybe = shiftIsoDate(end, 1, -1);
  if (t === '' || lastMaybe === null) return 'period-dependent';
  if (t <= end) return 'active';
  // 個人事業者の課税期間は暦年 (課税期間の短縮特例は外) —— 期限の年の末日までは「期限を含む
  // 課税期間」なので active、翌年からは ended と**言い切れる** (2026-09-10 · パス 141)。
  if (kind === 'sole-proprietor') return t <= `${end.slice(0, 4)}-12-31` ? 'active' : 'ended';
  return t <= lastMaybe ? 'period-dependent' : 'ended';
}

/*
 * **2割特例の後継 —— 3割特例** (2026-09-10 · パス 141)。
 *
 * 令和 8 年度税制改正 (2026) で、2割特例は令和 8 年 9 月 30 日の属する課税期間で終了することが
 * 確定し、**個人事業者に限り** 令和 9 年分・令和 10 年分の納付税額を売上税額の 3 割とする
 * 「3割特例」が創設された (法人に後継措置は無い。事前届出は不要で申告書に付記して選ぶ。要件は
 * 2割特例と同じ: 免税事業者がインボイス登録で課税事業者になった場合 = 基準期間の課税売上高
 * 1,000 万円以下)。免税事業者等からの課税仕入れの 80% 控除も同改正で 70% → 50% → 30%
 * (2031-09-30 まで) に緩和・延長されたが、本アプリはその控除を計算していない
 * (`taxConsumptionSchedule.ts` の冒頭に「扱わない」と明記)。
 *
 * 出所: 国税庁「令和 8 年度税制改正特集」(invoice-review) の「3割特例の創設 —— 個人事業者である
 * 適格請求書発行事業者の令和 9 年分及び令和 10 年分の消費税申告について」と `complianceKnowledge.ts`
 * の `tax-invoice` (一次情報はこの環境から届かず、税理士法人・会計事務所の改正解説 5 本で突き合わせた)。
 * 2026-09-10 まで本アプリは 2割特例の期限 (20 日後) の先を持たず、個人事業者の 2027 年以降の
 * 見積りから特例が黙って消えるだけだった。
 */
/** 3割特例の納付割合 (売上に係る消費税額の 30%)。 */
export const THIRTY_PERCENT_RATE = 0.3;
/** 3割特例の最初の年分の初日 (令和 9 年分 = 2027 年。個人事業者の課税期間は暦年)。 */
export const THIRTY_PERCENT_MEASURE_START = '2027-01-01';
/** 3割特例の最後の年分の末日 (令和 10 年分 = 2028 年)。`lint:rate-freshness` の台帳が 180 日前から鳴らす。 */
export const THIRTY_PERCENT_MEASURE_END = '2028-12-31';

/**
 * 3割特例が今日の時点で使えるか。
 * - `not-applicable` … 法人 (後継措置は無い)
 * - `upcoming`       … まだ対象年分の前 (令和 8 年分までは 2割特例)。時計や日付が読めないときもこちらへ倒す (言い切らない)
 * - `active`         … 対象年分 (令和 9 年分・令和 10 年分)
 * - `ended`          … 対象年分の後 (延長の有無は `lint:rate-freshness` が期限の 180 日前から促す)
 *
 * `'unknown'` の区分は個人事業者と同じ帯を返す (画面は「事業形態を選ぶと候補に入る」と書き、
 * 最有利の候補には**入れない** —— 候補に入れるかは呼ぶ側が区分で決める)。
 */
export type ThirtyPercentMeasureStatus = 'not-applicable' | 'upcoming' | 'active' | 'ended';

export function thirtyPercentMeasureStatus(
  today: Date = new Date(),
  kind: TaxpayerKind = DEFAULT_TAXPAYER_KIND,
  start: string = THIRTY_PERCENT_MEASURE_START,
  end: string = THIRTY_PERCENT_MEASURE_END,
): ThirtyPercentMeasureStatus {
  if (kind === 'corporation') return 'not-applicable';
  const t = localIsoDate(today);
  // **読めない時計を別に書かない。** `localIsoDate` は読めなければ `''` を返し、`'' < start` は
  // 辞書順で必ず真なので、下の `t < start` がそのまま `'upcoming'` に落とす (言い切らない側)。
  // 専用の枝を置くと同じ答えを 2 通りに書くことになり、どちらを消しても結果が変わらない
  // (変異検査の生存 2 件 · パス 141)。期限の文字列の読めなさは比較では代われないので残す。
  if (!isCalendarDate(start) || !isCalendarDate(end)) return 'upcoming';
  if (t < start) return 'upcoming';
  return t <= end ? 'active' : 'ended';
}

/**
 * 「令和9年分・令和10年分」—— 対象年分の文面は定数から作る (書き写さない)。
 * 始点と終点の年が読めない・逆なら空文字 (画面は空を刷らず、条件も付けない)。
 *
 * **番人を置かない。** 年が読めなければ `Number(...)` は `NaN`、逆順なら `from > to` で、
 * どちらも下の `for` が 1 度も回らないので `[].join()` = `''` になる。`if (…) return ''` は
 * 繰り返しと**同じ答え**を別の書き方で言っていただけで、消しても結果が変わらなかった
 * (変異検査の生存 5 件 · パス 141)。空文字になる 3 通りは検査が標本で留めている。
 */
export function thirtyPercentMeasureYearsLabel(
  start: string = THIRTY_PERCENT_MEASURE_START,
  end: string = THIRTY_PERCENT_MEASURE_END,
): string {
  const from = Number(start.slice(0, 4));
  const to = Number(end.slice(0, 4));
  const years: string[] = [];
  for (let y = from; y <= to; y += 1) years.push(y >= 2019 ? `令和${y - 2018}年分` : `${y}年分`);
  return years.join('・');
}

/** 納付税額の算定方式。 */
export type ConsumptionTaxMethod = 'standard' | 'simplified' | 'twenty-percent' | 'thirty-percent';

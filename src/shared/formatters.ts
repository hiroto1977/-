/**
 * 表示用フォーマッタの共通ヘルパー。
 *
 * 旧来 jpy / yen 相当の関数が複数のページ・コンポーネントで個別定義されて
 * いたため、`¥1,200` 形式の整数 JPY 表記をここに 1 本化する
 * (Refactor 監査の DRY 指摘)。
 */

/**
 * 算定不能の印。金額でも比率でもこの 1 文字に揃える
 * (`OverviewPage` の `yenOrDash` / `pct1OrDash`、`num.ts` の `ratioPctOrDash` と同じ字)。
 */
export const DASH = '—';

/**
 * 整数円を `¥1,234,567` 形式 (ja-JP 桁区切り) に整形する。
 *
 * **非有限 (`Infinity` / `NaN`) は金額ではないので `—` を返す。** これは
 * 金額表示の**最後の床**であり、理由の説明ではない —— 算定不能の理由は
 * 計算側が `null` で持ち回り、画面がその場で述べる責任を持つ
 * (`shared/num.ts` の `finiteOrNull`)。
 *
 * 2026-09-13 (パス 198) まで `n.toLocaleString` の結果をそのまま返していたため、
 * **`¥∞` と `¥NaN` が金額として読める形で画面に出ていた**。実測した 3 経路:
 *
 * | 入力 | 刷っていた物 |
 * | --- | --- |
 * | 積立年数 100,000 年 (画面の宣言は 80 年以下) | 将来評価額 **`¥∞`** / 運用益 `¥∞` |
 * | 達成年数 100,000 年 (同 80 年以下) | 到達見込み **`¥∞` (達成)** |
 * | 保有年数 100,000 年 (同 100 年以下) | 累計の蝕み効果 **`¥NaN`** |
 *
 * `¥∞` の方が危ない —— **∞ は「無限に豊か」「無限に安全」と読める**が、
 * 実際の意味は「入力が範囲外で計算が成り立たない」である
 * (同じ読み違えを `OverviewPage` の損益分岐点で 2026-09-08 に直している・パス 84)。
 *
 * この関数は 227 か所から呼ばれる**唯一の金額の funnel** なので、床はここに置く。
 */
export function jpy(n: number): string {
  if (!Number.isFinite(n)) return DASH;
  const s = n.toLocaleString('ja-JP');
  // **負のゼロを「¥-0」と刷らない** (2026-09-27 · パス 493j)。`toLocaleString` は −0 も、
  // 丸めて 0 になる小さな負の値 (−0.0001) も `-0` と綴る —— `Math.round(-0.4)` や
  // `Math.ceil(-0.5)` は −0 を返すので、円未満を丸める呼び手はここへ −0 を渡しうる。
  // 画面に「¥-0」と出ると、0 円に符号の付いた別の額として読める。
  return `¥${s === '-0' ? '0' : s}`;
}

/**
 * 円未満を四捨五入してから {@link jpy} (2026-09-27 · パス 493j)。
 *
 * **1 行の写しが 3 通りに割れていた** —— `FreeePage` は `−¥1,234` (U+2212 を ¥ の前)、
 * `FundingPage` と経営レポートは `¥-1,234`、`jpy` は `¥-1,234`。しかも 3 つとも床を持たず、
 * 読めない値を `¥NaN` / `¥∞` / `−¥∞` と刷り、`−0.4` を `−¥0` / `¥-0` と刷っていた。
 * 同じ額がページによって別の字で出る (パス 96 が測った「−∞ が 3 通りに刷られる」の残り)。
 * 床と符号は `jpy` の 1 つに寄せ、ここは丸めだけを持つ。
 */
export function jpyWhole(n: number): string {
  return jpy(Math.round(n));
}

/**
 * 算定不能 (`null`) なら `—`、そうでなければ {@link jpy}。
 *
 * **綴りを 1 つにするためにここに置いた** (2026-09-13 · パス 208) ——
 * `MutualFundsPage` と `TaxPage` が同じ 1 行を別々に持っていた。
 * `null` (計算側が「算定していない」と言っている) と非有限 (金額として
 * 刷れない値が届いた = 最後の床) を**同じ見た目**に畳むのはここだけの約束で、
 * 理由は画面がその場で述べる責任を持つ (`jpy` の doc comment と同じ方針)。
 */
export function jpyOrDash(n: number | null | undefined): string {
  // 算定不能 (`null` / `undefined`) は非有限の代表値 NaN に倒し、`jpy` の床に任せる (同じ「—」・分岐を持たない)。
  return jpy(n ?? Number.NaN);
}

/**
 * 百分率を `12.3%` 形式に整形する。**非有限 (`Infinity` / `NaN`) は `—`。**
 *
 * ## なぜ金額と同じ床が要るか (2026-09-14 · パス 229)
 *
 * 床は `jpy` にだけ在った。パス 198 は「`¥∞` と `¥NaN` が金額として読める形で
 * 画面に出ていた」ので**金額の funnel** に床を置いたが、**率の側には funnel が
 * 無かった** —— 同じ判断が 3 か所に写されていて、どれも非有限を素通ししていた:
 *
 * | 綴り | 使う面 |
 * | --- | --- |
 * | `shared/num.ts` の `ratioPctOrDash` | **両ビルド** + HTML / Markdown の書き出し (`main/clients/stocks.ts` / `renderer/data/stocksAnalysisWeb.ts` / `StocksPage`) |
 * | `OverviewPage.tsx` の `pctOrDash` (丸めない) | 経営サマリー 11 タイル (労働分配率・自己資本比率・流動比率・当座比率・ROA・ROE・固定比率 ほか) |
 * | `OverviewPage.tsx` の `pct1OrDash` | 経営サマリー 13 タイル (営業利益率・粗利率・限界利益率・安全余裕率・原価率 ほか) |
 * | `RealEstatePage.tsx` の `pct1OrDash` | 不動産 9 か所 |
 *
 * **写しは 3 つだと思って数え直したら 4 つだった。** 経営サマリーには
 * 丸めない `pctOrDash` (`${n}%`) がもう 1 つ在り、`toFixed` を通らないぶん
 * `NaN` / `Infinity` がいっそう素のまま出る。
 *
 * `NaN.toFixed(1)` は `'NaN'`、`Infinity.toFixed(1)` は `'Infinity'` なので、
 * 4 つとも `NaN%` / `Infinity%` を刷れた。名前が `…OrDash` なのに**算定不能の
 * 代表値である `NaN` だけ素通しする**のは、名前の約束と食い違っている。
 *
 * **今日そこへ非有限が届く経路は測った範囲で 0 件である** (`winRate` は
 * `wins / completed` の整数比・経営サマリーの率はパス 205 の `saneMonthlyKpi` を
 * 通る)。床を置くのは「今漏れているから」ではなく、**上流の関門が変わっても
 * 約束が保たれるようにするため**で、それが funnel に床を置く理由そのものである
 * (`jpy` の doc comment と同じ)。
 *
 * `0%` は「測った結果が 0」であり「測っていない」とは別物 —— その区別は
 * 呼び出し側が `null` で持ち回る (`ratioPctOrDash` / `num.ts` の `finiteOrNull`)。
 */
export function pct(n: number, digits?: number): string {
  if (!Number.isFinite(n)) return DASH;
  // `digits` を省くと**丸めない** —— 経営サマリーの元の `${n}%` と同じ出力に
  // なるので、床を足すだけで刷る字は 1 文字も変わらない。
  return `${digits === undefined ? n : n.toFixed(digits)}%`;
}

/** 算定不能 (`null` / `undefined`) なら `—`、そうでなければ {@link pct}。{@link jpyOrDash} の率版。 */
export function pctOrDash(n: number | null | undefined, digits?: number): string {
  // 算定不能 (`null` / `undefined`) は非有限の代表値 NaN に倒し、`pct` の床に任せる (同じ「—」・分岐を持たない)。
  return pct(n ?? Number.NaN, digits);
}

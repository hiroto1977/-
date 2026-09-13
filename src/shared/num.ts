/**
 * 数値の共通処理 — 同じ 1 行が写経されていたものを 1 箇所に集める。
 *
 * `yen` / `round1` / `round2` / `nonNeg` / `floorHundred` / `assertNonNegativeFinite` は、
 * 税務・投資・建築の各モジュールに同じ実装が繰り返し置かれていた。1 行の私的ヘルパは
 * 一見無害だが、コピーの数だけ食い違う余地がある。実際 `yen` は 17 箇所のうち 1 箇所
 * （消費税の事業者計算）だけが非有限値を 0 に落とし、ほかは NaN をそのまま返していた。
 * 同じ名前の関数が場所によって違う答えを出す状態は、呼ぶ側からは見えない。
 *
 * 丸めの方針をここで 1 つに決める:
 *   - `yen` は四捨五入。円未満を持ち回らないための表示・集計用で、
 *     法令上の端数処理（切捨て・切上げ）が決まっている計算では使わない
 *     （消費税の国税100円未満切捨てなどは各モジュールが明示的に行う）。
 *   - 非有限値の扱いは呼び出し側の方針に委ねる。ここでは素直に伝播させ、
 *     0 に落としたい箇所は `nonNeg` を挟む。黙って 0 にすると、
 *     入力が壊れていることに気づけなくなるため。
 */

/** 円未満を四捨五入する。 */
export function yen(n: number): number {
  return Math.round(n);
}

/** 小数第1位まで。 */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 小数第2位まで。 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 負値と非有限値を 0 に落とす。入力の下限を揃えたいときに使う。
 *
 * `undefined` も受ける — 省略可の入力を「未指定なら 0」として扱う呼び出し側が、
 * `x === undefined ? 0 : nonNeg(x)` という**結果の変わらない枝**を書かずに
 * 済むようにするため (`Number.isFinite(undefined)` は false なので 0 になる)。
 * 実行時の振る舞いは変えていない。
 */
export function nonNeg(n: number | undefined): number {
  return Number.isFinite(n) ? Math.max(0, n as number) : 0;
}

/**
 * 有限なら その数、そうでなければ `null` —— 「算定不能」の綴りを 1 つに揃える。
 *
 * `nonNeg` (すぐ上) は非有限を **0 に倒す**。0 は多くの欄で**意味のある値**なので、
 * 「測れなかった」を 0 で表すと最も安心させる向き・最も悲観的な向きのどちらにも
 * 化ける (パス 52 / 85 / 91 が同じ形を 3 度直している)。こちらは
 * **算定不能を算定不能として持ち回る**ためのもので、画面は `null` を「—」と刷る。
 *
 * 2026-09-13 (パス 198) に足した。`Infinity` / `NaN` が金額として画面へ届く経路が
 * 3 本在り (`calcCompoundingFutureValue` / `goalProjection` / `calcRealCost`)、
 * `jpy` が `¥∞` / `¥NaN` として刷っていた —— **∞ は「無限に豊か」と読め、
 * 実際には「年数が範囲外で計算が成り立たない」という意味だった**。
 */
export function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

/**
 * **符号を残して**非有限だけを 0 に倒す (2026-09-13 · パス 204)。
 *
 * `nonNeg` は負値も 0 にするので、**負でありうる量**には使えない ——
 * 経常利益 (欠損)・予実差異の営業利益・NOI は負が正しい答えである。
 * パス 204 で私は `appendCorporateTaxSection` と `budgetVariance.line` に
 * `nonNeg` を入れてしまい、**欠損 −200,000 円を 0 円として刷る**ようにした
 * (既存の検査が落ちて教えてくれた)。消毒の選び方は「その量は負を取りうるか」で
 * 決まる:
 *
 * | 量 | 使う物 |
 * | --- | --- |
 * | 金額・税額・年数・件数 (負は無意味) | `nonNeg` |
 * | 利益・差異・収益 (負が正しい答え) | `finiteOr0` |
 * | 「算定不能」の道が在る | `finiteOrNull` → `null` |
 */
export function finiteOr0(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** 100円未満を切り捨てる（国税の端数処理・自動車税の月割など）。 */
export function floorHundred(n: number): number {
  return Math.floor(n / 100) * 100;
}

/**
 * 引数が 0 以上の有限数であることを保証する。満たさなければ throw。
 *
 * 黙って 0 に丸めず投げるのは、これを使うモジュール（相続・贈与・固定資産税など）が
 * 「呼び出し側が値を用意できていない」ことを設計上の誤りとして扱っているため。
 */
export function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite number >= 0 (got ${value})`);
  }
}

/**
 * 割合 (0..1) を「％」で刷る。**算定不能 (null / undefined) は「—」。**
 *
 * `0%` は「測った結果が 0」であり、「そもそも測っていない」とは別物である。
 * 両方を `0` で表すと、画面と書き出しは**最悪値**として読める形になる ——
 * 勝率 0% は「決済した取引が在り、どれも勝てなかった」という意味になる。
 *
 * デスクトップ (`main/clients/stocks.ts`) とブラウザ版
 * (`renderer/data/stocksAnalysisWeb.ts`) の**両方**が同じ表を刷るので、
 * 綴りをここに 1 つ置く (この本の冒頭が言うとおり、1 行の私的ヘルパは
 * コピーの数だけ食い違う)。
 */
export function ratioPctOrDash(n: number | null | undefined, digits = 0): string {
  return n == null ? '—' : `${(n * 100).toFixed(digits)}%`;
}

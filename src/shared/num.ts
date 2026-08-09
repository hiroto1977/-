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

/** 負値と非有限値を 0 に落とす。入力の下限を揃えたいときに使う。 */
export function nonNeg(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
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

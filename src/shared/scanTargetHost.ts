/**
 * scanTarget.mamori の壁 —— Mamori の `pure` な組み込みに無い `URLSearchParams` だけをここで包む。
 * 判定は持たない (解析した結果を返すだけ)。
 */

/** `URLSearchParams` を作る (資格情報らしい名前の走査に使う・読むだけ)。 */
export function hostSearchParams(init: string): URLSearchParams {
  return new URLSearchParams(init);
}

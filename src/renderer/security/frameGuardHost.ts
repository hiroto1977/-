/**
 * 枠の外し (frameGuard.mamori) が使う host の口。`extern pure { … } from "./frameGuardHost"` で読む。
 *
 * - `window` は網・記憶・移動・DOM の口をメンバに持つので、Mamori では `extern pure global` にできない (T-249)。
 *   既定の引数に据える窓だけをここから渡す。
 * - `el.style.cssText = …` は `a.b.c = v` の形で、Mamori の欄への代入 (`名前.欄 = 値`) に無い。見た目だけの文字列を
 *   据える口として、判断を持たずにここへ置く。
 */
export function hostWindow(): Window {
  return window;
}

export function hostStyle(el: HTMLElement, css: string): void {
  el.style.cssText = css;
}

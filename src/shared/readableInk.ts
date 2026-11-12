/**
 * **塗りの上に載せる文字の色** (2026-10-02 · パス 503)。
 *
 * 配色のトークンは「その配色の地」に対して文字色を定めてある (`--text` / `--on-accent` ほか)。ところが
 * **系列の色そのもの** (円グラフの 1 切れ・パレットから引いた塗り) は配色に依らず固定で、その上の文字は
 * トークンでは決まらない。実測 (実機で描画済みの色): 円グラフの割合の字 (白・9px) は、パレット 6 色の上で
 * 2.0〜3.9:1 だった (WCAG 2.x AA は小さい字に 4.5:1)。
 *
 * 白と黒のどちらかは**必ず 4.58:1 以上**になる (白との対比と黒との対比の積は (L+0.05)² の相殺で 21 に
 * 一致し、小さいほうが最大になるのは両方が √21 ≈ 4.58 のとき)。だから塗りの色から**白か黒かを選ぶ**だけで足りる。
 * 黒は純黒 `#000000` —— `#141414` のような「ほぼ黒」だと、最悪の塗りで 4.29:1 まで落ちて保証が崩れる
 * (`readableInk.test.ts` が格子で留めている)。
 *
 * ## これは写しである
 *
 * 計算は `scripts/lib/contrast.cjs` の `contrastMath()` (実機のページへ文字列で送る測定の側) と**同じ式**。
 * あちらは自由変数を持てない (ページの CSP の外でソース文字列として評価される) ので import できず、
 * 製品の側は TypeScript として持つ。2 つが同じ答えを出すことは `readableInk.test.ts` の母集団の検査が
 * 格子で突き合わせて留めている (法則 `copy-pinned-by-parity`)。
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** `#rgb` / `#rrggbb` だけを読む (系列の色は hex で持つ)。読めなければ `null`。 */
export function parseHex(css: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css.trim());
  if (!m) return null;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

const chan = (c: number): number => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

/** sRGB の相対輝度 (WCAG 2.x)。 */
export function relativeLuminance(c: Rgb): number {
  return 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
}

/** 2 色の対比 (1〜21)。順序に依らない。 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * 塗り (`#rgb` / `#rrggbb`) の上に載せる文字色。白と黒のうち対比が高いほう (同じなら白)。
 * 塗りが読めなければ `null` —— 呼び手は**読めない塗りの上へ勝手な色を決めない** (配色のトークンへ戻る)。
 */
export function readableInk(fill: string): '#ffffff' | '#000000' | null {
  const rgb = parseHex(fill);
  if (rgb === null) return null;
  return contrastRatio(WHITE, rgb) >= contrastRatio(BLACK, rgb) ? '#ffffff' : '#000000';
}

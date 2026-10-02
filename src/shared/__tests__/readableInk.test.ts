/**
 * **塗りの上に載せる文字色 `readableInk` と、実機の測定の道具との一致** (2026-10-02 · パス 503)。
 *
 * `shared/readableInk.ts` は `scripts/lib/contrast.cjs` の `contrastMath()` と**同じ式の写し**で、あちらは自由変数を持てない
 * (実機のページへ関数のソース文字列として送るので import できない) ため、製品の側は TypeScript として持つ。
 * **写しが 2 つ在る間は、この格子の突き合わせが唯一の縛り** (法則 `copy-pinned-by-parity`)。
 *
 * 見ること:
 *
 * 1. 対比 (相対輝度の式) は 8 × 8 × 8 の格子 512 色 × 白・黒で 1e-9 以内に一致する
 * 2. `readableInk` は**どの塗りの上でも 4.5:1 以上**の字色 (白か黒) を返す —— 保証の下限は √21 ≈ 4.58 で、
 *    **ほぼ黒 (`#141414`) では最悪の塗りで 4.29 まで落ちて崩れる**ので純黒でなければならない
 * 3. 読めない塗り (トークン・半透明) には**勝手な色を決めず** `null`
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { contrastRatio as tsContrast, parseHex, readableInk } from '../readableInk';

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}
interface Math3 {
  parse: (s: string) => Rgba | null;
  ratio: (a: Rgba, b: Rgba) => number;
}
const { contrastMath } = createRequire(import.meta.url)('../../../scripts/lib/contrast.cjs') as { contrastMath: () => Math3 };
const M = contrastMath();

describe('製品の写し (shared/readableInk.ts) は測定の道具 (scripts/lib/contrast.cjs) と同じ答えを出す', () => {
  // 8 × 8 × 8 の格子 (512 色) と、白・黒・端の色。**写しが 2 つ在る間はこれが唯一の縛り** (法則 copy-pinned-by-parity)。
  const levels = [0, 36, 73, 109, 146, 182, 219, 255];
  const grid: string[] = [];
  for (const r of levels) for (const g of levels) for (const b of levels) grid.push('#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''));

  it('★ 対比は 512 色 × 白・黒で 1e-9 以内に一致する', () => {
    for (const hex of grid) {
      const a = parseHex(hex)!;
      const b = M.parse(hex)!;
      for (const other of ['#ffffff', '#000000']) {
        const tsr = tsContrast(a, parseHex(other)!);
        const cjs = M.ratio(b, M.parse(other)!);
        expect(Math.abs(tsr - cjs), `${hex} × ${other}`).toBeLessThan(1e-9);
      }
    }
  });

  it('★ readableInk は、どの塗りの上でも 4.5:1 以上の字色を返す (白か黒・格子 512 色)', () => {
    let min = Infinity;
    for (const hex of grid) {
      const ink = readableInk(hex);
      expect(ink, hex).not.toBeNull();
      const r = M.ratio(M.parse(ink!)!, M.parse(hex)!);
      min = Math.min(min, r);
      expect(r, `${hex} の上の ${ink}`).toBeGreaterThanOrEqual(4.5);
    }
    // 保証の下限は √21 ≈ 4.58 (白と黒の対比の積は 21)。**ほぼ黒 (#141414) だと 4.29 まで落ちて崩れる** —— 純黒でなければならない理由。
    expect(min).toBeGreaterThanOrEqual(Math.sqrt(21) - 0.05);
    const nearBlack = M.parse('#141414')!;
    let worstNearBlack = Infinity;
    for (const hex of grid) {
      const fill = M.parse(hex)!;
      worstNearBlack = Math.min(worstNearBlack, Math.max(M.ratio(M.parse('#ffffff')!, fill), M.ratio(nearBlack, fill)));
    }
    expect(worstNearBlack, 'ほぼ黒を使うと最悪の塗りで 4.5:1 を割る (純黒を使う理由)').toBeLessThan(4.5);
  });

  it('標本: 読めない塗りは null (勝手な色を決めない)', () => {
    expect(readableInk('var(--accent)')).toBeNull();
    expect(readableInk('rgba(1,2,3,0.5)')).toBeNull();
    expect(readableInk('#4f9cf9')).toBe('#000000');
    expect(readableInk('#4b3f57')).toBe('#ffffff');
    expect(readableInk('#f2994a')).toBe('#000000');
  });
});

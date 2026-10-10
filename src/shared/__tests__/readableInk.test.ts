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
 * 4. 色の読み (`#rgb` の倍化・大小文字・前後の空白・形の違う物) と相対輝度 (256 段の灰・原色の係数) を**独立の式**で突き合わせる ——
 *    変異検査 (手元の Stryker・`readableInk.ts` 1 本) が**この検査の穴**を見つけた: 3 桁の `#rgb`・正規表現の先頭と空白の除去・
 *    暗い側 (1〜10) の線形の枝は、格子 (0 / 36 / 73 …) にも標本にも 1 度も当たっていなかった (77.36% → 下の追加後は「測り直した値」を
 *    `docs/REMAINING_WORK.md` の「パス 503」へ)。
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { contrastRatio as tsContrast, parseHex, readableInk, relativeLuminance } from '../readableInk';

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

describe('色の読みと相対輝度は、独立の式で突き合わせる (変異検査が見つけた穴)', () => {
  it('★ parseHex: #rgb は 2 桁へ倍にして読み、大小文字と前後の空白は受け、形の違う物は null (先頭・末尾・桁・字種)', () => {
    expect(parseHex('#abc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
    expect(parseHex('#ABC')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
    expect(parseHex('#aabbcc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('  #0f8  ')).toEqual({ r: 0x00, g: 0xff, b: 0x88 });
    // 形の違う物: 先頭の `^`・末尾の `$`・桁 (3 か 6)・字種 (16 進だけ) のどれを外しても通ってしまう形
    for (const bad of ['x#fff', '#fffx', '#ff', '#ffff', '#fffff', '#fffffff', '#ggg', '#zzzzzz', 'fff', '', '#', '# fff', '#f f f']) {
      expect(parseHex(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('★ relativeLuminance: 256 段の灰を独立の式 (IEC 61966-2-1) で突き合わせる —— 暗い側 (1〜10) の線形の枝を含む・原色ごとの係数', () => {
    // 独立の式: しきい値は IEC の 0.04045 (WCAG 2.x の文面は 0.03928)。8 bit の値ではその間に入る段が無いので答えは一致する。
    const lin = (c: number): number => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    for (let c = 0; c <= 255; c++) {
      expect(relativeLuminance({ r: c, g: c, b: c }), `灰 ${c}`).toBeCloseTo(lin(c), 12);
    }
    // 灰では 3 つの係数の和しか見えないので、原色ごとに係数を読む
    expect(relativeLuminance({ r: 255, g: 0, b: 0 })).toBeCloseTo(0.2126, 12);
    expect(relativeLuminance({ r: 0, g: 255, b: 0 })).toBeCloseTo(0.7152, 12);
    expect(relativeLuminance({ r: 0, g: 0, b: 255 })).toBeCloseTo(0.0722, 12);
  });

  it('contrastRatio: 白 × 黒 = 21・同じ色 = 1・順序に依らない・WCAG の既知の値 (#767676 × 白 ≈ 4.54 / #777777 × 白 ≈ 4.48)', () => {
    const w = parseHex('#fff')!;
    const k = parseHex('#000')!;
    expect(tsContrast(w, k)).toBeCloseTo(21, 10);
    expect(tsContrast(k, w)).toBeCloseTo(21, 10);
    expect(tsContrast(w, w)).toBe(1);
    expect(tsContrast(parseHex('#767676')!, w)).toBeCloseTo(4.54, 2);
    expect(tsContrast(parseHex('#777777')!, w)).toBeCloseTo(4.48, 2);
  });
});

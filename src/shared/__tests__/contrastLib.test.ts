/**
 * **対比の測定の道具 `scripts/lib/contrast.cjs` の、ブラウザの要らない部分** (2026-10-02 · パス 503)。
 *
 * 道具は 2 つの使い手が同じ 1 つの計算を読む: トークン表の検査 (`themeContrast.test.ts`・Node) と、実機の suite
 * `contrast` (`scripts/e2e/core.cjs`・Chromium で描画済みの色)。**ページの中で走る `measureDocument()` は実機でしか試せない**
 * (suite の先頭に「割る字は割る・読める字は割らない・SVG の字は下の図形で測る・グラデーションは最悪の停止点」の対照を持つ) が、
 * 判定の規則 —— 何が「大きい字」か・何を基準を割ったと数えるか・同じ原因をどう畳むか —— と色の読み書きは**純関数**なので、ここで留める。
 *
 * WCAG 2.x (1.4.3 AA): 通常の字 4.5:1・**大きい字 (24px 以上、または太字なら 18.66px 以上) は 3:1**。
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}
interface Row {
  key: string;
  text: string;
  fg: string;
  bg: string;
  ratio: number;
  size: number;
  weight: number;
  unknown?: boolean;
  page?: string;
  placeholder?: boolean;
}
interface Lib {
  contrastMath: () => {
    parse: (s: string) => Rgba | null;
    over: (top: Rgba, bottom: Rgba, extra?: number) => Rgba;
    lum: (c: Rgba) => number;
    ratio: (a: Rgba, b: Rgba) => number;
    hex: (c: Rgba) => string;
  };
  isLargeText: (sizePx: number, weight: number) => boolean;
  requiredRatio: (sizePx: number, weight: number) => number;
  violationsOf: (rows: Row[]) => Row[];
  groupViolations: (rows: Row[]) => { k: string; n: number; pages: Set<string>; ratio: number; sample: string; placeholder: boolean }[];
  sweepExpression: () => string;
}
const lib = createRequire(import.meta.url)('../../../scripts/lib/contrast.cjs') as Lib;
const M = lib.contrastMath();

const row = (over: Partial<Row>): Row => ({ key: 'span', text: 'x', fg: '#000000', bg: '#ffffff', ratio: 21, size: 14, weight: 400, ...over });

describe('大きい字の境目 (WCAG 2.x 1.4.3)', () => {
  it('★ 24px 以上は大きい字 (3:1)・それ未満の通常の太さは 4.5:1', () => {
    expect(lib.isLargeText(24, 400)).toBe(true);
    expect(lib.isLargeText(23.99, 400)).toBe(false);
    expect(lib.requiredRatio(24, 400)).toBe(3);
    expect(lib.requiredRatio(23.99, 400)).toBe(4.5);
  });

  it('★ 太字 (700 以上) は 18.66px 以上で大きい字・太さが足りなければ通常', () => {
    expect(lib.isLargeText(18.66, 700)).toBe(true);
    expect(lib.isLargeText(18.65, 700)).toBe(false);
    expect(lib.isLargeText(18.66, 600), '600 は太字ではない').toBe(false);
    expect(lib.isLargeText(14, 700), '小さい太字は大きい字ではない').toBe(false);
    expect(lib.requiredRatio(20, 700)).toBe(3);
    expect(lib.requiredRatio(20, 500)).toBe(4.5);
  });
});

describe('基準を割った行の数え方', () => {
  it('★ 要る対比ちょうどは割っていない・わずかに下は割っている (通常 4.5・大きい字 3)', () => {
    expect(lib.violationsOf([row({ ratio: 4.5 })])).toEqual([]);
    expect(lib.violationsOf([row({ ratio: 4.49 })])).toHaveLength(1);
    expect(lib.violationsOf([row({ ratio: 3, size: 24 })])).toEqual([]);
    expect(lib.violationsOf([row({ ratio: 2.99, size: 24 })])).toHaveLength(1);
    // 大きい字の 3.5 は通り、同じ対比の通常の字は割る
    expect(lib.violationsOf([row({ ratio: 3.5, size: 24 })])).toEqual([]);
    expect(lib.violationsOf([row({ ratio: 3.5, size: 14 })])).toHaveLength(1);
  });

  it('★ 地が画像で測れなかった行 (unknown) は「割った」と数えない (見つからなかったとも言わない)', () => {
    expect(lib.violationsOf([row({ ratio: 1, unknown: true })])).toEqual([]);
    // 標本: unknown でなければ同じ行は割る (針が当たる)
    expect(lib.violationsOf([row({ ratio: 1 })])).toHaveLength(1);
  });

  it('同じ原因 (要素・字の色・地の色・大きさ・太さ) の行は 1 つに畳み、画面の数と件数を持つ。画面の多い順', () => {
    const rows = [
      row({ key: 'button', fg: '#fff', bg: '#dc8163', ratio: 2.85, page: 'a', text: '売上順' }),
      row({ key: 'button', fg: '#fff', bg: '#dc8163', ratio: 2.85, page: 'b', text: '売上順' }),
      row({ key: 'button', fg: '#fff', bg: '#dc8163', ratio: 2.85, page: 'b', text: '売上順' }),
      row({ key: 'span', fg: '#777', bg: '#808080', ratio: 1.13, page: 'c', text: '灰' }),
      row({ key: 'span', fg: '#000', bg: '#fff', ratio: 21, page: 'c' }), // 割っていない行は入らない
    ];
    const g = lib.groupViolations(rows);
    expect(g).toHaveLength(2);
    expect(g[0]!.n).toBe(3);
    expect([...g[0]!.pages].sort()).toEqual(['a', 'b']);
    expect(g[1]!.n).toBe(1);
    expect(g[0]!.k).toContain('button | fg #fff | bg #dc8163 | 14px/400');
    // 大きさが違えば別の原因
    expect(lib.groupViolations([row({ ratio: 2, size: 12 }), row({ ratio: 2, size: 13 })])).toHaveLength(2);
  });
});

describe('色の読み書き (実機の computed style が返す形)', () => {
  it('#rgb / #rrggbb / #rrggbbaa / rgb() / rgba() / color(srgb …) を読む', () => {
    expect(M.parse('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(M.parse('#1f1e1c')).toEqual({ r: 0x1f, g: 0x1e, b: 0x1c, a: 1 });
    expect(M.parse('#ffffff80')!.a).toBeCloseTo(128 / 255, 5);
    expect(M.parse('#0008')!.a).toBeCloseTo(0x88 / 255, 5);
    expect(M.parse('rgb(10, 90, 221)')).toEqual({ r: 10, g: 90, b: 221, a: 1 });
    expect(M.parse('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(M.parse('rgb(0 0 0 / 0.25)')).toEqual({ r: 0, g: 0, b: 0, a: 0.25 });
    expect(M.parse('color(srgb 1 0 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(M.parse('color(srgb 1 0.5 0 / 0.5)')).toEqual({ r: 255, g: 127.5, b: 0, a: 0.5 });
  });

  it('読めない物は null (勝手な色を決めない): 空・キーワード・桁の違う hex', () => {
    for (const s of ['', 'transparent', 'currentColor', 'none', '#12345', '#12', 'url(#g)', 'linear-gradient(red, blue)']) {
      expect(M.parse(s), JSON.stringify(s)).toBeNull();
    }
  });

  it('重ねる (over): 不透明は上がそのまま・半透明は混ぜる・要素全体の不透明度 (extra) は掛かる', () => {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const black = { r: 0, g: 0, b: 0, a: 1 };
    expect(M.over(black, white)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(M.over({ ...black, a: 0.5 }, white)).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
    expect(M.over(black, white, 0.25)).toEqual({ r: 191.25, g: 191.25, b: 191.25, a: 1 });
    expect(M.over({ ...black, a: 0 }, white)).toEqual(white);
  });

  it('hex は 0〜255 へ丸めて切る', () => {
    expect(M.hex({ r: 255.4, g: -3, b: 127.5, a: 1 })).toBe('#ff0080');
    expect(M.hex({ r: 300, g: 0, b: 0, a: 1 })).toBe('#ff0000');
  });

  it('相対輝度と対比: 白 × 黒 = 21・同じ色 = 1・順序に依らない', () => {
    const white = M.parse('#fff')!;
    const black = M.parse('#000')!;
    expect(M.ratio(white, black)).toBeCloseTo(21, 10);
    expect(M.ratio(black, white)).toBeCloseTo(21, 10);
    expect(M.ratio(white, white)).toBe(1);
    // WCAG の既知の値: #767676 × 白 ≈ 4.54 (通常の字で通る最も薄い灰)・#777777 × 白 ≈ 4.48 (割る)
    expect(M.ratio(M.parse('#767676')!, white)).toBeCloseTo(4.54, 2);
    expect(M.ratio(M.parse('#777777')!, white)).toBeCloseTo(4.48, 2);
  });
});

describe('ページへ送る式 (sweepExpression)', () => {
  it('3 つの関数のソースを 1 つの式へ束ねる (関数を値として渡さない —— ページの CSP の外で文字列として評価するため)', () => {
    const e = lib.sweepExpression();
    expect(typeof e).toBe('string');
    expect(e.startsWith('(() => {')).toBe(true);
    expect(e).toContain('function contrastMath()');
    // 地の求め方 (groundTools) は操作子の測定 (controls.cjs) も読むので contrast.cjs が持つ (写しを作らない・パス 504)
    expect(e).toContain('function groundTools(M)');
    expect(e).toContain('function measureDocument(M, G)');
    // 標本: 式として構文が通る (評価はしない —— DOM が要る)
    expect(() => new Function(`return ${e}`)).not.toThrow();
  });
});

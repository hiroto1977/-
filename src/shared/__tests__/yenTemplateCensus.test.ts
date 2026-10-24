import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

/*
 * **円を自前で組む所は、共有の整形の外に無い** (2026-09-27 · パス 493j)。
 *
 * `jpy` はパス 198 で床 (非有限は「—」) を持ったが、画面ごとの写しが残っていた —— `FreeePage` は
 * `−¥1,234` (U+2212 を ¥ の前)、`FundingPage` と経営レポートは `¥-1,234`。3 つとも床を持たず
 * `¥NaN` / `¥∞` / `−¥∞` を刷り、同じ額がページによって別の字で出た (パス 96 が測った
 * 「−∞ が 3 通りに刷られる」の残り)。直し: 床と符号は `jpy`、円未満の丸めは `jpyWhole` の 1 つずつ。
 *
 * 針: 注記を落としたコードの中で、`¥` の直後にテンプレートの補間 (`¥${`) が来る所と、
 * `'¥' +` の連結。**`Intl.NumberFormat` の通貨の写しは別の家系で、この針は数えない** ——
 * 7 ファイルが全角の `￥` を刷る (2026-09-27 実測)。揃えると画面の字が変わり、その字を留める
 * 検査が多数あるので、別に測って直す (docs/REMAINING_WORK.md に実測を残した)。
 */

const REPO = path.resolve(__dirname, '../../..');
const ROOTS = ['src/renderer', 'src/shared'];
const HOME = 'src/shared/formatters.ts';

export const YEN_TEMPLATE = /¥\$\{|['"]¥['"]\s*\+/;

/** 理由つきの免除。鍵はファイル、値は件数と理由。 */
const EXEMPT: Readonly<Record<string, { readonly count: number; readonly why: string }>> = {
  'src/renderer/pages/RealEstatePage.tsx': {
    count: 1,
    why: '百万円単位の軸ラベル (`¥12.3M`) —— 円の額ではなく単位の違う目盛りで、値は入口が 1 円以上を要求する取得価格だけ',
  },
};

function walk(rel: string): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(path.join(REPO, rel))) {
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === '__audits__') continue;
      out.push(...walk(child));
    } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(child);
    }
  }
  return out;
}

export function yenTemplateLines(src: string): number[] {
  const out: number[] = [];
  stripComments(src)
    .split('\n')
    .forEach((line, i) => {
      if (YEN_TEMPLATE.test(line)) out.push(i + 1);
    });
  return out;
}

describe('円を自前で組む所は共有の整形の外に無い (母集団は実装から)', () => {
  const files = ROOTS.flatMap(walk);

  it('走査は実物に当たる (300 未満なら走査が死んでいる)', () => {
    expect(files.length).toBeGreaterThanOrEqual(300);
    expect(files).toContain(HOME);
  });

  it('★ formatters.ts と台帳の外に `¥${` / `\'¥\' +` が無い (両方向)', () => {
    const found: Record<string, number> = {};
    for (const f of files) {
      if (f === HOME) continue;
      const n = yenTemplateLines(readOriginalSource(path.join(REPO, f))).length;
      if (n > 0) found[f] = n;
    }
    const expected = Object.fromEntries(Object.entries(EXEMPT).map(([f, e]) => [f, e.count]));
    expect(found, '共有の jpy / jpyWhole を通すこと (免除するなら理由つきで台帳へ)').toEqual(expected);
  });

  it('formatters.ts 自身は針に当たる (無ければ針が死んでいる)', () => {
    expect(yenTemplateLines(readOriginalSource(path.join(REPO, HOME))).length).toBeGreaterThanOrEqual(1);
  });

  it('画面に私有の jpy は無い (名前で写しを作らない)', () => {
    const own = files.filter(
      (f) => f !== HOME && /\b(?:function\s+jpy\w*\s*\(|const\s+jpy(?:Whole)?\s*=)/.test(stripComments(readOriginalSource(path.join(REPO, f)))),
    );
    expect(own).toEqual([]);
  });

  it('免除の理由は具体的 (保留の決まり文句ではない)', () => {
    for (const [f, e] of Object.entries(EXEMPT)) {
      expect(e.why.length, f).toBeGreaterThanOrEqual(30);
      expect(e.why, f).not.toMatch(/^(同上|TBD|todo|後で|未定)[。.]?$/i);
    }
    expect('同上').toMatch(/^(同上|TBD|todo|後で|未定)[。.]?$/i); // 標本: 針が禁じたい文面に当たる
  });
});

describe('針は標本に当たる (対照)', () => {
  it('★ 直す前の形はどれも当たる', () => {
    for (const s of [
      "  return `${sign}¥${Math.abs(Math.round(n)).toLocaleString('ja-JP')}`;", // FreeePage
      "  return `¥${Math.round(n).toLocaleString('ja-JP')}`;", // FundingPage
      "const yen = (n: number): string => `¥${Math.round(n).toLocaleString('ja-JP')}`;", // 経営レポート
      "const label = '¥' + n.toLocaleString();",
    ]) {
      expect(YEN_TEMPLATE.test(s), s).toBe(true);
    }
  });

  it('共有の整形を通す形・注記の中は当たらない', () => {
    for (const s of ['value={jpyWhole(n)}', 'const yen = jpyWhole;', "label: '価格 (¥)'"]) {
      expect(YEN_TEMPLATE.test(s), s).toBe(false);
    }
    expect(yenTemplateLines('// `¥${n}` と組まない\nconst x = 1;')).toEqual([]);
    expect(yenTemplateLines('const x = 1;\nconst y = `¥${n}`;')).toEqual([2]);
  });
});

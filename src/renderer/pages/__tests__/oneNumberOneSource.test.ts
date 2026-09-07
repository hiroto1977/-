/**
 * **画面が、共有モジュールの持っている量を数え直していないこと。** (2026-09-07)
 *
 * `stryker.config.json` の `mutate` に `.tsx` は 1 件も無い。だから画面の中に
 * 書いた算術は変異検査の外に出る —— そこで同じ量をもう一度数えると、
 * **測られている側と測られていない側の 2 つの出所**ができる。実際に 1 件
 * ずれていた例が `data/overviewScorecard.ts` の冒頭に書いてある。
 *
 * 棚卸し (2026-09-07) で、`.tsx` 101 件のうち `reduce()` か丸めを持つのは 22 件。
 * そのうち**共有モジュールが同じ量を既に持っていた**のは 3 件で、ここはその
 * 3 件が数え直しへ戻らないことを留める:
 *
 *   - `KpiPage` の「実績合計 売上高」  … `summarizeFundamentals().revenue`
 *   - `EmotionsPage` の「平均 x.x/5」   … `analyzeProfile().averageScore`
 *   - `FreeePage` の営業CF合計          … `summarizeAccounting().totalNet`
 *
 * 残りは表示の丸め・入力の丸め込み・その画面だけの合成で、共有側に対応する
 * 量が無い (内訳は `docs/REMAINING_WORK.md`)。
 *
 * **不在の主張には標本を添える** —— 規則の正規表現が「直す前の書き方」に
 * 実際に当たることを、同じ検査の中で確かめる。当たらない正規表現は、
 * どの入力でも通る空の検査になる。
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';

const PAGES = path.resolve(__dirname, '..');
const read = (file: string): string => readOriginalSource(path.join(PAGES, file));

/** コメントを落とす (経緯の説明文の中の例を数えないため)。 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

interface Rule {
  readonly page: string;
  /** 数え直しの形。直す前のコードに当たること。 */
  readonly duplicate: RegExp;
  /** 直す前に在った実物の 1 行 (標本)。 */
  readonly sample: string;
  /** 代わりに使う共有モジュールの関数。 */
  readonly owner: string;
}

const RULES: readonly Rule[] = [
  {
    page: 'KpiPage.tsx',
    duplicate: /\.reduce\((?:\s*\([^)]*\)\s*=>)?[^\n]*\.revenue/,
    sample: 'return records.reduce((acc, r) => acc + r.data.revenue, 0);',
    owner: 'summarizeFundamentals',
  },
  {
    page: 'EmotionsPage.tsx',
    duplicate: /\.reduce\((?:\s*\([^)]*\)\s*=>)?[^\n]*\.score/,
    sample: 'return moods.reduce((s, m) => s + m.score, 0) / moods.length;',
    owner: 'analyzeProfile',
  },
  {
    page: 'FreeePage.tsx',
    duplicate: /\.reduce\((?:\s*\([^)]*\)\s*=>)?[^\n]*\.net\b/,
    sample: 'const totalNet = live.monthly.reduce((s, m) => s + m.net, 0);',
    owner: 'summarizeAccounting',
  },
];

describe('画面は共有モジュールの量を数え直さない', () => {
  for (const rule of RULES) {
    it(`★ ${rule.page}: 標本の書き方に当たる規則である (空の検査ではない)`, () => {
      expect(rule.duplicate.test(rule.sample)).toBe(true);
    });

    it(`${rule.page}: その数え直しを持たない`, () => {
      expect(rule.duplicate.test(stripComments(read(rule.page)))).toBe(false);
    });

    it(`${rule.page}: 代わりに ${rule.owner} を読んでいる`, () => {
      expect(read(rule.page)).toContain(rule.owner);
    });
  }

  it('対照: 走査の的が実在する (ファイルを読めている)', () => {
    for (const rule of RULES) expect(read(rule.page).length).toBeGreaterThan(500);
  });
});

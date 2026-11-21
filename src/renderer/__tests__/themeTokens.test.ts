/**
 * トークン表 —— `styles.css` の **4 枚の `:root` ブロック**を照合する (パス 317 → 2026-09-26 にデザインを 2 つへ)。
 *
 *   すっきり × ライト  `:root`                                (既定)
 *   すっきり × ダーク  `:root[data-theme="dark"]`
 *   かわいい × ライト  `:root[data-design="cute"]`
 *   かわいい × ダーク  `:root[data-design="cute"][data-theme="dark"]`
 *
 * 規則は 5 つ:
 *   ① 各デザインで、ライトの色トークンは**すべて**ダークで上書きされている (書き忘れるとライトの色が残る)
 *   ② 各デザインで、ダークはライトに無い名前を定義しない (逆向き —— 消した名前が片側に残らない)
 *   ③ 2 つのデザインのライトは**同じ名前の集合**を持つ (両方向)。片方にしか無い名前は、デザインを
 *      替えたときに**前のデザインの値が残る** —— 形のトークン (角・余白・飾りの記号) も含めて全部。
 *   ④ 4 枚とも `color-scheme` を宣言する (かわいい × ダークでは「かわいいのライト」の `light` が
 *      後ろに在って勝つので、ダークの表が自分で `dark` を言い直さないと、フォームの部品が明るく描かれる)
 *   ⑤ 画面の部品の規則 (紙の節より前) に直書きの色は無い。紙の節 (書類スタジオ・銀行提出書式・印刷) は
 *      白い紙なので配色の外。
 *
 * 「色トークン」は値に**色の字面**を持つ物 (`#rrggbb` / `rgb(a)(…)` / `…gradient(…)`)。別名 (`var(…)`)・
 * 長さ (`12px`)・記号 (`'✿'`)・`none`・`transparent`・書体は色ではないので ① の外 —— 配色で変わらない。
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import {
  CSS,
  CLEAN_LIGHT,
  CLEAN_DARK,
  CUTE_LIGHT,
  CUTE_DARK,
  TABLES,
  escapeRe,
  block,
  tokens,
  isColourToken,
} from './themeCss';

/** ここから後ろは紙 (書類スタジオ / 銀行提出書式 / 印刷)。 */
const PAPER_MARKER = '/* --- 書類スタジオ (DocstudioPage)';

/** 画面の部品の規則に残る直書きの色 (紙の節と 4 枚の :root は外す)。 */
export function uiColourLiterals(css: string): string[] {
  const paperAt = css.indexOf(PAPER_MARKER);
  let ui = paperAt >= 0 ? css.slice(0, paperAt) : css;
  for (const sel of TABLES) {
    const re = new RegExp(`^${escapeRe(sel)}\\s*\\{[^}]*\\}`, 'm');
    ui = ui.replace(re, '');
  }
  ui = ui.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...ui.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map((m) => m[0]).sort();
}

const cleanLight = tokens(block(CSS, CLEAN_LIGHT));
const cleanDark = tokens(block(CSS, CLEAN_DARK));
const cuteLight = tokens(block(CSS, CUTE_LIGHT));
const cuteDark = tokens(block(CSS, CUTE_DARK));

const DESIGNS = [
  { name: 'すっきり', light: cleanLight, dark: cleanDark },
  { name: 'かわいい', light: cuteLight, dark: cuteDark },
] as const;

/**
 * 部品の規則に残す直書きの色。**パス 322 で 0 件になった** —— 影・光輪・押した時の色も
 * トークンへ寄せたので、ダークでは影も光輪も配色に合わせて変わる。数が動けば鳴る ——
 * 新しい直書きは (a) トークンにするか (b) ここに理由を書いて足す。
 */
const REMAINING_UI_LITERALS: string[] = [].sort();

describe('トークン表 (4 枚) —— 形', () => {
  it('標本: 4 枚の表は実物の styles.css から読めている (読めなければ以下は空の検査になる)', () => {
    // 照合の相手 (`themeCss.ts` が読む `CSS`) とは別に、この検査自身が原文を読んで突き合わせる。
    // 検査は走査 (原文を読む) を自分で持つ —— 法則 `design-switch-leaves-nothing-behind` の執行者が母集団を見ている根拠。
    const css = readOriginalSource(join(__dirname, '..', 'styles.css'));
    expect(css).toBe(CSS);
    for (const sel of TABLES) expect(block(css, sel), sel).not.toBe('');
  });

  it('★ 4 枚とも color-scheme を宣言し、明るさが表の名前と合う', () => {
    expect(block(CSS, CLEAN_LIGHT)).toMatch(/^\s*color-scheme:\s*light;/m);
    expect(block(CSS, CLEAN_DARK)).toMatch(/^\s*color-scheme:\s*dark;/m);
    expect(block(CSS, CUTE_LIGHT)).toMatch(/^\s*color-scheme:\s*light;/m);
    expect(block(CSS, CUTE_DARK)).toMatch(/^\s*color-scheme:\s*dark;/m);
  });

  it('★ 表の順序: すっきりのダークより後ろにかわいいのライト、その後ろにかわいいのダーク', () => {
    // かわいい × ダークでは、同じ特異性 (0,2,0) の「すっきりのダーク」と「かわいいのライト」がぶつかる。
    // 後ろに在るかわいいのライトが勝ち、その上を (0,3,0) のかわいいのダークが塗る —— 順序が逆だと、
    // かわいい × ダークですっきりのダークの値が混ざる。
    const at = (sel: string) => new RegExp(`^${escapeRe(sel)}\\s*\\{`, 'm').exec(CSS)?.index ?? -1;
    const order = TABLES.map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe.each(DESIGNS)('トークン表 —— $name の配色', ({ light, dark }) => {
  it('★ ライトの色トークンはすべてダークで上書きされている', () => {
    const missing = [...light].filter(([name, value]) => isColourToken(value) && !dark.has(name)).map(([n]) => n);
    expect(missing, 'ダークに無い名前はライトの色のまま残る').toEqual([]);
  });

  it('★ ダークはライトに無い名前を定義しない (逆向き)', () => {
    const extra = [...dark.keys()].filter((n) => !light.has(n));
    expect(extra).toEqual([]);
  });

  it('標本: 色トークンは実際に違う値を持つ (照合が空でない)', () => {
    expect(light.get('--bg')).not.toBe(dark.get('--bg'));
    expect(light.get('--text')).not.toBe(dark.get('--text'));
    expect(isColourToken(light.get('--bg')!)).toBe(true);
    expect(light.size).toBeGreaterThanOrEqual(100);
  });
});

describe('トークン表 —— 2 つのデザイン', () => {
  it('★ 2 つのデザインのライトは同じ名前の集合を持つ (両方向 —— 替えたときに前の値が残らない)', () => {
    const onlyClean = [...cleanLight.keys()].filter((n) => !cuteLight.has(n));
    const onlyCute = [...cuteLight.keys()].filter((n) => !cleanLight.has(n));
    expect(onlyClean, 'すっきりにだけ在る名前 (かわいいに替えてもすっきりの値が残る)').toEqual([]);
    expect(onlyCute, 'かわいいにだけ在る名前 (すっきりでは未定義)').toEqual([]);
  });

  it('★ 2 つのデザインは実際に違う (下地・角・飾り)', () => {
    expect(cleanLight.get('--bg')).not.toBe(cuteLight.get('--bg'));
    expect(cleanLight.get('--radius-button')).toBe('8px');
    expect(cuteLight.get('--radius-button')).toBe('999px');
    expect(cleanLight.get('--brand-mark')).toBe('none');
    expect(cuteLight.get('--brand-mark')).toBe("'✿'");
    // すっきりは浮いたカードではない (余白 0・角 0)、かわいいは 12px 浮いて 24px の角。
    expect(cleanLight.get('--shell-gap')).toBe('0px');
    expect(cuteLight.get('--shell-gap')).toBe('12px');
  });

  it('標本: 色の判定は色の字面だけを見る (形・記号・別名は配色で変わらない)', () => {
    for (const v of ['#fff', '#faf9f5', 'rgba(0, 0, 0, 0.3)', 'linear-gradient(135deg, #ff8fc0 0%, #b79cff 100%)']) {
      expect(isColourToken(v), v).toBe(true);
    }
    for (const v of ['var(--bg-elevated)', '12px', '0px', "'✿'", 'none', 'transparent', 'blur(20px)', 'translateY(-2px)', '0 1px 0 0']) {
      expect(isColourToken(v), v).toBe(false);
    }
  });
});

describe('画面の部品の規則', () => {
  it('★ 画面の部品の規則に残る直書きの色は台帳のとおり (両方向)', () => {
    expect(uiColourLiterals(CSS)).toEqual(REMAINING_UI_LITERALS);
  });

  it('標本: 走査は直書きを拾い、4 枚の :root の中と紙の節とコメントは拾わない', () => {
    const sample = [
      ':root {\n  --a: #111111;\n}',
      ':root[data-theme="dark"] {\n  --a: #222222;\n}',
      ':root[data-design="cute"] {\n  --a: #444444;\n}',
      ':root[data-design="cute"][data-theme="dark"] {\n  --a: #555555;\n}',
      '/* #333333 */\n.x { color: #123456; background: rgba(1, 2, 3, 0.4); }',
      PAPER_MARKER + '\n.ds-paper { background: #ffffff; }',
    ].join('\n');
    expect(uiColourLiterals(sample)).toEqual(['#123456', 'rgba(1, 2, 3, 0.4)']);
    expect(tokens(block(sample, CUTE_DARK)).get('--a')).toBe('#555555');
    expect(tokens(block(sample, CLEAN_LIGHT)).get('--a')).toBe('#111111');
  });
});

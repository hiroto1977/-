/**
 * ダーク配色のトークン表 (パス 317) —— `styles.css` の 2 つの `:root` ブロックを照合する。
 *
 * 規則は 3 つ:
 *   ① ライトの色トークンは**すべて**ダークで上書きされている (足した名前を書き忘れるとライトの色が残る)
 *   ② ダークはライトに無い名前を定義しない (逆向き —— 消した名前が片側に残らない)
 *   ③ 画面の部品の規則 (紙の節より前) に直書きの色は無い。残る物の一覧を台帳として持つ (両方向 ——
 *      パス 322 から台帳は空で、影と光輪もトークン)。紙の節 (書類スタジオ・銀行提出書式・印刷) は白い紙なので配色の外。
 *
 * 別名 (`--bg-elev: var(--bg-elevated)` など) と長さ (`--radius`) は色ではないので ① の外。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
const LIGHT_SELECTOR = ':root';
const DARK_SELECTOR = ':root[data-theme="dark"]';
/** ここから後ろは紙 (書類スタジオ / 銀行提出書式 / 印刷)。 */
const PAPER_MARKER = '/* --- 書類スタジオ (DocstudioPage)';

/** `selector {` の中身 (入れ子は無い前提 —— :root ブロックは宣言だけ)。 */
export function block(css: string, selector: string): string {
  const re = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm');
  const m = re.exec(css);
  if (!m) throw new Error(`block not found: ${selector}`);
  return m[1] ?? '';
}

export function tokens(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)) out.set(m[1]!, m[2]!.trim());
  return out;
}

/** 色として上書きが要るトークン: 値が別名 (`var(`) でも長さでもない物。 */
export function isColourToken(value: string): boolean {
  return !value.startsWith('var(') && !/^\d+(\.\d+)?px$/.test(value);
}

/** 画面の部品の規則に残る直書きの色 (紙の節と 2 つの :root は外す)。 */
export function uiColourLiterals(css: string): string[] {
  const paperAt = css.indexOf(PAPER_MARKER);
  let ui = paperAt >= 0 ? css.slice(0, paperAt) : css;
  for (const sel of [LIGHT_SELECTOR, DARK_SELECTOR]) {
    const re = new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`, 'm');
    ui = ui.replace(re, '');
  }
  ui = ui.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...ui.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map((m) => m[0]).sort();
}

const light = tokens(block(CSS, LIGHT_SELECTOR));
const dark = tokens(block(CSS, DARK_SELECTOR));

/**
 * 部品の規則に残す直書きの色。**パス 322 で 0 件になった** —— 影・光輪・押した時の色も
 * `--shadow-*` / `--focus-ring` / `--primary-shadow` / `--on-gradient` のトークンへ寄せたので、
 * ダークでは影も光輪も配色に合わせて変わる (パス 317 までは 10 件がライトの値のまま残っていた)。
 * 数が動けば鳴る —— 新しい直書きは (a) トークンにするか (b) ここに理由を書いて足す。
 */
const REMAINING_UI_LITERALS: string[] = [].sort();

describe('ダーク配色のトークン表 (パス 317)', () => {
  it('両方の :root が color-scheme を宣言する', () => {
    expect(block(CSS, LIGHT_SELECTOR)).toMatch(/^\s*color-scheme:\s*light;/m);
    expect(block(CSS, DARK_SELECTOR)).toMatch(/^\s*color-scheme:\s*dark;/m);
  });

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
    // 別名は色ではない (上書きしなくてよい理由がある)。
    expect(isColourToken(light.get('--bg-elev')!)).toBe(false);
    expect(isColourToken(light.get('--radius')!)).toBe(false);
    expect(isColourToken(light.get('--bg')!)).toBe(true);
    expect(light.size).toBeGreaterThanOrEqual(50);
  });

  it('★ 画面の部品の規則に残る直書きの色は台帳のとおり (両方向)', () => {
    expect(uiColourLiterals(CSS)).toEqual(REMAINING_UI_LITERALS);
  });

  it('標本: 走査は直書きを拾い、:root の中と紙の節とコメントは拾わない', () => {
    const sample = [
      ':root {\n  --a: #111111;\n}',
      ':root[data-theme="dark"] {\n  --a: #222222;\n}',
      '/* #333333 */\n.x { color: #123456; background: rgba(1, 2, 3, 0.4); }',
      PAPER_MARKER + '\n.ds-paper { background: #ffffff; }',
    ].join('\n');
    expect(uiColourLiterals(sample)).toEqual(['#123456', 'rgba(1, 2, 3, 0.4)']);
    expect(tokens(block(sample, DARK_SELECTOR)).get('--a')).toBe('#222222');
  });
});

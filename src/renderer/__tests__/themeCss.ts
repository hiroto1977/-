/**
 * `styles.css` の **4 枚のトークン表** を読む共有の道具 (2026-10-02 · パス 503)。
 *
 * `themeTokens.test.ts` (表の形) と `themeContrast.test.ts` (表の対比) の 2 つが読む。
 * 検査ファイルから別の検査ファイルを import すると中の `describe` がもう一度走る (`jsdomWait.ts` /
 * `recordStoreHarness.ts` と同じ理由) ので、読み取りだけをここへ出した。
 */
import { join } from 'node:path';
import { readOriginalSource } from '../../shared/__tests__/originalSource';

/**
 * 母集団は stylesheet の**全部の名前**。原文の道具で読む (`originalSourcePolicy` の規則 1 と同じ ——
 * 変異検査の sandbox でも本物の綴りを読む)。
 */
export const CSS = readOriginalSource(join(__dirname, '..', 'styles.css'));

export const CLEAN_LIGHT = ':root';
export const CLEAN_DARK = ':root[data-theme="dark"]';
export const CUTE_LIGHT = ':root[data-design="cute"]';
export const CUTE_DARK = ':root[data-design="cute"][data-theme="dark"]';
export const TABLES = [CLEAN_LIGHT, CLEAN_DARK, CUTE_LIGHT, CUTE_DARK] as const;

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `selector {` の中身 (入れ子は無い前提 —— :root ブロックは宣言だけ)。行頭に在る物だけ。 */
export function block(css: string, selector: string): string {
  const re = new RegExp(`^${escapeRe(selector)}\\s*\\{([^}]*)\\}`, 'm');
  const m = re.exec(css);
  if (!m) throw new Error(`block not found: ${selector}`);
  return m[1] ?? '';
}

export function tokens(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)) out.set(m[1]!, m[2]!.trim().replace(/\s+/g, ' '));
  return out;
}

/** 色として配色ごとの上書きが要るトークン: 値に色の字面を持つ物。 */
export function isColourToken(value: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b|rgba?\(|gradient\(/.test(value);
}

/**
 * 4 つの配色ごとの**実効の表**。ブラウザが重ねる順 (特異性 → ソース順) をそのまま写す:
 *
 *   すっきり × ライト  `:root`
 *   すっきり × ダーク  `:root` → `:root[data-theme="dark"]`
 *   かわいい × ライト  `:root` → `:root[data-design="cute"]`
 *   かわいい × ダーク  `:root` → すっきりのダーク → かわいいのライト → かわいいのダーク
 *
 * 最後だけ 4 枚が全部重なる —— すっきりのダークとかわいいのライトは同じ特異性 (0,2,0) で、後ろに在るかわいいが勝ち、
 * その上を (0,3,0) のかわいいのダークが塗る (表の順序の検査が留めている)。
 */
export type ThemeName = 'すっきり × ライト' | 'すっきり × ダーク' | 'かわいい × ライト' | 'かわいい × ダーク';

export function effectiveTables(css: string = CSS): Record<ThemeName, Map<string, string>> {
  const cleanLight = tokens(block(css, CLEAN_LIGHT));
  const cleanDark = tokens(block(css, CLEAN_DARK));
  const cuteLight = tokens(block(css, CUTE_LIGHT));
  const cuteDark = tokens(block(css, CUTE_DARK));
  const layer = (...ts: Map<string, string>[]): Map<string, string> => {
    const out = new Map<string, string>();
    for (const t of ts) for (const [k, v] of t) out.set(k, v);
    return out;
  };
  return {
    'すっきり × ライト': layer(cleanLight),
    'すっきり × ダーク': layer(cleanLight, cleanDark),
    'かわいい × ライト': layer(cleanLight, cuteLight),
    'かわいい × ダーク': layer(cleanLight, cleanDark, cuteLight, cuteDark),
  };
}

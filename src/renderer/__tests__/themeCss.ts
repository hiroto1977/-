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

/**
 * **CSS の規則を 1 つずつ読む** (2026-10-03 · パス 504)。`:root` の宣言 (`block` / `tokens`) ではなく、
 * 部品の規則 (`selector { 宣言 }`) の側 —— 「フォーカスの輪を消す規則が無い」「入力欄の枠は専用のトークン」のような、
 * **トークンを使う側**の検査が読む。
 *
 * 小さな読み手で足りる範囲 (`styles.css` は入れ子の規則を持たず、文字列に `{` `}` を含まない) に限る:
 * コメントを落とし、`@media` / `@supports` の中へは降りて (`context` に条件を残す)、`@keyframes` / `@font-face` などは飛ばす。
 * 宣言は `;` で切るが、括弧の中 (`url(data:…;base64,…)` ・`rgba(…)`) と引用符の中の `;` では切らない。
 */
export interface CssRule {
  /** 空白を 1 つに畳んだセレクタ (カンマ区切りのまま)。 */
  readonly selector: string;
  /** 宣言を出現順に。同じ名前が複数あれば全部残す (後ろが勝つ)。 */
  readonly decls: readonly (readonly [string, string])[];
  /** 囲んでいる `@media …` / `@supports …` (無ければ空)。 */
  readonly context: string;
}

export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 宣言の本体を (名前, 値) の列にする。括弧と引用符の中の `;` では切らない。 */
export function declarations(body: string): [string, string][] {
  const out: [string, string][] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  const push = (end: number): void => {
    const piece = body.slice(start, end).trim();
    const colon = piece.indexOf(':');
    if (colon > 0) out.push([piece.slice(0, colon).trim().toLowerCase(), piece.slice(colon + 1).trim().replace(/\s+/g, ' ')]);
    start = end + 1;
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (quote) {
      if (c === quote && body[i - 1] !== '\\') quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) push(i);
  }
  push(body.length);
  return out;
}

export function rules(css: string = CSS): CssRule[] {
  const out: CssRule[] = [];
  const walk = (text: string, context: string): void => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open === -1) break;
      // 直前の `;` より後ろだけが前置き (`@import …;` のような波括弧の無い at-rule を前置きに巻き込まない)
      const head = text.slice(i, open);
      const prelude = head.slice(head.lastIndexOf(';') + 1).trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        const c = text[j]!;
        if (c === '{') depth++;
        else if (c === '}') depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      if (/^@(?:media|supports)\b/.test(prelude)) walk(body, context ? `${context} ${prelude}` : prelude);
      else if (!prelude.startsWith('@')) out.push({ selector: prelude.replace(/\s+/g, ' '), decls: declarations(body), context });
      i = j;
    }
  };
  walk(stripCssComments(css), '');
  return out;
}

/** その規則の宣言のうち、名前 `prop` の**最後**の値 (CSS は後ろが勝つ)。無ければ undefined。 */
export function declOf(rule: CssRule, prop: string): string | undefined {
  let v: string | undefined;
  for (const [k, val] of rule.decls) if (k === prop) v = val;
  return v;
}

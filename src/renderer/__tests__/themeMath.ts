/**
 * **トークン表の色を計算する共有の道具** (2026-10-03 · パス 504)。
 *
 * `themeContrast.test.ts` (文字 × 地・4.5:1) と `themeNonTextContrast.test.ts` (操作子の枠・フォーカスの輪 × 地・3:1) の
 * 2 つが読む。検査ファイルから別の検査ファイルを import すると中の `describe` がもう一度走る (`themeCss.ts` /
 * `jsdomWait.ts` と同じ理由) ので、計算だけをここへ出した —— **対比の算法は `scripts/lib/contrast.cjs` の 1 つ**で、
 * ここは「トークンの名前 → 不透明な色の候補」へ解く所だけを持つ。
 */
import { createRequire } from 'node:module';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}
interface Math3 {
  parse: (s: string) => Rgba | null;
  over: (top: Rgba, bottom: Rgba, extra?: number) => Rgba;
  ratio: (a: Rgba, b: Rgba) => number;
  hex: (c: Rgba) => string;
}
const { contrastMath } = createRequire(import.meta.url)('../../../scripts/lib/contrast.cjs') as { contrastMath: () => Math3 };
export const M = contrastMath();

/** `var(--x)` の連鎖をたどって、その名前が持つ**字面の値**を返す。たどれなければ null。 */
export function literal(t: Map<string, string>, name: string, depth = 0): string | null {
  if (depth > 8) return null;
  const v = t.get(name);
  if (v === undefined) return null;
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  return m ? literal(t, m[1]!, depth + 1) : v;
}

/** 色の字面 → 不透明な候補の列。グラデーションは停止点ごと・半透明は各 `bases` に重ねる。 */
export function candidates(value: string, bases: readonly Rgba[]): Rgba[] {
  if (value === 'transparent') return [...bases];
  const stops = /gradient\(/.test(value)
    ? [...value.matchAll(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g)].map((m) => M.parse(m[0])).filter((c): c is Rgba => c !== null)
    : [M.parse(value)].filter((c): c is Rgba => c !== null);
  if (stops.length === 0) throw new Error(`色として読めない: ${value}`);
  const out: Rgba[] = [];
  for (const s of stops) for (const b of bases) out.push(M.over(s, b, 1));
  return out;
}

/** 面の地 (`--bg`) と、かわいいの光輪 (`--glow-*` が不透明な色のとき) —— 半透明の面が重なる下地の候補。 */
export function baseGrounds(t: Map<string, string>): Rgba[] {
  const bg = M.parse(literal(t, '--bg') ?? '');
  if (bg === null) throw new Error('--bg が色として読めない');
  const bases: Rgba[] = [bg];
  for (const name of ['--glow-1', '--glow-2', '--glow-3']) {
    const g = M.parse(literal(t, name) ?? '');
    if (g !== null && g.a >= 1) bases.push(M.over(g, bg, 1));
  }
  return bases;
}

/**
 * 1 つの配色の表で、`ink` (トークン名) を `ground` (トークン名) の上に置いたときの**最悪の対比**。
 * 地は半透明なら下の地に重ね・グラデーションは全停止点で測り、字 (または線) は各候補の上に重ねる。
 * 名前が解けなければ投げる (綴り違いで測りが黙って空になるのを防ぐ)。
 */
export function worstRatio(theme: string, t: Map<string, string>, ink: string, ground: string): number {
  const bases = baseGrounds(t);
  const inkLit = literal(t, ink);
  if (inkLit === null) throw new Error(`${theme}: ${ink} が定義されていない / たどれない`);
  const gLit = literal(t, ground);
  if (gLit === null) throw new Error(`${theme}: 地 ${ground} が定義されていない / たどれない`);
  let worst = Infinity;
  for (const g of candidates(gLit, bases)) {
    for (const i of candidates(inkLit, [g])) worst = Math.min(worst, M.ratio(i, g));
  }
  return worst;
}

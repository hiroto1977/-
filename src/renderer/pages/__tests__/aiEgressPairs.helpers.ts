/**
 * **AI へ出る `(serviceId, action)` の組と、それを invoke する画面を実装から導く部品。**
 *
 * `aiEgressDisclosed.test.ts` (断りの有無 —— パス 107) と `aiInputCaps.test.ts`
 * (入力の天井 —— パス 112) が**同じ母集団**を読む。導き方をそれぞれの検査に写すと、
 * 片方だけ直したときにもう片方の母集団がずれる (パス 106 → 107 で 5 → 8 に動いたのは、
 * 数える所を手で書いていたから)。だから導き方は 1 か所に置く。
 *
 * これは検査の部品であって検査ではない (`it(` を持たない)。
 */
import fs from 'node:fs';
import path from 'node:path';

export const PAGES = path.resolve(__dirname, '..');
/**
 * 走査は **renderer 全体**を見る。`pages/` だけを見ると `components/` が丸ごと見えない ——
 * `lint:network-targets` は 2026-08-22 に同じ理由でディレクトリの一覧をやめて `src` 全体に
 * した。**規準は隣のゲートに在った** (2026-09-09 · パス 108)。
 */
export const RENDERER = path.resolve(__dirname, '../..');
export const CLIENTS = path.resolve(__dirname, '../../../main/clients');

/** AI へ本文が出る印 (実際に外部モデルを叩いている場所)。 */
export const AI_MARKS: readonly RegExp[] = [/api\.anthropic\.com/, /\brunAiChat\s*\(/];

/** コメントを落とした本体 (説明の中の綴りを配線と読まない)。 */
export function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
}

/** `open` から対応する `close` までの中身 (入れ子で切れない)。 */
export function balanced(src: string, from: number, open: string, close: string): string {
  let depth = 0;
  for (let i = from; i < src.length; i += 1) {
    if (src[i] === open) depth += 1;
    else if (src[i] === close) {
      depth -= 1;
      if (depth === 0) return src.slice(from + 1, i);
    }
  }
  return '';
}

/**
 * 本体の開き波括弧。**戻り値の型の中の `{` を本体と読まない** ——
 * `Promise<{ text: string }> {` では最初の `{` は型のものである
 * (これで最初の試作は `runSkill` / `chat` を「AI に到達しない」と誤判定した)。
 * 本体の `{` には改行が続く。
 */
export function bodyBrace(src: string, from: number): number {
  for (let i = from; i < src.length; i += 1) {
    if (src[i] !== '{') continue;
    let j = i + 1;
    while (src[j] === ' ' || src[j] === '\t') j += 1;
    if (src[j] === '\n') return i;
  }
  return -1;
}

/** ファイル内の関数名 → 本体。 */
export function functionBodies(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const decl = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(src)) !== null) {
    const brace = bodyBrace(src, decl.lastIndex);
    if (brace >= 0) out.set(m[1]!, balanced(src, brace, '{', '}'));
  }
  const arrow = /(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*(?::[^=\n]+)?=\s*(?:async\s*)?\(/g;
  while ((m = arrow.exec(src)) !== null) {
    const brace = bodyBrace(src, arrow.lastIndex);
    if (brace >= 0 && !out.has(m[1]!)) out.set(m[1]!, balanced(src, brace, '{', '}'));
  }
  return out;
}

/** `start` から呼び出しを辿って `marks` のどれかに届くか (helper 経由も拾う)。 */
export function reaches(start: string, bodies: Map<string, string>, marks: readonly RegExp[]): boolean {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const body = bodies.get(name);
    if (body === undefined) continue;
    if (marks.some((r) => r.test(body))) return true;
    for (const id of body.match(/[A-Za-z0-9_]+/g) ?? []) {
      if (!seen.has(id) && bodies.has(id)) queue.push(id);
    }
  }
  return false;
}

/** `start` から AI の印に届くか。 */
export function reachesAi(start: string, bodies: Map<string, string>): boolean {
  return reaches(start, bodies, AI_MARKS);
}

export interface AiActionHandler {
  readonly service: string;
  readonly action: string;
  /** handler の関数名 (`ACTIONS` の値)。 */
  readonly handler: string;
  /** その client ファイルの関数名 → 本体 (呼び出し先を辿るため)。 */
  readonly bodies: Map<string, string>;
}

/** AI へ出る handler を**実装から**導く (`ACTIONS` の値のうち AI の印に到達する物)。 */
export function aiActionHandlers(): AiActionHandler[] {
  const out: AiActionHandler[] = [];
  for (const f of fs.readdirSync(CLIENTS).filter((n) => n.endsWith('.ts'))) {
    const src = code(fs.readFileSync(path.join(CLIENTS, f), 'utf8'));
    if (!AI_MARKS.some((r) => r.test(src))) continue;
    const at = src.search(/export\s+const\s+ACTIONS\s*:\s*ActionMap\s*=\s*\{/);
    if (at < 0) continue;
    const block = balanced(src, src.indexOf('{', at), '{', '}');
    const bodies = functionBodies(src);
    const service = f.replace(/\.ts$/, '');
    for (const e of block.matchAll(
      /(?:^|\n)\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_]+))\s*(?::\s*([A-Za-z0-9_]+))?\s*,/g,
    )) {
      const action = e[1] ?? e[2] ?? e[3]!;
      const handler = e[4] ?? action;
      if (reachesAi(handler, bodies)) out.push({ service, action, handler, bodies });
    }
  }
  return out;
}

/** AI へ出る `(serviceId, action)` の組。 */
export function aiActionPairs(): Array<readonly [string, string]> {
  return aiActionHandlers().map((h) => [h.service, h.action] as const);
}

/** renderer の .tsx をすべて (画面も部品も)。 */
export function pageFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p);
        continue;
      }
      if (e.name.endsWith('.tsx')) out.push(p);
    }
  };
  walk(RENDERER);
  return out;
}

/** その画面が AI の組を invoke しているか。 */
export function invokesAi(src: string, pairs: ReadonlyArray<readonly [string, string]>): boolean {
  const body = code(src);
  return pairs.some(([s, a]) =>
    new RegExp(`['"]${s}['"]\\s*,\\s*\\n?\\s*['"]${a}['"]`).test(body),
  );
}

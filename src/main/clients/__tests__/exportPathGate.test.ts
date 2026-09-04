import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
 * **payload からパスを受けてファイルを書く関数は、必ず関門を通る。**
 *
 * ## 何から守るのか
 *
 * `exportPaths.isSafeExportPath` は「$HOME の下か」「拡張子は許した物か」を
 * 見る唯一の関門である。これを通さない書き出しは、乗っ取られたレンダラーから
 * `outPath: '~/.ssh/authorized_keys'` のような値で**任意の場所へ書ける**。
 * このリポジトリ自身が脅威モデルに「乗っ取られた renderer」を挙げている。
 *
 * ## なぜこの検査が要るか (2026-08-23)
 *
 * 今在る 8 つの書き出しは**全部正しかった** —— 6 つは各サービスの
 * 薄い包み (`isSafeSvgExportPath` / `isSafeDashboardPath` …) 越しに関門を
 * 通り、2 つ (`saveStocksState` / `saveTeamRadarState`) は payload ではなく
 * **固定パス**へ書く。
 *
 * **だが新しい書き出しを関門へ通す強制が無かった。** 実測:
 *
 * ```ts
 * async function probeExport(ctx: ActionContext) {
 *   const { outPath } = ctx.payload as { outPath?: string };
 *   await fs.writeFile(String(outPath ?? ''), 'probe');   // 関門なし
 * }
 * ```
 *
 * を action として足すと `lint:test-coverage` が「検査が無い」で鳴った ——
 * **鳴った理由が違う**。形だけの検査を 1 つ添えると、
 * **27 のゲートすべてが緑のまま**通った。
 *
 * (「鳴った」ことと「正しい理由で鳴った」ことは別物である。
 *  対照実験では**何が鳴ったか**まで読む。)
 */

/** 関門を呼ぶ薄い包みも含めて受ける。 */
const GUARD = /isSafe\w*Path\s*\(/;
const WRITE = /writeFile\s*\(|createWriteStream\s*\(|appendFile\s*\(/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') sourceFiles(full, out);
      continue;
    }
    if (/\.ts$/.test(name)) out.push(full);
  }
  return out;
}

/** `function 名(...) { … }` を波括弧の対応で切り出す。 */
export function topLevelFunctions(text: string): { name: string; line: number; body: string }[] {
  const lines = text.split('\n');
  const out: { name: string; line: number; body: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = /^(?:export )?(?:async )?function (\w+)/.exec(lines[i]!);
    if (!m) {
      i += 1;
      continue;
    }
    let depth = 0;
    let started = false;
    let j = i;
    while (j < lines.length) {
      const l = lines[j]!;
      depth += (l.match(/\{/g) ?? []).length - (l.match(/\}/g) ?? []).length;
      if (l.includes('{')) started = true;
      if (started && depth <= 0) break;
      j += 1;
    }
    out.push({ name: m[1]!, line: i + 1, body: lines.slice(i, j + 1).join('\n') });
    i = j + 1;
  }
  return out;
}

/** payload からパスを取って書き込むのに関門を呼んでいない関数。 */
export function ungatedWriters(text: string): string[] {
  return topLevelFunctions(text)
    .filter(({ body }) => {
      const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (!WRITE.test(code)) return false;
      if (!code.includes('payload')) return false;
      return !GUARD.test(code);
    })
    .map(({ name, line }) => `${name} (L${line})`);
}

describe('payload からのパスへ書く関数は関門を通る', () => {
  it('main の中に関門を通さない書き出しが無い', () => {
    const offenders: string[] = [];
    for (const f of sourceFiles('src/main')) {
      for (const fn of ungatedWriters(readFileSync(f, 'utf8'))) offenders.push(`${f}: ${fn}`);
    }
    expect(
      offenders,
      'payload のパスへ関門なしで書いています ($HOME 外へ書けます)',
    ).toEqual([]);
  });

  /* 判定そのものの陰性対照 —— 鳴る形と鳴らない形を直接見る。 */
  it.each([
    [
      '関門なし (payload のパスへ書く)',
      `async function f(ctx: A) { const { p } = ctx.payload as B; await fs.writeFile(p, 'x'); }`,
      1,
    ],
    [
      '関門あり',
      `async function f(ctx: A) { const { p } = ctx.payload as B; if (!isSafeExportPath(p, h, '.svg')) throw new Error('no'); await fs.writeFile(p, 'x'); }`,
      0,
    ],
    [
      '薄い包み越しでも通る',
      `async function f(ctx: A) { const { p } = ctx.payload as B; if (!isSafeSvgExportPath(p, h)) throw new Error('no'); await fs.writeFile(p, 'x'); }`,
      0,
    ],
    [
      '固定パスへ書く (payload を読まない)',
      `async function f() { await fs.writeFile(defaultStatePath(), 'x'); }`,
      0,
    ],
    [
      'payload を読むが書かない',
      `async function f(ctx: A) { const { p } = ctx.payload as B; return p; }`,
      0,
    ],
    [
      'コメントの中の関門は数えない',
      `async function f(ctx: A) { /* isSafeExportPath(p, h, '.svg') */ const { p } = ctx.payload as B; await fs.writeFile(p, 'x'); }`,
      1,
    ],
  ])('%s → %i 件', (_label, src, expected) => {
    expect(ungatedWriters(src)).toHaveLength(expected);
  });

  it('負の対照: 走査は実物を読んでいる', () => {
    const files = sourceFiles('src/main');
    expect(files.length).toBeGreaterThan(50);
    const all = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(topLevelFunctions(all).length).toBeGreaterThan(100);
  });
});

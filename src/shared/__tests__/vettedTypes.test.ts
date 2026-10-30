import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readOriginalDir, readOriginalSource } from './originalSource';
import { stripNonCode } from './stripNonCode';
import { externalUrlOrNull } from '../externalUrlGate';
import type { VettedExternalUrl, VettedShellPath } from '../vetted';

/*
 * **型で守る —— 関門を通った値にだけ印が付き、OS の口は印しか受けない** (2026-10-30 · パス 559 · threat: T-220)。
 *
 * 型の守りは 2 つの穴で自分から外せる。どちらも `tsc` には正しいコードに見えるので、
 * ここ (census) が数える:
 *
 * 1. **包みを迂回する** —— `shell.openExternal(x)` / `window.open(x)` を素で呼べば、印の要求は効かない。
 *    素の呼び出しは包み (`main/osSinks.ts` / `renderer/vettedSinks.ts`) の**中だけ**に在る。
 * 2. **印を偽造する** —— `x as VettedExternalUrl` と書けば、関門を通らずに印が付く。
 *    印を作る形 (`as Vetted…` / `is Vetted…` の述語) は**鋳造する関数の中だけ**に在る (両方向の台帳)。
 *
 * そのうえで、**型の守りそのもの**を `@ts-expect-error` の陰性対照で留める (素の string・別の種類の印を
 * 渡すと `tsc` が断ること —— `npm run typecheck` がこのファイルも検査する)。
 *
 * 最後に **精度の台帳 (`SINK_LEDGER`)** —— 印で守っている口と、まだ素の string を受けている口を並べ、
 * `pending` の数は天井を超えてはいけない。新しい口を足すなら印を持たせるか、理由と守り手を書く。
 * 天井は下げるのが正しい向きである (法則 `security-rule-in-the-type`)。
 */

const SRC = join(__dirname, '..', '..');

function walk(dir: string, out: string[]): void {
  for (const name of readOriginalDir(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__' && name !== '__audits__' && name !== 'node_modules') walk(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
}

function shippedFiles(): { rel: string; code: string }[] {
  const files: string[] = [];
  walk(SRC, files);
  return files.sort().map((f) => ({
    rel: relative(SRC, f).split(/[\\/]/).join('/'),
    code: stripNonCode(readOriginalSource(f)),
  }));
}

/**
 * 素の危ない口。どれも素の string を受ける。`writeExportFile` は書き出しのファイル書き込み (パス 560 で足した ——
 * 定義の `function writeExportFile(` は呼び出しではないので数えない)。
 */
export const RAW_SINK = /\bshell\s*\.\s*(openExternal|openPath|showItemInFolder)\s*\(|\bwindow\s*\.\s*open\s*\(|(?<!function\s+)\bwriteExportFile\s*\(/g;

/** 印を作る形 —— キャスト (`as Vetted…` / `as unknown as Vetted…`) と型の述語 (`is Vetted…`)。 */
export const MINT = /\bas\s+(?:unknown\s+as\s+)?Vetted[A-Za-z]*\b|\bis\s+Vetted[A-Za-z]*\b/g;

/** 素の口が在ってよいファイル (包み)。 */
const SINK_WRAPPERS: Readonly<Record<string, number>> = {
  'main/osSinks.ts': 3,
  'renderer/vettedSinks.ts': 1,
  'main/clients/exportSink.ts': 1,
};

/** 印を作ってよいファイルと、そこでの数 (どれも関門の `return` 1 か所)。 */
const MINTERS: Readonly<Record<string, number>> = {
  'shared/externalUrlGate.ts': 1,
  'main/shellOpenGate.ts': 1,
  'main/clients/exportSink.ts': 1,
};

function countBy(re: RegExp): Map<string, number> {
  const out = new Map<string, number>();
  for (const { rel, code } of shippedFiles()) {
    const n = (code.match(re) ?? []).length;
    if (n > 0) out.set(rel, n);
  }
  return out;
}

describe('型で守る: 素の OS の口は包みの中だけ (T-220)', () => {
  const found = countBy(RAW_SINK);

  it('★ 素の shell.* / window.open は包みの外に 1 つも無い (両方向)', () => {
    expect(Object.fromEntries(found), '包みの外に素の OS の口が在る —— 印つきの包みを通すこと').toEqual(SINK_WRAPPERS);
  });

  it('標本: 針は素の呼び出しに当たり、包みの呼び出し・注記・文字列には当たらない', () => {
    const hit = (s: string): number => (stripNonCode(s).match(RAW_SINK) ?? []).length;
    expect(hit('shell.openExternal(url);')).toBe(1);
    expect(hit('shell . openPath (p);')).toBe(1);
    expect(hit('shell.showItemInFolder(p);')).toBe(1);
    expect(hit("window.open(u, '_blank');")).toBe(1);
    expect(hit('await writeExportFile(p, body);')).toBe(1);
    expect(hit('export async function writeExportFile(\n  filePath: string,')).toBe(0);
    expect(hit('await writeExportFileVetted(target, body);')).toBe(0);
    expect(hit('openExternalVetted(url); openWindowVetted(u);')).toBe(0);
    expect(hit('// かつて shell.openExternal(url) と書いていた\n')).toBe(0);
    expect(hit("const s = 'window.open(x)';")).toBe(0);
  });
});

describe('型で守る: 印を作るのは関門の中だけ (T-220)', () => {
  const found = countBy(MINT);

  it('★ as Vetted… / is Vetted… は鋳造する関数の中だけ (両方向)', () => {
    expect(Object.fromEntries(found), '関門の外で印を作っている (偽造) —— 関門を通すこと').toEqual(MINTERS);
  });

  it('★ 鋳造は関門の return 1 か所 (関門の中で、検査を通る前に印を付けていない)', () => {
    const gate = stripNonCode(readOriginalSource(join(SRC, 'shared/externalUrlGate.ts')));
    expect(gate).toMatch(/return\s+href\s+as\s+VettedExternalUrl;/);
    const shell = stripNonCode(readOriginalSource(join(SRC, 'main/shellOpenGate.ts')));
    expect(shell).toMatch(/return\s+real\s+as\s+VettedShellPath;/);
    const exp = stripNonCode(readOriginalSource(join(SRC, 'main/clients/exportSink.ts')));
    expect(exp).toMatch(/return\s+filePath\s+as\s+VettedExportPath;/);
  });

  it('標本: 針はキャストと述語に当たり、型の import・引数の注釈には当たらない', () => {
    const hit = (s: string): number => (stripNonCode(s).match(MINT) ?? []).length;
    expect(hit('const u = x as VettedExternalUrl;')).toBe(1);
    expect(hit('const u = x as unknown as VettedShellPath;')).toBe(1);
    expect(hit("const u = x as Vetted<'external-url'>;")).toBe(1);
    expect(hit('function f(v: string): v is VettedExternalUrl { return true; }')).toBe(1);
    expect(hit("import type { VettedExternalUrl } from './vetted';")).toBe(0);
    expect(hit('function g(u: VettedExternalUrl): void {}')).toBe(0);
  });
});

/*
 * **型の陰性対照。** この関数は呼ばれない —— `npm run typecheck` が中身を検査するためだけに在る。
 * `@ts-expect-error` は「次の行は型の誤りである」と宣言するので、誤りでなくなった (= 型の守りが
 * 外れた) 日に `tsc` が「不要な @ts-expect-error」で落ちる。main の口の対照は
 * `src/main/__tests__/osSinks.test.ts`、ブラウザ版の口は `src/renderer/__tests__/vettedSinks.test.ts`。
 */
function compileTimeControls(raw: string, path: VettedShellPath, url: VettedExternalUrl): void {
  const takesUrl = (u: VettedExternalUrl): string => u;
  const takesPath = (p: VettedShellPath): string => p;
  // @ts-expect-error 素の string は印つきの URL ではない
  takesUrl(raw);
  // @ts-expect-error 素の string は印つきのパスではない
  takesPath(raw);
  // @ts-expect-error パスの印は URL の印ではない (種類を取り違えない)
  takesUrl(path);
  // @ts-expect-error URL の印はパスの印ではない
  takesPath(url);
  // 逆向きは開いている —— 印つきの値は素の string を受ける所 (ログ・要約) へそのまま渡せる。
  const asText: string = url;
  void asText;
  // 関門を通った値は印を持つ (null を除けば受け手へ渡せる)。
  const gated = externalUrlOrNull(raw);
  if (gated !== null) takesUrl(gated);
}
void compileTimeControls;

describe('型で守る: 実行時の費用は 0 (T-220)', () => {
  it('印は値に何も足さない —— 関門の戻り値は素の文字列と同じ', () => {
    const v = externalUrlOrNull('https://example.com/a');
    expect(typeof v).toBe('string');
    expect(v).toBe('https://example.com/a');
    expect(Object.getOwnPropertySymbols(Object(v))).toEqual([]);
  });

  it('vetted.ts は型だけ (実行時に残る export が無い)', () => {
    const code = stripNonCode(readOriginalSource(join(SRC, 'shared/vetted.ts')));
    const runtime = code.match(/^\s*export\s+(?!type\b|interface\b|declare\b)\w+/gm) ?? [];
    expect(runtime, '実行時に残る export がある').toEqual([]);
    expect(code).toMatch(/declare\s+const\s+VETTED:\s*unique\s+symbol/);
  });
});

/*
 * **精度の台帳** —— 「信用できない値が届くと害になる口」を種類ごとに並べる。
 *
 * `typed` は印つきの型だけを受ける (コンパイラが守る)。`pending` はまだ素の string を受け、
 * 別の守り (census / 実行時の門) に頼っている。**pending の数は天井を超えてはいけない** ——
 * 型で守れる口を足すなら `typed` に、理由が在って型にできないなら守り手を書いて `pending` に
 * (天井を上げる差分はレビューに出る)。天井は下げるのが正しい向きである。
 */
interface SinkRow {
  readonly sink: string;
  readonly state: 'typed' | 'pending';
  /** typed: 印を受ける包みのファイル。pending: いま守っている物 (検査・関数・ゲート) のファイル。どちらもリポジトリからの道。 */
  readonly by: string;
  readonly why: string;
}

export const SINK_LEDGER: readonly SinkRow[] = [
  { sink: 'shell.openExternal', state: 'typed', by: 'src/main/osSinks.ts', why: 'VettedExternalUrl だけを受ける (openExternalVetted)。IPC・窓の扉・OAuth の 3 か所が通る。' },
  { sink: 'shell.openPath', state: 'typed', by: 'src/main/osSinks.ts', why: 'VettedShellPath だけを受ける (openPathVetted)。Windows では関連付け次第で実行される口。' },
  { sink: 'shell.showItemInFolder', state: 'typed', by: 'src/main/osSinks.ts', why: 'VettedShellPath だけを受ける (showItemInFolderVetted)。' },
  { sink: 'window.open', state: 'typed', by: 'src/renderer/vettedSinks.ts', why: 'VettedExternalUrl だけを受ける (openWindowVetted)。noopener,noreferrer を包みが固定する。' },
  { sink: 'writeExportFile', state: 'typed', by: 'src/main/clients/exportSink.ts', why: 'VettedExportPath だけを行き先に受ける (writeExportFileVetted · パス 560 で Mamori へ移した)。書き手 4 本 (templates / teamradar / stocks / business) は exportTargetOrNull の戻り値を渡す。実行時の閉じ込めは writeExportFile がそのまま掛ける。' },
  {
    sink: '外部リンクの <a href>',
    state: 'pending',
    by: 'src/shared/__tests__/followableUrlCensus.test.ts',
    why: 'JSX の属性は React の型 (string) を受け、ここでは狭められない。href に載せる値が externalUrlOrNull の戻り値であることは census が両方向で数える。',
  },
  {
    sink: '外部画像の <img src>',
    state: 'pending',
    by: 'src/shared/imageUrlGate.ts',
    why: 'JSX の属性は React の型 (string) を受ける。値は safeImageSrc / safeRemoteImageSrc を通る (DataList / StatusBar)。',
  },
  {
    sink: '網の送り先 (fetch の URL)',
    state: 'pending',
    by: 'scripts/lint-network-targets.cjs',
    why: '送り先は shared/api/*.ts のリテラルと、関門 (proxyEndpoint / aiEndpoint / ollama) を通る設定値に分かれ、口が 1 つではない。送り先が変数で決まる通信は lint:network-targets の台帳が持つ。',
  },
];

/** pending の天井。**下げるのが正しい向き** —— 型で守る口が増えたら下げる。 */
const PENDING_CEILING = 3;

describe('型で守る: 精度の台帳 (ratchet · T-220)', () => {
  it('★ 印で守る口は台帳の typed と一致する (包みの数と両方向)', () => {
    const typed = SINK_LEDGER.filter((r) => r.state === 'typed');
    expect(typed.map((r) => r.sink).sort()).toEqual(['shell.openExternal', 'shell.openPath', 'shell.showItemInFolder', 'window.open', 'writeExportFile']);
    const perWrapper = new Map<string, number>();
    for (const r of typed) perWrapper.set(r.by.replace(/^src\//, ''), (perWrapper.get(r.by.replace(/^src\//, '')) ?? 0) + 1);
    expect(Object.fromEntries(perWrapper)).toEqual(SINK_WRAPPERS);
  });

  it('★ pending は天井を超えない (精度を下げる変更を鳴らす)', () => {
    const pending = SINK_LEDGER.filter((r) => r.state === 'pending');
    expect(pending.length, 'pending が増えた —— 新しい口は印で守るか、天井を上げる理由をレビューに出す').toBeLessThanOrEqual(PENDING_CEILING);
  });

  it('どの行も守り手のファイルが実在し、理由が空でない', () => {
    for (const r of SINK_LEDGER) {
      const p = join(SRC, '..', r.by);
      expect(existsSync(p), `${r.sink}: 守り手 ${r.by} が無い`).toBe(true);
      expect(r.why.length, `${r.sink}: 理由が短すぎる`).toBeGreaterThan(20);
      expect(r.why, `${r.sink}: 保留の決まり文句`).not.toMatch(/^(同上|TBD|未定|あとで)/);
    }
  });

  it('標本: 保留の決まり文句の針は当たる', () => {
    expect('同上。').toMatch(/^(同上|TBD|未定|あとで)/);
    expect('TBD').toMatch(/^(同上|TBD|未定|あとで)/);
  });
});

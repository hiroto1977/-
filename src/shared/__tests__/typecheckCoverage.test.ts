import { describe, expect, it } from 'vitest';
import { join, relative, sep } from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

/*
 * **TypeScript のファイルが 1 つでも `npm run typecheck` の外に居てはいけない。** (2026-09-15)
 *
 * `eslint.config.js` の冒頭が自分でこう宣言している:
 *
 * ```
 *   // Strict TypeScript is the primary correctness gate (npm run typecheck).
 * ```
 *
 * つまり eslint は型を見ない側に寄せてあり (`parserOptions.project` も
 * `projectService` も無いので typescript-eslint は型情報なしで走る)、型の誤りを
 * 捕まえる唯一の網が `tsc -b` である。その網は `tsconfig.json` の references から
 * 辿れる各 project の `include` が覆う範囲しか見ない。
 *
 * ## 実測 (2026-09-15・パス 278)
 *
 * 覆われていないファイルが **4 つ**在った:
 *
 * | ファイル | 中身 |
 * | `src/__tests__/dualBuildActionSurface.test.ts` | 検査 9 件。**ブラウザ版がデスクトップ版の許可表に無い操作を実行できてはいけない**という安全の不変条件 |
 * | `src/__tests__/responseMockFidelity.test.ts`   | 検査 9 件。手作りの `Response` が本物にありえない形をしていないか |
 * | `vitest.config.ts`                            | 実物の electron を読まないための alias (CI の取得依存を切った回の成果物)・`retry`・`include` |
 * | `scripts/generate-dashboard.ts`               | `src/main/clients/stocks` を読む開発用の一本道 |
 *
 * `src/**` の下に在るのに覆われていなかったのは、`include` が
 * `src/renderer` / `src/shared` / `src/main` / `src/preload` と**枝を名指し**しており、
 * `src/__tests__` はそのどれの下でもないため。`vitest.config.ts` は隣の
 * `vite.config.ts` だけが名指しされていた (1 字違いで片方だけ)。
 *
 * 対照 (4 ファイルすべてで鳴った): `const x: number = 'not a number'` を足しても
 * `tsc -b` の誤りは **0 件**。include を広げた後は 4 ファイルとも **1 件**。
 *
 * ## なぜ**走っている検査**が覆われていないと困るか
 *
 * vitest は esbuild で型を**剥がす**だけなので、型の誤りはテストの中では
 * 実行時まで現れない。存在しない欄を読めば `undefined` になり、
 * `expect(x.typo).toBeUndefined()` の形は**通る**。
 * つまり「無いことの検査」がここで空になっても誰も気付かない ——
 * 原文を読む検査が sandbox の中で空になる穴 (`originalSource.ts` の冒頭) と
 * 同じ形で、こちらは型の側の穴である。
 */

/** 走査から外す枝 (生成物・依存・計測の作業場)。`eslint.config.js` の ignores と同じ考え。 */
const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'dist-electron',
  '.git',
  '.stryker-tmp',
  'coverage',
  'reports',
  'tmp-screenshots',
  'knowledge-vault',
]);

const REPO_ROOT = join(__dirname, '..', '..', '..');

/**
 * tsconfig を読む。`//` だけの行は落とす (tsconfig は JSON with comments を許す)。
 * 文字列の中の `//` を壊さないよう、**行頭が `//` の行だけ**を落とす。
 */
function readTsconfig(relPath: string): { include?: string[]; exclude?: string[]; references?: { path: string }[] } {
  const raw = readOriginalSource(join(REPO_ROOT, relPath));
  // tsconfig は JSONC。**共有の字句解析器で落とす** —— JSONC の注記と文字列は
  // JS のそれの真部分集合 (正規表現リテラルもテンプレートも単引用符も無く、
  // 文字列の外の `/` は注記の始まりしかない) なので、この道具で正しく読める。
  // 行頭が `//` かで見る形だと `"strict": true // 注記` のような**行末の注記**で
  // `JSON.parse` が落ち、素朴なブロック注記の正規表現だと `"src/**\/*.ts"` の
  // `/**` を注記の始まりとして食う (パス 462 の当の欠陥)。
  return JSON.parse(stripComments(raw)) as { include?: string[]; exclude?: string[]; references?: { path: string }[] };
}

/** 覆っている範囲。枝 (`src/renderer`) と 1 ファイル (`vite.config.ts`) の両方が来る。 */
function includePaths(): string[] {
  const root = readTsconfig('tsconfig.json');
  const refs = root.references ?? [];
  expect(refs.length, 'tsconfig.json の references が読めていない (走査の死)').toBeGreaterThanOrEqual(2);

  const paths: string[] = [];
  for (const ref of refs) {
    const relPath = ref.path.replace(/^\.\//, '');
    const project = readTsconfig(relPath);
    // `exclude` を持つ project が現れたら、この走査は正しくなくなる。
    // 黙って甘くなるより、教えてくれと言って落ちるほうが良い。
    expect(project.exclude, `${relPath} が exclude を持った —— この検査に教えること`).toBeUndefined();
    const include = project.include ?? [];
    expect(include.length, `${relPath} の include が空 (走査の死)`).toBeGreaterThan(0);
    paths.push(...include);
  }
  return paths;
}

/** repo 相対の道 (POSIX 区切り) が、覆う範囲のどれかに入るか。 */
function coveredBy(relFile: string, includes: readonly string[]): boolean {
  return includes.some((inc) => relFile === inc || relFile.startsWith(`${inc}/`));
}

/** repo の中の `.ts` / `.tsx` を全部数える。 */
function allTypeScriptFiles(): string[] {
  const found: string[] = [];
  const walk = (absDir: string): void => {
    for (const entry of readOriginalDirEntries(absDir)) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(join(absDir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.tsx?$/.test(entry.name)) continue;
      found.push(relative(REPO_ROOT, join(absDir, entry.name)).split(sep).join('/'));
    }
  };
  walk(REPO_ROOT);
  return found;
}

describe('typecheck が覆う範囲', () => {
  it('★ .ts / .tsx はすべて、どれかの tsconfig project の include に入る', () => {
    const includes = includePaths();
    const files = allTypeScriptFiles();

    // 走査の生死。実測 1,252 件 (2026-09-15)。読めなくなったら「問題なし」に見えてはいけない。
    expect(files.length, '走査が死んでいる (.ts が見つからない)').toBeGreaterThanOrEqual(1000);

    const uncovered = files.filter((f) => !coveredBy(f, includes));
    expect(uncovered, `typecheck の外に居る TypeScript:\n  ${uncovered.join('\n  ')}`).toEqual([]);
  });

  it('★ パス 278 で覆った 4 ファイルは、今も覆われている', () => {
    const includes = includePaths();
    for (const f of [
      'src/__tests__/dualBuildActionSurface.test.ts',
      'src/__tests__/responseMockFidelity.test.ts',
      'vitest.config.ts',
      'scripts/generate-dashboard.ts',
    ]) {
      expect(coveredBy(f, includes), `${f} が typecheck の外に戻った`).toBe(true);
    }
  });

  it('判定は覆われていない道に対して false を返す (空の検査になっていない)', () => {
    const includes = includePaths();
    // 標本: 実在しないが「在りうる置き場」。どれも include のどれの下でもない。
    expect(coveredBy('src/somewhere-new/thing.ts', includes)).toBe(false);
    expect(coveredBy('tools/build.ts', includes)).toBe(false);
    expect(coveredBy('e2e/spec.ts', includes)).toBe(false);
    // 接頭辞が偶然一致するだけの道を覆ったと言ってはいけない
    // (`src/shared` が `src/shared-extra/x.ts` を覆う、という誤り)。
    expect(coveredBy('src/shared-extra/x.ts', includes)).toBe(false);
    // 対照: 覆われている物は true
    expect(coveredBy('src/shared/num.ts', includes)).toBe(true);
    expect(coveredBy('vite.config.ts', includes)).toBe(true);
  });

  /*
   * パス 278 は CLAUDE.md の `typecheck` の説明に **include の中身を写した**。
   * 写しは腐る —— それがこのパスで直している欠陥の家系そのものなので、
   * 写した瞬間に検算を付ける。両方向: tsconfig に在るのに書かれていなければ落ち、
   * 書かれているのに tsconfig に無ければ落ちる。
   */
  it('★ CLAUDE.md が写した include の一覧は、実物と一致する (両方向)', () => {
    const includes = includePaths();
    const doc = readOriginalSource(join(REPO_ROOT, 'CLAUDE.md'));
    // `#   ` の行頭を落として 1 本の文字列にする (説明は折り返されている)。
    const flat = doc
      .split('\n')
      .map((line) => line.replace(/^\s*#\s?/, ''))
      .join(' ');

    // 区切りは `・` —— 道の中には現れない字なので、切り方があいまいにならない
    // (最初は ` / ` で書いて `src/renderer` を 2 語に割ってしまい、繋ぎ直す細工が要った。
    //  細工の要る走査は空になりやすいので、書く側の区切りを変えた)。
    const appList = /app = (.+?)、/.exec(flat);
    const nodeList = /node = (.+?)。/.exec(flat);
    expect(appList, 'CLAUDE.md の `app = …` が読めない (この検査が空になっている)').not.toBeNull();
    expect(nodeList, 'CLAUDE.md の `node = …` が読めない (この検査が空になっている)').not.toBeNull();

    const written = [...(appList?.[1] ?? '').split('・'), ...(nodeList?.[1] ?? '').split('・')]
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // 走査の生死: 読めた語が include の数より少なければ、切り方が壊れている。
    expect(written.length, 'CLAUDE.md から読めた include が少なすぎる (切り方が壊れた)').toBe(
      includes.length,
    );
    expect(new Set(written), 'CLAUDE.md の写しと tsconfig の include が食い違っている').toEqual(
      new Set(includes),
    );
  });

  it('走査は実物のファイルを拾う (母集団が架空でない)', () => {
    const files = allTypeScriptFiles();
    // 実在を 1 つずつ確かめる (走査が名前を組み立てているだけではない)。
    expect(files).toContain('src/shared/num.ts');
    expect(files).toContain('vitest.config.ts');
    expect(files).toContain('src/__tests__/dualBuildActionSurface.test.ts');
    // 生成物と依存は入っていない
    expect(files.some((f) => f.startsWith('node_modules/'))).toBe(false);
    expect(files.some((f) => f.startsWith('dist/'))).toBe(false);
  });
});

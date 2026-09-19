/**
 * **画面がデスクトップのパスを名乗らない** (2026-09-12 · パス 161)。
 *
 * 5 つの画面が `~/.local/business-hub/...` / `~/.claude/skills` を**無条件に**
 * 刷っており、ブラウザ版 (単一 HTML) でも同じ文字列が出ていた。ブラウザ版は
 * そこへ 1 バイトも書かず、`~/.claude/skills` は読めない —— **在りもしない場所を
 * 案内する**形で、パス 157 (できない指示) / 158 (効かない操作) と同じ家系である。
 *
 * 直したあとの規則: **デスクトップのパスを持つのは `shared/buildDestinations.ts`
 * の `DESKTOP_PATHS` だけ。** renderer の実装 (コメントを除く) に生のパスが
 * 再び現れたら鳴る —— 次に画面を書く人が何も知らずに書いても、そこで止まる。
 *
 * 台帳は**双方向**に見る (載っているのに現物が無い項目も落とす)。走査が死んだら
 * 落ちるように、fixture に対する対照を同じ走査で回す。
 */
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { DESKTOP_PATHS } from '../../shared/buildDestinations';

const REPO = join(__dirname, '..', '..', '..');

/**
 * デスクトップのパスに見える書き方。`~/.local/…` と `~/.claude/…` の 2 系統で、
 * `DESKTOP_PATHS` が持つ実物もこの 2 つの接頭辞に収まる (下の検査で確かめる)。
 */
const PATH_RE = /~\/\.(?:local|claude)\//;

/**
 * コメントを落とす。`/* … *\/` (JSX の `{/* … *\/}` を含む) と行末までの `//`。
 * **文字列の中の `//` まで落ちるが、この走査には害が無い** —— 落とし過ぎると
 * 見逃す方向なので、下の対照で「実物の書き方が拾えること」を確かめる。
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

interface Site {
  readonly file: string;
  readonly line: number;
}

function findSites(files: readonly string[]): Site[] {
  const found: Site[] = [];
  for (const abs of files) {
    const text = stripComments(readOriginalSource(abs));
    text.split('\n').forEach((line, i) => {
      if (PATH_RE.test(line)) {
        found.push({ file: relative(REPO, abs).split('\\').join('/'), line: i + 1 });
      }
    });
  }
  return found;
}

function rendererSources(): string[] {
  return globSync(['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'], {
    cwd: REPO,
    absolute: true,
    ignore: ['**/__tests__/**'],
  });
}

/**
 * 実行形態に依る文を出してよい場所の台帳。**空である**のが正しい姿 ——
 * 生のパスが要るなら `DESKTOP_PATHS` に足して参照する。
 */
const LEDGER: Record<string, string> = {};

const SITES = findSites(rendererSources());

describe('画面はデスクトップのパスを名乗らない (パス 161)', () => {
  it('★ renderer の実装に生のデスクトップパスは無い', () => {
    const undeclared = SITES.filter((s) => !(s.file in LEDGER)).map((s) => `${s.file}:${s.line}`);
    expect(
      undeclared,
      'デスクトップのパスは shared/buildDestinations.ts の DESKTOP_PATHS に置き、'
        + '実行形態で文面を変えること (exportDestinationNote / persistDestinationNote)',
    ).toEqual([]);
  });

  it('★ 台帳に載っているのに現物が無い項目は無い (腐った台帳を許さない)', () => {
    const withSites = new Set(SITES.map((s) => s.file));
    const stale = Object.keys(LEDGER).filter((f) => !withSites.has(f));
    expect(stale).toEqual([]);
  });

  it('★ 対照: 生のパスを書いた標本を混ぜると鳴る', () => {
    // 規則が**実際に当たる**ことを、同じ走査で確かめる (綴り違いで黙る検査にしない)。
    const fake = findSites([join(__dirname, 'fixtures', 'desktopPathClaim.txt')]);
    expect(fake).toHaveLength(1);
  });

  it('★ 対照: コメントの中のパスは拾わない (落とし過ぎ / 拾い過ぎの両方を見る)', () => {
    const stripped = stripComments('  // デスクトップ版は ~/.local/business-hub/x へ\n  const a = 1;\n');
    expect(PATH_RE.test(stripped)).toBe(false);
    // JSX のコメントも同じ (画面の注記は `{/* … */}` で書く)。
    expect(PATH_RE.test(stripComments('{/* ~/.claude/skills を読む */}'))).toBe(false);
    // だが実装行は落ちない。
    expect(PATH_RE.test(stripComments("const p = '~/.local/business-hub/data/x';"))).toBe(true);
  });

  it('★ DESKTOP_PATHS の全項目が、走査が見る形をしている', () => {
    // 台帳の綴りと走査の正規表現がずれたら、規則はどの行にも当たらなくなる。
    const values = Object.values(DESKTOP_PATHS);
    expect(values.length).toBeGreaterThanOrEqual(6);
    for (const v of values) expect(PATH_RE.test(v), v).toBe(true);
  });

  it('走査が生きている (renderer の実装ファイルを 100 本以上見ている)', () => {
    expect(rendererSources().length).toBeGreaterThanOrEqual(100);
  });
});

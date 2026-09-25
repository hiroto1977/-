/**
 * **群ごとの床 —— 「一部だけ死んだ走査」を見る** (2026-09-25 · パス 469)。
 *
 * ## 何を測ったのか
 *
 * パス 468 は「母集団を**空**にすると落ちるか」を 37 ゲートについて振る舞いで測り、
 * 5 本に床を足して 33 / 33 が鳴るようにした。**ところが床は「0 件」にしか当たらない。**
 * 合計の床は実測の 10〜60% に置かれているので、走査が**一部だけ**死んでも素通りする。
 *
 * 実測 (2026-09-25 · 隔離した写しの上で `readdirSync` からファイルの項目を落とす):
 *
 * | 落とした群 | 直す前 |
 * | --- | --- |
 * | `.tsx` 108 件 (= 画面そのもの) | **`lint:network-targets` / `lint:url-encoding` / `lint:regex` / `lint:imports` / `lint:charset` が ✅ exit 0** |
 * | 根 `scripts/` 102 件 | **`lint:regex` / `lint:charset` / `lint:sample-data` が ✅** |
 * | 根 `docs/` 61 件 | **`lint:charset` が ✅** |
 * | 根 `orchestration/` | **`lint:regex` / `lint:sample-data` が ✅** |
 *
 * ★ **合計の床が捕まえたのは 13 のうち 2 本だけ** (`lint:parameter-prose` 170 < 200 /
 * `lint:zero-fold` 228 < 240) で、しかもどちらも**床がたまたま実測のすぐ下に在った**ため。
 * 残りで鳴った 4 本は台帳の双方向・生成物の一致という**別の機構が偶然**捕まえた物である。
 *
 * ★★ **`lint:charset` は「宣言」を検めていた** —— 2026-09-14 (パス 255) から
 * 「`SCAN_EXTS` が `.sh .yml .html .css .js .svg` を**含むこと**」を自己テストで要求して
 * いるが、それは宣言に綴りが在ることであって **1 件でも読んだこと**ではない。走査の側が
 * 拡張子を落とし、宣言はそのままという形は素通りする (法則 `mention-vs-declaration` の、
 * ゲート自身の中での現れ)。
 *
 * ## 直しの形 (なぜ「実測の N%」にしないか)
 *
 * 実測に張り付けた床は**直した日に落ちる門**になる (パス 378)。だから割合ではなく
 * **「宣言した群はどれも 1 件以上」**を要求する —— 走査が構造的に壊れる形
 * (拡張子のふるいが 1 つ落ちる / 根が 1 つ歩かれない) はこれで必ず鳴り、母集団が
 * 増えても減っても床は動かない。**正当に 0 になる群は宣言しない** (パス 467)。
 *
 * ## ここが見る物
 *
 * 道具 (`npm run audit:gate-floors -- --partial`) は CI では走らせない。ここが見るのは
 * **台帳の形**である:
 *
 *   1. 共有の判定の振る舞い (欠けた群を名指しする・空の宣言を受けない)
 *   2. **宣言しているゲートと道具の `PARTIAL_GATES` が双方向に一致する**
 *   3. 宣言したゲートは**実際に共有の判定を呼ぶ** (注記の中の言及では満たされない)
 *   4. 床が実測に張り付いていない (群ごとに 1 件あれば通る)
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

const REPO = join(__dirname, '..', '..', '..');
const req = createRequire(import.meta.url);

interface Groups { readonly exts?: readonly string[]; readonly roots?: readonly string[] }
const floor = req('../../../scripts/lib/population-floor.cjs') as {
  countByGroup: (files: readonly string[], repoRoot: string) => { exts: Map<string, number>; roots: Map<string, number> };
  groupFloorProblems: (files: readonly string[], required: Groups, repoRoot: string) => string[];
  reportGroupFloor: (files: readonly string[], required: Groups, repoRoot: string, label: string) => number;
};
const tool = req('../../../scripts/audit-gate-floors.cjs') as {
  RECIPES: readonly { gate: string; cmd: string }[];
  PARTIAL_GATES: readonly string[];
  scriptOf: (cmd: string) => string;
  declaredGroups: (script: string) => { mode: string; arg: string }[];
  PREAMBLE_SRC: string;
  PREAMBLE_MARK: string;
};

/** ゲート本体が `REQUIRED_GROUPS` を export しているか (道具と同じ読み方)。 */
function declares(script: string): Groups | null {
  const mod = req(`../../../${script}`) as { REQUIRED_GROUPS?: Groups };
  const g = mod.REQUIRED_GROUPS;
  if (!g) return null;
  return (g.exts ?? []).length + (g.roots ?? []).length > 0 ? g : null;
}

describe('群ごとの床 (パス 469)', () => {
  const FILES = ['src/a.ts', 'src/b.tsx', 'scripts/c.cjs', 'docs/d.md'];

  it('★ 揃っていれば何も言わない', () => {
    expect(floor.groupFloorProblems(FILES, { exts: ['.ts', '.tsx', '.cjs'], roots: ['src', 'scripts'] }, REPO))
      .toEqual([]);
  });

  it('★ 欠けた拡張子を名指しする', () => {
    const problems = floor.groupFloorProblems(FILES, { exts: ['.ts', '.svg'] }, REPO);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('.svg');
    expect(problems[0], '読めた群を添えて落ちる (落ちた人がその場で原因を読める)').toContain('.ts:1');
  });

  it('★ 欠けた根を名指しする', () => {
    const problems = floor.groupFloorProblems(FILES, { roots: ['src', 'assets'] }, REPO);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('assets');
  });

  it('★ 宣言が空なら「呼ぶ側の誤り」として断る (0 件を「問題なし」と読まない)', () => {
    const problems = floor.groupFloorProblems(FILES, {}, REPO);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('REQUIRED_GROUPS');
  });

  it('★ 床は実測に張り付いていない —— 群ごとに 1 件あれば通る', () => {
    // 実測は .ts 1,344 件だが、1 件でも通る。割合の床にすると「直した日に落ちる門」に
    // なる (パス 378 の tickSensitivityLedger が実際にそうなった)。
    const one = ['src/only.ts', 'scripts/only.cjs'];
    expect(floor.groupFloorProblems(one, { exts: ['.ts', '.cjs'], roots: ['src', 'scripts'] }, REPO)).toEqual([]);
  });

  it('★ 大文字の拡張子も同じ群として数える', () => {
    expect(floor.countByGroup(['src/A.TS'], REPO).exts.get('.ts')).toBe(1);
  });
});

describe('宣言と道具の台帳 (双方向)', () => {
  const gatesDeclaring = tool.RECIPES
    .filter((r) => {
      try { return declares(tool.scriptOf(r.cmd)) !== null; } catch { return false; }
    })
    .map((r) => r.gate)
    .sort();

  it('★ 走査が空でない (針が死んでいたら 0 件で自明に通る)', () => {
    expect(gatesDeclaring.length, 'REQUIRED_GROUPS を宣言するゲートが 1 本も見つからない')
      .toBeGreaterThanOrEqual(6);
  });

  it('★ 宣言しているゲートと PARTIAL_GATES がちょうど一致する', () => {
    expect(gatesDeclaring, '道具の台帳と実物がずれている').toEqual([...tool.PARTIAL_GATES].sort());
  });

  it('★ 宣言したゲートは共有の判定を実際に呼ぶ (注記の中の言及では満たされない)', () => {
    for (const gate of tool.PARTIAL_GATES) {
      const recipe = tool.RECIPES.find((r) => r.gate === gate);
      expect(recipe, `${gate} が RECIPES にない`).toBeTruthy();
      const script = tool.scriptOf(recipe!.cmd);
      const code = stripComments(readOriginalSource(join(REPO, script)));
      expect(code, `${gate} が lib/population-floor を読んでいない`).toContain('population-floor.cjs');
      expect(
        /reportGroupFloor\(|groupFloorProblems\(/.test(code),
        `${gate} が共有の判定を呼んでいない`,
      ).toBe(true);
    }
  });

  it('★ 針が的に当たる標本 —— 注記の中だけの言及は数えない', () => {
    const onlyComment = stripComments('// reportGroupFloor(files, X, Y)\nconst a = 1;\n');
    expect(/reportGroupFloor\(/.test(onlyComment)).toBe(false);
    const real = stripComments('reportGroupFloor(files, X, Y);\n');
    expect(/reportGroupFloor\(/.test(real)).toBe(true);
  });

  it('★ 宣言の形 (拡張子は . で始まり、重複しない)', () => {
    for (const gate of tool.PARTIAL_GATES) {
      const script = tool.scriptOf(tool.RECIPES.find((r) => r.gate === gate)!.cmd);
      const g = declares(script)!;
      const exts = g.exts ?? [];
      const roots = g.roots ?? [];
      expect(exts.every((e) => e.startsWith('.')), `${gate}: 拡張子は . で始まる`).toBe(true);
      expect(roots.every((r) => r.length > 0 && !r.includes('/')), `${gate}: 根は 1 階層`).toBe(true);
      expect(new Set(exts).size, `${gate}: 拡張子が重複`).toBe(exts.length);
      expect(new Set(roots).size, `${gate}: 根が重複`).toBe(roots.length);
    }
  });

  it('★ 道具が落とす群は、ゲートの宣言そのもの (写しを持たない)', () => {
    const script = tool.scriptOf(tool.RECIPES.find((r) => r.gate === 'lint:url-encoding')!.cmd);
    const groups = tool.declaredGroups(script);
    const g = declares(script)!;
    expect(groups.map((x) => x.arg).sort())
      .toEqual([...(g.exts ?? []), ...(g.roots ?? [])].sort());
  });
});

describe('lint:charset の宣言 (受け皿は床の下に置く)', () => {
  const charset = req('../../../scripts/lint-charset.cjs') as {
    SCAN_EXTS: Set<string>;
    SCAN_DIRS: readonly string[];
    OPTIONAL_EXTS: Set<string>;
    REQUIRED_GROUPS: Groups;
  };

  it('★ 要求する拡張子は「宣言 − 受け皿」ちょうど', () => {
    const want = [...charset.SCAN_EXTS].filter((e) => !charset.OPTIONAL_EXTS.has(e));
    expect([...(charset.REQUIRED_GROUPS.exts ?? [])]).toEqual(want);
  });

  it('★ 受け皿は宣言の部分集合 (実在しない拡張子を外せない)', () => {
    for (const e of charset.OPTIONAL_EXTS) {
      expect(charset.SCAN_EXTS.has(e), `${e} は SCAN_EXTS にない`).toBe(true);
    }
  });

  it('★ 根は宣言そのもの', () => {
    expect([...(charset.REQUIRED_GROUPS.roots ?? [])]).toEqual([...charset.SCAN_DIRS]);
  });
});

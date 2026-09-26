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
  ENFORCEMENT: Record<string, { by: readonly string[]; why: string }>;
  THINNING: Record<string, { expect: string; why: string }>;
  MECHANISMS: readonly string[];
  thinnableGates: () => string[];
  TRANSPARENCY: Record<string, { visible: string; why: string }>;
  partialVerdict: (x: { gate: string; report: { dropped: number } | null; status: number }) => string;
  preambleInsertAt: (lines: readonly string[]) => number;
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

  /*
   * **宣言した群を守っているのはどの機構か** (パス 470 で 2 つに分けた)。
   *
   * パス 469 はここで「共有の判定 (`reportGroupFloor`) を呼ぶこと」を全ゲートに要求した。
   * ところが `git ls-files` の 2 本では**群ごとの床が何も足さない** ——
   * `lint:shell` の母集団は「1 つの拡張子 × 1 つの根」なので、群が消える形は合計の床が
   * そのまま捕まえる。弱くなっていない所に床を足さないのがこのリポジトリの判断なので、
   * 機構を台帳 (`ENFORCEMENT`) で名乗らせ、**名乗った機構が実際に在ること**を見る。
   *
   * `REQUIRED_GROUPS` は「この群が消えたらこのゲートは鳴らなければならない」という
   * **振る舞いの宣言**で、機構の宣言ではない。
   */
  it('★ 宣言したゲートは、名乗った機構を実際に呼ぶ (注記の中の言及では満たされない)', () => {
    for (const gate of tool.PARTIAL_GATES) {
      const recipe = tool.RECIPES.find((r) => r.gate === gate);
      expect(recipe, `${gate} が RECIPES にない`).toBeTruthy();
      const script = tool.scriptOf(recipe!.cmd);
      const code = stripComments(readOriginalSource(join(REPO, script)));
      const how = tool.ENFORCEMENT[gate];
      expect(how, `${gate} が ENFORCEMENT にない`).toBeTruthy();
      expect(how!.by.length, `${gate} が機構を 1 つも名乗っていない`).toBeGreaterThan(0);
      for (const by of how!.by) {
        if (by === 'shared-floor') {
          expect(code, `${gate} が lib/population-floor を読んでいない`).toContain('population-floor.cjs');
          expect(
            /reportGroupFloor\(|groupFloorProblems\(/.test(code),
            `${gate} が共有の判定を呼んでいない`,
          ).toBe(true);
        } else if (by === 'tracked-cross-check') {
          /*
           * **追跡ファイルの一覧との照合** (パス 471)。床は「0 件」か「1 群まるごと」に
           * しか当たらないので、一様に間引かれた走査を見るにはこれが要る。
           * 読んでいるだけでは足りない —— **呼んでいること**まで見る。
           */
          expect(code, `${gate} が lib/tracked-cross-check を読んでいない`).toContain('tracked-cross-check.cjs');
          expect(
            /reportTrackedCrossCheck\(|trackedCrossCheck\(/.test(code),
            `${gate} が追跡ファイルとの照合を呼んでいない`,
          ).toBe(true);
          // 条件はゲート自身が宣言する (道具の側に条件を並べると 2 つ目の台帳が古びる)。
          const mod = req(`../../../${script}`) as { CROSS_CHECK?: { roots?: unknown; accept?: unknown } };
          expect(mod.CROSS_CHECK, `${gate} が CROSS_CHECK を export していない`).toBeTruthy();
          expect(Array.isArray(mod.CROSS_CHECK!.roots), `${gate} の CROSS_CHECK に roots が無い`).toBe(true);
          expect(typeof mod.CROSS_CHECK!.accept, `${gate} の CROSS_CHECK に accept が無い`).toBe('function');
        } else {
          // cross-check: 権威に 2 度訊いて食い違いを見る。**呼んでいること**まで見る
          // (定義だけ在って誰も呼ばない形は、このリポジトリが繰り返し踏んでいる罠)。
          expect(code, `${gate} が crossCheckProblem を定義していない`).toContain('function crossCheckProblem');
          expect(
            /crossCheckProblem\((?!\s*\))/.test(code.replace('function crossCheckProblem', '')),
            `${gate} が crossCheckProblem を呼んでいない`,
          ).toBe(true);
          // pathspec つきの 2 度目を投げていること (広い一覧をもう 1 度読むだけでは照合にならない)。
          expect(code, `${gate} が pathspec つきの 2 度目を訊いていない`).toContain("'--'");
        }
      }
    }
  });

  /*
   * ★ **母集団は `THINNING` (= 間引ける全ゲート) へ広がった** (2026-09-26 · パス 472)。
   *
   * パス 469〜470 はこの関係を `PARTIAL_GATES` (群の床を宣言する 8 本) と結んでいたが、
   * **実測すると間引けるのは 25 本**で、残り 17 本のうち 9 本が 1% の損失で黙っていた。
   * **群の床を宣言するのは一部でよい** (弱くなっていない所に床を足さない · パス 469) が、
   * **鳴らす機構を名乗るのは間引ける全ゲート**である。だから:
   *   - `ENFORCEMENT` ↔ `THINNING` は双方向 (25 本)
   *   - `PARTIAL_GATES` ⊆ `THINNING` (群の床を宣言する物は必ず間引きでも測る)
   * 機構の語彙は道具が `MECHANISMS` として持つ (11 語目を黙って足せない)。
   */
  it('★ 機構の台帳は THINNING と双方向で、理由が埋まっている', () => {
    expect(Object.keys(tool.ENFORCEMENT).sort()).toEqual(Object.keys(tool.THINNING).sort());
    expect(
      [...tool.PARTIAL_GATES].filter((g) => !Object.hasOwn(tool.THINNING, g)),
      '群の床を宣言するのに間引きで測られていないゲート',
    ).toEqual([]);
    for (const [gate, e] of Object.entries(tool.ENFORCEMENT)) {
      expect(Array.isArray(e.by), `${gate} の機構が配列でない`).toBe(true);
      expect(e.by.length, `${gate} が機構を 1 つも名乗っていない`).toBeGreaterThan(0);
      for (const by of e.by) {
        expect(tool.MECHANISMS, `${gate} の機構が未知`).toContain(by);
      }
      expect(e.why.length, `${gate} の理由が短すぎる`).toBeGreaterThanOrEqual(8);
    }
  });

  /** 保留の決まり文句 (この針が当たる標本は下の `it` が持つ)。 */
  const STUB_REASON = /^(同上|未定|TBD|後で)/;

  it('★ 一様な間引きの台帳は走査で導いた母集団と双方向で、決まり文句を置けない', () => {
    // 母集団は道具が走査で導く (手書きの一覧を持たない —— 26 本目が生えた日に鳴る)。
    expect(Object.keys(tool.THINNING).sort()).toEqual([...tool.thinnableGates()].sort());
    expect(Object.keys(tool.THINNING).length, '母集団の走査が死んでいる').toBeGreaterThanOrEqual(20);
    for (const [gate, t] of Object.entries(tool.THINNING)) {
      // `not-dropped` は「この道具では落とせない」= 機構ではなく報せ (パス 472)。
      // `instrument-rings` は「道具そのものが鳴らせたので終了コードから何も読めない」(パス 473)。
      expect(['rings', 'silent', 'not-dropped', 'instrument-rings'], `${gate} の期待が未知`).toContain(t.expect);
      // 「同上」「未定」のような保留は書けない (法則 no-weakness-as-spec)。
      expect(t.why, `${gate} の理由が省略形`).not.toMatch(STUB_REASON);
      expect(t.why.length, `${gate} の理由が短すぎる`).toBeGreaterThanOrEqual(20);
    }
  });

  /**
   * **道具が見えているゲートの台帳** (2026-09-26 · パス 473)。
   *
   * `audit:gate-partial` は前置きを 1 行差し込んでからゲートを走らせる。**その 1 行が
   * 見えるゲートが在る** —— 見えていると、間引きの答え (`rings` / `silent`) を
   * 「ゲートが走査の損失に気付いた」と読めなくなる (鳴らせたのは道具かもしれない)。
   *
   * ★★ 実測 (2026-09-26 · `--baseline` · 25 ゲート): **透明 23 / 見えている 2**。
   * `chain:verify` は `integrity-chain.cjs` が**それ自身が保護対象**なので、
   * 前置きを差し込むことが**その門が検出する違反そのもの**である (間引きを 1 件も
   * 掛けなくても exit 1)。`verify:arch` は差し込んだ 1 行が `tracked line count` に
   * 出るだけで、**床は 600000 なので判定は動かない**。
   *
   * ★ 載せるのは見えている物だけ (透明な 23 本の「理由」を並べると、どれも同じ理由に
   * なって理由の欄が保留の置き場になる · パス 461 の判断)。双方向は `--baseline` が
   * **実測で**持ち、ここが見るのは**形**である。
   */
  it('★ 道具が見えている台帳は THINNING の部分集合で、語彙が閉じている', () => {
    const visibleKinds = ['exit-code', 'output'];
    expect(Object.keys(tool.TRANSPARENCY).length, '台帳が空').toBeGreaterThanOrEqual(1);
    for (const [gate, v] of Object.entries(tool.TRANSPARENCY)) {
      expect(Object.hasOwn(tool.THINNING, gate), `${gate} が THINNING にない`).toBe(true);
      expect(visibleKinds, `${gate} の visible が未知`).toContain(v.visible);
      expect(v.why, `${gate} の理由が省略形`).not.toMatch(STUB_REASON);
      expect(v.why.length, `${gate} の理由が短すぎる`).toBeGreaterThanOrEqual(20);
    }
    // 終了コードが見えるゲートは、間引きの答えを読めないので期待値もそれを名乗る (双方向)。
    for (const [gate, v] of Object.entries(tool.TRANSPARENCY)) {
      if (v.visible === 'exit-code') expect(tool.THINNING[gate]?.expect, gate).toBe('instrument-rings');
    }
    for (const [gate, t] of Object.entries(tool.THINNING)) {
      if (t.expect === 'instrument-rings') expect(tool.TRANSPARENCY[gate]?.visible, gate).toBe('exit-code');
    }
    // 実測 (2026-09-26): 整合性チェーンは自分の原文をハッシュするので道具が見える。
    expect(tool.TRANSPARENCY['chain:verify']?.visible).toBe('exit-code');
  });

  /**
   * **判定の順序** —— `dropped` より**前**に「道具が見えているか」を問う。
   * 直す前は `report.dropped === 0` が先に短絡していたので `chain:verify` の exit 1 が
   * 見えず、`integrity-chain.cjs` に走査が 1 つ入った日に**偽の `rings`** が出る形だった。
   */
  it('★ 道具が鳴らせた答えを「ゲートが気付いた」と読まない', () => {
    const v = (gate: string, dropped: number | null, status: number) =>
      tool.partialVerdict({ gate, report: dropped === null ? null : { dropped }, status });
    expect(v('lint:charset', 5, 1)).toBe('rings');
    expect(v('lint:charset', 5, 0)).toBe('silent');
    expect(v('lint:charset', 0, 1)).toBe('not-dropped');
    expect(v('lint:charset', null, 1)).toBe('no-report');
    // 落とした件数に依らない —— 走査が生えても rings と読まない (決定的な検査)。
    expect(v('chain:verify', 0, 1)).toBe('instrument-rings');
    expect(v('chain:verify', 150, 1)).toBe('instrument-rings');
    // 出力だけが見えるゲートは、終了コードが素と同じなので間引きの答えを読める。
    expect(v('verify:arch', 5, 1)).toBe('rings');
    expect(v('verify:arch', 5, 0)).toBe('silent');
  });

  /**
   * **差し込む位置** —— `'use strict';` の後ろ。行 0 に入れると directive prologue が
   * 終わり、その本は sloppy mode で走る。sloppy は許す側なので、strict なら投げる
   * (= ゲートが鳴る) 所が投げなくなりうる = **偽の `silent`** を作る向きである。
   *
   * ★ 実測 (2026-09-26 · `--baseline`) では**今日どのゲートの答えも変えていなかった**
   * ので、これは**罠であって生きた欠陥ではない**。それでも留めるのは、次に strict に
   * 依るゲートが入った日に静かに誤測されるからである。
   */
  it('★ 前置きは use strict を殺さない位置へ入る', () => {
    expect(tool.preambleInsertAt(["'use strict';", '', 'const x = 1;'])).toBe(1);
    expect(tool.preambleInsertAt(['#!/usr/bin/env node', "'use strict';", 'x()'])).toBe(2);
    expect(tool.preambleInsertAt(['// なにか', '', '"use strict";', 'x()'])).toBe(3);
    expect(tool.preambleInsertAt(['const x = 1;', "'use strict';"])).toBe(0);
    // 宣言に見える文字列は飛ばさない (`use strict` を含む式)。
    expect(tool.preambleInsertAt(["const s = 'use strict';", 'x()'])).toBe(0);
  });

  it('★ 針が的に当たる標本 —— 保留の決まり文句は実際に捕まる', () => {
    for (const stub of ['同上。', '未定 (次のパスで)', 'TBD', '後で測る']) {
      expect(stub, `${stub} が針に当たらない`).toMatch(STUB_REASON);
    }
    expect('786 件落としても exit 0 (実測)。床は残った半分でも越える').not.toMatch(STUB_REASON);
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

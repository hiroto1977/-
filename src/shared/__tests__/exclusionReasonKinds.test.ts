import { readOriginalSource } from './originalSource';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * **除外の理由は、今日も本当か** (2026-09-26 · パス 477)。
 *
 * `DEP_EXCLUSIONS` は「保護対象が読んでいるが、それ自身は保護しないファイル」の台帳で、
 * 各行が理由の散文を持つ。**その散文を誰も検算していなかった。** 実測すると 3 件が偽だった:
 *
 * | 行 | 散文 | 実測 |
 * | --- | --- | --- |
 * | `assistantLimits.ts` | 「上限の定数のみ (判断は呼び出し側が持つ)」 | **関数 3 つ** —— `latestTurnTooLong` は 3 つの enforcement 点が読む唯一の述語 |
 * | `serviceId.ts` | 「現在 74」 | **76** |
 * | `clients/index.ts` | 「74 エントリ」 | **76** |
 *
 * ★★ いちばん重いのは 1 行目 —— 同じ注記が「ここを書き換えたときの最悪は『上限の値が
 * 変わる』——それは値の変更であって、**関門の迂回ではない**」と述べていた。実測では
 * `latestTurnTooLong` に `return false` を足すと 5 万字の入力が 3 点とも通る = 迂回そのもの。
 * しかも `MUST_MEASURE` にも `KNOWN_UNMEASURED` にも `mutate` にも無く、**ハッシュも変異検査も
 * 掛かっていなかった**。→ パス 477 で保護対象へ移した。
 *
 * ★ これは台帳自身が記録している過去の誤り (`clients/types.ts` は「型だけ」と書いてあったが
 *   実行時の判断を持っていた · 2026-08-23) の **2 件目**である。基準 (「型だけに見えるか」では
 *   なく「実行時に残るか」) も散文で述べられていた —— 機械だけが無かった。
 *
 * ここは**振る舞いの側**を持つ (`chain:verify` は CI で毎回走るので子プロセスを増やさない):
 * esbuild の出力が本当に 0 byte か・`import` 名が宣言の部分集合か。
 */
const req = createRequire(import.meta.url);
const REPO_ROOT = resolve(__dirname, '../../..');

const gate = req('../../../scripts/integrity-chain.cjs') as {
  PROTECTED: string[];
  DEP_EXCLUSIONS: Record<string, string>;
  EXCLUSION_KINDS: Record<string, { kind: string; reads?: string[]; guardedBy?: string[] }>;
  EXCLUSION_CHECKS: Record<string, (rel: string, row: unknown, prot: string[], why?: string) => string | null>;
  collectExclusionKindProblems: (
    exc: Record<string, string>,
    kinds: Record<string, unknown>,
    checks: Record<string, unknown>,
    prot: string[],
  ) => string[];
  protectedReadersOf: (target: string, prot: string[]) => string[];
  importedNamesFrom: (rel: string, target: string) => string[];
};

/** 実行時に残る JS の byte 数 (esbuild に訊く —— 構文の推測ではなく出力そのもの)。 */
function emittedBytes(rel: string): number {
  const out = execFileSync('npx', ['esbuild', rel, '--format=esm', '--minify'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return out.length;
}

describe('除外の理由は今日も本当か', () => {
  it('実物の除外はどれも分類どおり (両方向)', () => {
    expect(
      gate.collectExclusionKindProblems(gate.DEP_EXCLUSIONS, gate.EXCLUSION_KINDS, gate.EXCLUSION_CHECKS, gate.PROTECTED),
    ).toEqual([]);
    // 台帳と分類は同じ鍵を持つ (片方だけ増えても鳴る)。
    expect(Object.keys(gate.EXCLUSION_KINDS).sort()).toEqual(Object.keys(gate.DEP_EXCLUSIONS).sort());
  });

  it('★ type-only の行は実行時に 1 byte も残らない (esbuild に訊く)', () => {
    const typeOnly = Object.entries(gate.EXCLUSION_KINDS)
      .filter(([, row]) => row.kind === 'type-only')
      .map(([rel]) => rel);
    expect(typeOnly.length).toBeGreaterThanOrEqual(2);
    for (const rel of typeOnly) expect(emittedBytes(rel), rel).toBe(0);
    // ★ 針が的に当たること: 定数を持つ本は 0 byte ではない
    //   (0 を返すだけの測り方なら、この行も 0 になってしまう)。
    expect(emittedBytes('src/shared/inputCeiling.ts')).toBeGreaterThan(0);
  });

  it('★ paths-only の行は、保護対象の読み手が宣言した名前だけを読む', () => {
    const rows = Object.entries(gate.EXCLUSION_KINDS).filter(([, r]) => r.kind === 'paths-only');
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const [rel, row] of rows) {
      const readers = gate.protectedReadersOf(rel, gate.PROTECTED);
      expect(readers.length, `${rel} の保護対象の読み手`).toBeGreaterThanOrEqual(1);
      const declared = new Set(row.reads ?? []);
      expect(declared.size, `${rel} の reads`).toBeGreaterThanOrEqual(1);
      for (const reader of readers) {
        const used = gate.importedNamesFrom(reader, rel);
        expect(used.length, `${reader} → ${rel} の import 名`).toBeGreaterThanOrEqual(1);
        for (const n of used) expect(declared, `${reader} が ${rel} から読む ${n}`).toContain(n);
      }
    }
  });

  it('★ guarded-by の行が名乗る相手は、今も保護対象である', () => {
    const rows = Object.entries(gate.EXCLUSION_KINDS).filter(([, r]) => r.kind === 'guarded-by');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const [rel, row] of rows) {
      expect((row.guardedBy ?? []).length, `${rel} の guardedBy`).toBeGreaterThanOrEqual(1);
      for (const g of row.guardedBy ?? []) expect(gate.PROTECTED, `${rel} → ${g}`).toContain(g);
    }
  });

  it('★ registry の理由は件数を名乗らない (足すたびに変わる数を散文へ写さない)', () => {
    const rows = Object.entries(gate.EXCLUSION_KINDS).filter(([, r]) => r.kind === 'registry');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const claim = /[0-9０-９]{1,}\s*(?:件|エントリ|個|entries)|現在\s*[0-9０-９]+/;
    for (const [rel] of rows) {
      expect(gate.DEP_EXCLUSIONS[rel], rel).not.toMatch(claim);
    }
    // ★ 針が的に当たること: 直す前の 2 つの綴りはどちらも当たる。
    expect('サービス追加のたびに変わる登録簿 (74 エントリ)。').toMatch(claim);
    expect('サービスを 1 つ足すたびに変わる (現在 74)。').toMatch(claim);
    // 日付は件数ではない (針が広すぎない)。
    expect('2026-09-26 に測った登録簿。').not.toMatch(claim);
  });

  it('★ cmdVerify が検査 6 の結果を使っている (呼ぶだけでは足りない)', () => {
    /*
     * パス 472 / 475 / 476 と同じ教訓 —— 呼び出しを残したまま門 (`if (…) fail(…)`) を
     * 消すと、「呼んでいる」ことしか見ていない証人は黙る。実測 (2026-09-26): 検査 6 の
     * `if` を `if (false && …)` にすると self-test も この証人の他の 6 件も全部緑だった
     * (**4 度目**)。だから**結果を使う形そのもの**を要求する。
     */
    const src = readOriginalSource(join(REPO_ROOT, 'scripts/integrity-chain.cjs'));
    expect(src).toContain('const kinds = collectExclusionKindProblems(DEP_EXCLUSIONS, EXCLUSION_KINDS, EXCLUSION_CHECKS, PROTECTED);');
    expect(src).toContain('if (kinds.length > 0) fail(');
    // 針が的に当たること: 骨抜きの形はこの綴りを満たさない。
    expect('if (false && kinds.length > 0) fail(').not.toContain('if (kinds.length > 0) fail(');
  });

  it('★ assistantLimits.ts は保護対象で、関門を持っている', () => {
    /*
     * 除外の理由は「上限の定数のみ」だったが、実行時に残る export に**関門の述語**が在る。
     * ここは「保護対象に居ること」と「その述語が実際に 3 点から読まれていること」を留める。
     */
    const rel = 'src/shared/assistantLimits.ts';
    expect(gate.PROTECTED).toContain(rel);
    expect(Object.keys(gate.DEP_EXCLUSIONS)).not.toContain(rel);
    expect(emittedBytes(rel)).toBeGreaterThan(0);

    // 3 つの enforcement 点 (main の throw と ブラウザ版の err 2 つ) が同じ述語を読む。
    const main = readOriginalSource(join(REPO_ROOT, 'src/main/clients/assistant.ts'));
    const web = readOriginalSource(join(REPO_ROOT, 'src/renderer/web-shim.ts'));
    expect(main).toContain('if (latestTurnTooLong(messages)) throw new Error(inputTooLongMessage(');
    expect(web.split('if (latestTurnTooLong(').length - 1).toBeGreaterThanOrEqual(2);
    // 針が的に当たること: 呼び出しを消した形はこの綴りを満たさない。
    expect('if (false) throw new Error(inputTooLongMessage(').not.toContain('if (latestTurnTooLong(messages)) throw');
  });
});

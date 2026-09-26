/**
 * **エージェントへ注入される指示書は、機械が見ている** (2026-09-21 · パス 372)。
 *
 * ## 見つけた物 (実測)
 *
 * この repo には**コードを書く側を steering する**文書が 5 本ある:
 *
 * ```
 *   CLAUDE.md                       Claude Code がプロジェクト指示として読む
 *   .cursor/rules/00-project.mdc    alwaysApply: true — Cursor の全セッションへ注入
 *   .cursor/rules/20-gates.mdc      alwaysApply: true — 同上
 *   .cursor/rules/10-boundaries.mdc globs に合う編集で注入
 *   .cursor/rules/30-conventions.mdc 同上
 * ```
 *
 * `20-gates.mdc` は `npm run verify:all` を **「13 ゲート全部」**と書いていた ——
 * 実物は **37**。**24 ゲート分古い前提が、毎セッション注入されていた。**
 * 皮肉なことに、その 3 行下で同じファイルが
 * 「`verify:all` にゲートを足したら `ci.yml` にも足すこと」と正しく述べている ——
 * **規則は知っていたのに、自分の数は誰も見ていなかった。**
 *
 * `00-project.mdc` のサービス数だけは `lint:docs` が 2026-08 から見ていた。
 * **同じ木の中で、片方の数字だけが機械に載っていた。**
 *
 * ## 方針は churn で決まる (パス 347 の基準)
 *
 * - `chain` —— 低 churn (1〜2 コミット)。**散文そのものが変わったこと**を鎖が見る。
 *   機械に判断できない「指示の中身」の側はこれしか打つ手が無い。
 * - `live-metrics` —— 高 churn (`CLAUDE.md` は 183 コミット)。鎖に入れれば
 *   毎パス採掘することになるので、**数だけ**を `verify:arch` が実測と突き合わせる。
 *
 * **他文字種の混入は数えない** —— `lint:charset` が既に `.mdc` を走査している
 * (実測 2026-09-21: `.cursor/rules/30-conventions.mdc` にキリル文字を植えると exit 1)。
 * 同じ事実を 2 つの門で見ると、片方を直したときにもう片方が鳴って
 * 「直しが正しいのか台帳が古いのか」が読めなくなる。
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

const REPO = join(__dirname, '..', '..', '..');

/** 指示書と、その古びを誰が見るか。 */
const POLICY: Readonly<Record<string, 'chain' | 'live-metrics'>> = {
  'CLAUDE.md': 'live-metrics',
  '.cursor/rules/00-project.mdc': 'chain',
  '.cursor/rules/10-boundaries.mdc': 'chain',
  '.cursor/rules/20-gates.mdc': 'chain',
  '.cursor/rules/30-conventions.mdc': 'chain',
};

/** 母集団は走査で導く (`.cursor/rules/*.mdc` + `CLAUDE.md`)。 */
function population(): string[] {
  const rules = readOriginalDirEntries(join(REPO, '.cursor/rules'))
    .filter((e) => !e.isDirectory() && e.name.endsWith('.mdc'))
    .map((e) => `.cursor/rules/${e.name}`);
  return ['CLAUDE.md', ...rules].sort();
}

const chain = readOriginalSource(join(REPO, 'scripts/integrity-chain.cjs'));
const arch = readOriginalSource(join(REPO, 'scripts/verify-architecture.cjs'));

/** `verify:all` が実際に走らせる `npm run <gate>` の数。 */
function realGateCount(): number {
  const pkg = JSON.parse(readOriginalSource(join(REPO, 'package.json'))) as {
    scripts: Record<string, string>;
  };
  return (pkg.scripts['verify:all'] ?? '').split('&&').filter((p) => p.includes('npm run')).length;
}

describe('エージェントへ注入される指示書は機械が見ている (パス 372)', () => {
  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    expect(population().length, '指示書を集められていない').toBeGreaterThanOrEqual(5);
    expect(population(), 'Cursor のルールが見えていない').toContain('.cursor/rules/20-gates.mdc');
    expect(realGateCount(), 'verify:all のゲートを数えられていない').toBeGreaterThanOrEqual(30);
  });

  it('★ 母集団と台帳が双方向で一致する', () => {
    expect(population().filter((f) => !Object.hasOwn(POLICY, f)), '台帳に無い指示書').toEqual([]);
    expect(Object.keys(POLICY).filter((f) => !population().includes(f)), '台帳の古い行').toEqual([]);
  });

  it('★ chain の行はすべて整合性チェーンの保護対象である', () => {
    for (const [file, policy] of Object.entries(POLICY)) {
      if (policy !== 'chain') continue;
      expect(chain, `${file} が PROTECTED にない`).toContain(`'${file}',`);
    }
    // 標本: 同じ読み方で既知の保護対象も見つかる (針が死んでいない)。
    expect(chain, '針が死んでいる').toContain("'assets/sw.js',");
  });

  it('★ live-metrics の行は verify:arch が実際に見ている', () => {
    for (const [file, policy] of Object.entries(POLICY)) {
      if (policy !== 'live-metrics') continue;
      expect(arch, `${file} を verify:arch が見ていない`).toContain(`docFile: '${file}'`);
    }
  });

  it('★ Cursor のゲート数は実測と一致する (13 → 37 の再発を止める)', () => {
    const src = readOriginalSource(join(REPO, '.cursor/rules/20-gates.mdc'));
    const m = /# (\d+) ゲート全部/.exec(src);
    expect(m, 'ゲート数の書き方が変わった — 針を直すこと').not.toBeNull();
    expect(Number(m![1]), 'Cursor へ注入される数が実物とずれている').toBe(realGateCount());
  });

  it('★ その数は verify:arch のライブメトリクスにも載っている (2 か所で見る)', () => {
    expect(arch, '.cursor のゲート数がライブメトリクスに無い').toContain(
      "docFile: '.cursor/rules/20-gates.mdc'",
    );
  });

  it('★ 常時注入される指示書 (alwaysApply: true) はすべて台帳に在る', () => {
    const always = population().filter(
      (f) => f.endsWith('.mdc') && /^alwaysApply:\s*true$/m.test(readOriginalSource(join(REPO, f))),
    );
    expect(always.length, 'alwaysApply の走査が死んでいる').toBeGreaterThanOrEqual(2);
    expect(always.filter((f) => !Object.hasOwn(POLICY, f)), '常時注入なのに台帳に無い').toEqual([]);
  });

});

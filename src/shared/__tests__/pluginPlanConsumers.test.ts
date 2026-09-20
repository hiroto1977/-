/**
 * **プラグインの計画を読む所の母集団** (2026-09-20 · パス 358)。
 *
 * ## 何が在ったか
 *
 * `pluginRuntime.ts` の docblock は設計方針をこう書いている:
 *
 * > 権限が無いコネクタを計画から **除外する** のではなく … `permitted:false` として
 * > **明示** し、計画を可観測にする。… **defense in depth は実行直前の
 * > `planPermittedSteps` (= `permitted:true` のみ抽出) で担保する。**
 *
 * 実測 (2026-09-20): **`planPermittedSteps` の出荷コードからの呼び出しは 0 件**。
 * 計画を読む所も 1 つだけで、それは `ConnectorsPage` の**表示**で、
 * 件数を数えるのに `s.permitted` の filter を**手で書き写して**いた。
 *
 * **今日の実害は 0** —— プラグインのフックからコネクタを撃つ経路がどこにも無い
 * (画面の「▶ 実行」は利用者が押す `executeFreeConnector` で、認証不要の
 * ローカル・コネクタを見本の payload で走らせる別の道)。
 * 欠けていたのは**名指しされた関門の配線**と、それを保つ物である。
 *
 * ## なぜ危ないか —— 返り値には `permitted:false` も入っている
 *
 * `resolveHookPlan` は**全件**を返す。実行を書く人が素直にその配列を回すと、
 * 権限の無い手順も撃つことになる。関門は「呼べば効く」のではなく
 * **「呼ばなければ効かない」**側なので、呼び忘れは静かに通る。
 *
 * ## この検査が持つもの
 *
 * 計画を読む出荷モジュールを走査で数え、**用途つきの台帳**と両方向に突き合わせる。
 * `use: 'execute'` の行には **`planPermittedSteps` を通していること**を要求する。
 */
import { describe, expect, it } from 'vitest';
import { join, relative } from 'node:path';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from './originalSource';
import { planPermittedSteps, type HookDispatchStep } from '../connectors/pluginRuntime';

const REPO = join(__dirname, '..', '..', '..');

/** 出荷モジュール (検査と型宣言を除く)。 */
function shipped(): string[] {
  return globSync(['src/**/*.ts', 'src/**/*.tsx'], {
    cwd: REPO,
    absolute: true,
    ignore: ['**/__tests__/**', '**/*.d.ts'],
  });
}

/** `resolveHookPlan` を呼ぶ出荷モジュール (定義元は除く)。 */
function planReaders(): string[] {
  const out: string[] = [];
  for (const abs of shipped()) {
    const rel = relative(REPO, abs).split('\\').join('/');
    if (rel === 'src/shared/connectors/pluginRuntime.ts') continue;
    const src = readOriginalSource(abs);
    const hit = src
      .split('\n')
      .some((line) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false;
        return /(?<![\w$])resolveHookPlan\s*\(/.test(t);
      });
    if (hit) out.push(rel);
  }
  return out.sort();
}

const LEDGER: Readonly<Record<string, { use: 'display' | 'execute'; why: string }>> = {
  'src/renderer/pages/ConnectorsPage.tsx': {
    use: 'display',
    why: '連携ページの表。計画を全件出して `permitted` を ✅ / ⛔ で見せる (可観測にするのが設計方針)。件数を数える所は 2026-09-20 (パス 358) から `planPermittedSteps` を通す —— 手で書き写した filter は、実行を書く人が真似る形だった。',
  },
};

describe('プラグインの計画を読む所 (パス 358)', () => {
  it('走査が生きている (床: 出荷される .ts/.tsx を 200 本以上読めている)', () => {
    expect(shipped().length).toBeGreaterThanOrEqual(200);
  });

  it('★ 台帳と実物が一致する (両方向)', () => {
    expect(planReaders()).toEqual(Object.keys(LEDGER).sort());
  });

  it('★ `execute` の行は `planPermittedSteps` を通している', () => {
    for (const [file, row] of Object.entries(LEDGER)) {
      expect(row.why.length, file).toBeGreaterThan(20);
      if (row.use !== 'execute') continue;
      expect(readOriginalSource(join(REPO, file)), file).toContain('planPermittedSteps');
    }
  });

  it('★ 表示の行でも、数えるのは共有の関門を通す (写しを置かない)', () => {
    const page = readOriginalSource(join(REPO, 'src/renderer/pages/ConnectorsPage.tsx'));
    expect(page).toContain('planPermittedSteps(');
    // 不在の主張には標本を添える —— 針が旧い書き方に当たることを見せる。
    const INLINE = /steps\.filter\(\(s\) => s\.permitted\)/;
    expect(INLINE.test('n + pp.steps.filter((s) => s.permitted).length')).toBe(true);
    expect(page).not.toMatch(INLINE);
  });

  it('★ 計画は全件を返す —— 関門は「呼ばなければ効かない」側である', () => {
    const step = (connectorId: string, permitted: boolean): HookDispatchStep => ({
      pluginId: 'a',
      hook: 'onActionInvoke',
      connectorId,
      sourceService: 'kpi',
      targetService: 'storage',
      capability: 'record',
      requiresAuth: false,
      permitted,
    });
    const steps: HookDispatchStep[] = [step('c1', true), step('c2', false)];
    // 素の計画には権限の無い手順が入っている (そのまま回すと撃つ)。
    expect(steps.filter((s) => !s.permitted)).toHaveLength(1);
    // 関門を通すと落ちる。
    expect(planPermittedSteps(steps).map((s) => s.connectorId)).toEqual(['c1']);
    // 入力順は保たれる (docblock の主張)。
    expect(planPermittedSteps([...steps, steps[0]!]).map((s) => s.connectorId)).toEqual(['c1', 'c1']);
  });

  it('★ 撃つ経路は今日どこにも無い (プラグインのフックからの dispatch が 0 件)', () => {
    const executors = Object.entries(LEDGER).filter(([, r]) => r.use === 'execute');
    expect(executors).toEqual([]);
    // 標本: 台帳の種別は 2 通りを取りうる (`execute` の綴りが生きている)。
    const kinds: ('display' | 'execute')[] = ['display', 'execute'];
    expect(kinds).toContain('execute');
  });

  it('docblock は「実行直前はまだ存在しない」ことを述べている (古い断定を残さない)', () => {
    const src = readOriginalSource(join(REPO, 'src/shared/connectors/pluginRuntime.ts'));
    expect(src).toContain('その「実行直前」はまだ存在しない');
    expect(src).toContain('出荷コードからの呼び出しは 0 件');
  });

  it('標本: 走査は注記の中の言及を数えない', () => {
    // `resolveHookPlan` は上の docblock でも言及されるので、注記を落とさないと
    // 定義元以外のファイルでも偽陽性になる。
    const readers = planReaders();
    expect(readers).not.toContain('src/shared/connectors/pluginCatalog.ts');
    expect(readOriginalSource(join(REPO, 'src/shared/connectors/pluginCatalog.ts'))).toContain('resolveHookPlan');
  });
});

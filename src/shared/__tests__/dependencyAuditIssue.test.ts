/**
 * 週次の依存監査が「要対応を常設 Issue 1 つに集める」ための同期 (`scripts/dependency-audit-issue.cjs`)。
 *
 * パス 306 (2026-09-17): `.github/workflows/dependency-audit.yml` はこの branch にしか無く GitHub に未登録で、
 * 書かれてから 1 度も走っていない。YAML の中の script は Issue を `state: 'open'` で探し、要対応 0 件のとき
 * その Issue を閉じる —— 閉じた翌週に要対応が戻ると、探す側は閉じた物を見つけられず **2 つ目を作る**。
 * 判断を module へ出し、偽の client で振る舞いを留める。workflow がその module を呼ぶことも留める
 * (YAML の中へ戻ると検査の外へ出るため)。
 */
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { readOriginalSource } from './originalSource';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const req = createRequire(__filename);
const mod = req(path.join(REPO_ROOT, 'scripts/dependency-audit-issue.cjs')) as {
  TITLE: string;
  syncIssue: (a: { github: unknown; context: unknown; report: unknown }) => Promise<{ action: string; number: number | null }>;
  fakeGithub: (issues: unknown[]) => { calls: [string, Record<string, unknown>][]; rest: unknown };
};
const { stripComments } = req(path.join(REPO_ROOT, 'scripts/shared-judgement-census.cjs')) as {
  stripComments: (s: string) => string;
};
const context = { repo: { owner: 'o', repo: 'r' } };
const run = async (issues: unknown[], report: unknown) => {
  const gh = mod.fakeGithub(issues);
  const r = await mod.syncIssue({ github: gh, context, report });
  return { r, calls: gh.calls };
};

describe('dependency-audit の常設 Issue の同期 (パス 306)', () => {
  it('★ 閉じた常設 Issue が在り要対応が戻った → 再開する (2 つ目を作らない)', async () => {
    const { r, calls } = await run([{ number: 7, title: mod.TITLE, state: 'closed' }], { actionable: 2, markdown: 'm' });
    expect(r).toEqual({ action: 'reopened', number: 7 });
    expect(calls.map((c) => c[0])).toEqual(['list', 'update']);
    expect(calls[1]![1]).toMatchObject({ issue_number: 7, state: 'open', body: 'm' });
  });

  it('★ 探すのは open / closed を問わず・更新順 (閉じた物が見えないと 2 つ目を作る)', async () => {
    const { calls } = await run([], { actionable: 0, markdown: 'm' });
    expect(calls[0]![1]).toMatchObject({ state: 'all', sort: 'updated', direction: 'desc' });
  });

  it('要対応 0 なら開いている常設 Issue を閉じる', async () => {
    const { r, calls } = await run([{ number: 7, title: mod.TITLE, state: 'open' }], { actionable: 0, markdown: 'm' });
    expect(r).toEqual({ action: 'closed', number: 7 });
    expect(calls[1]![1]).toMatchObject({ state: 'closed' });
  });

  it('無ければ要対応が在るときだけ作り、0 件なら何も作らない', async () => {
    expect((await run([], { actionable: 1, markdown: 'm' })).r).toEqual({ action: 'created', number: 999 });
    const none = await run([], { actionable: 0, markdown: 'm' });
    expect(none.r).toEqual({ action: 'none', number: null });
    expect(none.calls.map((c) => c[0])).toEqual(['list']);
  });

  it('listForRepo が返す PR (同じ題名) は常設 Issue ではない', async () => {
    const { r } = await run([{ number: 5, title: mod.TITLE, state: 'open', pull_request: { url: 'x' } }], { actionable: 1, markdown: 'm' });
    expect(r).toEqual({ action: 'created', number: 999 });
  });

  it('報告の形が違えば投げる (黙って none にしない)', async () => {
    await expect(run([], { actionable: '1', markdown: 'm' })).rejects.toThrow(/報告の形/);
  });

  it('★ workflow は module を呼び、Issue の判断を YAML の中に持たない', () => {
    const yml = readOriginalSource(path.join(REPO_ROOT, '.github/workflows/dependency-audit.yml'));
    expect(yml).toContain("require('./scripts/dependency-audit-issue.cjs')");
    expect(yml).toContain('await syncIssue({ github, context, report })');
    // 不在の主張には標本を添える: YAML の中に判断が戻った形 (旧い script) には当たる
    const INLINE_JUDGEMENT = /issues\.(listForRepo|update|create)\(/;
    expect("            const { data: issues } = await github.rest.issues.listForRepo({").toMatch(INLINE_JUDGEMENT);
    expect(yml).not.toMatch(INLINE_JUDGEMENT);
  });

  it('★ module の探し方は state all (open だけだと閉じた常設 Issue が見えない)', () => {
    const code = stripComments(readOriginalSource(path.join(REPO_ROOT, 'scripts/dependency-audit-issue.cjs')));
    // 探す呼び出しの引数だけを見る (self-test の標本の Issue も `state: 'open'` を持つので、全文には当てない ——
    // 最初の版はそれで落ちた)
    const call = /listForRepo\(\{([\s\S]*?)\}\)/.exec(code);
    expect(call).not.toBeNull();
    expect(call![1]).toMatch(/state: 'all'/);
    expect(call![1]).toMatch(/sort: 'updated'/);
    expect(call![1]).not.toMatch(/state: 'open'/);
    // 標本: 旧い形には当たる
    expect("state: 'open', per_page: 100").toMatch(/state: 'open'/);
  });

  it("★ package.json の audit:report は module の self-test を回す (workflow が使う前に壊れていれば止まる)", () => {
    const pkg = JSON.parse(readOriginalSource(path.join(REPO_ROOT, 'package.json'))) as { scripts: Record<string, string> };
    expect(pkg.scripts['audit:report']).toContain('node scripts/dependency-audit-issue.cjs --self-test');
  });
});

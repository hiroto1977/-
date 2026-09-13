import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * **週次の依存監査が、実際に配線されていること。**
 *
 * 2026-09-10 (パス 143) に勧告 4 件を見つけたのは「たまたま手で `npm audit` を
 * 打ったから」で、自動で気付く道は 1 本も無かった —— `ci.yml` は
 * `--omit=dev --audit-level=high` しか落とさず (意図的)、`lint:deps` は網に
 * 出ないので `checkedOn` の 180 日警告まで。**`qs` の床は 24 日で低すぎに
 * なっていた**ので、その警告では間に合わない。
 *
 * 週次の予定実行は誰の PR も赤くしないので `ci.yml` の懸念は当たらない。
 * ここで留めるのは**鎖がつながっていること** —— 予定 → スクリプト →
 * 報告ファイル → Issue。どこか 1 つが外れると、門は存在するのに何も守らない
 * (`lint:citations` が 2026-07-30 まで CI に無かったのと同じ形)。
 *
 * 検査は**肯定形**で書く。「有ることの検査は、無ければ必ず鳴る」(CLAUDE.md)。
 */

const req = createRequire(import.meta.url);
const reporter = req('../../../scripts/dependency-audit-report.cjs') as {
  buildReport: (input: {
    all: { name: string; severity: string; ghsa: string[] }[] | null;
    prod: { name: string; severity: string; ghsa: string[] }[] | null;
    floors: { package: string; atLeast: string; checkedOn: string; recorded: string[]; hits: string[]; status: string; detail: string }[] | null;
    generatedAt: string;
  }) => { actionable: number; markdown: string; summary: Record<string, number> };
  advisoriesOf: (report: unknown) => unknown;
};

const REPO_ROOT = path.resolve(__dirname, '../../..');
const read = (f: string) => readFileSync(path.join(REPO_ROOT, f), 'utf8');
const WF = read('.github/workflows/dependency-audit.yml');
const PKG = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
const IGNORE = read('.gitignore');

const REPORT_PATH = 'orchestration/dependency-audit.json';

describe('週次の依存監査は、予定 → スクリプト → 報告 → Issue までつながっている', () => {
  it('★ ワークフローが `npm run audit:report` を走らせる', () => {
    expect(WF).toContain('npm run audit:report');
  });

  it('★ `audit:report` は報告スクリプトと自己検査の両方を走らせる', () => {
    const s = PKG.scripts['audit:report'];
    expect(s, 'audit:report が package.json に無い').toBeTruthy();
    expect(s).toContain('scripts/dependency-audit-report.cjs');
    expect(s, '自己検査を回さないと規則が壊れても気付けない').toContain('--self-test');
  });

  it('★ 床の測り直し (audit:floors) と同じ実装を使う (2 つ持つと片方が腐る)', () => {
    const src = read('scripts/dependency-audit-report.cjs');
    expect(src).toContain("require('./audit-floors.cjs')");
    expect(src).toContain('probeFloors');
    expect(PKG.scripts['audit:floors']).toContain('scripts/audit-floors.cjs');
  });

  it('★ 週 1 回の予定と手動起動の両方を持つ', () => {
    expect(WF).toMatch(/schedule:\s*\n\s*- cron: '0 \d+ \* \* \d'/);
    expect(WF).toContain('workflow_dispatch');
  });

  it('★ 権限が明示され、Issue を書ける (lint:workflow-security の規則 1)', () => {
    expect(WF).toContain('permissions:');
    expect(WF).toContain('contents: read');
    expect(WF).toContain('issues: write');
  });

  it('★ 報告ファイルを読んで Issue を作成/更新し、片付いたら閉じる', () => {
    expect(WF).toContain(REPORT_PATH);
    expect(WF).toContain('issues.create');
    expect(WF).toContain('issues.update');
    expect(WF, '要対応 0 件で閉じないと、古い内容が開いたまま残る').toContain(
      "state: r.actionable > 0 ? 'open' : 'closed'",
    );
  });

  it('報告ファイルは生成物なので追跡しない (作業樹を汚さない)', () => {
    expect(IGNORE).toContain(REPORT_PATH);
  });

  /*
   * **PR の門は狭いままである**ことも留める。狭さは意図した判断なので、
   * 週次を足したついでに広げてしまっていないかを見る (逆向きの守り)。
   */
  it('CI の門は `--omit=dev --audit-level=high` のまま (週次で広げても PR は赤くしない)', () => {
    expect(read('.github/workflows/ci.yml')).toContain('npm audit --omit=dev --audit-level=high');
  });
});

describe('報告の組み立て — 数え落としと「測れていないのに 0 件」を塞ぐ', () => {
  const at = '2026-09-10';
  const floor = (status: string, extra: Record<string, unknown> = {}) => ({
    package: 'x',
    atLeast: '1.0.0',
    checkedOn: at,
    recorded: [],
    hits: [],
    status,
    detail: '',
    ...extra,
  }) as never;
  const adv = (name: string, severity: string) => ({ name, severity, ghsa: ['GHSA-test'] });
  const run = (input: Parameters<typeof reporter.buildReport>[0]) => reporter.buildReport(input);

  it('★ 出荷される依存の勧告は重大度を問わず要対応 (文書が「prod 0 件」と言っている)', () => {
    expect(run({ all: [adv('p', 'low')], prod: [adv('p', 'low')], floors: [], generatedAt: at }).actionable).toBe(1);
  });

  it('★ dev だけの勧告も数える — CI が意図的に見ない範囲がここに出る', () => {
    const r = run({ all: [adv('vitest', 'moderate')], prod: [], floors: [], generatedAt: at });
    expect(r.summary.dev).toBe(1);
    expect(r.markdown).toContain('`vitest`');
  });

  it('★ prod に在る名前を dev に二重計上しない', () => {
    const r = run({ all: [adv('p', 'high'), adv('d', 'low')], prod: [adv('p', 'high')], floors: [], generatedAt: at });
    expect([r.summary.prod, r.summary.dev]).toEqual([1, 1]);
  });

  it('★ 測れなかった項目を「0 件だから健全」にしない', () => {
    expect(run({ all: null, prod: [], floors: [], generatedAt: at }).actionable).toBe(1);
    expect(run({ all: [], prod: null, floors: [], generatedAt: at }).actionable).toBe(1);
    expect(run({ all: [], prod: [], floors: null, generatedAt: at }).actionable).toBe(1);
    expect(run({ all: [], prod: [], floors: [floor('unmeasured', { detail: '網に出られない' })], generatedAt: at }).actionable).toBe(1);
  });

  it('★ 低すぎる床を名指しする (qs が 24 日で陥った形)', () => {
    const r = run({
      all: [],
      prod: [],
      floors: [floor('too-low', { package: 'qs', atLeast: '6.15.2', hits: ['GHSA-4mjr-xmp4-gh2g'] })],
      generatedAt: at,
    });
    expect(r.summary.lowFloors).toBe(1);
    expect(r.markdown).toContain('**低すぎます**');
    expect(r.markdown).toContain('`qs`');
  });

  it('対照: 何も無ければ要対応 0 で、Issue は閉じる側になる', () => {
    const r = run({ all: [], prod: [], floors: [floor('ok')], generatedAt: at });
    expect(r.actionable).toBe(0);
    expect(r.markdown).toContain('0 件。');
  });

  it('対照: 形の違う audit 出力は null になり、空配列と混ざらない', () => {
    expect(reporter.advisoriesOf({})).toBeNull();
    expect(reporter.advisoriesOf({ vulnerabilities: {} })).toEqual([]);
  });
});

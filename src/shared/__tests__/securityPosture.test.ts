import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

/*
 * **セキュリティの姿勢 (`scripts/security-posture.cjs`) — 「次はどこを狩るか」を台帳から決定的に導く。**
 * (threat: T-167)
 *
 * 守りを増やす輪 (狩り → 台帳 → 回帰検査 → 門) は揃っていたが、その輪を回し続ける側が無く、狩りが止まっても
 * 誰も気付かなかった (台帳の ai-automated-attack の穴「AI 監査は人が起動する」)。ここで留めるのは:
 *
 *   ① 判定 —— 止まった面・再確認の期限・順位・薄い型・読めない台帳 (純関数。時計も網も読まない)
 *   ② 実物の台帳に対して動く —— 5 面すべてを数え、読めない物が 0 件
 *   ③ 配線 —— 毎日の報告が姿勢を導いて載せ、止まった狩りは要対応に数える
 */

const req = createRequire(import.meta.url);
type Posture = {
  surfaces: { id: string; found: number; backlog: number }[];
  stalled: { surface: string; idleDays: number | null }[];
  recheckDue: { item: string }[];
  thinClasses: { id: string; margin: number }[];
  queue: { surface: string; score: number; ageDays: number | null }[];
  problems: string[];
  actionable: number;
};
const sp = req('../../../scripts/security-posture.cjs') as {
  analyzePosture: (ledger: unknown, now: string) => Posture;
  renderPosture: (p: Posture) => string;
  dayNumber: (iso: unknown) => number | null;
  STALL_DAYS: number;
  RECHECK_DAYS: number;
};
const ledger = req('../../../security/threat-ledger.json') as { surfaces: string[]; threats: { id: string }[] };

const t = (id: string, surface: string, found: string, severity = 'medium') => ({ id, surface, found, severity, status: 'fixed' });
const base = {
  surfaces: ['a', 'b'],
  threats: [t('T-1', 'a', '2026-10-20', 'high'), t('T-2', 'b', '2026-08-01', 'low')],
  huntBacklog: [
    { surface: 'b', item: '古い', why: '2026-08-02 に残した' },
    { surface: 'a', item: '新しい', why: '日付なし' },
  ],
  clearedBacklog: [
    { item: '古い確認', checkedOn: '2026-08-01' },
    { item: '新しい確認', checkedOn: '2026-10-20' },
  ],
  classes: [{ id: 'c', name: 'C', defenses: [{}], gaps: ['x', 'y'] }],
};
const NOW = '2026-10-23';

describe('セキュリティの姿勢 — 判定 (threat: T-167)', () => {
  it('★ 狩り残しが在るのに STALL_DAYS 日以上新しい穴が無い面を「止まった」と言う', () => {
    const p = sp.analyzePosture(base, NOW);
    expect(p.stalled.map((s) => s.surface)).toEqual(['b']);
    expect(p.stalled[0]?.idleDays).toBe(83);
  });

  it('止まる境目は STALL_DAYS ちょうど (1 日手前は止まっていない)', () => {
    const day = (n: number) => new Date(Date.UTC(2026, 9, 23) - n * 86_400_000).toISOString().slice(0, 10);
    const at = (idle: number) => sp.analyzePosture({ ...base, threats: [t('T-1', 'a', day(idle)), t('T-2', 'b', day(idle))] }, NOW).stalled.length;
    expect(at(sp.STALL_DAYS - 1)).toBe(0);
    expect(at(sp.STALL_DAYS)).toBe(2);
  });

  it('狩り残しが無い面は、穴が出ていなくても止まったとは言わない', () => {
    const p = sp.analyzePosture({ ...base, huntBacklog: [] }, NOW);
    expect(p.stalled).toEqual([]);
  });

  it('★ 再確認の期限は RECHECK_DAYS ちょうど', () => {
    const day = (n: number) => new Date(Date.UTC(2026, 9, 23) - n * 86_400_000).toISOString().slice(0, 10);
    const due = (age: number) => sp.analyzePosture({ ...base, clearedBacklog: [{ item: 'x', checkedOn: day(age) }] }, NOW).recheckDue.length;
    expect(due(sp.RECHECK_DAYS - 1)).toBe(0);
    expect(due(sp.RECHECK_DAYS)).toBe(1);
  });

  it('★ 次に狩る候補は 収穫 + 古さ の順で、日付の無い物は古さ 0 (順位を盛らない)', () => {
    const q = sp.analyzePosture(base, NOW).queue;
    expect(q.map((x) => [x.surface, x.score, x.ageDays])).toEqual([
      ['b', 11, 82],
      ['a', 3, null],
    ]);
  });

  it('★ 読めない物は 0 件と混ぜない: 暦に無い日付・台帳に無い面・台帳そのもの', () => {
    expect(sp.analyzePosture({ ...base, threats: [t('T-1', 'a', '2026-02-31')] }, NOW).problems).toHaveLength(1);
    expect(sp.analyzePosture({ ...base, threats: [t('T-1', 'zzz', '2026-10-20')] }, NOW).problems.join()).toContain('zzz');
    expect(sp.analyzePosture({ ...base, clearedBacklog: [{ item: 'x', checkedOn: 'いつか' }] }, NOW).problems).toHaveLength(1);
    for (const broken of [null, {}, { threats: 1, surfaces: [] }]) {
      const p = sp.analyzePosture(broken, NOW);
      expect(p.problems).toHaveLength(1);
      expect(p.actionable).toBeGreaterThanOrEqual(1);
    }
  });

  it('今日の日付が読めなければ投げる (推測した日で測らない)', () => {
    expect(() => sp.analyzePosture(base, 'yesterday')).toThrow();
    expect(() => sp.analyzePosture(base, '2026-02-31')).toThrow();
  });

  it('日付の判定: 暦に在る日だけ', () => {
    expect(sp.dayNumber('2026-10-23')).not.toBeNull();
    for (const bad of ['2026-02-31', '2026-13-01', '2026-1-1', 20261023, null, undefined]) expect(sp.dayNumber(bad)).toBeNull();
  });

  it('要対応 = 止まった面 + 期限切れ + 読めない物', () => {
    expect(sp.analyzePosture(base, NOW).actionable).toBe(2);
  });
});

describe('セキュリティの姿勢 — 実物の台帳 (threat: T-167)', () => {
  const real = sp.analyzePosture(ledger, '2026-10-23');

  it('台帳の 5 面すべてを数え、読めない物が 0 件', () => {
    expect(real.surfaces.map((s) => s.id)).toEqual(ledger.surfaces);
    expect(real.surfaces.reduce((n, s) => n + s.found, 0)).toBe(ledger.threats.length);
    expect(real.problems).toEqual([]);
  });

  it('次に狩る候補が出て、守りの薄い型が出る (走査が空虚でない)', () => {
    expect(real.queue.length).toBeGreaterThan(0);
    expect(real.thinClasses.length).toBeGreaterThan(0);
  });

  it('文面に面の表・次の候補・「自動なのは検知と順位づけまで」の限界が出る', () => {
    const md = sp.renderPosture(real);
    for (const id of ledger.surfaces) expect(md).toContain(`| ${id} |`);
    expect(md).toContain('次に狩る候補');
    expect(md).toContain('自動なのは検知と順位づけまで');
  });
});

describe('セキュリティの姿勢 — 配線 (threat: T-167)', () => {
  it('★ 毎日の報告が姿勢を導いて buildReport へ渡す', () => {
    const src = stripComments(readOriginalSource('scripts/dependency-audit-report.cjs'));
    expect(src).toMatch(/posture:\s*derivePosture\(/);
    expect(src).toContain("require('./security-posture.cjs')");
  });

  it('★ 止まった狩りは要対応に数え、姿勢が導けなければ「測れなかった」', () => {
    const { buildReport } = req('../../../scripts/dependency-audit-report.cjs') as {
      buildReport: (x: unknown) => { actionable: number; markdown: string };
    };
    const quiet = { all: [], prod: [], floors: [], pins: [], watch: { problems: [], exploited: [], likely: [], hotGaps: [], stackKev: [], notes: [] } };
    const stalledPosture = sp.analyzePosture(base, NOW);
    const withPosture = buildReport({ ...quiet, posture: stalledPosture, generatedAt: NOW });
    expect(withPosture.markdown).toContain('セキュリティの姿勢');
    expect(withPosture.actionable).toBeGreaterThanOrEqual(stalledPosture.actionable);
    expect(buildReport({ ...quiet, posture: null, generatedAt: NOW }).actionable).toBeGreaterThanOrEqual(1);
  });

  it('npm script が在り、CLAUDE.md の定期点検の道具に載っている', () => {
    const pkg = JSON.parse(readOriginalSource('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['audit:security-posture']).toContain('security-posture.cjs');
    expect(readOriginalSource('CLAUDE.md')).toContain('npm run audit:security-posture');
  });
});

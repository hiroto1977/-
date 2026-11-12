import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

/*
 * **狩りの輪 (`scripts/hunt-cycle.cjs`) —— 探索 → 解析 → 対策 → 報告 を止まらずに回す仕組み。**
 * (threat: T-214)
 *
 * 姿勢の測定 (T-167) は「次はどこを狩るか」を導くが、狩りを起動する側は人で、回ったか (いつ・どの面を・
 * 何を直し・どこへ報告したか) を数える物が無かった。ここで留めるのは:
 *
 *   ① 面の選び方 —— 止まった面が先・次に最後に狩った日が最も古い面 (輪になる)・同じ日に同じ台帳なら同じ答え
 *   ② 記録の検め —— 4 段すべて・穴は脅威台帳に実在する id・対策した物だけ・報告は PR 番号か理由
 *   ③ 止まった判定 —— cadence × 2 日で止まる・1 周も無ければ止まっている・読めない日付は 0 件と混ぜない
 *   ④ 実物 —— 輪の台帳の全行が今の脅威台帳で通る・brief が実物で読めない物 0 件
 *   ⑤ 配線 —— 毎日の報告が輪の状態を載せ、止まった輪を要対応に数える・予約の指示文と道具が同じ段を名指す
 */

const req = createRequire(import.meta.url);
type Cycle = Record<string, unknown>;
type Loop = { stalled: boolean; ageDays: number | null; stallDays: number; cadenceDays: number; problems: string[]; actionable: number; last: Cycle | null };
const hc = req('../../../scripts/hunt-cycle.cjs') as {
  buildBrief: (x: { ledger: unknown; cycles: unknown; doc: string; now: string }) => { id: string; surface: string; problems: string[]; markdown: string };
  cycleProblems: (cycle: unknown, ledger: unknown, cycles: unknown) => string[];
  loopStatus: (cycles: unknown, now: string) => Loop;
  renderLoop: (s: Loop) => string;
  STAGES: string[];
  DEFAULT_CADENCE_DAYS: number;
  STALL_MULTIPLIER: number;
};
const ledger = req('../../../security/threat-ledger.json') as { surfaces: string[]; threats: { id: string; status: string }[] };
const cyclesFile = req('../../../security/hunt-cycles.json') as { cadenceDays: number; cycles: (Cycle & { id: string; date: string; surface: string })[] };

const t = (id: string, surface: string, found: string, status = 'fixed', severity = 'medium') => ({ id, surface, found, severity, status });
const base = {
  surfaces: ['a', 'b', 'c'],
  threats: [t('T-001', 'a', '2026-10-20'), t('T-002', 'b', '2026-08-01'), t('T-003', 'c', '2026-10-20', 'open')],
  huntBacklog: [{ surface: 'b', item: '古い', why: '2026-08-02 に残した' }],
  clearedBacklog: [],
  classes: [],
};
const cyc = (id: string, date: string, surface: string, extra: Record<string, unknown> = {}) => ({
  id,
  date,
  surface,
  pickedBy: 'brief',
  explore: { targets: ['x.ts'], reports: 1 },
  analyze: { confirmed: ['T-001'], unconfirmed: 0, healthy: 1 },
  countermeasure: { threats: ['T-001'], backlog: 0 },
  report: { pr: 1, summary: 's' },
  ...extra,
});
const DOC = '# x\n\n## surface: a\n\nA\n\n## surface: b\n\nB\n\n## surface: c\n\nC\n\n## 回す頻度\n';
const NOW = '2026-10-28';

describe('狩りの輪 — 面の選び方 (threat: T-214)', () => {
  it('★ 姿勢が「止まった」と言う面 (狩り残しが在るのに穴が出ていない) を最初に狩る', () => {
    const b = hc.buildBrief({ ledger: base, cycles: { cycles: [] }, doc: DOC, now: NOW });
    expect(b.surface).toBe('b');
    expect(b.id).toBe('HC-001');
  });

  it('★ 止まった面が無ければ、最後に狩った日が最も古い面へ戻る (5 面で 1 巡の輪)', () => {
    const noStall = { ...base, huntBacklog: [] };
    const three = [cyc('HC-001', '2026-10-21', 'a'), cyc('HC-002', '2026-10-22', 'b'), cyc('HC-003', '2026-10-23', 'c')];
    expect(hc.buildBrief({ ledger: noStall, cycles: { cycles: three }, doc: DOC, now: NOW }).surface).toBe('a');
    expect(hc.buildBrief({ ledger: noStall, cycles: { cycles: three.slice(0, 1) }, doc: DOC, now: NOW }).surface).toBe('b');
  });

  it('同じ日に同じ台帳なら同じ答え (決定的)', () => {
    const x = hc.buildBrief({ ledger: base, cycles: cyclesFile, doc: DOC, now: NOW });
    const y = hc.buildBrief({ ledger: base, cycles: cyclesFile, doc: DOC, now: NOW });
    expect(x.markdown).toBe(y.markdown);
  });

  it('手順書に節が無い面は読めない物として出す (空の手順で狩らせない)', () => {
    const b = hc.buildBrief({ ledger: { ...base, huntBacklog: [], surfaces: ['zz'] }, cycles: { cycles: [] }, doc: DOC, now: NOW });
    expect(b.problems.some((p) => p.includes('zz'))).toBe(true);
  });
});

describe('狩りの輪 — 記録の検め (threat: T-214)', () => {
  const empty = { cycles: [] };
  it('★ 4 段そろった記録は通り、段を 1 つでも落とすと断る (飛ばした段は記録できない)', () => {
    expect(hc.cycleProblems(cyc('HC-001', NOW, 'a'), base, empty)).toEqual([]);
    for (const s of hc.STAGES) {
      const probs = hc.cycleProblems(cyc('HC-001', NOW, 'a', { [s]: undefined }), base, empty);
      expect(probs.some((p) => p.includes(s)), `段 ${s} を落としても断らない`).toBe(true);
    }
  });

  it('★ 解析・対策の穴は脅威台帳に実在する id で、対策に挙げられるのは閉じた物だけ', () => {
    const an = { confirmed: [], unconfirmed: 0, healthy: 0 };
    expect(hc.cycleProblems(cyc('HC-001', NOW, 'a', { analyze: an, countermeasure: { threats: ['T-999'], backlog: 0 } }), base, empty).join('\n')).toContain('T-999');
    expect(hc.cycleProblems(cyc('HC-001', NOW, 'a', { analyze: an, countermeasure: { threats: ['T-003'], backlog: 0 } }), base, empty).join('\n')).toContain('T-003');
  });

  it('★ 確認した穴は対策に在る (確認したのに黙って落とせない)', () => {
    expect(hc.cycleProblems(cyc('HC-001', NOW, 'a', { countermeasure: { threats: [], backlog: 0 } }), base, empty).join('\n')).toContain('T-001');
  });

  it('★ 報告は PR 番号か、出さなかった理由を持つ', () => {
    expect(hc.cycleProblems(cyc('HC-001', NOW, 'a', { report: { pr: null, summary: 's' } }), base, empty).join('\n')).toContain('reason');
    expect(hc.cycleProblems(cyc('HC-001', NOW, 'a', { report: { pr: null, reason: '健全だった', summary: 's' } }), base, empty)).toEqual([]);
  });

  it('雛形のままの記録・次でない id・同じ id・暦に無い日付・台帳に無い面は断る', () => {
    expect(hc.cycleProblems(cyc('HC-001', NOW, 'a', { explore: { targets: ['<見た所>'], reports: 1 } }), base, empty).join('\n')).toContain('explore.targets');
    const one = { cycles: [cyc('HC-001', '2026-10-01', 'a')] };
    expect(hc.cycleProblems(cyc('HC-003', NOW, 'a'), base, one).join('\n')).toContain('HC-002');
    expect(hc.cycleProblems(cyc('HC-001', NOW, 'a'), base, one).join('\n')).toContain('既に');
    expect(hc.cycleProblems(cyc('HC-001', '2026-02-31', 'zz'), base, empty).length).toBeGreaterThanOrEqual(2);
  });
});

describe('狩りの輪 — 止まった判定 (threat: T-214)', () => {
  it('★ 最後の周から cadence × 2 日で止まる (1 日手前は止まっていない)', () => {
    const day = (n: number) => new Date(Date.UTC(2026, 9, 28) - n * 86_400_000).toISOString().slice(0, 10);
    const at = (age: number) => hc.loopStatus({ cadenceDays: 7, cycles: [cyc('HC-001', day(age), 'a')] }, NOW);
    const stall = 7 * hc.STALL_MULTIPLIER;
    expect(at(stall - 1).stalled).toBe(false);
    expect(at(stall).stalled).toBe(true);
    expect(at(stall).actionable).toBe(1);
  });

  it('★ 1 周も無ければ止まっている', () => {
    const s = hc.loopStatus({ cycles: [] }, NOW);
    expect(s.stalled).toBe(true);
    expect(s.last).toBeNull();
    expect(s.cadenceDays).toBe(hc.DEFAULT_CADENCE_DAYS);
  });

  it('読めない日付は problems (0 件と混ぜない)・今日が読めなければ投げる', () => {
    const s = hc.loopStatus({ cycles: [cyc('HC-001', 'bad', 'a')] }, NOW);
    expect(s.problems.length).toBe(1);
    expect(() => hc.loopStatus({ cycles: [] }, 'yesterday')).toThrow();
  });

  it('文面は止まった印と最後の周の報告 (PR) を出す', () => {
    const live = hc.loopStatus({ cadenceDays: 7, cycles: [cyc('HC-001', '2026-10-27', 'a')] }, NOW);
    expect(hc.renderLoop(live)).toContain('PR #1');
    expect(hc.renderLoop(hc.loopStatus({ cycles: [] }, NOW))).toContain('1 周も記録が無い');
  });
});

describe('狩りの輪 — 実物の台帳 (threat: T-214)', () => {
  it('★ 輪の台帳の全行が、今の脅威台帳で record の検めを通る (再生)', () => {
    const seen: Cycle[] = [];
    for (const c of cyclesFile.cycles) {
      expect(hc.cycleProblems(c, ledger, { cycles: seen }), `${c.id} が通らない`).toEqual([]);
      seen.push(c);
    }
    expect(seen.length).toBeGreaterThanOrEqual(1);
  });

  it('★ brief が実物の台帳で読めない物 0 件・次の面は脅威台帳の面', () => {
    const b = hc.buildBrief({ ledger, cycles: cyclesFile, doc: readOriginalSource('docs/THREAT_HUNT.md'), now: NOW });
    expect(b.problems).toEqual([]);
    expect(ledger.surfaces).toContain(b.surface);
    expect(b.markdown).toContain(`## surface: ${b.surface}`.replace('## surface: ', ''));
    expect(b.markdown).toContain('"id": "HC-');
  });
});

describe('狩りの輪 — 配線 (threat: T-214)', () => {
  it('★ 毎日の報告が輪の状態を導いて載せ、止まった輪を要対応に数える', () => {
    const src = stripComments(readOriginalSource('scripts/dependency-audit-report.cjs'));
    expect(src).toContain("require('./hunt-cycle.cjs')");
    expect(src).toMatch(/const loop = loopStatus\(/);
    expect(src).toContain('renderLoop(posture.loop)');
    expect(src).toContain('loop.actionable');
    const { buildReport } = req('../../../scripts/dependency-audit-report.cjs') as { buildReport: (x: unknown) => { actionable: number; markdown: string } };
    const quiet = { all: [], prod: [], floors: [], pins: [], watch: { problems: [], exploited: [], likely: [], hotGaps: [], stackKev: [], notes: [] } };
    const loop = hc.loopStatus({ cycles: [] }, NOW);
    const r = buildReport({ ...quiet, posture: { surfaces: [], stalled: [], recheckDue: [], thinClasses: [], queue: [], problems: [], actionable: loop.actionable, loop }, generatedAt: NOW });
    expect(r.markdown).toContain('狩りの輪');
    expect(r.actionable).toBeGreaterThanOrEqual(1);
  });

  it('★ 予約の指示文は道具と同じ 4 段を同じ順で名指し、brief / record を呼び、draft PR でマージしない', () => {
    const doc = readOriginalSource('docs/HUNT_CYCLE_PROMPT.md');
    const block = /```\n([\s\S]*?)\n```/.exec(doc)?.[1] ?? '';
    expect(block.length).toBeGreaterThan(200);
    const order = hc.STAGES.map((s) => block.indexOf(`(${s})`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(block).toContain('npm run hunt:cycle -- brief');
    expect(block).toContain('npm run hunt:cycle -- record');
    expect(block).toContain('draft PR');
    expect(block).toContain('マージはしない');
  });

  it('npm script・手順書の節・CLAUDE.md の命令・CODEOWNERS (指示文は所有者のレビュー)', () => {
    const pkg = JSON.parse(readOriginalSource('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['hunt:cycle']).toContain('hunt-cycle.cjs');
    expect(pkg.scripts['hunt:cycle']).toContain('--self-test');
    expect(readOriginalSource('docs/THREAT_HUNT.md')).toContain('## 輪を回す仕組み');
    expect(readOriginalSource('CLAUDE.md')).toContain('npm run hunt:cycle');
    expect(readOriginalSource('.github/CODEOWNERS')).toContain('/docs/HUNT_CYCLE_PROMPT.md @');
  });
});

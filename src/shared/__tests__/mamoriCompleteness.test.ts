import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readOriginalSource } from './originalSource';

/*
 * **Mamori の完成度の基準** (2026-11-10)。基準の表 `security/mamori-completeness.json` (5 つの視点 × 15 の基準・1.0 の条件) を、
 * `scripts/lib/mamori-completeness.cjs` が実測から採点する。ここは ① 表と測り方が 1 対 1 ② 採点が実物で動く ③ 「測れなかった」を満点にしない
 * ④ 1.0 の条件は全基準が床以上 ⑤ report への配線 を留める。実物が今 1.0 を満たすかは主張しない (満たしていないのが正直な今で、増えるのが正しい向き)。
 */
const ROOT = join(__dirname, '..', '..', '..');
const req = createRequire(__filename);

interface Crit { id: string; metric: string; question: string; target: string; floor: number; why: string }
interface Persp { id: string; name: string; claim: string; criteria: Crit[] }
interface Rubric { gate: { name: string; rule: string }; perspectives: Persp[] }
interface Scored { id: string; pass: boolean; score: number; detail: string; floor: number }
interface Persp2 { id: string; score: number; criteria: Scored[] }
const comp = req(join(ROOT, 'scripts', 'lib', 'mamori-completeness.cjs')) as {
  metrics: Record<string, (i: Record<string, unknown>) => { score: number; detail: string }>;
  scoreAll: (r: Rubric, i: Record<string, unknown>) => Persp2[];
  summarize: (r: Rubric, p: Persp2[]) => { overallPct: number; passed: number; total: number; reachesGate: boolean; failing: Scored[]; weakest: { id: string } | null };
  render: (p: Persp2[], s: unknown) => string;
  gather: (root: string, x: Record<string, unknown>) => Record<string, unknown>;
};
const growth = req(join(ROOT, 'scripts', 'mamori-growth.cjs')) as {
  buildBrief: (i: { ledger: unknown; files: unknown; now: string }) => { measured: unknown[] };
  growthStatus: (l: unknown, now: string) => unknown;
  wallFiles: (root: string) => unknown;
  countMamoriFiles: (root: string) => number;
};
const rubric = JSON.parse(readOriginalSource(join(ROOT, 'security', 'mamori-completeness.json'))) as Rubric;
const ledger = JSON.parse(readOriginalSource(join(ROOT, 'security', 'mamori-growth.json')));
const allCriteria = rubric.perspectives.flatMap((p) => p.criteria);
/** 採点が「測れなかった」と言うときの文面 (測り方が無い基準・読めない入力)。実物の採点にこの文面が 1 つも出ないことを見る —— 針が当たる標本は下の it が持つ。 */
const UNMEASURED = /測り方.*が無い|測れていない/;

const realInput = (): Record<string, unknown> => {
  const now = '2026-11-10';
  const brief = growth.buildBrief({ ledger, files: growth.wallFiles(ROOT), now });
  return comp.gather(ROOT, { ledger, growth: growth.growthStatus(ledger, now), mamoriFiles: growth.countMamoriFiles(ROOT), tsWalls: brief.measured.length });
};

describe('Mamori の完成度の基準 (視点 × 基準)', () => {
  it('★ 表は視点が複数で、どの基準も問い・目標・床・理由を持ち、id は重ならない', () => {
    expect(rubric.perspectives.length).toBeGreaterThanOrEqual(5);
    for (const c of allCriteria) {
      expect(c.question.length, c.id).toBeGreaterThan(10);
      expect(c.target.length, c.id).toBeGreaterThan(0);
      expect(c.why.length, `${c.id} の理由`).toBeGreaterThan(20);
      expect(c.floor > 0 && c.floor <= 1, `${c.id} の床`).toBe(true);
    }
    expect(new Set(allCriteria.map((c) => c.id)).size).toBe(allCriteria.length);
    expect(rubric.gate.rule).toMatch(/全基準/);
    // 理由の欄に保留の決まり文句を置かない (法則 no-weakness-as-spec)
    for (const c of allCriteria) expect(c.why, c.id).not.toMatch(/^(同上|TBD|あとで|未定)/);
  });

  it('★ 表の測り方と実装の測り方は 1 対 1 (表だけ増えて測れていない基準・測るのに表に無い基準を許さない)', () => {
    const inTable = new Set(allCriteria.map((c) => c.metric));
    expect([...inTable].filter((m) => !Object.hasOwn(comp.metrics, m))).toEqual([]);
    expect(Object.keys(comp.metrics).filter((m) => !inTable.has(m))).toEqual([]);
    expect(inTable.size).toBe(allCriteria.length);
  });

  it('★ 実物で採点でき、どの点も 0〜1 で、測り方が無い基準は 1 つも無い', () => {
    const scored = comp.scoreAll(rubric, realInput());
    expect(scored.flatMap((p) => p.criteria).length).toBe(allCriteria.length);
    for (const p of scored) {
      expect(p.score >= 0 && p.score <= 1, p.id).toBe(true);
      for (const c of p.criteria) {
        expect(c.score >= 0 && c.score <= 1, c.id).toBe(true);
        expect(c.detail, c.id).not.toMatch(UNMEASURED);
      }
    }
  });

  it('針の標本: 測り方の無い基準と読めない入力の文面に、上の針が当たる', () => {
    // 測り方が実装に無い基準を 1 つ足した表 —— 採点は 0 点で「測り方 (…) が無い」と書く
    const extra = { ...rubric, perspectives: [{ ...rubric.perspectives[0]!, criteria: [{ ...allCriteria[0]!, id: 'Z9', metric: 'no-such-metric' }] }] };
    const unknown = comp.scoreAll(extra, realInput()).flatMap((p) => p.criteria);
    expect(unknown.length).toBe(1);
    expect(unknown[0]!.score).toBe(0);
    expect(unknown[0]!.detail).toMatch(UNMEASURED);
    // 周の記録が読めない入力 —— 「測れていない」と書く
    const noCycles = comp.metrics['recent-holes']!({ ...realInput(), ledger: {} });
    expect(noCycles.score).toBe(0);
    expect(noCycles.detail).toMatch(UNMEASURED);
  });

  it('★ 測れなかった物を満点にしない (空の入力はどの基準も 1 点にならない)', () => {
    const empty = { ledger: {}, growth: null, mamoriFiles: 0, tsWalls: 0, corpus: null, threats: [], capabilityModules: new Set(), packageScripts: {}, stryker: null, files: new Set(), testsText: '', mamoriSources: [], protectedPaths: [], mamoriDoc: '' };
    const scored = comp.scoreAll(rubric, empty).flatMap((p) => p.criteria);
    // 口を持つ .mamori が 0 本のときの capability-ledger だけは「載せる物が無い」ので満点 (空の母集団に対する正しい答え)
    for (const c of scored.filter((x) => x.id !== 'A2')) expect(c.pass, `${c.id}: ${c.detail}`).toBe(false);
  });

  it('★ 1.0 の条件は全基準が床以上: 1 つでも床の下なら満たさない・全部満たせば満たす', () => {
    const scored = comp.scoreAll(rubric, realInput());
    const pass = scored.map((p) => ({ ...p, criteria: p.criteria.map((c) => ({ ...c, pass: true, score: 1 })), score: 1 }));
    expect(comp.summarize(rubric, pass).reachesGate).toBe(true);
    const one = pass.map((p, i) => (i === 0 ? { ...p, criteria: p.criteria.map((c, j) => (j === 0 ? { ...c, pass: false, score: 0.5 } : c)) } : p));
    const s = comp.summarize(rubric, one);
    expect(s.reachesGate).toBe(false);
    expect(s.failing.length).toBe(1);
    expect(s.passed).toBe(s.total - 1);
  });

  it('★ 基準ごとの対照: 穴が出れば H1 が下がり、壁が増えれば E1 が下がり、規則が検査から消えれば V1 が下がる', () => {
    const base = realInput();
    const m = comp.metrics;
    // 穴の無い周だけの台帳で測る —— 実物の台帳は穴を見つけた周 (MG-064 の T-260 ほか) を持ちうるので、実物に「穴 0 件」を求めない
    const noHole = { ...base, ledger: { ...(base.ledger as object), cycles: [{ probes: [{ result: 'refused' }] }] } };
    expect(m['recent-holes']!(noHole).score).toBe(1);
    const withHole = { ...base, ledger: { ...(base.ledger as object), cycles: [{ probes: [{ result: 'hole' }] }] } };
    expect(m['recent-holes']!(withHole).score).toBeLessThan(1);
    expect(m['wall-migration']!({ ...base, mamoriFiles: 10, tsWalls: 90 }).score).toBeCloseTo(0.1, 5);
    expect(m['syntax-backlog']!({ ...base, ledger: { constructs: { a: { decision: 'added' }, b: { decision: 'feature' } } } }).score).toBeCloseTo(0.5, 5);
    expect(m['rule-tests']!({ ...base, testsText: 'M0 M1 M2 M3 M4 M5 M6' }).score).toBeCloseTo(7 / 8, 5);
    expect(m['doc-per-version']!({ ...base, ledger: { constructs: { a: { decision: 'added', since: '0.99' } } }, mamoriDoc: '## 0.9 —— x' }).score).toBe(0);
    expect(m['doc-per-version']!({ ...base, ledger: { constructs: { a: { decision: 'added', since: '0.9' } } }, mamoriDoc: '## 0.9 —— x' }).score).toBe(1);
    expect(m['compiler-protected']!({ ...base, protectedPaths: [] }).score).toBe(0);
    expect(m['compiler-mutation-scope']!({ ...base, stryker: { mutate: ['src/shared/mamori/parser.ts'] } }).score).toBeCloseTo(0.2, 5);
    expect(m['capability-ledger']!({ ...base, mamoriSources: [{ path: 'a.mamori', source: 'extern sink global w;' }], capabilityModules: new Set() }).score).toBe(0);
    expect(m['cycle-mutation']!({ ...base, ledger: { cycles: [{ kind: 'feature', mutation: { score: 90 } }, { kind: 'port', mutation: { unavailable: '理由' } }] } }).score).toBeCloseTo(0.5, 5);
  });

  it('★ report が視点の表と「1.0 まで足りない基準」を出す (配線)', () => {
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'mamori-growth.cjs'), 'report'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('## 完成度の基準');
    for (const p of rubric.perspectives) expect(r.stdout).toContain(p.name);
    expect(r.stdout).toMatch(/合格した基準 \*\*\d+ \/ 15\*\*/);
  });
});

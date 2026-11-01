import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readOriginalSource } from './originalSource';

/*
 * **言語を育てる輪** (2026-10-30 · パス 563 · threat: T-221 / T-224)。
 *
 * 利用者の依頼「半永久的に言語を育て続けて」。Mamori は週 1 の予約のセッションが育てる ——
 * `scripts/mamori-growth.cjs` の brief が守りの壁の TypeScript を実測して次に育てる物 (移す / 構文を足す / 穴を探す) を決め、
 * record が 1 周を検めてから `security/mamori-growth.json` へ足し、status が止まりを報せる (毎日の dependency-audit が載せる)。
 * ここは道具の判定・実物の台帳・指示文と予約の一致・報告への配線を留める。
 */
const ROOT = join(__dirname, '..', '..', '..');
const req = createRequire(__filename);
const growth = req(join(ROOT, 'scripts', 'mamori-growth.cjs')) as {
  DETECTORS: readonly { id: string; name: string }[];
  DETECTOR_IDS: readonly string[];
  measureFile: (src: string) => Record<string, number>;
  buildCompleteness: (i: { ledger: Ledger; brief: Brief; mamoriFiles: number }) => { version: string | null; mamoriFiles: number; tsWalls: number; migrationPct: number | null; constructs: { added: number; feature: number; rewrite: number }; proposals: { kind: string; target: string; why: string }[]; markdown: string };
  countMamoriFiles: (root: string) => number;
  buildBrief: (i: { ledger: Ledger; files: readonly { path: string; lines: number; source: string }[]; now: string }) => Brief;
  cycleProblems: (c: unknown, l: Ledger, threats: ReadonlySet<string>, exists: (p: string) => boolean) => string[];
  applyCycle: (l: Ledger, c: Cycle) => Ledger;
  growthStatus: (l: Ledger, now: string) => { stalled: boolean; ageDays: number | null; actionable: number; problems: string[]; version: string | null };
  renderGrowth: (s: ReturnType<typeof growth.growthStatus>) => string;
  ledgerProblems: (l: unknown) => string[];
  wallFiles: (root: string) => { path: string; lines: number; source: string }[];
  MIN_PROBES: number;
};

interface Ledger {
  cadenceDays: number;
  language: { version: string };
  constructs: Record<string, { decision: string; why: string; risk?: string; since?: string }>;
  cycles: Cycle[];
}
interface Cycle {
  id: string;
  date: string;
  kind: string;
  target: string;
  pickedBy: string;
  briefPick?: string;
  deviation?: string;
  version: string;
  features: string[];
  added: string[];
  rewrite: string[];
  ported: string[];
  probes: { tried: string; result: string }[];
  threats: string[];
  controls: number;
  mutation: { files?: string[]; score?: number; unavailable?: string };
  report: { pr: number | null; reason?: string; summary: string };
}
interface Brief {
  id: string;
  pick: { kind: string; target: string; why: string };
  measured: { path: string; portable: boolean; missing: string[]; needs: string[] }[];
  features: { id: string; unblocks: string[]; files: number }[];
  problems: string[];
  markdown: string;
}

const LEDGER_PATH = join(ROOT, 'security', 'mamori-growth.json');
const realLedger = (): Ledger => JSON.parse(readOriginalSource(LEDGER_PATH)) as Ledger;

/** 検出器 1 つずつに、当たる標本 (実物の TypeScript で書かれる形)。 */
const POSITIVE: Readonly<Record<string, string>> = {
  class: 'export class Vault {}',
  index: 'const b = a[0];',
  'optional-chain': 'const v = a?.b;',
  'non-null': 'const v = a!.b;',
  spread: 'f(...xs);',
  while: 'while (i < 3) { i = i + 1; }',
  'c-for': 'for (let i = 0; i < n; i++) {}',
  'for-in': 'for (const k in o) {}',
  'as-cast': 'const v = raw as Shape;',
  'as-const': 'const v = [1] as const;',
  template: 'const s = `a${b}`;',
  'arrow-block': 'const f = (x: number) => { return x; };',
  'generic-call': 'const p = Promise.all<Result>(xs);',
  'generic-decl': 'export function id<T>(x: T): T { return x; }',
  instanceof: 'if (e instanceof Error) {}',
  'in-op': "if ('k' in o) {}",
  destructure: 'const { a, b } = o;',
  'compound-assign': 'total += 1;',
  'member-assign': 'o.k = 1;',
  'loose-eq': 'if (a == b) {}',
  'catch-binding': 'try { f(); } catch (e) { g(); }',
  finally: 'try { f(); } finally { g(); }',
  'optional-param': 'export function f(a?: string): void {}',
  'export-from': "export { a } from './a';",
  'export-default': 'export default 1;',
  'namespace-import': "import * as path from 'node:path';",
  'inline-type-import': "import { type A, b } from './a';",
  'side-effect-import': "import './polyfill';",
  'interface-extends': 'interface A extends B { x: 1 }',
  declare: 'declare const X: number;',
  delete: 'delete o.k;',
  generator: 'function* g() { yield 1; }',
  satisfies: 'const c = {} satisfies Shape;',
  'nested-function': 'export function f() {\n  function g() {}\n}',
  bitwise: 'const v = a << 2;',
};

describe('言語を育てる輪 —— 構文の検出器 (heuristic)', () => {
  it('★ 道具の self-test が通る (npm run mamori:grow が先に回す)', () => {
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'mamori-growth.cjs'), '--self-test'], { encoding: 'utf8' });
    expect(r.stdout + r.stderr).toContain('✅ self-test 全件一致');
    expect(r.status).toBe(0);
  });

  it('★ どの検出器も、当たる標本に当たる (標本の表は検出器と両方向に一致)', () => {
    expect(Object.keys(POSITIVE).sort()).toEqual([...growth.DETECTOR_IDS].sort());
    for (const [id, src] of Object.entries(POSITIVE)) {
      expect(growth.measureFile(`${src}\n`)[id], `${id}: 標本 ${JSON.stringify(src)} に当たらない`).toBeGreaterThan(0);
    }
  });

  it('★ 注記と文字列の中の構文は数えない (どの標本も注記に包めば 0 件)', () => {
    for (const [id, src] of Object.entries(POSITIVE)) {
      const commented = src.split('\n').map((l) => `// ${l}`).join('\n');
      expect(growth.measureFile(`${commented}\n`)[id], `${id}: 注記の中で数えた`).toBeUndefined();
    }
    expect(growth.measureFile("const s = 'a[0] x?.y class Z';\n")).toEqual({});
  });

  it('対照: Mamori が既に持つ形は数えない (オブジェクトの字面・条件演算子・switch・for…of・throw・型の配列)', () => {
    expect(growth.measureFile("const o = { a: 1 };\nconst t = a > 1 ? 'x' : 'y';\nswitch (a) {}\nfor (const x of xs) {}\nthrow new Error('e');\nlet arr: string[];\n")).toEqual({});
  });
});

describe('言語を育てる輪 —— 実物の台帳と壁', () => {
  it('★ 台帳は健全 (構文の判断は検出器と両方向・足す候補は risk を持つ・理由は 10 字以上)', () => {
    expect(growth.ledgerProblems(realLedger())).toEqual([]);
  });

  it('★ 言語に置かないと決めた構文 (as / テンプレート文字列) は rewrite のまま —— 足す候補に戻さない (M0)', () => {
    const c = realLedger().constructs;
    expect(c['as-cast']!.decision).toBe('rewrite');
    expect(c['as-const']!.decision).toBe('rewrite');
    expect(c.template!.decision).toBe('rewrite');
  });

  it('★ 足す候補のうち T-224 の表を迂回しうる構文 (添字・分割代入・optional chaining) は、risk がその塞ぎ方を名乗る', () => {
    const c = realLedger().constructs;
    for (const id of ['index', 'destructure', 'optional-chain']) {
      if (c[id]!.decision !== 'feature') continue;
      expect(c[id]!.risk, id).toMatch(/T-224|constructor/);
    }
  });

  it('★ 移す候補の母集団は「必ず測る壁」のうちまだ TypeScript の物 (Mamori で書いた壁は入らない)', () => {
    const walls = growth.wallFiles(ROOT).map((f) => f.path);
    expect(walls.length).toBeGreaterThanOrEqual(20);
    for (const done of ['src/shared/proxyEndpoint.ts', 'src/shared/externalUrlGate.ts', 'src/shared/imageUrlGate.ts', 'src/main/shellOpenGate.ts']) {
      expect(walls, done).not.toContain(done);
    }
  });

  it('★ 実物の brief は決定的で、問題が無く、選んだ物の理由を名乗る', () => {
    const files = growth.wallFiles(ROOT);
    const a = growth.buildBrief({ ledger: realLedger(), files, now: '2026-10-30' });
    const b = growth.buildBrief({ ledger: realLedger(), files, now: '2026-10-30' });
    expect(a.pick).toEqual(b.pick);
    expect(a.problems).toEqual([]);
    expect(['port', 'feature', 'probe']).toContain(a.pick.kind);
    expect(a.pick.why.length).toBeGreaterThan(10);
    expect(a.markdown).toContain(`## 今週育てる物: **${a.pick.kind}** \`${a.pick.target}\``);
    // 移すと選んだなら、その壁は本当に足りない構文が全部 rewrite (足す候補が 0)
    if (a.pick.kind === 'port') expect(a.measured.find((m) => m.path === a.pick.target)!.needs).toEqual([]);
  });
});

describe('言語を育てる輪 —— 選び方・記録・止まり', () => {
  const L = (over: Partial<Ledger> = {}): Ledger => ({
    cadenceDays: 7,
    language: { version: '0.2' },
    constructs: Object.fromEntries(growth.DETECTOR_IDS.map((id) => [id, { decision: id === 'template' ? 'rewrite' : 'feature', why: '検査の理由です (10 字以上)', risk: '来歴の規則を外す道を先に塞ぐ' }])),
    cycles: [],
    ...over,
  });
  const f = (path: string, source: string) => ({ path, lines: source.split('\n').length, source });

  it('★ 移せる壁 (足りない構文がどれも rewrite) が在れば port —— いちばん短い物', () => {
    const b = growth.buildBrief({ ledger: L(), files: [f('src/long.ts', 'const s = `x`;\n\n\n'), f('src/short.ts', 'const s = `y`;\n'), f('src/cls.ts', 'class A {}\n')], now: '2026-10-30' });
    expect(b.pick).toMatchObject({ kind: 'port', target: 'src/short.ts' });
  });

  it('★ 移せる壁が無ければ、足すとそれだけで移せるようになる壁が最多の構文 (同数なら使う壁の数・id の順)', () => {
    const b = growth.buildBrief({ ledger: L(), files: [f('src/a.ts', 'class A {}\n'), f('src/b.ts', 'class B {}\n'), f('src/c.ts', 'const v = a?.b;\nclass C {}\n')], now: '2026-10-30' });
    expect(b.pick).toMatchObject({ kind: 'feature', target: 'class' });
    expect(b.features[0]).toMatchObject({ id: 'class', files: 3 });
    expect(b.features[0]!.unblocks).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('★ 足した構文 (added) は足りない構文に数えない —— 足した周の次は別の物を選ぶ', () => {
    const ledger = L();
    ledger.constructs.class = { decision: 'added', why: '足した構文の理由です', since: '0.3' };
    const b = growth.buildBrief({ ledger, files: [f('src/a.ts', 'class A {}\n')], now: '2026-10-30' });
    expect(b.pick).toMatchObject({ kind: 'port', target: 'src/a.ts' });
  });

  it('★ どちらも無ければ probe (言語の穴を探す)', () => {
    expect(growth.buildBrief({ ledger: L(), files: [], now: '2026-10-30' }).pick.kind).toBe('probe');
  });

  const good = (): Cycle => ({
    id: 'MG-001', date: '2026-10-30', kind: 'feature', target: 'class', pickedBy: 'brief', briefPick: 'feature:class', version: '0.3',
    features: ['クラスを足した'], added: ['class'], rewrite: [], ported: [],
    probes: [1, 2, 3].map((n) => ({ tried: `破る形 ${n}`, result: 'refused' })), threats: [], controls: 2,
    mutation: { files: ['src/shared/mamori/parser.ts'], score: 100 }, report: { pr: 900, summary: '1 行の要約' },
  });
  const T = new Set(['T-224']);
  const ok = (): boolean => true;

  it('対照: 正しい記録は通り、反映すると版が上がり足した構文は added', () => {
    expect(growth.cycleProblems(good(), L(), T, ok)).toEqual([]);
    const next = growth.applyCycle(L(), good());
    expect(next.language.version).toBe('0.3');
    expect(next.constructs.class).toMatchObject({ decision: 'added', since: '0.3' });
    expect(next.cycles).toHaveLength(1);
    expect(growth.ledgerProblems(next)).toEqual([]);
  });

  const REFUSALS: readonly [string, (c: Cycle) => Cycle, RegExp][] = [
    ['probes が 3 つに満たない (言語を破る試しを飛ばす)', (c) => ({ ...c, probes: c.probes.slice(0, 2) }), /probes .*3 つ以上/],
    ['probes が雛形のまま', (c) => ({ ...c, probes: [...c.probes.slice(0, 2), { tried: '<3>', result: 'refused' }] }), /雛形/],
    ['穴が出たのに脅威台帳の id が無い', (c) => ({ ...c, probes: [...c.probes.slice(0, 2), { tried: 'x', result: 'hole' }] }), /穴 \(hole\)/],
    ['脅威台帳に無い id', (c) => ({ ...c, threats: ['T-999'] }), /脅威台帳に無い/],
    ['構文を足したのに版を上げない', (c) => ({ ...c, version: '0.2' }), /版を上げる/],
    ['版を下げる', (c) => ({ ...c, version: '0.1' }), /より古い/],
    ['変異検査が 100 でない', (c) => ({ ...c, mutation: { files: ['x'], score: 99.9 } }), /mutation\.score/],
    ['対照を回していない', (c) => ({ ...c, controls: 0 }), /対照を 1 つ以上/],
    ['brief と違う物を理由なしに育てる', (c) => ({ ...c, target: 'index', added: ['index'] }), /deviation/],
    ['番号を飛ばす', (c) => ({ ...c, id: 'MG-003' }), /次の番号 MG-001/],
    ['検出器に無い構文を added に', (c) => ({ ...c, added: ['teleport'] }), /検出器に無い/],
    ['port なのに移した .mamori が無い', (c) => ({ ...c, kind: 'port', briefPick: 'port:class', ported: [] }), /ported/],
    ['PR も理由も無い', (c) => ({ ...c, report: { pr: null, summary: 'x' } }), /report\.reason/],
  ];
  for (const [name, edit, want] of REFUSALS) {
    it(`★ 断る: ${name}`, () => {
      const problems = growth.cycleProblems(edit(good()), L(), T, ok);
      expect(problems.some((p) => want.test(p)), problems.join('\n')).toBe(true);
    });
  }

  it('★ 止まり: cadence × 2 日空けば止まった (要対応 1)・記録が無くても止まった', () => {
    const s = growth.growthStatus(L({ cycles: [{ ...good(), date: '2026-10-01' }] }), '2026-10-30');
    expect(s).toMatchObject({ stalled: true, ageDays: 29, actionable: 1 });
    expect(growth.growthStatus(L({ cycles: [{ ...good(), date: '2026-10-25' }] }), '2026-10-30')).toMatchObject({ stalled: false, ageDays: 5, actionable: 0 });
    expect(growth.growthStatus(L(), '2026-10-30').stalled).toBe(true);
    expect(growth.renderGrowth(growth.growthStatus(L(), '2026-10-30'))).toContain('1 周も記録が無い');
  });

  it('★ report: 完成度は実測から導き (版・移行率・構文の数)、次の提案は brief の順位と probe を含む (threat: 利用者の依頼 2026-11-01)', () => {
    const files = [f('src/a.ts', 'const s = `x`;\n'), f('src/b.ts', 'class A {}\nconst v = x[0];\n'), f('src/c.ts', 'const q = x[1];\n')];
    const ledger = L();
    const brief = growth.buildBrief({ ledger, files, now: '2026-11-01' });
    const c = growth.buildCompleteness({ ledger, brief, mamoriFiles: 3 });
    expect(c.version).toBe('0.2');
    expect(c.tsWalls).toBe(3);
    expect(c.mamoriFiles).toBe(3);
    expect(c.migrationPct).toBe(50);
    expect(c.constructs.rewrite).toBe(1);
    expect(c.constructs.added).toBe(0);
    expect(c.constructs.feature).toBe(growth.DETECTOR_IDS.length - 1);
    expect(c.proposals[c.proposals.length - 1]?.kind).toBe('probe');
    expect(c.proposals.some((p) => p.kind === 'feature' && p.target === 'index')).toBe(true);
    expect(c.markdown).toContain('守りの壁の移行: .mamori 3 本 / まだ TypeScript の壁 3 本 → 目安 50%');
    expect(c.markdown).toContain('## 次の作業の提案');
  });

  it('report: 壁も .mamori も 0 本なら移行率は null (0 で割らない・0% と言わない)', () => {
    const ledger = L();
    const brief = growth.buildBrief({ ledger, files: [], now: '2026-11-01' });
    const c = growth.buildCompleteness({ ledger, brief, mamoriFiles: 0 });
    expect(c.migrationPct).toBeNull();
    expect(c.markdown).not.toContain('目安');
  });
});

describe('言語を育てる輪 —— 報告・指示文・口の配線', () => {
  it('★ 毎日の報告が輪の状態を載せ、止まれば要対応に数える', () => {
    const src = readOriginalSource(join(ROOT, 'scripts', 'dependency-audit-report.cjs'));
    expect(src).toContain("require('./mamori-growth.cjs')");
    expect(src).toContain('renderGrowth(posture.growth)');
    expect(src).toContain('growth.actionable');
    expect(src).toContain("'security', 'mamori-growth.json'");
  });

  it('★ npm run mamori:grow は self-test を先に回す', () => {
    const pkg = JSON.parse(readOriginalSource(join(ROOT, 'package.json'))) as { scripts: Record<string, string> };
    expect(pkg.scripts['mamori:grow']).toBe('node scripts/mamori-growth.cjs --self-test > /dev/null && node scripts/mamori-growth.cjs');
  });

  it('★ 予約の指示文は道具の 3 つの段と、破る試し・変異検査 100%・draft PR・record を名乗る', () => {
    const doc = readOriginalSource(join(ROOT, 'docs', 'MAMORI_GROWTH_PROMPT.md'));
    const prompt = doc.slice(doc.indexOf('<!-- prompt:start -->'), doc.indexOf('<!-- prompt:end -->'));
    expect(prompt.length).toBeGreaterThan(500);
    for (const needle of ['npm run mamori:grow -- brief', 'npm run mamori:grow -- record', '3 つ以上', '100.00%', 'draft PR', 'マージはしない', 'npm run mamori:grow -- report', 'security/threat-ledger.json', 'deviation']) {
      expect(prompt, needle).toContain(needle);
    }
    expect(prompt).toContain(String(growth.MIN_PROBES) + ' つ以上');
  });
  it('★ report: 実物の台帳・木で走り、.mamori の本数は木を数えた値と一致する', () => {
    const r = spawnSync('node', [join(ROOT, 'scripts', 'mamori-growth.cjs'), 'report', '--json'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout) as { mamoriFiles: number; tsWalls: number; version: string };
    expect(out.mamoriFiles).toBe(growth.countMamoriFiles(ROOT));
    expect(out.mamoriFiles).toBeGreaterThanOrEqual(11);
    expect(out.tsWalls).toBe(growth.wallFiles(ROOT).length);
    expect(out.version).toBe((JSON.parse(readOriginalSource(join(ROOT, 'security', 'mamori-growth.json'))) as Ledger).language.version);
  });
});

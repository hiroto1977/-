import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

/*
 * **常設の AI ホワイトハッカー班 (`scripts/hacker-team.cjs` · `security/hacker-team.json`)** (threat: T-222)
 *
 * 狩りの輪 (T-214) は週 1 で回るが、狩るのは毎回同じ 1 人の監査役で、見つけた穴の「型」はどこにも残らず、
 * 名簿は人が書き換えない限り変わらなかった。ここで留めるのは:
 *
 *   ① 名簿 —— 実物が健全・4 種 (赤 / 変種狩り / 反証役 / 進化役) と core の偵察がそろう・役の面と型は脅威台帳に在る
 *   ② 編成 —— 偵察が 1 人目・面に効く赤だけ・出番の古い役から (輪になる)・同じ入力なら同じ答え
 *   ③ 自己学習 —— 確認した穴 1 つにつき型が要り、record がそれを次の周の変種狩りの種にする
 *   ④ 自己進化 —— 役の追加・引退は record が検めてから入る・core は引退できない・赤は編成の人数を割らない
 *   ⑤ 配線 —— brief が班と種を載せ、record が名簿を書き戻し、予約の指示文が 4 種の役を名指す
 */

const req = createRequire(import.meta.url);
type Role = { id: string; kind: string; core?: boolean; surfaces: string[]; classes: string[]; mission: string; name: string; retiredIn?: string; addedIn?: string };
type Team = { lineup: { red: number }; roles: Role[]; patterns: { id: string; threat: string; shape: string; look: string; learnedIn: string }[] };
type Lineup = { red: Role[]; variant: Role | null; blue: Role | null; evolver: Role | null };
const ht = req('../../../scripts/hacker-team.cjs') as {
  teamProblems: (team: unknown, ledger: unknown) => string[];
  pickLineup: (team: unknown, cycles: unknown, surface: string) => Lineup;
  variantSeeds: (team: unknown, ledger: unknown, surface: string) => { patterns: unknown[]; threats: { id: string }[] };
  droughtRoles: (team: unknown, cycles: unknown) => { id: string; uses: number }[];
  teamCycleProblems: (cycle: unknown, team: unknown, ledger: unknown) => string[];
  applyCycle: (team: unknown, cycle: unknown) => Team;
  KINDS: string[];
  DROUGHT_USES: number;
};
const hc = req('../../../scripts/hunt-cycle.cjs') as {
  buildBrief: (x: { ledger: unknown; cycles: unknown; doc: string; now: string; team?: unknown }) => { surface: string; problems: string[]; markdown: string; lineup: { red: string[] } | null };
  cycleProblems: (cycle: unknown, ledger: unknown, cycles: unknown, roster?: unknown) => string[];
};
const ledger = req('../../../security/threat-ledger.json') as { surfaces: string[]; classes: { id: string }[]; threats: { id: string; surface: string; status: string }[] };
const roster = req('../../../security/hacker-team.json') as Team;
const cyclesFile = req('../../../security/hunt-cycles.json') as { cycles: { id: string }[] };
const NOW = '2026-10-30';

const M = 'じゅうぶんに長い任務の説明 (二十字以上ある)';
const role = (id: string, kind: string, extra: Partial<Role> = {}): Role => ({ id, kind, name: id, surfaces: ['any'], classes: kind === 'red' ? ['x'] : [], mission: M, ...extra });
const tl = {
  surfaces: ['a', 'b'],
  classes: [{ id: 'x' }, { id: 'y' }],
  threats: [
    { id: 'T-001', surface: 'a', found: '2026-10-01', class: 'x', title: '古い', status: 'fixed' },
    { id: 'T-002', surface: 'a', found: '2026-10-20', class: 'y', title: '新しい', status: 'fixed' },
  ],
};
const team: Team = {
  lineup: { red: 3 },
  roles: [
    role('recon', 'red', { core: true }),
    role('r-a', 'red', { surfaces: ['a'] }),
    role('r-b', 'red', { surfaces: ['b'] }),
    role('r-ab', 'red', { surfaces: ['a', 'b'] }),
    role('r-any', 'red'),
    role('variant', 'variant', { core: true }),
    role('blue', 'blue', { core: true }),
    role('evolver', 'evolver', { core: true }),
  ],
  patterns: [],
};
const used = (id: string, date: string, roles: [string, string[]?][]) => ({ id, date, team: roles.map(([r, confirmed = []]) => ({ role: r, reports: 1, confirmed })) });
const goodCycle = {
  id: 'HC-002',
  analyze: { confirmed: ['T-002'] },
  team: [
    { role: 'recon', reports: 2, confirmed: ['T-002'] },
    { role: 'variant', reports: 0, confirmed: [] },
    { role: 'blue', reports: 1, confirmed: [] },
    { role: 'evolver', reports: 0, confirmed: [] },
  ],
  learned: [{ threat: 'T-002', shape: '素の .length で文字数を数える', look: 'grep -n "\\.length >"' }],
  evolution: { add: [], retire: [], notes: '名簿は変えない' },
};

describe('ハッカー班 — 名簿 (threat: T-222)', () => {
  it('★ 実物の名簿が今の脅威台帳で健全 (役の面と型は台帳に在る・4 種と偵察がそろう)', () => {
    expect(ht.teamProblems(roster, ledger)).toEqual([]);
    const kinds = new Set(roster.roles.filter((r) => r.retiredIn === undefined).map((r) => r.kind));
    expect([...kinds].sort()).toEqual([...ht.KINDS].sort());
    expect(roster.roles.some((r) => r.kind === 'red' && r.core === true)).toBe(true);
  });

  it('★ 脅威台帳のどの攻撃の型にも、受け持つ活動中の赤が居る (型を見ない班を作らない)', () => {
    const covered = new Set(roster.roles.filter((r) => r.kind === 'red' && r.retiredIn === undefined).flatMap((r) => r.classes));
    for (const c of ledger.classes) expect(covered.has(c.id), `型 ${c.id} を受け持つ赤が居ない`).toBe(true);
  });

  it('★ 脅威台帳のどの面にも、偵察のほかに効く赤が居る', () => {
    const lineup = (s: string) => ht.pickLineup(roster, [], s).red.map((r) => r.id);
    for (const s of ledger.surfaces) expect(lineup(s).length, `面 ${s} に偵察しか居ない`).toBeGreaterThanOrEqual(2);
  });

  it('壊れた名簿は断る (台帳に無い型・反証役が 2 人・型の番号の飛び・core の引退)', () => {
    expect(ht.teamProblems({ ...team, roles: [...team.roles, role('z', 'red', { classes: ['zz'] })] }, tl).join('\n')).toContain('zz');
    expect(ht.teamProblems({ ...team, roles: [...team.roles, role('blue2', 'blue')] }, tl).join('\n')).toContain('blue');
    expect(ht.teamProblems({ ...team, patterns: [{ id: 'P-002', threat: 'T-001', shape: 's', look: 'l', learnedIn: 'HC-001' }] }, tl).join('\n')).toContain('P-001');
    expect(ht.teamProblems({ ...team, roles: team.roles.map((r) => (r.id === 'recon' ? { ...r, retiredIn: 'HC-001' } : r)) }, tl).join('\n')).toContain('core');
    expect(ht.teamProblems(null, tl)).toHaveLength(1);
  });
});

describe('ハッカー班 — 編成 (threat: T-222)', () => {
  it('★ 偵察が 1 人目・面に効かない赤は出ない・人数は lineup.red', () => {
    const l = ht.pickLineup(team, [], 'a');
    expect(l.red.map((r) => r.id)).toEqual(['recon', 'r-a', 'r-ab']);
    expect([l.variant?.id, l.blue?.id, l.evolver?.id]).toEqual(['variant', 'blue', 'evolver']);
  });

  it('★ 出番の古い役から回る (1 度も出ていない役が先) —— 毎周同じ角度にしない', () => {
    const l = ht.pickLineup(team, [used('HC-001', '2026-10-21', [['recon'], ['r-a'], ['r-ab']])], 'a');
    expect(l.red.map((r) => r.id)).toEqual(['recon', 'r-any', 'r-a']);
  });

  it('同じ古さなら収穫 (確認した穴) の多い役が先', () => {
    const l = ht.pickLineup(team, [used('HC-001', '2026-10-21', [['r-a', ['T-001']], ['r-ab']])], 'a');
    expect(l.red.map((r) => r.id)).toEqual(['recon', 'r-any', 'r-a']);
  });

  it('★ 収穫の無い役: 3 周以上出て確認 0 の赤 (core は除く) を名指す', () => {
    const dry = [1, 2, 3].map((n) => used(`HC-00${n}`, `2026-10-0${n}`, [['r-a'], ['recon']]));
    expect(ht.droughtRoles(team, dry)).toEqual([{ id: 'r-a', uses: ht.DROUGHT_USES }]);
    expect(ht.droughtRoles(team, dry.slice(0, 2))).toEqual([]);
  });
});

describe('ハッカー班 — 自己学習と自己進化 (threat: T-222)', () => {
  it('★ 班の段がそろった記録は通り、確認した穴に型が無ければ断る (学ばずに閉じない)', () => {
    expect(ht.teamCycleProblems(goodCycle, team, tl)).toEqual([]);
    expect(ht.teamCycleProblems({ ...goodCycle, learned: [] }, team, tl).join('\n')).toContain('T-002');
    expect(ht.teamCycleProblems({ ...goodCycle, learned: [{ threat: 'T-002', shape: '<型>', look: 'x' }] }, team, tl).join('\n')).toContain('shape');
  });

  it('★ 確認した穴はどれかの役に帰属し、4 種の役がそろって出る', () => {
    expect(ht.teamCycleProblems({ ...goodCycle, team: goodCycle.team.map((e) => ({ ...e, confirmed: [] })) }, team, tl).join('\n')).toContain('帰属');
    expect(ht.teamCycleProblems({ ...goodCycle, team: goodCycle.team.filter((e) => e.role !== 'blue') }, team, tl).join('\n')).toContain('blue');
    expect(ht.teamCycleProblems({ ...goodCycle, team: [...goodCycle.team, { role: 'ghost', reports: 0, confirmed: [] }] }, team, tl).join('\n')).toContain('ghost');
  });

  it('★ 進化: core は引退できず、赤が編成の人数を割る引退は断り、足す役も名簿と同じ規則を通る', () => {
    const ev = (e: object) => ht.teamCycleProblems({ ...goodCycle, evolution: { add: [], retire: [], notes: 'n', ...e } }, team, tl).join('\n');
    expect(ev({ retire: ['recon'] })).toContain('core');
    expect(ev({ retire: ['r-a', 'r-b', 'r-ab', 'r-any'] })).toContain('割る');
    expect(ev({ add: [role('n', 'red', { classes: ['zz'] })] })).toContain('zz');
    expect(ev({ add: [role('n', 'blue')] })).toContain('赤の役だけ');
    expect(ev({ add: [role('r-a', 'red')] })).toContain('既に');
    expect(ht.teamCycleProblems({ ...goodCycle, evolution: undefined }, team, tl).join('\n')).toContain('evolution');
  });

  it('★ 反映: 学んだ型は P-001 から番号つきで入り、次の周の変種狩りの種になる', () => {
    const next = ht.applyCycle(team, { ...goodCycle, evolution: { add: [role('r-new', 'red')], retire: ['r-b'], notes: 'n' } });
    expect(next.patterns).toEqual([{ id: 'P-001', threat: 'T-002', shape: '素の .length で文字数を数える', look: 'grep -n "\\.length >"', learnedIn: 'HC-002' }]);
    expect(next.roles.find((r) => r.id === 'r-new')?.addedIn).toBe('HC-002');
    expect(next.roles.find((r) => r.id === 'r-b')?.retiredIn).toBe('HC-002');
    expect(ht.teamProblems(next, tl)).toEqual([]);
    expect(ht.variantSeeds(next, tl, 'a').patterns).toHaveLength(1);
    expect(ht.variantSeeds(next, tl, 'a').threats[0]?.id).toBe('T-002');
    expect(ht.pickLineup(next, [], 'b').red.some((r) => r.id === 'r-b')).toBe(false);
  });

  it('★ 名簿を渡した record は、brief で選んだ周に班の段を要求する (手で回した周は要求しない)', () => {
    const cyc = {
      id: 'HC-001', date: NOW, surface: 'a', pickedBy: 'brief',
      explore: { targets: ['x.ts'], reports: 1 }, analyze: { confirmed: ['T-002'], unconfirmed: 0, healthy: 0 },
      countermeasure: { threats: ['T-002'], backlog: 0 }, report: { pr: 1, summary: 's' },
    };
    expect(hc.cycleProblems(cyc, tl, { cycles: [] }, team).join('\n')).toContain('team');
    expect(hc.cycleProblems({ ...cyc, ...goodCycle, id: 'HC-001', analyze: cyc.analyze }, tl, { cycles: [] }, team)).toEqual([]);
    expect(hc.cycleProblems({ ...cyc, pickedBy: 'manual' }, tl, { cycles: [] }, team)).toEqual([]);
  });
});

describe('ハッカー班 — 配線 (threat: T-222)', () => {
  it('★ 実物の brief が今週の班・変種狩りの種・班の段の雛形を載せ、読めない物 0 件', () => {
    const b = hc.buildBrief({ ledger, cycles: cyclesFile, doc: readOriginalSource('docs/THREAT_HUNT.md'), now: NOW, team: roster });
    expect(b.problems).toEqual([]);
    expect(b.markdown).toContain('## 今週の班');
    expect(b.markdown).toContain('## 変種狩りの種');
    expect(b.markdown).toContain('"learned"');
    expect(b.markdown).toContain('"evolution"');
    expect(b.lineup?.red[0]).toBe('recon');
  });

  it('★ 輪の台帳の全行が、名簿つきの record の検めも通る (再生)', () => {
    const seen: unknown[] = [];
    for (const c of cyclesFile.cycles) {
      expect(hc.cycleProblems(c, ledger, { cycles: seen }, roster), `${c.id} が通らない`).toEqual([]);
      seen.push(c);
    }
  });

  it('★ 予約の指示文は 4 種の役を名指し、並べて起動し、学びと進化を record で書き戻す', () => {
    const block = /## 指示文\s+```\n([\s\S]*?)\n```/.exec(readOriginalSource('docs/HUNT_CYCLE_PROMPT.md'))?.[1] ?? '';
    for (const word of ['security/hacker-team.json', '変種狩り', '反証役', '進化役', '並べて', 'learned', 'evolution', 'マージはしない']) {
      expect(block, `指示文に「${word}」が無い`).toContain(word);
    }
  });

  it('self-test が通り、npm script が両方の self-test を回す', () => {
    const r = spawnSync(process.execPath, ['scripts/hacker-team.cjs', '--self-test'], { encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const pkg = JSON.parse(readOriginalSource('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['hunt:cycle']).toContain('hacker-team.cjs --self-test');
  });
});

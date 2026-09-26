import { describe, it, expect } from 'vitest';
import {
  buildVillagers,
  buildRegions,
  buildDispatchPlan,
  backlogByTeam,
  teamEmoji,
  roleOf,
  teamChain,
  villageSummary,
  type VillageRegistry,
} from '../villageData';
import { org, teams, teamFirstRound, backlog } from '../../../../orchestration/registry.json';

const REG: VillageRegistry = {
  org: org as VillageRegistry['org'],
  teams: teams as VillageRegistry['teams'],
  teamFirstRound: teamFirstRound as VillageRegistry['teamFirstRound'],
  backlog: backlog as VillageRegistry['backlog'],
};

describe('buildVillagers — full org roster', () => {
  it('produces exactly 143 villagers (1+1+5+20+8+108)', () => {
    const v = buildVillagers(REG);
    const activeTeams = REG.teams.filter((t) => t.active).length;
    const secBodies = REG.org.secretaries.reduce((n, s) => n + s.members, 0);
    const expected = 1 + 1 + REG.org.executives.length + secBodies + REG.org.managers.length + activeTeams;
    expect(v.length).toBe(expected);
    expect(v.length).toBe(143);
  });

  it('every villager has a unique id', () => {
    const ids = buildVillagers(REG).map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has exactly one CEO and one COO', () => {
    const v = buildVillagers(REG);
    expect(v.filter((x) => x.kind === 'ceo').length).toBe(1);
    expect(v.filter((x) => x.kind === 'coo').length).toBe(1);
  });

  it('expands each secretariat room into its member bodies', () => {
    const secs = buildVillagers(REG).filter((x) => x.kind === 'secretary');
    const secBodies = REG.org.secretaries.reduce((n, s) => n + s.members, 0);
    expect(secs.length).toBe(secBodies);
    // 各役員の街区に紐づく
    for (const s of secs) expect(s.regionId.startsWith('exec-')).toBe(true);
  });

  it('assigns every team villager to its manager and exec region', () => {
    const teamsV = buildVillagers(REG).filter((x) => x.kind === 'team');
    expect(teamsV.length).toBe(REG.teams.filter((t) => t.active).length);
    for (const t of teamsV) {
      expect(t.managerId).toBeTruthy();
      expect(t.regionId).toBe(`exec-${t.execId}`);
      expect(t.chain).toContain('→');
    }
  });

  it('is deterministic — same registry yields identical roster', () => {
    expect(JSON.stringify(buildVillagers(REG))).toBe(JSON.stringify(buildVillagers(REG)));
  });
});

describe('teamEmoji / roleOf', () => {
  it('maps roles to distinct emoji', () => {
    expect(teamEmoji('research')).toBe('🔬');
    expect(teamEmoji('audit')).toBe('🕵️');
    expect(teamEmoji('impl')).toBe('🧑‍🔧');
  });
  it('defaults missing role to impl', () => {
    expect(roleOf({ role: undefined })).toBe('impl');
    expect(roleOf({ role: 'audit' })).toBe('audit');
  });
});

describe('buildRegions', () => {
  it('has ceo, coo and one region per executive', () => {
    const r = buildRegions(REG);
    expect(r.find((x) => x.id === 'ceo')).toBeTruthy();
    expect(r.find((x) => x.id === 'coo')).toBeTruthy();
    expect(r.filter((x) => x.kind === 'exec').length).toBe(REG.org.executives.length);
  });

  it('shortens exec labels to the acronym so building-card headers do not overflow', () => {
    // 「最高投資責任者 (CIO / Chief Investment Officer)」→「CIO」。別名併記でもヘッダが溢れない。
    const execRegions = buildRegions(REG).filter((x) => x.kind === 'exec');
    for (const r of execRegions) {
      expect(r.label).not.toContain('/');
      expect(r.label.length).toBeLessThanOrEqual(6);
    }
    const cio = execRegions.find((x) => x.execId === 'cio');
    expect(cio?.label).toBe('CIO');
  });
});

describe('teamChain', () => {
  it('formats チーム → 部長 → 役員', () => {
    const t = REG.teams.find((x) => x.manager === 'mgr-tax')!;
    const chain = teamChain(t, REG.org.managers, REG.org.executives);
    expect(chain).toContain('チーム →');
    expect(chain).toContain('CFO');
  });
});

describe('buildDispatchPlan', () => {
  it('covers every active team exactly once', () => {
    const plan = buildDispatchPlan(REG);
    const active = REG.teams.filter((t) => t.active).map((t) => t.id).sort();
    expect(plan.map((s) => s.teamId).sort()).toEqual(active);
  });

  it('orders in-progress/designed/blocked ahead of shipped', () => {
    const plan = buildDispatchPlan(REG);
    const weight = (s?: string) =>
      s === 'in-progress' ? 0 : s === 'designed' ? 1 : s === 'blocked' ? 2 : 3;
    for (let i = 1; i < plan.length; i++) {
      expect(weight(plan[i - 1]?.status)).toBeLessThanOrEqual(weight(plan[i]?.status));
    }
  });

  it('is deterministic', () => {
    expect(JSON.stringify(buildDispatchPlan(REG))).toBe(JSON.stringify(buildDispatchPlan(REG)));
  });

  it('surfaces the blocked backlog team with a blocked status', () => {
    const blockedTeams = new Set(REG.backlog.filter((b) => b.status === 'blocked').map((b) => b.team));
    const plan = buildDispatchPlan(REG);
    for (const s of plan) {
      if (blockedTeams.has(s.teamId)) expect(s.status).toBe('blocked');
    }
  });

  /*
   * ★ **2 つ目・3 つ目の並びの鍵** (2026-09-26 · パス 483)。直す前は
   * 「状態の重み」しか主張しておらず、初出 round と id の並びは誰も見ていなかった
   * —— その初出を `rounds` から数えるのをやめて派生索引から読む形にしたので、
   * ここで並びそのものを留める。
   */
  it('★ 同じ状態の中では初出 round の早い順、同じ round なら id の昇順', () => {
    const plan = buildDispatchPlan(REG);
    const weight = (s?: string) =>
      s === 'in-progress' ? 0 : s === 'designed' ? 1 : s === 'blocked' ? 2 : 3;
    const first = (id: string): number => REG.teamFirstRound[id] ?? Number.MAX_SAFE_INTEGER;
    let sameWeight = 0;
    let sameRound = 0;
    for (let i = 1; i < plan.length; i++) {
      const a = plan[i - 1]!;
      const b = plan[i]!;
      if (weight(a.status) !== weight(b.status)) continue;
      sameWeight += 1;
      expect(first(a.teamId), `${a.teamId} → ${b.teamId}`).toBeLessThanOrEqual(first(b.teamId));
      if (first(a.teamId) === first(b.teamId)) {
        sameRound += 1;
        expect(a.teamId < b.teamId, `${a.teamId} → ${b.teamId} (同じ round は id の昇順)`).toBe(true);
      }
    }
    // 走査が空虚でない (実物で両方の鍵が実際に効いている)。
    expect(sameWeight).toBeGreaterThanOrEqual(50);
    expect(sameRound).toBeGreaterThanOrEqual(1);
  });

  it('★ 索引は prototype を経由せずに引き、数でない値は「未出現」として末尾へ', () => {
    const team = (id: string) => ({ id, domain: 'x', focus: 'x', active: true, manager: 'm' });
    const mini: VillageRegistry = {
      org: {
        ceo: { id: 'ceo', title: 'CEO' },
        coo: { id: 'coo', title: 'COO', owns: [] },
        executives: [],
        secretaries: [],
        managers: [],
      },
      teams: [team('toString'), team('constructor'), team('b'), team('a')],
      teamFirstRound: { b: 1, a: 2 },
      backlog: [],
    };
    // 素の添字だと 'constructor' / 'toString' は関数を返し、比較が NaN になって並びが壊れる。
    expect(buildDispatchPlan(mini).map((s) => s.teamId)).toEqual(['b', 'a', 'constructor', 'toString']);
  });
});

describe('backlogByTeam / villageSummary', () => {
  it('indexes backlog status by team', () => {
    const map = backlogByTeam(REG);
    expect(map.size).toBeGreaterThan(0);
  });
  it('summary states the 143-body total', () => {
    expect(villageSummary(REG)).toContain('143');
  });
});

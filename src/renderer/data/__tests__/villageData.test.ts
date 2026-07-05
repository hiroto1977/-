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
import { org, teams, rounds, backlog } from '../../../../orchestration/registry.json';

const REG: VillageRegistry = {
  org: org as VillageRegistry['org'],
  teams: teams as VillageRegistry['teams'],
  rounds: rounds as VillageRegistry['rounds'],
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

import { describe, expect, it } from 'vitest';
import {
  buildOrgIndex,
  routeTopic,
  routeLabel,
  orgSummaryLine,
  type RawExecutive,
  type RawManager,
  type RawTeam,
} from '../chatOrg';
import { org as realOrg, teams as realTeams } from '../../../../orchestration/registry.json';
import type { RawOrg } from '../chatOrg';

// --- フィクスチャ (registry の最小縮約) ------------------------------------

const EXECS: readonly RawExecutive[] = [
  { id: 'cfo', title: '最高財務責任者 (CFO)', domain: '財務・税務・資金調達' },
  { id: 'cqo', title: '最高品質責任者 (CQO)' }, // domain なし (skip 分岐)
  { id: 'cxo', title: '特殊役員 (CXO)', domain: '・特殊領域' }, // 先頭に空セグメント
];
const MANAGERS: readonly RawManager[] = [
  { id: 'mgr-tax', title: '税務部長', reportsTo: 'cfo', teams: ['tax-income'] },
  { id: 'mgr-ghost', title: '幽霊部長', reportsTo: 'nobody', teams: [] },
];
const TEAMS: readonly RawTeam[] = [
  { id: 'tax-income', domain: '税務(所得税)', focus: '所得税・速算表', manager: 'mgr-tax' },
  { id: 'orphan', domain: '迷子', focus: '管理者不在', manager: 'missing-mgr' },
];
const ORG = { executives: EXECS, managers: MANAGERS, secretaries: [{}, {}, {}, {}, {}] };
const INDEX = buildOrgIndex(ORG, TEAMS);

describe('buildOrgIndex', () => {
  it('counts executives/managers/teams/secretaries exactly', () => {
    expect(INDEX.counts).toEqual({ executives: 3, managers: 2, teams: 2, secretaries: 5 });
    expect(INDEX.executives).toBe(EXECS);
    expect(INDEX.managers).toBe(MANAGERS);
    expect(INDEX.teams).toBe(TEAMS);
  });

  it('treats missing secretaries as 0', () => {
    const noSec = buildOrgIndex({ executives: EXECS, managers: MANAGERS }, TEAMS);
    expect(noSec.counts.secretaries).toBe(0);
  });
});

describe('routeTopic', () => {
  it('resolves a team by domain substring and walks manager → executive', () => {
    const r = routeTopic(INDEX, '所得税');
    expect(r.team?.id).toBe('tax-income');
    expect(r.manager?.id).toBe('mgr-tax');
    expect(r.executive?.id).toBe('cfo');
  });

  it('resolves a team by focus substring', () => {
    expect(routeTopic(INDEX, '速算表').team?.id).toBe('tax-income');
  });

  it('resolves when the topic contains the whole team domain', () => {
    const r = routeTopic(INDEX, '税務(所得税)の件で相談');
    expect(r.team?.id).toBe('tax-income');
    expect(r.executive?.id).toBe('cfo');
  });

  it('returns team-only when the team manager id is dangling', () => {
    const r = routeTopic(INDEX, '迷子');
    expect(r.team?.id).toBe('orphan');
    expect(r.manager).toBeUndefined();
    expect(r.executive).toBeUndefined();
  });

  it('falls back to manager title stem when no team matches', () => {
    const r = routeTopic(INDEX, '税務まわり全般');
    expect(r.team).toBeUndefined();
    expect(r.manager?.id).toBe('mgr-tax');
    expect(r.executive?.id).toBe('cfo');
  });

  it('keeps executive undefined when manager reportsTo is dangling', () => {
    const r = routeTopic(INDEX, '幽霊の話');
    expect(r.manager?.id).toBe('mgr-ghost');
    expect(r.executive).toBeUndefined();
  });

  it('falls back to executive domain word match when no team/manager matches', () => {
    const r = routeTopic(INDEX, '財務の相談');
    expect(r.team).toBeUndefined();
    expect(r.manager).toBeUndefined();
    expect(r.executive?.id).toBe('cfo');
  });

  it('returns empty route for empty topic and for no match', () => {
    expect(routeTopic(INDEX, '')).toEqual({});
    // 'xyz' は domain なし役員 (cqo) と空セグメント domain ('・特殊領域') を素通りして
    // 空 route になる — 空セグメントを真扱いする変異 (includes('') は常に true) を撃墜。
    expect(routeTopic(INDEX, 'xyz')).toEqual({});
  });

  it('matches a non-empty domain segment after a leading separator', () => {
    expect(routeTopic(INDEX, '特殊領域の相談').executive?.id).toBe('cxo');
  });
});

describe('routeLabel', () => {
  it('joins team → manager → executive with arrows', () => {
    expect(routeLabel(routeTopic(INDEX, '所得税'))).toBe(
      '税務(所得税)チーム → 税務部長 → 最高財務責任者 (CFO)',
    );
  });

  it('renders manager → executive without team', () => {
    expect(routeLabel(routeTopic(INDEX, '税務まわり全般'))).toBe('税務部長 → 最高財務責任者 (CFO)');
  });

  it('renders executive only', () => {
    expect(routeLabel({ executive: EXECS[0] })).toBe('最高財務責任者 (CFO)');
  });

  it('renders COO 直轄 for an empty route', () => {
    expect(routeLabel({})).toBe('COO 直轄');
  });
});

describe('orgSummaryLine', () => {
  it('renders the exact summary line', () => {
    expect(orgSummaryLine(INDEX)).toBe(
      'CEO 1 / COO 1 / 役員 3 / 秘書室 5 室 / 管理職 2 / 一般職チーム 2',
    );
  });
});

// --- 実 registry との結線 (将来の組織成長にも追随することの担保) -----------

describe('real orchestration registry integration', () => {
  const real = buildOrgIndex(realOrg as RawOrg, realTeams as readonly RawTeam[]);

  it('loads the live org with at least the round-102 shape', () => {
    expect(real.counts.executives).toBeGreaterThanOrEqual(5);
    expect(real.counts.managers).toBeGreaterThanOrEqual(8);
    expect(real.counts.teams).toBeGreaterThanOrEqual(108);
    expect(real.counts.secretaries).toBeGreaterThanOrEqual(5);
  });

  it('routes 税務 topics to 税務部長 under CFO', () => {
    const r = routeTopic(real, '税務');
    expect(r.manager?.title).toBe('税務部長');
    expect(r.executive?.title).toBe('最高財務責任者 (CFO)');
  });
});

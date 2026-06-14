import { describe, expect, it } from 'vitest';
import {
  buildOrgIndex,
  routeTopic,
  routeLabel,
  orgSummaryLine,
  scoreTopicMatch,
  routeTopicScored,
  confidenceLabel,
  MIN_TEAM_SCORE,
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

  it('returns a route with no keys (not {executive: undefined}) on no match', () => {
    // toEqual は undefined プロパティを無視するため、キーの不在を明示的に検証する。
    expect(Object.keys(routeTopic(INDEX, 'xyz'))).toEqual([]);
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

describe('scoreTopicMatch', () => {
  const tax = TEAMS[0]!; // domain '税務(所得税)' (7字), focus '所得税・速算表'
  it('returns 0 for an empty topic', () => {
    expect(scoreTopicMatch(tax, '')).toBe(0);
    expect(scoreTopicMatch(tax, '無関係')).toBe(0);
  });
  it('scores domain-substring + focus match', () => {
    // domain.includes('所得税') +50, focus.includes('所得税') +30
    expect(scoreTopicMatch(tax, '所得税')).toBe(80);
  });
  it('scores focus-only match', () => {
    expect(scoreTopicMatch(tax, '速算表')).toBe(30);
  });
  it('scores topic-contains-domain by domain length × 4', () => {
    // '税務(所得税)' = 7 字 → 28
    expect(scoreTopicMatch(tax, '税務(所得税)の件で相談')).toBe(28);
  });
  it('scores an exact domain match highest', () => {
    // domain===topic +100, かつ topic.includes(domain) で +28 → 128
    expect(scoreTopicMatch(tax, '税務(所得税)')).toBe(128);
  });
  it('gives short domains a low (noisy) score below the threshold', () => {
    const orphan = TEAMS[1]!; // domain '迷子' (2字) → 8
    expect(scoreTopicMatch(orphan, '迷子について長い相談')).toBe(8);
    expect(scoreTopicMatch(orphan, '迷子について長い相談')).toBeLessThan(MIN_TEAM_SCORE);
  });
});

describe('routeTopicScored (思考の精度: 採点 + 確信度ゲート)', () => {
  it('commits to the best-scoring team with high confidence', () => {
    const r = routeTopicScored(INDEX, '所得税');
    expect(r.route.team?.id).toBe('tax-income');
    expect(r.route.executive?.id).toBe('cfo');
    expect(r.confidence).toBe(0.8); // 80/100
    expect(r.candidates[0]?.score).toBe(80);
  });

  it('excludes zero-scoring teams from the candidates (filter)', () => {
    // orphan は '所得税' に 0 点 → 候補に残らない。
    const r = routeTopicScored(INDEX, '所得税');
    expect(r.candidates.map((c) => c.team.id)).toEqual(['tax-income']);
  });

  it('sorts candidates by score even when the input order is reversed', () => {
    // 入力順は [low, high] だが、高スコアが先頭に来る（ソートが効いている担保）。
    const low: RawTeam = { id: 'low', domain: '節税', focus: 'x', manager: 'mgr-tax' };
    const high: RawTeam = { id: 'high', domain: '節税対策の特例', focus: 'x', manager: 'mgr-tax' };
    const idx = buildOrgIndex(ORG, [low, high]);
    const r = routeTopicScored(idx, '節税対策の特例について');
    expect(r.candidates.map((c) => c.team.id)).toEqual(['high', 'low']);
    expect(r.route.team?.id).toBe('high');
  });

  it('commits a team-only route when a high-scoring team has a dangling manager', () => {
    const hi: RawTeam = { id: 'hi', domain: '特命', focus: '特命', manager: 'nope' };
    const idx = buildOrgIndex(ORG, [hi]);
    const r = routeTopicScored(idx, '特命');
    expect(r.route.team?.id).toBe('hi');
    expect(r.route.manager).toBeUndefined();
    expect(r.confidence).toBe(1); // domain 完全一致 100+ → min(1, ..)
  });

  it('ranks candidates by score (best first)', () => {
    // 話題が両 domain を内包: tax-income(28) と 迷子(8) がともにスコアし降順に並ぶ。
    const r = routeTopicScored(INDEX, '税務(所得税)迷子の件');
    expect(r.candidates.map((c) => c.team.id)).toEqual(['tax-income', 'orphan']);
    expect(r.candidates[0]!.score).toBe(28);
    expect(r.candidates[1]!.score).toBe(8);
  });

  it('escalates to the manager when the best team score is below the threshold', () => {
    // 迷子(8 < 20) のみ正スコア。チーム確定せず、税務部長の語幹一致へフォールバック。
    const r = routeTopicScored(INDEX, '迷子だが税務部長案件');
    expect(r.route.team).toBeUndefined();
    expect(r.route.manager?.id).toBe('mgr-tax');
    expect(r.confidence).toBe(0.4);
    expect(r.ambiguous).toBe(false); // フォールバックは曖昧扱いしない
  });

  it('escalates to COO (empty route) when nothing matches confidently', () => {
    const r = routeTopicScored(INDEX, '迷子について長い相談');
    expect(r.route).toEqual({});
    expect(r.confidence).toBe(0);
    expect(r.ambiguous).toBe(false);
  });

  it('falls back to executive domain when only an executive matches', () => {
    const r = routeTopicScored(INDEX, '財務の相談');
    expect(r.route.executive?.id).toBe('cfo');
    expect(r.confidence).toBe(0.3);
    expect(r.ambiguous).toBe(false);
  });

  it('returns empty for an empty topic', () => {
    expect(routeTopicScored(INDEX, '')).toEqual({ route: {}, confidence: 0, candidates: [], ambiguous: false });
  });

  it('flags an ambiguous decision when the top two teams score within the margin', () => {
    // 2チームがともに focus 一致(30) → 同点 (差 0 < 20) → 曖昧。
    const a: RawTeam = { id: 'a', domain: 'X', focus: '共通語', manager: 'mgr-tax' };
    const b: RawTeam = { id: 'b', domain: 'Y', focus: '共通語', manager: 'mgr-tax' };
    const idx = buildOrgIndex(ORG, [a, b]);
    const r = routeTopicScored(idx, '共通語');
    expect(r.candidates.map((c) => c.score)).toEqual([30, 30]);
    expect(r.ambiguous).toBe(true);
    expect(r.runnerUp?.team.id).toBe('b');
  });

  it('is not ambiguous when the winner leads by exactly the margin (< boundary)', () => {
    // a: domain が話題を内包(+50) vs b: focus 一致(+30) → 差 20 == AMBIGUITY_MARGIN → 曖昧でない。
    const a: RawTeam = { id: 'a', domain: '共通語パート', focus: 'X', manager: 'mgr-tax' };
    const b: RawTeam = { id: 'b', domain: 'Y', focus: '共通語', manager: 'mgr-tax' };
    const idx = buildOrgIndex(ORG, [a, b]);
    const r = routeTopicScored(idx, '共通語');
    expect(r.candidates.map((c) => c.score)).toEqual([50, 30]);
    expect(r.ambiguous).toBe(false);
    expect(r.runnerUp?.team.id).toBe('b');
  });

  it('is not ambiguous when there is only one candidate (no runner-up)', () => {
    const r = routeTopicScored(INDEX, '所得税');
    expect(r.runnerUp).toBeUndefined();
    expect(r.ambiguous).toBe(false);
  });

  it('commits at exactly the threshold score (>= boundary)', () => {
    // 5字 domain → topic.includes で 5×4 = 20 == MIN_TEAM_SCORE。
    const finTeam: RawTeam = { id: 'fin', domain: '資金調達枠', focus: 'CF', manager: 'mgr-tax' };
    const idx = buildOrgIndex(ORG, [finTeam]);
    const r = routeTopicScored(idx, '資金調達枠の相談');
    expect(r.candidates[0]!.score).toBe(MIN_TEAM_SCORE);
    expect(r.route.team?.id).toBe('fin'); // 20 >= 20 なので確定
  });
});

describe('confidenceLabel', () => {
  it('maps confidence to 高/中/低 at the boundaries', () => {
    expect(confidenceLabel(0.8)).toBe('高');
    expect(confidenceLabel(0.6)).toBe('高');
    expect(confidenceLabel(0.4)).toBe('中');
    expect(confidenceLabel(0.3)).toBe('中');
    expect(confidenceLabel(0.29)).toBe('低');
    expect(confidenceLabel(0)).toBe('低');
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

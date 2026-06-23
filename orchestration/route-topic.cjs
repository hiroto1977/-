'use strict';

/**
 * chatOrg.ts のスコアリング型ルーティングを Node ランタイム向けに移植。
 * import-requests / dispatch の team 自動解決精度をチャットボットと揃える。
 *
 * スコア式は src/renderer/data/chatOrg.ts の scoreTopicMatch / routeTopicScored と
 * 同一 (変更時は scripts/__tests__/orchestration.test.cjs で同期を確認すること)。
 */

const MIN_TEAM_SCORE = 20;
const AMBIGUITY_MARGIN = 20;

function buildOrgIndex(org, teams) {
  return {
    executives: org.executives || [],
    managers: org.managers || [],
    teams: teams || [],
  };
}

function managerById(index, managerId) {
  return index.managers.find((m) => m.id === managerId);
}

function executiveById(index, executiveId) {
  return index.executives.find((e) => e.id === executiveId);
}

function routeFromManager(index, manager, team) {
  return { team, manager, executive: executiveById(index, manager.reportsTo) };
}

function matchManagerStem(index, topic) {
  for (const manager of index.managers) {
    const stem = manager.title.replace(/部長.*$/, '');
    if (stem && topic.includes(stem)) return manager;
  }
  return undefined;
}

function matchExecutiveDomain(index, topic) {
  for (const executive of index.executives) {
    const domain = executive.domain;
    if (domain && domain.split(/[・/]/).some((w) => w && topic.includes(w))) {
      return executive;
    }
  }
  return undefined;
}

function scoreTopicMatch(team, topic) {
  if (!topic) return 0;
  let score = 0;
  if (team.domain === topic) score += 100;
  if (team.domain !== topic && team.domain.includes(topic)) score += 50;
  if (topic.includes(team.domain)) score += team.domain.length * 4;
  if (team.focus.includes(topic)) score += 30;
  return score;
}

function routeTopicScored(index, topic) {
  const candidates = index.teams
    .map((team) => ({ team, score: scoreTopicMatch(team, topic) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const runnerUp = candidates[1];
  if (best && best.score >= MIN_TEAM_SCORE) {
    const manager = managerById(index, best.team.manager);
    const route = manager ? routeFromManager(index, manager, best.team) : { team: best.team };
    const ambiguous = runnerUp !== undefined && best.score - runnerUp.score < AMBIGUITY_MARGIN;
    return { route, confidence: Math.min(1, best.score / 100), candidates, ambiguous, runnerUp, teamId: best.team.id };
  }
  const manager = matchManagerStem(index, topic);
  if (manager) {
    return { route: routeFromManager(index, manager), confidence: 0.4, candidates, ambiguous: false, runnerUp, teamId: manager.teams?.[0] };
  }
  const executive = matchExecutiveDomain(index, topic);
  if (executive) return { route: { executive }, confidence: 0.3, candidates, ambiguous: false, runnerUp, teamId: undefined };
  return { route: {}, confidence: 0, candidates, ambiguous: false, runnerUp, teamId: undefined };
}

/** 要望テキストに最も合う team id を返す (解決不能は null)。 */
function matchTeamForRequest(reg, text) {
  const index = buildOrgIndex(reg.org, reg.teams);
  const scored = routeTopicScored(index, text);
  if (scored.teamId) return scored.teamId;
  if (scored.route.team) return scored.route.team.id;
  return null;
}

module.exports = {
  MIN_TEAM_SCORE,
  AMBIGUITY_MARGIN,
  buildOrgIndex,
  scoreTopicMatch,
  routeTopicScored,
  matchTeamForRequest,
};

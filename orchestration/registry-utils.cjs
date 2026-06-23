'use strict';

/**
 * orchestration/registry.json の共有ユーティリティ。
 * verify-orchestration.cjs / orchestrate.cjs / テストから参照する。
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'orchestration/registry.json');
const KNOWLEDGE_MAP_PATH = path.join(REPO_ROOT, 'orchestration/knowledge-map.json');

function loadRegistry(file = REGISTRY_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** round エントリから team id 配列を解決する (フル roster / compact newTeams 両対応)。 */
function resolveRoundTeamIds(roundEntry, prevTeamIds) {
  if (Array.isArray(roundEntry.teams) && roundEntry.teams.length > 0) {
    return roundEntry.teams;
  }
  if (Array.isArray(roundEntry.newTeams)) {
    const base = Array.isArray(prevTeamIds) ? prevTeamIds : [];
    return [...base, ...roundEntry.newTeams];
  }
  return Array.isArray(roundEntry.teams) ? roundEntry.teams : [];
}

/** 全 round を走査し、各 round の解決済み roster を返す。 */
function buildRoundRosters(reg) {
  const sorted = [...reg.rounds].sort((a, b) => a.round - b.round);
  const rosters = new Map();
  let prev = [];
  for (const r of sorted) {
    const ids = resolveRoundTeamIds(r, prev);
    rosters.set(r.round, ids);
    prev = ids;
  }
  return rosters;
}

function lastRoundInfo(reg) {
  const lastRound = reg.rounds.reduce((m, r) => Math.max(m, r.round), 0);
  const rosters = buildRoundRosters(reg);
  const lastCount = reg.rounds.find((r) => r.round === lastRound)?.teamCount ?? 0;
  const lastRoster = rosters.get(lastRound) || [];
  return { lastRound, lastCount, lastRoster, rosters };
}

/** record 用: 前 round roster + newTeams から編成を組み立てる。 */
function composeTeamRoster(reg, newTeamIds) {
  const { lastRoster } = lastRoundInfo(reg);
  const seen = new Set(lastRoster);
  const added = [];
  for (const id of newTeamIds) {
    if (!seen.has(id)) {
      seen.add(id);
      added.push(id);
    }
  }
  return [...lastRoster, ...added];
}

/** knowledge-map.json の executiveKnowledge キーが registry の AI 役員と一致するか検証。 */
function validateKnowledgeMap(reg, map) {
  const problems = [];
  if (!map || typeof map !== 'object') {
    problems.push('knowledge-map.json がオブジェクトではありません');
    return problems;
  }
  const execIds = new Set((reg.org?.executives || []).map((e) => e.id));
  const cooId = reg.org?.coo?.id;
  if (cooId) execIds.add(cooId);

  for (const key of Object.keys(map.executiveKnowledge || {})) {
    if (!execIds.has(key)) {
      problems.push(`knowledge-map executiveKnowledge のキー "${key}" が registry の役員/COO に存在しません`);
    }
  }
  for (const colKey of Object.keys(map.executiveKnowledge || {})) {
    const spec = map.executiveKnowledge[colKey];
    if (!spec || typeof spec !== 'object') continue;
    for (const [collection, sel] of Object.entries(spec)) {
      if (collection.startsWith('_')) continue;
      const col = (map.collections || {})[collection];
      if (!col) {
        problems.push(`knowledge-map: 未知のコレクション "${collection}" (executiveKnowledge.${colKey})`);
        continue;
      }
      if (sel !== '*' && sel !== true && !Array.isArray(sel)) {
        problems.push(`knowledge-map: executiveKnowledge.${colKey}.${collection} は "*", true, または配列であること`);
      }
      if (Array.isArray(sel)) {
        for (const cat of sel) {
          if (Object.keys(col.categories || {}).length > 0 && !(cat in (col.categories || {}))) {
            problems.push(`knowledge-map: 未知の区分 "${cat}" (collections.${collection})`);
          }
        }
      }
    }
  }
  return problems;
}

/** verify-orchestration 用: round エントリの整合問題を収集。 */
function validateRoundEntries(reg) {
  const problems = [];
  const teamIds = new Set(reg.teams.map((t) => t.id));
  const minTeams = new Map();
  for (const e of reg.policy.minTeamsForRound || []) minTeams.set(e.round, e.minTeams);

  const sorted = [...reg.rounds].sort((a, b) => a.round - b.round);
  const seenRounds = new Set();
  let prevCount = 0;
  let prevRoster = [];

  for (const r of sorted) {
    if (seenRounds.has(r.round)) problems.push(`round ${r.round} が重複`);
    seenRounds.add(r.round);

    const resolved = resolveRoundTeamIds(r, prevRoster);
    if (r.teamCount !== resolved.length) {
      problems.push(
        `round ${r.round}: teamCount=${r.teamCount} が解決済み roster.length=${resolved.length} と不一致` +
          (r.newTeams ? ' (newTeams 形式)' : ''),
      );
    }
    if (r.teamCount < prevCount) {
      problems.push(`round ${r.round}: teamCount=${r.teamCount} が前ラウンド(${prevCount})より少ない (単調増加に違反)`);
    }
    prevCount = Math.max(prevCount, r.teamCount);

    const min = minTeams.get(r.round);
    if (min !== undefined && r.teamCount < min) {
      problems.push(`round ${r.round}: teamCount=${r.teamCount} が policy の最低(${min})未満`);
    }
    for (const id of resolved) {
      if (!teamIds.has(id)) problems.push(`round ${r.round}: 未知の team "${id}"`);
    }
    prevRoster = resolved;
  }
  return problems;
}

function runVerifyOrchestration() {
  const { spawnSync } = require('node:child_process');
  const script = path.join(REPO_ROOT, 'scripts/verify-orchestration.cjs');
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8', cwd: REPO_ROOT });
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || '').trim();
    throw new Error(msg || 'verify-orchestration failed');
  }
  return (r.stdout || '').trim();
}

module.exports = {
  REPO_ROOT,
  REGISTRY_PATH,
  KNOWLEDGE_MAP_PATH,
  loadRegistry,
  resolveRoundTeamIds,
  buildRoundRosters,
  lastRoundInfo,
  composeTeamRoster,
  validateKnowledgeMap,
  validateRoundEntries,
  runVerifyOrchestration,
};

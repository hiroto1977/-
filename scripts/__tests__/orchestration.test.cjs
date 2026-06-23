'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  resolveRoundTeamIds,
  composeTeamRoster,
  validateKnowledgeMap,
  validateRoundEntries,
  loadRegistry,
} = require('../../orchestration/registry-utils.cjs');
const {
  scoreTopicMatch,
  matchTeamForRequest,
  buildOrgIndex,
  routeTopicScored,
  MIN_TEAM_SCORE,
} = require('../../orchestration/route-topic.cjs');

describe('registry-utils', () => {
  it('resolveRoundTeamIds: full roster', () => {
    const ids = resolveRoundTeamIds({ teams: ['a', 'b'], teamCount: 2 }, []);
    assert.deepEqual(ids, ['a', 'b']);
  });

  it('resolveRoundTeamIds: compact newTeams', () => {
    const ids = resolveRoundTeamIds({ newTeams: ['c'], teamCount: 3 }, ['a', 'b']);
    assert.deepEqual(ids, ['a', 'b', 'c']);
  });

  it('composeTeamRoster dedupes against last round', () => {
    const reg = loadRegistry();
    const roster = composeTeamRoster(reg, ['nonexistent-team']);
    assert.ok(Array.isArray(roster));
    assert.ok(roster.length >= reg.teams.length - 1);
  });

  it('validateKnowledgeMap accepts current map', () => {
    const reg = loadRegistry();
    const map = require('../../orchestration/knowledge-map.json');
    assert.deepEqual(validateKnowledgeMap(reg, map), []);
  });

  it('validateRoundEntries passes on live registry', () => {
    const reg = loadRegistry();
    assert.deepEqual(validateRoundEntries(reg), []);
  });
});

describe('route-topic', () => {
  const team = { id: 'tax-income', domain: '税務(所得税)', focus: '所得税・速算表・復興特別所得税', manager: 'mgr-tax' };

  it('scoreTopicMatch: domain exact match (100 + domain-length bonus)', () => {
    const topic = '税務(所得税)';
    assert.equal(scoreTopicMatch(team, topic), 100 + topic.length * 4);
  });

  it('scoreTopicMatch: topic contains domain meets threshold', () => {
    assert.ok(scoreTopicMatch(team, '所得税') >= MIN_TEAM_SCORE);
  });

  it('routeTopicScored escalates weak matches', () => {
    const index = buildOrgIndex({ executives: [], managers: [] }, [team]);
    const r = routeTopicScored(index, 'zzz');
    assert.equal(r.teamId, undefined);
    assert.equal(r.confidence, 0);
  });

  it('matchTeamForRequest resolves tax topic on live registry', () => {
    const reg = loadRegistry();
    const id = matchTeamForRequest(reg, '所得税');
    assert.ok(typeof id === 'string' && id.length > 0);
  });
});

describe('knowledge-context cache', () => {
  it('loadEntries returns stable array reference on second call', () => {
    const kc = require('../../orchestration/knowledge-context.cjs');
    const a = kc.loadEntries();
    const b = kc.loadEntries();
    assert.equal(a, b);
    assert.ok(a.length > 1000);
  });
});

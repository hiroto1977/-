#!/usr/bin/env node
'use strict';

/**
 * AIオーケストレーション・レジストリの整合検証 + 次ラウンド計画の自己prescribe。
 *
 * 「進化し続ける仕組み」の中核。orchestration/registry.json を読み、次の不変条件を
 * 強制する:
 *   1. JSON は registry.schema.json の必須構造を満たす (簡易チェック)。
 *   2. rounds の teamCount は単調増加 (作業サイクルごとにチームが減らない)。
 *   3. 各 round は policy.minTeamsForRound の最低チーム数を満たす。
 *   4. rounds[].teams と backlog[].team は teams[].id に実在する。
 *   5. round.teamCount は round.teams の要素数と一致する。
 *   6. backlog の id は一意。
 *
 * さらに「次に何チームで・どの領域を細分化するか」を自動算出して出力する
 * (--plan)。これによりレジストリ自体が次サイクルの設計図になり、増やし続けても
 * 精度 (整合性) が保たれる。
 *
 * 使い方:
 *   node scripts/verify-orchestration.cjs          検証のみ (CI 用、失敗で exit 1)
 *   node scripts/verify-orchestration.cjs --plan    検証 + 次ラウンド計画を表示
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTRY = path.join(REPO_ROOT, 'orchestration/registry.json');

function fail(messages) {
  console.error(`\n❌ orchestration registry: ${messages.length} 件の問題`);
  for (const m of messages) console.error(`  - ${m}`);
  process.exit(1);
}

function main() {
  const wantPlan = process.argv.includes('--plan');
  const raw = fs.readFileSync(REGISTRY, 'utf8');
  let reg;
  try {
    reg = JSON.parse(raw);
  } catch (e) {
    fail([`registry.json が JSON として解析できません: ${e.message}`]);
  }

  const problems = [];

  // 1. 必須キー。
  for (const key of ['version', 'policy', 'teams', 'rounds', 'backlog']) {
    if (!(key in reg)) problems.push(`必須キー "${key}" がありません`);
  }
  if (problems.length) fail(problems);

  // teams の id 集合。
  const teamIds = new Set();
  for (const t of reg.teams) {
    if (!/^[a-z][a-z0-9-]*$/.test(t.id || '')) problems.push(`team id が不正: ${JSON.stringify(t.id)}`);
    if (teamIds.has(t.id)) problems.push(`team id が重複: ${t.id}`);
    teamIds.add(t.id);
  }

  // minTeamsForRound のマップ。
  const minTeams = new Map();
  for (const e of reg.policy.minTeamsForRound || []) minTeams.set(e.round, e.minTeams);

  // 2/3/4/5. rounds の検証。
  let prevCount = 0;
  const seenRounds = new Set();
  for (const r of reg.rounds) {
    if (seenRounds.has(r.round)) problems.push(`round ${r.round} が重複`);
    seenRounds.add(r.round);
    // 5. teamCount と teams.length の一致。
    if (r.teamCount !== r.teams.length) {
      problems.push(`round ${r.round}: teamCount=${r.teamCount} が teams.length=${r.teams.length} と不一致`);
    }
    // 2. 単調増加。
    if (r.teamCount < prevCount) {
      problems.push(`round ${r.round}: teamCount=${r.teamCount} が前ラウンド(${prevCount})より少ない (単調増加に違反)`);
    }
    prevCount = Math.max(prevCount, r.teamCount);
    // 3. 最低チーム数。
    const min = minTeams.get(r.round);
    if (min !== undefined && r.teamCount < min) {
      problems.push(`round ${r.round}: teamCount=${r.teamCount} が policy の最低(${min})未満`);
    }
    // 4. 参照する team が実在。
    for (const id of r.teams) {
      if (!teamIds.has(id)) problems.push(`round ${r.round}: 未知の team "${id}"`);
    }
  }

  // 6. backlog の検証。
  const backlogIds = new Set();
  for (const b of reg.backlog) {
    if (backlogIds.has(b.id)) problems.push(`backlog id が重複: ${b.id}`);
    backlogIds.add(b.id);
    if (!teamIds.has(b.team)) problems.push(`backlog "${b.id}": 未知の team "${b.team}"`);
  }

  if (problems.length) fail(problems);

  const lastRound = reg.rounds.reduce((m, r) => Math.max(m, r.round), 0);
  const lastCount = reg.rounds.find((r) => r.round === lastRound)?.teamCount ?? 0;
  console.log(
    `✅ orchestration registry OK — teams: ${reg.teams.length} / rounds: ${reg.rounds.length} / ` +
    `直近 round ${lastRound} は ${lastCount} チーム / backlog 未着手: ` +
    `${reg.backlog.filter((b) => b.status === 'designed').length} 件`,
  );

  if (wantPlan) {
    const nextRound = lastRound + 1;
    // 進化ルール: 次ラウンドは直近以上、かつ最低 +1 チームで細分化を促す。
    const nextMinTeams = Math.max(lastCount + 1, minTeams.get(nextRound) ?? 0);
    const designed = reg.backlog
      .filter((b) => b.status === 'designed')
      .sort((a, b) => a.priority - b.priority);
    console.log(`\n📋 次ラウンド計画 (round ${nextRound}):`);
    console.log(`  - 推奨チーム数: ${nextMinTeams} 以上 (前ラウンド ${lastCount} から単調増加)`);
    console.log(`  - 着手候補 (優先度順):`);
    for (const b of designed) {
      const team = reg.teams.find((t) => t.id === b.team);
      console.log(`      [P${b.priority}] ${b.title}  (担当: ${team ? team.domain : b.team})`);
    }
    if (designed.length < nextMinTeams) {
      console.log(
        `  - ⚠ designed backlog (${designed.length}) が推奨チーム数 (${nextMinTeams}) 未満。` +
        `新領域の調査チームを追加して論点を補充すること。`,
      );
    }
  }
}

main();

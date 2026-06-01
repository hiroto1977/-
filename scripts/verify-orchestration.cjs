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

  // --- 組織階層 (org) の検証: CEO(人間) → COO(オーケストレーター) → 役員層 →
  //     管理職層 → 一般職層 ---
  // 7. CEO は AI に配置しない (人間=オーナー)。8. COO は CEO 直属で AI 非配置
  //    (実装本体)。9. 役員は COO 直属。10. 各管理職は実在の役員 or COO直轄に属し、
  //    束ねる teams は実在。11. 全 active team は実在の管理職に 1 つだけ属する。
  if (reg.org) {
    const org = reg.org;
    const ceoId = org.ceo && org.ceo.id;
    if (org.ceo && org.ceo.staffedByAI === true) {
      problems.push('org.ceo.staffedByAI は false であること (CEO は人間=オーナー。AIに配置しない)');
    }
    const execIds = new Set((org.executives || []).map((e) => e.id));
    const mgrIds = new Set((org.managers || []).map((m) => m.id));

    // 8. COO (オーケストレーター) は CEO 直属で AI 非配置。
    const coo = org.coo;
    if (!coo) {
      problems.push('org.coo がありません (COO=オーケストレーターを CEO 直下に配置すること)');
    } else {
      if (coo.reportsTo !== ceoId) {
        problems.push(`COO ${coo.id} の reportsTo は CEO であること (現在: ${coo.reportsTo})`);
      }
      if (coo.staffedByAI === true) {
        problems.push('org.coo.staffedByAI は false であること (COO はオーケストレーター本体。研究Agentには配置しない)');
      }
      for (const o of coo.owns || []) {
        if (!execIds.has(o) && !mgrIds.has(o)) {
          problems.push(`COO が未知の配下 "${o}" を保有 (役員 or 管理職であること)`);
        }
      }
    }
    const cooId = coo && coo.id;

    // 9. 役員は COO 直属。役員の owns は実在の管理職。
    for (const e of org.executives || []) {
      if (e.reportsTo !== cooId) {
        problems.push(`役員 ${e.id} の reportsTo は COO であること (現在: ${e.reportsTo})`);
      }
      for (const m of e.owns || []) {
        if (!mgrIds.has(m)) problems.push(`役員 ${e.id} が未知の管理職 "${m}" を保有`);
      }
    }

    // 9b. 秘書室: 各 "AI役員" に 1 室 (4 体の AI チーム) を常設し継続サポートする。
    //     支援先 (supports) は AI役員 のみ (人間のCEO・オーケストレーターのCOOは対象外) /
    //     メンバーは 4 体 / id 一意 / 全役員に過不足なく 1 室 (役員と秘書室は 1 対 1)。
    const secIds = new Set();
    const supportedExecs = new Map();
    const nonExecIds = new Set([ceoId, cooId].filter(Boolean));
    for (const s of org.secretaries || []) {
      if (secIds.has(s.id)) problems.push(`秘書室 id が重複: ${s.id}`);
      secIds.add(s.id);
      if (nonExecIds.has(s.supports)) {
        problems.push(`秘書室 ${s.id} の supports は AI役員 であること (CEO/COO は支援先にできない: "${s.supports}")`);
      } else if (!execIds.has(s.supports)) {
        problems.push(`秘書室 ${s.id} の supports が未知の AI役員 "${s.supports}"`);
      } else if (supportedExecs.has(s.supports)) {
        problems.push(`役員 ${s.supports} に秘書室が重複 (${supportedExecs.get(s.supports)} / ${s.id})`);
      } else {
        supportedExecs.set(s.supports, s.id);
      }
      if (s.members !== 4) problems.push(`秘書室 ${s.id} は 4 体であること (現在: ${s.members})`);
      if (s.staffedByAI === false) problems.push(`秘書室 ${s.id} は AI 配置であること (staffedByAI=true)`);
    }
    // 秘書室を導入する場合、全役員がちょうど 1 室を持つ (常設サポート)。
    if ((org.secretaries || []).length > 0) {
      for (const e of org.executives || []) {
        if (!supportedExecs.has(e.id)) problems.push(`役員 ${e.id} に秘書室が未配置 (各役員に1室を常設)`);
      }
    }

    // 10. 各管理職が属する上位 (役員 or COO直轄) の owns に含まれるか (双方向整合)。
    const mgrToOwner = new Map();
    for (const e of org.executives || []) for (const m of e.owns || []) mgrToOwner.set(m, e.id);
    for (const m of (coo && coo.owns) || []) if (mgrIds.has(m)) mgrToOwner.set(m, cooId);
    const ownerIds = new Set([...execIds, cooId]);
    for (const m of org.managers || []) {
      if (!ownerIds.has(m.reportsTo)) {
        problems.push(`管理職 ${m.id} の reportsTo が未知の上位 "${m.reportsTo}" (役員 or COO であること)`);
      } else if (mgrToOwner.get(m.id) !== m.reportsTo) {
        problems.push(`管理職 ${m.id} の reportsTo(${m.reportsTo}) と上位の owns が不一致`);
      }
      for (const t of m.teams || []) {
        if (!teamIds.has(t)) problems.push(`管理職 ${m.id} が未知の team "${t}" を保有`);
      }
    }
    // 11. 全 active team が実在の管理職に 1 つだけ属する。
    const teamToMgr = new Map();
    for (const m of org.managers || []) for (const t of m.teams || []) {
      if (teamToMgr.has(t)) problems.push(`team ${t} が複数の管理職に属する (${teamToMgr.get(t)} / ${m.id})`);
      teamToMgr.set(t, m.id);
    }
    for (const t of reg.teams) {
      if (!t.active) continue;
      if (!t.manager || !mgrIds.has(t.manager)) {
        problems.push(`team ${t.id} の manager が未設定 or 未知 (${t.manager})`);
      } else if (teamToMgr.get(t.id) !== t.manager) {
        problems.push(`team ${t.id} の manager(${t.manager}) と管理職の teams が不一致`);
      }
    }
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
  const execCount = reg.org ? (reg.org.executives || []).length : 0;
  const mgrCount = reg.org ? (reg.org.managers || []).length : 0;
  const cooCount = reg.org && reg.org.coo ? 1 : 0;
  const secList = reg.org ? reg.org.secretaries || [] : [];
  const secMembers = secList.reduce((s, x) => s + (x.members || 0), 0);
  const secLabel = secList.length > 0 ? `秘書室 ${secList.length}室(計${secMembers}体) / ` : '';
  console.log(
    `✅ orchestration registry OK — 組織: CEO 1 / COO ${cooCount} / 役員 ${execCount} / ${secLabel}管理職 ${mgrCount} / 一般職(teams) ${reg.teams.length} / ` +
    `rounds: ${reg.rounds.length} / 直近 round ${lastRound} は ${lastCount} チーム / backlog 未着手: ` +
    `${reg.backlog.filter((b) => b.status === 'designed').length} 件`,
  );

  if (wantPlan && reg.org) {
    const managers = reg.org.managers || [];
    const mgrById = (id) => managers.find((x) => x.id === id);
    const printManager = (mid, indent) => {
      const m = mgrById(mid);
      if (m) console.log(`${indent}└ ${m.title} [${m.id}] — ${m.teams.length} チーム`);
    };
    const secOf = (execId) => (reg.org.secretaries || []).find((s) => s.supports === execId);
    console.log('\n🏢 組織図 (CEO → COO → 役員層(+秘書室) → 管理職層 → 一般職層):');
    console.log(`  CEO: ${reg.org.ceo.title}`);
    const coo = reg.org.coo;
    if (coo) {
      console.log(`   └ ${coo.title} [${coo.id}]`);
      // COO 直轄の管理職 (owns のうち管理職 id)。
      for (const oid of coo.owns || []) {
        if (mgrById(oid)) printManager(oid, '       ');
      }
      // COO 配下の役員 → 秘書室 + その配下の管理職。
      for (const e of reg.org.executives || []) {
        console.log(`       └ ${e.title} [${e.id}]`);
        const sec = secOf(e.id);
        if (sec) console.log(`           └ 🗂 ${sec.title} [${sec.id}] — ${sec.members}体 (常設サポート)`);
        for (const mid of e.owns || []) printManager(mid, '           ');
      }
    }
  }

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

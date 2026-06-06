#!/usr/bin/env node
'use strict';

/**
 * AIオーケストレーション・実行ランタイム (v3)。
 *
 * orchestration/registry.json に register された組織 (CEO→COO→役員→管理職→一般職) と
 * backlog を読み、作業項目を指揮系統へ解決し、PDCA/OODA サイクルの各ステージへ割当てて
 * 『並列worktreeエージェント』のディスパッチ計画を生成する "仕組み" 本体。
 *
 * verify-orchestration.cjs が「整合の検証 + 次ラウンドの推奨」を担うのに対し、本スクリプトは
 * 「register された組織を実際にどう動かすか (誰が・何を・どのサイクルで・並列に)」を出力する。
 * COO (Claude本体) はこの計画に沿って Agent を並列起動 (設計) → 直列実装 → 全ゲート検証 →
 * round 記録 を行う。
 *
 * 使い方:
 *   node scripts/orchestrate.cjs status            組織サマリ + 直近round + backlog + サイクル
 *   node scripts/orchestrate.cjs cycle pdca|ooda   指定サイクルのステージ定義を表示
 *   node scripts/orchestrate.cjs dispatch [opts]    次round(or --round N)の実行ディスパッチ計画
 *       --items a,b,c   対象 backlog id (既定: designed を優先度順)
 *       --teams a,b,c   対象 team id を直接指定 (backlog を介さずチームを動かす)
 *       --cycle pdca|ooda  使用サイクル (既定 pdca)
 *       --json          機械可読 (JSON) 出力
 *   node scripts/orchestrate.cjs record --round N --teams a,b --shipped "..."  round を追記
 *       --note "..."    任意の補足
 *       --dry-run       書き込まず差分のみ表示
 *
 * 設計: registry は単一の真実源。dispatch は read-only (registry を変更しない)。
 * record のみ registry.json に追記し、書き込み後に整合検証 (verify-orchestration) を促す。
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTRY = path.join(REPO_ROOT, 'orchestration/registry.json');

function die(msg) {
  console.error(`❌ orchestrate: ${msg}`);
  process.exit(1);
}

function loadRegistry() {
  let reg;
  try {
    reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  } catch (e) {
    die(`registry.json を読めません: ${e.message}`);
  }
  if (!reg.org) die('registry.org がありません (組織が未定義)');
  return reg;
}

/** "--flag value" / "--flag=value" / "--bool" を素朴にパースする。 */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        out[a.slice(2)] = argv[i + 1];
        i += 1;
      } else {
        out[a.slice(2)] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

const csv = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

/** team → 指揮系統 (manager → executive → coo → ceo) を解決する。 */
function resolveChain(reg, teamId) {
  const org = reg.org;
  const team = reg.teams.find((t) => t.id === teamId);
  if (!team) return null;
  const mgr = (org.managers || []).find((m) => m.id === team.manager) || null;
  const exec = mgr ? (org.executives || []).find((e) => e.id === mgr.reportsTo) : null;
  const sec = exec ? (org.secretaries || []).find((s) => s.supports === exec.id) : null;
  return {
    team,
    manager: mgr,
    executive: exec,
    secretariat: sec,
    coo: org.coo || null,
    ceo: org.ceo || null,
  };
}

function lastRoundInfo(reg) {
  const lastRound = reg.rounds.reduce((m, r) => Math.max(m, r.round), 0);
  const lastCount = reg.rounds.find((r) => r.round === lastRound)?.teamCount ?? 0;
  return { lastRound, lastCount };
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------
function cmdStatus(reg, args) {
  const { lastRound, lastCount } = lastRoundInfo(reg);
  const org = reg.org;
  const designed = reg.backlog.filter((b) => b.status === 'designed');
  const byStatus = {};
  for (const b of reg.backlog) byStatus[b.status] = (byStatus[b.status] || 0) + 1;
  const secMembers = (org.secretaries || []).reduce((s, x) => s + (x.members || 0), 0);

  if (args.json) {
    console.log(JSON.stringify({
      version: reg.version,
      org: {
        ceo: org.ceo?.id, coo: org.coo?.id,
        executives: (org.executives || []).length,
        secretariats: (org.secretaries || []).length, secretaryMembers: secMembers,
        managers: (org.managers || []).length, teams: reg.teams.length,
      },
      rounds: reg.rounds.length, lastRound, lastCount,
      backlog: byStatus, designed: designed.length,
      cycles: Object.keys((reg.policy.cycles) || {}).filter((k) => k !== 'description'),
    }, null, 2));
    return;
  }

  console.log('🏢 AIオーケストレーション実行ランタイム — status');
  console.log(`  registry version: ${reg.version}`);
  console.log(`  組織: CEO 1 / COO 1 / 役員 ${(org.executives || []).length} / ` +
    `秘書室 ${(org.secretaries || []).length}室(計${secMembers}体) / 管理職 ${(org.managers || []).length} / ` +
    `一般職(teams) ${reg.teams.length}`);
  console.log(`  履歴: rounds ${reg.rounds.length} / 直近 round ${lastRound} は ${lastCount} チーム`);
  console.log(`  backlog: ${JSON.stringify(byStatus)} (着手可能 designed: ${designed.length})`);
  const cycleNames = Object.keys(reg.policy.cycles || {}).filter((k) => k !== 'description');
  console.log(`  サイクル: ${cycleNames.join(' / ') || '(未定義)'}`);
  console.log('\n  次の一手:');
  console.log('   - npm run orchestration:plan        次ラウンドの推奨チーム数と着手候補');
  console.log('   - npm run orchestrate:dispatch       実行ディスパッチ計画 (並列Agent割当)');
}

// ---------------------------------------------------------------------------
// cycle
// ---------------------------------------------------------------------------
function cmdCycle(reg, args) {
  const name = (args._[0] || '').toLowerCase();
  const cycles = reg.policy.cycles || {};
  const stages = cycles[name];
  if (!stages) die(`未知のサイクル "${name}" (利用可能: ${Object.keys(cycles).filter((k) => k !== 'description').join(', ')})`);
  if (args.json) { console.log(JSON.stringify({ cycle: name, stages }, null, 2)); return; }
  console.log(`🔄 サイクル: ${name.toUpperCase()}`);
  stages.forEach((s, i) => {
    console.log(`  ${i + 1}. [${s.stage}] owner=${s.owner} ${s.parallel ? '(並列)' : '(直列)'}`);
    console.log(`       ${s.desc}`);
  });
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------
function cmdDispatch(reg, args) {
  const { lastRound, lastCount } = lastRoundInfo(reg);
  const round = args.round ? Number(args.round) : lastRound + 1;
  const cycleName = (args.cycle || 'pdca').toLowerCase();
  const cycle = (reg.policy.cycles || {})[cycleName];
  if (!cycle) die(`未知のサイクル "${cycleName}"`);

  // 対象 team の決定: --teams 優先 → --items(backlog) → designed backlog。
  let teamIds;
  let sourceItems = [];
  if (args.teams) {
    teamIds = csv(args.teams);
  } else {
    const ids = args.items
      ? csv(args.items)
      : reg.backlog.filter((b) => b.status === 'designed').sort((a, b) => a.priority - b.priority).map((b) => b.id);
    sourceItems = ids.map((id) => reg.backlog.find((b) => b.id === id)).filter(Boolean);
    const missing = ids.filter((id) => !reg.backlog.find((b) => b.id === id));
    if (missing.length) die(`未知の backlog id: ${missing.join(', ')}`);
    teamIds = [...new Set(sourceItems.map((b) => b.team))];
  }
  if (teamIds.length === 0) {
    die('ディスパッチ対象がありません。designed backlog が空です — 新領域の調査チーム/論点を補充するか --teams/--items で明示してください。');
  }

  // 各 team を指揮系統へ解決し、割当を構築。
  const assignments = teamIds.map((tid) => {
    const chain = resolveChain(reg, tid);
    if (!chain) die(`未知の team "${tid}"`);
    const items = sourceItems.filter((b) => b.team === tid).map((b) => ({ id: b.id, title: b.title, priority: b.priority }));
    return {
      team: chain.team.id,
      domain: chain.team.domain,
      focus: chain.team.focus,
      manager: chain.manager ? `${chain.manager.title} [${chain.manager.id}]` : null,
      executive: chain.executive ? `${chain.executive.title} [${chain.executive.id}]` : null,
      secretariat: chain.secretariat ? `${chain.secretariat.title} [${chain.secretariat.id}]` : null,
      items,
    };
  });

  const minNext = Math.max(lastCount + 1, 0);
  const plan = {
    round,
    cycle: cycleName,
    teamCount: teamIds.length,
    monotonicTarget: minNext,
    chainOfCommand: 'CEO(人間) → COO(Claude) → 役員 → 管理職 → 一般職(並列Agent)',
    stages: cycle.map((s) => ({
      stage: s.stage,
      owner: s.owner,
      parallel: !!s.parallel,
      desc: s.desc,
      // do(設計)ステージにだけ並列Agent割当を載せる。
      agents: s.parallel
        ? assignments.map((a) => ({
            team: a.team,
            role: 'read-only 調査/設計 Agent',
            domain: a.domain,
            focus: a.focus,
            reportsTo: `${a.manager} → ${a.executive}`,
            deliverable: a.items.length
              ? `論点 ${a.items.map((i) => i.title).join(' / ')} の式・境界値・テスト方針・不変条件を素案化`
              : `${a.domain} の調査・設計素案`,
          }))
        : undefined,
    })),
    assignments,
  };

  if (args.json) { console.log(JSON.stringify(plan, null, 2)); return; }

  console.log(`📡 実行ディスパッチ計画 — round ${round} / cycle ${cycleName.toUpperCase()}`);
  console.log(`  指揮系統: ${plan.chainOfCommand}`);
  console.log(`  対象チーム: ${plan.teamCount}（単調増加の目安: ${minNext} 以上）`);
  console.log('\n  指揮系統への解決:');
  for (const a of assignments) {
    console.log(`   • [${a.team}] ${a.domain}`);
    console.log(`       ${a.manager ?? '(管理職なし)'} ← ${a.executive ?? '(役員なし)'}  ${a.secretariat ? `／支援: ${a.secretariat}` : ''}`);
    if (a.items.length) for (const it of a.items) console.log(`       └ [P${it.priority}] ${it.title} (${it.id})`);
  }
  console.log(`\n  ${cycleName.toUpperCase()} 実行ステージ:`);
  for (const s of plan.stages) {
    console.log(`   ▸ [${s.stage}] owner=${s.owner} ${s.parallel ? '★並列' : '直列'} — ${s.desc}`);
    if (s.agents) {
      for (const ag of s.agents) console.log(`       ⇒ Agent: ${ag.team} (${ag.domain}) — ${ag.deliverable}`);
    }
  }
  console.log('\n  COOの実行手順: 上記 do=並列Agent起動(設計) → check=直列実装+全ゲート検証 → act=record で round 記録。');
}

// ---------------------------------------------------------------------------
// record
// ---------------------------------------------------------------------------
function cmdRecord(reg, args) {
  if (args.round === undefined) die('record には --round N が必要です');
  if (!args.teams) die('record には --teams a,b,c が必要です (round の編成)');
  if (!args.shipped) die('record には --shipped "..." が必要です (成果の記述)');
  const round = Number(args.round);
  const teams = csv(args.teams);
  const { lastRound, lastCount } = lastRoundInfo(reg);

  if (reg.rounds.some((r) => r.round === round)) die(`round ${round} は既に存在します`);
  if (round !== lastRound + 1) die(`round は連番であること (期待: ${lastRound + 1}, 指定: ${round})`);
  const unknown = teams.filter((t) => !reg.teams.find((x) => x.id === t));
  if (unknown.length) die(`未知の team: ${unknown.join(', ')} (先に teams[] に追加してください)`);
  if (teams.length < lastCount) {
    die(`単調増加に違反: teamCount=${teams.length} が前ラウンド(${lastCount})未満です`);
  }

  const entry = { round, teamCount: teams.length, teams, shipped: [args.shipped] };
  if (args.note) entry.note = args.note;

  if (args['dry-run']) {
    console.log('🔎 dry-run — 追記される round エントリ:');
    console.log(JSON.stringify(entry, null, 2));
    return;
  }
  reg.rounds.push(entry);
  fs.writeFileSync(REGISTRY, `${JSON.stringify(reg, null, 2)}\n`);
  console.log(`✅ round ${round} を registry に記録 (teamCount=${teams.length})。`);
  console.log('   → `npm run verify:orchestration` で整合を確認してください。');
}

// ---------------------------------------------------------------------------
function main() {
  const argv = process.argv.slice(2);
  const cmd = (argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'status').toLowerCase();
  const args = parseArgs(argv);
  const reg = loadRegistry();
  switch (cmd) {
    case 'status': return cmdStatus(reg, args);
    case 'cycle': return cmdCycle(reg, args);
    case 'dispatch': return cmdDispatch(reg, args);
    case 'record': return cmdRecord(reg, args);
    default: die(`未知のコマンド "${cmd}" (status | cycle | dispatch | record)`);
  }
}

main();

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
 *       --propose       designed backlog が空のとき提案を表示 (exit 0)
 *       --cycle pdca|ooda  使用サイクル (既定 pdca)
 *       --json          機械可読 (JSON) 出力
 *   node scripts/orchestrate.cjs record --round N --shipped "..."  round を追記
 *       --teams a,b,c   フル roster (従来形式)
 *       --new-teams a   前 round roster + 追加分のみ (compact 形式)
 *       --mark-shipped id1,id2  backlog を shipped に更新
 *       --note "..."    任意の補足
 *       --dry-run       書き込まず差分のみ表示
 *       --no-verify     書込み後の verify:orchestration をスキップ
 *   node scripts/orchestrate.cjs import-requests [--file chatbot-requests.md]
 *       チャットボット (AI コンシェルジュ) が受け付けた機能要望の Markdown
 *       (`- [ ] <要望> _(受付: YYYY-MM-DD)_` 形式) を読み、backlog へ designed
 *       (着手可能) として取込む。team はドメイン語の一致で自動解決し、
 *       解決できない行は --team <id> の既定が無い限りエラーで列挙する。
 *       --team a        自動解決できない要望の割当先 team
 *       --priority N    取込む要望の priority (既定 2)
 *       --dry-run       書き込まず取込み内容のみ表示
 *
 * 設計: registry は単一の真実源。dispatch は read-only (registry を変更しない)。
 * record / import-requests のみ registry.json に追記し、書き込み後に整合検証
 * (verify-orchestration) を促す。これで「ユーザー要望 (チャット) → backlog →
 * dispatch → 実装 → record」のループが機構として閉じる。
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  REGISTRY_PATH,
  lastRoundInfo,
  composeTeamRoster,
  runVerifyOrchestration,
} = require('../orchestration/registry-utils.cjs');
const { matchTeamForRequest } = require('../orchestration/route-topic.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTRY = REGISTRY_PATH;

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

// 学術知識ベース (VERIFIED_CONCEPTS) を役員ロールへ対応づけた知識ブリーフ。
// dispatch 計画へ「各役職が参照すべき検証済み概念」を注入する。知識ベースの
// パースに失敗しても dispatch 本体は止めない (耐障害設計)。
let _kctxMod = null;
let _kctxData = null;
function knowledgeBrief(execId, perGroup = 2, cap = 6) {
  if (!execId) return [];
  if (_kctxMod === null) {
    try {
      _kctxMod = require('../orchestration/knowledge-context.cjs');
      _kctxData = { entries: _kctxMod.loadEntries(), map: _kctxMod.loadKnowledgeMap() };
    } catch {
      _kctxMod = false;
    }
  }
  if (!_kctxMod) return [];
  const brief = _kctxMod.briefForExecutive(execId, { entries: _kctxData.entries, map: _kctxData.map, limit: perGroup });
  const flat = [];
  for (const g of brief.groups) for (const it of g.items) flat.push({ group: `${g.collectionLabel}/${g.categoryLabel}`, title: it.title });
  return flat.slice(0, cap);
}

// lastRoundInfo は registry-utils から import。

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
    if (args.propose) {
      const nextMin = Math.max(lastCount + 1, 0);
      const designed = reg.backlog.filter((b) => b.status === 'designed').sort((a, b) => a.priority - b.priority);
      console.log(`📋 提案モード — round ${round} (designed backlog が空)`);
      console.log(`  推奨: 新領域 team を teams[] に追加し backlog を designed で補充 (目標 ${nextMin}+ チーム)`);
      console.log('  候補 (管理職別 team 数 — 細分化の余地):');
      for (const m of reg.org.managers || []) {
        const n = (m.teams || []).length;
        console.log(`    • ${m.title} [${m.id}]: ${n} チーム`);
      }
      if (designed.length) {
        console.log('  着手可能 backlog:');
        for (const b of designed) console.log(`    [P${b.priority}] ${b.title} (${b.team})`);
      }
      console.log('\n  実行例: npm run orchestrate:dispatch -- --teams <team-id>[,...]');
      return;
    }
    die('ディスパッチ対象がありません。designed backlog が空です — --propose で提案を表示、または --teams/--items で明示してください。');
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
      // 学術知識ベースから、この役員ロールが参照すべき検証済み概念ブリーフを注入。
      knowledge: knowledgeBrief(chain.executive ? chain.executive.id : null),
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
    if (a.knowledge && a.knowledge.length) console.log(`       ◇ 知識ブリーフ: ${a.knowledge.map((k) => k.title).join(' / ')}`);
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
  if (!args.shipped) die('record には --shipped "..." が必要です (成果の記述)');
  const round = Number(args.round);
  const { lastRound, lastCount } = lastRoundInfo(reg);

  let teams;
  let compactNewTeams;
  if (args['new-teams']) {
    compactNewTeams = csv(args['new-teams']);
    teams = composeTeamRoster(reg, compactNewTeams);
  } else if (args.teams) {
    teams = csv(args.teams);
  } else {
    die('record には --teams a,b,c (フル roster) または --new-teams a,b (前 round + 追加分) が必要です');
  }

  if (reg.rounds.some((r) => r.round === round)) die(`round ${round} は既に存在します`);
  if (round !== lastRound + 1) die(`round は連番であること (期待: ${lastRound + 1}, 指定: ${round})`);
  const unknown = teams.filter((t) => !reg.teams.find((x) => x.id === t));
  if (unknown.length) die(`未知の team: ${unknown.join(', ')} (先に teams[] に追加してください)`);
  if (teams.length < lastCount) {
    die(`単調増加に違反: teamCount=${teams.length} が前ラウンド(${lastCount})未満です`);
  }

  const entry = { round, teamCount: teams.length, shipped: [args.shipped] };
  if (compactNewTeams && compactNewTeams.length > 0) {
    entry.newTeams = compactNewTeams;
  } else {
    entry.teams = teams;
  }
  if (args.note) entry.note = args.note;

  const markShipped = args['mark-shipped'] ? csv(args['mark-shipped']) : [];
  for (const bid of markShipped) {
    const item = reg.backlog.find((b) => b.id === bid);
    if (!item) die(`mark-shipped: 未知の backlog id "${bid}"`);
    item.status = 'shipped';
  }

  if (args['dry-run']) {
    console.log('🔎 dry-run — 追記される round エントリ:');
    console.log(JSON.stringify(entry, null, 2));
    if (markShipped.length) console.log(`  mark-shipped: ${markShipped.join(', ')}`);
    return;
  }
  reg.rounds.push(entry);
  fs.writeFileSync(REGISTRY, `${JSON.stringify(reg, null, 2)}\n`);
  console.log(`✅ round ${round} を registry に記録 (teamCount=${teams.length}${compactNewTeams ? ', compact newTeams' : ''})。`);
  if (markShipped.length) console.log(`   backlog shipped: ${markShipped.join(', ')}`);
  const skipVerify = args['no-verify'] === true;
  if (!skipVerify) {
    try {
      const out = runVerifyOrchestration();
      console.log(`   ${out.split('\n').pop()}`);
    } catch (e) {
      die(`record 後の verify:orchestration が失敗しました: ${e.message}`);
    }
  } else {
    console.log('   → `npm run verify:orchestration` で整合を確認してください。');
  }
}

// ---------------------------------------------------------------------------
// import-requests — チャットボット要望の backlog 取込み
// ---------------------------------------------------------------------------

/** 要望テキストへ最も合う team をスコアリング型ルーティングで解決する。 */
function resolveTeamForRequest(reg, text) {
  return matchTeamForRequest(reg, text);
}

/** `- [ ] <要望> _(受付: YYYY-MM-DD)_` 形式の行を解析する (チェック済み行は無視)。 */
function parseRequestLines(markdown) {
  const out = [];
  for (const line of markdown.split('\n')) {
    const m = /^- \[ \] (.+?)(?:\s*_\(受付: (\d{4}-\d{2}-\d{2})\)_)?\s*$/.exec(line);
    if (m) out.push({ text: m[1].trim(), at: m[2] || null });
  }
  return out;
}

function cmdImportRequests(reg, args) {
  const file = typeof args.file === 'string' ? args.file : 'chatbot-requests.md';
  const filePath = path.isAbsolute(file) ? file : path.join(REPO_ROOT, file);
  let markdown;
  try {
    markdown = fs.readFileSync(filePath, 'utf8');
  } catch {
    die(`要望ファイルを読めません: ${filePath} (チャットボットの 📥 要望 ボタンで書き出したファイルを置いてください)`);
  }
  const requests = parseRequestLines(markdown);
  if (requests.length === 0) die(`取込み対象の要望がありません (- [ ] 形式の未処理行が 0 件): ${filePath}`);

  const priority = args.priority ? Number(args.priority) : 2;
  if (!Number.isInteger(priority) || priority < 1) die(`--priority は 1 以上の整数で指定してください`);
  const fallbackTeam = typeof args.team === 'string' ? args.team : null;
  if (fallbackTeam && !reg.teams.find((t) => t.id === fallbackTeam)) {
    die(`--team "${fallbackTeam}" は teams[] に存在しません`);
  }

  const existingIds = new Set(reg.backlog.map((b) => b.id));
  const existingTitles = new Set(reg.backlog.map((b) => b.title));
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const entries = [];
  const unresolved = [];
  let seq = 1;

  for (const req of requests) {
    if (existingTitles.has(req.text)) continue; // 同名の取込み済み要望はスキップ (重複防止)。
    const team = resolveTeamForRequest(reg, req.text) || fallbackTeam;
    if (!team) {
      unresolved.push(req.text);
      continue;
    }
    let id = `chatreq-${stamp}-${seq}`;
    while (existingIds.has(id)) {
      seq += 1;
      id = `chatreq-${stamp}-${seq}`;
    }
    existingIds.add(id);
    seq += 1;
    const entry = {
      id,
      team,
      title: req.text,
      priority,
      status: 'designed',
      note: `チャットボット (AI コンシェルジュ) 経由のユーザー要望${req.at ? ` (受付: ${req.at})` : ''}`,
    };
    entries.push(entry);
  }

  if (unresolved.length) {
    die(
      `team を自動解決できない要望が ${unresolved.length} 件あります — --team <id> で割当先を指定してください:\n` +
        unresolved.map((t) => `   • ${t}`).join('\n'),
    );
  }
  if (entries.length === 0) {
    console.log('ℹ️ 新規の取込み対象なし (すべて取込み済み)。');
    return;
  }

  if (args['dry-run']) {
    console.log(`🔎 dry-run — backlog へ取込まれる ${entries.length} 件:`);
    for (const e of entries) {
      const chain = resolveChain(reg, e.team);
      const mgr = chain && chain.manager ? chain.manager.title : '(管理職なし)';
      console.log(`   • [${e.id}] ${e.title}`);
      console.log(`       → team ${e.team} (${mgr}) / P${e.priority} / ${e.status}`);
    }
    return;
  }

  reg.backlog.push(...entries);
  fs.writeFileSync(REGISTRY, `${JSON.stringify(reg, null, 2)}\n`);
  console.log(`✅ ${entries.length} 件の要望を backlog (designed) へ取込みました。`);
  if (args['no-verify'] !== true) {
    try {
      runVerifyOrchestration();
    } catch (e) {
      die(`import 後の verify:orchestration が失敗しました: ${e.message}`);
    }
  }
  console.log('   → `npm run orchestrate:dispatch` で次ラウンドの実行計画に載ります。');
}

// ---------------------------------------------------------------------------
// context — 役員ロールへの学術知識ブリーフ (knowledge-map.json 経由)
// ---------------------------------------------------------------------------
function cmdContext(reg, args) {
  let mod;
  try {
    mod = require('../orchestration/knowledge-context.cjs');
  } catch (e) {
    die(`知識ベースを読めません: ${e.message}`);
  }
  const entries = mod.loadEntries();
  const map = mod.loadKnowledgeMap();
  const limit = args.limit ? Number(args.limit) : 5;

  if (!args.role) {
    if (args.json) { console.log(JSON.stringify(map.executiveKnowledge || {}, null, 2)); return; }
    console.log('🧭 役員ロール → 知識コレクション/区分（knowledge-map.json）:');
    for (const [execId, spec] of Object.entries(map.executiveKnowledge || {})) {
      const parts = [];
      for (const [k, v] of Object.entries(spec)) {
        if (k.startsWith('_')) continue;
        parts.push(`${k}:${v === '*' ? '全' : (Array.isArray(v) ? v.join('|') : v)}`);
      }
      console.log(`  • ${execId}: ${parts.join(' / ')}`);
    }
    console.log('\n  詳細ブリーフ: npm run orchestrate:context -- --role <execId> [--limit N]');
    return;
  }

  const execId = String(args.role);
  if (!(map.executiveKnowledge || {})[execId]) die(`未知の役員ロール "${execId}" (利用可能: ${Object.keys(map.executiveKnowledge || {}).join(', ')})`);
  const brief = mod.briefForExecutive(execId, { entries, map, limit });
  if (args.json) { console.log(JSON.stringify(brief, null, 2)); return; }
  console.log(`🧭 役員 ${execId} への知識ブリーフ — ${(map.executiveKnowledge[execId] || {})._rationale || ''}`);
  for (const g of brief.groups) {
    console.log(`\n  【${g.collectionLabel} / ${g.categoryLabel}】（全${g.count}件）`);
    for (const it of g.items) console.log(`   • ${it.title} — ${it.oneLiner}`);
    if (g.count > g.items.length) console.log(`   …ほか ${g.count - g.items.length} 件`);
  }
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
    case 'import-requests': return cmdImportRequests(reg, args);
    case 'context': return cmdContext(reg, args);
    default: die(`未知のコマンド "${cmd}" (status | cycle | dispatch | record | import-requests | context)`);
  }
}

main();

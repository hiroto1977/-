#!/usr/bin/env node
/**
 * hunt-cycle — **探索 → 解析 → 対策 → 報告 の輪を、止まらずに回し続けるための道具**
 * (2026-10-28 · threat: T-214)。
 *
 * ## 何が欠けていたか
 *
 * 狩り (docs/THREAT_HUNT.md) → 台帳 → 回帰検査 → 門 → 毎日の姿勢の測定 (security-posture) までは
 * 揃っていたが、**輪そのものを回す側は人だった** —— 台帳の `ai-automated-attack` の穴「狩りの起動は人が
 * 回す」。人が忘れれば止まり、止まったことは姿勢の測定が「止まった面」として検知するが、**回っていたか
 * (いつ・どの面を・何を見つけ・何を直し・どこへ報告したか)** を数える物が無かった。
 *
 * ## 何をするか (網にも AI にも触れない・費用 0)
 *
 *   brief   —— 探索の入口。台帳と姿勢 (security-posture) と過去の輪から**次に狩る面を決定的に決め**、
 *              その面の手順書の節・狩り残し・再確認の期限・薄い型・記録の雛形を 1 枚の文面にする。
 *              AI (監査役) はこれを読んで狩る。同じ日に同じ台帳なら同じ答えになる。
 *   record  —— 報告の出口。1 周の記録 (4 段すべて) を**検めてから** security/hunt-cycles.json へ足す。
 *              解析で確認した穴・対策した穴は脅威台帳に実在する id でなければならず、報告は PR 番号か
 *              「出さなかった理由」を持つ。足りない段・知らない面・読めない日付は断る (黙って積まない)。
 *   status  —— 輪が回っているか。最後の周からの日数・cadence (7 日) の 2 倍を過ぎたら「止まった」。
 *              毎日の dependency-audit が同じ測定を報告に載せ、止まった輪は要対応として常設 Issue に出る。
 *
 * **班 (2026-10-30 · T-222)**: 狩るのは 1 人の監査役ではなく security/hacker-team.json の班 (赤・変種狩り・
 * 反証役・進化役)。brief は `team` を渡されたとき今週の編成と変種狩りの種を載せ、record は班の段 (team /
 * learned / evolution) を検めてから学んだ型と名簿の変更を名簿へ書き戻す (scripts/hacker-team.cjs)。
 *
 * 輪を実際に回すのは Claude Code の予約 (週 1 · 新しいセッション · 指示文は docs/HUNT_CYCLE_PROMPT.md)。
 * **自動なのは検知・順位づけ・起動・記録まで** —— 直しは draft PR に出し、マージは人が決める。
 *
 * 使い方:
 *   npm run hunt:cycle -- brief            # 次の面と手順 (--json で機械可読)
 *   npm run hunt:cycle -- record <file>    # 1 周の記録 (JSON) を検めて台帳へ
 *   npm run hunt:cycle -- status           # 輪の状態 (--json で機械可読)
 *   node scripts/hunt-cycle.cjs --self-test
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { analyzePosture, dayNumber } = require('./security-posture.cjs');
const team = require('./hacker-team.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const LEDGER = path.join(REPO_ROOT, 'security', 'threat-ledger.json');
const CYCLES = path.join(REPO_ROOT, 'security', 'hunt-cycles.json');
const HUNT_DOC = path.join(REPO_ROOT, 'docs', 'THREAT_HUNT.md');
const TEAM = path.join(REPO_ROOT, 'security', 'hacker-team.json');

/** 1 周の段。順序も名前もここが正 (台帳・指示文・検査が同じ物を読む)。 */
const STAGES = ['explore', 'analyze', 'countermeasure', 'report'];
const STAGE_LABELS = { explore: '探索', analyze: '解析', countermeasure: '対策', report: '報告' };
/** 予約の間隔 (日)。台帳の cadenceDays が無ければこれ。 */
const DEFAULT_CADENCE_DAYS = 7;
/** cadence の何倍で「輪が止まった」と言うか (1 回飛ばしただけでは鳴らさない・2 回飛べば鳴る)。 */
const STALL_MULTIPLIER = 2;
const ID_RE = /^HC-(\d{3,})$/;
const THREAT_ID_RE = /^T-\d{3,}$/;
const CLOSED_STATUSES = new Set(['fixed', 'mitigated', 'accepted']);

const isInt = (v) => Number.isInteger(v) && v >= 0;
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isStringArray = (v) => Array.isArray(v) && v.every(isNonEmptyString);

/** 輪の台帳 (parse 済み) の形を検める。問題の一覧 (空なら健全)。 */
function ledgerProblems(cycles) {
  const out = [];
  if (cycles === null || typeof cycles !== 'object' || !Array.isArray(cycles.cycles)) {
    return ['輪の台帳が読めない (cycles が配列でない)'];
  }
  if (cycles.cadenceDays !== undefined && !(Number.isInteger(cycles.cadenceDays) && cycles.cadenceDays >= 1)) {
    out.push(`cadenceDays が 1 以上の整数でない (${JSON.stringify(cycles.cadenceDays)})`);
  }
  return out;
}

/**
 * 面ごとの「最後に狩った日」。1 度も狩っていない面は null。
 * @returns {Map<string, string|null>}
 */
function lastVisited(surfaces, cycles) {
  const m = new Map(surfaces.map((s) => [s, null]));
  for (const c of cycles) {
    if (!m.has(c.surface) || dayNumber(c.date) === null) continue;
    const prev = m.get(c.surface);
    if (prev === null || c.date > prev) m.set(c.surface, c.date);
  }
  return m;
}

/**
 * 次に狩る面を決める (純関数・決定的)。
 *   1. 姿勢が「止まった」と言う面のうち、最後に狩った日が最も古い物
 *   2. それが無ければ、最後に狩った日が最も古い面 (1 度も狩っていない面が最初)。同じ古さなら姿勢の収穫が高い面
 * 面の順位は輪の台帳の順ではなく脅威台帳の surfaces の順で安定させる。
 */
function pickSurface(ledger, cycles, posture) {
  const visited = lastVisited(ledger.surfaces, cycles);
  const yieldOf = new Map(posture.surfaces.map((s) => [s.id, s.yieldPoints]));
  const ageKey = (s) => (visited.get(s) === null ? '0000-00-00' : visited.get(s));
  const byAge = (a, b) => ageKey(a).localeCompare(ageKey(b)) || (yieldOf.get(b) ?? 0) - (yieldOf.get(a) ?? 0);
  const stalled = posture.stalled.map((s) => s.surface).filter((s) => visited.has(s)).sort(byAge);
  if (stalled.length > 0) {
    return { surface: stalled[0], reason: `姿勢が「止まった」と言う面 (${posture.stalled.length} 面) のうち、最後に狩った日が最も古い`, lastVisited: visited.get(stalled[0]) };
  }
  const all = [...ledger.surfaces].sort(byAge);
  return { surface: all[0], reason: visited.get(all[0]) === null ? 'まだ 1 度も輪で狩っていない面' : '最後に狩った日が最も古い面 (同じ古さなら収穫の高い面)', lastVisited: visited.get(all[0]) };
}

/** docs/THREAT_HUNT.md から `## surface: x` の節を切り出す (無ければ null)。 */
function surfaceSection(doc, surface) {
  const re = new RegExp(`^## surface: ${surface}\\s*$`, 'm');
  const m = re.exec(doc);
  if (m === null) return null;
  const rest = doc.slice(m.index + m[0].length);
  const end = rest.search(/^## /m);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

/** 次の周の id。 */
function nextId(cycles) {
  const max = cycles.reduce((n, c) => {
    const m = ID_RE.exec(String(c.id));
    return m === null ? n : Math.max(n, Number(m[1]));
  }, 0);
  return `HC-${String(max + 1).padStart(3, '0')}`;
}

/**
 * 探索の入口 (純関数)。台帳・輪・手順書・今日から、次の周の文面と機械可読の要約を組む。
 * @returns {{surface: string, reason: string, id: string, backlog: object[], recheckDue: object[], thinClasses: object[],
 *   problems: string[], markdown: string}}
 */
function buildBrief({ ledger, cycles, doc, now, team: roster }) {
  const problems = [...ledgerProblems(cycles)];
  const rows = Array.isArray(cycles?.cycles) ? cycles.cycles : [];
  const posture = analyzePosture(ledger, now);
  problems.push(...posture.problems);
  const pick = pickSurface(ledger, rows, posture);
  const backlog = (Array.isArray(ledger.huntBacklog) ? ledger.huntBacklog : []).filter((h) => h.surface === pick.surface);
  const section = surfaceSection(doc, pick.surface);
  if (section === null) problems.push(`docs/THREAT_HUNT.md に \`## surface: ${pick.surface}\` の節が無い`);
  const id = nextId(rows);
  const squad = roster === undefined ? null : team.renderTeamBrief(roster, ledger, rows, pick.surface);
  if (roster !== undefined) problems.push(...team.teamProblems(roster, ledger));
  const template = {
    id,
    date: now,
    surface: pick.surface,
    pickedBy: 'brief',
    explore: { targets: ['<見た所 (file / 経路)>'], reports: 1 },
    analyze: { confirmed: ['<T-xxx>'], unconfirmed: 0, healthy: 0 },
    countermeasure: { threats: ['<T-xxx>'], backlog: 0 },
    report: { pr: null, reason: '<PR を出さなかった理由 (出したなら pr に番号)>', summary: '<1 行>' },
    ...(squad === null ? {} : team.teamTemplate(squad.lineup)),
  };
  const lines = [
    `# 狩りの輪 ${id} —— ${now}`,
    '',
    `**面: \`${pick.surface}\`** —— ${pick.reason}${pick.lastVisited === null ? '' : ` (最後に狩った日 ${pick.lastVisited})`}`,
    '',
    '## 段 (この順で・飛ばさない)',
    '',
    ...STAGES.map((s, i) => `${i + 1}. **${STAGE_LABELS[s]}** (\`${s}\`)`),
    '',
    '- 探索: 下の面の手順書どおりに、監査役 (読み取り専用) へ狩らせる。狩り残しと再確認の期限を最初に渡す。',
    '- 解析: 指摘を**自分で実物のコードで再現**する。再現できない物は未確認へ。重さを盛らない。',
    '- 対策: 本物だけを最小で直し、**攻撃を再現する回帰検査** (`threat: T-xxx` の印) と台帳の 1 行を足す。対照を回す。',
    '- 報告: draft PR (マージしない) に 見つけた物 / 直し / 機械 / 対照 / 残した物 を書き、`npm run hunt:cycle -- record <json>` で 1 周を台帳へ。',
    '',
    ...(squad === null ? [] : squad.lines),
    `## 面の手順書 (docs/THREAT_HUNT.md の節)`,
    '',
    section ?? '(節が無い —— 手順書を直すこと)',
    '',
    `## この面の狩り残し (${backlog.length} 件)`,
    '',
    ...(backlog.length === 0 ? ['なし'] : backlog.map((h) => `- ${h.item}\n  - ${String(h.why).slice(0, 200)}`)),
    '',
    `## 再確認の期限切れ (${posture.recheckDue.length} 件 · 面を問わず)`,
    '',
    ...(posture.recheckDue.length === 0 ? ['なし'] : posture.recheckDue.map((r) => `- ${String(r.item).slice(0, 120)} (${r.checkedOn} · ${r.ageDays} 日前)`)),
    '',
    '## 守りの薄い型',
    '',
    ...(posture.thinClasses.length === 0 ? ['なし'] : posture.thinClasses.map((c) => `- ${c.name}: 守り ${c.defenses} / 穴 ${c.gaps}`)),
    '',
    '## 記録の雛形 (report の段で埋めて `record` へ渡す)',
    '',
    '```json',
    JSON.stringify(template, null, 2),
    '```',
    '',
    ...(problems.length === 0 ? [] : ['## 読めない物 (0 件と混ぜない)', '', ...problems.map((p) => `- ❌ ${p}`), '']),
  ];
  const lineup = squad === null ? null : Object.fromEntries(['variant', 'blue', 'evolver'].map((k) => [k, squad.lineup[k]?.id ?? null]).concat([['red', squad.lineup.red.map((r) => r.id)]]));
  return { id, surface: pick.surface, reason: pick.reason, backlog, recheckDue: posture.recheckDue, thinClasses: posture.thinClasses, lineup, problems, markdown: lines.join('\n') };
}

/**
 * 1 周の記録を検める (純関数)。問題の一覧 (空なら台帳へ足してよい)。
 * 4 段すべてが要り、解析・対策の穴は脅威台帳に実在する id、報告は PR 番号か理由を持つ。
 * 名簿 (roster) を渡したとき、brief で選んだ周は班の段 (team / learned / evolution) も要る (T-222)。
 */
function cycleProblems(cycle, ledger, cycles, roster) {
  const out = [];
  if (cycle === null || typeof cycle !== 'object') return ['記録がオブジェクトでない'];
  const rows = Array.isArray(cycles?.cycles) ? cycles.cycles : [];
  const idm = ID_RE.exec(String(cycle.id));
  if (idm === null) out.push(`id が HC-NNN の形でない (${JSON.stringify(cycle.id)})`);
  else if (rows.some((c) => c.id === cycle.id)) out.push(`id ${cycle.id} は既に台帳に在る`);
  else if (cycle.id !== nextId(rows)) out.push(`id は ${nextId(rows)} でなければならない (${cycle.id})`);
  if (dayNumber(cycle.date) === null) out.push(`date が暦に在る YYYY-MM-DD でない (${JSON.stringify(cycle.date)})`);
  const surfaces = Array.isArray(ledger?.surfaces) ? ledger.surfaces : [];
  if (!surfaces.includes(cycle.surface)) out.push(`surface が脅威台帳に無い (${JSON.stringify(cycle.surface)})`);
  if (!['brief', 'manual'].includes(cycle.pickedBy)) out.push(`pickedBy は brief か manual (${JSON.stringify(cycle.pickedBy)})`);
  for (const s of STAGES) {
    if (cycle[s] === null || typeof cycle[s] !== 'object') out.push(`段 ${s} (${STAGE_LABELS[s]}) が無い —— 飛ばした段は記録できない`);
  }
  const known = new Map((Array.isArray(ledger?.threats) ? ledger.threats : []).map((t) => [t.id, t]));
  const checkIds = (label, ids) => {
    if (!isStringArray(ids)) return out.push(`${label} が文字列の配列でない`);
    for (const id of ids) {
      if (!THREAT_ID_RE.test(id)) out.push(`${label}: ${JSON.stringify(id)} は T-NNN の形でない (雛形のまま?)`);
      else if (!known.has(id)) out.push(`${label}: ${id} は脅威台帳に無い —— 台帳に書いてから記録する`);
    }
  };
  const ex = cycle.explore;
  if (ex && typeof ex === 'object') {
    if (!isStringArray(ex.targets) || ex.targets.length === 0 || ex.targets.some((t) => t.startsWith('<'))) out.push('explore.targets は見た所 (1 件以上・雛形のままでない)');
    if (!isInt(ex.reports)) out.push('explore.reports は監査役の報告の数 (0 以上の整数)');
  }
  const an = cycle.analyze;
  if (an && typeof an === 'object') {
    checkIds('analyze.confirmed', an.confirmed);
    if (!isInt(an.unconfirmed)) out.push('analyze.unconfirmed は 0 以上の整数');
    if (!isInt(an.healthy)) out.push('analyze.healthy は 0 以上の整数');
  }
  const cm = cycle.countermeasure;
  if (cm && typeof cm === 'object') {
    checkIds('countermeasure.threats', cm.threats);
    if (isStringArray(cm.threats)) {
      for (const id of cm.threats) {
        const t = known.get(id);
        if (t && !CLOSED_STATUSES.has(t.status)) out.push(`countermeasure.threats: ${id} の status が ${JSON.stringify(t.status)} —— 対策した物だけを挙げる`);
      }
    }
    if (!isInt(cm.backlog)) out.push('countermeasure.backlog は 狩り残しへ送った数 (0 以上の整数)');
    if (an && typeof an === 'object' && isStringArray(an.confirmed) && isStringArray(cm.threats)) {
      for (const id of an.confirmed) if (!cm.threats.includes(id)) out.push(`解析で確認した ${id} が対策に無い —— 直せないなら台帳で accepted / mitigated にしてから挙げる`);
    }
  }
  const rp = cycle.report;
  if (rp && typeof rp === 'object') {
    if (!isNonEmptyString(rp.summary) || rp.summary.startsWith('<')) out.push('report.summary は 1 行の要約 (雛形のままでない)');
    if (rp.pr === null || rp.pr === undefined) {
      if (!isNonEmptyString(rp.reason) || rp.reason.startsWith('<')) out.push('report.pr が無いなら report.reason (出さなかった理由) が要る');
    } else if (!(Number.isInteger(rp.pr) && rp.pr > 0)) out.push(`report.pr は PR 番号 (${JSON.stringify(rp.pr)})`);
  }
  if (roster !== undefined && (cycle.pickedBy === 'brief' || cycle.team !== undefined)) out.push(...team.teamCycleProblems(cycle, roster, ledger));
  return out;
}

/**
 * 輪が回っているか (純関数)。
 * @returns {{cadenceDays: number, stallDays: number, count: number, last: object|null, ageDays: number|null,
 *   stalled: boolean, problems: string[], actionable: number}}
 */
function loopStatus(cycles, now) {
  const today = dayNumber(now);
  if (today === null) throw new Error(`今日の日付が読めない: ${JSON.stringify(now)}`);
  const problems = ledgerProblems(cycles);
  const rows = Array.isArray(cycles?.cycles) ? cycles.cycles : [];
  const cadenceDays = Number.isInteger(cycles?.cadenceDays) && cycles.cadenceDays >= 1 ? cycles.cadenceDays : DEFAULT_CADENCE_DAYS;
  const stallDays = cadenceDays * STALL_MULTIPLIER;
  let last = null;
  for (const c of rows) {
    if (dayNumber(c.date) === null) {
      problems.push(`${c.id}: date が読めない (${JSON.stringify(c.date)})`);
      continue;
    }
    if (last === null || c.date > last.date) last = c;
  }
  const ageDays = last === null ? null : today - dayNumber(last.date);
  const stalled = ageDays === null || ageDays >= stallDays;
  return { cadenceDays, stallDays, count: rows.length, last, ageDays, stalled, problems, actionable: (stalled ? 1 : 0) + problems.length };
}

/** 報告に載せる Markdown。 */
function renderLoop(s) {
  const lines = ['### 狩りの輪 (探索 → 解析 → 対策 → 報告)', ''];
  if (s.last === null) {
    lines.push('- ❌ **1 周も記録が無い** —— 予約 (週 1) が走っていないか、`hunt:cycle -- record` が呼ばれていない');
  } else {
    const mark = s.stalled ? '❌' : '✅';
    lines.push(`- ${mark} 最後の周 ${s.last.id} (${s.last.date} · \`${s.last.surface}\`) から **${s.ageDays} 日**${s.stalled ? ` —— 止まった (${s.stallDays} 日以上)` : ` (予約の間隔 ${s.cadenceDays} 日)`}`);
    const n = Array.isArray(s.last.countermeasure?.threats) ? s.last.countermeasure.threats.length : 0;
    lines.push(`- 最後の周の報告: ${s.last.report?.pr ? `PR #${s.last.report.pr}` : `PR なし (${s.last.report?.reason ?? '理由なし'})`} · 対策 ${n} 件 · ${String(s.last.report?.summary ?? '').slice(0, 120)}`);
    lines.push(`- 記録した周 ${s.count}`);
  }
  for (const p of s.problems) lines.push(`- ❌ ${p}`);
  lines.push('');
  lines.push('_輪を回すのは Claude Code の予約 (docs/HUNT_CYCLE_PROMPT.md)。止まっていれば予約が生きているかを確かめる。直しは draft PR で、マージは人が決める。_');
  return lines.join('\n');
}

function selfTest() {
  let bad = 0;
  const check = (label, ok) => {
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  };
  console.log('self-test:');
  const t = (id, surface, found, status = 'fixed') => ({ id, surface, found, severity: 'medium', status });
  const ledger = {
    surfaces: ['a', 'b', 'c'],
    threats: [t('T-001', 'a', '2026-10-20'), t('T-002', 'b', '2026-08-01'), t('T-003', 'c', '2026-10-20', 'open')],
    huntBacklog: [{ surface: 'b', item: '古い', why: '2026-08-02 に残した' }],
    clearedBacklog: [],
    classes: [],
  };
  const cyc = (id, date, surface, extra = {}) => ({
    id, date, surface, pickedBy: 'brief',
    explore: { targets: ['x.ts'], reports: 1 },
    analyze: { confirmed: ['T-001'], unconfirmed: 0, healthy: 1 },
    countermeasure: { threats: ['T-001'], backlog: 0 },
    report: { pr: 1, summary: 's' },
    ...extra,
  });
  const doc = '# x\n\n## surface: a\n\nA の手順\n\n## surface: b\n\nB の手順\n\n## 回す頻度\n';
  const NOW = '2026-10-28';

  // 面の選び方
  const b0 = buildBrief({ ledger, cycles: { cycles: [] }, doc, now: NOW });
  check('止まった面 (b · 狩り残しあり・88 日) が最初に選ばれる', b0.surface === 'b' && b0.id === 'HC-001');
  const noStall = { ...ledger, huntBacklog: [] };
  const b1 = buildBrief({ ledger: noStall, cycles: { cycles: [cyc('HC-001', '2026-10-21', 'a')] }, doc, now: NOW });
  check('止まった面が無ければ、まだ狩っていない面 (b / c) のうち収穫が同点なら台帳の順で b', b1.surface === 'b');
  const cHot = { ...noStall, threats: [...noStall.threats, t('T-004', 'c', '2026-10-25')] };
  const b1c = buildBrief({ ledger: cHot, cycles: { cycles: [cyc('HC-001', '2026-10-21', 'a')] }, doc, now: NOW });
  check('同じ古さなら収穫の高い面 (c) が先', b1c.surface === 'c');
  const b2 = buildBrief({ ledger: noStall, cycles: { cycles: [cyc('HC-001', '2026-10-21', 'a'), cyc('HC-002', '2026-10-22', 'b'), cyc('HC-003', '2026-10-23', 'c')] }, doc, now: NOW });
  check('全部狩った後は最後に狩った日が最も古い面 (a) へ戻る (輪)', b2.surface === 'a' && b2.id === 'HC-004');
  check('文面に面の節・狩り残し・雛形が出る', b0.markdown.includes('B の手順') && b0.markdown.includes('古い') && b0.markdown.includes('"id": "HC-001"'));
  const b3 = buildBrief({ ledger: { ...noStall, surfaces: ['a', 'b', 'c', 'zz'] }, cycles: { cycles: [cyc('HC-001', '2026-10-21', 'a'), cyc('HC-002', '2026-10-22', 'b'), cyc('HC-003', '2026-10-23', 'c')] }, doc, now: NOW });
  check('手順書に節が無い面は problems に出る (黙って空の手順で狩らせない)', b3.surface === 'zz' && b3.problems.some((p) => p.includes('zz')));
  check('台帳が読めなければ problems', buildBrief({ ledger, cycles: null, doc, now: NOW }).problems.length === 1);

  // 記録の検め
  const empty = { cycles: [] };
  check('4 段そろった記録は通る', cycleProblems(cyc('HC-001', NOW, 'a'), ledger, empty).length === 0);
  check('段を 1 つ落とすと断る', cycleProblems(cyc('HC-001', NOW, 'a', { report: undefined }), ledger, empty).some((p) => p.includes('report')));
  check('台帳に無い穴は断る', cycleProblems(cyc('HC-001', NOW, 'a', { countermeasure: { threats: ['T-999'], backlog: 0 }, analyze: { confirmed: [], unconfirmed: 0, healthy: 0 } }), ledger, empty).some((p) => p.includes('T-999')));
  check('open のままの穴を「対策した」とは記録できない', cycleProblems(cyc('HC-001', NOW, 'a', { countermeasure: { threats: ['T-003'], backlog: 0 }, analyze: { confirmed: [], unconfirmed: 0, healthy: 0 } }), ledger, empty).some((p) => p.includes('T-003')));
  check('確認した穴が対策に無ければ断る', cycleProblems(cyc('HC-001', NOW, 'a', { countermeasure: { threats: [], backlog: 0 } }), ledger, empty).some((p) => p.includes('T-001')));
  check('PR も理由も無い報告は断る', cycleProblems(cyc('HC-001', NOW, 'a', { report: { pr: null, summary: 's' } }), ledger, empty).some((p) => p.includes('reason')));
  check('PR の代わりに理由があれば通る', cycleProblems(cyc('HC-001', NOW, 'a', { report: { pr: null, reason: '直す物が無かった', summary: 's' } }), ledger, empty).length === 0);
  check('雛形のままの記録は断る', cycleProblems(cyc('HC-001', NOW, 'a', { explore: { targets: ['<見た所>'], reports: 1 } }), ledger, empty).some((p) => p.includes('explore.targets')));
  check('id は次の番号でなければならない', cycleProblems(cyc('HC-003', NOW, 'a'), ledger, { cycles: [cyc('HC-001', '2026-10-01', 'a')] }).some((p) => p.includes('HC-002')));
  check('同じ id は 2 度積めない', cycleProblems(cyc('HC-001', NOW, 'a'), ledger, { cycles: [cyc('HC-001', '2026-10-01', 'a')] }).some((p) => p.includes('既に')));
  check('暦に無い日付・台帳に無い面は断る', cycleProblems(cyc('HC-001', '2026-02-31', 'zz'), ledger, empty).length >= 2);

  // 輪の状態
  const s0 = loopStatus({ cadenceDays: 7, cycles: [] }, NOW);
  check('1 周も無ければ止まっている (要対応 1)', s0.stalled && s0.actionable === 1 && s0.last === null);
  const s1 = loopStatus({ cadenceDays: 7, cycles: [cyc('HC-001', '2026-10-15', 'a')] }, NOW);
  check('13 日前なら止まっていない (境目は cadence × 2 = 14 日)', !s1.stalled && s1.ageDays === 13);
  const s2 = loopStatus({ cadenceDays: 7, cycles: [cyc('HC-001', '2026-10-14', 'a')] }, NOW);
  check('14 日でちょうど止まる', s2.stalled && s2.stallDays === 14);
  const s3 = loopStatus({ cycles: [cyc('HC-001', '2026-10-14', 'a'), cyc('HC-002', '2026-10-27', 'b')] }, NOW);
  check('最後の周は日付で選ぶ (配列の順ではない)・cadence の既定は 7', s3.last.id === 'HC-002' && s3.cadenceDays === DEFAULT_CADENCE_DAYS && !s3.stalled);
  const s4 = loopStatus({ cycles: [cyc('HC-001', 'bad', 'a')] }, NOW);
  check('読めない日付は problems (0 件と混ぜない)', s4.problems.length === 1 && s4.actionable === 2);
  let threw = false;
  try {
    loopStatus({ cycles: [] }, 'yesterday');
  } catch {
    threw = true;
  }
  check('今日の日付が読めなければ投げる', threw);
  check('文面に止まった印と PR が出る', renderLoop(s2).includes('❌') && renderLoop(s3).includes('PR #1') && renderLoop(s0).includes('1 周も記録が無い'));
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

/** 実行環境のローカルな暦の今日 (UTC の切り出しは日本の朝 9 時まで前日になる)。 */
function localToday() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const cmd = argv.find((a) => !a.startsWith('--'));
  const json = argv.includes('--json');
  const now = localToday();
  if (cmd === 'brief') {
    const b = buildBrief({ ledger: readJson(LEDGER), cycles: readJson(CYCLES), doc: fs.readFileSync(HUNT_DOC, 'utf8'), now, team: readJson(TEAM) });
    console.log(json ? JSON.stringify({ ...b, markdown: undefined }, null, 2) : b.markdown);
    return b.problems.length > 0 ? 1 : 0;
  }
  if (cmd === 'status') {
    const s = loopStatus(readJson(CYCLES), now);
    console.log(json ? JSON.stringify(s, null, 2) : renderLoop(s));
    // 報告する道具 —— 止まっていても exit 0 (要対応は Issue に出る)。読めなかったときだけ落とす。
    return s.problems.length > 0 ? 1 : 0;
  }
  if (cmd === 'record') {
    const file = argv[argv.indexOf('record') + 1];
    if (!file || file.startsWith('--')) {
      console.error('使い方: hunt-cycle.cjs record <記録の JSON>');
      return 2;
    }
    const ledger = readJson(LEDGER);
    const cycles = readJson(CYCLES);
    const cycle = readJson(path.resolve(file));
    const roster = readJson(TEAM);
    const problems = cycleProblems(cycle, ledger, cycles, roster);
    if (problems.length > 0) {
      console.error(`❌ 記録を断りました (${problems.length} 件):`);
      for (const p of problems) console.error(`  - ${p}`);
      return 1;
    }
    const nextRoster = cycle.team === undefined ? roster : team.applyCycle(roster, cycle);
    const rosterProblems = team.teamProblems(nextRoster, ledger);
    if (rosterProblems.length > 0) {
      console.error(`❌ 反映した名簿が壊れるので断りました (${rosterProblems.length} 件):`);
      for (const p of rosterProblems) console.error(`  - ${p}`);
      return 1;
    }
    cycles.cycles.push(cycle);
    fs.writeFileSync(CYCLES, `${JSON.stringify(cycles, null, 2)}\n`);
    if (nextRoster !== roster) fs.writeFileSync(TEAM, `${JSON.stringify(nextRoster, null, 2)}\n`);
    const learnedN = Array.isArray(cycle.learned) ? cycle.learned.length : 0;
    console.log(`✅ ${cycle.id} を security/hunt-cycles.json へ記録しました (${cycle.surface} · 対策 ${cycle.countermeasure.threats.length} 件 · 学んだ型 ${learnedN} 件)`);
    return 0;
  }
  console.error('使い方: hunt-cycle.cjs brief|record <file>|status [--json] | --self-test');
  return 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { buildBrief, cycleProblems, loopStatus, renderLoop, pickSurface, surfaceSection, nextId, STAGES, STAGE_LABELS, DEFAULT_CADENCE_DAYS, STALL_MULTIPLIER };

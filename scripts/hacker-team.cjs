#!/usr/bin/env node
/**
 * hacker-team — **常設の AI ホワイトハッカー班: 編成・自己学習・自己進化** (2026-10-30 · threat: T-222)。
 *
 * ## 何が欠けていたか
 *
 * 狩りの輪 (scripts/hunt-cycle.cjs · T-214) は週 1 で面を選び 4 段を記録するが、狩るのは**毎回同じ 1 人の
 * 監査役**だった。① 角度が 1 つなので、その人が見ない型 (費用の暴走・供給網・OS の境界) は面を変えても
 * 見えない ② 前の周で見つけた穴の**型**はどこにも残らず、次の周は同じ形の写しを別のファイルで探さない
 * (このリポジトリの穴の多くは「隣に同じ形がもう 1 つ」だった —— パス 334 / 390 / 391 / 412 ほか)
 * ③ 収穫の無い角度を外す・新しい攻撃の型を受け持つ角度を足す手が無い —— 名簿は人が書き換えない限り変わらない。
 *
 * ## 何をするか (網にも AI にも触れない純関数・費用 0)
 *
 *   名簿 (security/hacker-team.json) —— 役は 4 種: 赤 (red · 攻撃の角度ごと) / 変種狩り (variant) /
 *   反証役 (blue) / 進化役 (evolver)。core の 4 役 (recon・variant・blue・evolver) は毎周出る。
 *
 *   編成 (pickLineup) —— 面に効く赤から、最後に出た日が最も古い役 → 収穫 (確認した穴) の多い役 → id の順で
 *   lineup.red 人を選ぶ (recon は必ず 1 人目)。同じ名簿・同じ輪の台帳なら同じ答えになる (決定的)。
 *
 *   自己学習 (learned → patterns) —— 確認した穴 1 つにつき「型」(shape と探し方 look) を 1 つ書かなければ
 *   記録できない。record がそれを名簿の patterns へ足し、次の周の変種狩りの種になる (variantSeeds)。
 *
 *   自己進化 (evolution) —— 進化役が提案した役の追加 (add)・引退 (retire) を record が検めてから名簿へ入れる。
 *   3 周以上出て 1 件も確認していない赤は「収穫の無い役」として brief が名指し、進化役に判断させる。
 *   core は引退できず、活動中の赤が lineup.red を割る引退は断る (班を痩せさせない)。
 *
 * **自動なのは編成・学習・進化の記録まで** —— 直しは draft PR、マージは人が決める (輪と同じ)。
 *
 * 使い方:
 *   node scripts/hacker-team.cjs --self-test
 *   (編成・種・記録の検めは hunt-cycle.cjs の brief / record から呼ばれる)
 */
'use strict';

const KINDS = ['red', 'variant', 'blue', 'evolver'];
const CORE_KINDS = ['variant', 'blue', 'evolver'];
const ROLE_ID_RE = /^[a-z][a-z0-9-]{1,31}$/;
const PATTERN_ID_RE = /^P-(\d{3,})$/;
const CYCLE_ID_RE = /^HC-\d{3,}$/;
const THREAT_ID_RE = /^T-\d{3,}$/;
const DROUGHT_USES = 3;
const MAX_SEEDS = 12;
const RECENT_THREATS = 5;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0 && !v.trim().startsWith('<');
const isInt = (v) => Number.isInteger(v) && v >= 0;
const active = (r) => r.retiredIn === undefined;
const rolesOf = (team) => (Array.isArray(team?.roles) ? team.roles : []);
const patternsOf = (team) => (Array.isArray(team?.patterns) ? team.patterns : []);
const redQuota = (team) => (Number.isInteger(team?.lineup?.red) && team.lineup.red >= 1 ? team.lineup.red : 3);

/** 役 1 つの形を検める (追加の提案にも同じ規則を当てる)。 */
function roleShapeProblems(r, ledger, label) {
  const out = [];
  const surfaces = new Set([...(Array.isArray(ledger?.surfaces) ? ledger.surfaces : []), 'any']);
  const classes = new Set((Array.isArray(ledger?.classes) ? ledger.classes : []).map((c) => c.id));
  if (r === null || typeof r !== 'object') return [`${label}: 役がオブジェクトでない`];
  if (!ROLE_ID_RE.test(String(r.id))) out.push(`${label}: id が小文字の識別子でない (${JSON.stringify(r.id)})`);
  if (!KINDS.includes(r.kind)) out.push(`${label}: kind は ${KINDS.join(' / ')} (${JSON.stringify(r.kind)})`);
  if (!isNonEmptyString(r.name)) out.push(`${label}: name が空`);
  if (!isNonEmptyString(r.mission) || r.mission.length < 20) out.push(`${label}: mission (何をどう狩るか) が 20 字に満たない`);
  if (!Array.isArray(r.surfaces) || r.surfaces.length === 0) out.push(`${label}: surfaces が空`);
  else for (const s of r.surfaces) if (!surfaces.has(s)) out.push(`${label}: surface ${JSON.stringify(s)} が脅威台帳に無い`);
  if (!Array.isArray(r.classes)) out.push(`${label}: classes が配列でない`);
  else {
    for (const c of r.classes) if (!classes.has(c)) out.push(`${label}: class ${JSON.stringify(c)} が脅威台帳に無い`);
    if (r.kind === 'red' && r.classes.length === 0) out.push(`${label}: 赤は受け持つ攻撃の型 (classes) を 1 つ以上持つ`);
  }
  return out;
}

/** 名簿の形を検める。問題の一覧 (空なら健全)。 */
function teamProblems(team, ledger) {
  if (team === null || typeof team !== 'object' || !Array.isArray(team.roles)) return ['班の名簿が読めない (roles が配列でない)'];
  const out = [];
  const ids = new Set();
  for (const r of team.roles) {
    out.push(...roleShapeProblems(r, ledger, `role ${r?.id ?? '?'}`));
    if (ids.has(r?.id)) out.push(`role ${r.id}: id が重複している`);
    ids.add(r?.id);
    if (r?.retiredIn !== undefined && !CYCLE_ID_RE.test(String(r.retiredIn))) out.push(`role ${r.id}: retiredIn が HC-NNN でない`);
    if (r?.addedIn !== undefined && !CYCLE_ID_RE.test(String(r.addedIn))) out.push(`role ${r.id}: addedIn が HC-NNN でない`);
    if (r?.core === true && r?.retiredIn !== undefined) out.push(`role ${r.id}: core の役は引退できない`);
  }
  for (const k of CORE_KINDS) {
    const n = team.roles.filter((r) => r?.kind === k && active(r)).length;
    if (n !== 1) out.push(`活動中の ${k} の役は 1 つちょうど (${n})`);
  }
  const reds = team.roles.filter((r) => r?.kind === 'red' && active(r));
  if (!reds.some((r) => r.core === true)) out.push('core の赤 (偵察) が居ない');
  if (reds.length < redQuota(team)) out.push(`活動中の赤 ${reds.length} 人が編成の人数 ${redQuota(team)} を割る`);
  const known = new Set((Array.isArray(ledger?.threats) ? ledger.threats : []).map((t) => t.id));
  let expect = 1;
  for (const p of patternsOf(team)) {
    const m = PATTERN_ID_RE.exec(String(p?.id));
    if (m === null) out.push(`pattern ${JSON.stringify(p?.id)}: id が P-NNN でない`);
    else if (Number(m[1]) !== expect) out.push(`pattern ${p.id}: 番号は P-${String(expect).padStart(3, '0')} (飛ばしも重複もしない)`);
    expect += 1;
    if (!known.has(p?.threat)) out.push(`pattern ${p?.id}: threat ${JSON.stringify(p?.threat)} が脅威台帳に無い`);
    if (!isNonEmptyString(p?.shape)) out.push(`pattern ${p?.id}: shape (型) が空`);
    if (!isNonEmptyString(p?.look)) out.push(`pattern ${p?.id}: look (探し方) が空`);
    if (!CYCLE_ID_RE.test(String(p?.learnedIn))) out.push(`pattern ${p?.id}: learnedIn が HC-NNN でない`);
  }
  return out;
}

/** 役ごとの出番と収穫。 */
function roleStats(team, cycles) {
  const m = new Map(rolesOf(team).map((r) => [r.id, { uses: 0, lastUsed: null, confirmed: 0 }]));
  for (const c of Array.isArray(cycles) ? cycles : []) {
    for (const e of Array.isArray(c?.team) ? c.team : []) {
      const s = m.get(e?.role);
      if (s === undefined) continue;
      s.uses += 1;
      if (typeof c.date === 'string' && (s.lastUsed === null || c.date > s.lastUsed)) s.lastUsed = c.date;
      s.confirmed += Array.isArray(e.confirmed) ? e.confirmed.length : 0;
    }
  }
  return m;
}

/**
 * 今週の編成 (純関数・決定的)。赤は lineup.red 人 (core の偵察が 1 人目)、残りは面に効く赤から
 * 「最後に出た日が最も古い → 収穫が多い → id」の順。変種狩り・反証役・進化役は毎周 1 人ずつ。
 */
function pickLineup(team, cycles, surface) {
  const stats = roleStats(team, cycles);
  const roles = rolesOf(team).filter(active);
  const fits = (r) => Array.isArray(r.surfaces) && (r.surfaces.includes('any') || r.surfaces.includes(surface));
  const core = roles.find((r) => r.kind === 'red' && r.core === true) ?? null;
  const key = (r) => stats.get(r.id).lastUsed ?? '0000-00-00';
  const rest = roles
    .filter((r) => r.kind === 'red' && r !== core && fits(r))
    .sort((a, b) => key(a).localeCompare(key(b)) || stats.get(b.id).confirmed - stats.get(a.id).confirmed || a.id.localeCompare(b.id));
  const red = [...(core ? [core] : []), ...rest].slice(0, redQuota(team));
  const one = (k) => roles.find((r) => r.kind === k) ?? null;
  return { red, variant: one('variant'), blue: one('blue'), evolver: one('evolver'), stats };
}

/** 変種狩りの種: 学んだ型 (新しい順) と、この面の最近の穴。 */
function variantSeeds(team, ledger, surface) {
  const patterns = [...patternsOf(team)].reverse().slice(0, MAX_SEEDS);
  const threats = (Array.isArray(ledger?.threats) ? ledger.threats : [])
    .filter((t) => t.surface === surface)
    .sort((a, b) => String(b.found).localeCompare(String(a.found)) || String(b.id).localeCompare(String(a.id)))
    .slice(0, RECENT_THREATS);
  return { patterns, threats };
}

/** 3 周以上出て 1 件も確認していない赤 (core を除く) —— 進化役が引退か任務の作り替えを判断する。 */
function droughtRoles(team, cycles) {
  const stats = roleStats(team, cycles);
  return rolesOf(team)
    .filter((r) => active(r) && r.kind === 'red' && r.core !== true)
    .filter((r) => stats.get(r.id).uses >= DROUGHT_USES && stats.get(r.id).confirmed === 0)
    .map((r) => ({ id: r.id, uses: stats.get(r.id).uses }));
}

/**
 * 1 周の記録のうち班の段 (team / learned / evolution) を検める (純関数)。
 * cycle.analyze.confirmed と突き合わせる: 確認した穴はどれかの役に帰属し、どれも型を 1 つ残す。
 */
function teamCycleProblems(cycle, team, ledger) {
  const out = [];
  const confirmed = Array.isArray(cycle?.analyze?.confirmed) ? cycle.analyze.confirmed : [];
  const byId = new Map(rolesOf(team).map((r) => [r.id, r]));
  if (!Array.isArray(cycle?.team) || cycle.team.length === 0) {
    out.push('team (今週出た役と、それぞれの報告数・確認した穴) が無い —— 班で回した周は編成を記録する');
  } else {
    const seen = new Set();
    const attributed = new Set();
    for (const e of cycle.team) {
      const r = byId.get(e?.role);
      if (r === undefined) out.push(`team: 役 ${JSON.stringify(e?.role)} は名簿に無い`);
      else if (!active(r)) out.push(`team: 役 ${r.id} は引退している (${r.retiredIn})`);
      if (seen.has(e?.role)) out.push(`team: 役 ${e?.role} が 2 度書かれている`);
      seen.add(e?.role);
      if (!isInt(e?.reports)) out.push(`team: ${e?.role} の reports は 0 以上の整数`);
      if (!Array.isArray(e?.confirmed)) out.push(`team: ${e?.role} の confirmed が配列でない`);
      else {
        for (const id of e.confirmed) {
          if (!confirmed.includes(id)) out.push(`team: ${e.role} の ${JSON.stringify(id)} は analyze.confirmed に無い`);
          attributed.add(id);
        }
      }
    }
    const kinds = new Set([...seen].map((id) => byId.get(id)?.kind));
    for (const k of KINDS) if (!kinds.has(k)) out.push(`team: ${k} の役が出ていない (4 種そろえて回す)`);
    for (const id of confirmed) if (!attributed.has(id)) out.push(`team: 確認した ${id} がどの役にも帰属していない`);
  }
  const learned = cycle?.learned;
  if (!Array.isArray(learned)) out.push('learned (確認した穴から学んだ型) が配列でない');
  else {
    const covered = new Set();
    for (const l of learned) {
      if (!THREAT_ID_RE.test(String(l?.threat)) || !confirmed.includes(l?.threat)) out.push(`learned: threat ${JSON.stringify(l?.threat)} は analyze.confirmed に無い`);
      covered.add(l?.threat);
      if (!isNonEmptyString(l?.shape)) out.push(`learned: ${l?.threat} の shape (型) が空か雛形のまま`);
      if (!isNonEmptyString(l?.look)) out.push(`learned: ${l?.threat} の look (次に探すときの探し方) が空か雛形のまま`);
    }
    for (const id of confirmed) if (!covered.has(id)) out.push(`learned: 確認した ${id} の型が無い —— 学ばずに閉じた穴は次の周の種にならない`);
  }
  const ev = cycle?.evolution;
  if (ev === null || typeof ev !== 'object') out.push('evolution (進化役の判断) が無い —— 変えないなら add / retire を空にして notes に理由');
  else {
    if (!isNonEmptyString(ev.notes)) out.push('evolution.notes (変えた / 変えなかった理由) が空か雛形のまま');
    const add = Array.isArray(ev.add) ? ev.add : null;
    const retire = Array.isArray(ev.retire) ? ev.retire : null;
    if (add === null) out.push('evolution.add が配列でない');
    if (retire === null) out.push('evolution.retire が配列でない');
    if (add !== null) {
      for (const r of add) {
        out.push(...roleShapeProblems(r, ledger, `evolution.add ${r?.id ?? '?'}`));
        if (r?.kind !== 'red') out.push(`evolution.add ${r?.id}: 足せるのは赤の役だけ (core の 3 役は 1 つずつ)`);
        if (byId.has(r?.id)) out.push(`evolution.add ${r?.id}: id が名簿に既に在る`);
        if (r?.core !== undefined) out.push(`evolution.add ${r?.id}: core は名簿の初めの 4 役だけ`);
      }
    }
    if (retire !== null) {
      for (const id of retire) {
        const r = byId.get(id);
        if (r === undefined) out.push(`evolution.retire: ${JSON.stringify(id)} は名簿に無い`);
        else if (r.core === true) out.push(`evolution.retire: ${id} は core なので引退できない`);
        else if (!active(r)) out.push(`evolution.retire: ${id} は既に引退している`);
      }
      if (add !== null) {
        const after = rolesOf(team).filter((r) => active(r) && r.kind === 'red' && !retire.includes(r.id)).length + add.filter((r) => r?.kind === 'red').length;
        if (after < redQuota(team)) out.push(`evolution: 引退の後の活動中の赤 ${after} 人が編成の人数 ${redQuota(team)} を割る`);
      }
    }
  }
  return out;
}

/** 検め終えた周を名簿へ反映する (純関数 —— 新しい名簿を返す)。学んだ型・足した役・引退を書き込む。 */
function applyCycle(team, cycle) {
  const patterns = [...patternsOf(team)];
  for (const l of cycle.learned ?? []) {
    patterns.push({ id: `P-${String(patterns.length + 1).padStart(3, '0')}`, threat: l.threat, shape: l.shape, look: l.look, learnedIn: cycle.id });
  }
  const retire = new Set(cycle.evolution?.retire ?? []);
  const roles = rolesOf(team).map((r) => (retire.has(r.id) ? { ...r, retiredIn: cycle.id } : r));
  for (const r of cycle.evolution?.add ?? []) roles.push({ ...r, addedIn: cycle.id });
  return { ...team, roles, patterns };
}

/** brief に載せる節 (Markdown の行)。 */
function renderTeamBrief(team, ledger, cycles, surface) {
  const lineup = pickLineup(team, cycles, surface);
  const seeds = variantSeeds(team, ledger, surface);
  const drought = droughtRoles(team, cycles);
  const roleLine = (r) => {
    const s = lineup.stats.get(r.id);
    return `- **${r.id}** (${r.kind} · ${r.name}) —— 出番 ${s.uses} · 確認 ${s.confirmed}${s.lastUsed ? ` · 最後 ${s.lastUsed}` : ' · 初出場'}\n  - ${r.mission}`;
  };
  const members = [...lineup.red, lineup.variant, lineup.blue, lineup.evolver].filter(Boolean);
  return {
    lineup,
    seeds,
    drought,
    lines: [
      `## 今週の班 (${members.length} 人 · security/hacker-team.json)`,
      '',
      '赤は並べて狩り (互いの結果を見ない)、変種狩りは下の種で走査し、反証役が全部の指摘を再現しようとし、進化役が最後に学びと名簿の変更を書く。',
      '',
      ...members.map(roleLine),
      '',
      `## 変種狩りの種 (学んだ型 ${seeds.patterns.length} · この面の最近の穴 ${seeds.threats.length})`,
      '',
      ...(seeds.patterns.length === 0 ? ['- 学んだ型はまだ無い (この周が最初の種を残す)'] : seeds.patterns.map((p) => `- ${p.id} (${p.threat} · ${p.learnedIn}): ${p.shape}\n  - 探し方: ${p.look}`)),
      ...seeds.threats.map((t) => `- ${t.id} (${t.found} · ${t.class}): ${String(t.title).slice(0, 160)}`),
      '',
      `## 収穫の無い役 (${drought.length} · ${DROUGHT_USES} 周以上で確認 0)`,
      '',
      ...(drought.length === 0 ? ['なし'] : drought.map((d) => `- ${d.id} (出番 ${d.uses}) —— 進化役は任務を作り替えるか引退させるかを evolution に書く`)),
      '',
    ],
  };
}

/** 記録の雛形のうち班の段。 */
function teamTemplate(lineup) {
  const members = [...lineup.red, lineup.variant, lineup.blue, lineup.evolver].filter(Boolean);
  return {
    team: members.map((r) => ({ role: r.id, reports: 0, confirmed: [] })),
    learned: [{ threat: '<T-xxx>', shape: '<型 (1 行)>', look: '<次に探すときの探し方 (grep の針・見る場所)>' }],
    evolution: { add: [], retire: [], notes: '<名簿を変えた / 変えなかった理由>' },
  };
}

function selfTest() {
  let bad = 0;
  const check = (label, ok) => {
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  };
  console.log('self-test:');
  const ledger = {
    surfaces: ['a', 'b'],
    classes: [{ id: 'x' }, { id: 'y' }],
    threats: [
      { id: 'T-001', surface: 'a', found: '2026-10-01', class: 'x', title: '古い穴', status: 'fixed' },
      { id: 'T-002', surface: 'a', found: '2026-10-20', class: 'y', title: '新しい穴', status: 'fixed' },
    ],
  };
  const M = 'じゅうぶんに長い任務の説明 (二十字以上ある)';
  const role = (id, kind, extra = {}) => ({ id, kind, name: id, surfaces: ['any'], classes: kind === 'red' ? ['x'] : [], mission: M, ...extra });
  const team = {
    lineup: { red: 3 },
    roles: [
      role('recon', 'red', { core: true }),
      role('r-a', 'red', { surfaces: ['a'] }),
      role('r-b', 'red', { surfaces: ['b'] }),
      role('r-ab', 'red', { surfaces: ['a', 'b'] }),
      role('r-any', 'red'),
      role('variant', 'variant', { core: true }),
      role('blue', 'blue', { core: true }),
      role('evolver', 'evolver', { core: true }),
    ],
    patterns: [],
  };
  check('健全な名簿は通る', teamProblems(team, ledger).length === 0);
  check('台帳に無い class は断る', teamProblems({ ...team, roles: [...team.roles, role('z', 'red', { classes: ['zz'] })] }, ledger).some((p) => p.includes('zz')));
  check('反証役が 2 人なら断る', teamProblems({ ...team, roles: [...team.roles, role('blue2', 'blue')] }, ledger).some((p) => p.includes('blue')));
  check('型の番号を飛ばすと断る', teamProblems({ ...team, patterns: [{ id: 'P-002', threat: 'T-001', shape: 's', look: 'l', learnedIn: 'HC-001' }] }, ledger).some((p) => p.includes('P-001')));

  const l0 = pickLineup(team, [], 'a');
  check('偵察が 1 人目・面に効かない赤 (r-b) は出ない・3 人', l0.red.map((r) => r.id).join() === 'recon,r-a,r-ab' && l0.blue.id === 'blue');
  const cyc = (id, date, roles) => ({ id, date, team: roles.map(([role, confirmed = []]) => ({ role, reports: 1, confirmed })) });
  const l1 = pickLineup(team, [cyc('HC-001', '2026-10-21', [['recon'], ['r-a'], ['r-ab']])], 'a');
  check('出番の古い役 (まだ出ていない r-any) が先に回る', l1.red.map((r) => r.id).join() === 'recon,r-any,r-a');
  const l2 = pickLineup(team, [cyc('HC-001', '2026-10-21', [['r-a', ['T-001']], ['r-ab']])], 'a');
  check('同じ古さなら収穫の多い役が先', l2.red[1].id === 'r-any' && l2.red[2].id === 'r-a');

  const s = variantSeeds({ ...team, patterns: [{ id: 'P-001', threat: 'T-001', shape: 's', look: 'l', learnedIn: 'HC-001' }] }, ledger, 'a');
  check('種は学んだ型と、面の最近の穴 (新しい順)', s.patterns.length === 1 && s.threats[0].id === 'T-002');
  const dry = [1, 2, 3].map((n) => cyc(`HC-00${n}`, `2026-10-0${n}`, [['r-a'], ['recon']]));
  check('3 周出て確認 0 の赤は収穫の無い役 (core は除く)', droughtRoles(team, dry).map((d) => d.id).join() === 'r-a');

  const ok = {
    id: 'HC-002',
    analyze: { confirmed: ['T-002'] },
    team: [{ role: 'recon', reports: 2, confirmed: ['T-002'] }, { role: 'variant', reports: 0, confirmed: [] }, { role: 'blue', reports: 1, confirmed: [] }, { role: 'evolver', reports: 0, confirmed: [] }],
    learned: [{ threat: 'T-002', shape: '素の .length で文字数を数える', look: 'grep -n "\\.length >"' }],
    evolution: { add: [], retire: [], notes: '名簿は変えない (初回)' },
  };
  check('班の段がそろった記録は通る', teamCycleProblems(ok, team, ledger).length === 0);
  check('確認した穴に型が無ければ断る', teamCycleProblems({ ...ok, learned: [] }, team, ledger).some((p) => p.includes('T-002')));
  check('どの役にも帰属しない穴は断る', teamCycleProblems({ ...ok, team: ok.team.map((e) => ({ ...e, confirmed: [] })) }, team, ledger).some((p) => p.includes('帰属')));
  check('4 種そろわない班は断る', teamCycleProblems({ ...ok, team: ok.team.filter((e) => e.role !== 'blue') }, team, ledger).some((p) => p.includes('blue')));
  check('core は引退できない', teamCycleProblems({ ...ok, evolution: { add: [], retire: ['recon'], notes: 'n' } }, team, ledger).some((p) => p.includes('core')));
  check('赤が編成の人数を割る引退は断る', teamCycleProblems({ ...ok, evolution: { add: [], retire: ['r-a', 'r-b', 'r-ab', 'r-any'], notes: 'n' } }, team, ledger).some((p) => p.includes('割る')));
  check('足す役も同じ形の規則 (台帳に無い class) を通る', teamCycleProblems({ ...ok, evolution: { add: [role('new', 'red', { classes: ['zz'] })], retire: [], notes: 'n' } }, team, ledger).some((p) => p.includes('zz')));
  check('雛形のままの evolution.notes は断る', teamCycleProblems({ ...ok, evolution: { add: [], retire: [], notes: '<理由>' } }, team, ledger).some((p) => p.includes('notes')));

  const next = applyCycle(team, { ...ok, evolution: { add: [role('r-new', 'red')], retire: ['r-b'], notes: 'n' } });
  check('反映: 型が P-001 で入り、足した役と引退が書かれる', next.patterns[0].id === 'P-001' && next.patterns[0].learnedIn === 'HC-002' && next.roles.find((r) => r.id === 'r-new').addedIn === 'HC-002' && next.roles.find((r) => r.id === 'r-b').retiredIn === 'HC-002');
  check('反映した名簿も健全', teamProblems(next, ledger).length === 0);
  check('引退した役は編成に出ない', !pickLineup(next, [], 'b').red.some((r) => r.id === 'r-b'));
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

if (require.main === module) process.exit(process.argv.includes('--self-test') ? selfTest() : (console.error('使い方: hacker-team.cjs --self-test'), 2));
module.exports = {
  teamProblems,
  roleStats,
  pickLineup,
  variantSeeds,
  droughtRoles,
  teamCycleProblems,
  applyCycle,
  renderTeamBrief,
  teamTemplate,
  KINDS,
  DROUGHT_USES,
};

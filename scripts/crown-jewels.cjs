#!/usr/bin/env node
/*
 * 王冠の宝石 (crown jewels) —— 確率に依らない守りを、宝石ごとに機械で確かめる
 * (2026-10-23 · threat: T-169)。
 *
 * 発想: 『侵入される確率が 10^-29 % 以下』と見積もっても、その見積もりは当たらない
 * (攻撃は AI で速く多くなり、確率は攻撃の数で動く)。だから守りを確率で決めず、
 * **破られたときに失う物**で決める。守る物ごとに、破られた後を前提にした 4 種類の層
 * —— 防ぐ (prevent)・封じ込める (contain)・気付く (detect)・戻す (recover) —— を必ず持つ。
 *
 * この関数が確かめるのは次の 6 つ (純関数・網にも AI にも触れない):
 *  1. 宝石ごとに 4 種類の層がすべて在る (1 つでも欠ければ要対応)
 *  2. 層ごとに強制する物 (enforcedBy) が在り、実在する (名前だけの層は層ではない)
 *  3. 宝石ごとに別々の強制物が 3 つ以上 (1 つの物が壊れて全部の層が消えない)
 *  4. 『防ぐ』と『封じ込める』は強制物を共有しない (防ぎが破れたとき、封じ込めも同時に破れない)
 *  5. 層の説明と ifAllPreventionFails に、確率で守りを諦める言い回しを書かない
 *  6. impact は catastrophic (確率ではなく被害の大きさで入れた印)
 *
 * 限界 (正直に): 強制物が『在る』ことは確かめるが、その物が十分に強いかは確かめない
 * (それは狩りと回帰検査の仕事)。10^-29 % を証明する仕組みではなく、確率を判断から外す仕組みである。
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KINDS = ['prevent', 'contain', 'detect', 'recover'];
const MIN_DISTINCT_ENFORCERS = 3;
// 確率で守りを諦める言い回し。層の説明に書けない。
const PROBABILITY_DISMISSAL = [
  /確率が(?:低|ほぼ|極めて|限りなく)/,
  /起きにくい/,
  /まず起きない/,
  /めったに/,
  /ありえない|あり得ない/,
  /現実的でない/,
  /可能性は(?:低|ほぼ|ない|無)/,
  /到達しない/,
  /実害は(?:今日)? ?0/,
  /\b(?:unlikely|improbable|negligible|very low probability)\b/i,
];

function dismissalIn(text) {
  for (const re of PROBABILITY_DISMISSAL) if (re.test(text)) return re.source;
  return null;
}

function analyzeCrownJewels(registry, exists) {
  const problems = [];
  const jewels = [];
  if (!registry || typeof registry !== 'object' || !Array.isArray(registry.jewels) || registry.jewels.length === 0) {
    return { jewels, problems: ['王冠の宝石の台帳を読めない (jewels が配列でない・空)'], actionable: 1 };
  }
  for (const j of registry.jewels) {
    const id = j && typeof j.id === 'string' ? j.id : '(id 無し)';
    const say = (msg) => problems.push(`${id}: ${msg}`);
    if (!j || typeof j !== 'object' || !Array.isArray(j.layers)) {
      say('layers が配列でない');
      jewels.push({ id, kinds: [], missing: [...KINDS] });
      continue;
    }
    if (j.impact !== 'catastrophic') say(`impact が catastrophic でない (${String(j.impact)}) —— 王冠の宝石は被害の大きさで入れる`);
    if (typeof j.ifAllPreventionFails !== 'string' || j.ifAllPreventionFails.trim() === '') say('ifAllPreventionFails (防ぎが全部破れたときに何が残るか) が空');
    else {
      const d = dismissalIn(j.ifAllPreventionFails);
      if (d) say(`ifAllPreventionFails が確率で諦める言い回しを含む (${d})`);
    }
    const byKind = new Map();
    const all = new Set();
    for (const l of j.layers) {
      if (!l || !KINDS.includes(l.kind)) {
        say(`層の kind が ${KINDS.join(' / ')} のどれでもない (${String(l && l.kind)})`);
        continue;
      }
      const set = byKind.get(l.kind) || new Set();
      const enf = Array.isArray(l.enforcedBy) ? l.enforcedBy.filter((x) => typeof x === 'string') : [];
      if (enf.length === 0) say(`${l.kind} 層に強制する物 (enforcedBy) が無い`);
      for (const e of enf) {
        if (!exists(e)) say(`${l.kind} 層の強制物が実在しない: ${e}`);
        set.add(e);
        all.add(e);
      }
      byKind.set(l.kind, set);
      const d = typeof l.what === 'string' ? dismissalIn(l.what) : null;
      if (d) say(`${l.kind} 層の説明が確率で諦める言い回しを含む (${d})`);
      if (typeof l.what !== 'string' || l.what.trim() === '') say(`${l.kind} 層の説明が空`);
    }
    const missing = KINDS.filter((k) => !byKind.has(k));
    for (const k of missing) say(`${k} 層が無い —— 破られた後を前提にした 4 種類 (防ぐ・封じ込める・気付く・戻す) が要る`);
    if (all.size < MIN_DISTINCT_ENFORCERS) say(`別々の強制物が ${all.size} 個しかない (${MIN_DISTINCT_ENFORCERS} 個以上)`);
    const p = byKind.get('prevent');
    const c = byKind.get('contain');
    if (p && c) {
      const shared = [...p].filter((x) => c.has(x));
      if (shared.length > 0) say(`prevent と contain が強制物を共有している (${shared.join(', ')}) —— 防ぎが破れたとき封じ込めも同時に破れる`);
    }
    jewels.push({ id, kinds: [...byKind.keys()], missing, distinctEnforcers: all.size });
  }
  return { jewels, problems, actionable: problems.length };
}

function renderCrownJewels(r) {
  const lines = ['### 王冠の宝石 (確率に依らない守り)', '', '| 宝石 | 層 | 別々の強制物 | 欠けた層 |', '| --- | --- | ---: | --- |'];
  for (const j of r.jewels) lines.push(`| ${j.id} | ${j.kinds.length}/4 | ${j.distinctEnforcers ?? 0} | ${j.missing.length ? j.missing.join(', ') : '—'} |`);
  if (r.problems.length) lines.push('', '**要対応:**', ...r.problems.map((p) => `- ${p}`));
  lines.push('', '_確率を判断に入れず、破られた後の層を宝石ごとに要求する。層が『十分に強いか』は狩りと回帰検査の仕事。_');
  return lines.join('\n');
}

function realExists(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return (e) => (e.startsWith('npm:') ? Boolean(pkg.scripts && pkg.scripts[e.slice(4)]) : fs.existsSync(path.join(root, e)));
}

function selfTest() {
  const good = () => ({
    jewels: [{
      id: 'a', impact: 'catastrophic', ifAllPreventionFails: '破られても残る物がある。',
      layers: [
        { kind: 'prevent', what: 'p', enforcedBy: ['f1'] },
        { kind: 'contain', what: 'c', enforcedBy: ['f2'] },
        { kind: 'detect', what: 'd', enforcedBy: ['f3'] },
        { kind: 'recover', what: 'r', enforcedBy: ['f3'] },
      ],
    }],
  });
  const exists = (e) => e !== 'gone';
  const cases = [
    ['揃っていれば 0 件', good(), 0],
    ['recover 層が欠けると落ちる', (() => { const g = good(); g.jewels[0].layers.pop(); return g; })(), 1],
    ['実在しない強制物を落とす', (() => { const g = good(); g.jewels[0].layers[0].enforcedBy = ['gone']; return g; })(), 1],
    ['強制物が 2 個だと落ちる', (() => { const g = good(); g.jewels[0].layers[2].enforcedBy = ['f1']; g.jewels[0].layers[3].enforcedBy = ['f2']; return g; })(), 1],
    ['prevent と contain が同じ物を頼ると落ちる', (() => { const g = good(); g.jewels[0].layers[1].enforcedBy = ['f1']; g.jewels[0].layers[2].enforcedBy = ['f4']; return g; })(), 1],
    ['確率で諦める言い回しを落とす', (() => { const g = good(); g.jewels[0].layers[0].what = '起きにくいので省く'; return g; })(), 1],
    ['impact が catastrophic でないと落ちる', (() => { const g = good(); g.jewels[0].impact = 'low'; return g; })(), 1],
    ['台帳が空なら読めないと言う', { jewels: [] }, 1],
  ];
  let bad = 0;
  for (const [label, reg, expected] of cases) {
    const n = analyzeCrownJewels(reg, exists).problems.length;
    const ok = n === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${n} 件 (期待 ${expected})`);
  }
  if (bad) { console.error(`❌ self-test 不一致 ${bad} 件`); return 1; }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const root = path.join(__dirname, '..');
  const reg = JSON.parse(fs.readFileSync(path.join(root, 'security', 'crown-jewels.json'), 'utf8'));
  const r = analyzeCrownJewels(reg, realExists(root));
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else console.log(renderCrownJewels(r));
  return r.problems.length === 0 ? 0 : 1;
}

if (require.main === module) process.exit(main());
module.exports = { analyzeCrownJewels, renderCrownJewels, realExists, dismissalIn, KINDS, MIN_DISTINCT_ENFORCERS, PROBABILITY_DISMISSAL };

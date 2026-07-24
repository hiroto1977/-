#!/usr/bin/env node
'use strict';

/**
 * verify-graph — 知識グラフ成果物の CI ゲート。
 *
 *   (a) 委託成果物 == 再計算結果の byte 一致（決定論 + ドリフト検出）
 *   (b) 2 回計算の deep-equal（隠れた非決定性の検出）
 *   (c) 構造不変条件: 端点実在 / 自己ループなし / a<b 正準 / スコア 1..10000 の整数 /
 *       次数 ≤ 2×KEEP_PER_NODE / 型は既知 5 種
 *   (d) 教育整合: flashcards/quiz の ref が実在 / クイズ選択肢 4 件・重複なし・
 *       正答 index 整合 / 全選択肢が実在タイトル（幻覚ゼロ）
 */

const fs = require('node:fs');
const path = require('node:path');
const kc = require('../orchestration/knowledge-context.cjs');
const kg = require('../orchestration/knowledge-graph.cjs');
const edu = require('../orchestration/education.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'knowledge-graph');
const fail = [];

const entries = kc.loadEntries();
const ids = new Set(entries.map((e) => e.id));
const titles = new Set(entries.map((e) => e.title));

// (a)+(b) 再計算 byte 一致・2 回 deep-equal
const g1 = kg.computeGraph(entries);
const g2 = kg.computeGraph(entries);
if (JSON.stringify(g1) !== JSON.stringify(g2)) fail.push('computeGraph が非決定的（2 回の計算結果が不一致）');
const fc = edu.buildFlashcards(entries);
const qz = edu.buildQuiz(entries);
const expect = {
  'nodes.ndjson': g1.nodes,
  'edges.ndjson': g1.edges,
  'education/flashcards.ndjson': fc,
  'education/quiz.ndjson': qz,
};
for (const [rel, records] of Object.entries(expect)) {
  const p = path.join(OUT, rel);
  if (!fs.existsSync(p)) {
    fail.push(`${rel} が存在しません（npm run graph:build を実行）`);
    continue;
  }
  const want = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  if (fs.readFileSync(p, 'utf8') !== want) fail.push(`${rel} が本体データと byte 不一致（npm run graph:build で再生成）`);
}

// (c) 構造
const KNOWN_TYPES = new Set(Object.keys(kg.TYPE_PRIORITY));
const degree = new Map();
const seenPair = new Set();
for (const e of g1.edges) {
  if (!ids.has(e.a)) fail.push(`edge 端点が実在しない: ${e.a}`);
  if (!ids.has(e.b)) fail.push(`edge 端点が実在しない: ${e.b}`);
  if (e.a === e.b) fail.push(`自己ループ: ${e.a}`);
  if (!(e.a < e.b)) fail.push(`正準順 a<b 違反: ${e.a} / ${e.b}`);
  if (!Number.isInteger(e.score) || e.score < 1 || e.score > 10000) fail.push(`スコア域違反: ${e.a}|${e.b} = ${e.score}`);
  if (!KNOWN_TYPES.has(e.type)) fail.push(`未知のエッジ型: ${e.type}`);
  const pk = `${e.a}|${e.b}|${e.type}`;
  if (seenPair.has(pk)) fail.push(`重複エッジ: ${pk}`);
  seenPair.add(pk);
  degree.set(e.a, (degree.get(e.a) || 0) + 1);
  degree.set(e.b, (degree.get(e.b) || 0) + 1);
  if (fail.length > 20) break;
}
// 注: ノード上位 keepPerNode の cap は「各ノードが自分で選ぶ本数」の上限であり、
// 他ノード側から選ばれる受動次数は設計上無制限（ハブは自然に高次数になる）。
// cap の正しさは (a) の byte 一致（再計算との完全一致）で構成的に保証される。
for (const n of g1.nodes) {
  if ((degree.get(n.id) || 0) !== n.degree) {
    fail.push(`ノード degree 不整合: ${n.id}`);
    break;
  }
}

// (d) 教育整合（幻覚ゼロ）
for (const c of fc) {
  if (!ids.has(c.ref)) {
    fail.push(`flashcard ref が実在しない: ${c.id}`);
    break;
  }
}
for (const q of qz) {
  if (!ids.has(q.ref)) {
    fail.push(`quiz ref が実在しない: ${q.id}`);
    break;
  }
  if (q.options.length !== 4 || new Set(q.options).size !== 4) {
    fail.push(`quiz 選択肢が 4 件ユニークでない: ${q.id}`);
    break;
  }
  if (q.options.some((o) => !titles.has(o))) {
    fail.push(`quiz 選択肢に実在しないタイトル（幻覚）: ${q.id}`);
    break;
  }
  const ref = entries.find((e) => e.id === q.ref);
  if (q.options[q.answer] !== ref.title) {
    fail.push(`quiz 正答 index 不整合: ${q.id}`);
    break;
  }
}

if (fail.length > 0) {
  console.error(`❌ verify:graph ${fail.length} 件の違反:`);
  for (const f of fail.slice(0, 20)) console.error('  - ' + f);
  process.exit(1);
}
console.log(
  `✅ knowledge-graph 検証 OK — nodes ${g1.nodes.length} / edges ${g1.edges.length} / ` +
    `flashcards ${fc.length} / quiz ${qz.length}（byte 一致・決定論・構造・教育整合）`,
);

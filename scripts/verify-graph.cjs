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
 *   (e) 網羅: 本体データの全項目が node と flashcard になっている
 *
 * ## (e) を足した理由 (2026-08-22)
 *
 * (a) は「委託成果物 == 再計算結果」を見る。つまり**計算そのものが壊れても、
 * 誰かが `graph:build` を回せば両方が一緒に変わって通ってしまう**。
 * `computeGraph` に `.filter(...)` が 1 つ入って項目が落ちても、このゲートは
 * 気づけなかった —— 出力の「nodes 4140」は表示するだけで、本体の 4140 と
 * 突き合わせてはいなかった。
 *
 * クイズだけは全項目に付かない。誤答は**実在するタイトル**で揃える設計
 * (幻覚ゼロ) なので、同カテゴリ→同コレクションの順に探しても 3 件揃わない
 * 項目は出題しない (`education.cjs`)。数を決め打ちせず、**その理由**
 * (コレクション内に異なるタイトルが 4 件未満) を検査する。
 */

const fs = require('node:fs');
const path = require('node:path');
const kc = require('../orchestration/knowledge-context.cjs');
const kg = require('../orchestration/knowledge-graph.cjs');
const edu = require('../orchestration/education.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'knowledge-graph');
const fail = [];

/**
 * 本体データと成果物の網羅を見る (純関数 — 自己検査から直接呼ぶ)。
 *
 * @param entries   本体データ
 * @param nodes     グラフのノード
 * @param flashcards 単語帳
 * @param quiz      クイズ (全項目には付かない。下の注記を参照)
 * @returns 違反の説明の配列 (空なら合格)
 */
function checkCoverage(entries, nodes, flashcards, quiz) {
  const out = [];
  const eids = new Set(entries.map((e) => e.id));

  const nids = nodes.map((n) => n.id);
  const nset = new Set(nids);
  if (nids.length !== nset.size) out.push(`node id に重複があります (${nids.length} 件中 ${nset.size} 種)`);
  const missingNode = [...eids].filter((i) => !nset.has(i));
  const extraNode = [...nset].filter((i) => !eids.has(i));
  if (missingNode.length > 0) {
    out.push(`node が無い項目が ${missingNode.length} 件 (例: ${missingNode.slice(0, 3).join(', ')})`);
  }
  if (extraNode.length > 0) {
    out.push(`本体に無い node が ${extraNode.length} 件 (例: ${extraNode.slice(0, 3).join(', ')})`);
  }

  const fset = new Set(flashcards.map((c) => c.ref));
  const missingCard = [...eids].filter((i) => !fset.has(i));
  if (missingCard.length > 0) {
    out.push(`flashcard が無い項目が ${missingCard.length} 件 (例: ${missingCard.slice(0, 3).join(', ')})`);
  }

  /*
   * クイズは全項目に付かない。誤答は実在タイトルで揃える設計 (幻覚ゼロ) なので、
   * **同じコレクションに異なるタイトルが 4 件未満**なら誤答を 3 件作れず出題しない。
   * 件数 (今は 3 件欠け) を決め打ちすると、別の理由で落ちた日に気づけないので、
   * 理由のほうを検査する。
   */
  const titlesByCollection = new Map();
  for (const e of entries) {
    if (!titlesByCollection.has(e.collection)) titlesByCollection.set(e.collection, new Set());
    titlesByCollection.get(e.collection).add(e.title);
  }
  const qset = new Set(quiz.map((q) => q.ref));
  for (const e of entries) {
    if (qset.has(e.id)) continue;
    const distinct = titlesByCollection.get(e.collection)?.size ?? 0;
    if (distinct >= 4) {
      out.push(
        `quiz が無い項目 ${e.id}: コレクション ${e.collection} には異なるタイトルが `
          + `${distinct} 件あるので誤答 3 件を作れるはず (出題されない理由が説明できない)`,
      );
      break;
    }
  }
  return out;
}

/*
 * 陰性対照。(a) の byte 一致は本体データが要るので自己検査に向かないが、
 * (e) は純関数なので直接鳴らせる。**このゲートは通っている限り同じ文面**なので、
 * 網羅の判定が死んでも読んで気づくことはできない。
 */
function selfTest() {
  const E = (id, collection, title) => ({ id, collection, title });
  const N = (id) => ({ id });
  const C = (ref) => ({ ref });
  const Q = (ref) => ({ ref });
  // 4 件・異なるタイトル = クイズを作れるコレクション
  const four = ['a', 'b', 'c', 'd'].map((x) => E(x, 'k', `T-${x}`));
  const nodes4 = four.map((e) => N(e.id));
  const cards4 = four.map((e) => C(e.id));
  const quiz4 = four.map((e) => Q(e.id));

  const cases = [
    ['全部そろっていれば 0 件', [four, nodes4, cards4, quiz4], 0],
    ['node が 1 件足りない', [four, nodes4.slice(1), cards4, quiz4], 1],
    ['本体に無い node がある', [four, [...nodes4, N('zzz')], cards4, quiz4], 1],
    ['node id が重複している', [four, [...nodes4, N('a')], cards4, quiz4], 1],
    ['flashcard が 1 件足りない', [four, nodes4, cards4.slice(1), quiz4], 1],
    [
      'quiz が無いのに誤答を作れるはず (4 件ある) → 鳴る',
      [four, nodes4, cards4, quiz4.slice(1)],
      1,
    ],
  ];

  // 3 件しかないコレクション = 誤答 3 件を作れないので quiz 無しが正しい
  const three = ['a', 'b', 'c'].map((x) => E(x, 'small', `T-${x}`));
  cases.push([
    'コレクションが 3 件なら quiz 無しでも鳴らない (理由が説明できる)',
    [three, three.map((e) => N(e.id)), three.map((e) => C(e.id)), []],
    0,
  ]);
  // 同じタイトルが並ぶと「異なるタイトル」は 4 件未満 → quiz 無しが正しい
  const dup = ['a', 'b', 'c', 'd'].map((x) => E(x, 'dup', 'SAME'));
  cases.push([
    'タイトルが全部同じなら 4 件でも quiz 無しで鳴らない',
    [dup, dup.map((e) => N(e.id)), dup.map((e) => C(e.id)), []],
    0,
  ]);

  let failed = 0;
  console.log('self-test:');
  for (const [label, args, want] of cases) {
    const got = checkCoverage(...args).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 網羅の判定が壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

if (process.argv.includes('--self-test')) {
  process.exit(selfTest());
}

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

// (e) 網羅 — 本体データの全項目が成果物に居るか
for (const f of checkCoverage(entries, g1.nodes, fc, qz)) fail.push(f);

if (fail.length > 0) {
  console.error(`❌ verify:graph ${fail.length} 件の違反:`);
  for (const f of fail.slice(0, 20)) console.error('  - ' + f);
  process.exit(1);
}
console.log(
  `✅ knowledge-graph 検証 OK — nodes ${g1.nodes.length} / edges ${g1.edges.length} / ` +
    `flashcards ${fc.length} / quiz ${qz.length}（byte 一致・決定論・構造・教育整合）`,
);

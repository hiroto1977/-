#!/usr/bin/env node
'use strict';

/**
 * build-knowledge-graph — 知識グラフ + 教育素材の機械成果物を生成する。
 *
 *   node scripts/build-knowledge-graph.cjs           # knowledge-graph/ へ書き出し
 *   node scripts/build-knowledge-graph.cjs --check   # 生成せず既存成果物と byte 比較（ドリフト検出）
 *
 * 成果物（すべて NDJSON・1 行 1 レコード・主キー昇順・決定論）:
 *   knowledge-graph/nodes.ndjson                4,200+ ノード
 *   knowledge-graph/edges.ndjson                無向エッジ（a<b 正準・型/スコア付き）
 *   knowledge-graph/education/flashcards.ndjson フラッシュカード
 *   knowledge-graph/education/quiz.ndjson       4 択クイズ（誤答も実在タイトルのみ）
 *
 * renderer からは import しない（vite 依存グラフ外 = standalone.html を肥大化させない）。
 */

const fs = require('node:fs');
const path = require('node:path');
const safeWrite = require('./safe-vault-write.cjs');
const kc = require('../orchestration/knowledge-context.cjs');
const kg = require('../orchestration/knowledge-graph.cjs');
const edu = require('../orchestration/education.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'knowledge-graph');

function ndjson(records) {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

function buildAll() {
  const entries = kc.loadEntries();
  const { nodes, edges, stats } = kg.computeGraph(entries);
  const flashcards = edu.buildFlashcards(entries);
  const quiz = edu.buildQuiz(entries);
  return {
    files: {
      'nodes.ndjson': ndjson(nodes),
      'edges.ndjson': ndjson(edges),
      'education/flashcards.ndjson': ndjson(flashcards),
      'education/quiz.ndjson': ndjson(quiz),
    },
    stats: { ...stats, flashcards: flashcards.length, quiz: quiz.length },
  };
}

function main() {
  const check = process.argv.includes('--check');
  const { files, stats } = buildAll();

  if (check) {
    const diffs = [];
    for (const [rel, content] of Object.entries(files)) {
      const p = path.join(OUT, rel);
      if (!fs.existsSync(p)) diffs.push(`${rel}: 存在しません`);
      else if (fs.readFileSync(p, 'utf8') !== content) diffs.push(`${rel}: 内容が本体データと不一致`);
    }
    if (diffs.length > 0) {
      console.error('❌ knowledge-graph が本体データとずれています。`npm run graph:build` で再生成してください:');
      for (const d of diffs) console.error('  - ' + d);
      process.exit(1);
    }
    console.log(`✅ knowledge-graph は本体データと同期しています（nodes ${stats.nodes} / edges ${stats.edges} / cards ${stats.flashcards} / quiz ${stats.quiz}）。`);
    return;
  }

  fs.mkdirSync(path.join(OUT, 'education'), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    safeWrite.writeFilesInto(OUT, { [rel]: content });
  }
  console.log(
    `✅ knowledge-graph 生成: nodes ${stats.nodes} / edges ${stats.edges}（` +
      Object.entries(stats.byType).map(([t, c]) => `${t} ${c}`).join(' / ') +
      `）/ flashcards ${stats.flashcards} / quiz ${stats.quiz} / 候補ペア ${stats.candidates}`,
  );
}

main();

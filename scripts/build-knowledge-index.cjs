#!/usr/bin/env node
'use strict';

/**
 * 並列ナレッジ・インデクサ — 確証済み知識を「並列処理でナレッジ化」する。
 *
 * リポジトリ内の確証済み (出典つき) 知識コレクション 5 種
 *   学術概念 / 法務・税務・労務 / 補助金・助成金 / 相談窓口 / 経済史
 * を、`worker_threads` でコレクション単位に**並列**でロード・トークナイズし、
 * 転置インデックス (語 → 出現ドキュメント) を構築する。これは実行時に
 * `src/renderer/data/knowledgeIndex.ts` が組み立てる索引と同じモデル
 * (英数語 + CJK バイグラム、タイトル×3 + 本文 のスコア) で、チャットボット
 * (`AssistantPage` / `data/chatbot.ts`) の高速な根拠検索に用いられる。
 *
 * 単一の真実源 (`src/renderer/data/*Knowledge.ts`) からの導出は
 * `orchestration/knowledge-context.cjs` を共有 (ヴォルト/オーケストレーションと統一)。
 *
 * 使い方:
 *   node scripts/build-knowledge-index.cjs            # 人間向けレポート
 *   node scripts/build-knowledge-index.cjs --json      # JSON で統計を出力
 *   node scripts/build-knowledge-index.cjs --write      # 統計を JSON ファイルに保存
 */

const path = require('node:path');
const fs = require('node:fs');
const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require('node:worker_threads');

const KC = require(path.join(__dirname, '..', 'orchestration', 'knowledge-context.cjs'));

const BODY_CAP = 320;

// --- トークナイザ (knowledgeIndex.ts と同じアルゴリズム) ---------------------

function isCjk(ch) {
  return /[぀-ヿ㐀-鿿豈-﫿]/.test(ch);
}

function extractTerms(text) {
  const norm = String(text == null ? '' : text).normalize('NFKC').toLowerCase();
  const terms = new Set();
  for (const m of norm.matchAll(/[a-z0-9][a-z0-9.+_-]{1,}/g)) terms.add(m[0]);
  let run = '';
  const flush = () => {
    if (run.length === 1) {
      terms.add(run);
    } else {
      for (let i = 0; i < run.length - 1; i++) terms.add(run.slice(i, i + 2));
    }
    run = '';
  };
  for (const ch of norm) {
    if (isCjk(ch)) run += ch;
    else flush();
  }
  flush();
  return [...terms];
}

function countOccurrences(haystack, needle) {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    count++;
    from = idx + needle.length;
  }
  return count;
}

function cap(text, n) {
  const s = String(text == null ? '' : text);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/** 正規化ノート → 検索ドキュメント (title / body)。 */
function toDoc(note) {
  const metaText = (note.meta || []).map((m) => `${m.label}: ${m.value}`).join(' ');
  return {
    id: `${note.collection}:${note.id}`,
    title: note.title,
    body: cap(`${note.summary} ${metaText}`.trim(), BODY_CAP),
  };
}

// --- worker: 1 コレクションをロード・索引化 ----------------------------------

function indexCollection(key) {
  const col = KC.COLLECTION_BY_KEY[key];
  if (!col) throw new Error(`unknown collection: ${key}`);
  const mod = KC.loadModuleExports(col.file);
  const raw = mod[col.exportName];
  if (!Array.isArray(raw)) throw new Error(`${col.exportName} is not an array (${col.file})`);

  // 語 → ドキュメント出現数 (このコレクション内のドキュメント頻度) を集計。
  const docFreq = new Map();
  let postingCount = 0;
  raw.forEach((r, i) => {
    const note = col.adapt(r, i);
    note.collection = col.key;
    const doc = toDoc(note);
    const title = doc.title.normalize('NFKC').toLowerCase();
    const body = doc.body.normalize('NFKC').toLowerCase();
    const terms = new Set([...extractTerms(doc.title), ...extractTerms(doc.body)]);
    for (const t of terms) {
      if (countOccurrences(title, t) === 0 && countOccurrences(body, t) === 0) continue;
      docFreq.set(t, (docFreq.get(t) || 0) + 1);
      postingCount++;
    }
  });

  return {
    key,
    label: col.label,
    docCount: raw.length,
    postingCount,
    terms: [...docFreq.keys()],
    // top 15 語 (このコレクションの文書頻度順) — レポート用。
    topTerms: [...docFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
  };
}

if (!isMainThread) {
  try {
    const result = indexCollection(workerData.key);
    parentPort.postMessage({ ok: true, result });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: String((err && err.stack) || err) });
  }
  return;
}

// --- main: 並列にワーカーを起動して集約 -------------------------------------

function runWorker(key) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { key } });
    worker.once('message', (msg) => {
      if (msg.ok) resolve(msg.result);
      else reject(new Error(`worker[${key}] failed: ${msg.error}`));
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`worker[${key}] exited with code ${code}`));
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const doWrite = args.includes('--write');

  const keys = KC.COLLECTIONS.map((c) => c.key);
  const started = Date.now();
  const parts = await Promise.all(keys.map(runWorker));
  const elapsedMs = Date.now() - started;

  // 集約: 全コレクションの語を統合してグローバルな統計を出す。
  const globalTerms = new Set();
  const globalDocFreq = new Map();
  let totalDocs = 0;
  let totalPostings = 0;
  for (const p of parts) {
    totalDocs += p.docCount;
    totalPostings += p.postingCount;
    for (const t of p.terms) globalTerms.add(t);
    for (const [t, f] of p.topTerms) globalDocFreq.set(t, (globalDocFreq.get(t) || 0) + f);
  }

  // 整合チェック: 並列集計の総ドキュメント数 == 直列ロード (knowledge-context) の総数。
  const serialEntries = KC.loadEntries();
  const serialDocs = serialEntries.length;
  const consistent = serialDocs === totalDocs;

  const stats = {
    generatedFrom: 'src/renderer/data/*Knowledge.ts (single source of truth)',
    collections: parts
      .map((p) => ({ key: p.key, label: p.label, docs: p.docCount, postings: p.postingCount, uniqueTerms: p.terms.length }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    totalDocs,
    totalPostings,
    globalUniqueTerms: globalTerms.size,
    avgTermsPerDoc: totalDocs === 0 ? 0 : Math.round((totalPostings / totalDocs) * 10) / 10,
    topTerms: [...globalDocFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t, f]) => ({ term: t, docFreq: f })),
    parallelism: { workers: keys.length, elapsedMs },
    consistencyCheck: { serialDocs, parallelDocs: totalDocs, ok: consistent },
  };

  if (doWrite) {
    const out = path.join(KC.REPO_ROOT, 'src/renderer/data/knowledge-index.stats.json');
    fs.writeFileSync(out, JSON.stringify(stats, null, 2) + '\n');
    console.log(`📝 wrote ${path.relative(KC.REPO_ROOT, out)}`);
  }

  if (asJson) {
    console.log(JSON.stringify(stats, null, 2));
  } else {
    console.log('🧠 並列ナレッジ・インデックス構築');
    console.log(`   workers: ${stats.parallelism.workers}  elapsed: ${stats.parallelism.elapsedMs}ms`);
    console.log('');
    console.log('   コレクション別:');
    for (const c of stats.collections) {
      console.log(`     - ${c.label.padEnd(14)} docs=${String(c.docs).padStart(5)}  postings=${String(c.postings).padStart(7)}  terms=${String(c.uniqueTerms).padStart(6)}`);
    }
    console.log('');
    console.log(`   総ドキュメント数 : ${stats.totalDocs}`);
    console.log(`   総ポスティング数 : ${stats.totalPostings}`);
    console.log(`   グローバル語彙数 : ${stats.globalUniqueTerms}`);
    console.log(`   平均語数/ドキュ  : ${stats.avgTermsPerDoc}`);
    console.log(`   頻出語 (上位)    : ${stats.topTerms.slice(0, 10).map((t) => t.term).join(' ')}`);
    console.log('');
    console.log(`   整合チェック (直列==並列): ${stats.consistencyCheck.ok ? '✅ OK' : '❌ MISMATCH'} (serial=${serialDocs}, parallel=${totalDocs})`);
  }

  if (!consistent) {
    console.error('❌ 並列集計と直列ロードのドキュメント数が一致しません。');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});

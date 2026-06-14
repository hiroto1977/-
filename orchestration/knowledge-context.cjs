/* eslint-disable */
'use strict';

/**
 * 学術知識ベース ⇄ AIオーケストレーション の橋渡し (共有モジュール)。
 *
 * src/renderer/data/academicKnowledge.ts の VERIFIED_CONCEPTS (型注釈付き TS) を
 * 依存ゼロでロードし、orchestration/knowledge-map.json に基づき
 * 「役員ロール → 関連ディシプリン → 検証済み概念ブリーフ」を解決する。
 *
 * 利用側:
 *   - scripts/build-knowledge-vault.cjs   Obsidian ヴォルトの生成
 *   - scripts/orchestrate-context.cjs     役員ロールへの知識ブリーフ出力 (CLI)
 *   - scripts/orchestrate.cjs (dispatch)  ディスパッチ計画への知識注入
 *
 * 設計: VERIFIED_CONCEPTS は純粋なデータ (ロジックなし) なので、型宣言を取り除いた
 * 配列リテラルを Function で評価して取り込む。AST パーサ依存を持たない方針 (他の
 * scripts/*.cjs と同じ) に合わせている。
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const KNOWLEDGE_TS = path.join(REPO_ROOT, 'src/renderer/data/academicKnowledge.ts');
const KNOWLEDGE_MAP = path.join(REPO_ROOT, 'orchestration/knowledge-map.json');
const REGISTRY = path.join(REPO_ROOT, 'orchestration/registry.json');

/** VERIFIED_CONCEPTS を academicKnowledge.ts から取り込む (id 昇順で安定ソート)。 */
function loadConcepts() {
  const raw = fs.readFileSync(KNOWLEDGE_TS, 'utf8');
  const start = raw.indexOf('export const VERIFIED_CONCEPTS');
  if (start === -1) throw new Error('VERIFIED_CONCEPTS の宣言が見つかりません');
  let body = raw.slice(start).replace(/export const VERIFIED_CONCEPTS\s*:\s*VerifiedConcept\[\]\s*=\s*/, '');
  // 配列リテラルは末尾の `];` で閉じる。その後ろは `// Stryker restore all` のみ。
  const end = body.lastIndexOf('];');
  if (end === -1) throw new Error('VERIFIED_CONCEPTS の配列終端が見つかりません');
  body = body.slice(0, end + 1); // `[ ... ]`
  let concepts;
  try {
    // 配列リテラル (オブジェクト + 文字列連結のみ。TS 構文・テンプレートリテラルなし)。
    concepts = new Function(`return ${body};`)();
  } catch (e) {
    throw new Error(`VERIFIED_CONCEPTS の評価に失敗: ${e.message}`);
  }
  if (!Array.isArray(concepts)) throw new Error('VERIFIED_CONCEPTS が配列ではありません');
  return concepts.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function loadKnowledgeMap() {
  return JSON.parse(fs.readFileSync(KNOWLEDGE_MAP, 'utf8'));
}

function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
}

const DISCIPLINES = ['economics', 'management', 'human-science', 'business-law', 'information-sociology'];

/** statement から 1 文目 (。終端) を抜き、上限で丸めた一行要約を返す。 */
function oneLiner(statement, max = 120) {
  const flat = String(statement || '').replace(/\s+/g, '');
  const dot = flat.indexOf('。');
  let s = dot >= 0 ? flat.slice(0, dot + 1) : flat;
  if (s.length > max) s = `${s.slice(0, max - 1)}…`;
  return s;
}

function conceptsForDiscipline(concepts, discipline) {
  return concepts.filter((c) => c.discipline === discipline);
}

/** 役員 id → 担当ディシプリン配列 (knowledge-map.json 由来)。未登録なら空配列。 */
function disciplinesForExecutive(map, execId) {
  const entry = (map.executiveDisciplines || {})[execId];
  return entry ? entry.disciplines.slice() : [];
}

/**
 * 役員ロールへの知識ブリーフを構築する。
 * @returns {{ executive: string, disciplines: Array<{discipline,label,count,concepts:Array<{id,title,oneLiner}>}> }}
 */
function briefForExecutive(execId, opts = {}) {
  const concepts = opts.concepts || loadConcepts();
  const map = opts.map || loadKnowledgeMap();
  const limit = Number.isFinite(opts.limit) ? opts.limit : Infinity;
  const labels = map.disciplineLabels || {};
  const disciplines = disciplinesForExecutive(map, execId).map((d) => {
    const list = conceptsForDiscipline(concepts, d);
    return {
      discipline: d,
      label: labels[d] || d,
      count: list.length,
      concepts: list.slice(0, limit).map((c) => ({ id: c.id, title: c.title, oneLiner: oneLiner(c.statement) })),
    };
  });
  return { executive: execId, disciplines };
}

module.exports = {
  REPO_ROOT,
  DISCIPLINES,
  loadConcepts,
  loadKnowledgeMap,
  loadRegistry,
  oneLiner,
  conceptsForDiscipline,
  disciplinesForExecutive,
  briefForExecutive,
};

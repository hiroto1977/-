#!/usr/bin/env node
/**
 * 確証ゲートの機械検証 — 採録済みナレッジが「確証のとれる情報のみ」を満たすか。
 *
 * 継続的ナレッジ・パイプライン（docs/KNOWLEDGE_PIPELINE_SPEC.md）の中核不変条件を、
 * データ本体に対して強制する：
 *   - 各概念は独立 2 出典以上（ADMISSION_RULE.minSources）
 *   - うち 1 件以上が primary もしくは authoritative（government / academic / reference）
 *
 * 閾値とティア分類は src/renderer/data/knowledgeProvenance.ts をミラーする
 * （プロジェクト規約どおり、スクリプトは AST 解析器に依存せず source を正規表現で読む）。
 *
 * Run:  node scripts/verify-knowledge-provenance.cjs   /   npm run verify:knowledge
 * Exits 1 on any violation.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

// knowledgeProvenance.ts と一致させる閾値。
const MIN_SOURCES = 2;
const MIN_AUTHORITATIVE = 1;
// 権威ある出典 = government(primary) / academic(scholarly) / reference のいずれか。
const AUTHORITATIVE_TYPES = new Set(['government', 'academic', 'reference']);
// 注: reference（百科事典・ハンドブック級）も 1 件で権威要件を満たせる。
//     media（popular）は単体では満たせない。

/** academicKnowledge.ts 形式の 1 ファイルを概念配列へ正規表現でパースする。 */
function parseConcepts(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  // 各エントリは "\n  {\n" で始まる。先頭の型定義チャンクは slice(1) で捨てる。
  const blocks = text.split(/\n {2}\{\n/).slice(1);
  const concepts = [];
  for (const b of blocks) {
    const idMatch = b.match(/id: '([^']+)'/);
    if (!idMatch) continue;
    const types = [...b.matchAll(/type: '([a-z]+)'/g)].map((m) => m[1]);
    concepts.push({ id: idMatch[1], types });
  }
  return concepts;
}

function assess(types) {
  const reasons = [];
  if (types.length < MIN_SOURCES) {
    reasons.push(`出典 ${types.length} 件（${MIN_SOURCES} 件以上が必要）`);
  }
  const authoritative = types.filter((t) => AUTHORITATIVE_TYPES.has(t)).length;
  if (authoritative < MIN_AUTHORITATIVE) {
    reasons.push(`権威ある出典 ${authoritative} 件（${MIN_AUTHORITATIVE} 件以上が必要）`);
  }
  return reasons;
}

function main() {
  const target = path.join(REPO_ROOT, 'src/renderer/data/academicKnowledge.ts');
  const concepts = parseConcepts(target);
  if (concepts.length === 0) {
    console.error('❌ 概念を 1 件もパースできませんでした（パーサの不具合の可能性）。');
    return 1;
  }

  const violations = [];
  for (const c of concepts) {
    const reasons = assess(c.types);
    if (reasons.length > 0) violations.push({ id: c.id, reasons });
  }

  console.log(
    `確証ゲート検証: ${concepts.length} 概念（出典 ${MIN_SOURCES}+・権威 ${MIN_AUTHORITATIVE}+）`,
  );
  if (violations.length === 0) {
    console.log('✅ すべての概念が確証ゲートを満たしています。');
    return 0;
  }
  console.error(`❌ ${violations.length} 件が確証ゲート違反:`);
  for (const v of violations.slice(0, 50)) {
    console.error(`  ${v.id} — ${v.reasons.join(' / ')}`);
  }
  if (violations.length > 50) console.error(`  …ほか ${violations.length - 50} 件`);
  return 1;
}

process.exit(main());

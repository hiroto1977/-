#!/usr/bin/env node
'use strict';

/**
 * AIオーケストレーション — 役員ロールへの知識ブリーフ出力 (CLI)。
 *
 * orchestration/knowledge-map.json と VERIFIED_CONCEPTS から、指定した役員ロール
 * (またはディシプリン) の検証済み概念ブリーフを取り出す。dispatch が計画へ注入する
 * のと同じ内容を、単体でも確認・機械利用できるようにする「仕組み」の実行口。
 *
 * 使い方:
 *   node scripts/orchestrate-context.cjs --role cso [--limit 12] [--json] [--md]
 *   node scripts/orchestrate-context.cjs --discipline economics [--limit 20] [--json]
 *   node scripts/orchestrate-context.cjs                 (役員→ディシプリンの対応一覧)
 */

const kc = require('../orchestration/knowledge-context.cjs');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { out[a.slice(2)] = argv[i + 1]; i += 1; }
      else out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const concepts = kc.loadConcepts();
  const map = kc.loadKnowledgeMap();
  const labels = map.disciplineLabels || {};
  const limit = args.limit ? Number(args.limit) : 12;

  // 役員→ディシプリン対応一覧 (引数なし)。
  if (!args.role && !args.discipline) {
    console.log('AIオーケストレーション 知識マップ（役員 → ディシプリン）:');
    for (const [execId, e] of Object.entries(map.executiveDisciplines || {})) {
      const ds = e.disciplines.map((d) => `${labels[d] || d}(${kc.conceptsForDiscipline(concepts, d).length})`).join(' / ');
      console.log(`  • ${execId}: ${ds}`);
    }
    console.log('\n  詳細: --role <execId> | --discipline <name> [--limit N] [--json]');
    return 0;
  }

  // 単一ディシプリン。
  if (args.discipline) {
    const d = String(args.discipline);
    const list = kc.conceptsForDiscipline(concepts, d).slice(0, limit);
    if (args.json) {
      console.log(JSON.stringify({ discipline: d, label: labels[d] || d, concepts: list.map((c) => ({ id: c.id, title: c.title, oneLiner: kc.oneLiner(c.statement) })) }, null, 2));
      return 0;
    }
    console.log(`📚 ${labels[d] || d}（${d}） — 上位 ${list.length} 件`);
    for (const c of list) console.log(`  • ${c.title} — ${kc.oneLiner(c.statement, 80)}`);
    return 0;
  }

  // 役員ロール。
  const execId = String(args.role);
  if (!(map.executiveDisciplines || {})[execId]) {
    console.error(`❌ 未知の役員ロール "${execId}"（利用可能: ${Object.keys(map.executiveDisciplines || {}).join(', ')}）`);
    return 1;
  }
  const brief = kc.briefForExecutive(execId, { concepts, map, limit });
  if (args.json) { console.log(JSON.stringify(brief, null, 2)); return 0; }
  console.log(`🧭 役員ロール ${execId} への知識ブリーフ`);
  console.log(`   理由: ${(map.executiveDisciplines[execId] || {}).rationale || ''}`);
  for (const d of brief.disciplines) {
    console.log(`\n  【${d.label}】（全${d.count}件）`);
    for (const c of d.concepts) console.log(`   • ${c.title} — ${c.oneLiner}`);
    if (d.count > d.concepts.length) console.log(`   …ほか ${d.count - d.concepts.length} 件（--limit で増やせます）`);
  }
  return 0;
}

process.exit(main());

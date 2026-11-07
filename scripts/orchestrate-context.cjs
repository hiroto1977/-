#!/usr/bin/env node
'use strict';

/**
 * AIオーケストレーション — 役員ロールへの確証済み知識ブリーフ出力 (CLI)。
 *
 * orchestration/knowledge-map.json と全コレクション（学術概念/法務税務労務/補助金/
 * 相談窓口/経済史）から、指定した役員ロール（または コレクション）の知識ブリーフを
 * 取り出す。dispatch が計画へ注入するのと同じ内容を単体でも確認・機械利用できる。
 *
 * 使い方:
 *   node scripts/orchestrate-context.cjs --role cso [--limit 10] [--json]
 *   node scripts/orchestrate-context.cjs --collection compliance [--category tax] [--limit 20] [--json]
 *   node scripts/orchestrate-context.cjs                 (役員→知識コレクションの対応一覧)
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
  const entries = kc.loadEntries();
  const map = kc.loadKnowledgeMap();
  const limit = args.limit ? Number(args.limit) : 10;

  // コレクション抽出。
  if (args.collection) {
    const key = String(args.collection);
    let list = entries.filter((e) => e.collection === key);
    if (args.category) list = list.filter((e) => e.category === String(args.category));
    list = list.slice(0, limit);
    if (args.json) { console.log(JSON.stringify(list.map((e) => ({ id: e.id, title: e.title, category: e.category, oneLiner: kc.oneLiner(e.summary) })), null, 2)); return 0; }
    console.log(`📚 ${key}${args.category ? '/' + args.category : ''} — 上位 ${list.length} 件`);
    for (const e of list) console.log(`  • [${e.categoryLabel}] ${e.title} — ${kc.oneLiner(e.summary, 70)}`);
    return 0;
  }

  // 役員→知識コレクション一覧。
  if (!args.role) {
    console.log('AIオーケストレーション 知識マップ（役員 → コレクション/区分）:');
    for (const [execId, spec] of Object.entries(map.executiveKnowledge || {})) {
      const parts = [];
      for (const [k, v] of Object.entries(spec)) {
        if (k.startsWith('_')) continue;
        parts.push(`${k}:${v === '*' ? '全' : (Array.isArray(v) ? v.join('|') : v)}`);
      }
      console.log(`  • ${execId}: ${parts.join(' / ')}`);
    }
    console.log('\n  詳細: --role <execId> | --collection <key> [--category <cat>] [--limit N] [--json]');
    return 0;
  }

  // 役員ロールのブリーフ。
  const execId = String(args.role);
  if (!(map.executiveKnowledge || {})[execId]) {
    console.error(`❌ 未知の役員ロール "${execId}"（利用可能: ${Object.keys(map.executiveKnowledge || {}).join(', ')}）`);
    return 1;
  }
  const brief = kc.briefForExecutive(execId, { entries, map, limit });
  if (args.json) { console.log(JSON.stringify(brief, null, 2)); return 0; }
  const rationale = (map.executiveKnowledge[execId] || {})._rationale || '';
  console.log(`🧭 役員ロール ${execId} への知識ブリーフ — ${rationale}`);
  for (const g of brief.groups) {
    console.log(`\n  【${g.collectionLabel} / ${g.categoryLabel}】（全${g.count}件）`);
    for (const it of g.items) console.log(`   • ${it.title} — ${it.oneLiner}`);
    if (g.count > g.items.length) console.log(`   …ほか ${g.count - g.items.length} 件（--limit で増やせます）`);
  }
  return 0;
}

process.exit(main());

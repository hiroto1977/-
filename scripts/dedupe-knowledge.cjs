#!/usr/bin/env node
'use strict';

/**
 * 確証済み知識データから、同一 id の重複エントリ（同一項目が別タイトルで二重・三重
 * 登録されたもの）を取り除く汎用ツール。タイトル一致による重複排除をすり抜けて混入
 * した「同一 id・別タイトル」の重複を、id 単位で 1 件に統合する。
 *
 * 対象（フラット配列・各エントリに id を持つもの）:
 *   src/renderer/data/academicKnowledge.ts   VERIFIED_CONCEPTS
 *   src/renderer/data/complianceKnowledge.ts VERIFIED_COMPLIANCE （id は value.id）
 *   src/renderer/data/subsidyKnowledge.ts    VERIFIED_SUBSIDIES
 *
 * 各 id について最も情報量の多い 1 件（エントリ文字列が最長 → 出典数が最多 → 後勝ち）
 * を残し、残りを削除する。残すエントリは元テキストをそのまま保持し、ファイル全体の
 * 整形・他エントリには手を加えない。
 *
 * 使い方:
 *   node scripts/dedupe-knowledge.cjs            ドライラン（要約のみ）
 *   node scripts/dedupe-knowledge.cjs --apply    実際に書き込む
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  { file: 'src/renderer/data/academicKnowledge.ts', name: 'VERIFIED_CONCEPTS' },
  { file: 'src/renderer/data/complianceKnowledge.ts', name: 'VERIFIED_COMPLIANCE' },
  { file: 'src/renderer/data/subsidyKnowledge.ts', name: 'VERIFIED_SUBSIDIES' },
];

function dedupeFile(rel, name, apply) {
  const file = path.join(REPO_ROOT, rel);
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split('\n');
  const startIdx = lines.findIndex((l) => new RegExp(`export const ${name}\\b.*=\\s*\\[$`).test(l));
  if (startIdx < 0) throw new Error(`${name} の配列開始行が見つかりません (${rel})`);
  let endIdx = -1;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (lines[i] === '];') { endIdx = i; break; }
  }
  if (endIdx < 0) throw new Error(`${name} の配列終端 "];" が見つかりません (${rel})`);

  const entries = [];
  let cur = null;
  for (let i = startIdx + 1; i < endIdx; i += 1) {
    const l = lines[i];
    if (l === '  {') { cur = { lines: [l], id: null }; continue; }
    if (cur) {
      cur.lines.push(l);
      if (cur.id === null) {
        const m = /^\s*id: '([^']+)',$/.exec(l); // ブロック内の最初の id 行（compliance は value.id）
        if (m) cur.id = m[1];
      }
      if (l === '  },') {
        cur.text = cur.lines.join('\n');
        cur.length = cur.text.length;
        cur.sources = (cur.text.match(/type: '/g) || []).length;
        cur.idx = entries.length;
        entries.push(cur);
        cur = null;
      }
    }
  }
  if (entries.some((e) => !e.id)) throw new Error(`${name}: id を取得できないエントリがあります（境界解析の不整合）`);

  const byId = new Map();
  for (const e of entries) {
    if (!byId.has(e.id)) byId.set(e.id, []);
    byId.get(e.id).push(e);
  }
  const keep = new Set();
  let droppedCount = 0;
  for (const [, arr] of byId) {
    if (arr.length === 1) { keep.add(arr[0].idx); continue; }
    let best = arr[0];
    for (const e of arr) {
      if (e.length > best.length) best = e;
      else if (e.length === best.length && e.sources > best.sources) best = e;
      else if (e.length === best.length && e.sources === best.sources && e.idx > best.idx) best = e;
    }
    keep.add(best.idx);
    droppedCount += arr.length - 1;
  }
  const kept = entries.filter((e) => keep.has(e.idx));
  const dupIds = [...byId.entries()].filter(([, a]) => a.length > 1).map(([id, a]) => `${id}(x${a.length})`);

  console.log(`[${name}] 総 ${entries.length} / ユニーク ${byId.size} / 削除 ${droppedCount} / 残存 ${kept.length}`);
  if (dupIds.length) console.log(`   重複 id: ${dupIds.join(', ')}`);

  if (apply && droppedCount > 0) {
    const prefix = lines.slice(0, startIdx + 1).join('\n');
    const suffix = lines.slice(endIdx).join('\n');
    fs.writeFileSync(file, `${prefix}\n${kept.map((e) => e.text).join('\n')}\n${suffix}`);
  }
  return droppedCount;
}

function main() {
  const apply = process.argv.includes('--apply');
  let total = 0;
  for (const t of TARGETS) total += dedupeFile(t.file, t.name, apply);
  if (!apply) {
    console.log(`\n合計削除候補: ${total} 件。ドライラン（書き込みなし）。実行は --apply。`);
  } else {
    console.log(`\n✅ 合計 ${total} 件の重複を削除しました。npm run typecheck && npm test で確認してください。`);
  }
  return 0;
}

process.exit(main());

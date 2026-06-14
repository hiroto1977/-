#!/usr/bin/env node
/* eslint-disable */
'use strict';

/**
 * src/renderer/data/academicKnowledge.ts の VERIFIED_CONCEPTS から、
 * 同一 id の重複エントリ（同一概念が別タイトルで二重・三重登録されたもの）を取り除く。
 *
 * タイトル一致による重複排除をすり抜けて混入した「同一 id・別タイトル」の重複を、
 * id 単位で 1 件に統合する。各 id について、最も情報量の多い 1 件（エントリ文字列が
 * 最長 → 出典数が最多 → 後勝ち）を残し、残りを削除する。残すエントリは元テキストを
 * バイト単位でそのまま保持し、ファイル全体の整形・他エントリには一切手を加えない。
 *
 * 使い方:
 *   node scripts/dedupe-academic-knowledge.cjs            ドライラン（要約のみ）
 *   node scripts/dedupe-academic-knowledge.cjs --apply    実際に書き込む
 */

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.resolve(__dirname, '..', 'src/renderer/data/academicKnowledge.ts');

function main() {
  const apply = process.argv.includes('--apply');
  const raw = fs.readFileSync(FILE, 'utf8');
  const lines = raw.split('\n');

  const startIdx = lines.findIndex((l) => /export const VERIFIED_CONCEPTS.*=\s*\[$/.test(l));
  if (startIdx < 0) throw new Error('VERIFIED_CONCEPTS の配列開始行が見つかりません');
  let endIdx = -1;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (lines[i] === '];') { endIdx = i; break; }
  }
  if (endIdx < 0) throw new Error('配列終端 "];" が見つかりません');

  // エントリを `  {` ... `  },` の境界で切り出す（2スペース字下げが境界、ネストは深字下げ）。
  const entries = [];
  let cur = null;
  for (let i = startIdx + 1; i < endIdx; i += 1) {
    const l = lines[i];
    if (l === '  {') { cur = { lines: [l], id: null }; continue; }
    if (cur) {
      cur.lines.push(l);
      const m = /^    id: '([^']+)',$/.exec(l);
      if (m) cur.id = m[1];
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

  if (entries.some((e) => !e.id)) throw new Error('id を取得できないエントリがあります（境界解析の不整合）');

  const byId = new Map();
  for (const e of entries) {
    if (!byId.has(e.id)) byId.set(e.id, []);
    byId.get(e.id).push(e);
  }

  const keep = new Set();
  const dropped = [];
  for (const [id, arr] of byId) {
    if (arr.length === 1) { keep.add(arr[0].idx); continue; }
    let best = arr[0];
    for (const e of arr) {
      if (e.length > best.length) best = e;
      else if (e.length === best.length && e.sources > best.sources) best = e;
      else if (e.length === best.length && e.sources === best.sources && e.idx > best.idx) best = e;
    }
    keep.add(best.idx);
    for (const e of arr) if (e.idx !== best.idx) dropped.push({ id, idx: e.idx });
  }

  const kept = entries.filter((e) => keep.has(e.idx));

  console.log(`総エントリ: ${entries.length} / ユニーク id: ${byId.size} / 削除対象: ${dropped.length} / 残存: ${kept.length}`);
  const dupIds = [...byId.entries()].filter(([, a]) => a.length > 1).map(([id, a]) => `${id}(x${a.length})`);
  if (dupIds.length) console.log(`重複 id (${dupIds.length}): ${dupIds.join(', ')}`);

  if (!apply) {
    console.log('\nドライラン（書き込みなし）。実行するには --apply を付与してください。');
    return 0;
  }

  const prefix = lines.slice(0, startIdx + 1).join('\n');
  const suffix = lines.slice(endIdx).join('\n');
  const out = `${prefix}\n${kept.map((e) => e.text).join('\n')}\n${suffix}`;
  fs.writeFileSync(FILE, out);
  console.log(`\n✅ ${dropped.length} 件の重複エントリを削除しました（${entries.length} → ${kept.length}）。`);
  console.log('   → npm run typecheck && npm test で健全性を確認してください。');
  return 0;
}

process.exit(main());

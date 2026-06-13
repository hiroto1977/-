#!/usr/bin/env node
/*
 * 経済史年表（ECONOMIC_HISTORY）を SVG タイムライン・インフォグラフィックに変換する。
 *
 * src/renderer/data/economicHistoryKnowledge.ts を読み、各年の
 *   - year / era（元号）
 *   - keyEvents の先頭1件（ハイライト）
 *   - risingSectors / decliningSectors の件数
 * を抽出して、横軸=年のタイムラインに、上向き=拡大産業数、下向き=縮小産業数の
 * 棒を描いた SVG を docs/economic-history-timeline.svg に出力する。
 *
 * データはほぼ定性的なため「件数」は厳密な経済指標ではなく、各年に出典で裏付けられた
 * 拡大/縮小傾向の数を可視化したもの（凡例・注記に明記）。年が追加されれば再生成で伸びる。
 *
 * 使い方: node scripts/gen-econ-history-chart.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'renderer', 'data', 'economicHistoryKnowledge.ts');
const OUT = path.join(__dirname, '..', 'docs', 'economic-history-timeline.svg');

const text = fs.readFileSync(SRC, 'utf8');

// 各エントリ（{ year: ... } ... }）を粗く分割して解析する。
const entries = [];
const yearRe = /year:\s*(\d{4})\s*,\s*\n\s*era:\s*'([^']*)'/g;
let m;
const starts = [];
while ((m = yearRe.exec(text)) !== null) {
  starts.push({ index: m.index, year: Number(m[1]), era: m[2] });
}
for (let i = 0; i < starts.length; i++) {
  const segStart = starts[i].index;
  const segEnd = i + 1 < starts.length ? starts[i + 1].index : text.length;
  const seg = text.slice(segStart, segEnd);

  const firstEventMatch = seg.match(/keyEvents:\s*\[\s*\n\s*'([^']*)'/);
  const firstEvent = firstEventMatch ? firstEventMatch[1] : '';

  const countItems = (key) => {
    const block = seg.match(new RegExp(key + ':\\s*\\[([\\s\\S]*?)\\]'));
    if (!block) return 0;
    const inner = block[1];
    const items = inner.match(/'(?:[^'\\]|\\.)*'/g);
    return items ? items.length : 0;
  };

  entries.push({
    year: starts[i].year,
    era: starts[i].era,
    firstEvent,
    rising: countItems('risingSectors'),
    declining: countItems('decliningSectors'),
  });
}

entries.sort((a, b) => a.year - b.year);

if (entries.length === 0) {
  console.error('経済史データが見つかりませんでした。');
  process.exit(1);
}

// ---- レイアウト ----
const colW = 120;
const marginL = 70;
const marginR = 40;
const axisY = 360;
const barUnit = 26; // 1件あたりの棒の高さ(px)
const maxBars = Math.max(1, ...entries.map((e) => Math.max(e.rising, e.declining)));
const width = marginL + marginR + entries.length * colW;
const height = 620;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const parts = [];
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="'Hiragino Sans','Noto Sans JP',sans-serif">`,
);
parts.push(`<rect width="${width}" height="${height}" fill="#0f172a"/>`);
parts.push(
  `<text x="${marginL}" y="40" fill="#f1f5f9" font-size="24" font-weight="700">世界経済・日本経済 年表（1940〜） — 出典確証済み</text>`,
);
parts.push(
  `<text x="${marginL}" y="66" fill="#94a3b8" font-size="13">上向き=拡大産業の傾向数 / 下向き=縮小産業の傾向数（出典で裏付く定性傾向の件数。厳密な経済指標ではない）</text>`,
);

// 0 軸
parts.push(`<line x1="${marginL - 10}" y1="${axisY}" x2="${width - marginR}" y2="${axisY}" stroke="#475569" stroke-width="1.5"/>`);

// 目盛(件数)
for (let k = 1; k <= maxBars; k++) {
  const yUp = axisY - k * barUnit;
  const yDn = axisY + k * barUnit;
  parts.push(`<line x1="${marginL - 10}" y1="${yUp}" x2="${width - marginR}" y2="${yUp}" stroke="#1e293b" stroke-width="1"/>`);
  parts.push(`<line x1="${marginL - 10}" y1="${yDn}" x2="${width - marginR}" y2="${yDn}" stroke="#1e293b" stroke-width="1"/>`);
  parts.push(`<text x="${marginL - 16}" y="${yUp + 4}" fill="#64748b" font-size="11" text-anchor="end">${k}</text>`);
  parts.push(`<text x="${marginL - 16}" y="${yDn + 4}" fill="#64748b" font-size="11" text-anchor="end">${k}</text>`);
}
parts.push(`<text x="${marginL - 16}" y="${axisY - maxBars * barUnit - 10}" fill="#22c55e" font-size="11" text-anchor="end">拡大</text>`);
parts.push(`<text x="${marginL - 16}" y="${axisY + maxBars * barUnit + 20}" fill="#ef4444" font-size="11" text-anchor="end">縮小</text>`);

entries.forEach((e, i) => {
  const cx = marginL + i * colW + colW / 2;
  // 拡大バー
  if (e.rising > 0) {
    const h = e.rising * barUnit;
    parts.push(`<rect x="${cx - 22}" y="${axisY - h}" width="44" height="${h}" rx="3" fill="#22c55e" opacity="0.85"/>`);
  }
  // 縮小バー
  if (e.declining > 0) {
    const h = e.declining * barUnit;
    parts.push(`<rect x="${cx - 22}" y="${axisY}" width="44" height="${h}" rx="3" fill="#ef4444" opacity="0.85"/>`);
  }
  // 年・元号
  parts.push(`<text x="${cx}" y="${axisY + maxBars * barUnit + 50}" fill="#f1f5f9" font-size="15" font-weight="700" text-anchor="middle">${e.year}</text>`);
  parts.push(`<text x="${cx}" y="${axisY + maxBars * barUnit + 68}" fill="#94a3b8" font-size="11" text-anchor="middle">${esc(e.era)}</text>`);
  // 先頭イベント（縦書き風に折り返さず、回転して表示）
  const ev = esc(truncate(e.firstEvent, 40));
  parts.push(
    `<text x="${cx}" y="${axisY + maxBars * barUnit + 88}" fill="#cbd5e1" font-size="10" text-anchor="middle" transform="rotate(12 ${cx} ${axisY + maxBars * barUnit + 88})">${ev}</text>`,
  );
});

// 凡例
const legendY = height - 24;
parts.push(`<rect x="${marginL}" y="${legendY - 12}" width="14" height="14" rx="2" fill="#22c55e"/>`);
parts.push(`<text x="${marginL + 20}" y="${legendY}" fill="#cbd5e1" font-size="12">拡大傾向の産業数</text>`);
parts.push(`<rect x="${marginL + 160}" y="${legendY - 12}" width="14" height="14" rx="2" fill="#ef4444"/>`);
parts.push(`<text x="${marginL + 180}" y="${legendY}" fill="#cbd5e1" font-size="12">縮小傾向の産業数</text>`);
parts.push(
  `<text x="${width - marginR}" y="${legendY}" fill="#64748b" font-size="11" text-anchor="end">出典: economicHistoryKnowledge.ts（各年 ≥2 出典・うち権威ある出典1件以上）</text>`,
);

parts.push('</svg>');

fs.writeFileSync(OUT, parts.join('\n') + '\n', 'utf8');
console.log(`Wrote ${path.relative(path.join(__dirname, '..'), OUT)} (${entries.length} years: ${entries[0].year}–${entries[entries.length - 1].year})`);

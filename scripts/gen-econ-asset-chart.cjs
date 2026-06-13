#!/usr/bin/env node
/*
 * 資産クラス別 年次系列（株式・不動産・仮想通貨）を SVG 折れ線グラフに変換する。
 *
 * src/renderer/data/economicHistoryKnowledge.ts の ASSET_SERIES を読み、
 *   - DJIA 年末終値（USD）
 *   - 日経平均 年末終値（円）
 *   - 市街地価格指数（全国, 1936/9=100）
 *   - ビットコイン 年末値（USD）
 * を、年を横軸にした折れ線で描く。各系列はスケールが大きく異なるため、各系列ごとに
 * 0〜自系列の最大値で正規化（=100%）して同一パネルに重ねる。null（未照合・その資産が
 * 存在しない年）は線を引かず欠損として扱う（捏造しない）。
 *
 * 出力: docs/economic-history-assets.svg / 使い方: node scripts/gen-econ-asset-chart.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'renderer', 'data', 'economicHistoryKnowledge.ts');
const OUT = path.join(__dirname, '..', 'docs', 'economic-history-assets.svg');

const text = fs.readFileSync(SRC, 'utf8');
const blockMatch = text.match(/export const ASSET_SERIES[^=]*=\s*\{([\s\S]*?)\n\};/);
if (!blockMatch) {
  console.error('ASSET_SERIES が見つかりませんでした。');
  process.exit(1);
}

const rowRe = /(\d{4}):\s*\{([^}]*)\}/g;
const num = (s) => (s.trim() === 'null' ? null : Number(s.trim()));
const rows = [];
let m;
while ((m = rowRe.exec(blockMatch[1])) !== null) {
  const fields = { year: Number(m[1]) };
  m[2].split(',').forEach((kv) => {
    const i = kv.indexOf(':');
    if (i !== -1) fields[kv.slice(0, i).trim()] = num(kv.slice(i + 1));
  });
  rows.push(fields);
}
rows.sort((a, b) => a.year - b.year);
if (rows.length === 0) {
  console.error('ASSET_SERIES の行が解析できませんでした。');
  process.exit(1);
}

const seriesDefs = [
  { key: 'djiaYearEnd', label: 'ダウ平均(米株, 年末USD)', color: '#38bdf8' },
  { key: 'nikkeiYearEnd', label: '日経平均(日本株, 年末円)', color: '#f97316' },
  { key: 'japanUrbanLandIndex', label: '市街地価格指数(不動産, 1936/9=100)', color: '#a3e635' },
  { key: 'bitcoinUsdYearEnd', label: 'ビットコイン(仮想通貨, 年末USD)', color: '#facc15' },
];

const marginL = 60;
const marginR = 30;
const marginT = 90;
const plotH = 360;
const colW = 60;
const x0 = marginL + 20;
const plotW = Math.max(1, (rows.length - 1) * colW);
const width = x0 + plotW + marginR + 20;
const height = marginT + plotH + 60 + seriesDefs.length * 18 + 20;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isNum = (v) => v !== null && v !== undefined && !Number.isNaN(v);
const xFor = (i) => x0 + i * colW;
const yFor = (norm) => marginT + plotH - norm * plotH;

const parts = [];
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="'Hiragino Sans','Noto Sans JP',sans-serif">`,
);
parts.push(`<rect width="${width}" height="${height}" fill="#0f172a"/>`);
parts.push(`<text x="${marginL}" y="36" fill="#f1f5f9" font-size="22" font-weight="700">資産クラス別 年次推移（株式・不動産・仮想通貨）</text>`);
parts.push(
  `<text x="${marginL}" y="60" fill="#94a3b8" font-size="12">各系列を自系列の最大値=100%に正規化して重ね描き。欠損(null=未照合／その年に存在しない資産)は線を引かない。</text>`,
);

parts.push(`<line x1="${x0}" y1="${marginT}" x2="${x0}" y2="${marginT + plotH}" stroke="#475569"/>`);
parts.push(`<line x1="${x0}" y1="${marginT + plotH}" x2="${x0 + plotW}" y2="${marginT + plotH}" stroke="#475569"/>`);
for (let g = 0; g <= 4; g++) {
  const y = yFor(g / 4);
  parts.push(`<line x1="${x0}" y1="${y}" x2="${x0 + plotW}" y2="${y}" stroke="#1e293b"/>`);
  parts.push(`<text x="${x0 - 8}" y="${y + 4}" fill="#64748b" font-size="10" text-anchor="end">${g * 25}%</text>`);
}
rows.forEach((r, i) => {
  if (rows.length <= 16 || i % 2 === 0) {
    parts.push(`<text x="${xFor(i)}" y="${marginT + plotH + 18}" fill="#cbd5e1" font-size="10" text-anchor="middle">${r.year}</text>`);
  }
});

seriesDefs.forEach((sd) => {
  const present = rows.map((r) => r[sd.key]).filter(isNum);
  const max = present.length ? Math.max(...present) : 0;
  if (present.length === 0 || max <= 0) return;
  let d = '';
  rows.forEach((r, i) => {
    const v = r[sd.key];
    if (!isNum(v)) return;
    const prev = i > 0 ? rows[i - 1][sd.key] : null;
    const move = i === 0 || !isNum(prev);
    const x = xFor(i);
    const y = yFor(v / max).toFixed(1);
    d += `${move ? 'M' : 'L'}${x},${y} `;
    parts.push(`<circle cx="${x}" cy="${y}" r="3" fill="${sd.color}"/>`);
  });
  parts.push(`<path d="${d.trim()}" fill="none" stroke="${sd.color}" stroke-width="2"/>`);
});

seriesDefs.forEach((sd, idx) => {
  const vals = rows.map((r) => r[sd.key]).filter(isNum);
  const status =
    vals.length > 0
      ? `データ${vals.length}年（直近 ${vals[vals.length - 1]}）`
      : 'データなし（N/A・未照合またはその年に存在しない資産）';
  const yy = marginT + plotH + 46 + idx * 18;
  parts.push(`<rect x="${marginL}" y="${yy - 10}" width="13" height="13" rx="2" fill="${sd.color}"/>`);
  parts.push(`<text x="${marginL + 18}" y="${yy + 1}" fill="#cbd5e1" font-size="11">${esc(sd.label)} — ${status}</text>`);
});

parts.push(
  `<text x="${width - marginR}" y="${height - 8}" fill="#64748b" font-size="10" text-anchor="end">出典: economicHistoryKnowledge.ts ASSET_SERIES（DJIA=MeasuringWorth/FRED 他・確証値）</text>`,
);
parts.push('</svg>');

fs.writeFileSync(OUT, parts.join('\n') + '\n', 'utf8');
console.log(`Wrote ${path.relative(path.join(__dirname, '..'), OUT)} (${rows.length} years: ${rows[0].year}–${rows[rows.length - 1].year})`);

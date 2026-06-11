#!/usr/bin/env node
'use strict';

/*
 * 危機検知 合議デモのビルド (実エンジン同梱・自己完結 HTML)。
 *
 * AIオーケストレーション・チームの多役合議エンジン (crisisDeliberation.ts) を esbuild で
 * そのままバンドルし、ラベル付きコーパスに対する「AI だけの複数人の会話」(検知役/安全監査役/
 * レビュー役/合議役) と精度指標を自動再生 + 自由入力で観られる単一 HTML を生成する。
 * 応答はモックではなくデプロイ時点の実エンジンの計算。
 *
 * 出力: dist/deliberation-demo.html (pages.yml が _site/ へコピー)
 * 自己検証: 必須マーカー (起動コード・安全見逃し指標・各役名) が無ければ exit 1。
 */

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist/deliberation-demo.html');

const ENTRY = `
import { deliberate, deliberateOne, CRISIS_CORPUS } from './src/renderer/data/crisisDeliberation';

const CATS = [
  { v: 'crisis', ja: '危機(自傷)' },
  { v: 'harm-other', ja: '他害' },
  { v: 'destructive', ja: '破壊衝動' },
  { v: 'other', ja: '通常' },
];

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function caption(text) { $('feed').appendChild(el('div', 'caption', text)); $('feed').scrollTop = $('feed').scrollHeight; }

function renderMetrics(m) {
  const box = el('div', 'metrics');
  const safeOk = m.safetyMisses === 0;
  box.appendChild(metric('正答率', (m.accuracy * 100).toFixed(1) + '%'));
  box.appendChild(metric('安全見逃し', String(m.safetyMisses), safeOk ? 'good' : 'bad'));
  box.appendChild(metric('過検知', String(m.overTriggers)));
  box.appendChild(metric('件数', String(m.total)));
  return box;
}
function metric(label, value, cls) {
  const d = el('div', 'metric' + (cls ? ' ' + cls : ''));
  d.appendChild(el('div', 'metric-v', value));
  d.appendChild(el('div', 'metric-l', label));
  return d;
}

function renderRound(round) {
  const card = el('div', 'round v-' + round.verdict);
  card.appendChild(el('div', 'utter', '「' + round.text + '」'));
  for (const line of round.lines) {
    const row = el('div', 'line');
    row.appendChild(el('span', 'role', line.role));
    row.appendChild(el('span', 'say', line.text));
    card.appendChild(row);
  }
  return card;
}

async function play() {
  $('feed').replaceChildren();
  const report = deliberate(CRISIS_CORPUS);
  $('feed').appendChild(renderMetrics(report.metrics));
  caption('AIオーケストレーション・チームが ' + report.metrics.total + ' 件の発話を合議します（検知役→安全監査役→レビュー役→合議役）');
  for (const round of report.rounds) {
    await sleep(500);
    const card = renderRound(round);
    $('feed').appendChild(card);
    $('feed').scrollTop = $('feed').scrollHeight;
    await sleep(250);
  }
  if (report.edgeCases.length === 0) {
    caption('改善候補（エッジケース）は 0 件。安全見逃しも 0 件です。');
  } else {
    caption('改善候補 ' + report.edgeCases.length + ' 件を記録（PR で語彙/コーパスを強化して再合議＝学習ループ）。');
  }
  caption('— 下の入力で、任意の発話を即席で合議にかけられます —');
}

function judgeFree() {
  const text = $('utext').value.trim();
  if (!text) return;
  const label = $('ulabel').value;
  const round = deliberateOne({ text, label });
  $('feed').appendChild(renderRound(round));
  $('feed').scrollTop = $('feed').scrollHeight;
}

const sel = $('ulabel');
for (const c of CATS) {
  const o = document.createElement('option');
  o.value = c.v; o.textContent = '正解: ' + c.ja;
  sel.appendChild(o);
}
$('replay').addEventListener('click', () => void play());
$('judge').addEventListener('click', judgeFree);
$('utext').addEventListener('keydown', (e) => { if (e.key === 'Enter') judgeFree(); });
void play();
`;

const CSS = `
  :root { --bg:#0e0f13; --panel:#171922; --border:#2a2d3a; --text:#e7e9f0; --mute:#8a93a6; --accent:#5b8def; --danger:#ef4444; --success:#4ade80; --warn:#d97706; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:'Hiragino Sans','Noto Sans JP',system-ui,sans-serif; display:flex; flex-direction:column; height:100vh; height:100dvh; }
  header { padding:12px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  header h1 { font-size:15px; margin:0; }
  header .sub { font-size:11px; color:var(--mute); flex-basis:100%; }
  #feed { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; }
  .caption { align-self:center; font-size:11px; color:var(--mute); background:var(--panel); border:1px solid var(--border); border-radius:999px; padding:4px 14px; max-width:94%; text-align:center; }
  .metrics { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
  .metric { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:8px 16px; text-align:center; min-width:90px; }
  .metric.good { border-color:var(--success); }
  .metric.bad { border-color:var(--danger); }
  .metric-v { font-size:20px; font-weight:700; }
  .metric-l { font-size:10px; color:var(--mute); }
  .round { background:var(--panel); border:1px solid var(--border); border-left:3px solid var(--mute); border-radius:10px; padding:10px 12px; }
  .round.v-correct { border-left-color:var(--success); }
  .round.v-safety-miss { border-left-color:var(--danger); }
  .round.v-over-trigger { border-left-color:var(--warn); }
  .round.v-minor-mismatch { border-left-color:var(--accent); }
  .utter { font-weight:700; font-size:13.5px; margin-bottom:6px; }
  .line { font-size:12.5px; line-height:1.7; display:flex; gap:8px; }
  .role { color:var(--accent); white-space:nowrap; min-width:104px; }
  .say { color:var(--text); }
  footer { padding:10px 12px; border-top:1px solid var(--border); display:flex; gap:8px; align-items:center; }
  footer input[type=text] { flex:1; min-width:0; background:var(--panel); border:1px solid var(--border); border-radius:10px; color:var(--text); padding:10px 12px; font-size:13px; }
  footer select { background:var(--panel); border:1px solid var(--border); border-radius:8px; color:var(--text); padding:8px 4px; font-size:12px; }
  button { background:var(--accent); color:#fff; border:none; border-radius:10px; padding:10px 14px; font-size:13px; cursor:pointer; }
  button.ghost { background:transparent; border:1px solid var(--border); color:var(--text); }
`;

function htmlShell(js) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>危機検知 合議デモ — AIオーケストレーション・チーム</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>🧠 危機検知 合議デモ — AIオーケストレーション・チーム</h1>
  <button id="replay" class="ghost">▶ 再合議</button>
  <span class="sub">検知役/安全監査役/レビュー役/合議役 が実エンジンの判定を合議し、精度を測ります。安全に直結する検知ルールは自動変更せず、改善は人のレビュー(PR)を通します。</span>
</header>
<div id="feed"></div>
<footer>
  <select id="ulabel" title="正解ラベル"></select>
  <input id="utext" type="text" placeholder="発話を入力して合議にかける（例: 全部壊したい）">
  <button id="judge">合議</button>
</footer>
<script>${js}</script>
</body>
</html>
`;
}

async function main() {
  const result = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    format: 'iife',
    charset: 'utf8',
    write: false,
    logLevel: 'silent',
  });
  let js = result.outputFiles[0].text;
  js = js.replace(/<\/script/gi, '<\\/script');
  const html = htmlShell(js);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);

  const must = ['void play()', '安全見逃し', '検知役', '合議役'];
  for (const marker of must) {
    if (!html.includes(marker)) {
      console.error(`build-deliberation-demo: マーカー欠落 "${marker}"`);
      process.exit(1);
    }
  }
  console.log(`Wrote ${OUT} (${(html.length / 1024).toFixed(1)} KB) — 実エンジン同梱・自己検証 OK`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

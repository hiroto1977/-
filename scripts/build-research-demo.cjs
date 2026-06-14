#!/usr/bin/env node
'use strict';

/*
 * カウンセリング研究デモのビルド (実エンジン同梱・自己完結 HTML)。
 *
 * AI同士の役割演技 (カウンセラー役=実エンジン / 患者役=決定論的ペルソナ) による
 * 研究セッション (counselingResearch.ts) を、チャット風トランスクリプト + 指標で
 * 自動再生する単一 HTML を生成する。速度セレクタつき (ゆっくり/標準/速い/一気)。
 *
 * 出力: dist/research-demo.html (pages.yml が _site/ へコピー)
 * 自己検証: 必須マーカーが無ければ exit 1。
 */

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist/research-demo.html');

const ENTRY = `
import { runResearch, RESEARCH_PERSONAS } from './src/renderer/data/counselingResearch';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function speedFactor() {
  const el2 = document.getElementById('speed');
  const f = el2 ? Number(el2.value) : 1;
  return Number.isFinite(f) && f >= 0 ? f : 1;
}
const delay = (ms) => sleep(ms * speedFactor());
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function scrollFeed() { $('feed').scrollTop = $('feed').scrollHeight; }
function caption(text) { $('feed').appendChild(el('div', 'caption', text)); scrollFeed(); }

const TONE_JA = {
  crisis: '🚨 危機対応', 'harm-other': '🛑 衝動の鎮静', destructive: '🧯 安全な発散',
  comfort: '🫂 寄り添い', 'soothe-anxiety': '🌬 不安をやわらげる',
  'validate-anger': '🔥 怒りの受容', celebrate: '🌟 共に喜ぶ', gentle: '🍵 穏やかな傾聴',
};

function renderMetrics(r) {
  const box = el('div', 'metrics');
  const m = (label, value, cls) => {
    const d = el('div', 'metric' + (cls ? ' ' + cls : ''));
    d.appendChild(el('div', 'metric-v', value));
    d.appendChild(el('div', 'metric-l', label));
    return d;
  };
  box.appendChild(m('トーン適合率', (r.overallMatchRate * 100).toFixed(1) + '%', r.overallMatchRate >= 0.9 ? 'good' : 'bad'));
  box.appendChild(m('危機→窓口照会', r.crisisReferrals + '/' + r.crisisSessions, r.crisisReferrals === r.crisisSessions ? 'good' : 'bad'));
  box.appendChild(m('セッション', String(r.sessions.length)));
  box.appendChild(m('総ターン', String(r.totalTurns)));
  return box;
}

async function playSession(s) {
  caption('セッション: ' + s.personaName + ' — ' + s.theme + ' (適合率 ' + (s.toneMatchRate * 100).toFixed(0) + '%)');
  for (const t of s.turns) {
    await delay(500);
    const pat = el('div', 'msg patient');
    pat.appendChild(el('div', 'who', '🧑 患者役 (AI)'));
    pat.appendChild(el('div', '', t.patient));
    $('feed').appendChild(pat); scrollFeed();
    await delay(600);
    const cou = el('div', 'msg counselor' + (t.referred ? ' crisis' : ''));
    cou.appendChild(el('div', 'who', '🤖 カウンセラー役 (実エンジン) — ' + (TONE_JA[t.counselorTone] || t.counselorTone) + (t.matched ? ' ✅' : ' ⚠不一致')));
    cou.appendChild(el('div', '', t.counselorMessage));
    cou.appendChild(el('div', 'sugg', '💡 ' + t.suggestion));
    if (t.referred) cou.appendChild(el('div', 'ref', '📞 専門窓口を提示しました (いのちの電話 ほか)'));
    $('feed').appendChild(cou); scrollFeed();
    await delay(700);
  }
}

async function play() {
  $('feed').replaceChildren();
  const report = runResearch(RESEARCH_PERSONAS);
  $('feed').appendChild(renderMetrics(report));
  caption('AI同士の役割演技で ' + report.sessions.length + ' セッションを実施します (患者役は「受け止められたか」に反応して発話が変わります)');
  for (const s of report.sessions) {
    await delay(400);
    await playSession(s);
  }
  caption(report.findings.length === 0
    ? '改善候補 0 件 — 全ターンで適切なトーン・危機は確実に窓口照会。'
    : '改善候補 ' + report.findings.length + ' 件を記録 (PR でエンジン/ペルソナを強化して再実行=研究ループ)');
}

$('replay').addEventListener('click', () => void play());
void play();
`;

const CSS = `
  :root { --bg:#0e0f13; --panel:#171922; --border:#2a2d3a; --text:#e7e9f0; --mute:#8a93a6; --accent:#5b8def; --danger:#ef4444; --success:#4ade80; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:'Hiragino Sans','Noto Sans JP',system-ui,sans-serif; display:flex; flex-direction:column; height:100vh; height:100dvh; }
  header { padding:12px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  header h1 { font-size:15px; margin:0; }
  header .sub { font-size:11px; color:var(--mute); flex-basis:100%; }
  header select { background:var(--panel); border:1px solid var(--border); border-radius:8px; color:var(--text); padding:6px 8px; font-size:12px; }
  #feed { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; }
  .caption { align-self:center; font-size:11px; color:var(--mute); background:var(--panel); border:1px solid var(--border); border-radius:999px; padding:4px 14px; max-width:94%; text-align:center; }
  .metrics { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
  .metric { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:8px 16px; text-align:center; min-width:90px; }
  .metric.good { border-color:var(--success); }
  .metric.bad { border-color:var(--danger); }
  .metric-v { font-size:18px; font-weight:700; }
  .metric-l { font-size:10px; color:var(--mute); }
  .msg { max-width:84%; border-radius:14px; padding:10px 14px; font-size:13px; line-height:1.7; }
  .msg .who { font-size:11px; font-weight:700; margin-bottom:4px; color:var(--accent); }
  .msg.patient { align-self:flex-end; background:#243049; border-bottom-right-radius:4px; }
  .msg.patient .who { color:#9db7e8; }
  .msg.counselor { align-self:flex-start; background:var(--panel); border:1px solid var(--border); border-bottom-left-radius:4px; }
  .msg.counselor.crisis { border-color:var(--danger); background:rgba(239,68,68,0.08); }
  .sugg { color:var(--success); font-size:12px; margin-top:4px; }
  .ref { color:var(--danger); font-size:12px; font-weight:700; margin-top:4px; }
  button { background:var(--accent); color:#fff; border:none; border-radius:10px; padding:10px 14px; font-size:13px; cursor:pointer; }
  button.ghost { background:transparent; border:1px solid var(--border); color:var(--text); }
`;

function htmlShell(js) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>カウンセリング研究デモ — AI同士の役割演技</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>🔬 カウンセリング研究デモ — AI同士の役割演技</h1>
  <button id="replay" class="ghost">▶ 再実行</button>
  <select id="speed" title="再生速度">
    <option value="2">🐢 ゆっくり</option>
    <option value="1" selected>▶ 標準</option>
    <option value="0.4">⏩ 速い</option>
    <option value="0">⚡ 一気</option>
  </select>
  <span class="sub">患者役(AI)とカウンセラー役(実エンジン)が対話し、トーン適合率と危機照会を評価します。患者役は受け止められたかに反応して発話が変わります。応答ルールの改善は人のレビュー(PR)を通します。</span>
</header>
<div id="feed"></div>
</body>
<script>${js}</script>
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

  const must = ['void play()', '患者役', 'カウンセラー役', 'トーン適合率'];
  for (const marker of must) {
    if (!html.includes(marker)) {
      console.error(`build-research-demo: マーカー欠落 "${marker}"`);
      process.exit(1);
    }
  }
  console.log(`Wrote ${OUT} (${(html.length / 1024).toFixed(1)} KB) — 実エンジン同梱・自己検証 OK`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

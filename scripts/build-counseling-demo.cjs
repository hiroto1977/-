#!/usr/bin/env node
'use strict';

/*
 * 寄り添いカウンセリング会話デモのビルド (実エンジン同梱・自己完結 HTML)。
 *
 * 本体の純ロジック (src/renderer/data/counseling.ts / emotionInsights.ts) を esbuild で
 * そのままバンドルし、台本の自動再生 + 自由入力チャット UI を持つ単一 HTML を生成する。
 * デモの応答はモックではなく、デプロイ時点の実エンジンの計算結果 — 単一の真実源から
 * 導出するため、エンジンを改良するとデモも自動で追随する。
 *
 * 出力: dist/counseling-demo.html (pages.yml が _site/counseling-demo.html へコピー)
 * 自己検証: 出力に必須マーカー (起動スクリプト・危機窓口) が無ければ exit 1。
 */

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist/counseling-demo.html');

const ENTRY = `
import { counsel } from './src/renderer/data/counseling';
import { analyzeProfile } from './src/renderer/data/emotionInsights';

// サンプルの気分履歴 (縦断プロファイル用): 10日分、直近3日が低調。
const SAMPLE_MOODS = [
  { score: 4, note: '友人とランチ 楽しかった' },
  { score: 4, note: '仕事 順調' },
  { score: 3, note: 'ふつうの一日' },
  { score: 3, note: '会議 が 長い' },
  { score: 3, note: '残業 少し疲れた' },
  { score: 2, note: '会議 続き 疲れた' },
  { score: 3, note: '少し回復' },
  { score: 2, note: '残業 つらい' },
  { score: 2, note: '眠れない 疲れた' },
  { score: 1, note: '朝から気分が重い 残業 続き' },
];
const PROFILE = analyzeProfile(SAMPLE_MOODS, [
  { dominant: 'sadness', sentiment: 'negative' },
  { dominant: 'sadness', sentiment: 'negative' },
  { dominant: 'fear', sentiment: 'negative' },
]);

const SCRIPT = [
  {
    caption: 'シーン1: 落ち込み — 縦断プロファイル (連続不調) に触れて寄り添う',
    user: '最近ずっと疲れてて、今日も朝から気分が重いです…',
    input: { note: '最近ずっと疲れてて、今日も朝から気分が重い', score: 1, sentiment: 'negative', profile: PROFILE },
  },
  {
    caption: 'シーン2: 不安 — グラウンディングで「いま・ここ」へ',
    user: '来週のプレゼンのことを考えると不安で眠れません。',
    input: { note: '来週のプレゼンのことを考えると不安で眠れない', dominant: '不安', profile: PROFILE },
  },
  {
    caption: 'シーン3: 怒り — 感情を否定せず受け止める',
    user: '同僚に手柄を取られて、本当に腹が立っています。',
    input: { note: '同僚に手柄を取られて腹が立つ', dominant: '怒り' },
  },
  {
    caption: 'シーン4: 回復 — 前向きさを共に喜ぶ',
    user: '今日は散歩して、久しぶりに気分が良いです！',
    input: { note: '散歩して気分が良い', score: 4, sentiment: 'positive' },
  },
  {
    caption: 'シーン5: 危機検知 — 何よりも先に専門窓口へ (安全最優先)',
    user: 'もう疲れた。消えたいって思ってしまう。',
    input: { note: 'もう疲れた。消えたいって思ってしまう', score: 1 },
  },
];

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 再生速度: select#speed の倍率を都度読む (再生中に変えても即反映)。0 = 一気。
function speedFactor() {
  const el2 = document.getElementById('speed');
  const f = el2 ? Number(el2.value) : 1;
  return Number.isFinite(f) && f >= 0 ? f : 1;
}
const delay = (ms) => sleep(ms * speedFactor());

// DOM は createElement/textContent のみで構築する (innerHTML 不使用 — XSS シンク回避)。
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function bubble(role, text, crisis = false) {
  const div = el('div', 'msg ' + role + (crisis ? ' crisis' : ''));
  if (text !== undefined) div.textContent = text;
  $('chat').appendChild(div);
  $('chat').scrollTop = $('chat').scrollHeight;
  return div;
}
function caption(text) {
  $('chat').appendChild(el('div', 'caption', text));
}
function toneLabel(tone) {
  const map = {
    crisis: '🚨 危機対応 (最優先)',
    'harm-other': '🛑 衝動の鎮静 (他害)',
    destructive: '🧯 安全な発散 (破壊衝動)',
    comfort: '🫂 寄り添い',
    'soothe-anxiety': '🌬 不安をやわらげる',
    'validate-anger': '🔥 怒りの受容',
    celebrate: '🌟 共に喜ぶ',
    gentle: '🍵 穏やかな傾聴',
  };
  return map[tone] || tone;
}
function renderResponseInto(container, r) {
  container.replaceChildren();
  container.appendChild(el('div', 'tone', toneLabel(r.tone)));
  container.appendChild(el('p', '', r.message));
  container.appendChild(el('p', 'sugg', '💡 ' + r.suggestion));
  if (r.resources.length > 0) {
    const box = el('div', 'resources');
    box.appendChild(el('strong', '', '📞 相談できる窓口（日本）'));
    const ul = el('ul');
    for (const x of r.resources) {
      const li = el('li');
      li.appendChild(el('strong', '', x.label));
      li.appendChild(document.createTextNode(': ' + x.detail));
      ul.appendChild(li);
    }
    box.appendChild(ul);
    container.appendChild(box);
  }
  container.appendChild(el('p', 'disc', r.disclaimer));
}
async function typeInto(container, r) {
  container.replaceChildren(el('span', 'dots', '●●●'));
  await delay(700);
  renderResponseInto(container, r);
  $('chat').scrollTop = $('chat').scrollHeight;
}

let playing = false;
async function play() {
  if (playing) return;
  playing = true;
  $('chat').replaceChildren();
  const trendJa = { improving: '上向き ↗', declining: '下向き ↘', stable: '横ばい →' }[PROFILE.trend];
  caption('📈 縦断解析 (サンプル10日分): 傾向 ' + trendJa + ' / 平均 ' + PROFILE.averageScore.toFixed(1) +
    ' / 連続低調 ' + PROFILE.lowStreak + ' 日 / よく出る言葉: ' + PROFILE.topTriggers.slice(0, 4).join('・'));
  for (const scene of SCRIPT) {
    await delay(600);
    caption(scene.caption);
    await delay(400);
    bubble('user', scene.user);
    const r = counsel(scene.input);
    const elBot = bubble('bot', undefined, r.isCrisis);
    await typeInto(elBot, r);
    await delay(1200);
  }
  caption('— デモ終了。下の入力欄で自由に話しかけてみてください（実エンジンが応答します）—');
  playing = false;
}
function sendFree() {
  const input = $('free');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  bubble('user', text);
  const score = Number($('score').value) || undefined;
  const r = counsel({ note: text, score, profile: PROFILE });
  const elBot = bubble('bot', undefined, r.isCrisis);
  void typeInto(elBot, r);
}
$('replay').addEventListener('click', () => void play());
$('send').addEventListener('click', sendFree);
$('free').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendFree(); });
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
  #chat { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; }
  .caption { align-self:center; font-size:11px; color:var(--mute); background:var(--panel); border:1px solid var(--border); border-radius:999px; padding:4px 14px; max-width:92%; text-align:center; }
  .msg { max-width:82%; border-radius:14px; padding:10px 14px; font-size:13.5px; line-height:1.75; white-space:pre-wrap; }
  .msg.user { align-self:flex-end; background:var(--accent); color:#fff; border-bottom-right-radius:4px; }
  .msg.bot { align-self:flex-start; background:var(--panel); border:1px solid var(--border); border-bottom-left-radius:4px; }
  .msg.bot.crisis { border-color:var(--danger); background:rgba(239,68,68,0.08); }
  .msg.bot p { margin:6px 0; }
  .tone { font-size:11px; color:var(--accent); font-weight:700; }
  .crisis .tone { color:var(--danger); }
  .sugg { color:var(--success); font-size:12.5px; }
  .disc { color:var(--mute); font-size:10.5px; border-top:1px solid var(--border); padding-top:6px; }
  .resources { border:1px solid var(--danger); border-radius:10px; padding:8px 12px; font-size:12px; margin:6px 0; }
  .resources ul { margin:6px 0 0; padding-left:18px; }
  .dots { color:var(--mute); animation:blink 1s infinite; }
  @keyframes blink { 50% { opacity:0.3; } }
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
<title>寄り添いカウンセリング — 会話デモ (実エンジン)</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>🫂 寄り添いカウンセリング — 会話デモ</h1>
  <button id="replay" class="ghost">▶ 最初から再生</button>
  <select id="speed" title="再生速度">
    <option value="2">🐢 ゆっくり</option>
    <option value="1" selected>▶ 標準</option>
    <option value="0.4">⏩ 速い</option>
    <option value="0">⚡ 一気</option>
  </select>
  <span class="sub">Service Hub の実エンジンがそのまま動いています。データは端末内のみ・送信なし。本デモはセルフケア支援であり医療・診断ではありません。</span>
</header>
<div id="chat"></div>
<footer>
  <select id="score" title="今日の気分 (1-5)">
    <option value="">気分</option>
    <option value="1">1 最悪</option><option value="2">2 低調</option>
    <option value="3" selected>3 普通</option>
    <option value="4">4 好調</option><option value="5">5 最高</option>
  </select>
  <input id="free" type="text" placeholder="自由に話しかけてみてください">
  <button id="send">送信</button>
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
    minify: false,
    logLevel: 'silent',
  });
  let js = result.outputFiles[0].text;
  // <script> 内に閉じタグ列が現れると HTML が壊れるためエスケープ (防御)。
  js = js.replace(/<\/script/gi, '<\\/script');

  const html = htmlShell(js);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);

  // 自己検証: 起動コード・危機窓口・実エンジン由来の文面が同梱されていること。
  const must = ['void play()', 'いのちの電話', '専門的な医療・心理的ケアの代わりにはなれません'];
  for (const marker of must) {
    if (!html.includes(marker)) {
      console.error(`build-counseling-demo: マーカー欠落 "${marker}"`);
      process.exit(1);
    }
  }
  console.log(`Wrote ${OUT} (${(html.length / 1024).toFixed(1)} KB) — 実エンジン同梱・自己検証 OK`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

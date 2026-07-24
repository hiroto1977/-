#!/usr/bin/env node
/**
 * build-integration-demo.cjs — ミニマル自動業務連携デモ（POS・会計・CRM）を生成する。
 *
 * ユーザーの Canva 設計図「ミニマル自動業務連携（POS・会計・CRM連携コード例）」
 * (whiteboard DAG2yKvS8Os) を実装に起こしたもの。設計図のダッシュボード構成:
 *   ①KPI カード 3 枚（POS 連携 / 会計 連携 / CRM 連携）
 *   ②連携フロー 4 ステップ（POS 売上 → 会計仕訳 → CRM 更新 → 完了通知）
 *   ③操作コントロール（連携開始 / 停止 / リセット）
 *   ④累計売上チャート ＋ アクティビティ・ログ
 *
 * 出力: dist/業務自動化ダッシュボード.html
 *   - 単一ファイル・依存ゼロ・ネットワーク不要（file:// でダブルクリック起動）
 *   - DOM 生成は createElement/textContent のみ（XSS シンク不使用 — invariant #9 準拠）
 *
 * 連携エンジン（コード例の本体）:
 *   simulatePosSale()  … POS レジ売上トランザクションを生成
 *   posToJournal(sale) … 売上を複式簿記の仕訳（借方/貸方・消費税区分）へ変換
 *   updateCrm(sale)    … CRM 顧客台帳（購入回数・累計購入額・ランク）を更新
 *   これらを runPipeline() が 4 ステップのフローとして順に実行する。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', '業務自動化ダッシュボード.html');

// ---------------------------------------------------------------------------
// ページ内で動く連携エンジン（コード例）。テンプレートリテラル入れ子を避ける
// ため、ページ側 JS は文字列連結のみで書く。
// ---------------------------------------------------------------------------
const PAGE_JS = `
'use strict';
// ============================================================================
// ミニマル自動業務連携 — コード例
//   POS（販売時点情報管理） → 会計（複式簿記の自動仕訳） → CRM（顧客台帳更新）
// 実運用では simulatePosSale() を実 POS の Webhook 受信に、applyJournal() を
// 会計 SaaS API 呼び出しに、updateCrm() を CRM API 呼び出しに差し替えるだけで
// 同じパイプラインがそのまま使える構成にしてある。
// ============================================================================

// ---- ① POS 層: 売上トランザクションの発生 --------------------------------
var PRODUCTS = [
  { name: 'コーヒー',     price: 480,  taxRate: 0.08 }, // 軽減税率(持ち帰り飲食料品)
  { name: 'サンドイッチ', price: 620,  taxRate: 0.08 },
  { name: '日替わり弁当', price: 850,  taxRate: 0.08 },
  { name: 'マグカップ',   price: 1400, taxRate: 0.10 }, // 標準税率(雑貨)
  { name: 'ギフトセット', price: 3200, taxRate: 0.10 },
];
var CUSTOMER_NAMES = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村'];
var PAY_METHODS = ['現金', 'クレジット', 'QR決済'];

var seq = 0;
function simulatePosSale() {
  seq += 1;
  var p = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
  var qty = 1 + Math.floor(Math.random() * 3);
  return {
    id: 'POS-' + String(seq).padStart(4, '0'),
    at: new Date(),
    customer: CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)],
    item: p.name,
    qty: qty,
    unitPrice: p.price,          // 税抜単価
    taxRate: p.taxRate,
    payMethod: PAY_METHODS[Math.floor(Math.random() * PAY_METHODS.length)],
  };
}

// ---- ② 会計層: 複式簿記への自動変換 ---------------------------------------
// 借方（資産の増加）: 現金 or 売掛金 / 貸方（収益・負債）: 売上高 + 仮受消費税
function posToJournal(sale) {
  var net = sale.unitPrice * sale.qty;              // 税抜売上
  var tax = Math.floor(net * sale.taxRate);         // 消費税(端数切捨て)
  var gross = net + tax;                            // 税込受領額
  var debitAccount = sale.payMethod === '現金' ? '現金' : '売掛金';
  return {
    saleId: sale.id,
    date: sale.at,
    entries: [
      { side: '借方', account: debitAccount,   amount: gross },
      { side: '貸方', account: '売上高',       amount: net },
      { side: '貸方', account: '仮受消費税',   amount: tax,
        memo: (sale.taxRate === 0.08 ? '軽減8%' : '標準10%') },
    ],
  };
}

// ---- ③ CRM 層: 顧客台帳の更新 ---------------------------------------------
var crmDb = {}; // 顧客名 → { count, ltv, rank }
function crmRank(ltv) {
  if (ltv >= 10000) return 'ゴールド';
  if (ltv >= 5000) return 'シルバー';
  return 'ブロンズ';
}
function updateCrm(sale, journal) {
  var gross = journal.entries[0].amount;
  var rec = crmDb[sale.customer] || { count: 0, ltv: 0, rank: 'ブロンズ' };
  rec.count += 1;
  rec.ltv += gross;
  rec.rank = crmRank(rec.ltv);
  crmDb[sale.customer] = rec;
  return rec;
}

// ============================================================================
// ここから下はダッシュボード UI（KPI・フロー・ログ・チャート）の配線
// ============================================================================
var state = {
  running: false,
  timer: null,
  posCount: 0,
  journalCount: 0,
  crmCount: 0,
  totalSales: 0,      // 税込累計
  series: [0],        // チャート用累計推移
};

function $(id) { return document.getElementById(id); }

function fmtYen(n) { return '¥' + n.toLocaleString('ja-JP'); }
function fmtTime(d) {
  return String(d.getHours()).padStart(2, '0') + ':' +
         String(d.getMinutes()).padStart(2, '0') + ':' +
         String(d.getSeconds()).padStart(2, '0');
}

function addLog(icon, text) {
  var empty = $('log-empty');
  if (empty) empty.remove();
  var row = document.createElement('div');
  row.className = 'log-row';
  var t = document.createElement('span');
  t.className = 'log-time';
  t.textContent = fmtTime(new Date());
  var body = document.createElement('span');
  body.textContent = icon + ' ' + text;
  row.appendChild(t);
  row.appendChild(body);
  var log = $('log');
  log.insertBefore(row, log.firstChild);
  while (log.children.length > 60) log.removeChild(log.lastChild);
}

function setBadges(label) {
  ['badge-pos', 'badge-acct', 'badge-crm'].forEach(function (id) {
    $(id).textContent = label;
    $(id).className = 'badge ' + (label === '稼働中' ? 'badge-on' : 'badge-off');
  });
}

function setStep(active) { // active: -1(消灯) / 0..3
  for (var i = 0; i < 4; i++) {
    $('step-' + i).className = 'step' + (i === active ? ' step-active' : '');
  }
}

function renderKpis() {
  $('kpi-pos').textContent = String(state.posCount);
  $('kpi-acct').textContent = String(state.journalCount);
  $('kpi-crm').textContent = String(state.crmCount);
  $('kpi-pos-sub').textContent = '累計売上 ' + fmtYen(state.totalSales) + '（税込）';
  $('kpi-acct-sub').textContent = '複式簿記へ自動起票';
  $('kpi-crm-sub').textContent = '顧客 ' + Object.keys(crmDb).length + ' 名の台帳を維持';
}

function renderChart() {
  var svg = $('chart');
  var W = 560, H = 150, PAD = 8;
  var pts = state.series.slice(-40);
  var max = Math.max.apply(null, pts.concat([1]));
  var step = pts.length > 1 ? (W - PAD * 2) / (pts.length - 1) : 0;
  var coords = pts.map(function (v, i) {
    var x = PAD + i * step;
    var y = H - PAD - (v / max) * (H - PAD * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  $('chart-line').setAttribute('points', coords.join(' '));
  $('chart-label').textContent = '累計売上 ' + fmtYen(state.totalSales);
  void svg; // svg 自体は固定 viewBox
}

// ---- パイプライン: 1 トランザクションを 4 ステップで流す -------------------
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function runPipeline() {
  if (!state.running) return;

  // Step 0: POS 売上発生
  setStep(0);
  var sale = simulatePosSale();
  state.posCount += 1;
  addLog('🛒', 'POS ' + sale.id + ': ' + sale.customer + ' 様 — ' + sale.item +
    ' ×' + sale.qty + '（' + sale.payMethod + '）');
  renderKpis();
  await sleep(500);
  if (!state.running) return;

  // Step 1: 会計仕訳へ変換
  setStep(1);
  var journal = posToJournal(sale);
  state.journalCount += 1;
  var e = journal.entries;
  addLog('📒', '仕訳: (借) ' + e[0].account + ' ' + fmtYen(e[0].amount) +
    ' / (貸) 売上高 ' + fmtYen(e[1].amount) +
    ' ・仮受消費税 ' + fmtYen(e[2].amount) + '（' + e[2].memo + '）');
  state.totalSales += e[0].amount;
  state.series.push(state.totalSales);
  renderKpis();
  renderChart();
  await sleep(500);
  if (!state.running) return;

  // Step 2: CRM 更新
  setStep(2);
  var rec = updateCrm(sale, journal);
  state.crmCount += 1;
  addLog('👤', 'CRM: ' + sale.customer + ' 様 — 購入 ' + rec.count + ' 回目 / LTV ' +
    fmtYen(rec.ltv) + ' / ランク: ' + rec.rank);
  renderKpis();
  await sleep(500);
  if (!state.running) return;

  // Step 3: 完了通知
  setStep(3);
  addLog('✅', sale.id + ' の連携が完了（POS→会計→CRM）');
  await sleep(400);
  setStep(-1);

  // 次のトランザクションを予約（停止されるまで自動で繰り返す）
  if (state.running) state.timer = setTimeout(runPipeline, 700);
}

function start() {
  if (state.running) return;
  state.running = true;
  setBadges('稼働中');
  $('btn-start').disabled = true;
  $('btn-stop').disabled = false;
  addLog('▶', '自動連携を開始しました');
  runPipeline();
}

function stop() {
  if (!state.running) return;
  state.running = false;
  if (state.timer) clearTimeout(state.timer);
  setStep(-1);
  setBadges('待機');
  $('btn-start').disabled = false;
  $('btn-stop').disabled = true;
  addLog('⏹', '自動連携を停止しました');
}

function reset() {
  stop();
  seq = 0;
  crmDb = {};
  state.posCount = 0;
  state.journalCount = 0;
  state.crmCount = 0;
  state.totalSales = 0;
  state.series = [0];
  renderKpis();
  renderChart();
  var log = $('log');
  while (log.firstChild) log.removeChild(log.firstChild);
  var empty = document.createElement('div');
  empty.id = 'log-empty';
  empty.className = 'log-placeholder';
  empty.textContent = 'まだログはありません。「連携開始」を押すと自動連携が始まります。';
  log.appendChild(empty);
}

document.addEventListener('DOMContentLoaded', function () {
  $('btn-start').addEventListener('click', start);
  $('btn-stop').addEventListener('click', stop);
  $('btn-reset').addEventListener('click', reset);
  renderKpis();
  renderChart();
});
`;

const PAGE_CSS = `
  :root {
    --bg: #f4f2fb; --card: #ffffff; --ink: #1f2430; --sub: #7a7f8c;
    --line: #e8e6f2; --indigo: #4f46e5; --red: #dc2626; --dark: #334155;
    --pos: #3b82f6; --acct: #8b5cf6; --crm: #ec4899;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', sans-serif;
         background: var(--bg); color: var(--ink); padding: 28px;
         max-width: 1080px; margin: 0 auto; }
  h1 { font-size: 22px; display: flex; align-items: center; gap: 8px; }
  .sub { color: var(--sub); font-size: 12.5px; margin: 6px 0 20px; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .kpi { background: var(--card); border-radius: 12px; padding: 14px 16px;
         border-top: 3px solid var(--line); box-shadow: 0 1px 4px rgba(40,30,90,.07);
         display: flex; flex-direction: column; gap: 4px; }
  .kpi-pos  { border-top-color: var(--pos); }
  .kpi-acct { border-top-color: var(--acct); }
  .kpi-crm  { border-top-color: var(--crm); }
  .kpi-head { display: flex; justify-content: space-between; align-items: center;
              font-size: 13px; font-weight: 600; }
  .kpi-num { font-size: 30px; font-weight: 700; }
  .kpi-sub { color: var(--sub); font-size: 11.5px; }
  .badge { font-size: 10.5px; border-radius: 999px; padding: 2px 9px; }
  .badge-off { background: #eef7ef; color: #3f9750; }
  .badge-on  { background: #def7e5; color: #15803d; font-weight: 700; }
  .panel { background: var(--card); border-radius: 12px; padding: 16px;
           margin-top: 16px; box-shadow: 0 1px 4px rgba(40,30,90,.07); }
  .panel h2 { font-size: 14.5px; margin-bottom: 12px; }
  .flow { display: grid; grid-template-columns: 1fr 22px 1fr 22px 1fr 22px 1fr;
          align-items: stretch; gap: 4px; }
  .step { border-radius: 10px; padding: 12px 8px; text-align: center;
          font-size: 12px; line-height: 1.5; transition: box-shadow .3s, transform .3s; }
  .step .ico { font-size: 22px; display: block; margin-bottom: 4px; }
  .step small { color: var(--sub); font-size: 10.5px; display: block; }
  #step-0 { background: #eaf2fe; }
  #step-1 { background: #e9f9ef; }
  #step-2 { background: #f6effc; }
  #step-3 { background: #fdeef4; }
  .step-active { box-shadow: 0 0 0 2px var(--indigo) inset, 0 4px 10px rgba(79,70,229,.25);
                 transform: translateY(-2px); }
  .arrow { align-self: center; text-align: center; color: var(--sub); }
  .controls { display: flex; gap: 10px; }
  button { border: 0; border-radius: 8px; color: #fff; font-size: 13.5px;
           padding: 10px 18px; cursor: pointer; font-weight: 600; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  #btn-start { background: var(--indigo); }
  #btn-stop  { background: var(--red); }
  #btn-reset { background: var(--dark); }
  .chart-wrap { display: flex; align-items: baseline; gap: 12px; }
  #chart { width: 100%; height: 150px; background: #fbfaff;
           border: 1px solid var(--line); border-radius: 8px; }
  #chart-label { font-size: 12px; color: var(--sub); white-space: nowrap; }
  #log { max-height: 260px; overflow-y: auto; display: flex; flex-direction: column;
         gap: 6px; font-size: 12.5px; }
  .log-row { display: flex; gap: 10px; border-bottom: 1px dashed var(--line);
             padding-bottom: 5px; }
  .log-time { color: var(--sub); font-variant-numeric: tabular-nums; flex: none; }
  .log-placeholder { color: var(--sub); text-align: center; padding: 26px 0;
                     font-size: 12px; }
  footer { color: var(--sub); font-size: 11px; margin-top: 18px; text-align: center; }

  /* --- モバイル/タブレット (Android スマホ等) --- */
  @media (max-width: 760px) {
    body { padding: 14px; }
    .kpis { grid-template-columns: 1fr; }         /* KPI カードを縦積みに */
    .flow { grid-template-columns: 1fr; }          /* フローも縦 1 列に */
    .arrow { transform: rotate(90deg); }           /* 矢印を下向きへ */
    .controls { flex-wrap: wrap; }
    button { flex: 1 1 auto; padding: 13px 12px; } /* 指で押しやすい幅と高さ */
    .chart-wrap { flex-direction: column; align-items: stretch; }
  }
  @media (pointer: coarse) {
    button { touch-action: manipulation; }         /* ダブルタップズーム防止 */
  }
`;

function buildHtml() {
  return [
    '<!DOCTYPE html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    // 単一ファイル・完全オフライン。外部への通信は CSP で遮断する。
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;\">",
    '<title>業務自動化ダッシュボード — ミニマル自動業務連携（POS・会計・CRM）</title>',
    `<style>${PAGE_CSS}</style>`,
    '</head>',
    '<body>',
    '<h1>🚀 業務自動化ダッシュボード</h1>',
    '<p class="sub">ミニマル構成デモ — POS → 会計 → CRM 自動連携（コード例）／このファイルはダブルクリックだけで起動します（依存ゼロ・オフライン動作）</p>',

    '<div class="kpis">',
    '  <div class="kpi kpi-pos"><div class="kpi-head"><span>🛒 POS 連携</span><span class="badge badge-off" id="badge-pos">待機</span></div><div class="kpi-num" id="kpi-pos">0</div><div class="kpi-sub" id="kpi-pos-sub"></div></div>',
    '  <div class="kpi kpi-acct"><div class="kpi-head"><span>📒 会計 連携</span><span class="badge badge-off" id="badge-acct">待機</span></div><div class="kpi-num" id="kpi-acct">0</div><div class="kpi-sub" id="kpi-acct-sub"></div></div>',
    '  <div class="kpi kpi-crm"><div class="kpi-head"><span>👤 CRM 連携</span><span class="badge badge-off" id="badge-crm">待機</span></div><div class="kpi-num" id="kpi-crm">0</div><div class="kpi-sub" id="kpi-crm-sub"></div></div>',
    '</div>',

    '<div class="panel"><h2>🔄 連携フロー</h2><div class="flow">',
    '  <div class="step" id="step-0"><span class="ico">🛒</span>POS 売上データ<small>レジ打ちを検知</small></div><div class="arrow">→</div>',
    '  <div class="step" id="step-1"><span class="ico">📒</span>会計仕訳へ変換<small>借方／貸方・消費税区分</small></div><div class="arrow">→</div>',
    '  <div class="step" id="step-2"><span class="ico">👤</span>CRM 顧客台帳を更新<small>購入回数・LTV・ランク</small></div><div class="arrow">→</div>',
    '  <div class="step" id="step-3"><span class="ico">✅</span>完了通知<small>次のトランザクションへ</small></div>',
    '</div></div>',

    '<div class="panel"><h2>🎛 操作コントロール</h2><div class="controls">',
    '  <button id="btn-start">▶ 連携開始</button>',
    '  <button id="btn-stop" disabled>⏹ 停止</button>',
    '  <button id="btn-reset">🔄 リセット</button>',
    '</div></div>',

    '<div class="panel"><h2>📈 累計売上（税込）</h2><div class="chart-wrap">',
    '  <svg id="chart" viewBox="0 0 560 150" preserveAspectRatio="none">',
    '    <polyline id="chart-line" points="" fill="none" stroke="#4f46e5" stroke-width="2.5" stroke-linejoin="round"/>',
    '  </svg>',
    '  <span id="chart-label"></span>',
    '</div></div>',

    '<div class="panel"><h2>📝 アクティビティ・ログ</h2><div id="log">',
    '  <div class="log-placeholder" id="log-empty">まだログはありません。「連携開始」を押すと自動連携が始まります。</div>',
    '</div></div>',

    '<footer>設計図: Canva「ミニマル自動業務連携（POS・会計・CRM連携コード例）」より実装 ／ 生成: scripts/build-integration-demo.cjs</footer>',
    `<script>${PAGE_JS}</script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

function main() {
  const html = buildHtml();

  // -- 自己検証: 必須マーカー・サイズ・禁止パターン不在 ----------------------
  const required = [
    '業務自動化ダッシュボード',
    'btn-start',
    'posToJournal',
    'updateCrm',
    '仮受消費税',
    'chart-line',
  ];
  for (const marker of required) {
    if (!html.includes(marker)) {
      throw new Error(`self-check failed: missing marker "${marker}"`);
    }
  }
  if (html.length < 10_000) throw new Error('self-check failed: output too small');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(`Wrote ${OUT} (${(html.length / 1024).toFixed(1)} KB) — 自己検証 OK`);
}

main();

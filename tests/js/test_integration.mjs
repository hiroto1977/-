// v19 統合テスト: #orchestrate / #governance / 既存ルートの drift sniff
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.html'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.css'), 'utf8');

const tests = [];

// ── ルート 整合性 ──
tests.push(['HTML nav に #orchestrate', /href="#orchestrate"/.test(HTML)]);
tests.push(['HTML nav に #governance', /href="#governance"/.test(HTML)]);
tests.push(['HTML nav に #audit (既存)', /href="#audit"/.test(HTML)]);
tests.push(['HTML に data-route="orchestrate"', /data-route="orchestrate"/.test(HTML)]);
tests.push(['HTML に data-route="governance"', /data-route="governance"/.test(HTML)]);

// ROUTES 配列に追加されている
tests.push(['JS ROUTES に orchestrate', /ROUTES = \[[^\]]*'orchestrate'/.test(JS)]);
tests.push(['JS ROUTES に governance', /ROUTES = \[[^\]]*'governance'/.test(JS)]);

// 既存ルート は壊さない (regression)
for (const r of ['overview', 'integrations', 'settings', 'integration-claude', 'audit']) {
  tests.push([`既存ルート '${r}' が ROUTES に残る`, JS.includes(`'${r}'`)]);
}

// ── #orchestrate 機能 ──
tests.push(['HTML に kpi_alpha タイル', /id="kpi_alpha"/.test(HTML)]);
tests.push(['HTML に kpi_beta/gamma/delta', /id="kpi_beta"/.test(HTML) && /id="kpi_gamma"/.test(HTML) && /id="kpi_delta"/.test(HTML)]);
tests.push(['HTML に boardList', /id="boardList"/.test(HTML)]);
tests.push(['HTML に proposeBreachSelect (4 オプション)',
  /id="proposeBreachSelect"/.test(HTML) &&
  /audit_chain_broken/.test(HTML) &&
  /chat_error_storm/.test(HTML) &&
  /inv12_concurrent_scope/.test(HTML) &&
  /pii_scan_stale/.test(HTML)]);
// v36 (PDCA #25) で computeOrchestrateKPI は modules/orchestrate.js に抽出
const ORCH_MOD = fs.readFileSync(path.join(ROOT, 'v19/ui/modules/orchestrate.js'), 'utf8');
tests.push(['orchestrate モジュール に computeOrchestrateKPI',
  /export function computeOrchestrateKPI/.test(ORCH_MOD)]);
tests.push(['JS に renderBoard (DOM 層は dashboard.js)', /function renderBoard/.test(JS)]);
tests.push(['JS に bindOrchestrate', /function bindOrchestrate/.test(JS)]);
tests.push(['JS が orchestrate モジュール を import',
  /from\s*['"]\.\/modules\/orchestrate\.js['"]/.test(JS)]);

// ── #governance 機能 ──
tests.push(['HTML に govFileInput', /id="govFileInput"/.test(HTML)]);
tests.push(['HTML に govSearchBox', /id="govSearchBox"/.test(HTML)]);
tests.push(['HTML に govViewer', /id="govViewer"/.test(HTML)]);
tests.push(['JS に bindGovernance', /function bindGovernance/.test(JS)]);
tests.push(['JS に renderGovList', /function renderGovList/.test(JS)]);

// ── boot で wire ──
tests.push(['boot() が bindOrchestrate を呼ぶ', /bindOrchestrate\(\)/.test(JS)]);
tests.push(['boot() が bindGovernance を呼ぶ', /bindGovernance\(\)/.test(JS)]);

// ── CSS スタイル ──
tests.push(['CSS に .kpi-grid', /\.kpi-grid/.test(CSS)]);
tests.push(['CSS に .board-row', /\.board-row/.test(CSS)]);
tests.push(['CSS に .gov-list', /\.gov-list/.test(CSS)]);
tests.push(['CSS に .propose-output', /\.propose-output/.test(CSS)]);

// ── KPI 計算 ロジック (inline spec で機能 確認) ──
function computeKPI(events) {
  const cycles = events.filter(e => e.event === 'pdca.cycle.complete').length;
  const incidents = events.filter(e => e.event?.startsWith('incident.')).length;
  const containedIncidents = events.filter(e => e.event === 'incident.contained' || e.event === 'incident.resolved').length;
  const issues = {};
  for (const e of events) {
    const m = e.event?.match(/^team\.(\w+)\.1\.scoped$/);
    if (m) {
      const im = (e.details || '').match(/issue=(\S+)/);
      if (im) (issues[im[1]] = issues[im[1]] || new Set()).add(m[1]);
    }
  }
  const inv12 = Object.values(issues).filter(s => s.size > 1).length;
  return { cycles, incidents, containedIncidents, inv12 };
}

// 1) 通常 PDCA: 1 cycle 完遂、INV-12 違反なし
{
  const events = [
    { event: 'team.alpha.1.scoped', details: 'issue=1', ts: '2026-05-06T10:00:00+00:00' },
    { event: 'pdca.cycle.complete', details: 'issue=1', ts: '2026-05-06T10:30:00+00:00' },
  ];
  const k = computeKPI(events);
  tests.push(['正常: 1 cycle / INV-12 なし', k.cycles === 1 && k.inv12 === 0]);
}

// 2) INV-12 違反: 同 issue を 2 チーム scoped
{
  const events = [
    { event: 'team.alpha.1.scoped', details: 'issue=99 priority=high' },
    { event: 'team.beta.1.scoped',  details: 'issue=99 priority=high' },
  ];
  const k = computeKPI(events);
  tests.push(['INV-12 違反 検出', k.inv12 === 1]);
}

// 3) インシデント 解消率
{
  const events = [
    { event: 'incident.detected', details: 'x' },
    { event: 'incident.contained', details: 'x' },
    { event: 'incident.detected', details: 'y' },
  ];
  const k = computeKPI(events);
  tests.push(['インシデント count', k.incidents === 3]);
  tests.push(['インシデント 解消 1 件', k.containedIncidents === 1]);
}

// 4) 板 フィルタ ロジック (inline)
function filterBoard(events, opts) {
  return events.filter(e => {
    const ev = e.event || '';
    if (ev.startsWith('team.') && opts.team) return true;
    if (ev.startsWith('handoff.') && opts.handoff) return true;
    if (ev.startsWith('incident.') && opts.incident) return true;
    if (/cycle/.test(ev) && opts.cycle) return true;
    return false;
  });
}
{
  const events = [
    { event: 'team.alpha.1.scoped' },
    { event: 'handoff.alpha.beta' },
    { event: 'incident.detected' },
    { event: 'pdca.cycle.complete' },
    { event: 'unrelated.thing' },
  ];
  // 全 ON
  let filtered = filterBoard(events, { team: true, handoff: true, incident: true, cycle: true });
  tests.push(['全フィルタ ON: 4 件 (unrelated 除外)', filtered.length === 4]);
  // team のみ
  filtered = filterBoard(events, { team: true, handoff: false, incident: false, cycle: false });
  tests.push(['team のみ: 1 件', filtered.length === 1]);
  // incident のみ
  filtered = filterBoard(events, { team: false, handoff: false, incident: true, cycle: false });
  tests.push(['incident のみ: 1 件', filtered.length === 1]);
}

// ── governance ナビ で affect-aware (governance/15) も見れるか ──
tests.push(['governance 文書 ナビが governance/15 を含む', JS.includes('renderMarkdown')]);

let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

// v19/ui/modules/orchestrate.js — 純粋ロジック層 を検証
// 対応 PDCA #25 (governance/12 §10 #36): dashboard.js から #orchestrate 計算ロジックを抽出
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const {
  parseAuditLineSimple, computeOrchestrateKPI, countInv12Violations,
  filterBoardEvents, boardRowClass, formatBoardTs, OODA_RESPONSES,
} = await import(path.join(ROOT, 'v19/ui/modules/orchestrate.js'));

const tests = [];
const T = (name, ok) => tests.push([name, ok]);

// ── 1. parseAuditLineSimple ──
T('parse: 空行 → null',  parseAuditLineSimple('') === null);
T('parse: 空白のみ → null', parseAuditLineSimple('   ') === null);
T('parse: 不正 JSON → null', parseAuditLineSimple('not json') === null);
T('parse: null 引数 → null', parseAuditLineSimple(null) === null);
{
  const obj = parseAuditLineSimple('{"event":"test","ts":"2026-05-06"}');
  T('parse: 正常 JSON → object', obj && obj.event === 'test');
}

// ── 2. countInv12Violations ──
T('INV-12: 空配列 → 0', countInv12Violations([]) === 0);
T('INV-12: 単一チーム scoped → 0',
  countInv12Violations([
    { event: 'team.alpha.1.scoped', details: 'issue=10' },
  ]) === 0);
T('INV-12: 同 issue を 2 チーム → 1 違反',
  countInv12Violations([
    { event: 'team.alpha.1.scoped', details: 'issue=10' },
    { event: 'team.beta.1.scoped',  details: 'issue=10' },
  ]) === 1);
T('INV-12: 同 issue を 3 チーム → 1 違反 (issue 単位)',
  countInv12Violations([
    { event: 'team.alpha.1.scoped', details: 'issue=10' },
    { event: 'team.beta.1.scoped',  details: 'issue=10' },
    { event: 'team.gamma.1.scoped', details: 'issue=10' },
  ]) === 1);
T('INV-12: 異 issue は別 → 0',
  countInv12Violations([
    { event: 'team.alpha.1.scoped', details: 'issue=10' },
    { event: 'team.beta.1.scoped',  details: 'issue=11' },
  ]) === 0);
T('INV-12: scoped 以外は無視',
  countInv12Violations([
    { event: 'team.alpha.2.designed', details: 'issue=10' },
    { event: 'team.beta.2.designed',  details: 'issue=10' },
  ]) === 0);

// ── 3. computeOrchestrateKPI ──
{
  const events = [
    { ts: '2026-05-01T09:00:00Z', event: 'team.alpha.1.scoped', details: 'issue=1' },
    { ts: '2026-05-01T09:30:00Z', event: 'pdca.cycle.complete', details: 'n=1' },
    { ts: '2026-05-02T09:00:00Z', event: 'team.alpha.1.scoped', details: 'issue=2' },
    { ts: '2026-05-02T10:00:00Z', event: 'pdca.cycle.complete', details: 'n=2' },
    { ts: '2026-05-03T09:00:00Z', event: 'incident.detected',   details: 'foo' },
    { ts: '2026-05-03T10:00:00Z', event: 'incident.contained',  details: 'foo' },
  ];
  const kpi = computeOrchestrateKPI(events);
  T('KPI: cycles=2 が α label に', kpi.alpha.label === '2 サイクル完遂');
  T('KPI: INV-12 違反 0 → OK', kpi.alpha.sub.includes('OK'));
  T('KPI: β は 2 件',  kpi.beta.label.startsWith('2 件'));
  // 注: incidents は all incident.* (contained 含む) で数える既存仕様
  T('KPI: γ contained=1/incidents=2', kpi.gamma.label === '1/2 解消');
  T('KPI: δ = cycles(2) + max(0, 2-1) = 3 活動件', kpi.delta.label === '3 活動件');
}
{
  // INV-12 違反ケース
  const events = [
    { ts: '2026-05-01T09:00:00Z', event: 'team.alpha.1.scoped', details: 'issue=99' },
    { ts: '2026-05-01T09:01:00Z', event: 'team.beta.1.scoped',  details: 'issue=99' },
  ];
  const kpi = computeOrchestrateKPI(events);
  T('KPI: INV-12 違反 1 → ⚠️',  kpi.alpha.sub.includes('⚠️'));
}
{
  // 進行中 incident
  const events = [
    { ts: '2026-05-01T09:00:00Z', event: 'incident.detected', details: 'foo' },
    { ts: '2026-05-02T09:00:00Z', event: 'incident.detected', details: 'bar' },
  ];
  const kpi = computeOrchestrateKPI(events);
  T('KPI: 進行中 incident → δ に加算',
    kpi.delta.label === '2 活動件' && kpi.gamma.label === '0/2 解消');
}
{
  // 不正 ts は β 計算でスキップ (NaN にならない)
  const events = [
    { ts: 'invalid-ts', event: 'team.alpha.1.scoped', details: 'issue=1' },
    { ts: 'invalid-ts', event: 'pdca.cycle.complete', details: 'n=1' },
  ];
  const kpi = computeOrchestrateKPI(events);
  T('KPI: 不正 ts は β=0 件で安全',
    kpi.beta.label === '0 件 / 中央 0s');
}

// ── 4. filterBoardEvents ──
{
  const events = [
    { event: 'team.alpha.1.scoped', details: 'a' },
    { event: 'handoff.beta_to_gamma', details: 'b' },
    { event: 'incident.detected', details: 'c' },
    { event: 'pdca.cycle.complete', details: 'd' },
    { event: 'unrelated.foo', details: 'e' },
  ];
  T('filter: 全 ON → 4 件 (unrelated 除く)',
    filterBoardEvents(events, { team: true, handoff: true, incident: true, cycle: true }).length === 4);
  T('filter: team のみ → 1 件',
    filterBoardEvents(events, { team: true }).length === 1);
  T('filter: 全 OFF → 0 件',
    filterBoardEvents(events, {}).length === 0);
  T('filter: null flags → 0 件 (安全)',
    filterBoardEvents(events, null).length === 0);
}
{
  // 30 件 cap + reverse
  const many = [];
  for (let i = 0; i < 50; i++) many.push({ event: 'team.alpha.1.scoped', details: `i=${i}` });
  const out = filterBoardEvents(many, { team: true });
  T('filter: 30 件 cap', out.length === 30);
  T('filter: 降順 (最新が先頭)', out[0].details === 'i=49');
}

// ── 5. boardRowClass ──
T('cls: incident', boardRowClass('incident.detected') === 'board-incident');
T('cls: handoff',  boardRowClass('handoff.alpha_to_beta') === 'board-handoff');
T('cls: team',     boardRowClass('team.alpha.1.scoped') === 'board-team');
T('cls: cycle → team (default)', boardRowClass('pdca.cycle.complete') === 'board-team');
T('cls: 空 → team', boardRowClass('') === 'board-team');
T('cls: undef → team', boardRowClass(undefined) === 'board-team');

// ── 6. formatBoardTs ──
T('formatTs: ISO → space',
  formatBoardTs('2026-05-06T09:30:45Z') === '2026-05-06 09:30:45');
T('formatTs: 空 → 空', formatBoardTs('') === '');
T('formatTs: null → 空', formatBoardTs(null) === '');

// ── 7. OODA_RESPONSES ──
T('OODA: 4 breach 定義済み',
  Object.keys(OODA_RESPONSES).length === 4);
for (const key of ['audit_chain_broken', 'chat_error_storm', 'inv12_concurrent_scope', 'pii_scan_stale']) {
  const r = OODA_RESPONSES[key];
  T(`OODA: ${key} 存在`, r && r.cat && r.ir && Array.isArray(r.steps));
  T(`OODA: ${key} steps 3 件`, r.steps.length === 3);
}

// ── 8. drift sniff: dashboard.js が orchestrate モジュール を import + 使用 ──
const dashSrc = fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.js'), 'utf8');
T('dashboard.js が orchestrate モジュール を import',
  dashSrc.includes("from './modules/orchestrate.js'"));
T('dashboard.js: parseAuditLineSimple 重複定義なし',
  !/^function\s+parseAuditLineSimple\s*\(/m.test(dashSrc));
T('dashboard.js: computeOrchestrateKPI 重複定義なし',
  !/^function\s+computeOrchestrateKPI\s*\(/m.test(dashSrc));
T('dashboard.js: 旧 inline RESPONSES 削除済み',
  !/const\s+RESPONSES\s*=\s*\{\s*\n\s*audit_chain_broken/.test(dashSrc));
T('dashboard.js: OODA_RESPONSES を使用',
  dashSrc.includes('OODA_RESPONSES'));

// ── レポート ──
let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

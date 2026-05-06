// v19/ui/modules/audit-viewer.js — 純粋分析層 を検証
// 対応 PDCA #26 (governance/12 §10 #38): dashboard.js から #audit 分析層を抽出
//
// SHA-256 / reconstructBody は audit-browser.js モジュール の関数を 注入してテスト
// (循環参照 を避けつつ INV-2/INV-10 境界 が単一実装 に保たれていることを確認)
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const M = await import(path.join(ROOT, 'v19/ui/modules/audit-viewer.js'));
const AB = await import(path.join(ROOT, 'v19/ui/modules/audit-browser.js'));

const tests = [];
const T = (name, ok) => tests.push([name, ok]);

// ── 1. ZERO_HASH ──
T('ZERO_HASH: 64 個の 0', M.ZERO_HASH === '0'.repeat(64));

// ── 2. auditEventSeverity ──
T('severity: bad 系 (blocked)', M.auditEventSeverity('storage.blocked') === 'bad');
T('severity: bad 系 (tamper)', M.auditEventSeverity('audit.tamper') === 'bad');
T('severity: bad 系 (failed)', M.auditEventSeverity('chat.failed') === 'bad');
T('severity: warn 系 (warn)', M.auditEventSeverity('storage.warn') === 'warn');
T('severity: warn 系 (hits)', M.auditEventSeverity('pii.hits') === 'warn');
T('severity: info 既定', M.auditEventSeverity('preflight.start') === 'info');
T('severity: 空文字 → info', M.auditEventSeverity('') === 'info');
T('severity: null → info', M.auditEventSeverity(null) === 'info');
T('severity: 大文字小文字不問', M.auditEventSeverity('STORAGE.BLOCKED') === 'bad');

// ── 3. parseAuditJsonl ──
{
  const text = '{"event":"a"}\n{"event":"b"}\n\nbroken json\n{"event":"c"}\n';
  const { entries, parseErrors } = M.parseAuditJsonl(text);
  T('parse: 3 entries', entries.length === 3);
  T('parse: 1 broken line', parseErrors.length === 1);
  // 空行は filter で落ちるので、broken は filtered 配列の 3 番目 (index 2 → line 3)
  T('parse: error に line 番号', parseErrors[0].line === 3);
  T('parse: 抽出順 維持', entries[0].event === 'a' && entries[2].event === 'c');
}
T('parse: 空文字 → 空',
  M.parseAuditJsonl('').entries.length === 0);
T('parse: null → 空',
  M.parseAuditJsonl(null).entries.length === 0);

// ── 4. summarizeAuditEntries ──
{
  const empty = M.summarizeAuditEntries([]);
  T('summary: 空 → total=0', empty.total === 0);
  T('summary: 空 → tsFirst="-"', empty.tsFirst === '-');
}
{
  const entries = [
    { ts: '2026-05-01T09:00:00Z', script: 'preflight.sh', event: 'preflight.start' },
    { ts: '2026-05-01T09:01:00Z', script: 'preflight.sh', event: 'preflight.complete' },
    { ts: '2026-05-02T09:00:00Z', script: 'pii-scan.sh',  event: 'pii.scan.start' },
    { ts: '2026-05-02T09:00:30Z', script: 'pii-scan.sh',  event: 'pii.scan.complete' },
    { ts: '2026-05-03T09:00:00Z', script: 'storage-health.sh', event: 'storage.warn' },
  ];
  const s = M.summarizeAuditEntries(entries);
  T('summary: total = 5', s.total === 5);
  T('summary: scriptCount = 3', s.scriptCount === 3);
  T('summary: eventTypeCount = 5', s.eventTypeCount === 5);
  T('summary: tsFirst = 最古', s.tsFirst === '2026-05-01T09:00:00Z');
  T('summary: tsLast = 最新', s.tsLast === '2026-05-03T09:00:00Z');
  T('summary: topScripts は降順',
    s.topScripts[0][0] === 'preflight.sh' && s.topScripts[0][1] === 2);
  T('summary: maxScriptCount = 2', s.maxScriptCount === 2);
  T('summary: topEvents は最大 5', s.topEvents.length <= 5);
}

// ── 5. verifyAuditChain (audit-browser.js を注入して 真の chain を検証) ──
{
  // ブラウザ audit を 3 件 生成 (mock localStorage)
  const storage = new Map();
  global.localStorage = {
    getItem: k => storage.has(k) ? storage.get(k) : null,
    setItem: (k, v) => storage.set(k, String(v)),
  };
  // 直接 audit-browser の sha256/reconstructBody を 仕様 として使う
  const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  await AB.auditLogBrowser('test.first',  'one', { sha256Hex: async (s) => sha256(s) });
  await AB.auditLogBrowser('test.second', 'two', { sha256Hex: async (s) => sha256(s) });
  await AB.auditLogBrowser('test.third',  'three', { sha256Hex: async (s) => sha256(s) });
  const entries = AB.loadBrowserAudit();
  T('verify pre: 3 件 生成', entries.length === 3);

  const r = await M.verifyAuditChain(entries, {
    sha256Hex: async (s) => sha256(s),
    reconstructBody: AB.reconstructAuditBody,
  });
  T('verify: total = 3', r.total === 3);
  T('verify: ok = 3', r.ok === 3);
  T('verify: breaks 0 件', r.breaks.length === 0);
}
{
  // 改竄: details を書き換え → chain_hash 再計算 不一致
  const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  const entries = AB.loadBrowserAudit();
  entries[1] = { ...entries[1], details: '改竄' };
  const r = await M.verifyAuditChain(entries, {
    sha256Hex: async (s) => sha256(s),
    reconstructBody: AB.reconstructAuditBody,
  });
  T('verify: 改竄検出 (breaks ≥ 1)', r.breaks.length >= 1);
  T('verify: breaks に line 番号',
    r.breaks.every(b => Number.isFinite(b.line) && typeof b.reason === 'string'));
}
{
  // 連鎖切断 (= chain_hash は body と整合するが、prev_hash が前エントリ chain と不一致):
  // entries[1].prev_hash = X、chain_hash = sha256(REAL_PREV + body_with_X)
  // → chain_hash 検証は OK、prev_hash 検証で 連鎖切断 が立つ
  const entries = AB.loadBrowserAudit();
  const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  const realPrev = entries[0].chain_hash;
  const fake = '1'.repeat(64);
  entries[1] = { ...entries[1], prev_hash: fake };
  const body = AB.reconstructAuditBody(entries[1]);
  entries[1].chain_hash = sha256(realPrev + body);  // 前エントリ実 chain で再計算
  const r = await M.verifyAuditChain(entries, {
    sha256Hex: async (s) => sha256(s),
    reconstructBody: AB.reconstructAuditBody,
  });
  T('verify: 連鎖切断 を検出', r.breaks.some(b => b.reason.includes('連鎖切断')));
}
{
  // chain_hash 欠如
  const r = await M.verifyAuditChain(
    [{ event: 'a', prev_hash: M.ZERO_HASH /* chain_hash 欠如 */ }],
    { sha256Hex: async () => 'x', reconstructBody: () => '' });
  T('verify: chain_hash/prev_hash 欠如 を 検出',
    r.breaks.length === 1 && r.breaks[0].reason.includes('抽出失敗'));
}
{
  // 空配列
  const r = await M.verifyAuditChain([], { sha256Hex: async () => '', reconstructBody: () => '' });
  T('verify: 空配列 → ok=0 / breaks=[]', r.total === 0 && r.ok === 0 && r.breaks.length === 0);
}

// ── 6. filterAuditEntries ──
{
  const entries = [
    { event: 'preflight.start',    script: 'preflight.sh' },
    { event: 'preflight.complete', script: 'preflight.sh' },
    { event: 'pii.scan.start',     script: 'pii-scan.sh' },
    { event: 'storage.warn',       script: 'storage-health.sh' },
  ];
  T('filter: 既定で全件 (上限 100)',
    M.filterAuditEntries(entries).length === 4);
  T('filter: eventQ で 部分一致',
    M.filterAuditEntries(entries, { eventQ: 'preflight' }).length === 2);
  T('filter: scriptQ で 部分一致',
    M.filterAuditEntries(entries, { scriptQ: 'pii' }).length === 1);
  T('filter: eventQ + scriptQ AND',
    M.filterAuditEntries(entries, { eventQ: 'start', scriptQ: 'preflight' }).length === 1);
  T('filter: 結果は降順 (最新が先頭)',
    M.filterAuditEntries(entries, { eventQ: 'preflight' })[0].event === 'preflight.complete');
  T('filter: limit cap',
    M.filterAuditEntries(entries, { limit: 2 }).length === 2);
  T('filter: 大文字小文字不問',
    M.filterAuditEntries(entries, { eventQ: 'PREFLIGHT' }).length === 2);
}

// ── 7. formatAuditTs ──
T('formatTs: ISO → space',
  M.formatAuditTs('2026-05-06T09:30:45Z') === '2026-05-06 09:30:45');
T('formatTs: 空 → 空', M.formatAuditTs('') === '');
T('formatTs: null → 空', M.formatAuditTs(null) === '');

// ── 8. drift sniff: dashboard.js が audit-viewer モジュール を import + 重複なし ──
const dashSrc = fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.js'), 'utf8');
T('dashboard.js が audit-viewer モジュール を import',
  dashSrc.includes("from './modules/audit-viewer.js'"));
T('dashboard.js: ZERO_HASH の inline 定義なし',
  !/^const\s+ZERO_HASH\s*=/m.test(dashSrc));
T('dashboard.js: auditEventSeverity 重複定義なし',
  !/^function\s+auditEventSeverity\s*\(/m.test(dashSrc));
T('dashboard.js: parseAuditJsonl を使用',
  /parseAuditJsonl\s*\(/.test(dashSrc));
T('dashboard.js: summarizeAuditEntries を使用',
  /summarizeAuditEntries\s*\(/.test(dashSrc));
T('dashboard.js: filterAuditEntries を使用',
  /filterAuditEntries\s*\(/.test(dashSrc));
T('dashboard.js: verifyAuditChain (注入版) を使用',
  /_verifyAuditChain\s*\(/.test(dashSrc));

// ── レポート ──
let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

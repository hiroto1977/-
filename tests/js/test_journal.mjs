// v19/ui/modules/journal.js — 純粋ロジック層 (DOM 非依存) を検証
// 対応 PDCA #23 (governance/12 §10 #34): #journal ルート、governance/16 を UI で 可視化
//
// ESM module を直接 import して、deriveTaskState / parseTasksFromAudit /
// tasksToArray / extractKey / stateBadge / formatTaskTimeline / isHandoffReady /
// getArtifactPaths の振る舞いを検証する。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const {
  deriveTaskState, extractKey, parseTasksFromAudit, tasksToArray,
  stateBadge, formatTaskTimeline, isHandoffReady, getArtifactPaths,
} = await import(path.join(ROOT, 'v19/ui/modules/journal.js'));

const tests = [];
const T = (name, ok) => tests.push([name, ok]);

// ── 1. deriveTaskState ──
T('空配列 → unknown', deriveTaskState([]) === 'unknown');
T('null → unknown', deriveTaskState(null) === 'unknown');
T('start のみ → active',
  deriveTaskState([{ event: 'work.task.start' }]) === 'active');
T('start → complete → complete',
  deriveTaskState([{ event: 'work.task.start' }, { event: 'work.task.complete' }]) === 'complete');
T('start → block → blocked',
  deriveTaskState([{ event: 'work.task.start' }, { event: 'work.task.block' }]) === 'blocked');
T('start → block → resume → active (最終 イベント を採用)',
  deriveTaskState([
    { event: 'work.task.start' },
    { event: 'work.task.block' },
    { event: 'work.task.resume' },
  ]) === 'active');
T('start → handoff → handoff',
  deriveTaskState([{ event: 'work.task.start' }, { event: 'work.task.handoff' }]) === 'handoff');
T('start → handoff → complete → complete (handoff 後の complete を優先)',
  deriveTaskState([
    { event: 'work.task.start' },
    { event: 'work.task.handoff' },
    { event: 'work.task.complete' },
  ]) === 'complete');
T('start → decision → active (decision/comm/artifact は状態を変えない)',
  deriveTaskState([
    { event: 'work.task.start' },
    { event: 'work.task.decision' },
  ]) === 'active');

// ── 2. extractKey ──
T('extractKey 単一値', extractKey('task=T-001 stakeholder=alice', 'task') === 'T-001');
T('extractKey 別 key', extractKey('task=T-001 stakeholder=alice', 'stakeholder') === 'alice');
T('extractKey 不在 → 空文字', extractKey('task=T-001', 'deadline') === '');
T('extractKey 空 details → 空文字', extractKey('', 'task') === '');
T('extractKey null → 空文字', extractKey(null, 'task') === '');

// ── 3. parseTasksFromAudit ──
const sampleAudit = [
  { ts: '2026-05-01T09:00:00Z', event: 'work.task.start',    details: 'task=T-001 title=見積A stakeholder=alice deadline=2026-05-10' },
  { ts: '2026-05-01T10:00:00Z', event: 'work.task.decision', details: 'task=T-001 d=価格据置' },
  { ts: '2026-05-02T09:00:00Z', event: 'work.task.start',    details: 'task=T-002 title=契約B stakeholder=bob' },
  { ts: '2026-05-02T11:00:00Z', event: 'work.task.handoff',  details: 'task=T-002 to=carol' },
  // 関係ないイベント (work.task.* ではない)
  { ts: '2026-05-02T12:00:00Z', event: 'preflight.start',    details: '' },
  // task ID なし → スキップ
  { ts: '2026-05-02T13:00:00Z', event: 'work.task.start',    details: 'no-id-here' },
  { ts: '2026-05-02T14:00:00Z', event: 'work.task.complete', details: 'task=T-001' },
];
const tasksMap = parseTasksFromAudit(sampleAudit);
T('parse: 2 タスク 抽出', tasksMap.size === 2);
T('parse: T-001 存在', tasksMap.has('T-001'));
T('parse: T-002 存在', tasksMap.has('T-002'));
{
  const t1 = tasksMap.get('T-001');
  T('T-001: title 抽出', t1.title === '見積A');
  T('T-001: stakeholder 抽出', t1.stakeholder === 'alice');
  T('T-001: deadline 抽出', t1.deadline === '2026-05-10');
  T('T-001: 3 events 関連', t1.events.length === 3);
  T('T-001: 最終状態 = complete', t1.state === 'complete');
  T('T-001: lastTs 更新', t1.lastTs === '2026-05-02T14:00:00Z');
}
{
  const t2 = tasksMap.get('T-002');
  T('T-002: 最終状態 = handoff', t2.state === 'handoff');
  T('T-002: stakeholder = bob', t2.stakeholder === 'bob');
  T('T-002: deadline 不在 = 空文字', t2.deadline === '');
}

// ── 4. tasksToArray ──
{
  const arr = tasksToArray(tasksMap);
  T('tasksToArray: 全件', arr.length === 2);
  T('tasksToArray: lastTs 降順 (T-001 が最新)', arr[0].id === 'T-001');
}
{
  const arr = tasksToArray(tasksMap, { stateFilter: 'handoff' });
  T('tasksToArray: handoff フィルタ → T-002 のみ',
    arr.length === 1 && arr[0].id === 'T-002');
}
{
  const arr = tasksToArray(tasksMap, { stateFilter: 'complete' });
  T('tasksToArray: complete フィルタ → T-001 のみ',
    arr.length === 1 && arr[0].id === 'T-001');
}
{
  const arr = tasksToArray(tasksMap, { search: 'alice' });
  T('tasksToArray: stakeholder 検索 → T-001',
    arr.length === 1 && arr[0].id === 'T-001');
}
{
  const arr = tasksToArray(tasksMap, { search: 'B' });  // 大文字小文字不問
  T('tasksToArray: title 検索 (大文字小文字不問) → T-002',
    arr.length === 1 && arr[0].id === 'T-002');
}
{
  const arr = tasksToArray(tasksMap, { search: 'T-001' });
  T('tasksToArray: id 検索 → T-001',
    arr.length === 1 && arr[0].id === 'T-001');
}

// ── 5. stateBadge ──
T('stateBadge: active', stateBadge('active').label === 'アクティブ');
T('stateBadge: blocked cls', stateBadge('blocked').cls === 'journal-blocked');
T('stateBadge: handoff icon', stateBadge('handoff').icon === '🟣');
T('stateBadge: complete cls', stateBadge('complete').cls === 'journal-complete');
T('stateBadge: 不明値 → unknown フォールバック',
  stateBadge('xxx').label === '不明');

// ── 6. formatTaskTimeline ──
{
  const t = tasksMap.get('T-001');
  const tl = formatTaskTimeline(t);
  T('formatTaskTimeline: 件数 = events 数', tl.length === t.events.length);
  T('formatTaskTimeline: ts は YYYY-MM-DD HH:MM:SS',
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(tl[0].ts));
  T('formatTaskTimeline: eventShort は work.task. 抜き',
    tl[0].eventShort === 'start');
  T('formatTaskTimeline: details 含む',
    tl[0].details.includes('task=T-001'));
}

// ── 7. isHandoffReady ──
{
  const t1 = tasksMap.get('T-001'); // 最終 = complete
  const t2 = tasksMap.get('T-002'); // 最終 = handoff
  T('isHandoffReady: complete タスク は false', isHandoffReady(t1) === false);
  T('isHandoffReady: handoff タスク は true', isHandoffReady(t2) === true);
  T('isHandoffReady: 空タスク は false',
    isHandoffReady({ events: [] }) === false);
}

// ── 8. getArtifactPaths ──
{
  const audit = [
    { ts: 't1', event: 'work.task.start',    details: 'task=T-A title=報告書' },
    { ts: 't2', event: 'work.task.artifact', details: 'task=T-A path=/tmp/report.pdf' },
    { ts: 't3', event: 'work.task.artifact', details: 'task=T-A path=/tmp/sheet.xlsx' },
    { ts: 't4', event: 'work.task.complete', details: 'task=T-A' },
  ];
  const m = parseTasksFromAudit(audit);
  const paths = getArtifactPaths(m.get('T-A'));
  T('getArtifactPaths: 2 件 抽出',
    paths.length === 2 && paths.includes('/tmp/report.pdf') && paths.includes('/tmp/sheet.xlsx'));
}

// ── 9. drift sniff: dashboard.js が journal モジュール を import + bind ──
const dashSrc = fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.js'), 'utf8');
T('dashboard.js が journal モジュール を import',
  dashSrc.includes("from './modules/journal.js'"));
T('dashboard.js に bindJournal 関数',
  dashSrc.includes('function bindJournal()'));
T('dashboard.js boot() で bindJournal 呼出',
  /boot\s*\(\s*\)\s*\{[\s\S]*?bindJournal\s*\(\s*\)/.test(dashSrc));
T('ROUTES に journal が含まれる',
  /ROUTES\s*=\s*\[[^\]]*'journal'[^\]]*\]/.test(dashSrc));

const htmlSrc = fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.html'), 'utf8');
T('dashboard.html に #journal nav リンク',
  htmlSrc.includes('href="#journal"'));
T('dashboard.html に data-route="journal" section',
  htmlSrc.includes('data-route="journal"'));
T('dashboard.html に journalFileInput',
  htmlSrc.includes('id="journalFileInput"'));

const cssSrc = fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.css'), 'utf8');
T('dashboard.css に .journal-card', cssSrc.includes('.journal-card'));
T('dashboard.css に .journal-active 状態色', cssSrc.includes('.journal-active'));

// ── レポート ──
let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

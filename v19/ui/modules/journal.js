// v19/ui/modules/journal.js — 業務 引継ぎ Free システム の UI 層 (governance/16)
//
// audit.jsonl の work.task.* イベント をタスク別にグループ化し、
// 状態 (active/blocked/handoff/complete) で分類して可視化。
//
// 純粋ロジック層 (DOM 非依存) — テスト容易性のため。

// 1 タスクの状態 を最終 イベント から推測
export function deriveTaskState(events) {
  if (!events || events.length === 0) return 'unknown';
  // 末尾から逆順に走査
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i].event || '';
    if (ev.endsWith('.complete')) return 'complete';
    if (ev.endsWith('.block'))    return 'blocked';
    if (ev.endsWith('.handoff'))  return 'handoff';
    if (ev.endsWith('.resume'))   return 'active';
  }
  // start 後 に block/complete/handoff/resume が無ければ active
  if (events.some(e => (e.event || '').endsWith('.start'))) return 'active';
  return 'unknown';
}

// details から key=value を抽出
export function extractKey(details, key) {
  if (!details) return '';
  // key=value (value は次の key= or 行末まで)
  const re = new RegExp('(?:^|\\s)' + key + '=([^\\s][^\\s][^\\s]*?)(?=\\s\\w+=|$)');
  const m = details.match(re);
  if (m) return m[1].trim();
  // 単一 word の value (key=word)
  const re2 = new RegExp('(?:^|\\s)' + key + '=(\\S+)');
  const m2 = details.match(re2);
  return m2 ? m2[1].trim() : '';
}

// audit イベント配列 → タスク別 マップ
// {taskId: { id, events, state, title, stakeholder, deadline, lastTs }}
export function parseTasksFromAudit(auditEvents) {
  const tasks = new Map();
  for (const e of auditEvents) {
    const ev = e.event || '';
    if (!ev.startsWith('work.task.')) continue;
    const tid = extractKey(e.details || '', 'task');
    if (!tid) continue;
    if (!tasks.has(tid)) {
      tasks.set(tid, {
        id: tid,
        events: [],
        state: 'unknown',
        title: '',
        stakeholder: '',
        deadline: '',
        lastTs: '',
      });
    }
    const t = tasks.get(tid);
    t.events.push(e);
    t.lastTs = e.ts || t.lastTs;
    if (ev.endsWith('.start')) {
      const d = e.details || '';
      if (!t.title) t.title = extractKey(d, 'title');
      if (!t.stakeholder) t.stakeholder = extractKey(d, 'stakeholder');
      if (!t.deadline) t.deadline = extractKey(d, 'deadline');
    }
  }
  // 状態を後から決定
  for (const t of tasks.values()) {
    t.state = deriveTaskState(t.events);
  }
  return tasks;
}

// 横断検索 DSL (PDCA #24 v35)
// 例: "見積 state:blocked deadline<2026-06 has:artifact stakeholder:alice"
//   - 自由語 (free): id / title / stakeholder の小文字部分一致 (AND)
//   - state:active|blocked|handoff|complete|unknown — 状態 フィルタ
//   - stakeholder:<token> — stakeholder 部分一致 (大文字小文字不問)
//   - id:<token>          — id 部分一致 (大文字小文字不問)
//   - deadline<YYYY-MM-DD or deadline>YYYY-MM-DD — 辞書比較 (ISO 日付ならそのまま大小)
//   - has:artifact / has:handoff / has:block / has:decision — 該当 event の存在
// 不正な key は free に降格 (失敗で空配列にしない)。
export function parseQuery(q) {
  const out = {
    free: [], state: null, stakeholder: null, idQ: null,
    deadlineLT: null, deadlineGT: null, has: new Set(),
  };
  if (!q) return out;
  const tokens = String(q).trim().split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    let m;
    if ((m = tok.match(/^state:([a-z]+)$/i))) out.state = m[1].toLowerCase();
    else if ((m = tok.match(/^stakeholder:(.+)$/i))) out.stakeholder = m[1].toLowerCase();
    else if ((m = tok.match(/^id:(.+)$/i))) out.idQ = m[1].toLowerCase();
    else if ((m = tok.match(/^deadline<(.+)$/i))) out.deadlineLT = m[1];
    else if ((m = tok.match(/^deadline>(.+)$/i))) out.deadlineGT = m[1];
    else if ((m = tok.match(/^has:(artifact|handoff|block|decision|comm|resume|complete|start)$/i))) out.has.add(m[1].toLowerCase());
    else out.free.push(tok.toLowerCase());
  }
  return out;
}

export function matchTask(task, query) {
  // free: id/title/stakeholder 連結文字列 に全 free 語が含まれる
  if (query.free.length) {
    const text = (task.id + ' ' + task.title + ' ' + task.stakeholder).toLowerCase();
    for (const f of query.free) if (!text.includes(f)) return false;
  }
  if (query.state && task.state !== query.state) return false;
  if (query.stakeholder && !(task.stakeholder || '').toLowerCase().includes(query.stakeholder)) return false;
  if (query.idQ && !(task.id || '').toLowerCase().includes(query.idQ)) return false;
  if (query.deadlineLT) {
    if (!task.deadline || !(task.deadline < query.deadlineLT)) return false;
  }
  if (query.deadlineGT) {
    if (!task.deadline || !(task.deadline > query.deadlineGT)) return false;
  }
  if (query.has.size) {
    const evSet = new Set((task.events || []).map(e => (e.event || '').replace('work.task.', '')));
    for (const h of query.has) if (!evSet.has(h)) return false;
  }
  return true;
}

// タスク マップ → 配列 + ソート (lastTs 降順)
// search は DSL (parseQuery 経由) で解釈。stateFilter は UI radio との併用 (DSL の state: が優先)。
export function tasksToArray(tasksMap, { stateFilter = 'all', search = '' } = {}) {
  const arr = Array.from(tasksMap.values());
  const q = parseQuery(search);
  // UI radio は DSL に state: が無いときだけ適用 (DSL が明示なら radio 上書き)
  if (!q.state && stateFilter && stateFilter !== 'all') q.state = stateFilter;
  const filtered = arr.filter(t => matchTask(t, q));
  filtered.sort((a, b) => (b.lastTs || '').localeCompare(a.lastTs || ''));
  return filtered;
}

// 状態 → アイコン + ラベル
export function stateBadge(state) {
  const map = {
    active:   { icon: '🟢', label: 'アクティブ',  cls: 'journal-active' },
    blocked:  { icon: '🟡', label: 'ブロック',    cls: 'journal-blocked' },
    handoff:  { icon: '🟣', label: '引継ぎ準備',  cls: 'journal-handoff' },
    complete: { icon: '⚪', label: '完了',         cls: 'journal-complete' },
    unknown:  { icon: '·',  label: '不明',         cls: 'journal-unknown' },
  };
  return map[state] || map.unknown;
}

// 単一タスクの イベント を時系列で フォーマット (escapeHtml は呼出側 で適用)
export function formatTaskTimeline(task) {
  return task.events.map(e => ({
    ts: (e.ts || '').slice(0, 19).replace('T', ' '),
    eventShort: (e.event || '').replace('work.task.', ''),
    details: e.details || '',
  }));
}

// タスクが「引継ぎ可能」状態か (governance/16 §2.3 引継ぎチェック)
export function isHandoffReady(task) {
  // 最終 handoff event があり、かつ それより後の event が無い
  const events = task.events;
  if (events.length === 0) return false;
  const last = events[events.length - 1];
  return (last.event || '').endsWith('.handoff');
}

// 開いた成果物の path 一覧
export function getArtifactPaths(task) {
  return task.events
    .filter(e => (e.event || '').endsWith('.artifact'))
    .map(e => extractKey(e.details || '', 'path'))
    .filter(Boolean);
}

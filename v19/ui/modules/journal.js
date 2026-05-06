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

// タスク マップ → 配列 + ソート (lastTs 降順)
export function tasksToArray(tasksMap, { stateFilter = 'all', search = '' } = {}) {
  const arr = Array.from(tasksMap.values());
  const filtered = arr.filter(t => {
    if (stateFilter !== 'all' && t.state !== stateFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const text = (t.id + ' ' + t.title + ' ' + t.stakeholder).toLowerCase();
      if (!text.includes(s)) return false;
    }
    return true;
  });
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

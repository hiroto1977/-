/* =========================================================
   みんなのデスクトップ — app.js
   フレームワーク非依存・ESモジュール
   ========================================================= */

// ---------- Storage ----------
const STORAGE_KEY = 'minna-desktop-v1';
const DEFAULT_DATA = {
  settings: { theme: 'light', font: 'medium', density: 'comfortable', onboarded: false },
  tasks: [],
  notes: [],
  events: [],
  contacts: [],
};

const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_DATA);
      const parsed = JSON.parse(raw);
      return { ...structuredClone(DEFAULT_DATA), ...parsed,
               settings: { ...DEFAULT_DATA.settings, ...(parsed.settings || {}) } };
    } catch (e) {
      console.error('storage load failed', e);
      return structuredClone(DEFAULT_DATA);
    }
  },
  save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      toast('保存に失敗しました。容量不足の可能性があります。', 'error');
    }
  },
  reset() { localStorage.removeItem(STORAGE_KEY); }
};

const state = Storage.load();
const persist = debounce(() => Storage.save(state), 200);

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Toast ----------
function toast(message, kind = 'info') {
  const region = document.getElementById('toastRegion');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---------- Confirm dialog ----------
function confirmDialog(message, title = '確認') {
  return new Promise(resolve => {
    const dlg = document.getElementById('confirmDialog');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    dlg.returnValue = '';
    dlg.showModal();
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
  });
}

// ---------- Apps registry ----------
const APPS = [
  { id: 'tasks',     name: 'やること',   icon: '✅', desc: 'タスク・ToDo管理',  mount: mountTasks },
  { id: 'notes',     name: 'メモ',       icon: '📝', desc: '自由なメモ帳',       mount: mountNotes },
  { id: 'calendar',  name: 'カレンダー', icon: '📅', desc: '予定とイベント',     mount: mountCalendar },
  { id: 'calculator',name: '電卓',       icon: '🧮', desc: '計算・履歴',         mount: mountCalculator },
  { id: 'contacts',  name: '連絡先',     icon: '👥', desc: '住所録・電話帳',     mount: mountContacts },
  { id: 'timer',     name: 'タイマー',   icon: '⏱️', desc: 'ストップウォッチ・タイマー', mount: mountTimer },
];

// ---------- Router ----------
const viewHome = document.getElementById('viewHome');
const viewApp = document.getElementById('viewApp');
const appTitle = document.getElementById('appTitle');
const appBody = document.getElementById('appBody');
const appActions = document.getElementById('appActions');
let currentAppCleanup = null;

function openApp(id) {
  const app = APPS.find(a => a.id === id);
  if (!app) return goHome();
  if (currentAppCleanup) currentAppCleanup();
  appTitle.textContent = app.name;
  appBody.innerHTML = '';
  appActions.innerHTML = '';
  viewHome.hidden = true;
  viewApp.hidden = false;
  location.hash = `#/${id}`;
  setStatus(`${app.name} を開いています`);
  currentAppCleanup = app.mount(appBody, appActions) || null;
  // Move focus to title for screen reader
  appTitle.tabIndex = -1;
  appTitle.focus();
}

function goHome() {
  if (currentAppCleanup) currentAppCleanup();
  currentAppCleanup = null;
  viewHome.hidden = false;
  viewApp.hidden = true;
  location.hash = '';
  setStatus('準備ができました');
  renderQuick();
}

function setStatus(text) {
  document.getElementById('statusText').textContent = text;
}

// ---------- Home ----------
function renderHome() {
  const grid = document.getElementById('appGrid');
  grid.innerHTML = '';
  for (const app of APPS) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'app-tile';
    btn.type = 'button';
    btn.setAttribute('aria-label', `${app.name} を開く: ${app.desc}`);
    btn.innerHTML = `
      <span class="app-tile-icon" aria-hidden="true">${app.icon}</span>
      <span class="app-tile-name">${app.name}</span>
      <span class="app-tile-desc">${app.desc}</span>
    `;
    btn.addEventListener('click', () => openApp(app.id));
    li.appendChild(btn);
    grid.appendChild(li);
  }
  renderQuick();
}

function renderQuick() {
  const tasksEl = document.getElementById('quickTasks');
  const notesEl = document.getElementById('quickNotes');

  const pending = state.tasks.filter(t => !t.done).slice(0, 5);
  if (!pending.length) {
    tasksEl.innerHTML = '<li class="empty">タスクはまだありません</li>';
  } else {
    tasksEl.innerHTML = pending.map(t =>
      `<li>○ ${escapeHtml(t.text)}</li>`
    ).join('');
  }

  const recentNotes = [...state.notes].sort((a,b) => b.updated - a.updated).slice(0, 5);
  if (!recentNotes.length) {
    notesEl.innerHTML = '<li class="empty">メモはまだありません</li>';
  } else {
    notesEl.innerHTML = recentNotes.map(n =>
      `<li>📝 ${escapeHtml(n.title || '無題')}</li>`
    ).join('');
  }
}

document.querySelectorAll('[data-open]').forEach(b => {
  b.addEventListener('click', () => openApp(b.dataset.open));
});

// ---------- Settings ----------
const settingsDrawer = document.getElementById('settingsDrawer');
const helpDrawer = document.getElementById('helpDrawer');

function openDrawer(d) {
  d.hidden = false;
  d.setAttribute('aria-hidden', 'false');
  // focus close button
  d.querySelector('.close')?.focus();
  document.addEventListener('keydown', drawerEsc);
  d.addEventListener('click', drawerClickOutside);
}
function closeDrawer(d) {
  d.hidden = true;
  d.setAttribute('aria-hidden', 'true');
  document.removeEventListener('keydown', drawerEsc);
  d.removeEventListener('click', drawerClickOutside);
}
function drawerEsc(e) {
  if (e.key === 'Escape') {
    if (!settingsDrawer.hidden) closeDrawer(settingsDrawer);
    if (!helpDrawer.hidden) closeDrawer(helpDrawer);
  }
}
function drawerClickOutside(e) {
  if (e.target.classList.contains('drawer')) closeDrawer(e.target);
}

document.getElementById('settingsBtn').addEventListener('click', () => openDrawer(settingsDrawer));
document.getElementById('closeSettings').addEventListener('click', () => closeDrawer(settingsDrawer));
document.getElementById('helpBtn').addEventListener('click', () => openDrawer(helpDrawer));
document.getElementById('closeHelp').addEventListener('click', () => closeDrawer(helpDrawer));

function applySettings() {
  document.body.dataset.theme = state.settings.theme;
  document.body.dataset.font = state.settings.font;
  document.body.dataset.density = state.settings.density;
  // Sync radios
  for (const name of ['theme', 'font', 'density']) {
    const r = document.querySelector(`input[name="${name}"][value="${state.settings[name]}"]`);
    if (r) r.checked = true;
  }
}

document.querySelectorAll('input[name="theme"]').forEach(r =>
  r.addEventListener('change', () => { state.settings.theme = r.value; applySettings(); persist(); }));
document.querySelectorAll('input[name="font"]').forEach(r =>
  r.addEventListener('change', () => { state.settings.font = r.value; applySettings(); persist(); }));
document.querySelectorAll('input[name="density"]').forEach(r =>
  r.addEventListener('change', () => { state.settings.density = r.value; applySettings(); persist(); }));

// Backup
document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `minna-desktop-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('バックアップを書き出しました', 'success');
});

const importFile = document.getElementById('importFile');
document.getElementById('importBtn').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  if (!file) return;
  const ok = await confirmDialog(
    '現在のデータを上書きします。よろしいですか？（先にバックアップを取ることをおすすめします）',
    'バックアップの読み込み'
  );
  if (!ok) { importFile.value = ''; return; }
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    Object.assign(state, { ...DEFAULT_DATA, ...data,
      settings: { ...DEFAULT_DATA.settings, ...(data.settings || {}) } });
    persist();
    applySettings();
    renderHome();
    toast('読み込みました', 'success');
  } catch (e) {
    toast('読み込みに失敗しました（ファイル形式が正しくありません）', 'error');
  } finally {
    importFile.value = '';
  }
});

document.getElementById('resetBtn').addEventListener('click', async () => {
  const ok = await confirmDialog(
    '本当に全データを削除しますか？この操作は取り消せません。',
    '全データ削除'
  );
  if (!ok) return;
  Storage.reset();
  Object.assign(state, structuredClone(DEFAULT_DATA));
  applySettings();
  renderHome();
  closeDrawer(settingsDrawer);
  toast('全データを削除しました', 'success');
});

// ---------- Onboarding ----------
const onboarding = document.getElementById('onboarding');
function maybeShowOnboarding() {
  if (!state.settings.onboarded) {
    onboarding.hidden = false;
  }
}
document.getElementById('onbStart').addEventListener('click', () => {
  state.settings.onboarded = true; persist();
  onboarding.hidden = true;
});
document.getElementById('onbSkip').addEventListener('click', () => {
  state.settings.onboarded = true; persist();
  onboarding.hidden = true;
});

// ---------- Header / clock ----------
function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('clockTime').textContent = `${hh}:${mm}`;
  const wd = ['日','月','火','水','木','金','土'][now.getDay()];
  document.getElementById('clockDate').textContent =
    `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日(${wd})`;
}
setInterval(updateClock, 30 * 1000);

document.getElementById('goHomeBtn').addEventListener('click', goHome);
document.getElementById('backBtn').addEventListener('click', goHome);

// ---------- Keyboard shortcuts ----------
document.addEventListener('keydown', e => {
  if (e.key === 'F1') {
    e.preventDefault();
    openDrawer(helpDrawer);
  } else if (e.key === ',' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    openDrawer(settingsDrawer);
  } else if (e.key === 'Escape') {
    if (!onboarding.hidden) return;
    if (!settingsDrawer.hidden || !helpDrawer.hidden) return;
    if (!viewApp.hidden && !document.activeElement?.matches('input,textarea,[contenteditable="true"]')) {
      goHome();
    }
  }
});

// Handle hash route
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/^#\/(\w+)$/);
  if (m) openApp(m[1]); else goHome();
});

// ---------- HTML escaping ----------
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v === false || v == null) {}
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

/* =========================================================
   App: Tasks (やること)
   ========================================================= */
function mountTasks(body, actions) {
  const newBtn = el('button', { class: 'btn btn-primary', onclick: () => input.focus() }, '＋ 新しいタスク');
  actions.appendChild(newBtn);

  const inputRow = el('div', { class: 'task-input-row' });
  const input = el('input', {
    class: 'input', type: 'text',
    placeholder: 'タスクを入力して Enter ',
    'aria-label': '新しいタスク',
    maxlength: 200,
  });
  const addBtn = el('button', { class: 'btn btn-primary' }, '追加');
  inputRow.append(input, addBtn);
  body.appendChild(inputRow);

  const listEl = el('ul', { class: 'task-list', role: 'list', 'aria-label': 'タスク一覧' });
  body.appendChild(listEl);

  const emptyEl = el('div', { class: 'empty-state' }, [
    el('div', { class: 'icon' }, '📝'),
    el('p', {}, 'タスクはまだありません。上の入力欄から追加してみましょう。'),
  ]);

  function add() {
    const text = input.value.trim();
    if (!text) return;
    state.tasks.unshift({ id: uid(), text, done: false, created: Date.now() });
    input.value = '';
    persist(); render();
    setStatus('タスクを追加しました');
  }
  addBtn.addEventListener('click', add);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });

  function render() {
    listEl.innerHTML = '';
    if (!state.tasks.length) {
      body.appendChild(emptyEl);
      return;
    }
    if (emptyEl.parentNode) emptyEl.remove();
    for (const t of state.tasks) {
      const li = el('li', { class: 'task-item' + (t.done ? ' done' : ''), 'data-id': t.id });
      const cb = el('input', { class: 'task-check', type: 'checkbox',
        'aria-label': 'タスク完了' });
      cb.checked = t.done;
      cb.addEventListener('change', () => {
        t.done = cb.checked;
        li.classList.toggle('done', t.done);
        persist();
      });
      const text = el('span', { class: 'task-text', contenteditable: 'true',
        spellcheck: 'false', role: 'textbox', 'aria-label': 'タスクの内容を編集' }, t.text);
      text.addEventListener('blur', () => {
        const v = text.textContent.trim();
        if (!v) { text.textContent = t.text; return; }
        t.text = v; persist();
      });
      text.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); text.blur(); }});
      const meta = el('span', { class: 'task-meta' },
        new Date(t.created).toLocaleDateString('ja-JP'));
      const del = el('button', { class: 'task-del', 'aria-label': 'タスクを削除',
        onclick: async () => {
          const ok = await confirmDialog('このタスクを削除しますか？');
          if (!ok) return;
          state.tasks = state.tasks.filter(x => x.id !== t.id);
          persist(); render();
        }
      }, '✕');
      li.append(cb, text, meta, del);
      listEl.appendChild(li);
    }
  }

  // Ctrl+N
  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault(); input.focus();
    }
  }
  document.addEventListener('keydown', onKey);

  render();
  setTimeout(() => input.focus(), 100);

  return () => document.removeEventListener('keydown', onKey);
}

/* =========================================================
   App: Notes (メモ)
   ========================================================= */
function mountNotes(body, actions) {
  let current = state.notes[0]?.id || null;

  const newBtn = el('button', { class: 'btn btn-primary',
    onclick: () => createNote() }, '＋ 新規メモ');
  actions.appendChild(newBtn);

  const layout = el('div', { class: 'notes-layout' });
  const listEl = el('ul', { class: 'notes-list', role: 'list', 'aria-label': 'メモ一覧' });
  const editor = el('div', { class: 'note-editor' });
  layout.append(listEl, editor);
  body.appendChild(layout);

  function createNote() {
    const n = { id: uid(), title: '無題', body: '', created: Date.now(), updated: Date.now() };
    state.notes.unshift(n);
    current = n.id;
    persist(); renderList(); renderEditor();
    setTimeout(() => editor.querySelector('input')?.focus(), 50);
    setStatus('新しいメモを作成しました');
  }

  function renderList() {
    listEl.innerHTML = '';
    if (!state.notes.length) {
      listEl.appendChild(el('li', { class: 'empty-state' }, [
        el('div', { class: 'icon' }, '📓'),
        el('p', {}, 'メモはまだありません'),
      ]));
      return;
    }
    const sorted = [...state.notes].sort((a,b) => b.updated - a.updated);
    for (const n of sorted) {
      const item = el('button', {
        class: 'note-item' + (n.id === current ? ' active' : ''),
        onclick: () => { current = n.id; renderList(); renderEditor(); }
      }, [
        el('span', { class: 'note-item-title' }, n.title || '無題'),
        el('span', { class: 'note-item-preview' }, (n.body || '').slice(0, 60) || '本文なし'),
      ]);
      listEl.appendChild(el('li', {}, item));
    }
  }

  function renderEditor() {
    editor.innerHTML = '';
    const n = state.notes.find(x => x.id === current);
    if (!n) {
      editor.appendChild(el('div', { class: 'empty-state' }, [
        el('div', { class: 'icon' }, '✏️'),
        el('p', {}, '左のリストからメモを選ぶか、新規作成してください'),
      ]));
      return;
    }
    const titleInput = el('input', { class: 'input', type: 'text',
      placeholder: 'タイトル', 'aria-label': 'タイトル', value: n.title, maxlength: 100 });
    const bodyArea = el('textarea', { class: 'input',
      placeholder: '本文を入力…', 'aria-label': '本文' });
    bodyArea.value = n.body;
    const meta = el('p', { class: 'task-meta' },
      `最終更新: ${new Date(n.updated).toLocaleString('ja-JP')}`);
    const delBtn = el('button', { class: 'btn btn-danger', onclick: async () => {
      const ok = await confirmDialog('このメモを削除しますか？');
      if (!ok) return;
      state.notes = state.notes.filter(x => x.id !== current);
      current = state.notes[0]?.id || null;
      persist(); renderList(); renderEditor();
      setStatus('メモを削除しました');
    }}, '🗑 削除');

    const saveDebounced = debounce(() => {
      n.title = titleInput.value || '無題';
      n.body = bodyArea.value;
      n.updated = Date.now();
      persist();
      meta.textContent = `最終更新: ${new Date(n.updated).toLocaleString('ja-JP')}`;
      renderList();
    }, 400);

    titleInput.addEventListener('input', saveDebounced);
    bodyArea.addEventListener('input', saveDebounced);

    editor.append(titleInput, bodyArea, meta,
      el('div', { class: 'row', style: 'justify-content: flex-end' }, delBtn));
  }

  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault(); createNote();
    }
  }
  document.addEventListener('keydown', onKey);

  renderList(); renderEditor();
  return () => document.removeEventListener('keydown', onKey);
}

/* =========================================================
   App: Calendar (カレンダー)
   ========================================================= */
function mountCalendar(body, actions) {
  let view = new Date(); view.setDate(1);
  let selected = new Date();

  const newBtn = el('button', { class: 'btn btn-primary',
    onclick: () => { selected = new Date(); render(); focusForm(); } }, '＋ 予定を追加');
  actions.appendChild(newBtn);

  const toolbar = el('div', { class: 'cal-toolbar' });
  const prevBtn = el('button', { class: 'btn', 'aria-label': '前の月',
    onclick: () => { view.setMonth(view.getMonth() - 1); render(); }}, '◀ 前月');
  const todayBtn = el('button', { class: 'btn',
    onclick: () => { view = new Date(); view.setDate(1); selected = new Date(); render(); }},
    '今日');
  const nextBtn = el('button', { class: 'btn', 'aria-label': '次の月',
    onclick: () => { view.setMonth(view.getMonth() + 1); render(); }}, '次月 ▶');
  const monthLabel = el('div', { class: 'cal-month-label', 'aria-live': 'polite' });
  toolbar.append(prevBtn, monthLabel, todayBtn, nextBtn);
  body.appendChild(toolbar);

  const grid = el('div', { class: 'cal-grid', role: 'grid', 'aria-label': 'カレンダー' });
  body.appendChild(grid);

  const eventsSection = el('section', { 'aria-labelledby': 'evDateLabel' });
  body.appendChild(eventsSection);

  const formSection = el('div');
  body.appendChild(formSection);

  function ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function eventsOn(d) {
    const k = ymd(d);
    return state.events.filter(e => e.date === k).sort((a,b) => (a.time||'').localeCompare(b.time||''));
  }

  function render() {
    monthLabel.textContent = `${view.getFullYear()}年 ${view.getMonth()+1}月`;
    grid.innerHTML = '';
    const heads = ['日','月','火','水','木','金','土'];
    heads.forEach((h, i) => {
      const cls = i === 0 ? 'cal-head sun' : i === 6 ? 'cal-head sat' : 'cal-head';
      grid.appendChild(el('div', { class: cls, role: 'columnheader' }, h));
    });
    const start = new Date(view); start.setDate(1);
    const offset = start.getDay();
    const daysInMonth = new Date(view.getFullYear(), view.getMonth()+1, 0).getDate();
    const prevDays = new Date(view.getFullYear(), view.getMonth(), 0).getDate();

    const today = new Date();
    const cells = 42;
    for (let i = 0; i < cells; i++) {
      const dayNum = i - offset + 1;
      let date;
      let other = false;
      if (dayNum < 1) {
        date = new Date(view.getFullYear(), view.getMonth() - 1, prevDays + dayNum);
        other = true;
      } else if (dayNum > daysInMonth) {
        date = new Date(view.getFullYear(), view.getMonth() + 1, dayNum - daysInMonth);
        other = true;
      } else {
        date = new Date(view.getFullYear(), view.getMonth(), dayNum);
      }
      const cls = ['cal-cell'];
      if (other) cls.push('other');
      if (sameDay(date, today)) cls.push('today');
      if (sameDay(date, selected)) cls.push('selected');
      const dow = date.getDay();
      const dayCls = dow === 0 ? 'cal-day sun' : dow === 6 ? 'cal-day sat' : 'cal-day';
      const cell = el('button', {
        class: cls.join(' '), role: 'gridcell',
        'aria-label': `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日`,
        onclick: () => { selected = date; render(); focusForm(); }
      });
      cell.appendChild(el('span', { class: dayCls }, String(date.getDate())));
      const evs = eventsOn(date);
      evs.slice(0, 3).forEach(e =>
        cell.appendChild(el('span', { class: 'cal-event' }, e.title)));
      if (evs.length > 3) cell.appendChild(el('span', { class: 'cal-event' }, `他 ${evs.length - 3} 件`));
      grid.appendChild(cell);
    }

    renderEvents();
    renderForm();
  }

  function renderEvents() {
    eventsSection.innerHTML = '';
    const evs = eventsOn(selected);
    eventsSection.appendChild(el('h3', { id: 'evDateLabel', style: 'margin-top: var(--sp-5);' },
      `${selected.getFullYear()}年${selected.getMonth()+1}月${selected.getDate()}日 の予定`));
    if (!evs.length) {
      eventsSection.appendChild(el('p', { class: 'task-meta' }, '予定はありません'));
      return;
    }
    const ul = el('ul', { class: 'cal-event-list', role: 'list' });
    for (const e of evs) {
      ul.appendChild(el('li', {}, [
        el('strong', {}, e.time || '終日'),
        el('span', { style: 'flex: 1;' }, e.title),
        el('button', { class: 'btn btn-danger', onclick: async () => {
          const ok = await confirmDialog('この予定を削除しますか？');
          if (!ok) return;
          state.events = state.events.filter(x => x.id !== e.id);
          persist(); render();
        }}, '削除')
      ]));
    }
    eventsSection.appendChild(ul);
  }

  function renderForm() {
    formSection.innerHTML = '';
    const form = el('form', { class: 'cal-event-form',
      onsubmit: e => {
        e.preventDefault();
        const title = (form.elements.title.value || '').trim();
        if (!title) return;
        state.events.push({
          id: uid(),
          date: ymd(selected),
          time: form.elements.time.value || '',
          title,
          memo: form.elements.memo.value || '',
        });
        persist(); render();
        toast('予定を追加しました', 'success');
      }
    });
    form.appendChild(el('h3', {}, '予定を追加'));
    form.appendChild(el('label', {}, [
      el('span', { class: 'task-meta' }, 'タイトル'),
      el('input', { name: 'title', class: 'input', type: 'text',
        placeholder: '例: 営業会議', required: true, maxlength: 100 }),
    ]));
    form.appendChild(el('label', {}, [
      el('span', { class: 'task-meta' }, '時刻 (省略可)'),
      el('input', { name: 'time', class: 'input', type: 'time' }),
    ]));
    form.appendChild(el('label', {}, [
      el('span', { class: 'task-meta' }, 'メモ'),
      el('textarea', { name: 'memo', class: 'input', rows: '2',
        placeholder: '詳細（任意）' }),
    ]));
    form.appendChild(el('button', { type: 'submit', class: 'btn btn-primary' },
      '追加'));
    formSection.appendChild(form);
  }

  function focusForm() {
    setTimeout(() => formSection.querySelector('input[name="title"]')?.focus(), 50);
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }

  render();
  return () => {};
}

/* =========================================================
   App: Calculator (電卓)
   ========================================================= */
function mountCalculator(body, actions) {
  let formula = '';
  let result = '0';

  const calc = el('div', { class: 'calc' });
  const display = el('div', { class: 'calc-display' });
  const formulaEl = el('div', { class: 'calc-formula', 'aria-live': 'polite' });
  const resultEl = el('div', { class: 'calc-result', 'aria-live': 'polite' });
  display.append(formulaEl, resultEl);
  calc.appendChild(display);

  const grid = el('div', { class: 'calc-grid' });
  const buttons = [
    ['C', 'clear'], ['(', ''], [')', ''], ['÷', 'op'],
    ['7', ''], ['8', ''], ['9', ''], ['×', 'op'],
    ['4', ''], ['5', ''], ['6', ''], ['−', 'op'],
    ['1', ''], ['2', ''], ['3', ''], ['＋', 'op'],
    ['±', ''], ['0', ''], ['.', ''], ['⌫', ''],
    ['=', 'eq'],
  ];

  for (const [label, kind] of buttons) {
    const b = el('button', { class: `calc-btn ${kind}`, type: 'button',
      'aria-label': labelToAria(label) }, label);
    b.addEventListener('click', () => press(label));
    if (label === '=') b.classList.add('eq');
    grid.appendChild(b);
  }
  calc.appendChild(grid);
  body.appendChild(calc);

  function labelToAria(l) {
    return ({ 'C': 'クリア', '⌫': 'バックスペース', '±': '正負反転',
              '÷':'割る','×':'掛ける','−':'引く','＋':'足す','=':'計算' })[l] || l;
  }

  function press(k) {
    if (k === 'C') { formula = ''; result = '0'; }
    else if (k === '⌫') { formula = formula.slice(0, -1); }
    else if (k === '=') { compute(); }
    else if (k === '±') { formula = toggleSign(formula); }
    else { formula += k; }
    update();
  }

  function toggleSign(f) {
    // Toggle sign of last number
    const m = f.match(/(.*?)(-?\d+\.?\d*)$/);
    if (!m) return f;
    const [, head, num] = m;
    const flipped = num.startsWith('-') ? num.slice(1) : '-' + num;
    return head + flipped;
  }

  function compute() {
    if (!formula) return;
    try {
      const expr = formula.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/＋/g, '+');
      if (!/^[\d+\-*/().\s]+$/.test(expr)) { result = 'エラー'; return; }
      const val = Function('"use strict"; return (' + expr + ')')();
      if (!isFinite(val)) { result = 'エラー'; return; }
      result = formatNum(val);
      formula = result === 'エラー' ? formula : String(val);
    } catch (e) {
      result = 'エラー';
    }
  }

  function formatNum(n) {
    if (Math.abs(n) > 1e15 || (Math.abs(n) < 1e-6 && n !== 0)) return n.toExponential(6);
    return Number(n.toPrecision(12)).toLocaleString('ja-JP', { maximumFractionDigits: 10 });
  }

  function update() {
    formulaEl.textContent = formula || ' ';
    resultEl.textContent = formula && !'+-×÷＋−'.includes(formula.slice(-1)) ? preview() : result;
  }

  function preview() {
    try {
      const expr = formula.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/＋/g, '+');
      if (!/^[\d+\-*/().\s]+$/.test(expr)) return result;
      const val = Function('"use strict"; return (' + expr + ')')();
      if (!isFinite(val)) return result;
      return '= ' + formatNum(val);
    } catch { return result; }
  }

  function onKey(e) {
    if (e.target.matches('input, textarea, [contenteditable="true"]')) return;
    const k = e.key;
    if (/^[0-9.]$/.test(k)) press(k);
    else if (k === '+') press('＋');
    else if (k === '-') press('−');
    else if (k === '*') press('×');
    else if (k === '/') press('÷');
    else if (k === '(' || k === ')') press(k);
    else if (k === 'Enter' || k === '=') { e.preventDefault(); press('='); }
    else if (k === 'Backspace') press('⌫');
    else if (k.toLowerCase() === 'c') press('C');
    else return;
  }
  document.addEventListener('keydown', onKey);
  update();

  return () => document.removeEventListener('keydown', onKey);
}

/* =========================================================
   App: Contacts (連絡先)
   ========================================================= */
function mountContacts(body, actions) {
  let current = state.contacts[0]?.id || null;
  let editing = false;

  const newBtn = el('button', { class: 'btn btn-primary',
    onclick: () => createContact() }, '＋ 新規連絡先');
  actions.appendChild(newBtn);

  const search = el('input', { class: 'input', type: 'search',
    placeholder: '🔍 名前・会社で検索', 'aria-label': '連絡先を検索' });
  body.appendChild(search);

  const layout = el('div', { class: 'contacts-layout', style: 'margin-top: var(--sp-3);' });
  const listEl = el('ul', { class: 'contact-list', role: 'list', 'aria-label': '連絡先一覧' });
  const detail = el('div');
  layout.append(listEl, detail);
  body.appendChild(layout);

  function createContact() {
    const c = { id: uid(), name: '新しい連絡先', company: '', phone: '', email: '', address: '', memo: '' };
    state.contacts.unshift(c);
    current = c.id; editing = true;
    persist(); renderList(); renderDetail();
    setStatus('連絡先を作成しました');
  }

  function renderList() {
    listEl.innerHTML = '';
    const q = (search.value || '').toLowerCase();
    const filtered = state.contacts
      .filter(c => !q || `${c.name} ${c.company}`.toLowerCase().includes(q))
      .sort((a,b) => (a.name||'').localeCompare(b.name||'', 'ja'));
    if (!filtered.length) {
      listEl.appendChild(el('li', { class: 'empty-state' }, [
        el('div', { class: 'icon' }, '👥'),
        el('p', {}, q ? '該当なし' : '連絡先はありません'),
      ]));
      return;
    }
    for (const c of filtered) {
      const initial = (c.name || '?').charAt(0);
      const item = el('button', {
        class: 'contact-item' + (c.id === current ? ' active' : ''),
        onclick: () => { current = c.id; editing = false; renderList(); renderDetail(); }
      }, [
        el('span', { class: 'contact-avatar' }, initial),
        el('span', { style: 'flex: 1;' }, [
          el('span', { class: 'contact-name' }, c.name || '無題'),
          el('br'),
          el('span', { class: 'contact-sub' }, c.company || c.phone || ''),
        ]),
      ]);
      listEl.appendChild(el('li', {}, item));
    }
  }

  function renderDetail() {
    detail.innerHTML = '';
    const c = state.contacts.find(x => x.id === current);
    if (!c) {
      detail.appendChild(el('div', { class: 'empty-state' }, [
        el('div', { class: 'icon' }, '👤'),
        el('p', {}, '左から連絡先を選んでください'),
      ]));
      return;
    }
    if (!editing) {
      const card = el('div', { class: 'contact-form' });
      card.appendChild(el('h3', { style: 'margin: 0' }, c.name || '無題'));
      if (c.company) card.appendChild(el('p', {}, c.company));
      if (c.phone) card.appendChild(el('p', {}, [el('strong', {}, '電話: '),
        el('a', { href: `tel:${c.phone}` }, c.phone)]));
      if (c.email) card.appendChild(el('p', {}, [el('strong', {}, 'メール: '),
        el('a', { href: `mailto:${c.email}` }, c.email)]));
      if (c.address) card.appendChild(el('p', {}, [el('strong', {}, '住所: '), c.address]));
      if (c.memo) card.appendChild(el('p', {}, [el('strong', {}, 'メモ: '), c.memo]));

      const row = el('div', { class: 'row', style: 'margin-top: var(--sp-3)' });
      row.append(
        el('button', { class: 'btn btn-primary',
          onclick: () => { editing = true; renderDetail(); }}, '✏️ 編集'),
        el('button', { class: 'btn btn-danger',
          onclick: async () => {
            const ok = await confirmDialog(`「${c.name}」を削除しますか？`);
            if (!ok) return;
            state.contacts = state.contacts.filter(x => x.id !== c.id);
            current = state.contacts[0]?.id || null;
            persist(); renderList(); renderDetail();
            setStatus('連絡先を削除しました');
          }}, '🗑 削除'),
      );
      card.appendChild(row);
      detail.appendChild(card);
      return;
    }
    const form = el('form', { class: 'contact-form', onsubmit: e => { e.preventDefault(); save(); }});
    const fields = [
      { k: 'name', label: '名前', required: true, type: 'text' },
      { k: 'company', label: '会社', type: 'text' },
      { k: 'phone', label: '電話番号', type: 'tel' },
      { k: 'email', label: 'メール', type: 'email' },
      { k: 'address', label: '住所', type: 'text' },
      { k: 'memo', label: 'メモ', type: 'textarea' },
    ];
    for (const f of fields) {
      const lbl = el('label', {}, [
        el('span', {}, [
          f.label, f.required ? el('small', { style: 'color: var(--c-danger);' }, '必須') : null
        ]),
        f.type === 'textarea'
          ? el('textarea', { class: 'input', name: f.k, rows: '2' }, c[f.k] || '')
          : el('input', { class: 'input', name: f.k, type: f.type,
              required: f.required || false, value: c[f.k] || '' }),
      ]);
      form.appendChild(lbl);
    }
    const row = el('div', { class: 'row', style: 'margin-top: var(--sp-3)' });
    row.append(
      el('button', { type: 'submit', class: 'btn btn-primary' }, '💾 保存'),
      el('button', { type: 'button', class: 'btn',
        onclick: () => { editing = false; renderDetail(); }}, 'キャンセル'),
    );
    form.appendChild(row);
    detail.appendChild(form);

    function save() {
      const data = Object.fromEntries(new FormData(form).entries());
      Object.assign(c, data);
      editing = false;
      persist(); renderList(); renderDetail();
      toast('保存しました', 'success');
    }
    setTimeout(() => form.querySelector('input')?.focus(), 50);
  }

  search.addEventListener('input', renderList);

  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault(); createContact();
    }
  }
  document.addEventListener('keydown', onKey);

  renderList(); renderDetail();
  return () => document.removeEventListener('keydown', onKey);
}

/* =========================================================
   App: Timer (タイマー / ストップウォッチ)
   ========================================================= */
function mountTimer(body, actions) {
  let mode = 'timer'; // or 'stopwatch'
  let timerSec = 5 * 60;
  let timerRemainMs = timerSec * 1000;
  let stopwatchMs = 0;
  let startedAt = 0;
  let running = false;
  let raf = null;

  const wrap = el('div', { class: 'timer-wrap' });
  const modeSwitch = el('div', { class: 'timer-mode', role: 'tablist' });
  const tabTimer = el('button', { class: 'active', role: 'tab',
    onclick: () => switchMode('timer') }, '⏲ タイマー');
  const tabSW = el('button', { role: 'tab',
    onclick: () => switchMode('stopwatch') }, '⏱ ストップウォッチ');
  modeSwitch.append(tabTimer, tabSW);
  wrap.appendChild(modeSwitch);

  const display = el('div', { class: 'timer-display', 'aria-live': 'polite', role: 'timer' });
  wrap.appendChild(display);

  const controls = el('div', { class: 'timer-controls' });
  const startBtn = el('button', { class: 'btn btn-primary btn-large' }, '▶ 開始');
  const resetBtn = el('button', { class: 'btn btn-large' }, '⏹ リセット');
  startBtn.addEventListener('click', toggle);
  resetBtn.addEventListener('click', reset);
  controls.append(startBtn, resetBtn);
  wrap.appendChild(controls);

  const presetWrap = el('div', { class: 'timer-presets' });
  for (const m of [1, 3, 5, 10, 15, 30]) {
    presetWrap.appendChild(el('button', { class: 'btn',
      onclick: () => { timerSec = m * 60; timerRemainMs = timerSec * 1000; reset(); }
    }, `${m}分`));
  }
  wrap.appendChild(presetWrap);

  body.appendChild(wrap);

  function switchMode(m) {
    if (running) stop();
    mode = m;
    tabTimer.classList.toggle('active', m === 'timer');
    tabSW.classList.toggle('active', m === 'stopwatch');
    presetWrap.style.display = m === 'timer' ? '' : 'none';
    reset();
  }

  function format(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const mi = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const cs = Math.floor((Math.max(0, ms) % 1000) / 10);
    if (mode === 'stopwatch') {
      return h > 0
        ? `${h}:${String(mi).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`
        : `${mi}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
    }
    return h > 0
      ? `${h}:${String(mi).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${String(mi).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function tick() {
    if (!running) return;
    const now = performance.now();
    if (mode === 'timer') {
      const remaining = timerRemainMs - (now - startedAt);
      display.textContent = format(remaining);
      if (remaining <= 0) {
        running = false;
        timerRemainMs = 0;
        display.textContent = format(0);
        startBtn.textContent = '▶ 開始';
        notifyDone();
        return;
      }
    } else {
      const elapsed = stopwatchMs + (now - startedAt);
      display.textContent = format(elapsed);
    }
    raf = requestAnimationFrame(tick);
  }

  function toggle() {
    if (running) stop();
    else start();
  }
  function start() {
    if (mode === 'timer' && timerRemainMs <= 0) timerRemainMs = timerSec * 1000;
    running = true;
    startedAt = performance.now();
    startBtn.textContent = '⏸ 一時停止';
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    if (!running) return;
    running = false;
    const now = performance.now();
    if (mode === 'timer') timerRemainMs -= (now - startedAt);
    else stopwatchMs += (now - startedAt);
    startBtn.textContent = '▶ 開始';
    cancelAnimationFrame(raf);
  }
  function reset() {
    running = false;
    cancelAnimationFrame(raf);
    if (mode === 'timer') {
      timerRemainMs = timerSec * 1000;
    } else {
      stopwatchMs = 0;
    }
    display.textContent = format(mode === 'timer' ? timerRemainMs : 0);
    startBtn.textContent = '▶ 開始';
  }

  function notifyDone() {
    toast('時間になりました', 'success');
    try {
      // Soft beep using WebAudio
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.value = 0.1;
      o.connect(g).connect(ac.destination);
      o.start();
      setTimeout(() => { o.stop(); ac.close(); }, 500);
    } catch {}
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  }

  display.textContent = format(timerRemainMs);

  return () => { running = false; cancelAnimationFrame(raf); };
}

/* =========================================================
   Boot
   ========================================================= */
function boot() {
  applySettings();
  updateClock();
  renderHome();
  maybeShowOnboarding();

  // Resolve initial route
  const m = location.hash.match(/^#\/(\w+)$/);
  if (m) openApp(m[1]);

  // Register service worker (best-effort)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();

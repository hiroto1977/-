/* =========================================================
   v19 Dashboard — dashboard.js
   ハッシュルーター + 連携サービス管理 + Claude 連携
   ========================================================= */

// ---------- Storage ----------
const STORAGE_KEY = 'v19-dashboard-v1';
const DEFAULT_DATA = {
  settings: { theme: 'light' },
  claude: {
    apiKey: '',
    model: 'claude-opus-4-7',
    maxTokens: 4096,
    systemPrompt: '',
    rememberKey: true,
    history: [], // [{role: 'user'|'assistant', content: string}]
  },
};

const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_DATA);
      const parsed = JSON.parse(raw);
      return deepMerge(structuredClone(DEFAULT_DATA), parsed);
    } catch (e) {
      console.error('storage load failed', e);
      return structuredClone(DEFAULT_DATA);
    }
  },
  save(data) {
    // If "remember key" is off, don't persist the API key
    const toPersist = structuredClone(data);
    if (!toPersist.claude.rememberKey) toPersist.claude.apiKey = '';
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist)); }
    catch (e) { toast('保存に失敗しました（容量不足の可能性）', 'error'); }
  },
  reset() { localStorage.removeItem(STORAGE_KEY); },
};

function deepMerge(target, src) {
  for (const k of Object.keys(src || {})) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object') {
      target[k] = deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

const state = Storage.load();
const persist = debounce(() => Storage.save(state), 200);

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------- Toast ----------
function toast(message, kind = 'info', timeout = 3000) {
  const region = document.getElementById('toastRegion');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => el.remove(), timeout);
}

// ---------- Confirm ----------
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

// ---------- Integrations registry ----------
const INTEGRATIONS = [
  {
    id: 'claude',
    name: 'Claude AI',
    sub: 'Anthropic 社の対話 AI',
    icon: '🤖',
    iconClass: 'claude',
    desc: 'Claude API と直接連携してチャットや要約・翻訳・コード生成などができます。',
    route: 'integration-claude',
  },
];

// ---------- Theme ----------
function applyTheme() {
  document.body.dataset.theme = state.settings.theme;
  document.querySelectorAll('input[name="theme"]').forEach(r => {
    r.checked = (r.value === state.settings.theme);
  });
}

document.querySelectorAll('input[name="theme"]').forEach(r =>
  r.addEventListener('change', () => {
    state.settings.theme = r.value; applyTheme(); persist();
  }));

document.getElementById('themeBtn').addEventListener('click', () => {
  const order = ['light', 'dark', 'contrast'];
  const i = order.indexOf(state.settings.theme);
  state.settings.theme = order[(i + 1) % order.length];
  applyTheme(); persist();
});

// ---------- Sidebar ----------
function renderSidebar() {
  const list = document.getElementById('integrationList');
  list.innerHTML = '';
  for (const integ of INTEGRATIONS) {
    const li = document.createElement('li');
    const btn = document.createElement('a');
    btn.className = 'integration-link';
    btn.href = `#${integ.route}`;
    btn.dataset.route = integ.route;
    btn.innerHTML = `
      <span class="integration-icon ${integ.iconClass}" aria-hidden="true">${integ.icon}</span>
      <span class="integration-meta">
        <span class="integration-name">${escapeHtml(integ.name)}</span>
        <span class="integration-sub">${escapeHtml(integ.sub)}</span>
      </span>
    `;
    li.appendChild(btn);
    list.appendChild(li);
  }
}

// ---------- Overview ----------
function renderOverview() {
  const cards = document.getElementById('overviewCards');
  cards.innerHTML = '';
  for (const integ of INTEGRATIONS) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'card-tile';
    a.href = `#${integ.route}`;
    a.innerHTML = `
      <h3>${escapeHtml(integ.name)}</h3>
      <p class="desc">${escapeHtml(integ.desc)}</p>
    `;
    li.appendChild(a);
    cards.appendChild(li);
  }
  document.getElementById('integrationsGrid').innerHTML = cards.innerHTML;
}

// ---------- Router ----------
const ROUTES = ['overview', 'integrations', 'settings', 'integration-claude'];
function currentRoute() {
  const hash = (location.hash || '#overview').replace(/^#/, '');
  return ROUTES.includes(hash) ? hash : '404';
}
function navigate() {
  const route = currentRoute();
  // Show/hide sections
  document.querySelectorAll('.route').forEach(s => {
    s.hidden = s.dataset.route !== route;
  });
  // Update top nav
  document.querySelectorAll('.topnav a').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route ||
      (a.dataset.route === 'integrations' && route === 'integration-claude'));
  });
  // Update sidebar
  document.querySelectorAll('.integration-link').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route);
  });
  // Focus content for screen readers
  document.getElementById('content').focus({ preventScroll: false });
  document.getElementById('content').scrollTop = 0;
}
window.addEventListener('hashchange', navigate);

// ---------- Status pill ----------
function setGlobalStatus(state, text) {
  const pill = document.getElementById('statusPill');
  pill.querySelector('.status-dot').dataset.state = state;
  pill.querySelector('.status-text').textContent = text;
}

// ---------- Settings actions ----------
document.getElementById('exportAllBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `v19-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('書き出しました', 'success');
});

document.getElementById('resetAllBtn').addEventListener('click', async () => {
  const ok = await confirmDialog(
    'API キー、チャット履歴を含むすべてのデータを削除します。よろしいですか？',
    '全データ削除',
  );
  if (!ok) return;
  Storage.reset();
  Object.assign(state, structuredClone(DEFAULT_DATA));
  applyTheme();
  initClaudeUI();
  toast('全データを削除しました', 'success');
});

// ---------- HTML utils ----------
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

/* =========================================================
   Anthropic (Claude) client — browser-direct
   ========================================================= */
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

class AnthropicError extends Error {
  constructor(message, { status, type } = {}) {
    super(message);
    this.status = status;
    this.type = type;
  }
}

/**
 * Send a streaming Messages request to Claude.
 *
 * @param {object}   opts
 * @param {string}   opts.apiKey
 * @param {string}   opts.model
 * @param {number}   opts.maxTokens
 * @param {string}   [opts.system]
 * @param {Array<{role:string, content:string}>} opts.messages
 * @param {AbortSignal} [opts.signal]
 * @param {(text:string) => void} [opts.onText]   — called for each text delta
 * @param {(usage:object) => void} [opts.onUsage] — called once with final usage
 * @returns {Promise<{text:string, usage:object|null}>}
 */
async function claudeStream({ apiKey, model, maxTokens, system, messages, signal, onText, onUsage }) {
  if (!apiKey) throw new AnthropicError('API キーが設定されていません');
  if (!messages?.length) throw new AnthropicError('メッセージが空です');

  const body = {
    model,
    max_tokens: maxTokens,
    messages,
    stream: true,
  };
  if (system && system.trim()) body.system = system;

  let res;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new AnthropicError(`接続エラー: ${err.message}（CORS / ネットワーク制限の可能性）`);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || JSON.stringify(errBody);
    } catch { /* non-JSON */ }
    const map = {
      400: 'リクエスト不正',
      401: 'API キーが無効です',
      403: 'アクセス権限がありません',
      404: 'モデルが見つかりません',
      413: 'リクエストが大きすぎます',
      429: 'レート制限に達しました。少し待ってから再試行してください',
      500: 'Anthropic 側のエラーです。少し待って再試行してください',
      529: 'API が混雑しています。少し待って再試行してください',
    };
    throw new AnthropicError(
      `${map[res.status] || `HTTP ${res.status}`}${detail ? ` — ${detail}` : ''}`,
      { status: res.status },
    );
  }

  if (!res.body) throw new AnthropicError('ストリーミング応答がサポートされていません');

  // Parse SSE
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let usage = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let evt;
      try { evt = JSON.parse(payload); } catch { continue; }

      if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
        fullText += evt.delta.text;
        onText?.(evt.delta.text);
      } else if (evt.type === 'message_delta' && evt.usage) {
        usage = evt.usage;
      } else if (evt.type === 'message_start' && evt.message?.usage) {
        usage = { ...evt.message.usage, ...(usage || {}) };
      } else if (evt.type === 'error') {
        throw new AnthropicError(evt.error?.message || 'API エラー', { type: evt.error?.type });
      }
    }
  }

  onUsage?.(usage);
  return { text: fullText, usage };
}

/* =========================================================
   Claude integration UI
   ========================================================= */
let abortCtrl = null;

function initClaudeUI() {
  const c = state.claude;

  const apiKeyInput = document.getElementById('apiKeyInput');
  const modelSelect = document.getElementById('modelSelect');
  const maxTokensInput = document.getElementById('maxTokensInput');
  const systemPromptInput = document.getElementById('systemPromptInput');
  const rememberKey = document.getElementById('rememberKey');

  apiKeyInput.value = c.apiKey || '';
  modelSelect.value = c.model;
  maxTokensInput.value = c.maxTokens;
  systemPromptInput.value = c.systemPrompt || '';
  rememberKey.checked = c.rememberKey !== false;

  updateClaudeStatus(c.apiKey ? 'unknown' : 'unknown',
    c.apiKey ? 'キー設定済み（未テスト）' : 'API キーが未設定');

  renderChat();
}

function updateClaudeStatus(stateName, text) {
  document.getElementById('claudeStatusDot').dataset.state = stateName;
  document.getElementById('claudeStatusText').textContent = text;
  setGlobalStatus(stateName, `Claude: ${text}`);
}

function bindClaudeUI() {
  const apiKeyInput = document.getElementById('apiKeyInput');
  const modelSelect = document.getElementById('modelSelect');
  const maxTokensInput = document.getElementById('maxTokensInput');
  const systemPromptInput = document.getElementById('systemPromptInput');
  const rememberKey = document.getElementById('rememberKey');
  const toggleKeyBtn = document.getElementById('toggleKeyBtn');
  const saveBtn = document.getElementById('saveConfigBtn');
  const testBtn = document.getElementById('testConnBtn');
  const clearKeyBtn = document.getElementById('clearKeyBtn');

  toggleKeyBtn.addEventListener('click', () => {
    const t = apiKeyInput.type === 'password' ? 'text' : 'password';
    apiKeyInput.type = t;
    toggleKeyBtn.textContent = t === 'password' ? '表示' : '隠す';
  });

  function captureForm() {
    state.claude.apiKey = apiKeyInput.value.trim();
    state.claude.model = modelSelect.value;
    state.claude.maxTokens = Math.max(64, Math.min(64000, parseInt(maxTokensInput.value, 10) || 4096));
    state.claude.systemPrompt = systemPromptInput.value;
    state.claude.rememberKey = rememberKey.checked;
  }

  saveBtn.addEventListener('click', () => {
    captureForm();
    persist();
    if (state.claude.apiKey) {
      updateClaudeStatus('unknown', 'キー設定済み（未テスト）');
    } else {
      updateClaudeStatus('unknown', 'API キーが未設定');
    }
    toast('設定を保存しました', 'success');
  });

  testBtn.addEventListener('click', async () => {
    captureForm();
    persist();
    if (!state.claude.apiKey) {
      updateClaudeStatus('error', 'API キーが未設定');
      toast('API キーを入力してください', 'error');
      return;
    }
    updateClaudeStatus('loading', '接続テスト中…');
    testBtn.disabled = true;
    try {
      const { text } = await claudeStream({
        apiKey: state.claude.apiKey,
        model: state.claude.model,
        maxTokens: 64,
        messages: [{ role: 'user', content: 'こんにちは。短く 1 文で挨拶してください。' }],
      });
      updateClaudeStatus('ok', `接続成功（${state.claude.model}）`);
      toast(`接続OK: ${text.slice(0, 60)}`, 'success', 4000);
    } catch (err) {
      updateClaudeStatus('error', err.message || '接続失敗');
      toast(`接続失敗: ${err.message}`, 'error', 5000);
    } finally {
      testBtn.disabled = false;
    }
  });

  clearKeyBtn.addEventListener('click', async () => {
    const ok = await confirmDialog('保存されている API キーを削除しますか？');
    if (!ok) return;
    state.claude.apiKey = '';
    apiKeyInput.value = '';
    persist();
    updateClaudeStatus('unknown', 'API キーが未設定');
    toast('API キーを削除しました', 'success');
  });

  // Chat
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const stopBtn = document.getElementById('stopBtn');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const exportChatBtn = document.getElementById('exportChatBtn');
  const charCount = document.getElementById('charCount');

  chatInput.addEventListener('input', () => {
    charCount.textContent = `${chatInput.value.length} 文字`;
  });
  chatInput.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault(); chatForm.requestSubmit();
    }
  });

  chatForm.addEventListener('submit', async e => {
    e.preventDefault();
    captureForm();
    const text = chatInput.value.trim();
    if (!text) return;
    if (!state.claude.apiKey) {
      toast('先に API キーを設定してください', 'error');
      return;
    }

    state.claude.history.push({ role: 'user', content: text });
    chatInput.value = '';
    charCount.textContent = '0 文字';
    persist();
    renderChat();

    // Add empty assistant placeholder
    const assistantMsg = { role: 'assistant', content: '' };
    state.claude.history.push(assistantMsg);
    const assistantEl = renderChat({ streamingIndex: state.claude.history.length - 1 });

    sendBtn.disabled = true;
    stopBtn.hidden = false;
    abortCtrl = new AbortController();
    updateClaudeStatus('loading', '応答生成中…');

    try {
      const { usage } = await claudeStream({
        apiKey: state.claude.apiKey,
        model: state.claude.model,
        maxTokens: state.claude.maxTokens,
        system: state.claude.systemPrompt,
        // Send full history (excluding the empty assistant placeholder we just added)
        messages: state.claude.history.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
        signal: abortCtrl.signal,
        onText: (delta) => {
          assistantMsg.content += delta;
          if (assistantEl) {
            assistantEl.querySelector('.msg-body').textContent = assistantMsg.content;
            scrollChatToBottom();
          }
        },
      });
      persist();
      updateClaudeStatus('ok', `完了（${state.claude.model}）`);
      if (usage) {
        document.getElementById('usageInfo').textContent =
          `入力: ${usage.input_tokens ?? '-'} / 出力: ${usage.output_tokens ?? '-'} トークン`;
      }
      renderChat();
    } catch (err) {
      if (err.name === 'AbortError') {
        assistantMsg.content += '\n\n[ 停止しました ]';
        updateClaudeStatus('unknown', '停止');
      } else {
        // Convert the placeholder into an error message
        state.claude.history.pop(); // remove empty assistant
        state.claude.history.push({ role: 'assistant', content: `エラー: ${err.message}`, error: true });
        updateClaudeStatus('error', err.message);
        toast(err.message, 'error', 5000);
      }
      persist();
      renderChat();
    } finally {
      sendBtn.disabled = false;
      stopBtn.hidden = true;
      abortCtrl = null;
    }
  });

  stopBtn.addEventListener('click', () => {
    abortCtrl?.abort();
  });

  clearChatBtn.addEventListener('click', async () => {
    if (!state.claude.history.length) return;
    const ok = await confirmDialog('チャット履歴をすべて削除しますか？');
    if (!ok) return;
    state.claude.history = [];
    persist();
    renderChat();
    document.getElementById('usageInfo').textContent = 'トークン: -';
    toast('履歴を削除しました', 'success');
  });

  exportChatBtn.addEventListener('click', () => {
    if (!state.claude.history.length) {
      toast('書き出すメッセージがありません', 'error');
      return;
    }
    const md = state.claude.history.map(m => {
      const label = m.role === 'user' ? '## ユーザー' : '## Claude';
      return `${label}\n\n${m.content}\n`;
    }).join('\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claude-chat-${new Date().toISOString().slice(0,10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast('書き出しました', 'success');
  });
}

function renderChat({ streamingIndex } = {}) {
  const log = document.getElementById('chatLog');
  const history = state.claude.history;
  log.innerHTML = '';
  if (!history.length) {
    log.innerHTML = `
      <div class="empty">
        <span class="empty-icon" aria-hidden="true">💬</span>
        <p>ここにやりとりが表示されます。下の欄から最初のメッセージを送ってください。</p>
      </div>
    `;
    return null;
  }
  let lastEl = null;
  history.forEach((m, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + m.role + (m.error ? ' error' : '');
    const role = document.createElement('div');
    role.className = 'msg-role';
    role.textContent = m.role === 'user' ? 'あなた' : 'Claude';
    const body = document.createElement('div');
    body.className = 'msg-body';
    body.textContent = m.content || (i === streamingIndex ? '' : '');
    if (i === streamingIndex && !m.content) {
      const typing = document.createElement('span');
      typing.className = 'typing';
      body.appendChild(typing);
    }
    wrap.append(role, body);
    log.appendChild(wrap);
    if (i === streamingIndex) lastEl = wrap;
  });
  scrollChatToBottom();
  return lastEl;
}

function scrollChatToBottom() {
  const log = document.getElementById('chatLog');
  log.scrollTop = log.scrollHeight;
}

/* =========================================================
   Boot
   ========================================================= */
function boot() {
  applyTheme();
  renderSidebar();
  renderOverview();
  initClaudeUI();
  bindClaudeUI();

  // Default to overview if no hash
  if (!location.hash) location.hash = '#overview';
  navigate();

  setGlobalStatus('unknown', '待機中');
}

boot();

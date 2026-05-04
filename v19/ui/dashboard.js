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
    sessions: [], // [{id, title, autoTitle, createdAt, updatedAt, history:[{role,content,error?}]}]
    activeSessionId: null,
  },
};

const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_DATA);
      const parsed = JSON.parse(raw);
      const merged = deepMerge(structuredClone(DEFAULT_DATA), parsed);
      // Migration: legacy single `history` array → wrap as a single session
      if (Array.isArray(parsed?.claude?.history) && parsed.claude.history.length
          && (!merged.claude.sessions || !merged.claude.sessions.length)) {
        merged.claude.sessions = [makeSession({ history: parsed.claude.history,
          title: deriveTitleFromHistory(parsed.claude.history), autoTitle: true })];
        merged.claude.activeSessionId = merged.claude.sessions[0].id;
      }
      delete merged.claude.history;
      return merged;
    } catch (e) {
      console.error('storage load failed', e);
      return structuredClone(DEFAULT_DATA);
    }
  },
  save(data) {
    const toPersist = structuredClone(data);
    if (!toPersist.claude.rememberKey) toPersist.claude.apiKey = '';
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist)); }
    catch (e) { toast('保存に失敗しました（容量不足の可能性）', 'error'); }
  },
  reset() { localStorage.removeItem(STORAGE_KEY); },
};

function makeSession({ id, title, autoTitle = true, history = [] } = {}) {
  const now = Date.now();
  return {
    id: id || ('sess_' + now.toString(36) + Math.random().toString(36).slice(2, 6)),
    title: title || '新しい会話',
    autoTitle,
    createdAt: now,
    updatedAt: now,
    history,
  };
}
function deriveTitleFromHistory(history) {
  const first = history.find(m => m.role === 'user');
  if (!first) return '新しい会話';
  return first.content.replace(/\s+/g, ' ').trim().slice(0, 30) || '新しい会話';
}
function getActiveSession() {
  let s = state.claude.sessions.find(x => x.id === state.claude.activeSessionId);
  if (!s) {
    s = state.claude.sessions[0];
    if (!s) {
      s = makeSession();
      state.claude.sessions.push(s);
    }
    state.claude.activeSessionId = s.id;
  }
  return s;
}
function ensureSessions() {
  if (!state.claude.sessions || !state.claude.sessions.length) {
    const s = makeSession();
    state.claude.sessions = [s];
    state.claude.activeSessionId = s.id;
  } else if (!state.claude.sessions.find(x => x.id === state.claude.activeSessionId)) {
    state.claude.activeSessionId = state.claude.sessions[0].id;
  }
}

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
  ensureSessions();
  applyTheme();
  initClaudeUI();
  renderSessionTabs();
  toast('全データを削除しました', 'success');
});

// ---------- HTML utils ----------
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

// ---------- Tiny safe Markdown renderer ----------
// Subset: fenced code blocks, inline code, bold, italic, headings,
// bullet/numbered lists, blockquotes, links, paragraphs.
// Strategy: stash code spans -> escape -> apply line/inline rules -> restore code.
function renderMarkdown(src) {
  const placeholders = [];
  const blockKinds = []; // parallel: true if the placeholder is a block element
  const stash = (html, isBlock = false) => {
    const k = `\x00MD${placeholders.length}\x00`;
    placeholders.push(html);
    blockKinds.push(isBlock);
    return k;
  };

  let s = String(src ?? '');

  // 1. Fenced code blocks (block-level)
  s = s.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langCls = (lang || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
    const escaped = escapeHtml(code.replace(/\n$/, ''));
    return stash(
      `<pre class="md-pre" data-lang="${langCls}"><button type="button" class="md-copy" aria-label="コピー">コピー</button><code class="md-code">${escaped}</code></pre>`,
      true,
    );
  });

  // 2. Inline code (inline-level)
  s = s.replace(/`([^`\n]+)`/g, (_, c) =>
    stash(`<code class="md-inline">${escapeHtml(c)}</code>`, false));

  // 3. Escape remaining text — anything outside code is now safe to mark up
  s = escapeHtml(s);

  // 4. Block-level rules (line-based)
  const lines = s.split('\n');
  const out = [];
  let listType = null;
  let para = [];

  const flushPara = () => {
    if (para.length) { out.push(`<p class="md-p">${para.join(' ')}</p>`); para = []; }
  };
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  const blockPhMatch = (line) => {
    const m = line.trim().match(/^\x00MD(\d+)\x00$/);
    return (m && blockKinds[+m[1]]) ? placeholders[+m[1]] : null;
  };

  for (const line of lines) {
    // A line that is purely a block-level placeholder (e.g. fenced code) is itself a block.
    const blockPh = blockPhMatch(line);
    if (blockPh) {
      flushPara(); closeList();
      out.push(blockPh);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      flushPara(); closeList();
      const lvl = h[1].length;
      out.push(`<h${lvl + 2} class="md-h">${h[2]}</h${lvl + 2}>`);
      continue;
    }
    const bq = line.match(/^&gt;\s?(.*)$/);
    if (bq) {
      flushPara(); closeList();
      out.push(`<blockquote class="md-bq">${bq[1]}</blockquote>`);
      continue;
    }
    const ul = line.match(/^[*-]\s+(.+)$/);
    if (ul) {
      flushPara();
      if (listType !== 'ul') { closeList(); out.push('<ul class="md-ul">'); listType = 'ul'; }
      out.push(`<li>${ul[1]}</li>`);
      continue;
    }
    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      flushPara();
      if (listType !== 'ol') { closeList(); out.push('<ol class="md-ol">'); listType = 'ol'; }
      out.push(`<li>${ol[1]}</li>`);
      continue;
    }
    if (!line.trim()) {
      flushPara(); closeList();
      continue;
    }
    closeList();
    para.push(line);
  }
  flushPara(); closeList();
  s = out.join('\n');

  // 5. Inline rules (bold, italic, links)
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text, url) => {
    const safeUrl = escapeHtml(url);
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  // 6. Restore inline placeholders (block ones were emitted directly above)
  s = s.replace(/\x00MD(\d+)\x00/g, (_, i) => placeholders[+i]);

  return s;
}

// Wire up "copy" buttons inside a rendered markdown container.
function activateCopyButtons(container) {
  container.querySelectorAll('.md-copy').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      const code = btn.parentElement?.querySelector('code')?.innerText ?? '';
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = 'コピー済み';
        setTimeout(() => { btn.textContent = 'コピー'; }, 1500);
      } catch {
        toast('クリップボードに書き込めませんでした', 'error');
      }
    });
  });
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
        // Merge: message_start carries input_tokens, message_delta carries output_tokens
        usage = { ...(usage || {}), ...evt.usage };
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

    const session = getActiveSession();
    session.history.push({ role: 'user', content: text });
    session.updatedAt = Date.now();
    // Auto-title from first user message if user hasn't renamed yet
    if (session.autoTitle) {
      session.title = deriveTitleFromHistory(session.history);
    }
    chatInput.value = '';
    charCount.textContent = '0 文字';
    persist();
    renderSessionTabs();
    renderChat();

    const assistantMsg = { role: 'assistant', content: '' };
    session.history.push(assistantMsg);
    const assistantEl = renderChat({ streamingIndex: session.history.length - 1 });

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
        messages: session.history.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
        signal: abortCtrl.signal,
        onText: (delta) => {
          assistantMsg.content += delta;
          if (assistantEl) {
            const body = assistantEl.querySelector('.msg-body');
            body.innerHTML = renderMarkdown(assistantMsg.content);
            activateCopyButtons(body);
            scrollChatToBottom();
          }
        },
      });
      session.updatedAt = Date.now();
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
        session.history.pop();
        session.history.push({ role: 'assistant', content: `エラー: ${err.message}`, error: true });
        updateClaudeStatus('error', err.message);
        toast(err.message, 'error', 5000);
      }
      session.updatedAt = Date.now();
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
    const session = getActiveSession();
    if (!session.history.length) return;
    const ok = await confirmDialog('この会話のメッセージをすべて削除しますか？（タブ自体は残ります）');
    if (!ok) return;
    session.history = [];
    session.autoTitle = true;
    session.title = '新しい会話';
    session.updatedAt = Date.now();
    persist();
    renderSessionTabs();
    renderChat();
    document.getElementById('usageInfo').textContent = 'トークン: -';
    toast('この会話を消去しました', 'success');
  });

  exportChatBtn.addEventListener('click', () => {
    const session = getActiveSession();
    if (!session.history.length) {
      toast('書き出すメッセージがありません', 'error');
      return;
    }
    const header = `# ${session.title}\n\n`;
    const md = header + session.history.map(m => {
      const label = m.role === 'user' ? '## ユーザー' : '## Claude';
      return `${label}\n\n${m.content}\n`;
    }).join('\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = session.title.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40) || 'session';
    a.download = `claude-${safeName}-${new Date().toISOString().slice(0,10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast('書き出しました', 'success');
  });

  // ----- Session tabs -----
  document.getElementById('newSessionBtn').addEventListener('click', () => {
    createSessionAndSwitch();
  });
}

function createSessionAndSwitch() {
  const s = makeSession();
  state.claude.sessions.push(s);
  state.claude.activeSessionId = s.id;
  persist();
  renderSessionTabs();
  renderChat();
  document.getElementById('usageInfo').textContent = 'トークン: -';
  document.getElementById('chatInput')?.focus();
}

async function deleteSession(id) {
  const idx = state.claude.sessions.findIndex(x => x.id === id);
  if (idx < 0) return;
  const s = state.claude.sessions[idx];
  if (s.history.length) {
    const ok = await confirmDialog(`「${s.title}」を削除しますか？（メッセージも消えます）`);
    if (!ok) return;
  }
  state.claude.sessions.splice(idx, 1);
  if (!state.claude.sessions.length) {
    const fresh = makeSession();
    state.claude.sessions.push(fresh);
    state.claude.activeSessionId = fresh.id;
  } else if (state.claude.activeSessionId === id) {
    state.claude.activeSessionId = state.claude.sessions[Math.max(0, idx - 1)].id;
  }
  persist();
  renderSessionTabs();
  renderChat();
}

function switchSession(id) {
  if (state.claude.activeSessionId === id) return;
  state.claude.activeSessionId = id;
  persist();
  renderSessionTabs();
  renderChat();
  document.getElementById('usageInfo').textContent = 'トークン: -';
}

function renameSession(id, newTitle) {
  const s = state.claude.sessions.find(x => x.id === id);
  if (!s) return;
  const t = newTitle.trim().slice(0, 60);
  s.title = t || '新しい会話';
  s.autoTitle = false;
  s.updatedAt = Date.now();
  persist();
  renderSessionTabs();
}

function renderSessionTabs() {
  const wrap = document.getElementById('sessionTabs');
  if (!wrap) return;
  // Keep the new-session button, replace tabs
  const newBtn = document.getElementById('newSessionBtn');
  wrap.innerHTML = '';
  for (const s of state.claude.sessions) {
    const tab = document.createElement('div');
    tab.className = 'session-tab' + (s.id === state.claude.activeSessionId ? ' active' : '');
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', s.id === state.claude.activeSessionId ? 'true' : 'false');
    tab.tabIndex = 0;

    const title = document.createElement('span');
    title.className = 'session-tab-title';
    title.textContent = s.title;
    title.title = `${s.title}\n（ダブルクリックで名前変更）`;

    const close = document.createElement('button');
    close.className = 'session-tab-close';
    close.type = 'button';
    close.setAttribute('aria-label', `「${s.title}」を削除`);
    close.textContent = '×';

    tab.addEventListener('click', e => {
      if (e.target === close || title.isContentEditable) return;
      switchSession(s.id);
    });
    tab.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchSession(s.id); }
    });
    title.addEventListener('dblclick', e => {
      e.stopPropagation();
      title.contentEditable = 'true';
      title.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(title);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
    });
    title.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
      if (e.key === 'Escape') { title.textContent = s.title; title.blur(); }
    });
    title.addEventListener('blur', () => {
      if (title.contentEditable === 'true') {
        title.contentEditable = 'false';
        renameSession(s.id, title.textContent);
      }
    });
    close.addEventListener('click', e => {
      e.stopPropagation();
      deleteSession(s.id);
    });

    tab.append(title, close);
    wrap.appendChild(tab);
  }
  if (newBtn) wrap.appendChild(newBtn);
}

function renderChat({ streamingIndex } = {}) {
  const log = document.getElementById('chatLog');
  const history = getActiveSession().history;
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
    if (m.role === 'assistant' && !m.error && m.content) {
      body.innerHTML = renderMarkdown(m.content);
      activateCopyButtons(body);
    } else {
      body.textContent = m.content || (i === streamingIndex ? '' : '');
    }
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
  ensureSessions();
  applyTheme();
  renderSidebar();
  renderOverview();
  initClaudeUI();
  bindClaudeUI();
  renderSessionTabs();

  // Default to overview if no hash
  if (!location.hash) location.hash = '#overview';
  navigate();

  setGlobalStatus('unknown', '待機中');
}

boot();

/* =========================================================
   v19 Dashboard — dashboard.js
   ハッシュルーター + 連携サービス管理 + Claude 連携
   ========================================================= */

// ---------- Storage ----------
const STORAGE_KEY = 'v19-dashboard-v1';
const DEFAULT_DATA = {
  settings: { theme: 'light', localOnly: false },
  chat: {
    activeProviderId: 'ollama',
    sessions: [], // [{id, title, autoTitle, presetId, systemPrompt, createdAt, updatedAt, history}]
    activeSessionId: null,
  },
  providers: {
    ollama:    { apiKey: 'http://localhost:11434', model: 'llama3.2',          maxTokens: 4096, rememberKey: true },
    anthropic: { apiKey: '',                       model: 'claude-opus-4-7',   maxTokens: 4096, rememberKey: true },
    google:    { apiKey: '',                       model: 'gemini-2.5-flash',  maxTokens: 4096, rememberKey: true },
  },
};

const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_DATA);
      const parsed = JSON.parse(raw);
      const merged = deepMerge(structuredClone(DEFAULT_DATA), parsed);

      // Migration from legacy state.claude.* → state.chat + state.providers.anthropic
      if (parsed.claude) {
        if (Array.isArray(parsed.claude.sessions) && parsed.claude.sessions.length
            && (!merged.chat.sessions || !merged.chat.sessions.length)) {
          merged.chat.sessions = parsed.claude.sessions;
          merged.chat.activeSessionId = parsed.claude.activeSessionId
            || parsed.claude.sessions[0]?.id || null;
        }
        Object.assign(merged.providers.anthropic, {
          apiKey: parsed.claude.apiKey ?? merged.providers.anthropic.apiKey,
          model: parsed.claude.model ?? merged.providers.anthropic.model,
          maxTokens: parsed.claude.maxTokens ?? merged.providers.anthropic.maxTokens,
          rememberKey: parsed.claude.rememberKey ?? merged.providers.anthropic.rememberKey,
        });
        // Legacy: single-history (pre-multi-session) → wrap as a session
        if (Array.isArray(parsed.claude.history) && parsed.claude.history.length
            && (!merged.chat.sessions || !merged.chat.sessions.length)) {
          merged.chat.sessions = [makeSession({
            history: parsed.claude.history,
            title: deriveTitleFromHistory(parsed.claude.history),
            autoTitle: true,
          })];
          merged.chat.activeSessionId = merged.chat.sessions[0].id;
        }
        // Hoist legacy global system prompt into the first session (if it has none)
        if (parsed.claude.systemPrompt
            && merged.chat.sessions[0]
            && !merged.chat.sessions[0].systemPrompt) {
          merged.chat.sessions[0].systemPrompt = parsed.claude.systemPrompt;
        }
        delete merged.claude;
      }
      // Hoist legacy global state.chat.systemPrompt (from the previous schema iteration)
      if (parsed.chat?.systemPrompt && merged.chat.sessions[0]
          && !merged.chat.sessions[0].systemPrompt) {
        merged.chat.sessions[0].systemPrompt = parsed.chat.systemPrompt;
      }
      delete merged.chat.systemPrompt;
      // Backfill missing per-session fields for older sessions
      for (const s of (merged.chat.sessions || [])) {
        if (!('systemPrompt' in s)) s.systemPrompt = '';
        if (!('presetId' in s)) s.presetId = null;
      }
      return merged;
    } catch (e) {
      console.error('storage load failed', e);
      return structuredClone(DEFAULT_DATA);
    }
  },
  save(data) {
    const toPersist = structuredClone(data);
    // Per-provider rememberKey honoring
    for (const id of Object.keys(toPersist.providers || {})) {
      if (!toPersist.providers[id].rememberKey) toPersist.providers[id].apiKey = '';
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist)); }
    catch (e) { toast('保存に失敗しました（容量不足の可能性）', 'error'); }
  },
  reset() { localStorage.removeItem(STORAGE_KEY); },
};

function makeSession({ id, title, autoTitle = true, history = [],
                       presetId = null, systemPrompt = '' } = {}) {
  const now = Date.now();
  return {
    id: id || ('sess_' + now.toString(36) + Math.random().toString(36).slice(2, 6)),
    title: title || '新しい会話',
    autoTitle,
    createdAt: now,
    updatedAt: now,
    history,
    presetId,    // ID of an active built-in preset, or null
    systemPrompt, // free-form (overrides preset if both set; preset application copies into here)
  };
}

function getSessionSystemPrompt(s) {
  // Free-form text takes precedence; if empty fall back to preset's prompt
  if (s.systemPrompt && s.systemPrompt.trim()) return s.systemPrompt;
  const preset = getPresetById(s.presetId);
  return preset ? preset.systemPrompt : '';
}
function deriveTitleFromHistory(history) {
  const first = history.find(m => m.role === 'user');
  if (!first) return '新しい会話';
  const text = (typeof first.content === 'string')
    ? first.content
    : (textOf(first.content) || (hasImages(first.content) ? '🖼 画像' : ''));
  return text.replace(/\s+/g, ' ').trim().slice(0, 30) || '新しい会話';
}
function getActiveSession() {
  let s = state.chat.sessions.find(x => x.id === state.chat.activeSessionId);
  if (!s) {
    s = state.chat.sessions[0];
    if (!s) {
      s = makeSession();
      state.chat.sessions.push(s);
    }
    state.chat.activeSessionId = s.id;
  }
  return s;
}
function ensureSessions() {
  if (!state.chat.sessions || !state.chat.sessions.length) {
    const s = makeSession();
    state.chat.sessions = [s];
    state.chat.activeSessionId = s.id;
  } else if (!state.chat.sessions.find(x => x.id === state.chat.activeSessionId)) {
    state.chat.activeSessionId = state.chat.sessions[0].id;
  }
}

// ---------- Provider registry ----------
const LOCAL_PROVIDER_IDS = new Set(['ollama']);
function isLocalProvider(id) { return LOCAL_PROVIDER_IDS.has(id); }
function visibleProviders() {
  const all = Object.values(PROVIDERS);
  return state.settings.localOnly ? all.filter(p => isLocalProvider(p.id)) : all;
}
// If local-only is on but the active provider is a cloud one, snap to ollama.
function reconcileLocalOnly() {
  if (state.settings.localOnly && !isLocalProvider(state.chat.activeProviderId)) {
    state.chat.activeProviderId = 'ollama';
  }
}
function getActiveProvider() {
  return PROVIDERS[state.chat.activeProviderId] || PROVIDERS.anthropic;
}
function getActiveProviderConfig() {
  const id = getActiveProvider().id;
  if (!state.providers[id]) {
    state.providers[id] = { apiKey: '', model: PROVIDERS[id].defaultModel,
                            maxTokens: 4096, rememberKey: true };
  }
  return state.providers[id];
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
// ---------- Prompt presets (built-in) ----------
const BUILTIN_PRESETS = [
  {
    id: 'translate',
    icon: '🌐',
    label: '翻訳',
    desc: '日本語 ⇔ 英語の双方向翻訳',
    systemPrompt:
      'あなたはプロの翻訳者です。ユーザーが入力した文章を、日本語であれば自然な英語に、' +
      'それ以外の言語であれば自然な日本語に翻訳してください。\n' +
      '- 原文の意味と語調を忠実に保つ\n' +
      '- 必要に応じて短い注釈を [] で添える\n' +
      '- 翻訳結果のみを返し、前置きは書かない',
  },
  {
    id: 'summarize',
    icon: '📝',
    label: '要約',
    desc: '長文を 3〜5 行で要約',
    systemPrompt:
      'ユーザーが提示した文章を、日本語で 3〜5 行に要約してください。\n' +
      '- 結論 → 根拠 → 補足 の順に箇条書き\n' +
      '- 固有名詞・数値はそのまま残す\n' +
      '- 解説や前置きは書かず、要約のみを返す',
  },
  {
    id: 'proofread',
    icon: '✏️',
    label: '校正',
    desc: '日本語の誤字・脱字・表現の改善案',
    systemPrompt:
      'ユーザーが提示した日本語の文章を校正してください。\n' +
      '- 誤字脱字、不自然な表現、文法ミスを指摘\n' +
      '- 修正前 → 修正後 の対比で示す\n' +
      '- 全体としての改善版を最後にまとめて提示\n' +
      '- 大幅な書き換えはせず、原文の意図を尊重する',
  },
  {
    id: 'code-review',
    icon: '🔍',
    label: 'コードレビュー',
    desc: 'バグ・改善点・代替案を指摘',
    systemPrompt:
      'あなたはシニアソフトウェアエンジニアです。提示されたコードを以下の観点でレビューしてください。\n' +
      '1. 明らかなバグや潜在的な不具合\n' +
      '2. パフォーマンス・セキュリティ上の懸念\n' +
      '3. 可読性・保守性の改善案\n' +
      '4. より慣用的な書き方\n' +
      '見つかった問題ごとに「重要度 (高/中/低)」と修正例を示してください。',
  },
  {
    id: 'code-explain',
    icon: '🧪',
    label: 'コード解説',
    desc: 'プログラムを段階的に解説',
    systemPrompt:
      '提示されたコードを、初学者にもわかるよう日本語で解説してください。\n' +
      '- 概要 → 主要な処理の流れ → 重要な行の意味 の順で説明\n' +
      '- 専門用語は初出時に短く補足する\n' +
      '- 必要に応じて簡単な実行例を示す',
  },
  {
    id: 'biz-mail',
    icon: '📧',
    label: 'ビジネスメール',
    desc: '丁寧なメール文面を生成',
    systemPrompt:
      'ユーザーの依頼に基づいて、日本語のビジネスメール文面を作成してください。\n' +
      '- 件名・宛名・本文・締めの構成\n' +
      '- 敬語は適切に、過剰にはしない\n' +
      '- 1〜2 段落で簡潔に\n' +
      '- 不明な情報は [ ] で穴埋め指示として残す',
  },
  {
    id: 'brainstorm',
    icon: '🎯',
    label: 'ブレスト',
    desc: 'テーマからアイデアを多面的に展開',
    systemPrompt:
      'ユーザーが提示したテーマや課題に対し、創造的なアイデアを 7〜10 個出してください。\n' +
      '- 視点の異なる切り口を意識する (実用 / 革新 / 安価 / 他業界の応用 など)\n' +
      '- 各案は 1〜2 行で簡潔に\n' +
      '- 最後に「特に有望な 3 つ」とその理由を示す',
  },
  {
    id: 'minutes',
    icon: '📊',
    label: '議事録整形',
    desc: '雑記から構造化した議事録に',
    systemPrompt:
      'ユーザーが提示する会議の生メモやチャットログから、構造化された議事録を作成してください。\n' +
      '構成: 日時/参加者(推定) → 主要トピック → 決定事項 → ToDo (担当・期限) → 次回宿題\n' +
      '- 元メモにない情報は推測せず「(記載なし)」と書く\n' +
      '- ToDo は箇条書きで「[担当] 内容 (期限)」形式',
  },
];

function getPresetById(id) {
  return BUILTIN_PRESETS.find(p => p.id === id) || null;
}

const INTEGRATIONS = [
  {
    id: 'claude',
    name: 'AI チャット',
    sub: 'Claude / Gemini を切替可能',
    icon: '🤖',
    iconClass: 'claude',
    desc: '複数の AI プロバイダと直接連携してチャット・要約・翻訳・コード生成などができます。',
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
const localOnlyToggle = document.getElementById('localOnlyToggle');
function applyLocalOnly() {
  localOnlyToggle.checked = !!state.settings.localOnly;
  reconcileLocalOnly();
  updateLocalBadge();
}
localOnlyToggle.addEventListener('change', () => {
  state.settings.localOnly = localOnlyToggle.checked;
  const switched = state.settings.localOnly
    && !isLocalProvider(state.chat.activeProviderId);
  reconcileLocalOnly();
  persist();
  updateLocalBadge();
  // Refresh provider picker + form to reflect the new visible set
  if (typeof renderProviderPicker === 'function') renderProviderPicker();
  if (typeof applyProviderToForm === 'function') applyProviderToForm();
  if (state.settings.localOnly) {
    toast(`ローカル専用モード ON${switched ? ' — Ollama に切り替えました' : ''}`, 'success');
  } else {
    toast('ローカル専用モード OFF', 'success');
  }
});

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
  applyLocalOnly();
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
   Provider clients — all browser-direct, all stream text deltas
   Common interface:
     sendStream({ apiKey, model, maxTokens, system, messages, signal, onText })
       → Promise<{ text: string, usage: { input_tokens?, output_tokens? } | null }>
   ========================================================= */

class ProviderError extends Error {
  constructor(message, { status, type, providerId } = {}) {
    super(message);
    this.status = status; this.type = type; this.providerId = providerId;
  }
}
// Back-compat alias (older code path may still throw AnthropicError-named)
const AnthropicError = ProviderError;

const HTTP_ERR_JA = {
  400: 'リクエスト不正',
  401: 'API キーが無効です',
  403: 'アクセス権限がありません（CORS / 課金状態をご確認ください）',
  404: 'モデルが見つかりません',
  413: 'リクエストが大きすぎます',
  429: 'レート制限に達しました。少し待ってから再試行してください',
  500: 'プロバイダ側のエラーです。少し待って再試行してください',
  529: 'API が混雑しています。少し待って再試行してください',
};

async function readSseLines(response, handleEvent) {
  if (!response.body) throw new ProviderError('ストリーミング応答を取得できません');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
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
      try { handleEvent(JSON.parse(payload)); }
      catch { /* skip malformed JSON chunk */ }
    }
  }
}

async function safeErrorBody(res) {
  try {
    const j = await res.json();
    return j?.error?.message || j?.message || JSON.stringify(j);
  } catch { return ''; }
}

// ---------- Message content helpers ----------
// Internal format: content is either a string (text-only) or
//   [{type:'text', text}, {type:'image', dataUrl:'data:image/...;base64,...', mimeType}]
function partsOf(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content : [];
}
function textOf(content) {
  return partsOf(content).filter(p => p.type === 'text').map(p => p.text).join('');
}
function imagesOf(content) {
  return partsOf(content).filter(p => p.type === 'image');
}
function hasImages(content) { return imagesOf(content).length > 0; }
function dataUrlPayload(dataUrl) {
  // "data:image/jpeg;base64,XXXX" → "XXXX"
  const i = dataUrl.indexOf(',');
  return i < 0 ? dataUrl : dataUrl.slice(i + 1);
}

// ---------- Anthropic ----------
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

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
async function anthropicSendStream({ apiKey, model, maxTokens, system, messages, signal, onText }) {
  if (!apiKey) throw new ProviderError('API キーが設定されていません', { providerId: 'anthropic' });
  if (!messages?.length) throw new ProviderError('メッセージが空です', { providerId: 'anthropic' });

  // Convert internal {role, content} → Anthropic native, with image support
  const anthropicMessages = messages.map(m => {
    const parts = partsOf(m.content);
    const blocks = parts.map(p => {
      if (p.type === 'image') {
        return {
          type: 'image',
          source: { type: 'base64', media_type: p.mimeType || 'image/jpeg',
                    data: dataUrlPayload(p.dataUrl) },
        };
      }
      return { type: 'text', text: p.text };
    });
    // If only one text block, send as plain string for compactness
    return {
      role: m.role,
      content: (blocks.length === 1 && blocks[0].type === 'text') ? blocks[0].text : blocks,
    };
  });

  const body = { model, max_tokens: maxTokens, messages: anthropicMessages, stream: true };
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
    throw new ProviderError(`接続エラー: ${err.message}（CORS / ネットワーク制限の可能性）`,
      { providerId: 'anthropic' });
  }

  if (!res.ok) {
    const detail = await safeErrorBody(res);
    throw new ProviderError(
      `${HTTP_ERR_JA[res.status] || `HTTP ${res.status}`}${detail ? ` — ${detail}` : ''}`,
      { status: res.status, providerId: 'anthropic' },
    );
  }

  let fullText = '';
  let usage = null;
  await readSseLines(res, (evt) => {
    if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
      fullText += evt.delta.text;
      onText?.(evt.delta.text);
    } else if (evt.type === 'message_delta' && evt.usage) {
      usage = { ...(usage || {}), ...evt.usage };
    } else if (evt.type === 'message_start' && evt.message?.usage) {
      usage = { ...evt.message.usage, ...(usage || {}) };
    } else if (evt.type === 'error') {
      throw new ProviderError(evt.error?.message || 'API エラー',
        { type: evt.error?.type, providerId: 'anthropic' });
    }
  });
  return { text: fullText, usage };
}

// ---------- Google Gemini ----------
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function googleSendStream({ apiKey, model, maxTokens, system, messages, signal, onText }) {
  if (!apiKey) throw new ProviderError('API キーが設定されていません', { providerId: 'google' });
  if (!messages?.length) throw new ProviderError('メッセージが空です', { providerId: 'google' });

  // Convert messages → Gemini's contents shape with image support
  const contents = messages.map(m => {
    const parts = [];
    for (const p of partsOf(m.content)) {
      if (p.type === 'image') {
        parts.push({ inlineData: { mimeType: p.mimeType || 'image/jpeg',
                                    data: dataUrlPayload(p.dataUrl) }});
      } else {
        parts.push({ text: p.text });
      }
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });

  const body = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (system && system.trim()) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  // streamGenerateContent with alt=sse returns SSE
  const url = `${GOOGLE_API_BASE}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ProviderError(`接続エラー: ${err.message}（CORS / ネットワーク制限の可能性）`,
      { providerId: 'google' });
  }

  if (!res.ok) {
    const detail = await safeErrorBody(res);
    throw new ProviderError(
      `${HTTP_ERR_JA[res.status] || `HTTP ${res.status}`}${detail ? ` — ${detail}` : ''}`,
      { status: res.status, providerId: 'google' },
    );
  }

  let fullText = '';
  let usage = null;
  await readSseLines(res, (evt) => {
    // Each SSE chunk is a GenerateContentResponse fragment
    const parts = evt?.candidates?.[0]?.content?.parts || [];
    for (const p of parts) {
      if (typeof p.text === 'string' && p.text) {
        fullText += p.text;
        onText?.(p.text);
      }
    }
    if (evt?.usageMetadata) {
      // Normalize to {input_tokens, output_tokens} for the UI
      usage = {
        input_tokens:  evt.usageMetadata.promptTokenCount,
        output_tokens: evt.usageMetadata.candidatesTokenCount,
      };
    }
  });
  return { text: fullText, usage };
}

// ---------- Ollama (local) ----------
const OLLAMA_DEFAULT_BASE = 'http://localhost:11434';

async function ollamaSendStream({ apiKey, model, maxTokens, system, messages, signal, onText }) {
  // For Ollama: apiKey field is repurposed as the base URL (default localhost:11434).
  // No actual auth header — local-only by design.
  const base = (apiKey || OLLAMA_DEFAULT_BASE).replace(/\/$/, '');
  if (!messages?.length) throw new ProviderError('メッセージが空です', { providerId: 'ollama' });

  // Build /api/chat request body. Ollama image format: {role, content, images: ["base64..."]}
  const ollamaMessages = [];
  if (system && system.trim()) ollamaMessages.push({ role: 'system', content: system });
  for (const m of messages) {
    const text = textOf(m.content);
    const imgs = imagesOf(m.content);
    const out = { role: m.role === 'assistant' ? 'assistant' : 'user', content: text };
    if (imgs.length) out.images = imgs.map(p => dataUrlPayload(p.dataUrl));
    ollamaMessages.push(out);
  }

  const body = {
    model,
    messages: ollamaMessages,
    stream: true,
    options: { num_predict: maxTokens },
  };

  let res;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ProviderError(
      `Ollama に接続できません: ${err.message}\n` +
      `ヒント: ターミナルで \`ollama serve\` が起動済みで、` +
      `OLLAMA_ORIGINS=* または このページの Origin を許可していますか？`,
      { providerId: 'ollama' });
  }

  if (!res.ok) {
    const detail = await safeErrorBody(res);
    throw new ProviderError(
      `${HTTP_ERR_JA[res.status] || `HTTP ${res.status}`}${detail ? ` — ${detail}` : ''}`,
      { status: res.status, providerId: 'ollama' });
  }
  if (!res.body) throw new ProviderError('ストリーミング応答を取得できません');

  // Ollama returns NDJSON (newline-delimited JSON), one object per line — not SSE.
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
      const trimmed = line.trim();
      if (!trimmed) continue;
      let evt;
      try { evt = JSON.parse(trimmed); } catch { continue; }
      if (evt.error) {
        throw new ProviderError(evt.error, { providerId: 'ollama' });
      }
      if (evt.message?.content) {
        fullText += evt.message.content;
        onText?.(evt.message.content);
      }
      if (evt.done) {
        usage = {
          input_tokens:  evt.prompt_eval_count,
          output_tokens: evt.eval_count,
        };
      }
    }
  }
  return { text: fullText, usage };
}

// ---------- Provider registry ----------
const PROVIDERS = {
  ollama: {
    id: 'ollama',
    label: 'Ollama (ローカル)',
    icon: '🏠',
    keyHint: 'http://localhost:11434',
    keyDocsUrl: 'https://ollama.com/',
    keyDocsLabel: 'Ollama 公式サイト',
    keyLabelOverride: 'サーバー URL',
    keyHelpOverride: 'API キー不要。Ollama サーバーのベース URL（既定: http://localhost:11434）',
    defaultModel: 'llama3.2',
    modelSuggestions: [
      'llama3.2', 'llama3.1', 'qwen2.5', 'gemma3', 'mistral', 'phi4', 'deepseek-r1',
      // Vision-capable (画像入力対応)
      'llama3.2-vision', 'llava', 'gemma3:vision', 'minicpm-v',
    ],
    note: 'お手元の PC で動作する Ollama に接続します（API キー不要・通信は外部に出ません）。' +
          '事前に <code>ollama serve</code> を起動し、ブラウザから呼ぶ場合は環境変数 ' +
          '<code>OLLAMA_ORIGINS=*</code> を設定してください。' +
          '画像を送る場合は <code>llama3.2-vision</code> や <code>llava</code> などのビジョン対応モデルを指定してください。',
    sendStream: ollamaSendStream,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    icon: '🤖',
    keyHint: 'sk-ant-api03-...',
    keyDocsUrl: 'https://console.anthropic.com/',
    keyDocsLabel: 'Anthropic Console',
    defaultModel: 'claude-opus-4-7',
    modelSuggestions: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
    note: 'Anthropic 社の Claude API と直接通信します（クラウド・有償）。',
    sendStream: anthropicSendStream,
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    icon: '✨',
    keyHint: 'AIza...',
    keyDocsUrl: 'https://aistudio.google.com/apikey',
    keyDocsLabel: 'Google AI Studio',
    defaultModel: 'gemini-2.5-flash',
    modelSuggestions: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
    note: 'Google AI Studio の Gemini API と直接通信します（クラウド・無料枠あり）。',
    sendStream: googleSendStream,
  },
};

/* =========================================================
   AI integration UI (provider-agnostic)
   ========================================================= */
let abortCtrl = null;

// Pending attachments staged for the next outgoing message
// shape: [{name, mimeType, dataUrl, sizeBytes}]
let pendingAttachments = [];

const MAX_IMAGE_LONG_EDGE = 1568; // Anthropic-recommended max
const JPEG_QUALITY = 0.85;
const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const MAX_RAW_FILE_SIZE = 20 * 1024 * 1024; // 20MB hard cap on input file

// Read an image file, downscale if needed, and return a data URL + metadata
async function processImageFile(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error(`画像ファイルではありません: ${file.name}`);
  }
  if (file.size > MAX_RAW_FILE_SIZE) {
    throw new Error(`ファイルが大きすぎます (${formatBytes(file.size)} / 上限 ${formatBytes(MAX_RAW_FILE_SIZE)}): ${file.name}`);
  }
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);

  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  if (longEdge <= MAX_IMAGE_LONG_EDGE && file.size <= 1.5 * 1024 * 1024) {
    // Small enough already — keep original (preserves transparency for PNG)
    return {
      name: file.name, mimeType: file.type,
      dataUrl, sizeBytes: file.size,
      width: img.naturalWidth, height: img.naturalHeight,
    };
  }

  // Downscale to JPEG
  const scale = Math.min(1, MAX_IMAGE_LONG_EDGE / longEdge);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Paint a white background for transparent PNGs (JPEG has no alpha)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const newDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return {
    name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
    mimeType: 'image/jpeg',
    dataUrl: newDataUrl,
    sizeBytes: Math.round(newDataUrl.length * 0.75), // approx base64 → bytes
    width: w, height: h,
  };
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('ファイル読み込みに失敗しました'));
    r.readAsDataURL(file);
  });
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像をデコードできません'));
    img.src = src;
  });
}
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function addAttachmentFiles(files) {
  for (const file of files) {
    if (pendingAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
      toast(`添付は ${MAX_ATTACHMENTS_PER_MESSAGE} 枚までです`, 'error');
      break;
    }
    try {
      const att = await processImageFile(file);
      pendingAttachments.push(att);
    } catch (e) {
      toast(e.message, 'error', 5000);
    }
  }
  renderAttachmentBar();
}

function clearAttachments() {
  pendingAttachments = [];
  renderAttachmentBar();
}

function renderAttachmentBar() {
  const bar = document.getElementById('attachmentBar');
  if (!bar) return;
  bar.innerHTML = '';
  if (!pendingAttachments.length) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  pendingAttachments.forEach((att, i) => {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    chip.title = `${att.name} • ${formatBytes(att.sizeBytes)} • ${att.width}×${att.height}`;
    chip.innerHTML = `
      <img src="${att.dataUrl}" alt="${escapeHtml(att.name)}" />
      <span class="meta">${formatBytes(att.sizeBytes)}</span>
      <button type="button" class="remove" aria-label="削除">×</button>
    `;
    chip.querySelector('.remove').addEventListener('click', () => {
      pendingAttachments.splice(i, 1);
      renderAttachmentBar();
    });
    bar.appendChild(chip);
  });
}

function initClaudeUI() {
  renderProviderPicker();
  applyProviderToForm();
  applySessionToForm();
  const cfg = getActiveProviderConfig();
  document.getElementById('rememberKey').checked = cfg.rememberKey !== false;
  updateClaudeStatus('unknown', cfg.apiKey ? 'キー設定済み（未テスト）' : 'API キーが未設定');
  renderPresets();
  renderChat();
}

// Sync the system-prompt textarea with the active session
function applySessionToForm() {
  const session = getActiveSession();
  const ta = document.getElementById('systemPromptInput');
  if (ta) ta.value = getSessionSystemPrompt(session);
}

function renderPresets() {
  const bar = document.getElementById('presetBar');
  if (!bar) return;
  // Keep the leading label, replace the chips
  bar.innerHTML = '<span class="preset-label">モード:</span>';
  const session = getActiveSession();

  // Default / clear chip
  const clearChip = document.createElement('button');
  clearChip.type = 'button';
  clearChip.className = 'preset-chip preset-chip-clear' + (!session.presetId ? ' active' : '');
  clearChip.textContent = '✕ なし';
  clearChip.title = 'プリセット未適用 (システムプロンプトを自由記述に戻す)';
  clearChip.addEventListener('click', () => applyPreset(null));
  bar.appendChild(clearChip);

  for (const p of BUILTIN_PRESETS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'preset-chip' + (session.presetId === p.id ? ' active' : '');
    chip.textContent = `${p.icon} ${p.label}`;
    chip.title = `${p.label} — ${p.desc}\nクリックで適用 / 再クリックで解除`;
    chip.setAttribute('aria-pressed', session.presetId === p.id ? 'true' : 'false');
    chip.addEventListener('click', () => applyPreset(session.presetId === p.id ? null : p.id));
    bar.appendChild(chip);
  }
}

// Apply a preset (or clear it) to the active session
function applyPreset(presetId) {
  const session = getActiveSession();
  const preset = getPresetById(presetId);
  session.presetId = preset ? preset.id : null;
  // Copy preset's prompt into systemPrompt so the user can tweak it from the textarea.
  session.systemPrompt = preset ? preset.systemPrompt : '';
  session.updatedAt = Date.now();
  persist();
  applySessionToForm();
  renderPresets();
  if (preset) {
    toast(`「${preset.label}」モードを適用しました`, 'success');
    document.getElementById('chatInput')?.focus();
  } else {
    toast('プリセットを解除しました', 'success');
  }
}

function updateClaudeStatus(stateName, text) {
  document.getElementById('claudeStatusDot').dataset.state = stateName;
  document.getElementById('claudeStatusText').textContent = text;
  setGlobalStatus(stateName, `${getActiveProvider().label}: ${text}`);
}

function renderProviderPicker() {
  const wrap = document.getElementById('providerPicker');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const p of visibleProviders()) {
    const lbl = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'provider';
    radio.value = p.id;
    radio.checked = (state.chat.activeProviderId === p.id);
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      state.chat.activeProviderId = p.id;
      persist();
      applyProviderToForm();
      const cfg = getActiveProviderConfig();
      updateClaudeStatus('unknown', cfg.apiKey ? 'キー設定済み（未テスト）' : 'API キーが未設定');
      document.getElementById('usageInfo').textContent = 'トークン: -';
    });
    const span = document.createElement('span');
    span.textContent = `${p.icon} ${p.label}`;
    lbl.append(radio, span);
    wrap.appendChild(lbl);
  }
  // Hidden-providers note when local-only is on
  if (state.settings.localOnly) {
    const note = document.createElement('span');
    note.className = 'provider-hidden-note';
    const hidden = Object.values(PROVIDERS).filter(p => !isLocalProvider(p.id)).length;
    note.textContent = `🔒 ローカル専用モード中 (クラウド ${hidden} 件を非表示)`;
    wrap.appendChild(note);
  }
  updateLocalBadge();
}

function updateLocalBadge() {
  const badge = document.getElementById('localBadge');
  if (badge) badge.hidden = !state.settings.localOnly;
  // Class warning banner: show when on a cloud provider
  const banner = document.getElementById('classBanner');
  if (banner) {
    banner.hidden = state.settings.localOnly
      || isLocalProvider(state.chat.activeProviderId);
  }
}

function applyProviderToForm() {
  const provider = getActiveProvider();
  const cfg = getActiveProviderConfig();
  const isLocal = !!provider.keyLabelOverride; // Ollama-style URL field, no real "key"

  // Provider note + key docs link
  const note = document.getElementById('providerNote');
  if (note) {
    note.innerHTML = `${provider.note} `
      + `(参考: <a href="${escapeHtml(provider.keyDocsUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(provider.keyDocsLabel)}</a>)`;
  }

  // Re-label "API キー" field for local providers
  const keyLabelEl = document.querySelector('label[for="apiKeyInput"]');
  if (keyLabelEl) {
    keyLabelEl.firstChild && (keyLabelEl.firstChild.nodeValue = (provider.keyLabelOverride || 'API キー') + '\n');
  }
  const keyHelp = document.getElementById('apiKeyHelp');
  if (keyHelp) {
    keyHelp.textContent = provider.keyHelpOverride
      || `${provider.label} の API キー（例: ${provider.keyHint}）`;
  }

  // Inputs reflect this provider's config
  const apiKeyInput = document.getElementById('apiKeyInput');
  apiKeyInput.value = cfg.apiKey || (isLocal ? provider.keyHint : '');
  apiKeyInput.placeholder = provider.keyHint;
  // Local providers (Ollama): URL — show as text. Cloud providers: hide as password.
  apiKeyInput.type = isLocal ? 'url' : 'password';
  document.getElementById('toggleKeyBtn').textContent = isLocal ? '隠す' : '表示';
  document.getElementById('toggleKeyBtn').hidden = isLocal;

  document.getElementById('modelInput').value = cfg.model || provider.defaultModel;
  document.getElementById('maxTokensInput').value = cfg.maxTokens || 4096;
  document.getElementById('rememberKey').checked = cfg.rememberKey !== false;

  // Refresh datalist for this provider's model suggestions
  const dl = document.getElementById('modelSuggestions');
  if (dl) {
    dl.innerHTML = '';
    for (const m of (provider.modelSuggestions || [])) {
      const opt = document.createElement('option');
      opt.value = m;
      dl.appendChild(opt);
    }
  }
  updateLocalBadge(); // refresh class-warning banner based on active provider
}

function bindClaudeUI() {
  const apiKeyInput = document.getElementById('apiKeyInput');
  const modelInput = document.getElementById('modelInput');
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
    const cfg = getActiveProviderConfig();
    cfg.apiKey = apiKeyInput.value.trim();
    cfg.model = modelInput.value.trim() || getActiveProvider().defaultModel;
    cfg.maxTokens = Math.max(64, Math.min(64000, parseInt(maxTokensInput.value, 10) || 4096));
    cfg.rememberKey = rememberKey.checked;
    // System prompt is now per-session
    const session = getActiveSession();
    const newPrompt = systemPromptInput.value;
    if (newPrompt !== session.systemPrompt) {
      session.systemPrompt = newPrompt;
      // Manual edit: if it diverges from the active preset's prompt, clear preset link
      const activePreset = getPresetById(session.presetId);
      if (activePreset && newPrompt.trim() !== activePreset.systemPrompt.trim()) {
        session.presetId = null;
        renderPresets();
      }
      session.updatedAt = Date.now();
    }
  }

  // Clear preset binding the moment user starts typing in the system-prompt textarea
  systemPromptInput.addEventListener('input', () => {
    const session = getActiveSession();
    const activePreset = getPresetById(session.presetId);
    if (activePreset && systemPromptInput.value.trim() !== activePreset.systemPrompt.trim()) {
      session.presetId = null;
      renderPresets();
    }
  });

  saveBtn.addEventListener('click', () => {
    captureForm();
    persist();
    const cfg = getActiveProviderConfig();
    updateClaudeStatus('unknown', cfg.apiKey ? 'キー設定済み（未テスト）' : 'API キーが未設定');
    toast('設定を保存しました', 'success');
  });

  testBtn.addEventListener('click', async () => {
    captureForm();
    persist();
    const cfg = getActiveProviderConfig();
    const provider = getActiveProvider();
    if (!cfg.apiKey) {
      updateClaudeStatus('error', 'API キーが未設定');
      toast('API キーを入力してください', 'error');
      return;
    }
    updateClaudeStatus('loading', '接続テスト中…');
    testBtn.disabled = true;
    try {
      const { text } = await provider.sendStream({
        apiKey: cfg.apiKey,
        model: cfg.model,
        maxTokens: 64,
        messages: [{ role: 'user', content: 'こんにちは。短く 1 文で挨拶してください。' }],
      });
      updateClaudeStatus('ok', `接続成功（${cfg.model}）`);
      toast(`接続OK: ${text.slice(0, 60)}`, 'success', 4000);
    } catch (err) {
      updateClaudeStatus('error', err.message || '接続失敗');
      toast(`接続失敗: ${err.message}`, 'error', 5000);
    } finally {
      testBtn.disabled = false;
    }
  });

  clearKeyBtn.addEventListener('click', async () => {
    const ok = await confirmDialog('保存されている API キーを削除しますか？（このプロバイダのみ）');
    if (!ok) return;
    const cfg = getActiveProviderConfig();
    cfg.apiKey = '';
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
  const attachBtn = document.getElementById('attachBtn');
  const attachInput = document.getElementById('attachInput');

  // ----- Attachments: file picker -----
  attachBtn.addEventListener('click', () => attachInput.click());
  attachInput.addEventListener('change', async () => {
    if (attachInput.files?.length) {
      await addAttachmentFiles([...attachInput.files]);
    }
    attachInput.value = ''; // allow re-selecting the same file
  });

  // ----- Attachments: clipboard paste -----
  chatInput.addEventListener('paste', async e => {
    const imgs = [...(e.clipboardData?.items || [])]
      .filter(it => it.type?.startsWith('image/'))
      .map(it => it.getAsFile())
      .filter(Boolean);
    if (imgs.length) {
      e.preventDefault(); // don't paste binary garbage into the textarea
      await addAttachmentFiles(imgs);
    }
  });

  // ----- Attachments: drag & drop on the chat input area -----
  chatForm.addEventListener('dragover', e => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      chatForm.classList.add('dragover');
    }
  });
  chatForm.addEventListener('dragleave', e => {
    if (e.target === chatForm) chatForm.classList.remove('dragover');
  });
  chatForm.addEventListener('drop', async e => {
    if (e.dataTransfer?.files?.length) {
      e.preventDefault();
      chatForm.classList.remove('dragover');
      await addAttachmentFiles([...e.dataTransfer.files]);
    }
  });

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
    const atts = pendingAttachments;
    if (!text && !atts.length) return;
    const cfg = getActiveProviderConfig();
    const provider = getActiveProvider();
    if (!cfg.apiKey) {
      toast('先に API キーを設定してください', 'error');
      return;
    }

    const session = getActiveSession();
    // Build user content: parts[] if attachments present, else plain string
    let userContent;
    if (atts.length) {
      userContent = [];
      for (const a of atts) {
        userContent.push({ type: 'image', dataUrl: a.dataUrl, mimeType: a.mimeType });
      }
      if (text) userContent.push({ type: 'text', text });
    } else {
      userContent = text;
    }
    session.history.push({ role: 'user', content: userContent });
    session.updatedAt = Date.now();
    if (session.autoTitle) {
      session.title = deriveTitleFromHistory(session.history);
    }
    chatInput.value = '';
    charCount.textContent = '0 文字';
    clearAttachments();
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
      const { usage } = await provider.sendStream({
        apiKey: cfg.apiKey,
        model: cfg.model,
        maxTokens: cfg.maxTokens,
        system: getSessionSystemPrompt(session),
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
      updateClaudeStatus('ok', `完了（${cfg.model}）`);
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
    const ok = await confirmDialog('この会話のメッセージをすべて削除しますか？（タブとモードは残ります）');
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
      const text = (typeof m.content === 'string') ? m.content : textOf(m.content);
      const imgCount = (typeof m.content === 'string') ? 0 : imagesOf(m.content).length;
      const imgNote = imgCount ? `\n\n_(添付画像 ${imgCount} 枚 / 書き出しには含まれません)_` : '';
      return `${label}\n\n${text}${imgNote}\n`;
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
  state.chat.sessions.push(s);
  state.chat.activeSessionId = s.id;
  persist();
  renderSessionTabs();
  renderPresets();
  applySessionToForm();
  renderChat();
  document.getElementById('usageInfo').textContent = 'トークン: -';
  document.getElementById('chatInput')?.focus();
}

async function deleteSession(id) {
  const idx = state.chat.sessions.findIndex(x => x.id === id);
  if (idx < 0) return;
  const s = state.chat.sessions[idx];
  if (s.history.length) {
    const ok = await confirmDialog(`「${s.title}」を削除しますか？（メッセージも消えます）`);
    if (!ok) return;
  }
  state.chat.sessions.splice(idx, 1);
  if (!state.chat.sessions.length) {
    const fresh = makeSession();
    state.chat.sessions.push(fresh);
    state.chat.activeSessionId = fresh.id;
  } else if (state.chat.activeSessionId === id) {
    state.chat.activeSessionId = state.chat.sessions[Math.max(0, idx - 1)].id;
  }
  persist();
  renderSessionTabs();
  renderChat();
}

function switchSession(id) {
  if (state.chat.activeSessionId === id) return;
  state.chat.activeSessionId = id;
  persist();
  renderSessionTabs();
  renderPresets();
  applySessionToForm();
  renderChat();
  document.getElementById('usageInfo').textContent = 'トークン: -';
}

function renameSession(id, newTitle) {
  const s = state.chat.sessions.find(x => x.id === id);
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
  for (const s of state.chat.sessions) {
    const tab = document.createElement('div');
    tab.className = 'session-tab' + (s.id === state.chat.activeSessionId ? ' active' : '');
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', s.id === state.chat.activeSessionId ? 'true' : 'false');
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

    const text = (typeof m.content === 'string') ? m.content : textOf(m.content);
    const imgs = (typeof m.content === 'string') ? [] : imagesOf(m.content);

    if (m.role === 'assistant' && !m.error && text) {
      body.innerHTML = renderMarkdown(text);
      activateCopyButtons(body);
    } else {
      body.textContent = text || (i === streamingIndex ? '' : '');
    }
    if (imgs.length) {
      const gallery = document.createElement('div');
      gallery.className = 'msg-images';
      for (const im of imgs) {
        const img = document.createElement('img');
        img.src = im.dataUrl;
        img.alt = '添付画像';
        img.loading = 'lazy';
        img.addEventListener('click', () => window.open(im.dataUrl, '_blank'));
        gallery.appendChild(img);
      }
      body.appendChild(gallery);
    }
    if (i === streamingIndex && !text) {
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
  applyLocalOnly();
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

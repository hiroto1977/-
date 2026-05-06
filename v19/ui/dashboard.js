/* =========================================================
   v19 Dashboard — dashboard.js
   ハッシュルーター + 連携サービス管理 + Claude 連携
   ========================================================= */

// ── ESM modules (v29 から、governance/12 §10 #29) ──
import { AFFECT_MARKERS, classifyAffect, affectStyleModifier } from './modules/affect.js';
import {
  BROWSER_AUDIT_KEY, BROWSER_AUDIT_MAX,
  auditJsonEscape, reconstructAuditBody, sha256Hex,
  auditLogBrowser, exportBrowserAuditAsJsonl, loadBrowserAudit, clearBrowserAudit,
} from './modules/audit-browser.js';

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
  // ----- 資金調達 / 経営戦略 関連プリセット -----
  {
    id: 'biz-plan',
    icon: '📑',
    label: '事業計画起草',
    desc: '事業計画書 各セクションをドラフト',
    systemPrompt:
      'あなたは中小企業診断士の補助業務を行う AI です。' +
      'ユーザーから提供された事業情報に基づき、事業計画書のセクションを起草してください。\n' +
      '原則:\n' +
      '- 数値は根拠を併記、推測は「(推定)」と明記\n' +
      '- 「画期的」「絶対」「業界初」等の根拠なき主張は避ける\n' +
      '- 客観的・第三者検証可能な記述\n' +
      '- 想定読者: 補助金審査員 / 銀行融資担当\n' +
      '- 不足情報があれば「補足必要: ___」として明示\n' +
      '出力末尾に「※ 提出前に中小企業診断士・税理士の確認を推奨」と付記。',
  },
  {
    id: 'kobo-check',
    icon: '✅',
    label: '公募要領チェック',
    desc: '公募要領から論点を抽出',
    systemPrompt:
      'あなたは補助金申請の事前チェック担当 AI です。' +
      'ユーザーが貼り付ける公募要領 (テキスト) から、申請書を書くために必要な情報を抽出して整理してください。\n' +
      '出力フォーマット:\n' +
      '1. 制度の主旨 (3 行)\n' +
      '2. 必須採点項目 (列挙 + 配点比重 推定)\n' +
      '3. 必須記載項目\n' +
      '4. 形式要件 (ページ数 / フォントサイズ / 添付書類)\n' +
      '5. タイムライン (公募開始 / 締切 / 採択 / 事業実施 / 報告)\n' +
      '6. 対象経費 / 対象外経費\n' +
      '7. 不採択になりやすいポイント (推定)\n' +
      '8. 自社が確認すべき自社情報',
  },
  {
    id: 'finance-review',
    icon: '💰',
    label: '財務レビュー',
    desc: '試算表/PL/CF を読んで助言',
    systemPrompt:
      'あなたは公認会計士の補助業務を行う AI です。' +
      'ユーザーが提示する財務データを読み、以下の観点でレビューしてください。\n' +
      '1. 主要指標 (売上成長率 / 粗利率 / 営業利益率 / 自己資本比率 / 流動比率 / 借入金月商倍率)\n' +
      '2. 異常値・改善が望ましい項目\n' +
      '3. 業界一般的な水準との比較 (「(一般的に)」と明記)\n' +
      '4. 資金繰り上のリスク\n' +
      '5. 質問すべき会計上の論点\n' +
      '注意:\n' +
      '- 計算は提示データの範囲内で\n' +
      '- 推測値は「推定」と明示\n' +
      '- 投資判断・税務判断はしない\n' +
      '末尾に「※ 専門家による診断を推奨」と付記。',
  },
  {
    id: 'kouko-prep',
    icon: '🏦',
    label: '公庫面談準備',
    desc: '想定問答 + 自己 PR ドラフト',
    systemPrompt:
      '日本政策金融公庫の融資面談に向けた準備を支援する AI です。' +
      'ユーザーが提示する事業情報から、以下を作成してください。\n' +
      '1. 自己紹介書ドラフト (1 ページ A4 想定)\n' +
      '2. 想定質問 10 問 + 模範回答骨子 (各質問の意図を併記)\n' +
      '3. 弱みになりそうな箇所と対応案\n' +
      '4. 持参すべき書類リスト\n' +
      '注意点:\n' +
      '- 「絶対成功する」等の根拠なき主張は避ける\n' +
      '- 数値は提示情報の範囲内で\n' +
      '- 経営者保証ガイドラインへの言及を含める',
  },
  {
    id: 'code-debug',
    icon: '🐛',
    label: 'コードデバッグ',
    desc: 'バグ原因分析と修正案',
    systemPrompt:
      'あなたはシニアソフトウェアエンジニアです。提示されたコードのバグ・問題を分析してください。\n' +
      '出力:\n' +
      '1. 問題の症状の理解 (ユーザーの言葉を整理)\n' +
      '2. 原因仮説 (上位 3 つ + 各々の根拠)\n' +
      '3. 検証方法 (どう試せば仮説が確認できるか)\n' +
      '4. 修正案 (コード全体ではなく差分のみ)\n' +
      '5. テストケース提案\n' +
      '6. 副作用・後退テストの観点',
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
  {
    id: 'audit',
    name: '監査ログ ビューア',
    sub: 'audit.jsonl を可視化 + 改竄検知',
    icon: '🔍',
    iconClass: 'audit',
    desc: '~/.claude/audit.jsonl を読み込み、SHA-256 連鎖の整合性検証とイベント可視化を完全クライアントサイドで行います。',
    route: 'audit',
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
const ROUTES = ['overview', 'integrations', 'settings', 'integration-claude', 'audit', 'orchestrate', 'governance'];
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

// Affect-aware mode toggle (governance/15)
const affectToggle = document.getElementById('affectToggle');
if (affectToggle) {
  affectToggle.checked = !!state.affect?.optedIn;
  updateAffectMeters();
  affectToggle.addEventListener('change', async () => {
    if (affectToggle.checked) {
      const ok = await confirmDialog(
        '感情の推定を有効化しますか?\n\nこれは試験機能で、心理学的診断ではありません。応答スタイル の自動調整のためのみに使われ、推定結果はあなたにも常時表示されます。\n\n性別・年齢・民族 等での分類は行いません。',
        '感情適応モード を有効化',
      );
      if (!ok) {
        affectToggle.checked = false;
        return;
      }
      state.affect = state.affect || { history: [], current: null };
      state.affect.optedIn = true;
      persist();
      updateAffectMeters();
      auditLogBrowser('affect.opted_in', '');
      toast('感情適応モードを有効化しました', 'success');
    } else {
      if (state.affect) state.affect.optedIn = false;
      persist();
      updateAffectMeters();
      auditLogBrowser('affect.opted_out', '');
      toast('感情適応モードを無効化しました', 'success');
    }
  });
}
const affectClearBtn = document.getElementById('affectClearBtn');
if (affectClearBtn) {
  affectClearBtn.addEventListener('click', async () => {
    const ok = await confirmDialog('セッション内の感情データを全て消去しますか? (チャット履歴は残ります)');
    if (!ok) return;
    clearAffectData();
    updateAffectMeters();
    auditLogBrowser('affect.cleared', '');
    toast('感情データを消去しました', 'success');
  });
}

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

// ─────────────────────────────────────────
// Affect-aware adaptive chat (governance/15 / §10 #18 v18 で実装)
// 4 次元 PAD-like (valence / arousal / urgency / formality) を heuristic 推定し
// 応答スタイルを毎ターン適応。性別/年齢 等 protected attributes は実装上扱わない。
// 詳細: governance/15_AFFECT_ETHICS.md
// ─────────────────────────────────────────

// AFFECT_MARKERS / classifyAffect / affectStyleModifier は modules/affect.js から import 済み (v29)

// セッション履歴 (直近 10 件、可視化用)
function pushAffectHistory(a) {
  if (!state.affect) state.affect = { history: [], current: null, optedIn: false };
  state.affect.current = a;
  state.affect.history.push({ ts: Date.now(), ...a });
  if (state.affect.history.length > 10) state.affect.history.shift();
}

function clearAffectData() {
  state.affect = { history: [], current: null, optedIn: state.affect?.optedIn ?? false };
  persist();
}

// 設定 タブ の 4 次元 バー 更新
function updateAffectMeters() {
  const card = document.getElementById('affectCard');
  if (!card) return;
  const enabled = state.affect?.optedIn === true;
  card.classList.toggle('disabled', !enabled);
  const a = state.affect?.current;
  for (const dim of ['valence', 'arousal', 'urgency', 'formality']) {
    const fill = document.getElementById(`affectBar_${dim}`);
    const label = document.getElementById(`affectVal_${dim}`);
    if (!fill || !label) continue;
    const v = a ? a[dim] : 0.5;
    fill.style.width = (v * 100).toFixed(0) + '%';
    label.textContent = v.toFixed(2);
  }
}

// ─────────────────────────────────────────
// localStorage 容量メーター (governance/12 §10 #6 v8 で実装)
// 5 MB を上限に推定し、70% 警告 / 90% 危険を視覚化。
// ─────────────────────────────────────────
const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;  // 5 MB は最も保守的な見積もり
function estimateLocalStorageUsage() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key) ?? '';
      // UTF-16 で 2 byte/char と概算
      total += (key.length + val.length) * 2;
    }
  } catch {}
  return total;
}
function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
function updateStorageMeter() {
  const used = estimateLocalStorageUsage();
  const pct = Math.min(100, (used / STORAGE_LIMIT_BYTES) * 100);
  const text = document.getElementById('storageUsageText');
  const fill = document.getElementById('storageBarFill');
  const hint = document.getElementById('storageHint');
  if (text) text.textContent = `${fmtBytes(used)} / 約 5 MB (${pct.toFixed(1)}%)`;
  if (fill) {
    fill.style.width = pct + '%';
    fill.classList.remove('warn', 'danger');
    if (pct >= 90) fill.classList.add('danger');
    else if (pct >= 70) fill.classList.add('warn');
  }
  if (hint) {
    if (pct >= 90) {
      hint.textContent = '⚠️ 容量逼迫: 新規セッションが保存できなくなる恐れがあります。「全データを書き出す」→ 不要セッションを削除してください。';
      hint.style.color = '#ef4444';
    } else if (pct >= 70) {
      hint.textContent = '⚠️ 70% 超過: 古いセッションを書き出して削除する時期です。';
      hint.style.color = '#f59e0b';
    } else {
      hint.textContent = 'ブラウザの localStorage は通常 5 MB 程度。70% を超えたら不要セッションを書き出して削除してください。';
      hint.style.color = '';
    }
  }
}
// 設定タブ表示時 + 周期的更新
window.addEventListener('hashchange', () => {
  if (location.hash === '#settings') updateStorageMeter();
});
// 初回 + 30 秒ごと (タブが見える時のみ)
setTimeout(updateStorageMeter, 100);
setInterval(() => {
  if (location.hash === '#settings' && !document.hidden) updateStorageMeter();
}, 30000);

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

    auditLogBrowser('chat.send', `provider=${provider.id} model=${cfg.model} text_len=${text.length} attachments=${atts.length}`);

    // Affect-aware adaptation (governance/15, opt-in only)
    let systemPrompt = getSessionSystemPrompt(session);
    if (state.affect?.optedIn === true) {
      const affect = classifyAffect(text);
      pushAffectHistory(affect);
      const modifier = affectStyleModifier(affect);
      if (modifier) systemPrompt = (systemPrompt || '') + modifier;
      auditLogBrowser('affect.classified', '');  // 推定値そのものは記録しない
      updateAffectMeters();
    }

    try {
      const { usage } = await provider.sendStream({
        apiKey: cfg.apiKey,
        model: cfg.model,
        maxTokens: cfg.maxTokens,
        system: systemPrompt,
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
      auditLogBrowser('chat.success', `provider=${provider.id} model=${cfg.model} input=${usage?.input_tokens ?? '?'} output=${usage?.output_tokens ?? '?'}`);
      renderChat();
    } catch (err) {
      if (err.name === 'AbortError') {
        assistantMsg.content += '\n\n[ 停止しました ]';
        updateClaudeStatus('unknown', '停止');
        auditLogBrowser('chat.aborted', `provider=${provider.id}`);
      } else {
        session.history.pop();
        session.history.push({ role: 'assistant', content: `エラー: ${err.message}`, error: true });
        updateClaudeStatus('error', err.message);
        toast(err.message, 'error', 5000);
        auditLogBrowser('chat.error', `provider=${provider.id} msg=${String(err.message || '').slice(0, 100)}`);
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
/* =========================================================
   Audit Log Viewer (クライアントサイド・SHA-256 連鎖検証)
   ========================================================= */

const ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

// auditJsonEscape / reconstructAuditBody / sha256Hex / auditLogBrowser /
// exportBrowserAuditAsJsonl / BROWSER_AUDIT_KEY / BROWSER_AUDIT_MAX は
// modules/audit-browser.js から import 済 (v29 でモジュール分割)

// 重大度推測 (governance/05 系統と同じ規則)
function auditEventSeverity(event) {
  const e = String(event || '').toLowerCase();
  if (/(blocked|aborted|threat|fail|tamper|alert)/.test(e)) return 'bad';
  if (/(warn|noteworthy|hits|protected)/.test(e)) return 'warn';
  return 'info';
}

let _auditState = {
  entries: [],
  filename: '',
  verifyResult: null,
};

// レガシー互換 ヘルパ (audit-browser モジュール未使用箇所)
const _browserAuditLoad = loadBrowserAudit;

function bindAuditLoader() {
  const loader = document.getElementById('auditLoader');
  const input = document.getElementById('auditFileInput');
  if (!loader || !input) return;

  // ブラウザ audit の書き出し / 消去
  const exportBtn = document.getElementById('auditBrowserExportBtn');
  const clearBtn = document.getElementById('auditBrowserClearBtn');
  const countEl = document.getElementById('auditBrowserCount');
  const updateCount = () => {
    if (!countEl) return;
    const n = _browserAuditLoad().length;
    countEl.textContent = n ? `(${n} 件)` : '(空)';
  };
  updateCount();
  exportBtn?.addEventListener('click', () => {
    const jsonl = exportBrowserAuditAsJsonl();
    if (!jsonl) { toast('ブラウザ audit は空です', 'warn'); return; }
    const blob = new Blob([jsonl], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `browser-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    auditLogBrowser('audit.export', `count=${_browserAuditLoad().length}`);
    toast('ダウンロード開始', 'ok');
  });
  clearBtn?.addEventListener('click', async () => {
    const ok = await confirmDialog('このブラウザの audit ログを全て消去しますか？');
    if (!ok) return;
    auditLogBrowser('audit.clear', '');  // 消去前に最後の記録
    localStorage.removeItem(BROWSER_AUDIT_KEY);
    updateCount();
    toast('ブラウザ audit を消去しました', 'ok');
  });

  input.addEventListener('change', async () => {
    if (input.files?.[0]) await loadAuditFile(input.files[0]);
  });

  loader.addEventListener('dragover', e => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      loader.classList.add('dragover');
    }
  });
  loader.addEventListener('dragleave', () => loader.classList.remove('dragover'));
  loader.addEventListener('drop', async e => {
    if (e.dataTransfer?.files?.length) {
      e.preventDefault();
      loader.classList.remove('dragover');
      await loadAuditFile(e.dataTransfer.files[0]);
    }
  });

  // Filters
  document.getElementById('auditEventFilter')?.addEventListener('input', renderAuditEvents);
  document.getElementById('auditScriptFilter')?.addEventListener('input', renderAuditEvents);
  document.getElementById('auditLimit')?.addEventListener('change', renderAuditEvents);
}

async function loadAuditFile(file) {
  try {
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    const entries = [];
    const parseErrors = [];
    lines.forEach((line, i) => {
      try {
        const obj = JSON.parse(line);
        entries.push(obj);
      } catch {
        parseErrors.push({ line: i + 1, content: line.slice(0, 80) });
      }
    });
    _auditState.entries = entries;
    _auditState.filename = file.name;
    _auditState.parseErrors = parseErrors;
    toast(`読み込み完了: ${entries.length} エントリ${parseErrors.length ? ` (パース失敗 ${parseErrors.length} 行)` : ''}`, 'success');

    renderAuditSummary();
    renderAuditEvents();
    await verifyAuditChain();
  } catch (err) {
    toast(`読み込みエラー: ${err.message}`, 'error', 5000);
  }
}

function renderAuditSummary() {
  const card = document.getElementById('auditSummary');
  const body = document.getElementById('auditSummaryBody');
  if (!card || !body) return;
  card.hidden = false;
  const entries = _auditState.entries;
  if (!entries.length) { body.innerHTML = '<p class="muted">エントリ なし</p>'; return; }

  // 集計
  const tsList = entries.map(e => e.ts).filter(Boolean).sort();
  const tsFirst = tsList[0] || '-';
  const tsLast = tsList[tsList.length - 1] || '-';
  const byScript = {};
  const byEvent = {};
  for (const e of entries) {
    byScript[e.script || '?'] = (byScript[e.script || '?'] || 0) + 1;
    byEvent[e.event || '?'] = (byEvent[e.event || '?'] || 0) + 1;
  }
  const topScripts = Object.entries(byScript).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxScriptCount = topScripts[0]?.[1] || 1;
  const topEvents = Object.entries(byEvent).sort((a, b) => b[1] - a[1]).slice(0, 5);

  body.innerHTML = `
    <ul class="audit-stats">
      <li class="audit-stat"><div class="audit-stat-label">エントリ総数</div>
        <div class="audit-stat-value">${entries.length.toLocaleString()}</div></li>
      <li class="audit-stat"><div class="audit-stat-label">スクリプト数</div>
        <div class="audit-stat-value">${Object.keys(byScript).length}</div></li>
      <li class="audit-stat"><div class="audit-stat-label">イベント種類</div>
        <div class="audit-stat-value">${Object.keys(byEvent).length}</div></li>
      <li class="audit-stat"><div class="audit-stat-label">最古</div>
        <div class="audit-stat-value" style="font-size:.95rem">${escapeHtml(tsFirst.replace('T', ' ').slice(0, 19))}</div></li>
      <li class="audit-stat"><div class="audit-stat-label">最新</div>
        <div class="audit-stat-value" style="font-size:.95rem">${escapeHtml(tsLast.replace('T', ' ').slice(0, 19))}</div></li>
    </ul>

    <h3 style="margin-top:var(--sp-4)">スクリプト別 件数</h3>
    <div class="audit-script-bars">
      ${topScripts.map(([name, n]) => `
        <div class="audit-script-bar">
          <span class="audit-script-bar-name">${escapeHtml(name)}</span>
          <span class="audit-script-bar-fill" style="width:${(n / maxScriptCount * 100).toFixed(1)}%"></span>
          <span class="audit-script-bar-count">${n}</span>
        </div>
      `).join('')}
    </div>

    <h3 style="margin-top:var(--sp-4)">イベント種別 (上位 5)</h3>
    <ul style="padding-left:1.2em">
      ${topEvents.map(([name, n]) =>
        `<li><strong>${escapeHtml(name)}</strong> — ${n} 件</li>`).join('')}
    </ul>
  `;
}

async function verifyAuditChain() {
  const card = document.getElementById('auditIntegrity');
  const body = document.getElementById('auditIntegrityBody');
  if (!card || !body) return;
  card.hidden = false;
  body.innerHTML = '<p class="muted">検証中...</p>';

  const entries = _auditState.entries;
  if (!entries.length) {
    body.innerHTML = '<p class="muted">エントリ なし</p>';
    return;
  }

  let prev = ZERO_HASH;
  const breaks = [];
  let okCount = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.chain_hash || !e.prev_hash) {
      breaks.push({ line: i + 1, reason: 'chain_hash/prev_hash 抽出失敗' });
      prev = e.chain_hash || prev;
      continue;
    }
    const body_str = reconstructAuditBody(e);
    const computed = await sha256Hex(prev + body_str);
    if (computed === e.chain_hash) {
      if (e.prev_hash !== prev) {
        breaks.push({ line: i + 1, reason: `連鎖切断 (prev=${e.prev_hash.slice(0, 8)}.. 期待=${prev.slice(0, 8)}..)` });
      } else {
        okCount++;
      }
    } else {
      breaks.push({ line: i + 1, reason: '改竄疑い (chain_hash 再計算 不一致)' });
    }
    prev = e.chain_hash;
  }

  _auditState.verifyResult = { total: entries.length, ok: okCount, breaks };

  if (breaks.length === 0) {
    body.innerHTML = `
      <div class="audit-integrity-banner ok">
        ✅ チェーンは整合 — ${entries.length.toLocaleString()} エントリすべて検証成功
      </div>
      <p class="muted">SHA-256 連鎖を再計算し、改竄痕跡なし。</p>
    `;
  } else {
    body.innerHTML = `
      <div class="audit-integrity-banner bad">
        ❌ チェーン不整合: ${breaks.length} / ${entries.length} エントリで検出
      </div>
      <p>原因の候補: 並行実行による race / 手作業でのログ編集 / ローテーション境界</p>
      <ul class="audit-breaks">
        ${breaks.slice(0, 30).map(b => `<li>L${b.line}: ${escapeHtml(b.reason)}</li>`).join('')}
        ${breaks.length > 30 ? `<li class="muted">... 残り ${breaks.length - 30} 件 (省略)</li>` : ''}
      </ul>
    `;
  }
}

function renderAuditEvents() {
  const card = document.getElementById('auditEvents');
  const body = document.getElementById('auditEventsBody');
  if (!card || !body) return;
  card.hidden = false;

  const eventFilter = (document.getElementById('auditEventFilter')?.value || '').toLowerCase();
  const scriptFilter = (document.getElementById('auditScriptFilter')?.value || '').toLowerCase();
  const limit = parseInt(document.getElementById('auditLimit')?.value || '100', 10);

  let filtered = _auditState.entries.filter(e => {
    if (eventFilter && !String(e.event || '').toLowerCase().includes(eventFilter)) return false;
    if (scriptFilter && !String(e.script || '').toLowerCase().includes(scriptFilter)) return false;
    return true;
  });
  // 最新が先頭
  filtered = filtered.slice().reverse().slice(0, limit);

  if (!filtered.length) {
    body.innerHTML = '<p class="muted">該当エントリなし</p>';
    return;
  }

  const rows = filtered.map(e => {
    const sev = auditEventSeverity(e.event);
    return `<tr>
      <td class="col-ts">${escapeHtml((e.ts || '').replace('T', ' ').slice(0, 19))}</td>
      <td class="col-event severity-${sev}">${escapeHtml(e.event || '')}</td>
      <td class="col-script">${escapeHtml(e.script || '')}</td>
      <td class="col-details">${escapeHtml(e.details || '')}</td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div class="audit-table-wrap">
      <table class="audit-table">
        <thead><tr><th>時刻</th><th>イベント</th><th>スクリプト</th><th>詳細</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="muted" style="margin-top:var(--sp-2)">表示: ${filtered.length} / ${_auditState.entries.length} 件</p>
  `;
}

// ─────────────────────────────────────────
// 運用 ダッシュボード (#orchestrate ルート、v19 で実装)
// audit.jsonl をロードして KPI / 板 / breach 対応案 を可視化
// ─────────────────────────────────────────
let _orchState = { events: [] };

// localStorage 永続化 (governance/12 §10 #20 v20 で実装)
const ORCH_CACHE_KEY = 'v19.orch.audit_cache';
const ORCH_CACHE_MAX_BYTES = 500 * 1024; // 500 KB
const GOV_CACHE_KEY = 'v19.gov.docs_cache';
const GOV_CACHE_MAX_DOCS = 5;
const GOV_CACHE_MAX_BYTES_PER_DOC = 500 * 1024;

function _saveOrchCache(name, text) {
  try {
    if (text.length * 2 > ORCH_CACHE_MAX_BYTES) {
      // 大きすぎる → 末尾 N 行のみキャッシュ (古い 行 は捨てる、ヘッダなどない)
      const lines = text.split('\n');
      let acc = '';
      for (let i = lines.length - 1; i >= 0; i--) {
        const next = acc ? lines[i] + '\n' + acc : lines[i];
        if (next.length * 2 > ORCH_CACHE_MAX_BYTES) break;
        acc = next;
      }
      text = acc;
    }
    localStorage.setItem(ORCH_CACHE_KEY, JSON.stringify({ name, text, ts: Date.now() }));
  } catch (e) { /* QuotaExceeded 等は黙殺 */ }
}

function _loadOrchCache() {
  try {
    const raw = localStorage.getItem(ORCH_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function _saveGovCache(docs) {
  // LRU: 最大 5 件、各 500KB 以下、超過は古いものから削除
  const trimmed = docs.slice(-GOV_CACHE_MAX_DOCS).map(d => ({
    name: d.name,
    text: d.text.length * 2 > GOV_CACHE_MAX_BYTES_PER_DOC
          ? d.text.slice(0, Math.floor(GOV_CACHE_MAX_BYTES_PER_DOC / 2))
          : d.text,
    ts: d.ts || Date.now(),
  }));
  try {
    localStorage.setItem(GOV_CACHE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    // QuotaExceeded → さらに半分に削る
    if (trimmed.length > 1) {
      try { localStorage.setItem(GOV_CACHE_KEY, JSON.stringify(trimmed.slice(-Math.floor(trimmed.length / 2)))); } catch {}
    }
  }
}

function _loadGovCache() {
  try {
    const raw = localStorage.getItem(GOV_CACHE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function parseAuditLineSimple(line) {
  // 既存 parseAuditLine が使えるが、本モジュール用に最小版を持つ (依存削減)
  if (!line.trim()) return null;
  try { return JSON.parse(line); } catch { return null; }
}

function computeOrchestrateKPI(events) {
  // α: INV カバレッジは governance/12 が無いとブラウザ側で正確に出せない
  //    → 「最新 PDCA cycle」と「最新 INV-12 検出」のヒューリスティックに留める
  const cycles = events.filter(e => e.event === 'pdca.cycle.complete').length;
  const incidents = events.filter(e => e.event?.startsWith('incident.')).length;
  const containedIncidents = events.filter(e => e.event === 'incident.contained' || e.event === 'incident.resolved').length;
  // β: 各 sample で alpha.1.scoped → pdca.cycle.complete の経過秒
  const scoped = [];
  const completed = [];
  for (const e of events) {
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t)) continue;
    if (e.event?.endsWith('.1.scoped')) scoped.push(t);
    if (e.event === 'pdca.cycle.complete') completed.push(t);
  }
  const deltas = [];
  let ci = 0;
  for (const s of scoped) {
    while (ci < completed.length && completed[ci] < s) ci++;
    if (ci < completed.length) { deltas.push((completed[ci] - s) / 1000); ci++; }
  }
  deltas.sort((a, b) => a - b);
  const beta_median = deltas.length ? Math.round(deltas[Math.floor(deltas.length / 2)]) : 0;
  // γ: チェーン整合 (連鎖検証は audit ビューア側で実施されるため、ここでは INV-12 違反の有無)
  const inv12_violations = (() => {
    const issues = {};
    for (const e of events) {
      const m = e.event?.match(/^team\.(\w+)\.1\.scoped$/);
      if (m) {
        const team = m[1];
        const im = (e.details || '').match(/issue=(\S+)/);
        if (im) (issues[im[1]] = issues[im[1]] || new Set()).add(team);
      }
    }
    return Object.values(issues).filter(s => s.size > 1).length;
  })();
  // δ: 直近 cycle.complete までの全 cycle 数 (運用継続性 指標)
  return {
    alpha: { label: `${cycles} サイクル完遂`, sub: `INV-12: ${inv12_violations === 0 ? 'OK' : '⚠️ ' + inv12_violations}` },
    beta: { label: `${deltas.length} 件 / 中央 ${beta_median}s`, sub: 'PDCA scope→complete' },
    gamma: { label: `${containedIncidents}/${incidents} 解消`, sub: 'インシデント' },
    delta: { label: `${cycles + Math.max(0, incidents - containedIncidents)} 活動件`, sub: '完遂 + 進行中' },
  };
}

function renderOrchestrateKPI(events) {
  const kpi = computeOrchestrateKPI(events);
  for (const team of ['alpha', 'beta', 'gamma', 'delta']) {
    const v = document.getElementById(`kpi_${team}`);
    const s = document.getElementById(`kpi_${team}_sub`);
    if (v) v.textContent = kpi[team].label;
    if (s) s.textContent = kpi[team].sub;
  }
  const updEl = document.getElementById('orchestrateLastUpdate');
  if (updEl) updEl.textContent = `更新: ${new Date().toLocaleString('ja-JP')} / ${events.length} events`;
}

function renderBoard(events) {
  const list = document.getElementById('boardList');
  if (!list) return;
  const ft = document.getElementById('boardFilterTeam')?.checked;
  const fh = document.getElementById('boardFilterHandoff')?.checked;
  const fi = document.getElementById('boardFilterIncident')?.checked;
  const fc = document.getElementById('boardFilterCycle')?.checked;
  const filtered = events.filter(e => {
    const ev = e.event || '';
    if (ev.startsWith('team.') && ft) return true;
    if (ev.startsWith('handoff.') && fh) return true;
    if (ev.startsWith('incident.') && fi) return true;
    if (/cycle/.test(ev) && fc) return true;
    return false;
  }).slice(-30).reverse();
  if (!filtered.length) { list.innerHTML = '<p class="muted">該当 イベントなし</p>'; return; }
  const rows = filtered.map(e => {
    const cls = e.event?.startsWith('incident.') ? 'board-incident'
              : e.event?.startsWith('handoff.')  ? 'board-handoff'
              : 'board-team';
    const ts = (e.ts || '').replace('T', ' ').slice(0, 19);
    return `<div class="board-row ${cls}">
      <span class="board-ts">${escapeHtml(ts)}</span>
      <span class="board-event">${escapeHtml(e.event || '')}</span>
      <span class="board-details">${escapeHtml(e.details || '')}</span>
    </div>`;
  }).join('');
  list.innerHTML = rows;
}

function bindOrchestrate() {
  const fileInput = document.getElementById('orchestrateAuditInput');
  if (!fileInput) return;
  // 起動時に キャッシュ から自動復元 (リロードで消えない)
  const cached = _loadOrchCache();
  if (cached?.text) {
    const events = cached.text.split('\n').map(parseAuditLineSimple).filter(Boolean);
    _orchState.events = events;
    renderOrchestrateKPI(events);
    renderBoard(events);
    const updEl = document.getElementById('orchestrateLastUpdate');
    if (updEl) {
      const ago = Math.round((Date.now() - cached.ts) / 60000);
      updEl.textContent = `(キャッシュから復元: ${cached.name}, ${ago} 分前)`;
    }
  }
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const text = await f.text();
    const events = text.split('\n').map(parseAuditLineSimple).filter(Boolean);
    _orchState.events = events;
    renderOrchestrateKPI(events);
    renderBoard(events);
    _saveOrchCache(f.name, text);  // ロード成功で キャッシュ保存
  });
  ['boardFilterTeam', 'boardFilterHandoff', 'boardFilterIncident', 'boardFilterCycle'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => renderBoard(_orchState.events));
  });
  // propose-response (4 breach)
  const RESPONSES = {
    audit_chain_broken: {
      cat: '監査ログ 改竄疑い (INV-10 違反)',
      ir: 'governance/09_INCIDENT_PLAYBOOK.md (該当 シナリオなし → 即興 IR)',
      steps: [
        '別端末で最新 backup を verify (audit-export.sh)',
        'audit-verify.sh で改竄行を特定 (連鎖切断 行番号確認)',
        '~/.claude/audit-backups/ から復旧 (03_OPERATIONS D-4 参照)',
      ],
    },
    chat_error_storm: {
      cat: 'クラウド AI 障害 or CORS 失効',
      ir: 'governance/09 I-2 周辺',
      steps: [
        'ローカル専用モードに即切替 (設定 → ローカル専用 ON)',
        '直近の chat.error 内容確認 (#audit ビューアでフィルタ)',
        'preflight で OLLAMA_ORIGINS / API キー確認',
      ],
    },
    inv12_concurrent_scope: {
      cat: '重複着手 (INV-12 違反 / 運用問題)',
      ir: 'governance/13 §9 失敗モード',
      steps: [
        '重複 issue を特定 (board の team.*.1.scoped を確認)',
        '後発チームに撤退要請 (team.<TEAM>.1.bounce イベント)',
        'α1 が再分担',
      ],
    },
    pii_scan_stale: {
      cat: 'PII セカンドラインの 鮮度 低下 (INV-6 関連)',
      ir: 'governance/09 I-1 周辺',
      steps: [
        'pii-scan.sh --diff を即実行',
        'pii-scan.sh --staged で 直前 commit 候補も走査',
        'gitleaks があれば二次防御として走らせる',
      ],
    },
  };
  const sel = document.getElementById('proposeBreachSelect');
  const out = document.getElementById('proposeOutput');
  sel?.addEventListener('change', () => {
    const r = RESPONSES[sel.value];
    if (!r) { if (out) out.innerHTML = ''; return; }
    if (!out) return;
    out.innerHTML = `
      <h3>OODA Decide: ${escapeHtml(r.cat)}</h3>
      <p><strong>IR プレイブック:</strong> <code>${escapeHtml(r.ir)}</code></p>
      <p><strong>60 秒で実行:</strong></p>
      <ol>${r.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
    `;
  });
}

// ─────────────────────────────────────────
// 文書 ブラウザ (#governance ルート、v19 で実装)
// .md を file picker でロード → renderMarkdown でレンダ + 検索
// ─────────────────────────────────────────
let _govDocs = []; // [{ name, text, ts }, ...]

function bindGovernance() {
  const fileInput = document.getElementById('govFileInput');
  if (!fileInput) return;
  // 起動時 キャッシュから復元
  _govDocs = _loadGovCache();
  if (_govDocs.length > 0) renderGovList();
  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || []);
    for (const f of files) {
      const text = await f.text();
      const existing = _govDocs.find(d => d.name === f.name);
      if (existing) { existing.text = text; existing.ts = Date.now(); }
      else _govDocs.push({ name: f.name, text, ts: Date.now() });
    }
    // LRU + 容量超過対策のため毎回 trim (saveCache 内で実施)
    _saveGovCache(_govDocs);
    _govDocs = _loadGovCache();  // saved 反映 (trim 後の docs を使う)
    renderGovList();
  });
  document.getElementById('govSearchBox')?.addEventListener('input', renderGovList);
  document.getElementById('govCloseBtn')?.addEventListener('click', () => {
    document.getElementById('govViewerCard')?.setAttribute('hidden', '');
  });
}

function renderGovList() {
  const list = document.getElementById('govList');
  if (!list) return;
  const q = (document.getElementById('govSearchBox')?.value || '').toLowerCase().trim();
  const filtered = q
    ? _govDocs.filter(d => d.name.toLowerCase().includes(q) || d.text.toLowerCase().includes(q))
    : _govDocs;
  if (!filtered.length) {
    list.innerHTML = '<li class="muted">該当 文書なし</li>';
    return;
  }
  list.innerHTML = filtered.map((d, i) => {
    const idx = _govDocs.indexOf(d);
    const heading = (d.text.match(/^#\s+(.+)$/m) || [])[1] || d.name;
    return `<li><a href="#" data-doc-idx="${idx}">${escapeHtml(d.name)}</a> <span class="muted">— ${escapeHtml(heading.slice(0, 60))}</span></li>`;
  }).join('');
  list.querySelectorAll('a[data-doc-idx]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const idx = parseInt(a.dataset.docIdx, 10);
      const doc = _govDocs[idx];
      if (!doc) return;
      const card = document.getElementById('govViewerCard');
      const title = document.getElementById('govViewerTitle');
      const viewer = document.getElementById('govViewer');
      if (title) title.textContent = doc.name;
      if (viewer) viewer.innerHTML = renderMarkdown(doc.text);
      if (card) card.removeAttribute('hidden');
      activateCopyButtons(viewer);
    });
  });
}

function boot() {
  ensureSessions();
  applyTheme();
  applyLocalOnly();
  renderSidebar();
  renderOverview();
  initClaudeUI();
  bindClaudeUI();
  renderSessionTabs();
  bindAuditLoader();
  bindOrchestrate();
  bindGovernance();

  // Default to overview if no hash
  if (!location.hash) location.hash = '#overview';
  navigate();

  setGlobalStatus('unknown', '待機中');
}

boot();

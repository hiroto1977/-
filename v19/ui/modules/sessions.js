// v19/ui/modules/sessions.js — 会話セッション の純粋ロジック層
// 対応 governance/12 §10 #37 (PDCA #26 v37): dashboard.js 最適化再構築 完結
//
// 設計原則 (35 反復 + v36 学び):
//   - DOM 非依存 — state 操作は呼出側 (dashboard.js) に委譲
//   - 「セッションの形」(makeSession) と「タイトル推測」(deriveTitle) と
//     「次のアクティブ ID」(nextActiveSessionId) を独立関数に
//   - getSessionSystemPrompt は preset lookup を関数 注入 (依存逆転)

// 新規セッションのファクトリ — 全フィールドを最低限で初期化
export function makeSession({
  id = null, title = '新しい会話', autoTitle = true,
  history = [], presetId = null, systemPrompt = '',
} = {}) {
  const now = Date.now();
  return {
    id: id || ('sess_' + now.toString(36) + Math.random().toString(36).slice(2, 6)),
    title: title || '新しい会話',
    autoTitle,
    createdAt: now,
    updatedAt: now,
    history,
    presetId,
    systemPrompt,
  };
}

// セッションの実効 system prompt
//   1. session.systemPrompt が非空ならそれ
//   2. なければ presetId から lookup
// getPresetById は呼出側で定義 (preset カタログは dashboard.js 内)
export function getSessionSystemPrompt(session, getPresetById) {
  if (session.systemPrompt && session.systemPrompt.trim()) return session.systemPrompt;
  const preset = getPresetById ? getPresetById(session.presetId) : null;
  return preset ? preset.systemPrompt : '';
}

// 履歴の最初の user メッセージから タイトル を推測
// content が string でも parts 配列でも動くよう、textOf/hasImages を 関数注入
export function deriveTitleFromHistory(history, { textOf, hasImages }) {
  const first = (history || []).find(m => m.role === 'user');
  if (!first) return '新しい会話';
  const text = (typeof first.content === 'string')
    ? first.content
    : (textOf(first.content) || (hasImages(first.content) ? '🖼 画像' : ''));
  return text.replace(/\s+/g, ' ').trim().slice(0, 30) || '新しい会話';
}

// タイトル正規化 — 60 文字 cap + 空文字 fallback
export function sanitizeTitle(raw) {
  const t = String(raw || '').trim().slice(0, 60);
  return t || '新しい会話';
}

// セッション削除時の次のアクティブ ID を計算
// 仕様 (governance/12 §INV — UI 連続性):
//   - 削除対象がアクティブ → 同じ位置の前のセッション (なければ 0 番)
//   - 削除対象が非アクティブ → 現在アクティブ ID を維持
//   - 全削除後 → null (呼出側で makeSession して push)
export function nextActiveSessionId(sessions, deletedIdx, currentActiveId, deletedId) {
  if (!sessions.length) return null;
  if (currentActiveId !== deletedId) return currentActiveId;
  const idx = Math.max(0, deletedIdx - 1);
  return sessions[idx]?.id ?? sessions[0].id;
}

// state.chat.sessions 配列 の整合性 を保つ — 既存セッションがゼロ または
// activeSessionId が見つからない場合に セッションを新規作成 / リセットして整える
// 戻り値: 何か変更があったかどうか (UI 再描画判定 に使う)
export function ensureSessionsShape(stateChat) {
  if (!stateChat.sessions || !stateChat.sessions.length) {
    const s = makeSession();
    stateChat.sessions = [s];
    stateChat.activeSessionId = s.id;
    return true;
  }
  if (!stateChat.sessions.find(x => x.id === stateChat.activeSessionId)) {
    stateChat.activeSessionId = stateChat.sessions[0].id;
    return true;
  }
  return false;
}

// セッション ID → セッション or 先頭 (見つからなければ)
export function getActiveSessionFrom(sessions, activeId) {
  return sessions.find(x => x.id === activeId) || sessions[0] || null;
}

// 書き出し用 ファイル名 (記号を - に正規化、40 字 cap)
export function exportFileName(title, kind = 'session', date = new Date()) {
  const safe = String(title || '').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40) || kind;
  const ymd = date.toISOString().slice(0, 10);
  return `claude-${safe}-${ymd}.md`;
}

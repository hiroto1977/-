/**
 * 村の会話の出し分け。送り先は既存の /api/chat（1対1）と /api/topic（組織全体）。
 * ここは表示の判断だけを持つ。モデル呼び出しは council.py のまま。
 */

export function talkRequest(to, text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const target = String(to ?? '');
  if (target) return { path: '/api/chat', body: { to: target, text: t }, mode: 'one' };
  return { path: '/api/topic', body: { to: '', text: t }, mode: 'group' };
}

/** モデル停止・空応答・サーバ拒否。会議の行と 1 対 1 の両方で使う。 */
export function replyFailed(model, text) {
  const t = String(text ?? '');
  return model === 'none' || t.includes('応答なし') || t.includes('受け取れません') || t.includes('送れません');
}

export function oneOutcome(httpOk, body) {
  const b = body && typeof body === 'object' ? body : {};
  const who = typeof b.who === 'string' && b.who ? b.who : '相手';
  const id = typeof b.id === 'string' ? b.id : '';
  const text = typeof b.text === 'string' ? b.text.trim() : '';
  if (!httpOk || !text) {
    return {
      failed: true, who, id,
      status: '返答を受け取れませんでした。村のサーバが断ったか、応答が空でした。',
      bubble: '（返答を受け取れませんでした）',
    };
  }
  const bubble = text.replace(/\s+/g, ' ');
  if (replyFailed(b.model, text)) {
    return {
      failed: true, who, id,
      status: `${who} から応答がありません。ローカルモデルが止まっているか、日本語の応答を作れませんでした。`,
      bubble,
    };
  }
  return { failed: false, who, id, status: `${who} の返答`, bubble };
}

export function groupAck() {
  return '組織全体へ届けました。COOが会議にかけ、各役の発言を下の会議欄に残します。';
}

export function pendingNote(pending, meeting) {
  const n = Number(pending);
  if (!Number.isFinite(n) || n <= 0 || meeting) return '';
  return `議題 ${n} 件が会議待ちです`;
}

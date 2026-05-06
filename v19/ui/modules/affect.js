// v19/ui/modules/affect.js — Affect-aware adaptive chat (governance/15)
//
// 4 次元 PAD-like (valence / arousal / urgency / formality) を heuristic 推定。
// 性別/年齢/民族 等 protected attributes は実装上扱わない (テストで担保)。
//
// 詳細: governance/15_AFFECT_ETHICS.md

// ── 推定マーカ (透明性のため公開) ──
export const AFFECT_MARKERS = {
  valence_pos: ['ありがと', 'いいね', '最高', '素晴らし', 'すごい', '成功', '助かっ', 'うまくいっ', 'OK', 'いい感じ', '完璧', '神'],
  valence_neg: ['困っ', 'だめ', '無理', '最悪', '嫌だ', '失敗', 'エラー', 'うまくいかな', 'できな', 'やめ', 'つらい', 'しんどい', 'バグ'],
  urgency_hi: ['急', 'すぐ', '至急', '今日中', '明日まで', '助けて', 'ASAP', '緊急', '間に合', '早く', 'やばい'],
  formality_hi_endings: ['です。', 'ます。', 'です', 'ます', 'ございます', 'いたします', 'お願いいたします', '存じます', '申し上げ'],
  formality_lo_markers: ['だよ', 'じゃん', 'だね', 'やん', 'っしょ', 'かな〜'],
};

const _clamp01 = (x) => Math.max(0, Math.min(1, x));
const _count = (text, list) => list.reduce((n, m) => n + text.split(m).length - 1, 0);

// 4 次元 + evidence
export function classifyAffect(text) {
  const empty = { valence: 0.5, arousal: 0.5, urgency: 0.5, formality: 0.5, evidence: { length: 0 } };
  if (typeof text !== 'string' || !text.trim()) return empty;
  const t = text.trim();
  const len = t.length;
  const pos = _count(t, AFFECT_MARKERS.valence_pos);
  const neg = _count(t, AFFECT_MARKERS.valence_neg);
  const valence = _clamp01(0.5 + (pos - neg) * 0.15);
  const exclam = (t.match(/[!!]/g) || []).length;
  const question = (t.match(/[??]/g) || []).length;
  const repeat = (t.match(/(.)\1{2,}/g) || []).length;
  const emoji = (t.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
  const arousal = _clamp01(0.3 + exclam * 0.15 + question * 0.05 + repeat * 0.2 + emoji * 0.1);
  const urg = _count(t, AFFECT_MARKERS.urgency_hi);
  const urgency = _clamp01(0.3 + urg * 0.25);
  const formHi = _count(t, AFFECT_MARKERS.formality_hi_endings);
  const formLo = _count(t, AFFECT_MARKERS.formality_lo_markers);
  const endsPeriod = /[。.]\s*$/.test(t) ? 1 : 0;
  const formality = _clamp01(0.5 + (formHi - formLo) * 0.18 + endsPeriod * 0.05);
  return {
    valence, arousal, urgency, formality,
    evidence: { length: len, pos, neg, exclam, question, repeat, emoji, urg, formHi, formLo, endsPeriod }
  };
}

// 4 次元 → system prompt modifier
export function affectStyleModifier(a) {
  if (!a) return '';
  const lines = [];
  if (a.urgency > 0.7) lines.push('ユーザーは急いでいます。前置きを省き短く即答してください。');
  if (a.valence < 0.35) lines.push('ユーザーは困っているか不快を示しています。共感を示しつつ問題解決にフォーカスしてください。');
  if (a.formality > 0.7) lines.push('ユーザーは丁寧語で話しています。敬語で論理的に応答してください。');
  if (a.formality < 0.35 && a.arousal > 0.6) lines.push('ユーザーは砕けた高テンションです。フランクに、ただし内容は正確に。');
  if (a.arousal < 0.3 && a.formality > 0.5) lines.push('ユーザーは落ち着いて丁寧です。じっくり詳細に応答してください。');
  if (lines.length === 0) return '';
  return '\n\n[応答スタイル ヒント (heuristic 推定): ' + lines.join(' ') + ']';
}

'use strict';

/**
 * education — 検証済み知識から学習素材（フラッシュカード・クイズ）を決定論生成する。
 *
 * 幻覚ゼロの原則: 生成物は既存の構造化フィールド（title / summary / category）の
 * コピー・切詰め・並べ替えのみで作る。新しい散文・数値・固有名詞は一切合成しない。
 * 誤答選択肢（distractor）も実在する同カテゴリ概念のタイトルから決定論的に選ぶ。
 */

function byIdAsc(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** summary の先頭 1〜2 文（最大 maxLen 字）を返す。文境界は「。」。 */
function leadSentences(summary, maxLen = 220) {
  const s = String(summary || '').trim();
  if (!s) return '';
  const parts = s.split('。');
  let out = '';
  for (const p of parts) {
    if (!p.trim()) continue;
    const next = out ? `${out}${p}。` : `${p}。`;
    if (out && next.length > maxLen) break;
    out = next;
    if (out.length >= maxLen * 0.6 && out.split('。').length > 2) break;
  }
  return out.length > maxLen ? `${out.slice(0, maxLen - 1)}…` : out;
}

/** タイトルから括弧・副題を落とした短い表示名。 */
function shortTitle(title) {
  return String(title || '')
    .replace(/[—―‐-]{2,}.*$/u, '')
    .replace(/[（(【［].*?[）)】］]/gu, '')
    .trim();
}

/**
 * フラッシュカード: 表=タイトル、裏=summary 先頭文。1 概念 1 枚。
 * @returns {Array<{id,ref,collection,category,front,back}>} id 昇順
 */
function buildFlashcards(entries) {
  return [...entries]
    .filter((e) => (e.summary || '').trim().length > 0)
    .sort((x, y) => byIdAsc(x.id, y.id))
    .map((e) => ({
      id: `fc-${e.id}`,
      ref: e.id,
      collection: e.collection,
      category: e.category,
      front: e.title,
      back: leadSentences(e.summary),
    }));
}

/**
 * 4 択クイズ: 問題文= summary 先頭文（概念名を伏せない素朴な想起問題）、
 * 正答=タイトル、誤答=同カテゴリの実在タイトル 3 件（id 昇順リングで決定論選択）。
 * 同カテゴリが 4 件未満なら同コレクションから補充。選択肢はタイトル昇順に並べる。
 * @returns {Array<{id,ref,collection,category,question,options,answer}>}
 */
function buildQuiz(entries) {
  const list = [...entries]
    .filter((e) => (e.summary || '').trim().length >= 40)
    .sort((x, y) => byIdAsc(x.id, y.id));
  const byCategory = new Map();
  const byCollection = new Map();
  for (const e of list) {
    const ck = `${e.collection}:${e.category}`;
    (byCategory.get(ck) || byCategory.set(ck, []).get(ck)).push(e);
    (byCollection.get(e.collection) || byCollection.set(e.collection, []).get(e.collection)).push(e);
  }

  const out = [];
  for (const e of list) {
    const ck = `${e.collection}:${e.category}`;
    const pool = byCategory.get(ck) || [];
    const idx = pool.findIndex((x) => x.id === e.id);
    const distractors = [];
    // 同カテゴリの id 昇順リングで次の 3 件（タイトルが正答と同一のものは除外）
    for (let step = 1; distractors.length < 3 && step <= pool.length - 1; step++) {
      const cand = pool[(idx + step) % pool.length];
      if (cand.id !== e.id && shortTitle(cand.title) !== shortTitle(e.title)) distractors.push(cand.title);
    }
    // 不足分は同コレクション（id 昇順リング）から補充
    if (distractors.length < 3) {
      const cpool = byCollection.get(e.collection) || [];
      const cidx = cpool.findIndex((x) => x.id === e.id);
      for (let step = 1; distractors.length < 3 && step <= cpool.length - 1; step++) {
        const cand = cpool[(cidx + step) % cpool.length];
        if (
          cand.id !== e.id &&
          shortTitle(cand.title) !== shortTitle(e.title) &&
          !distractors.includes(cand.title)
        )
          distractors.push(cand.title);
      }
    }
    if (distractors.length < 3) continue; // 誤答を実在タイトルで揃えられない場合は出題しない
    const options = [e.title, ...distractors].sort(byIdAsc);
    out.push({
      id: `qz-${e.id}`,
      ref: e.id,
      collection: e.collection,
      category: e.category,
      question: `次の説明に当てはまる概念・制度はどれか。「${leadSentences(e.summary, 180)}」`,
      options,
      answer: options.indexOf(e.title),
    });
  }
  return out;
}

module.exports = { buildFlashcards, buildQuiz, leadSentences, shortTitle };

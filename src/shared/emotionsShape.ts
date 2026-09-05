/**
 * Emotions の保存要素の形 —— **両ビルドで 1 つだけ持つ。**
 *
 * ブラウザ版 (`renderer/data/emotionsWeb.ts`) は localStorage、デスクトップ版
 * (`main/clients/emotions.ts`) は userData の JSON に同じ形を残す。どちらも 2026-09-05 まで
 * 「moods / analyses が配列か」だけを見て要素は信じていた —— null が 1 つ混じると `m.date` で落ち、
 * `score: '3'` は平均を NaN にする。要素の形の判定を片側にだけ書くと、次に直したときにまた
 * ずれる (`emotionsLimits.ts` と同じ理由でここに置く)。
 */

export interface MoodEntryShape {
  date: string; // YYYY-MM-DD
  score: number; // 1..5
  note: string;
}

export interface AnalysisEntryShape {
  id: string;
  timestamp: number;
  excerpt: string;
  scores: Record<string, number>;
  sentiment: 'positive' | 'neutral' | 'negative';
  dominant: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 保存された気分 1 件の形 (log-mood が書く形)。 */
export function isMoodEntry(value: unknown): value is MoodEntryShape {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    typeof value.score === 'number' &&
    Number.isFinite(value.score) &&
    typeof value.note === 'string'
  );
}

/** 保存された分析 1 件の形 (analyze-text が書く形)。 */
export function isAnalysisEntry(value: unknown): value is AnalysisEntryShape {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.timestamp === 'number' &&
    typeof value.excerpt === 'string' &&
    isRecord(value.scores) &&
    Object.values(value.scores).every((n) => typeof n === 'number') &&
    (value.sentiment === 'positive' || value.sentiment === 'neutral' || value.sentiment === 'negative') &&
    typeof value.dominant === 'string'
  );
}

/**
 * 保存された配列の欄を読む。欄が無いのは古い形 (= 空)。欄が在るのに配列でない・形の違う要素が混じる、は
 * **在るのに読めない** —— 残りを返し、`dropped` で知らせる (読み出しは続け、書き込みは呼び出し側が断る)。
 */
export function readStoredList<T>(field: unknown, is: (v: unknown) => v is T): { items: T[]; dropped: number } {
  if (field === undefined) return { items: [], dropped: 0 };
  if (!Array.isArray(field)) return { items: [], dropped: 1 };
  const items = field.filter(is);
  return { items, dropped: field.length - items.length };
}

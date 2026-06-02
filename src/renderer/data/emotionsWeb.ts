/**
 * ブラウザ版 Emotions サポート (log-mood / analyze-text / clear-history)。
 *
 * Electron 版は main が userData の JSON にストアを永続化するが、ブラウザ版は
 * localStorage に保存する。analyze-text の Anthropic 呼び出しだけは web-shim 側で
 * 行う (Vault のキーを使うため)。ここは純粋ロジック + localStorage のみ。
 */

export const EMOTION_KEYS = ['joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust'] as const;
export type EmotionKey = (typeof EMOTION_KEYS)[number];
export type EmotionScores = Record<EmotionKey, number>;
export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface MoodEntry {
  date: string; // YYYY-MM-DD
  score: number; // 1..5
  note: string;
}

export interface AnalysisEntry {
  id: string;
  timestamp: number;
  excerpt: string;
  scores: EmotionScores;
  sentiment: Sentiment;
  dominant: string;
}

export interface EmotionsStore {
  moods: MoodEntry[];
  analyses: AnalysisEntry[];
}

export interface EmotionsSnapshot extends EmotionsStore {
  keyConfigured: boolean;
}

export const EMOTIONS_STORE_KEY = 'emotions.store';
const MAX_ANALYSES = 50;
const MAX_MOODS = 365;

export function loadStore(): EmotionsStore {
  try {
    const raw = localStorage.getItem(EMOTIONS_STORE_KEY);
    if (!raw) return { moods: [], analyses: [] };
    const parsed = JSON.parse(raw) as Partial<EmotionsStore>;
    return {
      moods: Array.isArray(parsed.moods) ? parsed.moods : [],
      analyses: Array.isArray(parsed.analyses) ? parsed.analyses : [],
    };
  } catch {
    return { moods: [], analyses: [] };
  }
}

function saveStore(store: EmotionsStore): void {
  localStorage.setItem(EMOTIONS_STORE_KEY, JSON.stringify(store));
}

function todayLocal(now: number = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface LogMoodPayload {
  date?: unknown;
  score?: unknown;
  note?: unknown;
}

/** 気分を記録する (同日があれば置換)。Electron 版 logMood と同じ規則。 */
export function logMood(payload: unknown, now: number = Date.now()): { date: string; score: number } {
  const { date, score, note } = (payload ?? {}) as LogMoodPayload;
  const finalScore = Number(score);
  if (!Number.isFinite(finalScore) || finalScore < 1 || finalScore > 5) {
    throw new Error('score must be a number between 1 and 5');
  }
  const finalDate =
    (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null) ?? todayLocal(now);
  const store = loadStore();
  const idx = store.moods.findIndex((m) => m.date === finalDate);
  const entry: MoodEntry = { date: finalDate, score: Math.round(finalScore), note: String(note ?? '') };
  if (idx >= 0) store.moods[idx] = entry;
  else store.moods.push(entry);
  store.moods.sort((a, b) => a.date.localeCompare(b.date));
  if (store.moods.length > MAX_MOODS) store.moods = store.moods.slice(-MAX_MOODS);
  saveStore(store);
  return { date: finalDate, score: entry.score };
}

/** 履歴をクリアする。戻り値はクリア前の件数。 */
export function clearHistory(kind: 'moods' | 'analyses' | 'all' | undefined): { moods: number; analyses: number } {
  const store = loadStore();
  const before = { moods: store.moods.length, analyses: store.analyses.length };
  if (kind === 'moods' || kind === 'all' || kind === undefined) store.moods = [];
  if (kind === 'analyses' || kind === 'all') store.analyses = [];
  saveStore(store);
  return before;
}

/** ```json フェンスがあれば剥がす。 */
export function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fence && fence[1] != null) return fence[1].trim();
  return text.trim();
}

function pickDominant(scores: EmotionScores): string {
  let bestKey: EmotionKey = 'joy';
  let bestVal = -1;
  for (const k of EMOTION_KEYS) {
    if (scores[k] > bestVal) {
      bestVal = scores[k];
      bestKey = k;
    }
  }
  return bestVal <= 0 ? 'mixed' : bestKey;
}

/** モデル応答を正規の形にクランプする。 */
export function normalizeAnalysis(raw: unknown): { scores: EmotionScores; sentiment: Sentiment; dominant: string } {
  const r = (raw ?? {}) as { scores?: unknown; sentiment?: unknown; dominant?: unknown };
  const scoresInput = (r.scores ?? {}) as Record<string, unknown>;
  const scores = {} as EmotionScores;
  for (const k of EMOTION_KEYS) {
    const v = Number(scoresInput[k]);
    scores[k] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
  }
  const sentiment: Sentiment =
    r.sentiment === 'positive' || r.sentiment === 'negative' ? r.sentiment : 'neutral';
  const dominant =
    typeof r.dominant === 'string' && (EMOTION_KEYS as readonly string[]).concat('mixed').includes(r.dominant)
      ? r.dominant
      : pickDominant(scores);
  return { scores, sentiment, dominant };
}

/** 解析結果を AnalysisEntry にし、localStorage に保存して返す。 */
export function recordAnalysis(
  text: string,
  source: string | undefined,
  normalized: { scores: EmotionScores; sentiment: Sentiment; dominant: string },
  now: number = Date.now(),
): AnalysisEntry {
  const entry: AnalysisEntry = {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
    excerpt: (source ? `[${source}] ` : '') + text.slice(0, 80),
    ...normalized,
  };
  const store = loadStore();
  store.analyses.unshift(entry);
  if (store.analyses.length > MAX_ANALYSES) store.analyses = store.analyses.slice(0, MAX_ANALYSES);
  saveStore(store);
  return entry;
}

export const ANALYZE_SYSTEM = `You analyze the emotional content of user-provided text.
Return ONLY valid JSON in this exact shape, with no surrounding prose or markdown:
{
  "scores": {
    "joy": 0.0,
    "sadness": 0.0,
    "anger": 0.0,
    "fear": 0.0,
    "surprise": 0.0,
    "disgust": 0.0
  },
  "sentiment": "positive" | "neutral" | "negative",
  "dominant": "joy" | "sadness" | "anger" | "fear" | "surprise" | "disgust" | "mixed"
}
Each score is between 0.0 and 1.0. They do not need to sum to 1.`;

/** UI 用スナップショット (Electron 版 fetchEmotionsSnapshot と同形)。 */
export function buildEmotionsSnapshot(keyConfigured: boolean): EmotionsSnapshot {
  const store = loadStore();
  return {
    moods: store.moods.slice(-30),
    analyses: store.analyses.slice(0, 10),
    keyConfigured,
  };
}

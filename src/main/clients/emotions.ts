/**
 * Emotions service: a small "self-knowledge" panel.
 *
 *   1. Mood journal — daily 1-5 score + optional note, stored as JSON
 *      in the Electron userData dir. No external calls.
 *
 *   2. Text emotion analyzer — sends a paragraph to the Anthropic
 *      Messages API and asks for a 6-axis emotion vector (joy /
 *      sadness / anger / fear / surprise / disgust), plus overall
 *      sentiment and a dominant-emotion label. Cached locally so a
 *      reload doesn't lose context.
 *
 * Token (when present) is ANTHROPIC_API_KEY — same secret slot as the
 * Skills tab uses. The fetcher works without a key (mood journal is
 * always available); the analyze-text action requires it.
 *
 * Multi-modal facial / vocal analysis (Hume EVI, etc.) is on the
 * roadmap in docs/EMOTIONS_SETUP.md but intentionally not wired here
 * — text covers ~80% of business communication signals at zero added
 * complexity.
 */

import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  jsonFetch,
  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';

const EMOTION_KEYS = ['joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust'] as const;
type EmotionKey = (typeof EMOTION_KEYS)[number];
type EmotionScores = Record<EmotionKey, number>;

type Sentiment = 'positive' | 'neutral' | 'negative';

interface MoodEntry {
  date: string; // YYYY-MM-DD
  score: number; // 1..5
  note: string;
}

interface AnalysisEntry {
  id: string;
  timestamp: number;
  excerpt: string;
  scores: EmotionScores;
  sentiment: Sentiment;
  dominant: string;
}

interface EmotionsStore {
  moods: MoodEntry[];
  analyses: AnalysisEntry[];
}

export interface EmotionsSnapshot extends EmotionsStore {
  keyConfigured: boolean;
}

const MAX_ANALYSES = 50;
const MAX_MOODS = 365;

function storePath(): string {
  return path.join(app.getPath('userData'), 'service-hub-emotions.json');
}

async function readStore(): Promise<EmotionsStore> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<EmotionsStore>;
    return {
      moods: Array.isArray(parsed.moods) ? parsed.moods : [],
      analyses: Array.isArray(parsed.analyses) ? parsed.analyses : [],
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { moods: [], analyses: [] };
    throw err;
  }
}

async function writeStore(store: EmotionsStore): Promise<void> {
  await fs.mkdir(path.dirname(storePath()), { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify(store), { mode: 0o600 });
}

export async function fetchEmotionsSnapshot(ctx: FetchContext): Promise<EmotionsSnapshot> {
  const store = await readStore();
  return {
    moods: store.moods.slice(-30), // last month in the UI by default
    analyses: store.analyses.slice(0, 10), // most recent 10
    keyConfigured: Boolean(ctx.token),
  };
}

// --- write-side actions --------------------------------------------------

interface LogMoodPayload {
  date?: string; // defaults to today (local)
  score: number; // 1..5
  note?: string;
}

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function logMood(ctx: ActionContext): Promise<{ date: string; score: number }> {
  void ctx; // signature parity with other actions; no remote call needed
  const { date, score, note } = ctx.payload as unknown as LogMoodPayload;
  const finalScore = Number(score);
  if (!Number.isFinite(finalScore) || finalScore < 1 || finalScore > 5) {
    throw new Error('score must be a number between 1 and 5');
  }
  const finalDate = (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null) ?? todayLocal();
  const store = await readStore();
  // Replace today's entry if it exists, else append.
  const idx = store.moods.findIndex((m) => m.date === finalDate);
  const entry: MoodEntry = { date: finalDate, score: Math.round(finalScore), note: String(note ?? '') };
  if (idx >= 0) store.moods[idx] = entry;
  else store.moods.push(entry);
  store.moods.sort((a, b) => a.date.localeCompare(b.date));
  if (store.moods.length > MAX_MOODS) store.moods = store.moods.slice(-MAX_MOODS);
  await writeStore(store);
  return { date: finalDate, score: entry.score };
}

interface AnalyzeTextPayload {
  text: string;
  /** Optional human-readable tag for the history view (e.g. "Slack #general"). */
  source?: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
}

const ANALYZE_SYSTEM = `You analyze the emotional content of user-provided text.
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

/** Strip ```json fences if the model added them. */
export function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fence) return fence[1].trim();
  return text.trim();
}

/** Validate + clamp a model-returned object into the canonical shape. */
export function normalizeAnalysis(raw: unknown): {
  scores: EmotionScores;
  sentiment: Sentiment;
  dominant: string;
} {
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

async function analyzeText(ctx: ActionContext): Promise<AnalysisEntry> {
  const { text, source } = ctx.payload as unknown as AnalyzeTextPayload;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('text is required');
  }
  if (!ctx.token) throw new Error('Anthropic API key required for analyze-text');

  const res = await jsonFetch<AnthropicResponse>(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': ctx.token,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', // fast + cheap; sufficient for short text
        max_tokens: 512,
        system: ANALYZE_SYSTEM,
        messages: [{ role: 'user', content: text }],
      }),
    },
    { fetch: ctx.fetch, serviceId: 'emotions' },
  );

  const body = res.content?.find((c) => c.type === 'text')?.text ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(body));
  } catch {
    throw new Error('Anthropic returned a non-JSON response: ' + body.slice(0, 80));
  }
  const normalized = normalizeAnalysis(parsed);

  const entry: AnalysisEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    excerpt: (source ? `[${source}] ` : '') + text.slice(0, 80),
    ...normalized,
  };

  const store = await readStore();
  store.analyses.unshift(entry);
  if (store.analyses.length > MAX_ANALYSES) store.analyses = store.analyses.slice(0, MAX_ANALYSES);
  await writeStore(store);
  return entry;
}

async function clearHistory(ctx: ActionContext): Promise<{ moods: number; analyses: number }> {
  const { kind } = ctx.payload as unknown as { kind?: 'moods' | 'analyses' | 'all' };
  const store = await readStore();
  const before = { moods: store.moods.length, analyses: store.analyses.length };
  if (kind === 'moods' || kind === 'all' || kind === undefined) store.moods = [];
  if (kind === 'analyses' || kind === 'all') store.analyses = [];
  await writeStore(store);
  return before;
}

export const ACTIONS: ActionMap = {
  'log-mood': logMood,
  'analyze-text': analyzeText,
  'clear-history': clearHistory,
};

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
import {
  MAX_ANALYSES,
  MAX_ANALYZE_TEXT_CHARS,
  MAX_MOODS,
  MAX_MOOD_NOTE_CHARS,
} from '../../shared/emotionsLimits';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../atomicWrite';
import {
  jsonFetch,
  redactForMessage,
  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';
import { ANTHROPIC_FAST_MODEL } from '../../shared/ai/providers';
import { localIsoDate } from '../../shared/localDate';


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


function storePath(): string {
  return path.join(app.getPath('userData'), 'service-hub-emotions.json');
}

async function readStore(): Promise<EmotionsStore> {
  try {
    // encoding を空にすると Buffer が返るが、`JSON.parse` は toString()
    // 経由で読むため結果は変わらない (実測)。型のために明示している。
    // Stryker disable next-line StringLiteral: 空文字でも Buffer 経由で同じ結果 (実測)
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

/**
 * 気分の記録を保存する。**`atomicWriteFile` を通す** (`secrets.ts` と同じ)。
 *
 * 素の `fs.writeFile` には 2 つの穴があった (2026-08-23 実測):
 *
 * 1. **`mode` は新規作成のときしか効かない。** `{ mode: 0o600 }` は
 *    2026-08-13 の修正で足されたが、**それ以前に作られたファイルは 644 のまま**で、
 *    以後どれだけ書き込んでも直らない。実測:
 *
 *      既存 644 のファイルへ writeFile(..., {mode: 0o600}) → **644 のまま**
 *
 *    `atomicWriteFile` は 0600 で作った一時ファイルを `rename` で被せるので、
 *    **次の書き込みで既存の緩い権限も直る** (実測で確認)。
 *    ここに入るのは気分のメモ (自由記述) で、同じ機械の他の利用者に
 *    読まれてよいものではない。
 *
 * 2. **途中で落ちると切れたファイルが残る。** `readStore` は ENOENT だけを
 *    飲んで壊れた JSON は投げ直す (それ自体は正しい —— 黙って消すより良い) ので、
 *    切れたファイルが残ると機能が使えなくなる。`atomicWriteFile` は
 *    書き切って fsync してから rename するので、この窓が無い。
 *
 * 控え (`keepBackup`) は取らない —— 読み出し側が使わない控えは、
 * 同じ個人情報の写しがもう 1 つディスクに残るだけになる。
 */
async function writeStore(store: EmotionsStore): Promise<void> {
  // Stryker disable next-line ObjectLiteral: `atomicWriteFile` の既定が
  // `opts.mode ?? 0o600` なので、落としても同じ 600 で作られる (等価変異)。
  // 明示を残すのは意図の表明 —— 個人情報を持つファイルの権限を、
  // 呼び出し側の既定値に委ねない。
  await atomicWriteFile(storePath(), JSON.stringify(store), { mode: 0o600 });
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

/** 利用者の時計の今日。共有の `localIsoDate` に寄せた (同じ関数が renderer にもあった)。 */
function todayLocal(): string {
  return localIsoDate();
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
  // note の上限。当初「ブラウザ版だけが持っていた」と書いたが**それは誤り**で、
  // ブラウザ版の `log-mood` も素通しだった (同日実測・`emotionsLimits.ts` の訂正を参照)。
  // 今は両方がこの定数を見る。保存先が際限なく育つのを止める。
  const noteStr = String(note ?? '');
  if (noteStr.length > MAX_MOOD_NOTE_CHARS) {
    throw new Error(`note exceeds ${MAX_MOOD_NOTE_CHARS} chars`);
  }
  const entry: MoodEntry = { date: finalDate, score: Math.round(finalScore), note: noteStr };
  if (idx >= 0) store.moods[idx] = entry;
  else store.moods.push(entry);
  store.moods.sort((a, b) => a.date.localeCompare(b.date));
  // `slice(-MAX)` は要素数がそれ以下なら元の配列と同じものを返すので、
  // 長さの判定は要らない。判定を残すと「常に切る / 常に切らない」の
  // どちらに変異させても結果が変わらない検査不能な分岐になる。
  store.moods = store.moods.slice(-MAX_MOODS);
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
  // `?.[1]` で受けると「一致したか」の判定が 1 つで済む。`fence &&` と
  // `fence[1] != null` の 2 段だと、後段は一致時に必ず非 null なので
  // どちらへ変異させても結果が変わらない検査不能な分岐になっていた。
  const captured = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)?.[1];
  if (captured !== undefined) return captured.trim();
  return text.trim();
}

/** モデルが申告した代表感情が、こちらの知っている札かどうか。
 *  `unknown` のまま照合するので `typeof` の前置きは要らない —
 *  文字列でない値は `includes` の時点で一致しない。 */
function isDominantLabel(value: unknown): value is string {
  return (EMOTION_KEYS as readonly unknown[]).concat('mixed').includes(value);
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
  const dominant = isDominantLabel(r.dominant) ? r.dominant : pickDominant(scores);
  return { scores, sentiment, dominant };
}

function pickDominant(scores: EmotionScores): string {
  // 初期値を置かない reduce は先頭要素から始まるので、`'joy'` と `-1` の
  // 番兵が要らない。番兵は必ず 1 周目で上書きされるため、どんな値へ
  // 変異させても結果が変わらず、測っても何も分からない場所だった。
  // 同点のときは先に並んでいるほうを採る (`>` であって `>=` ではない)。
  const best = EMOTION_KEYS.reduce((a, b) => (scores[b] > scores[a] ? b : a));
  return scores[best] <= 0 ? 'mixed' : best;
}

async function analyzeText(ctx: ActionContext): Promise<AnalysisEntry> {
  const { text, source } = ctx.payload as unknown as AnalyzeTextPayload;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('text is required');
  }
  // 上限はブラウザ版だけが持っていた (2026-08-23)。**境界の側が緩かった**ので
  // 揃える —— この本文は Anthropic の要求本文へそのまま載る。
  if (text.length > MAX_ANALYZE_TEXT_CHARS) {
    throw new Error(`text exceeds ${MAX_ANALYZE_TEXT_CHARS} chars`);
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
        model: ANTHROPIC_FAST_MODEL, // fast + cheap; sufficient for short text
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
    throw new Error('Anthropic returned a non-JSON response: ' + redactForMessage(body, 80));
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
  // 上と同じ理由 — `slice(0, MAX)` は短い配列に対しては恒等。
  store.analyses = store.analyses.slice(0, MAX_ANALYSES);
  await writeStore(store);
  return entry;
}

/**
 * `clear-history` が renderer から受け取る形。
 *
 * 未指定は「気分だけ消す」に倒す (履歴を丸ごと消すのは `'all'` を明示した
 * ときだけ)。名前を付けてあるのは payload 表と突き合わせるため (2026-09-01)。
 */
interface ClearHistoryPayload {
  kind?: 'moods' | 'analyses' | 'all';
}

async function clearHistory(ctx: ActionContext): Promise<{ moods: number; analyses: number }> {
  const { kind } = ctx.payload as unknown as ClearHistoryPayload;
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

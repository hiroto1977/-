/**
 * ブラウザ版 Emotions サポート (log-mood / analyze-text / clear-history)。
 *
 * Electron 版は main が userData の JSON にストアを永続化するが、ブラウザ版は
 * localStorage に保存する。analyze-text の Anthropic 呼び出しだけは web-shim 側で
 * 行う (Vault のキーを使うため)。ここは純粋ロジック + localStorage のみ。
 */

import { MAX_ANALYSES, MAX_MOODS, MAX_MOOD_NOTE_CHARS } from '../../shared/emotionsLimits';
import { localIsoDate } from '../../shared/localDate';

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

/**
 * 「在るが読めなかった」ことを表す印。
 *
 * `loadStore` は読めなかったときも空を返す —— 読み出しとしては正しい
 * (画面が落ちるより空の方がまし)。だが**その空を土台にして書くと、
 * 読めなかっただけの記録が消える。**
 *
 * 実測 (2026-08-23): 末尾が切れた保管値に `logMood` を 1 回するだけで
 *
 *   壊れる前の中身: {"moods":[{"date":"2026-01-01","score":4,"note":"…"}]…
 *   logMood 後:     {"moods":[{"date":"2026-02-02","score":3,"note":"new"}]…
 *
 * となり、**元の記録も、壊れた文字列そのものも消える**。壊れていても
 * 文字列の中には `"note":"…"` が読める形で残っているので、消さなければ
 * 人手で拾える。消したら拾えない。
 *
 * **同じ機能の main 側 (`main/clients/emotions.ts`) は最初から正しい** ——
 * `ENOENT` (ファイルが無い) だけを飲み、壊れた JSON は投げ直す。
 * ブラウザ版だけが全部飲んでいた。`main/secrets.ts` で見つけたのと同じ形。
 */
// Stryker disable next-line BooleanLiteral: 初期値は**一度も観測されない** ——
// 唯一の読み手 `loadStoreForWrite` は必ず `loadStore()` を先に呼び、その冒頭が
// この変数を毎回 false へ戻す。true にしても差が出ない (等価変異)。
let lastLoadDegraded = false;

export function loadStore(): EmotionsStore {
  lastLoadDegraded = false;
  const raw = localStorage.getItem(EMOTIONS_STORE_KEY);
  // 「無い」は degraded ではない —— 消える物が無い。
  if (!raw) return { moods: [], analyses: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<EmotionsStore>;
    return {
      moods: Array.isArray(parsed.moods) ? parsed.moods : [],
      analyses: Array.isArray(parsed.analyses) ? parsed.analyses : [],
    };
  } catch {
    lastLoadDegraded = true;
    return { moods: [], analyses: [] };
  }
}

/**
 * 書き込みの土台として読む。**読めなかったなら投げる。**
 *
 * 「消す」だけは別扱いにする —— 利用者が明示的に捨てると言っている操作で、
 * 壊れた保管値から抜け出す唯一の道でもあるため (ここまで塞ぐと行き止まりになる)。
 */
function loadStoreForWrite(): EmotionsStore {
  const store = loadStore();
  if (lastLoadDegraded) {
    throw new Error(
      '保存された記録を読めませんでした。上書きすると失われるため、記録を中止しました。' +
        '「履歴を消去」で作り直せます。',
    );
  }
  return store;
}

function saveStore(store: EmotionsStore): void {
  localStorage.setItem(EMOTIONS_STORE_KEY, JSON.stringify(store));
}

/** 利用者の時計の今日。共有の `localIsoDate` に寄せた (同じ関数が main にもあった)。 */
function todayLocal(now: number = Date.now()): string {
  return localIsoDate(new Date(now));
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
  // note の上限。**この経路にだけ無かった** (2026-08-23 実測)。
  //
  // `shared/emotionsLimits.ts` と `main/clients/emotions.ts` はどちらも
  // 「上限はブラウザ版だけが持っていた」と書いているが、実際に持っていたのは
  // `analyze-text` の方だけで (`web-shim.ts` が MAX_ANALYZE_TEXT_CHARS で断る)、
  // **log-mood の note は素通しだった** —— 5 万字を渡すと 5 万字そのまま
  // localStorage に載る (実測)。main 側はその誤った前提のまま修正を受けた。
  //
  // ブラウザ版の保存先は localStorage で、**容量はオリジン全体で共有**する。
  // `MAX_MOODS` は件数を 365 に抑えるが 1 件の大きさは抑えないので、ここが
  // 青天井だと保管庫のメタや proxy 設定など**別機能の書き込みが先に落ちる**。
  // `saveStore` は setItem を包んでいないので、溢れた時点で例外がそのまま出る。
  const noteStr = String(note ?? '');
  if (noteStr.length > MAX_MOOD_NOTE_CHARS) {
    throw new Error(`note exceeds ${MAX_MOOD_NOTE_CHARS} chars`);
  }
  const finalDate =
    (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null) ?? todayLocal(now);
  const store = loadStoreForWrite();
  const idx = store.moods.findIndex((m) => m.date === finalDate);
  const entry: MoodEntry = { date: finalDate, score: Math.round(finalScore), note: noteStr };
  if (idx >= 0) store.moods[idx] = entry;
  else store.moods.push(entry);
  store.moods.sort((a, b) => a.date.localeCompare(b.date));
  // slice(-MAX_MOODS) は length<=MAX_MOODS のとき恒等なので、> を >= にしても条件を
  // true 固定しても結果は不変 (equivalent)。
  // Stryker disable next-line ConditionalExpression,EqualityOperator
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
  // 一致時はキャプチャ群 1 が必ず存在するため `fence[1] != null` は冗長 (非 null 断言で表す)。
  if (fence) return fence[1]!.trim();
  return text.trim();
}

function pickDominant(scores: EmotionScores): string {
  // 最初の反復 (k='joy') で scores.joy>=0 > -1 となり必ず再代入されるため、この初期値
  // リテラルは dead。値を変える StringLiteral mutation は equivalent。
  // Stryker disable next-line StringLiteral
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
  // typeof は r.dominant を string に絞り込む型述語として必須だが、includes は === 判定
  // のため非文字列は元から false になり、typeof を true 固定する変異は equivalent。
  const dominant =
    // Stryker disable next-line ConditionalExpression
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
    // id は不透明な一意識別子で、区切り文字や slice 範囲は外部から観測されない
    // (テストも構造を検証しない) ため、これらの mutation は equivalent。
    // Stryker disable next-line StringLiteral,MethodExpression
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
    excerpt: (source ? `[${source}] ` : '') + text.slice(0, 80),
    ...normalized,
  };
  const store = loadStoreForWrite();
  store.analyses.unshift(entry);
  // slice(0, MAX_ANALYSES) は length<=MAX_ANALYSES のとき恒等なので、> を >= にしても
  // 条件を true 固定しても結果は不変 (equivalent)。
  // Stryker disable next-line ConditionalExpression,EqualityOperator
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

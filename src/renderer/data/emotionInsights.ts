/**
 * 感情の縦断解析エンジン — 純ロジック (IO なし)。
 *
 * 既存の気分ジャーナル (`emotionsWeb.ts` の MoodEntry / AnalysisEntry) を入力に、
 * **本人が自分のために記録した自己申告データ** を時系列で集計し、傾向・変動・
 * 連続した不調・優勢な感情・頻出トリガー語を抽出して {@link EmotionProfile} を返す。
 * ログが増えるほど解析が深まる (= 「収集・解析し続ける」)。
 *
 * プライバシー設計: 本モジュールは渡された配列だけを扱い、ネットワーク・保存・時刻
 * 取得を一切しない (決定論的)。実データはローカル (暗号化保管) に留まる。
 */

import type { MoodEntry, AnalysisEntry, Sentiment } from './emotionsWeb';

/** 気分傾向。 */
export type MoodTrend = 'improving' | 'declining' | 'stable';

/** 縦断プロファイル (本人の感情状態の要約)。 */
export interface EmotionProfile {
  /** 解析した気分エントリ数。 */
  readonly count: number;
  /** 全期間の平均スコア (1..5)。データなしは 0。 */
  readonly averageScore: number;
  /** 直近ウィンドウの平均スコア。 */
  readonly recentAverage: number;
  /** それ以前のウィンドウの平均スコア。 */
  readonly priorAverage: number;
  /** 傾向 (recent − prior の符号で判定)。 */
  readonly trend: MoodTrend;
  /** スコアの母標準偏差 (情緒の変動の大きさ)。 */
  readonly volatility: number;
  /** 直近の連続した不調日数 (末尾から score<=2 が続く数)。 */
  readonly lowStreak: number;
  /** テキスト分析の優勢感情 (最頻 dominant)。なければ null。 */
  readonly dominantEmotion: string | null;
  /** 感情の偏り (positive 割合 − negative 割合, −1..1)。 */
  readonly sentimentBalance: number;
  /** ノートから抽出した頻出トリガー語 (上位)。 */
  readonly topTriggers: readonly string[];
}

/** 直近ウィンドウのサイズ (日数相当)。 */
export const RECENT_WINDOW = 7;
/** トリガー語の最小出現回数。 */
export const TRIGGER_MIN_COUNT = 2;
/** 不調とみなすスコアの上限 (これ以下が続くと lowStreak)。 */
export const LOW_SCORE = 2;

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;

/** 母標準偏差。 */
export function stddev(xs: readonly number[]): number {
  // 空配列の早期 return は冗長 (mean([])=0 → variance 0 → sqrt 0 で同値) なので等価変異。
  // Stryker disable next-line ConditionalExpression
  if (xs.length === 0) return 0;
  const m = mean(xs);
  // d を一度だけ作って二乗する (d*d)。`(x-m)*(x-m)` と書くと一方の `-` を `+` に
  // した変異が代数的に等価 ((x+m)(x-m)=x²-m²=分散) になり撃墜不能になるため。
  const variance = mean(
    xs.map((x) => {
      const d = x - m;
      return d * d;
    }),
  );
  return Math.sqrt(variance);
}

/** recent と prior の平均差から傾向を判定する (しきい値 0.3 でヒステリシス)。 */
export function classifyTrend(recent: number, prior: number): MoodTrend {
  const delta = recent - prior;
  if (delta > 0.3) return 'improving';
  if (delta < -0.3) return 'declining';
  return 'stable';
}

/** 末尾から score<=LOW_SCORE が連続する数を数える。 */
export function trailingLowStreak(scores: readonly number[]): number {
  let n = 0;
  for (let i = scores.length - 1; i >= 0; i -= 1) {
    if (scores[i]! <= LOW_SCORE) n += 1;
    else break;
  }
  return n;
}

// 区切り文字 (空白・約物)。`+` の有無は後段の length>=2 filter が空文字を落とすため
// 出力に影響しない (等価変異) ので Regex 変異を除外する。
// Stryker disable next-line Regex
const TRIGGER_SPLIT_RE = /[\s、。,.!?！？「」『』()（）・/\\:;~〜＋"'`\-_]+/;

/** ノート群から頻出語 (2文字以上・出現 TRIGGER_MIN_COUNT 以上) を出現順で抽出。 */
export function extractTriggers(notes: readonly string[]): string[] {
  const counts = new Map<string, number>();
  // order は出力順の蓄積。空配列以外で初期化する変異は、最終 filter (count>=2) が
  // 偽の初期要素 (count 0) を必ず落とすため出力不変 (等価)。
  // Stryker disable next-line ArrayDeclaration
  const order: string[] = [];
  for (const note of notes) {
    const tokens = note
      .normalize('NFKC')
      .split(TRIGGER_SPLIT_RE)
      .filter((w) => w.length >= 2);
    for (const tok of tokens) {
      if (!counts.has(tok)) order.push(tok);
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
  }
  return order.filter((w) => (counts.get(w) ?? 0) >= TRIGGER_MIN_COUNT);
}

/** dominant のみ必要な分析エントリの最小形。 */
export type DominantLike = Pick<AnalysisEntry, 'dominant'>;
/** dominant / sentiment のみ必要な分析エントリの最小形。 */
export type SentimentLike = Pick<AnalysisEntry, 'sentiment'>;
/** score / note のみ必要な気分エントリの最小形。 */
export type ScoredNote = Pick<MoodEntry, 'score' | 'note'>;

/** 分析エントリ群から最頻の dominant 感情を返す (出現順で最初の最大)。 */
export function dominantEmotionOf(analyses: readonly DominantLike[]): string | null {
  const counts = new Map<string, number>();
  // order は最大走査の対象。非空初期化の変異は、偽要素の count が 0 で `n > bestN`
  // を満たさず best に勝てないため等価。
  // Stryker disable next-line ArrayDeclaration
  const order: string[] = [];
  for (const a of analyses) {
    // 重複 push を抑止する guard。常に push する変異 (→true) も、重複は同一 label の
    // 再評価で best を変えないため等価 (count は set 側で正しく増える)。
    // Stryker disable next-line ConditionalExpression
    if (!counts.has(a.dominant)) order.push(a.dominant);
    counts.set(a.dominant, (counts.get(a.dominant) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const label of order) {
    const n = counts.get(label) ?? 0;
    if (n > bestN) {
      bestN = n;
      best = label;
    }
  }
  return best;
}

/** sentiment の偏り (positive割合 − negative割合)。 */
export function sentimentBalanceOf(analyses: readonly SentimentLike[]): number {
  if (analyses.length === 0) return 0;
  let pos = 0;
  let neg = 0;
  for (const a of analyses) {
    const s: Sentiment = a.sentiment;
    if (s === 'positive') pos += 1;
    else if (s === 'negative') neg += 1;
  }
  return (pos - neg) / analyses.length;
}

/**
 * 気分ログ + テキスト分析から縦断プロファイルを組み立てる (純粋・決定論的)。
 * moods は date 昇順を想定 (logMood が常にソートして保存する)。
 */
export function analyzeProfile(
  moods: readonly ScoredNote[],
  analyses: readonly (DominantLike & SentimentLike)[],
): EmotionProfile {
  const scores = moods.map((m) => m.score);
  const recent = scores.slice(-RECENT_WINDOW);
  const prior = scores.slice(0, Math.max(0, scores.length - RECENT_WINDOW));
  const recentAverage = mean(recent);
  // prior が空 (履歴が浅い) のときは recent を基準に stable とするため prior=recent。
  const priorAverage = prior.length > 0 ? mean(prior) : recentAverage;
  return {
    count: moods.length,
    averageScore: mean(scores),
    recentAverage,
    priorAverage,
    trend: classifyTrend(recentAverage, priorAverage),
    volatility: stddev(scores),
    lowStreak: trailingLowStreak(scores),
    dominantEmotion: dominantEmotionOf(analyses),
    sentimentBalance: sentimentBalanceOf(analyses),
    topTriggers: extractTriggers(moods.map((m) => m.note)),
  };
}

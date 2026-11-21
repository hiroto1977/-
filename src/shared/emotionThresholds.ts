/**
 * 感情ログの見立てのしきい値 — 台帳 (`parameters.ts`) から上書きできる。
 *
 * 読むのは `renderer/data/emotionInsights.ts` だが、台帳は `shared` からしか import
 * できない (import の境界) ので、数字の置き場所はこちら。
 */

/** 直近ウィンドウのサイズ (件数 = 日数相当)。直近と、それ以前の平均を比べる。 */
export const RECENT_WINDOW = 7;
/** トリガー語の最小出現回数。メモにこの回数以上出る言葉を「よく出る言葉」に拾う。 */
export const TRIGGER_MIN_COUNT = 2;
/** 不調とみなすスコアの上限 (これ以下が続くと lowStreak)。 */
export const LOW_SCORE = 2;
/** 傾向の判定のヒステリシス: 平均の差がこれを超えたら上向き / 下向き。 */
export const TREND_HYSTERESIS = 0.3;

export interface EmotionThresholds {
  readonly recentWindow: number;
  readonly triggerMinCount: number;
  readonly lowScore: number;
  readonly trendHysteresis: number;
}

export const DEFAULT_EMOTION_THRESHOLDS: EmotionThresholds = {
  recentWindow: RECENT_WINDOW,
  triggerMinCount: TRIGGER_MIN_COUNT,
  lowScore: LOW_SCORE,
  trendHysteresis: TREND_HYSTERESIS,
};

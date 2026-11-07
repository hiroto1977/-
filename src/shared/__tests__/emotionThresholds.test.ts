/**
 * 感情ログの見立てのしきい値 — 表そのものを固定する (台帳の既定値がここを参照する)。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMOTION_THRESHOLDS,
  LOW_SCORE,
  RECENT_WINDOW,
  TREND_HYSTERESIS,
  TRIGGER_MIN_COUNT,
} from '../emotionThresholds';

describe('感情ログのしきい値 (表の固定)', () => {
  it('既定の値と、束ねた形', () => {
    expect([RECENT_WINDOW, TRIGGER_MIN_COUNT, LOW_SCORE, TREND_HYSTERESIS]).toEqual([7, 2, 2, 0.3]);
    expect(DEFAULT_EMOTION_THRESHOLDS).toEqual({ recentWindow: 7, triggerMinCount: 2, lowScore: 2, trendHysteresis: 0.3 });
  });
});

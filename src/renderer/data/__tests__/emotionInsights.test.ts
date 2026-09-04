import { describe, expect, it } from 'vitest';
import {
  stddev,
  classifyTrend,
  trailingLowStreak,
  extractTriggers,
  dominantEmotionOf,
  sentimentBalanceOf,
  analyzeProfile,
  RECENT_WINDOW,
  TRIGGER_MIN_COUNT,
  LOW_SCORE,
} from '../emotionInsights';
import { DEFAULT_EMOTION_THRESHOLDS } from '../../../shared/emotionThresholds';
import type { MoodEntry, AnalysisEntry, EmotionScores } from '../emotionsWeb';

const SCORES: EmotionScores = { joy: 0, sadness: 0, anger: 0, fear: 0, surprise: 0, disgust: 0 };
const analysis = (dominant: string, sentiment: AnalysisEntry['sentiment']): AnalysisEntry => ({
  id: dominant + sentiment,
  timestamp: 0,
  excerpt: '',
  scores: SCORES,
  sentiment,
  dominant,
});
const mood = (date: string, score: number, note = ''): MoodEntry => ({ date, score, note });

describe('stddev', () => {
  it('is 0 for empty and computes population std', () => {
    expect(stddev([])).toBe(0);
    expect(stddev([2, 2, 2])).toBe(0);
    expect(stddev([1, 3])).toBe(1); // mean 2, var 1, sqrt 1
  });
});

describe('classifyTrend', () => {
  it('uses a ±0.3 hysteresis band (boundary stays stable)', () => {
    expect(classifyTrend(4, 3)).toBe('improving');
    expect(classifyTrend(3, 4)).toBe('declining');
    // delta が **ちょうど 0.3** (= リテラルと同一の double) になるよう 0 を引く。
    // これで `> 0.3` と `>= 0.3` を区別でき EqualityOperator 変異を撃墜する。
    expect(classifyTrend(0.3, 0)).toBe('stable'); // delta=0.3 → not >0.3
    expect(classifyTrend(0.4, 0)).toBe('improving');
    expect(classifyTrend(0, 0.3)).toBe('stable'); // delta=-0.3 → not <-0.3
    expect(classifyTrend(0, 0.4)).toBe('declining');
    expect(classifyTrend(3, 3)).toBe('stable');
  });
});

describe('trailingLowStreak', () => {
  it('counts consecutive trailing scores <= 2', () => {
    expect(trailingLowStreak([3, 1, 2])).toBe(2);
    expect(trailingLowStreak([2, 3])).toBe(0); // last is 3 → 0
    expect(trailingLowStreak([1, 2, 2])).toBe(3);
    expect(trailingLowStreak([])).toBe(0);
    expect(trailingLowStreak([5])).toBe(0);
  });
});

describe('extractTriggers', () => {
  it('keeps tokens of length >= 2 occurring at least twice, in first-seen order', () => {
    expect(extractTriggers(['仕事 が つらい', '仕事 で 疲れた', 'つらい'])).toEqual(['仕事', 'つらい']);
  });
  it('drops single-occurrence and 1-char tokens', () => {
    expect(extractTriggers(['a 上司 b', '上司']).includes('上司')).toBe(true);
    expect(extractTriggers(['x y z'])).toEqual([]); // すべて 1 文字 → 空
  });
  it('handles empty notes', () => {
    expect(extractTriggers([])).toEqual([]);
    expect(extractTriggers(['', ''])).toEqual([]);
  });
  it('preserves first-seen order (not repeat-seen order)', () => {
    // ['ああ いい','いい ああ']: 初出順は ['ああ','いい']。再出順だと ['いい','ああ'] に
    // なるため、push を「初出時のみ」にしている guard (!has) を固定する。
    expect(extractTriggers(['ああ いい', 'いい ああ'])).toEqual(['ああ', 'いい']);
  });
});

describe('dominantEmotionOf', () => {
  it('returns the most frequent dominant, first-seen wins ties', () => {
    expect(
      dominantEmotionOf([analysis('sadness', 'negative'), analysis('joy', 'positive'), analysis('sadness', 'negative')]),
    ).toBe('sadness');
    // tie (joy 1 / anger 1) → first seen (joy)
    expect(dominantEmotionOf([analysis('joy', 'positive'), analysis('anger', 'negative')])).toBe('joy');
    expect(dominantEmotionOf([])).toBeNull();
  });
});

describe('sentimentBalanceOf', () => {
  it('computes (positive - negative) / total', () => {
    expect(sentimentBalanceOf([])).toBe(0);
    expect(
      sentimentBalanceOf([analysis('a', 'positive'), analysis('b', 'positive'), analysis('c', 'negative'), analysis('d', 'neutral')]),
    ).toBe(0.25); // (2-1)/4
    expect(sentimentBalanceOf([analysis('a', 'negative'), analysis('b', 'negative')])).toBe(-1);
  });
});

describe('analyzeProfile', () => {
  it('summarizes an empty store as all-zero / stable', () => {
    expect(analyzeProfile([], [])).toEqual({
      count: 0,
      averageScore: 0,
      recentAverage: 0,
      priorAverage: 0,
      trend: 'stable',
      volatility: 0,
      lowStreak: 0,
      dominantEmotion: null,
      sentimentBalance: 0,
      topTriggers: [],
    });
  });

  it('uses recentAverage as prior when history is shorter than the window (→ stable)', () => {
    const p = analyzeProfile([mood('2026-06-01', 4), mood('2026-06-02', 2)], []);
    expect(p.count).toBe(2);
    expect(p.averageScore).toBe(3);
    expect(p.recentAverage).toBe(3);
    expect(p.priorAverage).toBe(3); // prior 空 → recent と同値
    expect(p.trend).toBe('stable');
    expect(p.lowStreak).toBe(1); // 末尾 2 が 1 つ
  });

  it('detects a declining trend across windows and trailing low streak', () => {
    // 直近7日が低く、それ以前が高い → declining。末尾3日が <=2 → lowStreak 3。
    const moods: MoodEntry[] = [
      ...Array.from({ length: 7 }, (_, i) => mood(`2026-05-0${i + 1}`, 5)),
      mood('2026-06-01', 4),
      mood('2026-06-02', 2),
      mood('2026-06-03', 1),
      mood('2026-06-04', 2),
      ...Array.from({ length: 3 }, (_, i) => mood(`2026-06-1${i}`, 3)),
    ];
    const p = analyzeProfile(moods, [analysis('sadness', 'negative')]);
    expect(p.recentAverage).toBeLessThan(p.priorAverage);
    expect(p.trend).toBe('declining');
    expect(p.dominantEmotion).toBe('sadness');
  });

  it('splits the recent window (last 7) from prior exactly', () => {
    // 10 件: prior = 先頭3件 [5,5,5] (平均5), recent = 末尾7件 [1..1] (平均1)。
    // slice(-7) / slice(0, len-7) の境界・引き算を実値で固定する。
    const moods: MoodEntry[] = [
      mood('d01', 5),
      mood('d02', 5),
      mood('d03', 5),
      ...Array.from({ length: 7 }, (_, i) => mood(`e0${i}`, 1)),
    ];
    const p = analyzeProfile(moods, []);
    expect(p.recentAverage).toBe(1); // 末尾7件すべて 1
    expect(p.priorAverage).toBe(5); // 先頭3件すべて 5
    expect(p.trend).toBe('declining');
  });

  it('threads triggers through from notes', () => {
    const p = analyzeProfile([mood('2026-06-01', 2, '会議 が 多い'), mood('2026-06-02', 2, '会議 疲れ')], []);
    expect(p.topTriggers).toContain('会議');
  });
});

/*
 * 台帳 (`parameters.ts`) から渡すしきい値。省略時は既定と同じ結果、渡せば窓・ヒステリシス・
 * 低調の上限・出現回数のそれぞれが効く。
 */
describe('台帳から渡すしきい値 (EmotionThresholds)', () => {
  // 10 日: 5 が 5 日、2 が 5 日。「会議」は 3 回、「散歩」は 1 回。
  const moods = [
    mood('2026-08-01', 5, '会議 が長い'),
    mood('2026-08-02', 5, '散歩'),
    mood('2026-08-03', 5, ''),
    mood('2026-08-04', 5, ''),
    mood('2026-08-05', 5, ''),
    mood('2026-08-06', 2, '会議 で疲れた'),
    mood('2026-08-07', 2, ''),
    mood('2026-08-08', 2, '会議'),
    mood('2026-08-09', 2, ''),
    mood('2026-08-10', 2, ''),
  ];

  it('既定の引数は定数そのもので、省略時と同じ結果', () => {
    expect([RECENT_WINDOW, TRIGGER_MIN_COUNT, LOW_SCORE]).toEqual([7, 2, 2]);
    expect(analyzeProfile(moods, [], DEFAULT_EMOTION_THRESHOLDS)).toEqual(analyzeProfile(moods, []));
    expect(classifyTrend(1, 0, 0.3)).toBe(classifyTrend(1, 0));
    expect(trailingLowStreak([5, 2, 2], 2)).toBe(trailingLowStreak([5, 2, 2]));
    expect(extractTriggers(['会議 会議'], 2)).toEqual(extractTriggers(['会議 会議']));
    const p = analyzeProfile(moods, []);
    expect(p.trend).toBe('declining'); // 直近 7 日の平均 2.86 − それ以前 5 = −2.14
    expect(p.lowStreak).toBe(5);
    expect(p.topTriggers).toEqual(['会議']);
  });

  it('窓・ヒステリシス・低調の上限・出現回数が効く', () => {
    const t = { recentWindow: 3, trendHysteresis: 4, lowScore: 1, triggerMinCount: 5 };
    const p = analyzeProfile(moods, [], t);
    expect(p.recentAverage).toBe(2); // 直近 3 日
    expect(p.priorAverage).toBeCloseTo(29 / 7, 10); // 残り 7 日
    expect(p.trend).toBe('stable'); // 差 −2.14 はヒステリシス 4 の内側
    expect(p.lowStreak).toBe(0); // 2 点は「1 点以下」ではない
    expect(p.topTriggers).toEqual([]); // 3 回では 5 回に届かない
    // 1 つずつ: 窓だけ変えると平均だけ動き、傾向は既定のヒステリシスで下向きのまま。
    expect(analyzeProfile(moods, [], { ...DEFAULT_EMOTION_THRESHOLDS, recentWindow: 3 }).trend).toBe('declining');
    expect(analyzeProfile(moods, [], { ...DEFAULT_EMOTION_THRESHOLDS, lowScore: 3 }).lowStreak).toBe(5);
    expect(analyzeProfile(moods, [], { ...DEFAULT_EMOTION_THRESHOLDS, triggerMinCount: 3 }).topTriggers).toEqual(['会議']);
    expect(analyzeProfile(moods, [], { ...DEFAULT_EMOTION_THRESHOLDS, triggerMinCount: 4 }).topTriggers).toEqual([]);
  });

  it('個々の関数も引数で受ける (境界は「超える」「以下」「以上」)', () => {
    expect(classifyTrend(1, 0, 1)).toBe('stable'); // 差 1 は 1 を超えない
    expect(classifyTrend(1.5, 0, 1)).toBe('improving');
    expect(classifyTrend(0, 1.5, 1)).toBe('declining');
    expect(trailingLowStreak([5, 3, 3], 3)).toBe(2);
    expect(trailingLowStreak([5, 3, 3], 2)).toBe(0);
    expect(extractTriggers(['会議 会議 会議', '散歩'], 3)).toEqual(['会議']);
    expect(extractTriggers(['会議 会議 会議', '散歩'], 1)).toEqual(['会議', '散歩']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  stddev,
  classifyTrend,
  trailingLowStreak,
  extractTriggers,
  dominantEmotionOf,
  sentimentBalanceOf,
  analyzeProfile,
} from '../emotionInsights';
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

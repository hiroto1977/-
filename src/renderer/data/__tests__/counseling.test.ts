import { describe, expect, it } from 'vitest';
import {
  detectCrisis,
  classifyTone,
  counsel,
  CRISIS_MARKERS,
  SUPPORT_RESOURCES,
} from '../counseling';
import type { EmotionProfile } from '../emotionInsights';

const profile = (over: Partial<EmotionProfile> = {}): EmotionProfile => ({
  count: 10,
  averageScore: 3,
  recentAverage: 3,
  priorAverage: 3,
  trend: 'stable',
  volatility: 0,
  lowStreak: 0,
  dominantEmotion: null,
  sentimentBalance: 0,
  topTriggers: [],
  ...over,
});

describe('detectCrisis', () => {
  it('detects each crisis marker (NFKC-normalized substring)', () => {
    for (const marker of CRISIS_MARKERS) {
      expect(detectCrisis(`なんだか${marker}と思ってしまう`)).toBe(true);
    }
  });
  it('does not fire on ordinary distress without crisis markers', () => {
    expect(detectCrisis('仕事が忙しくて疲れた')).toBe(false);
    expect(detectCrisis('少し不安です')).toBe(false);
    expect(detectCrisis('')).toBe(false);
  });
  it('does NOT fire on generic frustration / venting (precision: fewer false positives)', () => {
    // 「もう限界」「(タスクを)終わりにしたい」は日常のストレス文脈で多発するため危機語から除外。
    expect(detectCrisis('このバグ、もう限界')).toBe(false);
    expect(detectCrisis('残業を終わりにしたい')).toBe(false);
    expect(detectCrisis('この会議を終わりにしたい')).toBe(false);
  });
  it('DOES fire on explicit self-harm / suicidal phrasings (recall: fewer false negatives)', () => {
    expect(detectCrisis('もう死んでしまいたい')).toBe(true);
    expect(detectCrisis('この世から消えてしまいたい')).toBe(true);
    expect(detectCrisis('自分を傷つけたくなる')).toBe(true);
    expect(detectCrisis('過量服薬しようか考えた')).toBe(true);
    expect(detectCrisis('人生を終わりにしたい')).toBe(true); // 対象が明示された句は危機
  });
  it('matches full-width / spaced variants via NFKC', () => {
    expect(detectCrisis('ＳＮＳで疲れた、もう消えたい')).toBe(true);
  });
});

describe('classifyTone', () => {
  it('routes anxiety dominant (en/ja) to soothe-anxiety', () => {
    expect(classifyTone({ note: '', dominant: 'fear' })).toBe('soothe-anxiety');
    expect(classifyTone({ note: '', dominant: 'anxiety' })).toBe('soothe-anxiety');
    expect(classifyTone({ note: '', dominant: 'Anxiety' })).toBe('soothe-anxiety'); // 小文字化
    expect(classifyTone({ note: '', dominant: '不安' })).toBe('soothe-anxiety');
  });
  it('routes anger dominant to validate-anger', () => {
    expect(classifyTone({ note: '', dominant: 'anger' })).toBe('validate-anger');
    expect(classifyTone({ note: '', dominant: '怒り' })).toBe('validate-anger');
  });
  it('routes negative sentiment and low score to comfort', () => {
    expect(classifyTone({ note: '', sentiment: 'negative' })).toBe('comfort');
    expect(classifyTone({ note: '', score: 2 })).toBe('comfort');
    expect(classifyTone({ note: '', score: 1 })).toBe('comfort');
  });
  it('routes positive sentiment and high score to celebrate', () => {
    expect(classifyTone({ note: '', sentiment: 'positive' })).toBe('celebrate');
    expect(classifyTone({ note: '', score: 4 })).toBe('celebrate');
    expect(classifyTone({ note: '', score: 5 })).toBe('celebrate');
  });
  it('falls back to gentle for neutral mid-score input', () => {
    expect(classifyTone({ note: '', score: 3 })).toBe('gentle');
    expect(classifyTone({ note: '' })).toBe('gentle');
    expect(classifyTone({ note: '', sentiment: 'neutral' })).toBe('gentle');
  });
  it('prioritizes dominant over sentiment/score', () => {
    // anger dominant でも negative sentiment より dominant が優先。
    expect(classifyTone({ note: '', dominant: 'anger', sentiment: 'negative', score: 1 })).toBe(
      'validate-anger',
    );
  });
  it('comfort (negative) beats celebrate-by-score ordering', () => {
    // sentiment negative は score>=4 より先に判定される。
    expect(classifyTone({ note: '', sentiment: 'negative', score: 5 })).toBe('comfort');
  });
});

describe('counsel — crisis safety (highest priority)', () => {
  it('returns a crisis response with resources even when score/sentiment look positive', () => {
    const r = counsel({ note: 'もう消えたい', score: 5, sentiment: 'positive' });
    expect(r.tone).toBe('crisis');
    expect(r.isCrisis).toBe(true);
    expect(r.resources).toBe(SUPPORT_RESOURCES);
    expect(r.resources.length).toBeGreaterThan(0);
    expect(r.disclaimer).toContain('専門的な医療・心理的ケアの代わりにはなれません');
    expect(r.disclaimer).toContain('あなたは一人ではありません'); // 後半の文も固定
    expect(r.message).toContain('打ち明けてくれて');
    expect(r.suggestion).toContain('まもろうよこころ');
  });
});

describe('counsel — supportive responses', () => {
  it('comforts negative input and carries the care disclaimer + empty resources', () => {
    const r = counsel({ note: 'つらい一日だった', sentiment: 'negative' });
    expect(r.tone).toBe('comfort');
    expect(r.isCrisis).toBe(false);
    expect(r.resources).toEqual([]);
    expect(r.suggestion.length).toBeGreaterThan(0);
    expect(r.disclaimer).toContain('診断や治療ではありません');
  });

  it('mentions a long low streak when profile.lowStreak >= 3', () => {
    const r = counsel({ note: 'しんどい', sentiment: 'negative', profile: profile({ lowStreak: 4 }) });
    expect(r.message).toContain('4 日');
  });

  it('does NOT mention a streak at lowStreak = 2 (boundary), and notes improving instead', () => {
    const r = counsel({
      note: 'まあまあ',
      sentiment: 'negative',
      profile: profile({ lowStreak: 2, trend: 'improving' }),
    });
    expect(r.message).not.toContain('日ほど、しんどい状態');
    expect(r.message).toContain('上向いてきている');
  });

  it('adds no profile note when stable and no streak', () => {
    const base = counsel({ note: 'ふつう', score: 3 });
    const withProfile = counsel({ note: 'ふつう', score: 3, profile: profile({ lowStreak: 1, trend: 'stable' }) });
    expect(withProfile.message).toBe(base.message);
  });

  it('celebrates positive input', () => {
    const r = counsel({ note: 'いい一日！', sentiment: 'positive' });
    expect(r.tone).toBe('celebrate');
    expect(r.isCrisis).toBe(false);
  });
});

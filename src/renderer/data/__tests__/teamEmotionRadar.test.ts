import { describe, expect, it } from 'vitest';
import {
  EMOTION_AXES,
  trendScore,
  emotionRadarScores,
  supportReason,
  buildTeamEmotionRadar,
  teamEmotionSummary,
  type MemberEmotion,
} from '../teamEmotionRadar';
import { analyzeProfile } from '../emotionInsights';
import type { EmotionProfile } from '../emotionInsights';

const profile = (over: Partial<EmotionProfile> = {}): EmotionProfile => ({
  count: 5,
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

describe('trendScore', () => {
  it('maps improving/stable/declining to +2 / 0 / -2', () => {
    expect(trendScore('improving')).toBe(2);
    expect(trendScore('stable')).toBe(0);
    expect(trendScore('declining')).toBe(-2);
  });
});

describe('emotionRadarScores', () => {
  it('maps a neutral profile to the documented mid values', () => {
    // avg3, balance0→3, volatility0→5, recent3, 3+0-0=3
    expect(emotionRadarScores(profile())).toEqual([3, 3, 5, 3, 3]);
  });

  it('maps positive sentiment and improving trend to higher 前向き/回復力', () => {
    const s = emotionRadarScores(profile({ sentimentBalance: 1, trend: 'improving' }));
    expect(s[1]).toBe(5); // 3 + 1*2
    expect(s[4]).toBe(5); // 3 + 2 - 0
  });

  it('penalizes volatility (安定) and a long low streak (回復力), clamped to 1', () => {
    const s = emotionRadarScores(profile({ volatility: 3, lowStreak: 5, trend: 'declining' }));
    expect(s[2]).toBe(1); // 5 - 3*2 = -1 → clamp 1
    expect(s[4]).toBe(1); // 3 + (-2) - min(5,2)=2 = -1 → clamp 1
  });

  it('rounds to one decimal', () => {
    const s = emotionRadarScores(profile({ averageScore: 3.25, sentimentBalance: 0.25 }));
    expect(s[0]).toBe(3.3); // round1(3.25) = 3.3 (round half up)
    expect(s[1]).toBe(3.5); // 3 + 0.25*2 = 3.5
  });
});

describe('supportReason', () => {
  it('flags a low streak >= 3', () => {
    expect(supportReason(profile({ lowStreak: 3 }))).toBe('連続して低調が 3 日');
    expect(supportReason(profile({ lowStreak: 4 }))).toBe('連続して低調が 4 日');
  });
  it('does not flag a low streak of 2 (boundary)', () => {
    expect(supportReason(profile({ lowStreak: 2 }))).toBeNull();
  });
  it('flags a low average when there is data', () => {
    expect(supportReason(profile({ averageScore: 2, count: 4 }))).toBe('平均的な気分が低め');
    expect(supportReason(profile({ averageScore: 2.1, count: 4 }))).toBeNull();
  });
  it('does not flag an empty profile (count 0) even with averageScore 0', () => {
    expect(supportReason(profile({ averageScore: 0, count: 0 }))).toBeNull();
  });
  it('prioritizes the streak reason over the low-average reason', () => {
    expect(supportReason(profile({ lowStreak: 3, averageScore: 1, count: 9 }))).toBe(
      '連続して低調が 3 日',
    );
  });
});

describe('buildTeamEmotionRadar', () => {
  const upbeat: MemberEmotion = {
    id: 'a',
    name: 'あおい',
    moods: [
      { score: 4, note: '' },
      { score: 5, note: '' },
    ],
    analyses: [{ dominant: 'joy', sentiment: 'positive' }],
  };
  const struggling: MemberEmotion = {
    id: 'b',
    name: 'ぼたん',
    moods: [
      { score: 2, note: '' },
      { score: 1, note: '' },
      { score: 2, note: '' },
    ],
    analyses: [{ dominant: 'sadness', sentiment: 'negative' }],
  };

  it('builds per-member radar scores aligned to EMOTION_AXES', () => {
    const r = buildTeamEmotionRadar([upbeat, struggling]);
    expect(r.axes).toBe(EMOTION_AXES);
    expect(r.members.map((m) => m.id)).toEqual(['a', 'b']);
    expect(r.members[0]!.scores).toHaveLength(EMOTION_AXES.length);
    // 各メンバーのスコアは analyzeProfile→emotionRadarScores と一致する。
    expect(r.members[1]!.scores).toEqual(
      emotionRadarScores(analyzeProfile(struggling.moods, struggling.analyses)),
    );
  });

  it('averages each axis across members', () => {
    const r = buildTeamEmotionRadar([upbeat, struggling]);
    for (let i = 0; i < EMOTION_AXES.length; i += 1) {
      const expected = Math.round(((r.members[0]!.scores[i]! + r.members[1]!.scores[i]!) / 2) * 10) / 10;
      expect(r.teamAverage[i]).toBe(expected);
    }
  });

  it('flags the struggling member for support (low streak of 3)', () => {
    const r = buildTeamEmotionRadar([upbeat, struggling]);
    expect(r.needsSupport.map((s) => s.id)).toEqual(['b']);
    expect(r.needsSupport[0]!.reason).toContain('連続して低調');
  });

  it('returns an all-zero teamAverage and empty members for no input', () => {
    const r = buildTeamEmotionRadar([]);
    expect(r.members).toEqual([]);
    expect(r.teamAverage).toEqual([0, 0, 0, 0, 0]);
    expect(r.needsSupport).toEqual([]);
  });
});

describe('teamEmotionSummary', () => {
  it('reports no data for an empty team', () => {
    expect(teamEmotionSummary(buildTeamEmotionRadar([]))).toBe('メンバーの感情データがありません。');
  });
  it('reports stability when nobody needs support', () => {
    const r = buildTeamEmotionRadar([
      { id: 'a', name: 'A', moods: [{ score: 4, note: '' }], analyses: [] },
    ]);
    const summary = teamEmotionSummary(r);
    expect(summary).toContain('チーム 1 名の感情ウェルビーイング');
    expect(summary).toContain('活力 4/5'); // teamAverage[0] が文面に出る
    expect(summary).toContain('全員が安定');
  });
  it('reports the count needing support', () => {
    const r = buildTeamEmotionRadar([
      { id: 'b', name: 'B', moods: [{ score: 1, note: '' }, { score: 1, note: '' }, { score: 2, note: '' }], analyses: [] },
    ]);
    const summary = teamEmotionSummary(r);
    expect(summary).toContain('チーム 1 名の感情ウェルビーイング');
    expect(summary).toContain('1 名に声かけ');
  });
});

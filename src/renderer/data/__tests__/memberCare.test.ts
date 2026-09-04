import { describe, expect, it } from 'vitest';
import {
  skillLevel,
  skillEvaluation,
  carePriority,
  emotionNoteOf,
  oneOnOneFocus,
  buildMemberCareReport,
  buildTeamCare,
  type CareMemberInput,
  type SkillEvaluation,
} from '../memberCare';
import type { EmotionProfile } from '../emotionInsights';

const AXES = ['営業力', '顧客対応力', 'プレゼン力', '交渉力', '顧客管理力'];

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

describe('skillLevel', () => {
  it('classifies by average with the documented boundaries', () => {
    expect(skillLevel(2.4)).toBe('要支援');
    expect(skillLevel(2.5)).toBe('標準'); // not < 2.5
    expect(skillLevel(3.4)).toBe('標準');
    expect(skillLevel(3.5)).toBe('良好'); // not < 3.5
    expect(skillLevel(4.2)).toBe('良好');
    expect(skillLevel(4.3)).toBe('優秀'); // not < 4.3
    expect(skillLevel(5)).toBe('優秀');
  });
});

describe('skillEvaluation', () => {
  it('computes average, level, strength (max, first on tie) and growth (min, first on tie)', () => {
    const e = skillEvaluation(AXES, [5, 3, 4, 2, 3]);
    expect(e.average).toBe(3.4); // 17/5 = 3.4
    expect(e.level).toBe('標準');
    expect(e.strength).toEqual({ axis: '営業力', score: 5 });
    expect(e.growth).toEqual({ axis: '交渉力', score: 2 });
  });

  it('finds strength/growth when the max and min are not at index 0', () => {
    // 強み=index1 (5), 伸びしろ=index3 (1) — シード更新が必要。
    const e = skillEvaluation(AXES, [3, 5, 4, 1, 3]);
    expect(e.strength).toEqual({ axis: '顧客対応力', score: 5 });
    expect(e.growth).toEqual({ axis: '交渉力', score: 1 });
  });

  it('returns empty axis/score 0 for empty axes', () => {
    const e = skillEvaluation([], []);
    expect(e.strength).toEqual({ axis: '', score: 0 });
    expect(e.growth).toEqual({ axis: '', score: 0 });
  });

  it('keeps the first axis on ties for both strength and growth', () => {
    const e = skillEvaluation(AXES, [3, 3, 3, 3, 3]);
    expect(e.strength).toEqual({ axis: '営業力', score: 3 });
    expect(e.growth).toEqual({ axis: '営業力', score: 3 });
    expect(e.average).toBe(3);
  });

  it('rounds the average to one decimal', () => {
    expect(skillEvaluation(AXES, [4, 4, 4, 4, 5]).average).toBe(4.2); // 21/5 = 4.2
    expect(skillEvaluation(AXES, [5, 5, 5, 4, 4]).average).toBe(4.6); // 23/5 = 4.6
  });

  it('handles empty axes as average 0', () => {
    const e = skillEvaluation([], []);
    expect(e.average).toBe(0);
    expect(e.level).toBe('要支援');
  });
});

describe('carePriority', () => {
  it('is none for an empty (no-data) profile', () => {
    expect(carePriority(profile({ count: 0, averageScore: 0 }))).toBe('none');
  });
  it('is high for a low streak >= 3', () => {
    expect(carePriority(profile({ lowStreak: 3 }))).toBe('high');
  });
  it('is medium for a low average or negative sentiment (streak < 3)', () => {
    expect(carePriority(profile({ averageScore: 2.5 }))).toBe('medium'); // <= 2.5
    expect(carePriority(profile({ averageScore: 2.6, sentimentBalance: -0.1 }))).toBe('medium');
  });
  it('is none for a healthy profile', () => {
    expect(carePriority(profile({ averageScore: 4, sentimentBalance: 0.2 }))).toBe('none');
    expect(carePriority(profile({ averageScore: 2.6, sentimentBalance: 0 }))).toBe('none'); // 2.6 > 2.5, balance 0 not < 0
  });
  it('prioritizes high (streak) over medium conditions', () => {
    expect(carePriority(profile({ lowStreak: 4, averageScore: 1, sentimentBalance: -1 }))).toBe('high');
  });
});

describe('emotionNoteOf', () => {
  it('reports no data for an empty profile', () => {
    expect(emotionNoteOf(profile({ count: 0 }))).toBe('気分データなし');
  });
  it('summarizes average and trend (improving / stable / declining labels)', () => {
    expect(emotionNoteOf(profile({ averageScore: 3.25, trend: 'improving' }))).toBe('気分の平均 3.3/5・傾向 上向き');
    expect(emotionNoteOf(profile({ averageScore: 3, trend: 'stable' }))).toBe('気分の平均 3/5・傾向 横ばい');
    expect(emotionNoteOf(profile({ averageScore: 3, trend: 'declining' }))).toBe('気分の平均 3/5・傾向 下向き');
  });
  it('appends a low-streak note at streak >= 2', () => {
    expect(emotionNoteOf(profile({ averageScore: 2, trend: 'declining', lowStreak: 3 }))).toBe(
      '気分の平均 2/5・傾向 下向き・連続低調 3日',
    );
  });
  it('appends the streak note exactly at streak 2 (boundary)', () => {
    expect(emotionNoteOf(profile({ lowStreak: 2 }))).toContain('連続低調 2日');
  });
  it('omits the streak note at streak 1 (boundary)', () => {
    expect(emotionNoteOf(profile({ lowStreak: 1 }))).not.toContain('連続低調');
  });
});

describe('oneOnOneFocus', () => {
  const skill: SkillEvaluation = {
    average: 3.4,
    level: '標準',
    strength: { axis: '営業力', score: 5 },
    growth: { axis: '交渉力', score: 2 },
  };
  it('puts listening first for high priority (no skill talk)', () => {
    const text = oneOnOneFocus('high', skill);
    expect(text).toContain('まず気持ちに耳を傾けて');
    expect(text).not.toContain('営業力');
  });
  it('bridges strength + recent state + growth for medium', () => {
    const text = oneOnOneFocus('medium', skill);
    expect(text).toContain('営業力');
    expect(text).toContain('交渉力');
    expect(text).toContain('最近の様子');
  });
  it('focuses on strength + growth for none (distinct from the medium wording)', () => {
    const text = oneOnOneFocus('none', skill);
    expect(text).toContain('営業力');
    expect(text).toContain('交渉力');
    expect(text).not.toContain('まず気持ち');
    expect(text).not.toContain('最近の様子'); // medium 文との区別を固定
  });
});

describe('buildMemberCareReport', () => {
  it('combines skill evaluation and emotion into a care report', () => {
    const m: CareMemberInput = {
      id: 'a',
      name: 'あおい',
      scores: [5, 3, 4, 2, 3],
      moods: [{ score: 1, note: '' }, { score: 2, note: '' }, { score: 1, note: '' }],
      analyses: [{ dominant: 'sadness', sentiment: 'negative' }],
    };
    const r = buildMemberCareReport(m, AXES);
    expect(r.id).toBe('a');
    expect(r.skill.strength.axis).toBe('営業力');
    expect(r.priority).toBe('high'); // 3連続で score<=2
    expect(r.oneOnOneFocus).toContain('まず気持ち');
    expect(r.emotionNote).toContain('連続低調');
  });
});

describe('buildTeamCare', () => {
  const mk = (id: string, scores: number[], moods: number[]): CareMemberInput => ({
    id,
    name: id.toUpperCase(),
    scores,
    moods: moods.map((s) => ({ score: s, note: '' })),
    analyses: [],
  });

  it('orders reports by care priority (high→medium→none), stable within a tier', () => {
    const team = buildTeamCare(
      [
        mk('healthy', [4, 4, 4, 4, 4], [4, 4, 4]),
        mk('crisis', [3, 3, 3, 3, 3], [1, 2, 1]), // 連続低調3 → high
        mk('watch', [3, 3, 3, 3, 3], [2, 2]), // 平均<=2.5, 連続2 → medium
      ],
      AXES,
    );
    expect(team.reports.map((r) => r.id)).toEqual(['crisis', 'watch', 'healthy']);
    expect(team.highCount).toBe(1);
    expect(team.mediumCount).toBe(1);
    expect(team.summary).toContain('1 名は気持ちのケアを優先');
  });

  it('summarizes watch-level when only medium present', () => {
    const team = buildTeamCare([mk('w', [3, 3, 3, 3, 3], [2, 2])], AXES);
    expect(team.highCount).toBe(0);
    expect(team.summary).toContain('1 名は最近の様子');
  });

  it('summarizes all-stable when nobody needs care', () => {
    const team = buildTeamCare([mk('a', [4, 4, 4, 4, 4], [4, 4])], AXES);
    expect(team.summary).toContain('全員が安定');
  });

  it('keeps input order for members of the same priority (stable sort)', () => {
    const team = buildTeamCare(
      [mk('h1', [4, 4, 4, 4, 4], [4, 4]), mk('h2', [4, 4, 4, 4, 4], [4, 4])],
      AXES,
    );
    // 同 priority (none) は入力順を保持する (tie-break a.i - b.i)。
    expect(team.reports.map((r) => r.id)).toEqual(['h1', 'h2']);
  });

  it('handles an empty team', () => {
    const team = buildTeamCare([], AXES);
    expect(team.reports).toEqual([]);
    expect(team.summary).toBe('メンバーがいません。');
  });
});

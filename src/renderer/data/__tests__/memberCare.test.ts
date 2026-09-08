import { describe, expect, it } from 'vitest';
import {
  skillLevel,
  skillEvaluation,
  carePriority,
  emotionNoteOf,
  oneOnOneFocus,
  buildMemberCareReport,
  buildTeamCare,
  unevaluatedAxesNote,
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

  // 軸が 1 つも無いなら強みも伸びしろも**無い**。空文字の軸を返すと
  // 1on1 の文面が「『』を活かし」になり、画面に空の鍵括弧が出る。
  it('軸が無ければ強み・伸びしろは null (空の軸名を作らない)', () => {
    const e = skillEvaluation([], []);
    expect(e.strength).toBeNull();
    expect(e.growth).toBeNull();
    expect(e.evaluatedCount).toBe(0);
    expect(e.unevaluatedAxes).toEqual([]);
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

  // **軸が無いのに「要支援」と判定しない。** 2026-09-08 までこの見本が
  // 「average 0 / level 要支援」を仕様として固定していた ——
  // 評価が 1 つも無い人を「支援が要る」と断じるのは、データではなく主張である。
  it('軸が無ければ平均もレベルも null (「要支援」と断じない)', () => {
    const e = skillEvaluation([], []);
    expect(e.average).toBeNull();
    expect(e.level).toBeNull();
  });

  /**
   * **未評価の軸を 0 点として平均しない。** 評点は 1〜5 なので 0 は
   * 「その軸が評価されていない」であって「0 点」ではない。
   *
   * | 控え | 直す前 | 直した後 |
   * | --- | ---: | ---: |
   * | 4,4,4,4,4 | 4.0 良好 | 4.0 良好 |
   * | **4,4,4,4 (5 軸目が無い)** | **3.2 標準 / 伸びしろ 品質(0)** | 4.0 良好 / 伸びしろ 営業力(4) |
   * | **3,3 (2 軸だけ)** | **1.2 要支援** | 3.0 標準 |
   */
  describe('未評価の軸を平均の分母に入れない', () => {
    it('★ 5 軸目が無い控えでも、評価済み 4 軸の平均とレベルになる', () => {
      const full = skillEvaluation(AXES, [4, 4, 4, 4, 4]);
      expect(full.average).toBe(4);
      expect(full.level).toBe('良好');
      const short = skillEvaluation(AXES, [4, 4, 4, 4]);
      expect(short.average).toBe(4); // 直す前は 3.2
      expect(short.level).toBe('良好'); // 直す前は 標準
      expect(short.evaluatedCount).toBe(4);
      expect(short.unevaluatedAxes).toEqual([AXES[4]]);
    });

    it('★ 伸びしろは**評価済みの**軸の中の最小 (未評価の軸を名指ししない)', () => {
      const short = skillEvaluation(AXES, [4, 4, 4, 4]);
      expect(short.growth).not.toBeNull();
      expect(short.unevaluatedAxes).toContain(AXES[4]!);
      expect(short.growth!.axis).not.toBe(AXES[4]);
      expect(short.growth!.score).toBe(4);
    });

    it('★ 先頭の軸が未評価でも、強み・伸びしろがそこに固定されない', () => {
      // 旧実装は axes[0] をシードにしていたので、1 軸目が無いと強み・伸びしろが
      // 「1 軸目・0 点」で始まり、伸びしろは必ず 1 軸目になった。
      const e = skillEvaluation(AXES, [Number.NaN, 5, 2, 3, 4]);
      expect(e.unevaluatedAxes).toEqual([AXES[0]]);
      expect(e.strength).toEqual({ axis: AXES[1], score: 5 });
      expect(e.growth).toEqual({ axis: AXES[2], score: 2 });
    });

    it('★ 範囲外の評点は未評価として扱う (0 も 6 も 1〜5 の外)', () => {
      const e = skillEvaluation(AXES, [0, 6, 3, 3, 3]);
      expect(e.unevaluatedAxes).toEqual([AXES[0], AXES[1]]);
      expect(e.evaluatedCount).toBe(3);
      expect(e.average).toBe(3);
    });

    it('★ 1 軸も評価されていなければ全部 null で、軸名は全部未評価に並ぶ', () => {
      const e = skillEvaluation(AXES, []);
      expect(e.average).toBeNull();
      expect(e.level).toBeNull();
      expect(e.strength).toBeNull();
      expect(e.growth).toBeNull();
      expect(e.unevaluatedAxes).toEqual([...AXES]);
    });

    it('★ 未評価の軸を断り書きが述べる / 対照: 全部そろえば null', () => {
      const short = skillEvaluation(AXES, [4, 4, 4, 4]);
      const note = unevaluatedAxesNote(short);
      expect(note).toContain(AXES[4]!);
      expect(note).toContain('評価済み 4 軸で出しています');
      expect(unevaluatedAxesNote(skillEvaluation(AXES, [4, 4, 4, 4, 4]))).toBeNull();
      // 1 軸も無いときは別の文
      expect(unevaluatedAxesNote(skillEvaluation(AXES, []))).toContain('評価が 1 軸も入っていません');
    });

    it('★ 1on1 の文面が未評価の軸を育成テーマとして名指ししない', () => {
      // 直す前: 4 軸だけの控えで「『品質』の伸ばし方を一緒に考えましょう」
      const short = skillEvaluation(AXES, [4, 4, 4, 4]);
      expect(oneOnOneFocus('none', short)).not.toContain(`「${AXES[4]}」`);
      // 1 軸も無ければ軸を出さず、評価をそろえるよう促す
      const none = skillEvaluation(AXES, []);
      const text = oneOnOneFocus('none', none);
      expect(text).toContain('まだ評価が入っていません');
      expect(text).not.toContain('「」');
    });
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
    evaluatedCount: 5,
    unevaluatedAxes: [],
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
    expect(r.skill.strength?.axis).toBe('営業力');
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

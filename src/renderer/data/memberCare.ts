/**
 * メンバー評価 × ケア支援 — 純ロジック (IO なし)。
 *
 * チームレーダーの **スキル評価** (5軸 1-5) と 感情解析エンジンの **ウェルビーイング**
 * (気分ログ→{@link EmotionProfile}) を束ね、1on1 の進め方を **ケア優先** で提案する。
 *
 * 設計原則:
 *  - これは人による支援の補助であり、自動的な人事評価・選別ではない (UI でも明示)。
 *  - **心理的に不調なメンバーは、評価・目標設定より先に「まず気持ちを聞く」を提案** する
 *    (counseling.ts の安全思想の延長)。
 *  - 純粋・決定論的。ネットワーク・保存・時刻取得をしない。
 */

import { analyzeProfile, type EmotionProfile, type ScoredNote, type DominantLike, type SentimentLike } from './emotionInsights';

/** スキル熟達レベル。 */
export type SkillLevel = '要支援' | '標準' | '良好' | '優秀';

/** ケア優先度。 */
export type CarePriority = 'high' | 'medium' | 'none';

/** 軸とスコアのペア。 */
export interface AxisScore {
  readonly axis: string;
  readonly score: number;
}

/** スキル評価の要約。 */
export interface SkillEvaluation {
  /** 平均スコア (小数第1位)。 */
  readonly average: number;
  readonly level: SkillLevel;
  /** 最も高い軸 (同点は先頭)。 */
  readonly strength: AxisScore;
  /** 最も低い軸 = 伸びしろ (同点は先頭)。 */
  readonly growth: AxisScore;
}

/** メンバー1人分のケアレポート。 */
export interface CareReport {
  readonly id: string;
  readonly name: string;
  readonly skill: SkillEvaluation;
  readonly priority: CarePriority;
  /** 感情状態の人間可読サマリ。 */
  readonly emotionNote: string;
  /** 1on1 の焦点 (ケア優先で評価とケアを橋渡し)。 */
  readonly oneOnOneFocus: string;
}

/** ケアレポート構築の入力 (スキルスコア + 感情データ)。 */
export interface CareMemberInput {
  readonly id: string;
  readonly name: string;
  /** スキルスコア (軸と同順, 1-5)。 */
  readonly scores: readonly number[];
  readonly moods: readonly ScoredNote[];
  readonly analyses: readonly (DominantLike & SentimentLike)[];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 平均スコアから熟達レベルを判定する。 */
export function skillLevel(average: number): SkillLevel {
  if (average < 2.5) return '要支援';
  if (average < 3.5) return '標準';
  if (average < 4.3) return '良好';
  return '優秀';
}

/** 軸とスコアからスキル評価を組み立てる (純粋)。strength/growth は同点先頭。 */
export function skillEvaluation(axes: readonly string[], scores: readonly number[]): SkillEvaluation {
  if (axes.length === 0) {
    const empty: AxisScore = { axis: '', score: 0 };
    return { average: 0, level: skillLevel(0), strength: empty, growth: empty };
  }
  // 先頭をシード (空チェック後なので axes[0] は必ず在る) し、1 件目以降を走査する。
  let sum = scores[0] ?? 0;
  let strength: AxisScore = { axis: axes[0]!, score: scores[0] ?? 0 };
  let growth: AxisScore = { axis: axes[0]!, score: scores[0] ?? 0 };
  for (let i = 1; i < axes.length; i += 1) {
    const score = scores[i] ?? 0;
    sum += score;
    if (score > strength.score) strength = { axis: axes[i]!, score };
    if (score < growth.score) growth = { axis: axes[i]!, score };
  }
  const average = round1(sum / axes.length);
  return { average, level: skillLevel(average), strength, growth };
}

/** 感情プロファイルからケア優先度を判定する。 */
export function carePriority(profile: EmotionProfile): CarePriority {
  if (profile.count === 0) return 'none';
  if (profile.lowStreak >= 3) return 'high';
  if (profile.averageScore <= 2.5 || profile.sentimentBalance < 0) return 'medium';
  return 'none';
}

const TREND_JA: Record<EmotionProfile['trend'], string> = {
  improving: '上向き',
  declining: '下向き',
  stable: '横ばい',
};

/** 感情プロファイルを人間可読サマリへ。 */
export function emotionNoteOf(profile: EmotionProfile): string {
  if (profile.count === 0) return '気分データなし';
  const base = `気分の平均 ${round1(profile.averageScore)}/5・傾向 ${TREND_JA[profile.trend]}`;
  return profile.lowStreak >= 2 ? `${base}・連続低調 ${profile.lowStreak}日` : base;
}

/** ケア優先度 + スキル評価から 1on1 の焦点を組み立てる。 */
export function oneOnOneFocus(priority: CarePriority, skill: SkillEvaluation): string {
  if (priority === 'high') {
    return 'まず気持ちに耳を傾けてください。評価や目標設定は、落ち着いてからで大丈夫です。';
  }
  if (priority === 'medium') {
    return `「${skill.strength.axis}」の強みを認めつつ、最近の様子にも触れながら「${skill.growth.axis}」の育成を一緒に。`;
  }
  return `「${skill.strength.axis}」を活かし、「${skill.growth.axis}」の伸ばし方を一緒に考えましょう。`;
}

/** 1 メンバーのケアレポートを組み立てる (純粋)。 */
export function buildMemberCareReport(member: CareMemberInput, axes: readonly string[]): CareReport {
  const profile = analyzeProfile(member.moods, member.analyses);
  const skill = skillEvaluation(axes, member.scores);
  const priority = carePriority(profile);
  return {
    id: member.id,
    name: member.name,
    skill,
    priority,
    emotionNote: emotionNoteOf(profile),
    oneOnOneFocus: oneOnOneFocus(priority, skill),
  };
}

/** 優先度の並び順 (high→medium→none)。 */
const PRIORITY_RANK: Record<CarePriority, number> = { high: 0, medium: 1, none: 2 };

/** チームのケア概況。 */
export interface TeamCare {
  /** ケア優先度順 (high→medium→none) に並べたレポート (同順位は入力順)。 */
  readonly reports: readonly CareReport[];
  /** high の人数。 */
  readonly highCount: number;
  /** medium の人数。 */
  readonly mediumCount: number;
  /** 推奨 1on1 サマリ。 */
  readonly summary: string;
}

/** チーム全体のケアレポートを組み立て、ケア優先度順に並べる (純粋)。 */
export function buildTeamCare(members: readonly CareMemberInput[], axes: readonly string[]): TeamCare {
  const reports = members.map((m) => buildMemberCareReport(m, axes));
  // rank 昇順で並べる。同 rank は入力順 (Array.prototype.sort は ES2019 以降 安定)。
  const ordered = [...reports].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
  const highCount = reports.filter((r) => r.priority === 'high').length;
  const mediumCount = reports.filter((r) => r.priority === 'medium').length;

  let summary: string;
  if (members.length === 0) {
    summary = 'メンバーがいません。';
  } else if (highCount > 0) {
    summary = `${highCount} 名は気持ちのケアを優先してください（評価より先に傾聴を）。`;
  } else if (mediumCount > 0) {
    summary = `${mediumCount} 名は最近の様子に気を配りつつ 1on1 を。`;
  } else {
    summary = '全員が安定しています。強みを伸ばす 1on1 を進めましょう。';
  }

  return { reports: ordered, highCount, mediumCount, summary };
}

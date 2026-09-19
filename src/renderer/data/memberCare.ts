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
import { isPlottableScore } from '../../shared/radarPlot';

/** スキル熟達レベル。 */
export type SkillLevel = '要支援' | '標準' | '良好' | '優秀';

/** ケア優先度。 */
/**
 * ケア優先度。
 *
 * **`'unknown'` は「気分の記録がまだ無い」。** `'none'` (懸念なし) と混ぜてはいけない
 * —— 2026-09-09 まで `carePriority` は `count === 0` を `'none'` に倒しており、
 * **記録が 1 件も無い人を「安定している」と断言**していた
 * (同じモジュールの `emotionNoteOf` は正しく「気分データなし」と言っていたので、
 * 人ごとの文面と優先度が食い違っていた)。
 */
export type CarePriority = 'high' | 'medium' | 'unknown' | 'none';

/** 軸とスコアのペア。 */
export interface AxisScore {
  readonly axis: string;
  readonly score: number;
}

/** スキル評価の要約。 */
export interface SkillEvaluation {
  /**
   * 評価済みの軸だけの平均スコア (小数第1位)。**1 軸も評価されていなければ null。**
   *
   * 2026-09-08 まで未評価の軸を **0 点**として平均していた。実測 (5 軸・
   * 4 軸だけ入った控え):
   *
   * | 控え | average | level | 伸びしろ |
   * | --- | ---: | --- | --- |
   * | 4,4,4,4,4 | 4.0 | 良好 | 技術 (4) |
   * | **4,4,4,4 (5 軸目が無い)** | **3.2** | **標準** | **品質 (0)** |
   * | **3,3 (2 軸だけ)** | **1.2** | **要支援** | 推進 (0) |
   *
   * 評点は 1〜5 なので 0 は「その軸が評価されていない」であって「0 点」ではない。
   */
  readonly average: number | null;
  /** 熟達レベル。平均が出せなければ null。 */
  readonly level: SkillLevel | null;
  /** 最も高い**評価済みの**軸 (同点は先頭)。1 軸も評価されていなければ null。 */
  readonly strength: AxisScore | null;
  /** 最も低い**評価済みの**軸 = 伸びしろ (同点は先頭)。同上。 */
  readonly growth: AxisScore | null;
  /** 評価済みの軸数 (平均の分母)。 */
  readonly evaluatedCount: number;
  /** 評価が入っていない軸の名前。**画面がこれを述べる。** */
  readonly unevaluatedAxes: readonly string[];
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

/**
 * 評点の範囲。**この 1 か所が持つ** —— 画面 (`TeamRadarPage`) はここを読む
 * (同じ数を 2 か所に書くと、片方を広げたときに平均の判定だけが古いままになる)。
 */
export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

/**
 * その位置の評点が**評価済み**か。範囲外 (0 を含む) と欠測は「未評価」。
 *
 * 控えの `scores` は軸数より短いことがある (軸が増えた後の下書き・手で直した
 * localStorage・古い版)。`teamRadarDraft.ts` の受け口は並びを崩さないために
 * 長さを揃えないので、**読む側が「無い」を扱う**。
 */
export function isEvaluatedScore(v: unknown): v is number {
  // **判定は `shared/radarPlot.ts` の 1 つ** (パス 190) —— ここに写しを持つと、
  // 「平均が数える値」と「図に置ける値」が別々に動く (実測でそうなっていた:
  // 評点の欄は 0 を「—」と刷り、多角形は 0 を中心に置いていた)。
  return isPlottableScore(v);
}

/** 平均スコアから熟達レベルを判定する。 */
export function skillLevel(average: number): SkillLevel {
  if (average < 2.5) return '要支援';
  if (average < 3.5) return '標準';
  if (average < 4.3) return '良好';
  return '優秀';
}

/** 軸とスコアからスキル評価を組み立てる (純粋)。strength/growth は同点先頭。 */
export function skillEvaluation(axes: readonly string[], scores: readonly number[]): SkillEvaluation {
  // **評価済みの軸だけを走査する。** シードを置かず、最初の評価済みで初期化する
  // (先頭の軸が未評価でも強み・伸びしろがそこに固定されない)。
  let sum = 0;
  let evaluatedCount = 0;
  let strength: AxisScore | null = null;
  let growth: AxisScore | null = null;
  const unevaluatedAxes: string[] = [];
  for (let i = 0; i < axes.length; i += 1) {
    const axis = axes[i]!;
    const raw = scores[i];
    if (!isEvaluatedScore(raw)) {
      unevaluatedAxes.push(axis);
      continue;
    }
    sum += raw;
    evaluatedCount += 1;
    if (strength === null || raw > strength.score) strength = { axis, score: raw };
    if (growth === null || raw < growth.score) growth = { axis, score: raw };
  }
  if (evaluatedCount === 0) {
    return { average: null, level: null, strength: null, growth: null, evaluatedCount: 0, unevaluatedAxes };
  }
  const average = round1(sum / evaluatedCount);
  return { average, level: skillLevel(average), strength, growth, evaluatedCount, unevaluatedAxes };
}

/**
 * 評価が入っていない軸が在ることの断り。1 つも無ければ `null`。
 * **画面がこの 1 文を出す** —— 平均の分母が軸数と違う理由は数字からは読めない。
 */
export function unevaluatedAxesNote(skill: SkillEvaluation): string | null {
  if (skill.unevaluatedAxes.length === 0) return null;
  const names = skill.unevaluatedAxes.join('・');
  if (skill.evaluatedCount === 0) {
    return `評価が 1 軸も入っていません（${names}）。平均・強み・伸びしろは算定していません。`;
  }
  return `${names} は評価が入っていないため、平均は評価済み ${skill.evaluatedCount} 軸で出しています（0 点として平均すると全体が下がります）。`;
}

/** 感情プロファイルからケア優先度を判定する。 */
export function carePriority(profile: EmotionProfile): CarePriority {
  // **記録が無いのは「懸念なし」ではない。** 分からないだけである。
  if (profile.count === 0) return 'unknown';
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
  // **評価が 1 軸も無ければ軸を名指ししない。** 2026-09-08 まで未評価の軸が
  // 0 点として「最も低い軸」になり、**誰も評価していない軸を育成テーマとして
  // 名指ししていた** (実測: 4 軸だけ入った控えで「『品質』の伸ばし方を一緒に」)。
  if (skill.strength === null || skill.growth === null) {
    return 'まだ評価が入っていません。5 軸の評価をそろえてから、強みと伸びしろの話をしましょう。';
  }
  // 気分の記録が無い人には「安定しているから強みを伸ばそう」と言わない。
  if (priority === 'unknown') {
    return `気分の記録がまだありません。まずは近況を尋ねてから、「${skill.strength.axis}」の活かし方を話しましょう。`;
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

/** 優先度の並び順 (high→medium→unknown→none)。 */
// **`unknown` は `none` より前。** 「分からない人」は「大丈夫な人」より先に
// 目に入るべきである (声をかければ分かる、という行動につながる)。
const PRIORITY_RANK: Record<CarePriority, number> = { high: 0, medium: 1, unknown: 2, none: 3 };

/** チームのケア概況。 */
export interface TeamCare {
  /** ケア優先度順 (high→medium→unknown→none) に並べたレポート (同順位は入力順)。 */
  readonly reports: readonly CareReport[];
  /** high の人数。 */
  readonly highCount: number;
  /** medium の人数。 */
  readonly mediumCount: number;
  /** 気分の記録がまだ無い人数 (「安定」に数えない)。 */
  readonly unknownCount: number;
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
  const unknownCount = reports.filter((r) => r.priority === 'unknown').length;

  let summary: string;
  if (members.length === 0) {
    summary = 'メンバーがいません。';
  } else if (highCount > 0) {
    summary = `${highCount} 名は気持ちのケアを優先してください（評価より先に傾聴を）。`;
  } else if (mediumCount > 0) {
    summary = `${mediumCount} 名は最近の様子に気を配りつつ 1on1 を。`;
  } else if (unknownCount === members.length) {
    // **全員が未記録。** 旧実装はここで「全員が安定しています」と言っていた ——
    // 1 件も記録が無い状態に対する断言だった。
    summary = `気分の記録がまだありません（${unknownCount} 名）。まずは近況を聞くところから始めましょう。`;
  } else if (unknownCount > 0) {
    // **「安定」は記録が在る人についてだけ言う。**
    summary = `記録のある ${members.length - unknownCount} 名は安定しています。残り ${unknownCount} 名は気分の記録がまだありません。`;
  } else {
    summary = '全員が安定しています。強みを伸ばす 1on1 を進めましょう。';
  }

  return { reports: ordered, highCount, mediumCount, unknownCount, summary };
}

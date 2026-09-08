/**
 * チーム感情ウェルビーイング・レーダー — 純ロジック (IO なし)。
 *
 * 既存の感情解析エンジン ({@link analyzeProfile}) と チームレーダー (5軸の 1-5 評価を
 * SVG レーダー描画) を **連携** させる層。各メンバーの気分ログ/テキスト分析から
 * {@link EmotionProfile} を導出し、それを感情の 5 軸スコア (1-5) に写してチームの
 * 感情レーダーを組み立てる。さらに「連続して低調」「平均が低い」メンバーを抽出し、
 * カウンセリング的な声かけ提案を返す (本人のセルフケア支援の延長で、診断ではない)。
 *
 * プライバシー: 入力配列のみを扱い、ネットワーク・保存・時刻取得をしない (決定論的)。
 */

import { round1 } from '../../shared/num';
import { analyzeProfile, type EmotionProfile, type ScoredNote, type DominantLike, type SentimentLike } from './emotionInsights';

/** 感情レーダーの 5 軸 (チームレーダーの軸数 5 に合わせる)。 */
export const EMOTION_AXES = ['活力', '前向き', '安定', '余裕', '回復力'] as const;

/** メンバー1人分の感情データ入力。 */
export interface MemberEmotion {
  readonly id: string;
  readonly name: string;
  readonly moods: readonly ScoredNote[];
  readonly analyses: readonly (DominantLike & SentimentLike)[];
}

/**
 * レーダー描画用のメンバー (scores は EMOTION_AXES と同順, 1-5)。
 *
 * **記録が無い軸は `null`。** 0 を置くと描画で中心に落ち、
 * 「その軸が最低」という幾何になる (パス 59)。
 */
export interface RadarMember {
  readonly id: string;
  readonly name: string;
  readonly scores: readonly (number | null)[];
}

/** 記録が足りずに点数を出せなかったメンバーと、その軸名。 */
export interface MissingData {
  readonly id: string;
  readonly name: string;
  readonly axes: readonly string[];
}

/** 声かけが推奨されるメンバー。 */
export interface SupportFlag {
  readonly id: string;
  readonly name: string;
  readonly reason: string;
}

/** チーム感情レーダーの結果。 */
export interface TeamEmotionRadar {
  readonly axes: readonly string[];
  readonly members: readonly RadarMember[];
  /**
   * 軸ごとのチーム平均。**その軸の点数を持つメンバーだけで平均する。**
   * 誰も持たない軸 (メンバー 0 人を含む) は `null`。
   *
   * 2026-09-09 まで「メンバー0人なら全軸 0」だった。記録していない人を
   * 0 点として頭数に入れると、平均は**参加率の関数**になり、
   * 感情の測定値ではなくなる (パス 55 と同じ形)。
   */
  readonly teamAverage: readonly (number | null)[];
  /** 声かけ推奨メンバー。 */
  readonly needsSupport: readonly SupportFlag[];
  /** 記録が足りず点数を出せなかったメンバー (画面が名指しで断るために読む)。 */
  readonly missingData: readonly MissingData[];
}

/** 1..5 にクランプする。 */
function clamp1to5(n: number): number {
  return Math.min(5, Math.max(1, n));
}

/** 小数第1位に丸める (レーダー描画・表示用)。 */

/** 傾向を回復力スコアの加点へ写す (improving +2 / stable 0 / declining -2)。 */
export function trendScore(trend: EmotionProfile['trend']): number {
  if (trend === 'improving') return 2;
  if (trend === 'declining') return -2;
  return 0;
}

/**
 * 縦断プロファイルを感情レーダーの 5 軸スコア (1-5) へ写す (純粋・決定論的)。
 *  - 活力   = 平均スコア
 *  - 前向き = 3 + sentimentBalance×2  (−1→1, 0→3, +1→5)
 *  - 安定   = 5 − volatility×2        (変動が小さいほど高い)
 *  - 余裕   = 直近平均スコア
 *  - 回復力 = 3 + 傾向加点 − min(連続低調日数, 2)
 */
export function emotionRadarScores(profile: EmotionProfile): (number | null)[] {
  // **軸ごとに分母が違う。** 4 軸は気分の記録 (`count`) から、前向きだけは
  // 本文解析 (`analysisCount`) から来る。記録が無い軸は**点数を出さない**。
  //
  // 2026-09-09 まで、記録ゼロの人は `[1, 3, 5, 1, 3]` になっていた ——
  // `clamp1to5(0)` が 1 に、`5 - 0*2` が 5 になるため、**同じ「データが無い」
  // から最低点 (活力・余裕) と最高点 (安定) が同時に出ていた**。
  // 一貫した偏りですらなく、雑音が信号として出ていた。
  const hasMoods = profile.count > 0;
  const hasAnalyses = profile.analysisCount > 0;
  return [
    hasMoods ? round1(clamp1to5(profile.averageScore)) : null,
    hasAnalyses ? round1(clamp1to5(3 + profile.sentimentBalance * 2)) : null,
    hasMoods ? round1(clamp1to5(5 - profile.volatility * 2)) : null,
    hasMoods ? round1(clamp1to5(profile.recentAverage)) : null,
    hasMoods ? round1(clamp1to5(3 + trendScore(profile.trend) - Math.min(profile.lowStreak, 2))) : null,
  ];
}

/** 軸ごとの分母 (どの記録から来るか)。画面の断り書きが読む。 */
export const AXIS_SOURCE = ['moods', 'analyses', 'moods', 'moods', 'moods'] as const;

/** プロファイルから声かけ理由を判定する (該当なしは null)。 */
export function supportReason(profile: EmotionProfile): string | null {
  if (profile.lowStreak >= 3) return `連続して低調が ${profile.lowStreak} 日`;
  if (profile.count > 0 && profile.averageScore <= 2) return '平均的な気分が低め';
  return null;
}

/**
 * メンバー群の感情データからチーム感情レーダーを組み立てる (純粋・決定論的)。
 * 入力順を保持。メンバー0人なら空のレーダー (teamAverage は全軸 0)。
 */
export function buildTeamEmotionRadar(members: readonly MemberEmotion[]): TeamEmotionRadar {
  const radarMembers: RadarMember[] = [];
  const needsSupport: SupportFlag[] = [];
  const missingData: MissingData[] = [];
  const sums = EMOTION_AXES.map(() => 0);
  // **軸ごとに「点数を持っていた人数」を数える。** 記録の無い人を 0 点で
  // 頭数に入れると、平均が参加率の関数になる (パス 55)。
  const counts = EMOTION_AXES.map(() => 0);

  for (const m of members) {
    const profile = analyzeProfile(m.moods, m.analyses);
    const scores = emotionRadarScores(profile);
    radarMembers.push({ id: m.id, name: m.name, scores });
    const missingAxes: string[] = [];
    for (let i = 0; i < sums.length; i += 1) {
      const v = scores[i];
      if (v === null || v === undefined) {
        missingAxes.push(EMOTION_AXES[i]!);
        continue;
      }
      sums[i]! += v;
      counts[i]! += 1;
    }
    if (missingAxes.length > 0) {
      missingData.push({ id: m.id, name: m.name, axes: missingAxes });
    }
    const reason = supportReason(profile);
    if (reason !== null) {
      needsSupport.push({ id: m.id, name: m.name, reason });
    }
  }

  // **どのメンバーも値を持たない軸は、結果から落とす。**
  // 入力が 1 件も無い軸を描くと、全員がその軸で「欠測」になり図が空になる
  // (画面は本文解析を渡していないので、前向きが常にこれに当たる)。
  // 落とすことで「入力の在る軸だけを描く」自己調整になり、解析が配線されたら
  // 5 軸目が自動で現れる。**軸を隠すのではなく、無い物を主張しないだけ。**
  const keep = EMOTION_AXES.map((_, i) => counts[i]! > 0);
  // 全軸が生きているなら**元の配列をそのまま返す** (同一性を保つ ——
  // 呼び出し側が `toBe(EMOTION_AXES)` で見ている)。
  const anyKept = keep.some(Boolean) && !keep.every(Boolean);
  const pick = <T,>(arr: readonly T[]): T[] => arr.filter((_, i) => keep[i]!);

  // メンバーが 0 人のときは軸を落とさない (「軸が無い」ではなく「人が居ない」)。
  const axes = anyKept ? pick(EMOTION_AXES) : EMOTION_AXES;
  const teamAverage = (anyKept ? pick(sums.map((s, i) => [s, i] as const)) : sums.map((s, i) => [s, i] as const)).map(
    ([sum, i]) => (counts[i]! > 0 ? round1(sum / counts[i]!) : null),
  );

  return {
    axes,
    members: anyKept
      ? radarMembers.map((m) => ({ ...m, scores: pick(m.scores) }))
      : radarMembers,
    teamAverage,
    needsSupport,
    // 落とした軸について「欠測」と名指ししない (誰も持っていない軸なので)。
    missingData: anyKept
      ? missingData
          .map((m) => ({ ...m, axes: m.axes.filter((a) => (axes as readonly string[]).includes(a)) }))
          .filter((m) => m.axes.length > 0)
      : missingData,
  };
}

/** チームの感情レーダーから 1 行のサマリ文を作る (表示用)。 */
export function teamEmotionSummary(radar: TeamEmotionRadar): string {
  const n = radar.members.length;
  if (n === 0) return 'メンバーの感情データがありません。';
  const support = radar.needsSupport.length;
  // **算定できていなければ数を出さない。** `?? 0` を当てると
  // 「活力 0/5」= 最低評価になり、記録が無いことが最悪の評価として出る。
  const vitality = radar.teamAverage[0];
  const head =
    vitality === null || vitality === undefined
      ? `チーム ${n} 名の感情ウェルビーイング: 活力は気分の記録がまだ無いため算定していません`
      : `チーム ${n} 名の感情ウェルビーイング: 活力 ${vitality}/5`;
  if (support === 0) {
    return `${head}。いまのところ全員が安定しています。`;
  }
  return `${head}。${support} 名に声かけをおすすめします。`;
}

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

/** レーダー描画用のメンバー (scores は EMOTION_AXES と同順, 1-5)。 */
export interface RadarMember {
  readonly id: string;
  readonly name: string;
  readonly scores: readonly number[];
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
  /** 軸ごとのチーム平均 (メンバー0人なら全軸 0)。 */
  readonly teamAverage: readonly number[];
  /** 声かけ推奨メンバー。 */
  readonly needsSupport: readonly SupportFlag[];
}

/** 1..5 にクランプする。 */
function clamp1to5(n: number): number {
  return Math.min(5, Math.max(1, n));
}

/** 小数第1位に丸める (レーダー描画・表示用)。 */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

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
export function emotionRadarScores(profile: EmotionProfile): number[] {
  return [
    round1(clamp1to5(profile.averageScore)),
    round1(clamp1to5(3 + profile.sentimentBalance * 2)),
    round1(clamp1to5(5 - profile.volatility * 2)),
    round1(clamp1to5(profile.recentAverage)),
    round1(clamp1to5(3 + trendScore(profile.trend) - Math.min(profile.lowStreak, 2))),
  ];
}

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
  const sums = EMOTION_AXES.map(() => 0);

  for (const m of members) {
    const profile = analyzeProfile(m.moods, m.analyses);
    const scores = emotionRadarScores(profile);
    radarMembers.push({ id: m.id, name: m.name, scores });
    for (let i = 0; i < sums.length; i += 1) {
      sums[i]! += scores[i]!;
    }
    const reason = supportReason(profile);
    if (reason !== null) {
      needsSupport.push({ id: m.id, name: m.name, reason });
    }
  }

  const n = members.length;
  const teamAverage = sums.map((s) => (n > 0 ? round1(s / n) : 0));

  return {
    axes: EMOTION_AXES,
    members: radarMembers,
    teamAverage,
    needsSupport,
  };
}

/** チームの感情レーダーから 1 行のサマリ文を作る (表示用)。 */
export function teamEmotionSummary(radar: TeamEmotionRadar): string {
  const n = radar.members.length;
  if (n === 0) return 'メンバーの感情データがありません。';
  const support = radar.needsSupport.length;
  const vitality = radar.teamAverage[0] ?? 0;
  const head = `チーム ${n} 名の感情ウェルビーイング: 活力 ${vitality}/5`;
  if (support === 0) {
    return `${head}。いまのところ全員が安定しています。`;
  }
  return `${head}。${support} 名に声かけをおすすめします。`;
}

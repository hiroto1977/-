/**
 * 月次トレンドのアラート — 連続悪化の早期検知 (純粋ロジック)。
 *
 * KPI 実績の期 (YYYY-MM) 系列から、売上・営業利益が「何期連続で前期を下回って
 * いるか」(下落ストリーク) を検出し、経営の変調を早期に知らせる。点ではなく
 * 「連続して下がっている」という傾きを見ることで、単月のブレと構造的悪化を
 * 区別する。IO は持たない。
 *
 * **重要 — 概算の経営診断であり財務助言ではありません。**
 */
import {
  groupRevenueByPeriod,
  groupOperatingProfitByPeriod,
  type KpiActual,
} from './kpiActuals';

/** 1 指標の連続下落検知。 */
export interface DeclineStreak {
  /** 直近で連続して前期を下回っている期数 (0 = 直近は下落していない)。 */
  readonly streak: number;
  /** 比較できた期があるか (系列が 2 期以上)。 */
  readonly hasSeries: boolean;
  /** 直近期の値。 */
  readonly latest: number;
  /** ストリーク起点 (下落が始まる前) の値。streak 0 なら latest と同じ。 */
  readonly peak: number;
  /** ピークからの下落率 (%)。peak<=0 や streak 0 なら null。 */
  readonly dropFromPeakPct: number | null;
}

/** 値系列 (期昇順) の末尾から、連続して前期を下回っている数を数える。 */
function declineStreakOf(series: readonly number[]): DeclineStreak {
  if (series.length < 2) {
    const latest = series[series.length - 1] ?? 0;
    return { streak: 0, hasSeries: false, latest, peak: latest, dropFromPeakPct: null };
  }
  let streak = 0;
  // i>0 を i>=0 にしても、i=0 では series[-1]=undefined との比較が false で即 break する
  // ため streak は不変 (equivalent)。EqualityOperator を無効化する。
  // Stryker disable next-line EqualityOperator
  for (let i = series.length - 1; i > 0; i -= 1) {
    if (series[i]! < series[i - 1]!) streak += 1;
    else break;
  }
  const latest = series[series.length - 1]!;
  const peak = series[series.length - 1 - streak]!;
  const dropFromPeakPct = streak > 0 && peak > 0
    ? Math.round(((peak - latest) / peak) * 1000) / 10
    : null;
  return { streak, hasSeries: true, latest, peak, dropFromPeakPct };
}

/** 売上・営業利益の月次トレンドアラート。 */
export interface TrendAlerts {
  readonly revenue: DeclineStreak;
  readonly operatingProfit: DeclineStreak;
}

/** KPI 実績から売上・営業利益の連続下落を検出する。 */
export function computeTrendAlerts(actuals: readonly KpiActual[]): TrendAlerts {
  const revenue = declineStreakOf(groupRevenueByPeriod(actuals).map((p) => p.revenue));
  const operatingProfit = declineStreakOf(
    groupOperatingProfitByPeriod(actuals).map((p) => p.operatingProfit),
  );
  return { revenue, operatingProfit };
}

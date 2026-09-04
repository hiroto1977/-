/**
 * 営業利益率トレンド分析 (Phase 7) — 事業の月次履歴から、利用可能な期間の
 * 営業利益率の推移を「改善 / 横ばい / 悪化」に判定する純粋ロジック。
 *
 * snapshot の履歴は8期分（前年同期=12ヶ月前のデータは無い）ため、YoY ではなく
 * 履歴の先頭→末尾の変化（パーセントポイント差）でトレンドを評価する。
 *
 * **概算であり財務助言ではありません。**
 */

export type TrendDirection = 'up' | 'flat' | 'down';

export interface MarginTrend {
  readonly direction: TrendDirection;
  readonly firstMarginPct: number | null;
  readonly lastMarginPct: number | null;
  /** 末尾 − 先頭 のパーセントポイント差 (算定不能時 null)。 */
  readonly deltaPct: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 履歴 (古い順) の営業利益率トレンドを評価する。±0.2pt 以内は横ばい。 */
export function analyzeMarginTrend(
  history: readonly { readonly revenue: number; readonly profit: number }[],
): MarginTrend {
  const margins = history.filter((h) => h.revenue > 0).map((h) => (h.profit / h.revenue) * 100);
  if (margins.length < 2) {
    const only = margins.length === 1 ? round1(margins[0]!) : null;
    return { direction: 'flat', firstMarginPct: only, lastMarginPct: only, deltaPct: null };
  }
  const first = margins[0]!;
  const last = margins[margins.length - 1]!;
  const delta = round1(last - first);
  const direction: TrendDirection = delta > 0.2 ? 'up' : delta < -0.2 ? 'down' : 'flat';
  return { direction, firstMarginPct: round1(first), lastMarginPct: round1(last), deltaPct: delta };
}

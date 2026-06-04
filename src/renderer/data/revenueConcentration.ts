/**
 * 売上集中度 (チャネル依存リスク) — 販売チャネルの構成から集中度を測る純粋ロジック。
 *
 * 資金調達の多様化スコア (fundingDiversification) の売上版。特定のチャネルへの
 * 依存が高いほど、そのチャネルの不調が経営に直撃する構造リスクとなる。
 * 売上集計の `byChannel` (シェア付き) を入力に取り、IO は持たない。
 *
 * **重要 — 概算の経営診断であり財務助言ではありません。**
 */

/** チャネル別の売上シェア (集計済み)。`summarizeSales` の byChannel と同形。 */
export interface ChannelShare {
  readonly label: string;
  readonly amount: number;
}

/** 売上集中度の指標。 */
export interface RevenueConcentration {
  /** 売上が 0 超のチャネル数。 */
  readonly channelsPresent: number;
  /** ハーフィンダール指数 (Σ シェア², 0..1; 1 = 1 チャネルに集中)。 */
  readonly hhi: number;
  /** 実効的なチャネル数 = 1 ÷ HHI (分散の目安)。 */
  readonly effectiveChannels: number;
  /** 最大シェアのチャネル。チャネルが無ければ null。 */
  readonly topChannel: string | null;
  /** 最大シェアの比率 (%)。 */
  readonly topSharePct: number;
  /** 分散スコア (0..100, 高いほど分散) = (1 − HHI) × 100。 */
  readonly diversityScore: number;
  /** 単一チャネル依存 (最大シェア > 60%) か。 */
  readonly singleChannelRisk: boolean;
}

/**
 * チャネル別売上から集中度 (HHI) を計算する。
 * 1 チャネルに偏るほど集中 (HHI→1, スコア→0)、均等に分散するほど多様
 * (HHI→0, スコア→100)。売上合計が 0 のときは算定不能 (null)。
 */
export function computeRevenueConcentration(
  channels: readonly ChannelShare[],
): RevenueConcentration | null {
  // amount===0 のチャネルを含めても合計/HHI/トップシェアに影響しないため、
  // > → >= の EqualityOperator は equivalent (負値除外は filter 本体で検証)。
  // Stryker disable next-line EqualityOperator
  const present = channels.filter((c) => c.amount > 0);
  const total = present.reduce((s, c) => s + c.amount, 0);
  if (total <= 0) return null;
  let hhi = 0;
  let topChannel: string | null = null;
  let topShare = 0;
  for (const c of present) {
    const share = c.amount / total;
    hhi += share * share;
    if (share > topShare) {
      topShare = share;
      topChannel = c.label;
    }
  }
  return {
    channelsPresent: present.length,
    hhi: Math.round(hhi * 1000) / 1000,
    effectiveChannels: Math.round((1 / hhi) * 10) / 10,
    topChannel,
    topSharePct: Math.round(topShare * 1000) / 10,
    diversityScore: Math.round((1 - hhi) * 100),
    singleChannelRisk: topShare > 0.6,
  };
}

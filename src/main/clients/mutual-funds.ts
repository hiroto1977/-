import type { FetchContext } from './types';

/**
 * 投資信託 — 投資ポートフォリオ (snapshot 専用)。
 *
 * SBI / 楽天証券 等の証券会社 API は要パートナー認証で本プロジェクトでは
 * 未配線。このファイルは `LIVE_FETCHERS` invariant を満たすための static
 * stub。実際のページは `SNAPSHOT.mutualFunds` を直接描画するため、refresh
 * ボタンでネットワーク呼び出しは発生しない。将来証券会社 API を配線する
 * 際は、この fetcher 内で同じ shape を返却する。
 */

export interface MutualFundsSnapshot {
  readonly holdings: ReadonlyArray<{
    readonly code: string;
    readonly name: string;
    readonly units: number;
    readonly navPerUnit: number;
    readonly valuation: number;
    readonly ytdReturnPct: number;
    /** ユーザーが手動で付けたタグ (任意。`undefined` の銘柄ではバッジ非表示)。 */
    readonly userTag?: string;
  }>;
  readonly portfolio: {
    readonly totalValuation: number;
    readonly totalCostBasis: number;
    readonly unrealizedGain: number;
    readonly unrealizedGainPct: number;
  };
  readonly recentDividends: ReadonlyArray<{
    readonly code: string;
    readonly amount: number;
    readonly paidAt: string;
  }>;
}

// Stryker disable next-line all
const STUB: MutualFundsSnapshot = {
  holdings: [],
  portfolio: { totalValuation: 0, totalCostBasis: 0, unrealizedGain: 0, unrealizedGainPct: 0 },
  recentDividends: [],
};

export async function fetchMutualFundsSnapshotImpl(_ctx: FetchContext): Promise<MutualFundsSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchMutualFundsSnapshot(ctx: FetchContext): Promise<MutualFundsSnapshot> {
  return fetchMutualFundsSnapshotImpl(ctx);
}

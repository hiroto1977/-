import type { FetchContext } from './types';

/**
 * 不動産投資 — 投資ポートフォリオ (snapshot 専用)。
 *
 * 公開 REST API は限定的 (J-REIT XBRL / 楽待 API は要パートナー契約)。
 * このファイルは `LIVE_FETCHERS` invariant を満たすための static stub。
 * 実際のページは `SNAPSHOT.realEstate` を直接描画するため、refresh ボタン
 * でネットワーク呼び出しは発生しない。将来 broker / REIT データソースを
 * 配線する際は、この fetcher 内で同じ shape を返却する。
 */

export interface RealEstateSnapshot {
  readonly properties: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly monthlyRent: number;
    readonly occupied: boolean;
    readonly yieldPct: number;
    readonly purchasePrice: number;
  }>;
  readonly monthlyCashflow: {
    readonly grossRent: number;
    readonly operatingExpenses: number;
    readonly mortgagePayment: number;
    readonly netCashflow: number;
  };
  readonly portfolioYield: number;
  readonly occupancyRate: number;
}

// Stryker disable next-line all
const STUB: RealEstateSnapshot = {
  properties: [],
  monthlyCashflow: { grossRent: 0, operatingExpenses: 0, mortgagePayment: 0, netCashflow: 0 },
  portfolioYield: 0,
  occupancyRate: 0,
};

export async function fetchRealEstateSnapshotImpl(_ctx: FetchContext): Promise<RealEstateSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchRealEstateSnapshot(ctx: FetchContext): Promise<RealEstateSnapshot> {
  return fetchRealEstateSnapshotImpl(ctx);
}

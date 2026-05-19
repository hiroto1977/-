import type { FetchContext } from './types';

/**
 * Uber Eats — フードデリバリー (snapshot 専用)。
 *
 * Eats Merchants API はパートナー認証が必須で、本プロジェクトでは未配線。
 * このファイルは `LIVE_FETCHERS` invariant (clients/index.ts:33-85 で
 * すべての ServiceId が登録されている必要がある) を満たすための static
 * stub。実際の業務 KPI ダッシュボードは `SNAPSHOT.uberEats` を直接
 * 描画するため、refresh ボタンを押してもネットワーク呼び出しは発生せず、
 * 同等のデータが返る。パートナー資格を取得して live を有効化する際は、
 * この fetcher 内で fetch を行い同じ shape で返却する。
 */

export interface UberEatsSnapshot {
  readonly stores: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly orders: number;
    readonly revenue: number;
    readonly rating: number;
    readonly openRate: number;
  }>;
  readonly topItems: ReadonlyArray<{
    readonly name: string;
    readonly sold: number;
    readonly revenue: number;
  }>;
  readonly weekRevenue: number;
  readonly weekOrders: number;
  readonly avgRating: number;
}

// Stryker disable next-line all
const STUB: UberEatsSnapshot = {
  stores: [],
  topItems: [],
  weekRevenue: 0,
  weekOrders: 0,
  avgRating: 0,
};

export async function fetchUberEatsSnapshotImpl(_ctx: FetchContext): Promise<UberEatsSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchUberEatsSnapshot(ctx: FetchContext): Promise<UberEatsSnapshot> {
  return fetchUberEatsSnapshotImpl(ctx);
}

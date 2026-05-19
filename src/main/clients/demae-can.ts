import type { FetchContext } from './types';

/**
 * 出前館 — フードデリバリー (snapshot 専用)。
 *
 * 公開 REST API が存在しないため本プロジェクトでは未配線。
 * このファイルは `LIVE_FETCHERS` invariant (clients/index.ts:33-85 で
 * すべての ServiceId が登録されている必要がある) を満たすための static
 * stub。実際の業務 KPI ダッシュボードは `SNAPSHOT.demaeCan` を直接
 * 描画するため、refresh ボタンを押してもネットワーク呼び出しは発生しない。
 * 将来 scrape ベース実装を入れる際は、この fetcher 内で同じ shape を返却する。
 */

export interface DemaeCanSnapshot {
  readonly orders: ReadonlyArray<{
    readonly id: string;
    readonly customer: string;
    readonly items: number;
    readonly total: number;
    readonly status: string;
    readonly area: string;
  }>;
  readonly monthSummary: {
    readonly orders: number;
    readonly revenue: number;
    readonly avgOrderValue: number;
    readonly cancellationRate: number;
  };
  readonly topAreas: ReadonlyArray<{
    readonly area: string;
    readonly orders: number;
    readonly revenue: number;
  }>;
}

// Stryker disable next-line all
const STUB: DemaeCanSnapshot = {
  orders: [],
  monthSummary: { orders: 0, revenue: 0, avgOrderValue: 0, cancellationRate: 0 },
  topAreas: [],
};

export async function fetchDemaeCanSnapshotImpl(_ctx: FetchContext): Promise<DemaeCanSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchDemaeCanSnapshot(ctx: FetchContext): Promise<DemaeCanSnapshot> {
  return fetchDemaeCanSnapshotImpl(ctx);
}

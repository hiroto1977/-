import type { FetchContext } from './types';

/**
 * 経営サマリー — 売上集計 / KPI 実績 / チーム / プランを束ねた経営概況。
 * 集約はすべて renderer 側 (record store + 純粋関数 `data/overview.ts`) で
 * 行うため、本 fetcher はネットワーク I/O を持たない no-op stub
 * (`LIVE_FETCHERS` invariant を満たすためだけに存在)。
 */

export interface OverviewSnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: OverviewSnapshot = { items: [] };

export async function fetchOverviewSnapshotImpl(_ctx: FetchContext): Promise<OverviewSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchOverviewSnapshot(ctx: FetchContext): Promise<OverviewSnapshot> {
  return fetchOverviewSnapshotImpl(ctx);
}

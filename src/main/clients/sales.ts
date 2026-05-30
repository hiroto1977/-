import { createSnapshotStub } from './snapshotStub';

/**
 * 売上集計 — 複数 EC チャネル (Amazon / Shopify / BASE / 楽天 …) の売上を
 * 横断集計するローカル機能。データは renderer 側の record store
 * (`data/store.ts` collection `sales-entries`) に保存され、ネットワーク I/O は
 * 行わない。本 fetcher は `LIVE_FETCHERS` invariant を満たすための no-op stub。
 */

export interface SalesSnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: SalesSnapshot = { items: [] };

export const fetchSalesSnapshot = createSnapshotStub<SalesSnapshot>(STUB);

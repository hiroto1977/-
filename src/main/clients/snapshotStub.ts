import type { FetchContext } from './types';

/**
 * snapshot-only クライアントの共通ファクトリ。
 *
 * 公式 API 配線が未実装 (Phase 6+) のサービスは、`LIVE_FETCHERS` invariant
 * (clients/index.ts) を満たすためだけの static stub を返す。従来は各 client が
 *
 *   export async function fetchXSnapshotImpl(_ctx) { return STUB; }
 *   export async function fetchXSnapshot(ctx) { return fetchXSnapshotImpl(ctx); }
 *
 * という Impl + wrapper の二段 boilerplate を繰り返していた。このファクトリで
 *
 *   export const fetchXSnapshot = createSnapshotStub(STUB);
 *
 * の 1 行に集約する。返す fetcher はネットワーク I/O を持たず、常に同じ stub を
 * 返す。実データは renderer 側で `SNAPSHOT[id]` を直接描画する。
 *
 * (士業 7 種は同種だが ShigyoSnapshot 専用の `createShigyoFetcher` を使う。)
 */
export function createSnapshotStub<T>(stub: T): (ctx: FetchContext) => Promise<T> {
  // Stryker disable next-line BlockStatement
  return async function fetchSnapshotStub(_ctx: FetchContext): Promise<T> {
    return stub;
  };
}

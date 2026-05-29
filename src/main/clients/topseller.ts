import type { FetchContext } from './types';

/**
 * TopSeller (topseller.jp) — ドロップシッピング卸 (snapshot 専用)。
 *
 * 商品データ連携は CSV/契約ベースで公開 REST API がないため、本ファイルは
 * `LIVE_FETCHERS` invariant を満たす static stub。実際のページは
 * `SNAPSHOT.topseller` を直接描画する。将来連携を配線する際は、この fetcher
 * 内で同じ shape を返却する。
 */

export interface TopsellerSnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: TopsellerSnapshot = { items: [] };

export async function fetchTopsellerSnapshotImpl(_ctx: FetchContext): Promise<TopsellerSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchTopsellerSnapshot(ctx: FetchContext): Promise<TopsellerSnapshot> {
  return fetchTopsellerSnapshotImpl(ctx);
}

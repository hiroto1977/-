import type { FetchContext } from './types';

/**
 * スーパーデリバリー (superdelivery.com) — B2B 卸売仕入れサイト (snapshot 専用)。
 *
 * 公開 REST API がないため、本ファイルは `LIVE_FETCHERS` invariant を満たす
 * static stub。実際のページは `SNAPSHOT['super-delivery']` を直接描画する。
 * 将来 API/CSV 連携を配線する際は、この fetcher 内で同じ shape を返却する。
 */

export interface SuperDeliverySnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: SuperDeliverySnapshot = {
  items: [
    { id: 'sd-2001', name: 'アロマディフューザー 木目調' },
    { id: 'sd-2002', name: 'コットントートバッグ 無地' },
    { id: 'sd-2003', name: '陶器マグ 6個セット' },
  ],
};

export async function fetchSuperDeliverySnapshotImpl(_ctx: FetchContext): Promise<SuperDeliverySnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchSuperDeliverySnapshot(ctx: FetchContext): Promise<SuperDeliverySnapshot> {
  return fetchSuperDeliverySnapshotImpl(ctx);
}

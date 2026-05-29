import type { FetchContext } from './types';

/**
 * Amazon アソシエイト — アフィリエイト成果レポート (snapshot 専用)。
 *
 * 成果レポートは管理画面 / PA-API (Product Advertising API、要承認) ベースで
 * 一般公開 REST トークンでは扱えない。本ファイルは `LIVE_FETCHERS` invariant
 * を満たす static stub。実際のページは `SNAPSHOT['amazon-associates']` を直接
 * 描画する。将来 PA-API / レポート連携を配線する際は、この fetcher 内で同じ
 * shape を返却する。
 */

export interface AmazonAssociatesSnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: AmazonAssociatesSnapshot = {
  items: [
    { id: 'aa-8001', name: '[確定] Kindle 書籍 紹介料 — ¥420' },
    { id: 'aa-8002', name: '[確定] 家電 紹介料 — ¥1,860' },
    { id: 'aa-8003', name: '[保留] 日用品 紹介料 — ¥230' },
  ],
};

export async function fetchAmazonAssociatesSnapshotImpl(_ctx: FetchContext): Promise<AmazonAssociatesSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchAmazonAssociatesSnapshot(ctx: FetchContext): Promise<AmazonAssociatesSnapshot> {
  return fetchAmazonAssociatesSnapshotImpl(ctx);
}

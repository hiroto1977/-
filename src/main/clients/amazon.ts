import { createSnapshotStub } from './snapshotStub';

/**
 * Amazon セラー (SP-API) — 出品者向け 注文/在庫/売上 (snapshot 専用)。
 *
 * Amazon Selling Partner API は LWA (Login with Amazon) + IAM ロール + 出品者
 * 登録が必須で、一般のトークン貼り付けでは利用できない。本ファイルは
 * `LIVE_FETCHERS` invariant を満たす static stub。実際のページは
 * `SNAPSHOT.amazon` を直接描画する。将来 SP-API を配線する際は、この fetcher
 * 内で同じ shape を返却する。
 */

export interface AmazonSnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: AmazonSnapshot = {
  items: [
    { id: 'az-7001', name: 'オリジナルTシャツ (FBA) — 在庫 42' },
    { id: 'az-7002', name: 'ステンレスタンブラー — 在庫 18' },
    { id: 'az-7003', name: 'スマホケース 手帳型 — 在庫 7' },
  ],
};

export const fetchAmazonSnapshot = createSnapshotStub<AmazonSnapshot>(STUB);

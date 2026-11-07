import { createSnapshotStub } from './snapshotStub';

/**
 * A8.net (a8.net) — アフィリエイト ASP (snapshot 専用)。
 *
 * A8.net の成果/レポートは管理画面・CSV ベースで一般公開 REST API がない
 * ため、本ファイルは `LIVE_FETCHERS` invariant を満たす static stub。実際の
 * ページは `SNAPSHOT.a8net` を直接描画する。将来レポート連携を配線する際は、
 * この fetcher 内で同じ shape を返却する。
 */

export interface A8netSnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: A8netSnapshot = {
  items: [
    { id: 'a8-4001', name: '[確定] 動画配信サービス 登録 — ¥1,200' },
    { id: 'a8-4002', name: '[確定] クレジットカード発行 — ¥3,000' },
    { id: 'a8-4003', name: '[保留] 格安SIM 申込 — ¥1,500' },
  ],
};

export const fetchA8netSnapshot = createSnapshotStub<A8netSnapshot>(STUB);

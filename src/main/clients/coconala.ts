import { createSnapshotStub } from './snapshotStub';

/**
 * ココナラ (coconala.com) — スキルマーケット (snapshot 専用)。
 *
 * 公開 REST API が無いため、本ファイルは `LIVE_FETCHERS` invariant を満たす
 * static stub。実際のページは `SNAPSHOT.coconala` を直接描画する。将来出品者
 * 向け連携が提供されたら、この fetcher 内で同じ shape を返却する。
 */

export interface CoconalaSnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: CoconalaSnapshot = {
  items: [
    { id: 'co-9001', name: '[出品] ロゴ作成（修正無制限）— ¥8,000' },
    { id: 'co-9002', name: '[出品] LP 制作（1ページ）— ¥35,000' },
    { id: 'co-9003', name: '[受注] SNS アイコン作成 — ¥3,000（★4.9）' },
  ],
};

export const fetchCoconalaSnapshot = createSnapshotStub<CoconalaSnapshot>(STUB);

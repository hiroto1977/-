import { createSnapshotStub } from './snapshotStub';

/**
 * TikTok — SNS / 動画運用 連携 (snapshot 専用)。
 *
 * 公式 API (TikTok for Developers / Business API) はパートナー審査 + OAuth が
 * 前提のため、本ファイルは `LIVE_FETCHERS` invariant を満たす static stub。
 * 実際のページは `SNAPSHOT.tiktok` を直接描画する。Phase 6 で Content Posting
 * API / Business API へ接続予定。
 */

export interface TiktokSnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: TiktokSnapshot = {
  items: [
    { id: 'tt-1', name: '[投稿] 新商品紹介リール — 12.4万 再生 / いいね 8,200' },
    { id: 'tt-2', name: '[投稿] 使い方ハウツー — 3.1万 再生 / 保存 1,450' },
    { id: 'tt-3', name: '[広告] 認知キャンペーン — CPM ¥420 / CTR 1.8%' },
    { id: 'tt-4', name: 'フォロワー 2.7万人（前月比 +6.3%）' },
  ],
};

export const fetchTiktokSnapshot = createSnapshotStub<TiktokSnapshot>(STUB);

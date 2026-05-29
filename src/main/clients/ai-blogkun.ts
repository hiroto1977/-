import type { FetchContext } from './types';

/**
 * AIブログくん (ai-blogkun.com) — AI 自動ブログ生成 SaaS (snapshot 専用)。
 *
 * 公開 REST API がないため、本ファイルは `LIVE_FETCHERS` invariant を満たす
 * static stub。実際のページは `SNAPSHOT['ai-blogkun']` を直接描画する。将来
 * 連携を配線する際は、この fetcher 内で同じ shape を返却する。
 */

export interface AiBlogkunSnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: AiBlogkunSnapshot = {
  items: [
    { id: 'ab-5001', name: '[公開] 2026年 EC トレンド 10選' },
    { id: 'ab-5002', name: '[公開] 初心者向け SEO 内部対策ガイド' },
    { id: 'ab-5003', name: '[下書き] ふるさと納税 おすすめ返礼品' },
  ],
};

export async function fetchAiBlogkunSnapshotImpl(_ctx: FetchContext): Promise<AiBlogkunSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchAiBlogkunSnapshot(ctx: FetchContext): Promise<AiBlogkunSnapshot> {
  return fetchAiBlogkunSnapshotImpl(ctx);
}

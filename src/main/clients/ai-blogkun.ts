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
const STUB: AiBlogkunSnapshot = { items: [] };

export async function fetchAiBlogkunSnapshotImpl(_ctx: FetchContext): Promise<AiBlogkunSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchAiBlogkunSnapshot(ctx: FetchContext): Promise<AiBlogkunSnapshot> {
  return fetchAiBlogkunSnapshotImpl(ctx);
}

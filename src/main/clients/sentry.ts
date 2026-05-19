import type { FetchContext } from './types';

/**
 * Sentry — 連携先 (snapshot 専用)。
 *
 * 公式 API 配線は Phase 6+ 予定。本ファイルは LIVE_FETCHERS invariant
 * (clients/index.ts) を満たすための static stub。実際の業務 KPI は
 * SNAPSHOT.sentry を直接描画する。
 */

export interface SentrySnapshot {
  readonly items: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly count: number;
}

// Stryker disable next-line all
const STUB: SentrySnapshot = { items: [], count: 0 };

export async function fetchSentrySnapshotImpl(_ctx: FetchContext): Promise<SentrySnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchSentrySnapshot(ctx: FetchContext): Promise<SentrySnapshot> {
  return fetchSentrySnapshotImpl(ctx);
}

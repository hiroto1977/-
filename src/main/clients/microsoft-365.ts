import type { FetchContext } from './types';

/**
 * Microsoft 365 — 連携先 (snapshot 専用)。
 *
 * 公式 API 配線は Phase 6+ 予定。本ファイルは LIVE_FETCHERS invariant
 * (clients/index.ts) を満たすための static stub。実際の業務 KPI は
 * SNAPSHOT.microsoft365 を直接描画する。
 */

export interface Microsoft365Snapshot {
  readonly items: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly count: number;
}

// Stryker disable next-line all
const STUB: Microsoft365Snapshot = { items: [], count: 0 };

export async function fetchMicrosoft365SnapshotImpl(_ctx: FetchContext): Promise<Microsoft365Snapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchMicrosoft365Snapshot(ctx: FetchContext): Promise<Microsoft365Snapshot> {
  return fetchMicrosoft365SnapshotImpl(ctx);
}

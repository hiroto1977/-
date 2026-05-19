import type { FetchContext } from './types';

/**
 * Linear — 連携先 (snapshot 専用)。
 *
 * 公式 API 配線は Phase 6+ 予定。本ファイルは LIVE_FETCHERS invariant
 * (clients/index.ts) を満たすための static stub。実際の業務 KPI は
 * SNAPSHOT.linear を直接描画する。
 */

export interface LinearSnapshot {
  readonly items: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly count: number;
}

// Stryker disable next-line all
const STUB: LinearSnapshot = { items: [], count: 0 };

export async function fetchLinearSnapshotImpl(_ctx: FetchContext): Promise<LinearSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchLinearSnapshot(ctx: FetchContext): Promise<LinearSnapshot> {
  return fetchLinearSnapshotImpl(ctx);
}

import type { FetchContext } from './types';

/**
 * チーム管理 — 組織メンバー (オーナー/管理者/メンバー) のローカル管理機能。
 * データは renderer 側の record store (`data/store.ts` collection
 * `team-members`) に保存され、ネットワーク I/O は行わない。ロール権限と
 * シート上限の判定は `src/shared/team.ts` (pure) が担う。本 fetcher は
 * `LIVE_FETCHERS` invariant を満たすための no-op stub。
 */

export interface TeamSnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: TeamSnapshot = { items: [] };

export async function fetchTeamSnapshotImpl(_ctx: FetchContext): Promise<TeamSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchTeamSnapshot(ctx: FetchContext): Promise<TeamSnapshot> {
  return fetchTeamSnapshotImpl(ctx);
}

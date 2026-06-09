import { createSnapshotStub } from './snapshotStub';

/**
 * Dropbox — 連携先 (snapshot 専用)。
 *
 * 公式 API 配線は Phase 6+ 予定。本ファイルは LIVE_FETCHERS invariant
 * (clients/index.ts) を満たすための static stub。実際の業務 KPI は
 * SNAPSHOT.dropbox を直接描画する。
 */

export interface DropboxSnapshot {
  readonly items: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly count: number;
}

// Stryker disable next-line all
const STUB: DropboxSnapshot = { items: [], count: 0 };

export const fetchDropboxSnapshot = createSnapshotStub<DropboxSnapshot>(STUB);

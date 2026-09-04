import { createSnapshotStub } from './snapshotStub';

/**
 * Stripe — 連携先 (snapshot 専用)。
 *
 * 公式 API 配線は Phase 6+ 予定。本ファイルは LIVE_FETCHERS invariant
 * (clients/index.ts) を満たすための static stub。実際の業務 KPI は
 * SNAPSHOT.stripe を直接描画する。
 */

export interface StripeSnapshot {
  readonly items: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly count: number;
}

// Stryker disable next-line all
const STUB: StripeSnapshot = { items: [], count: 0 };

export const fetchStripeSnapshot = createSnapshotStub<StripeSnapshot>(STUB);

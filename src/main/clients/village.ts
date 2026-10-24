import type { FetchContext } from './types';

/**
 * Village（AIの村）— どうぶつの森風にオーケストレーション組織を可視化する
 * 全画面シーン。状態は renderer 側で `orchestration/registry.json` から導出
 * するため、この fetcher はネットワーク I/O を持たず、固定のメタ情報のみを返す
 * ローカルサービス（LOCAL_SERVICES）。actions は無し。
 */

export interface VillageSnapshot {
  readonly greeting: string;
  readonly fetchedAt: string;
  readonly isMock: boolean;
}

// Stryker disable next-line StringLiteral
const FETCHED_AT = '2035-05-15T00:00:00.000Z';

export async function fetchVillageSnapshotImpl(_ctx: FetchContext): Promise<VillageSnapshot> {
  return {
    greeting: 'ようこそ、AIの村へ。画面に話しかけてみてください。',
    fetchedAt: FETCHED_AT,
    isMock: true,
  };
}

// Stryker disable next-line BlockStatement
export async function fetchVillageSnapshot(ctx: FetchContext): Promise<VillageSnapshot> {
  return fetchVillageSnapshotImpl(ctx);
}

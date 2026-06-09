import { makeConnectorStubFetcher, type ConnectorStubSnapshot } from './connectorStub';

/**
 * Microsoft 365 — 連携先 (snapshot 専用)。公式 API 配線は Phase 6+ 予定。
 * 共通形状・実装は ./connectorStub に集約 (型名以外同一だった 10 連携先)。
 */
export type Microsoft365Snapshot = ConnectorStubSnapshot;

export const { impl: fetchMicrosoft365SnapshotImpl, fetcher: fetchMicrosoft365Snapshot } =
  makeConnectorStubFetcher();

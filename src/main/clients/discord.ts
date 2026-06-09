import { makeConnectorStubFetcher, type ConnectorStubSnapshot } from './connectorStub';

/**
 * Discord — 連携先 (snapshot 専用)。公式 API 配線は Phase 6+ 予定。
 * 共通形状・実装は ./connectorStub に集約 (型名以外同一だった 10 連携先)。
 */
export type DiscordSnapshot = ConnectorStubSnapshot;

export const { impl: fetchDiscordSnapshotImpl, fetcher: fetchDiscordSnapshot } =
  makeConnectorStubFetcher();

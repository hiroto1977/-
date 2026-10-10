import { createSnapshotStub } from './snapshotStub';

/**
 * コネクター / 自動化 — 無料 (認証不要) のローカル連携カタログを一覧表示するための
 * サービス。コネクター宣言とプラグイン束は純ロジック層
 * (`src/shared/connectors/*`) に存在し、renderer 側で直接描画 + ドライラン (送信
 * ペイロードの試算) を行う。よって本 fetcher はネットワーク I/O を持たない no-op
 * stub (`LIVE_FETCHERS` invariant を満たすためだけに存在)。
 */

export interface ConnectorsSnapshot {
  items: { id: string; name: string }[];
}

// Stryker disable next-line all
const STUB: ConnectorsSnapshot = { items: [] };

export const fetchConnectorsSnapshot = createSnapshotStub<ConnectorsSnapshot>(STUB);

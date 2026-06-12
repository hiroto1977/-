/**
 * Shopify コネクタ・メタデータの単一の真実源 (shared)。
 *
 * `src/main/clients/shopify.ts` の CONNECTORS (run 関数つき実体) と renderer の
 * 双方から参照できるよう、メタデータ ({id, action, label, requiredFields}) のみを
 * shared 層に切り出したもの。main 側の `listConnectors()` がこの配列と完全一致する
 * ことは契約テスト (shopify.test.ts「listConnectors() ↔ SHOPIFY_CONNECTOR_META」)
 * で drift 防止される。renderer はこれを {@link planOrderFanout} に渡して
 * 受注ファンアウト計画を組み立てる (IPC 追加なしで純粋計算できる)。
 */

import type { ConnectorMeta } from './orderFanout';

// Stryker disable all : 静的レジストリ定義 (id/action/label/requiredFields)。
// モジュールロード時に一度評価されるため Stryker は static 分類になる。値は
// main 側との契約テストと orderFanout のフィクスチャで実値照合される。
export const SHOPIFY_CONNECTOR_META: readonly ConnectorMeta[] = [
  { id: 'slack', action: 'sync-to-slack', label: 'Slack', requiredFields: ['token', 'channel'] },
  { id: 'discord', action: 'sync-to-discord', label: 'Discord', requiredFields: ['webhookUrl'] },
  { id: 'line', action: 'sync-to-line', label: 'LINE', requiredFields: ['token', 'to'] },
  { id: 'gmail', action: 'sync-to-gmail', label: 'Gmail', requiredFields: ['token'] },
  { id: 'notion', action: 'sync-to-notion', label: 'Notion', requiredFields: ['token', 'databaseId'] },
  { id: 'salesforce', action: 'sync-to-salesforce', label: 'Salesforce', requiredFields: ['token', 'instanceUrl'] },
  { id: 'stripe', action: 'sync-to-stripe', label: 'Stripe', requiredFields: ['token'] },
];
// Stryker restore all

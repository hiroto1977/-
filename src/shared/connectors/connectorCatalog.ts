/**
 * 具体コネクタ・カタログ + 純粋な実行計画器 (round 89)。
 *
 * `connectorRegistry.ts` の純粋ロジック基盤 (検証 / 解決 / フィールドマッピング)
 * を **土台に積み増す** 形で、Service Hub の実在サービス間の具体的なコネクタを
 * 宣言的に列挙し、その実行 **計画** を純粋に組み立てる層。
 *
 * ## このモジュールの責務 (IO は持たない)
 *
 * ここで定義するのは「source サービスのレコードを target サービスへどう写すか」
 * という **宣言** と、その宣言から target ペイロードを組み立てる **純粋計画器**
 * のみ。実際の送信 (ネットワーク呼び出し・トークン解決・リトライ等) は本モジュール
 * の責務ではなく、後続の薄いアダプタ層 (main/clients 配下) が担う。本モジュールは
 * ネットワーク・ファイル・`Date.now`・乱数を一切使わず、同じ入力に対して常に同じ
 * 出力を返す (決定論的)。
 *
 * ## 構成
 *
 *  - {@link CONNECTOR_CATALOG} — 実在サービス間の宣言的コネクタ群 (静的テーブル)
 *  - {@link CATALOG_REGISTRY}  — モジュール読込時に {@link buildConnectorRegistry}
 *      で構築 (重複 / 不正があれば起動時に loud-fail し、カタログ整合を load 時保証)
 *  - {@link planConnectorRun}  — connectorId を解決し target ペイロードを純粋に組む
 *  - {@link listConnectorsFor} / {@link listConnectorsByCapability} —
 *      {@link resolveConnectors} に委譲する薄い純粋ヘルパ (入力順保持)
 *  - {@link catalogConnectorIds} — カタログ内の全 connector id を入力順で返す
 */

import {
  applyFieldMap,
  buildConnectorRegistry,
  resolveConnectors,
  type Connector,
  type ConnectorCapability,
  type ConnectorRegistry,
  type FieldMapRule,
} from './connectorRegistry';
import type { ServiceId } from '../serviceId';

// --- 具体コネクタ・カタログ ----------------------------------------------
//
// 以下は **宣言データ** であり、それ自体に分岐や副作用はない。実際の振る舞い
// (フィールド変換・計画組み立て) は planConnectorRun と applyFieldMap に集約され、
// テストで全面検証される。よってこのテーブルは block-level で Stryker 変異から
// 除外する (文字列リテラル等の変異は等価で低シグナル)。
//
// Stryker disable all
/**
 * 既存サービス間の具体コネクタ宣言。各 `sourceService` / `targetService` は
 * 必ず実在 {@link ServiceId} (起動時に {@link CATALOG_REGISTRY} が検証する)。
 */
export const CONNECTOR_CATALOG: readonly Connector[] = [
  {
    id: 'github-to-slack-notify',
    sourceService: 'github',
    targetService: 'slack',
    capability: 'notify',
    fieldMap: [
      { from: 'title', to: 'text' },
      { from: 'url', to: 'link' },
      { from: 'author', to: 'username', fallback: 'github-bot' },
      { from: 'channel', to: 'channel', skipIfMissing: true },
    ],
    requiresAuth: true,
    description: 'GitHub の Issue / PR を Slack チャンネルへ通知する',
  },
  {
    id: 'stripe-to-drive-export',
    sourceService: 'stripe',
    targetService: 'drive',
    capability: 'export',
    fieldMap: [
      { from: 'invoiceId', to: 'name', transform: (v) => `invoice-${String(v)}.pdf` },
      { from: 'amount', to: 'sizeHint' },
      { from: 'folderId', to: 'parent', fallback: 'root' },
    ],
    requiresAuth: true,
    description: 'Stripe の請求書を Google Drive へ PDF エクスポートする',
  },
  {
    id: 'sentry-to-linear-record',
    sourceService: 'sentry',
    targetService: 'linear',
    capability: 'record',
    fieldMap: [
      { from: 'culprit', to: 'title', transform: (v) => `[Sentry] ${String(v)}` },
      { from: 'permalink', to: 'description' },
      { from: 'level', to: 'priority', fallback: 'error' },
      { from: 'assignee', to: 'assignee', skipIfMissing: true },
    ],
    requiresAuth: true,
    description: 'Sentry のエラーを Linear の Issue として起票する',
  },
  {
    id: 'shopify-to-notion-record',
    sourceService: 'shopify',
    targetService: 'notion',
    capability: 'record',
    fieldMap: [
      { from: 'orderNumber', to: 'Title' },
      { from: 'total', to: 'Amount' },
      { from: 'customer', to: 'Customer', fallback: 'ゲスト' },
    ],
    requiresAuth: true,
    description: 'Shopify の注文を Notion データベースへ記録する',
  },
  {
    id: 'salesforce-to-gmail-notify',
    sourceService: 'salesforce',
    targetService: 'gmail',
    capability: 'notify',
    fieldMap: [
      { from: 'opportunity', to: 'subject', transform: (v) => `商談更新: ${String(v)}` },
      { from: 'owner', to: 'to' },
      { from: 'stage', to: 'body', fallback: '(ステージ未設定)' },
    ],
    requiresAuth: true,
    description: 'Salesforce の商談更新を Gmail でメール通知する',
  },
  {
    id: 'asana-to-calendar-sync',
    sourceService: 'asana',
    targetService: 'calendar',
    capability: 'sync',
    fieldMap: [
      { from: 'name', to: 'summary' },
      { from: 'dueOn', to: 'start' },
      { from: 'dueOn', to: 'end' },
      { from: 'notes', to: 'description', skipIfMissing: true },
    ],
    requiresAuth: true,
    description: 'Asana のタスク期日を Google Calendar の予定へ同期する',
  },
  {
    id: 'linear-to-discord-notify',
    sourceService: 'linear',
    targetService: 'discord',
    capability: 'notify',
    fieldMap: [
      { from: 'identifier', to: 'content', transform: (v) => `Issue ${String(v)} が更新されました` },
      { from: 'state', to: 'embedTitle', fallback: 'In Progress' },
    ],
    requiresAuth: true,
    description: 'Linear の Issue 更新を Discord チャンネルへ通知する',
  },
  {
    id: 'kpi-to-storage-export',
    sourceService: 'kpi',
    targetService: 'storage',
    capability: 'export',
    fieldMap: [
      { from: 'metric', to: 'key' },
      { from: 'value', to: 'value' },
      { from: 'period', to: 'label', fallback: 'monthly' },
    ],
    requiresAuth: false,
    description: 'KPI のスナップショットをローカルストレージへエクスポートする (認証不要)',
  },
];
// Stryker restore all

// --- レジストリ (起動時不変条件) -----------------------------------------

/**
 * カタログから構築したレジストリ。モジュール読込時に
 * {@link buildConnectorRegistry} が走り、id 重複 / 不正な source・target・
 * capability があればここで throw する (起動時 loud-fail)。これによりカタログの
 * 整合性がモジュール load 時点で保証される。
 */
export const CATALOG_REGISTRY: ConnectorRegistry = buildConnectorRegistry(CONNECTOR_CATALOG);

// --- 実行計画器 (純粋) ---------------------------------------------------

/** {@link planConnectorRun} が返す実行計画 (送信はしない)。 */
export interface ConnectorRunPlan {
  /** 計画対象のコネクタ id。 */
  readonly connectorId: string;
  /** 連携元サービス。 */
  readonly sourceService: ServiceId;
  /** 連携先サービス。 */
  readonly targetService: ServiceId;
  /** コネクタの能力。 */
  readonly capability: ConnectorCapability;
  /** 連携実行に認証が必要か (アダプタ層がトークンを解決する際の指標)。 */
  readonly requiresAuth: boolean;
  /** fieldMap を適用して組み立てた target ペイロード。 */
  readonly payload: Record<string, unknown>;
}

/**
 * registry から `connectorId` を解決し、`sourceRecord` に
 * {@link applyFieldMap} を適用して target ペイロードを組み立てた
 * {@link ConnectorRunPlan} を返す **純粋関数**。
 *
 * 実際の送信 (ネットワーク呼び出し・トークン解決) は行わない — それは後続の
 * 薄いアダプタ層の責務であり、本関数はあくまで「何を・どこへ・どんな形で送るか」
 * の計画のみを決定論的に組み立てる。
 *
 * @throws `connectorId` が registry に存在しないとき
 *   `Error('unknown connector: <id>')`。
 */
export function planConnectorRun(
  registry: ConnectorRegistry,
  connectorId: string,
  sourceRecord: Readonly<Record<string, unknown>>,
): ConnectorRunPlan {
  const connector = registry.byId.get(connectorId);
  if (connector === undefined) {
    throw new Error(`unknown connector: ${connectorId}`);
  }
  return {
    connectorId: connector.id,
    sourceService: connector.sourceService,
    targetService: connector.targetService,
    capability: connector.capability,
    requiresAuth: connector.requiresAuth,
    payload: applyFieldMap(sourceRecord, connector.fieldMap),
  };
}

// --- 解決ヘルパ (純粋) ---------------------------------------------------

/**
 * 指定 `sourceService` を起点とするコネクタを入力順で返す
 * ({@link resolveConnectors} への薄い委譲)。
 */
export function listConnectorsFor(
  registry: ConnectorRegistry,
  sourceService: ServiceId,
): Connector[] {
  return resolveConnectors(registry, { sourceService });
}

/**
 * 指定 `capability` のコネクタを入力順で返す
 * ({@link resolveConnectors} への薄い委譲)。
 */
export function listConnectorsByCapability(
  registry: ConnectorRegistry,
  capability: ConnectorCapability,
): Connector[] {
  return resolveConnectors(registry, { capability });
}

/** レジストリ内の全 connector id を入力順 (`registry.all` 順) で返す。 */
export function catalogConnectorIds(registry: ConnectorRegistry): string[] {
  return registry.all.map((c) => c.id);
}

// 型の再エクスポート (アダプタ層が import しやすいよう)。
export type { FieldMapRule };

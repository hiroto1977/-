/**
 * 無料 (認証不要) コネクタ・カタログ — ローカルサービス間連携 (round 110+)。
 *
 * `connectorCatalog.ts` が外部 SaaS 間の連携 (すべて `requiresAuth: true`) を
 * 宣言するのに対し、本モジュールは **ローカルサービス間** (snapshot / record store /
 * ローカルストレージ等、保存済みトークンを必要としない) のコネクタだけを宣言する。
 * すべて `requiresAuth: false` の「無料で即使える」コネクタであり、`capability` は
 * ローカル書き出し (`export` → ストレージ) / ローカル記録 (`record` → ライブラリ)
 * に限定する (外部通知 `notify` は外部プロキシを伴うため含めない)。
 *
 * ## このモジュールの責務 (IO は持たない)
 *
 * `connectorCatalog.ts` と同じく、ここで定義するのは「source → target をどう写すか」
 * の **宣言** のみ。実際の送信・トークン解決・ネットワークは後続のアダプタ層が担う。
 * 振る舞い (フィールド変換 / 計画組み立て) は `applyFieldMap` / `planConnectorRun`
 * (connectorCatalog / connectorRegistry 側) に集約済みで、本テーブルは純粋な宣言データ。
 *
 * ## 構成
 *
 *  - {@link FREE_EXPORT_CONNECTORS} — ローカルストレージ/ライブラリへの書き出し (export)
 *  - {@link FREE_RECORD_CONNECTORS} — ライブラリへのローカル記録 (record)
 *  - {@link FREE_CONNECTORS}        — 上記を結合した全無料コネクタ (入力順)
 *  - {@link FREE_CONNECTOR_REGISTRY} — モジュール読込時に検証して索引化 (loud-fail)
 */

import { buildConnectorRegistry, type Connector, type ConnectorRegistry } from './connectorRegistry';

// 宣言データは connectorCatalog と同様 Stryker 変異から除外する (文字列/transform
// リテラルの変異は等価で低シグナル。振る舞いは planConnectorRun のテストで全面検証)。
// Stryker disable all

// --- export 系 (ローカルストレージ / ライブラリへ書き出す・認証不要) ----------

/** 株式ウォッチリストをローカルストレージへ書き出す。 */
export const STOCKS_TO_STORAGE_EXPORT: Connector = {
  id: 'stocks-to-storage-export',
  sourceService: 'stocks',
  targetService: 'storage',
  capability: 'export',
  fieldMap: [
    { from: 'symbol', to: 'key' },
    { from: 'price', to: 'value' },
    { from: 'name', to: 'label', fallback: '—' },
  ],
  requiresAuth: false,
  description: '株式ウォッチリストをローカルストレージへ書き出す (認証不要)',
};

/** 感情ログをライブラリへ JSON として書き出す。 */
export const EMOTIONS_TO_LIBRARY_EXPORT: Connector = {
  id: 'emotions-to-library-export',
  sourceService: 'emotions',
  targetService: 'library',
  capability: 'export',
  fieldMap: [
    { from: 'date', to: 'name', transform: (v) => `emotion-${String(v)}.json` },
    { from: 'score', to: 'sizeHint' },
    { from: 'note', to: 'meta', skipIfMissing: true },
  ],
  requiresAuth: false,
  description: '感情ログをライブラリへ JSON ファイルとして書き出す (認証不要)',
};

/** セキュリティ監査結果をローカルストレージへ書き出す。 */
export const SECURITY_TO_STORAGE_EXPORT: Connector = {
  id: 'security-to-storage-export',
  sourceService: 'security',
  targetService: 'storage',
  capability: 'export',
  fieldMap: [
    { from: 'check', to: 'key' },
    { from: 'status', to: 'value' },
    { from: 'severity', to: 'label', fallback: 'info' },
  ],
  requiresAuth: false,
  description: 'セキュリティ監査結果をローカルストレージへ書き出す (認証不要)',
};

/** 売上集計をローカルストレージへ書き出す。 */
export const SALES_TO_STORAGE_EXPORT: Connector = {
  id: 'sales-to-storage-export',
  sourceService: 'sales',
  targetService: 'storage',
  capability: 'export',
  fieldMap: [
    { from: 'month', to: 'key' },
    { from: 'revenue', to: 'value' },
    { from: 'channel', to: 'label', fallback: 'all' },
  ],
  requiresAuth: false,
  description: '売上集計をローカルストレージへ書き出す (認証不要)',
};

/** 経営ダッシュボードの KPI をライブラリへ書き出す。 */
export const BUSINESS_TO_LIBRARY_EXPORT: Connector = {
  id: 'business-to-library-export',
  sourceService: 'business',
  targetService: 'library',
  capability: 'export',
  fieldMap: [
    { from: 'kpiName', to: 'name' },
    { from: 'score', to: 'sizeHint' },
    { from: 'period', to: 'meta', fallback: 'monthly' },
  ],
  requiresAuth: false,
  description: '経営ダッシュボードの KPI をライブラリへ書き出す (認証不要)',
};

/** チームレーダー (負荷状況) をローカルストレージへ書き出す。 */
export const TEAMRADAR_TO_STORAGE_EXPORT: Connector = {
  id: 'teamradar-to-storage-export',
  sourceService: 'teamradar',
  targetService: 'storage',
  capability: 'export',
  fieldMap: [
    { from: 'member', to: 'key' },
    { from: 'load', to: 'value' },
    { from: 'status', to: 'label', fallback: 'ok' },
  ],
  requiresAuth: false,
  description: 'チームレーダーのメンバー負荷をローカルストレージへ書き出す (認証不要)',
};

/** 経営サマリーの指標をローカルストレージへ書き出す。 */
export const OVERVIEW_TO_STORAGE_EXPORT: Connector = {
  id: 'overview-to-storage-export',
  sourceService: 'overview',
  targetService: 'storage',
  capability: 'export',
  fieldMap: [
    { from: 'metric', to: 'key' },
    { from: 'value', to: 'value' },
    { from: 'unit', to: 'label', skipIfMissing: true },
  ],
  requiresAuth: false,
  description: '経営サマリーの指標をローカルストレージへ書き出す (認証不要)',
};

// --- record 系 (ライブラリへローカル記録・認証不要) --------------------------

/** KPI スナップショットをライブラリのレコードとして記録する。 */
export const KPI_TO_LIBRARY_RECORD: Connector = {
  id: 'kpi-to-library-record',
  sourceService: 'kpi',
  targetService: 'library',
  capability: 'record',
  fieldMap: [
    { from: 'metric', to: 'Title' },
    { from: 'value', to: 'Amount' },
    { from: 'period', to: 'Label', fallback: 'monthly' },
  ],
  requiresAuth: false,
  description: 'KPI スナップショットをライブラリのレコードとして記録する (認証不要)',
};

/** 品質レポートをライブラリのレコードとして記録する。 */
export const QUALITY_TO_LIBRARY_RECORD: Connector = {
  id: 'quality-to-library-record',
  sourceService: 'quality',
  targetService: 'library',
  capability: 'record',
  fieldMap: [
    { from: 'suite', to: 'Title' },
    { from: 'passRate', to: 'Amount' },
    { from: 'note', to: 'Description', skipIfMissing: true },
  ],
  requiresAuth: false,
  description: '品質レポート (テスト合格率) をライブラリのレコードとして記録する (認証不要)',
};

/** 税務試算の結果をライブラリのレコードとして記録する。 */
export const TAX_TO_LIBRARY_RECORD: Connector = {
  id: 'tax-to-library-record',
  sourceService: 'tax',
  targetService: 'library',
  capability: 'record',
  fieldMap: [
    { from: 'taxType', to: 'Title', transform: (v) => `税務試算: ${String(v)}` },
    { from: 'amount', to: 'Amount' },
    { from: 'year', to: 'Label', fallback: '当年' },
  ],
  requiresAuth: false,
  description: '税務試算の結果をライブラリのレコードとして記録する (認証不要)',
};

// Stryker restore all

/** ローカルストレージ/ライブラリへの書き出し (export) の無料コネクタ群 (入力順)。 */
export const FREE_EXPORT_CONNECTORS: readonly Connector[] = [
  STOCKS_TO_STORAGE_EXPORT,
  EMOTIONS_TO_LIBRARY_EXPORT,
  SECURITY_TO_STORAGE_EXPORT,
  SALES_TO_STORAGE_EXPORT,
  BUSINESS_TO_LIBRARY_EXPORT,
  TEAMRADAR_TO_STORAGE_EXPORT,
  OVERVIEW_TO_STORAGE_EXPORT,
];

/** ライブラリへのローカル記録 (record) の無料コネクタ群 (入力順)。 */
export const FREE_RECORD_CONNECTORS: readonly Connector[] = [
  KPI_TO_LIBRARY_RECORD,
  QUALITY_TO_LIBRARY_RECORD,
  TAX_TO_LIBRARY_RECORD,
];

/**
 * 全無料 (認証不要) コネクタ。export 系 → record 系の順に結合 (入力順を保持)。
 * すべて `requiresAuth: false` かつ source/target はローカルサービス。
 */
export const FREE_CONNECTORS: readonly Connector[] = [
  ...FREE_EXPORT_CONNECTORS,
  ...FREE_RECORD_CONNECTORS,
];

/**
 * 無料コネクタから構築したレジストリ。モジュール読込時に
 * {@link buildConnectorRegistry} が走り、id 重複 / 不正な source・target・
 * capability があればここで throw する (起動時 loud-fail)。
 */
export const FREE_CONNECTOR_REGISTRY: ConnectorRegistry = buildConnectorRegistry(FREE_CONNECTORS);

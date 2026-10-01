/**
 * 無料プラグイン・カタログ — 即使えるローカルプラグイン束 (round 110+)。
 *
 * `pluginRuntime.ts` の純粋ロジック基盤 (manifest 検証 / 権限判定 / hook ディスパッチ
 * 計画) を **土台に積み増す** 形で、`freeConnectors.ts` の無料 (認証不要) コネクタを
 * 束ねた具体プラグインを宣言的に列挙する層。`connectorCatalog.ts` が
 * {@link CATALOG_REGISTRY} を load 時に構築するのと同じ思想で、本モジュールも
 * {@link PLUGIN_RUNTIME} を load 時に構築し、manifest 不整合があれば loud-fail する。
 *
 * ## 設計
 *
 * 各プラグインは同梱コネクタの `capability` に対応する権限を **過不足なく** 宣言する
 * (export → `storage:library`、record → `write:action`)。したがって
 * {@link resolveHookPlan} が返す手順はすべて `permitted: true` となり、追加の権限付与
 * なしに即実行できる「無料で使えるプラグイン」になる。実際の hook 実行・コネクタ送信
 * (ローカル書き込み等) は後続のアダプタ層が担い、本モジュールは宣言と計画のみを持つ。
 *
 * ## 構成
 *
 *  - {@link PLUGIN_CATALOG}     — 無料プラグインの manifest 宣言 (静的テーブル)
 *  - {@link PLUGIN_RUNTIME}     — load 時に {@link buildPluginRuntime} で構築 (loud-fail)
 */

import {
  FREE_EXPORT_CONNECTORS,
  FREE_RECORD_CONNECTORS,
} from './freeConnectors';
import type { PluginManifest } from './connectorRegistry';
import { buildPluginRuntime, type PluginRuntime } from './pluginRuntime';

// manifest は宣言データ。version/id/権限/hook の文字列リテラル変異は等価で低シグナル
// のため Stryker から除外する。検証・ディスパッチの振る舞いは pluginRuntime のテストで
// 全面検証済みで、本テーブルは「load 時に loud-fail しない妥当な宣言」をテストで保証する。
// Stryker disable all

/**
 * スナップショット読込時 (`onSnapshotLoad`) に、ローカルサービスのデータを
 * ストレージ/ライブラリへ書き出す無料プラグイン。export コネクタのみを束ね、
 * 書き出しに必要な `storage:library` 権限を宣言する (全手順 permitted)。
 */
export const LOCAL_STORAGE_ARCHIVER: PluginManifest = {
  id: 'local-storage-archiver',
  version: '1.0.0',
  permissions: ['read:snapshot', 'storage:library'],
  hooks: ['onSnapshotLoad'],
  connectors: FREE_EXPORT_CONNECTORS,
};

/**
 * アクション実行時 (`onActionInvoke`) に、KPI・品質・税務試算の結果をライブラリへ
 * レコードとして記録する無料プラグイン。record コネクタのみを束ね、書き込みに必要な
 * `write:action` 権限を宣言する (全手順 permitted)。
 */
export const LOCAL_LIBRARY_RECORDER: PluginManifest = {
  id: 'local-library-recorder',
  version: '1.0.0',
  permissions: ['read:snapshot', 'write:action'],
  hooks: ['onActionInvoke'],
  connectors: FREE_RECORD_CONNECTORS,
};

/** 無料プラグインの宣言テーブル (入力順)。 */
export const PLUGIN_CATALOG: readonly PluginManifest[] = [
  LOCAL_STORAGE_ARCHIVER,
  LOCAL_LIBRARY_RECORDER,
];

// Stryker restore all

/**
 * カタログから構築したプラグインランタイム。モジュール読込時に
 * {@link buildPluginRuntime} が走り、manifest の検証エラー (不正 semver・未知権限/
 * hook・同梱コネクタの不整合) や id 重複があればここで throw する (起動時 loud-fail)。
 */
export const PLUGIN_RUNTIME: PluginRuntime = buildPluginRuntime(PLUGIN_CATALOG);

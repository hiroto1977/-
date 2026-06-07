/**
 * 連携スタック健全性・カバレッジ監査レポート (round 96)。
 *
 * `connectorRegistry.ts` / `connectorCatalog.ts` / `pluginRuntime.ts` の純粋ロジック
 * 基盤を **土台に積み増す** 形で、構築済みの {@link ConnectorRegistry} と
 * {@link PluginRuntime} を入力に取り、連携スタックの **可観測性 (健全性レポート)** を
 * 提供する純粋関数群。IO は一切持たない (ネットワーク・ファイル・`Date.now`・乱数なし) —
 * 同じ入力には常に同じ出力を返す (決定論的)。
 *
 * ## このモジュールの責務 (IO は持たない)
 *
 * ここで決めるのは「いま登録されているコネクタ群とプラグイン群が、どの capability を
 * カバーし、どのサービスが連携の起点 / 終点になり、どのサービスがどこにも繋がっておらず、
 * どのプラグインが同梱コネクタを動かす権限を欠いているか」という **監査 (audit)** の
 * み。計画・送信・トークン解決・修復は本モジュールの責務ではない — それらは
 * `connectorCatalog.ts` / `pluginRuntime.ts` / 後続の薄いアダプタ層が担う。本モジュールは
 * あくまでスタックの現状を決定論的に **観測・集計** するだけである。
 *
 * ## 構成
 *
 *  - {@link capabilityCoverage}      — capability ごとの connector id 配列 (全 capability キー)
 *  - {@link serviceConnectivity}     — 各 ServiceId の source / target 接続性
 *  - {@link findUnreachableServices} — source でも target でもないサービス
 *  - {@link pluginPermissionGaps}    — プラグインが同梱コネクタの必要権限を欠く箇所
 *  - {@link connectorHealthReport}   — 上記を集約した 1 枚の健全性レポート
 *
 * 空 registry / 空 runtime でも throw せず、妥当な空レポートを返す。
 */

import {
  CONNECTOR_CAPABILITIES,
  isPermitted,
  type ConnectorCapability,
  type ConnectorRegistry,
} from './connectorRegistry';
import { requiredPermissionFor, type PluginRuntime } from './pluginRuntime';
import type { ServiceId } from '../serviceId';

// --- capability カバレッジ -----------------------------------------------

/**
 * capability ('export' | 'sync' | 'notify' | 'record') ごとに、その能力を提供する
 * コネクタ id 配列 (registry の入力順 = `registry.all` 順) を持つレコード。
 * **全 capability キーを必ず含む** (該当コネクタが 0 件のキーは空配列)。
 */
export type CapabilityCoverage = Readonly<Record<ConnectorCapability, readonly string[]>>;

/**
 * 各 capability を提供するコネクタ id を入力順で集計した {@link CapabilityCoverage}
 * を返す純粋関数。{@link CONNECTOR_CAPABILITIES} の全キーを必ず含み、該当コネクタが
 * 無い capability は空配列になる (キー欠落させない)。
 */
export function capabilityCoverage(registry: ConnectorRegistry): CapabilityCoverage {
  const coverage: Record<ConnectorCapability, string[]> = {
    export: [],
    sync: [],
    notify: [],
    record: [],
  };
  for (const connector of registry.all) {
    coverage[connector.capability].push(connector.id);
  }
  return coverage;
}

// --- サービス接続性 ------------------------------------------------------

/**
 * 1 サービスの連携接続性。`asSource` は当該サービスを起点とするコネクタが
 * 1 件以上あるか、`asTarget` は終点とするコネクタが 1 件以上あるかを表す。
 */
export interface ServiceConnectivity {
  /** 対象サービス。 */
  readonly service: ServiceId;
  /** このサービスを `sourceService` とするコネクタが存在するか。 */
  readonly asSource: boolean;
  /** このサービスを `targetService` とするコネクタが存在するか。 */
  readonly asTarget: boolean;
}

/**
 * `serviceIds` の各サービスについて、registry 内に当該サービスを起点 / 終点とする
 * コネクタが存在するかを判定し、`serviceIds` の順で {@link ServiceConnectivity} を
 * 返す純粋関数。同一サービスが source かつ target になりうる (両方 true 可)。
 */
export function serviceConnectivity(
  registry: ConnectorRegistry,
  serviceIds: readonly ServiceId[],
): ServiceConnectivity[] {
  const sources = new Set<ServiceId>();
  const targets = new Set<ServiceId>();
  for (const connector of registry.all) {
    sources.add(connector.sourceService);
    targets.add(connector.targetService);
  }
  return serviceIds.map((service) => ({
    service,
    asSource: sources.has(service),
    asTarget: targets.has(service),
  }));
}

/**
 * `serviceIds` のうち、registry 内のどのコネクタの起点にも終点にもなっていない
 * (= source でも target でもない) サービスを **入力順** で返す純粋関数。
 * いずれの connector にも現れないサービス = 連携スタックから到達不能。
 */
export function findUnreachableServices(
  registry: ConnectorRegistry,
  serviceIds: readonly ServiceId[],
): ServiceId[] {
  return serviceConnectivity(registry, serviceIds)
    .filter((entry) => !entry.asSource && !entry.asTarget)
    .map((entry) => entry.service);
}

// --- プラグイン権限ギャップ ----------------------------------------------

/**
 * 1 件の権限ギャップ。プラグイン `pluginId` が同梱コネクタ `connectorId` を
 * 動かすのに必要な権限 `requiredPermission` を保持していない (実行不可) ことを表す。
 */
export interface PermissionGap {
  /** 権限を欠くプラグイン id。 */
  readonly pluginId: string;
  /** 動かせないコネクタ id。 */
  readonly connectorId: string;
  /** そのコネクタの capability に対し要求される権限。 */
  readonly requiredPermission: string;
}

/**
 * runtime 内の各プラグインについて、同梱コネクタのうち
 * {@link requiredPermissionFor}(capability) の権限をプラグインが
 * ({@link isPermitted} false で) 保持していないものを {@link PermissionGap} として
 * 集約し、**入力順** (プラグイン順 → そのプラグインのコネクタ順) で返す純粋関数。
 * すべてのコネクタに権限が揃っていれば空配列。
 */
export function pluginPermissionGaps(runtime: PluginRuntime): PermissionGap[] {
  const gaps: PermissionGap[] = [];
  for (const plugin of runtime.all) {
    for (const connector of plugin.connectors) {
      const requiredPermission = requiredPermissionFor(connector.capability);
      if (!isPermitted(plugin, requiredPermission)) {
        gaps.push({ pluginId: plugin.id, connectorId: connector.id, requiredPermission });
      }
    }
  }
  return gaps;
}

// --- 集約レポート --------------------------------------------------------

/**
 * 連携スタック全体の健全性レポート (1 枚に集約)。すべて決定論的に算出される。
 */
export interface ConnectorHealthReport {
  /** registry に登録されたコネクタ総数 (`registry.all.length`)。 */
  readonly totalConnectors: number;
  /** runtime に登録されたプラグイン総数 (`runtime.all.length`)。 */
  readonly totalPlugins: number;
  /** capability ごとの connector id 配列 ({@link capabilityCoverage})。 */
  readonly capabilityCoverage: CapabilityCoverage;
  /** source でも target でもないサービス ({@link findUnreachableServices})。 */
  readonly unreachableServices: readonly ServiceId[];
  /** プラグインの権限ギャップ ({@link pluginPermissionGaps})。 */
  readonly permissionGaps: readonly PermissionGap[];
}

/**
 * {@link capabilityCoverage} / {@link findUnreachableServices} /
 * {@link pluginPermissionGaps} と総数を 1 枚に集約した
 * {@link ConnectorHealthReport} を返す純粋関数。空 registry / 空 runtime /
 * 空 serviceIds でも throw せず妥当な空レポートを返す。
 */
export function connectorHealthReport(
  registry: ConnectorRegistry,
  runtime: PluginRuntime,
  serviceIds: readonly ServiceId[],
): ConnectorHealthReport {
  return {
    totalConnectors: registry.all.length,
    totalPlugins: runtime.all.length,
    capabilityCoverage: capabilityCoverage(registry),
    unreachableServices: findUnreachableServices(registry, serviceIds),
    permissionGaps: pluginPermissionGaps(runtime),
  };
}

// 型の再エクスポート (アダプタ層 / UI が import しやすいよう)。
export { CONNECTOR_CAPABILITIES };

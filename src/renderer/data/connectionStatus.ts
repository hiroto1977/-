/**
 * 接続状況ハブの集計 — 純ロジック (IO なし)。
 *
 * 全サービス (`SERVICES`) と、資格情報が設定済みの id 集合 (vault.listConfigured()
 * 由来) から、「接続済み / 未接続」をカテゴリ別に集計する。サービスが増えても
 * SERVICES を起点に導出するため自動で追随する。
 */

import type { ServiceId } from '../../shared/serviceId';

/** 集計に使うサービスの最小情報 (SERVICES から注入)。 */
export interface ConnService {
  readonly id: ServiceId;
  readonly label: string;
  readonly category: string;
}

/** カテゴリ別の接続状況。 */
export interface CategoryStatus {
  readonly category: string;
  readonly total: number;
  readonly connected: number;
}

/** 接続状況サマリ。 */
export interface ConnectionSummary {
  readonly total: number;
  readonly connectedCount: number;
  /** 接続済み (入力順)。 */
  readonly connected: readonly ConnService[];
  /** 未接続 (入力順)。 */
  readonly notConnected: readonly ConnService[];
  /** カテゴリ別 (初出順を保持)。 */
  readonly byCategory: readonly CategoryStatus[];
}

/**
 * 全サービスと設定済み id 集合から接続状況を集計する (純粋・決定論的)。
 * 入力順を保持し、カテゴリは初出順で並べる。
 */
export function summarizeConnections(
  services: readonly ConnService[],
  configured: ReadonlySet<string>,
): ConnectionSummary {
  const connected: ConnService[] = [];
  const notConnected: ConnService[] = [];
  const catOrder: string[] = [];
  const catTotals = new Map<string, number>();
  const catConnected = new Map<string, number>();

  for (const svc of services) {
    const isConnected = configured.has(svc.id);
    if (isConnected) connected.push(svc);
    else notConnected.push(svc);

    if (!catTotals.has(svc.category)) {
      catOrder.push(svc.category);
      catTotals.set(svc.category, 0);
      catConnected.set(svc.category, 0);
    }
    catTotals.set(svc.category, (catTotals.get(svc.category) ?? 0) + 1);
    if (isConnected) {
      catConnected.set(svc.category, (catConnected.get(svc.category) ?? 0) + 1);
    }
  }

  const byCategory: CategoryStatus[] = catOrder.map((category) => ({
    category,
    total: catTotals.get(category) ?? 0,
    connected: catConnected.get(category) ?? 0,
  }));

  return {
    total: services.length,
    connectedCount: connected.length,
    connected,
    notConnected,
    byCategory,
  };
}

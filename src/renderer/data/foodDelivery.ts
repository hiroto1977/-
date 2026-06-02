/**
 * フードデリバリー集計 — Uber Eats と 出前館 を事業ダッシュボードに統合表示するための
 * 純粋ロジック。
 *
 * 2 プラットフォームは集計期間が異なる (Uber Eats=週次 snapshot / 出前館=月次 snapshot)
 * ため、単純合算はミスリードになる。ここでは各プラットフォームの指標を保持しつつ、
 * 「今月換算」の概算合算 (週次×52/12) も別途提供し、UI 側で期間を明示できるようにする。
 * IO は持たない。
 *
 * **重要 — snapshot は模擬データ。合算は概算であり財務助言ではありません。**
 */

const WEEKS_PER_MONTH = 52 / 12; // ≒ 4.333

export interface UberEatsSnapshotLike {
  readonly weekOrders: number;
  readonly weekRevenue: number;
  readonly avgRating: number;
  readonly stores: readonly { readonly name: string; readonly orders: number; readonly revenue: number; readonly rating: number }[];
}

export interface DemaeCanSnapshotLike {
  readonly monthSummary: {
    readonly orders: number;
    readonly revenue: number;
    readonly avgOrderValue: number;
    readonly cancellationRate: number;
  };
  readonly topAreas: readonly { readonly area: string; readonly orders: number; readonly revenue: number }[];
}

export interface FoodDeliverySummary {
  readonly uberEats: {
    readonly weekOrders: number;
    readonly weekRevenue: number;
    readonly avgRating: number;
    readonly storeCount: number;
    /** 売上トップ店舗 (なければ null)。 */
    readonly topStore: { readonly name: string; readonly revenue: number } | null;
  };
  readonly demaeCan: {
    readonly monthOrders: number;
    readonly monthRevenue: number;
    readonly avgOrderValue: number;
    readonly cancellationRate: number;
    /** 売上トップエリア (なければ null)。 */
    readonly topArea: { readonly area: string; readonly revenue: number } | null;
  };
  /** 今月換算の概算合算 (Uber Eats 週次×52/12 + 出前館 月次)。 */
  readonly combinedMonthlyEstimate: {
    readonly orders: number;
    readonly revenue: number;
  };
}

function topByRevenue<T extends { revenue: number }>(rows: readonly T[]): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, r) => (r.revenue > best.revenue ? r : best));
}

/** 2 プラットフォームの snapshot を統合サマリにまとめる。純粋。 */
export function summarizeFoodDelivery(
  ue: UberEatsSnapshotLike,
  dc: DemaeCanSnapshotLike,
): FoodDeliverySummary {
  const topStore = topByRevenue(ue.stores);
  const topArea = topByRevenue(dc.topAreas);
  const monthlyUberOrders = Math.round(ue.weekOrders * WEEKS_PER_MONTH);
  const monthlyUberRevenue = Math.round(ue.weekRevenue * WEEKS_PER_MONTH);
  return {
    uberEats: {
      weekOrders: ue.weekOrders,
      weekRevenue: ue.weekRevenue,
      avgRating: ue.avgRating,
      storeCount: ue.stores.length,
      topStore: topStore ? { name: topStore.name, revenue: topStore.revenue } : null,
    },
    demaeCan: {
      monthOrders: dc.monthSummary.orders,
      monthRevenue: dc.monthSummary.revenue,
      avgOrderValue: dc.monthSummary.avgOrderValue,
      cancellationRate: dc.monthSummary.cancellationRate,
      topArea: topArea ? { area: topArea.area, revenue: topArea.revenue } : null,
    },
    combinedMonthlyEstimate: {
      orders: monthlyUberOrders + dc.monthSummary.orders,
      revenue: monthlyUberRevenue + dc.monthSummary.revenue,
    },
  };
}

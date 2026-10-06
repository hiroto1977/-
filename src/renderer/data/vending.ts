/**
 * 自動販売機事業・自販機を使った無人販売店舗事業の集計 — 事業ダッシュボードに
 * 統合表示するための純粋ロジック。IO は持たない。
 *
 * 自動販売機（台ごとの売上・稼働・在庫）と、自販機を核にした無人販売店舗
 * （複数台 + 省人化オペ）を一つのサマリに束ね、設置形態別の内訳や補充アラート、
 * 両事業の月次合算までを純粋関数で算出する。
 *
 * **重要 — snapshot は模擬データ。集計は概算であり財務助言ではありません。**
 */

const round = (n: number) => Math.round(n);

/** 在庫率がこの値未満の自販機は「補充要」とみなす（UI のアラート表示に使用）。 */
export const LOW_STOCK_THRESHOLD = 0.25;

/** 自販機の設置形態。 */
export type VendingPlacement = 'office' | 'street' | 'station' | 'factory' | 'store';

/** 設置形態の表示ラベル（UI 用）。 */
export const PLACEMENT_LABEL: Record<VendingPlacement, string> = {
  office: 'オフィス',
  street: '路面',
  station: '駅・交通',
  factory: '工場・倉庫',
  store: '無人店舗併設',
};

export interface VendingMachineLike {
  readonly id: string;
  readonly name: string;
  readonly placement: VendingPlacement;
  /** 月間売上（円）。 */
  readonly monthlyRevenue: number;
  /** 月間販売本数。 */
  readonly monthlySales: number;
  /** 総商品スロット数。 */
  readonly slots: number;
  /** 補充済みスロット数（在庫率 = stockedSlots / slots）。 */
  readonly stockedSlots: number;
  /** 稼働中か（故障・撤去中は false）。 */
  readonly operational: boolean;
}

export interface UnmannedStoreLike {
  readonly id: string;
  readonly name: string;
  /** 月間売上（円）。 */
  readonly monthlyRevenue: number;
  /** 月間来店客数。 */
  readonly monthlyCustomers: number;
  /** 月間販売点数。 */
  readonly itemsSold: number;
  /** 併設している自販機台数。 */
  readonly machines: number;
  /** ロス率（棚卸差異・不正・万引き等、0..1）。 */
  readonly shrinkageRate: number;
}

export interface VendingSnapshotLike {
  readonly machines: readonly VendingMachineLike[];
  readonly unmannedStores: readonly UnmannedStoreLike[];
}

export interface PlacementBreakdownRow {
  readonly placement: VendingPlacement;
  readonly label: string;
  readonly count: number;
  readonly revenue: number;
  readonly sales: number;
}

export interface VendingSummary {
  /** 自販機 総台数。 */
  readonly machineCount: number;
  /** 稼働中の台数。 */
  readonly activeMachines: number;
  /** 稼働率（稼働台数 / 総台数、0..1。台数 0 は 0）。 */
  readonly operatingRate: number;
  /** 自販機の月間売上合計。 */
  readonly machineMonthlyRevenue: number;
  /** 自販機の月間販売本数合計。 */
  readonly machineMonthlySales: number;
  /** 1 台あたり月間売上（総台数ベース、台数 0 は 0）。 */
  readonly avgRevenuePerMachine: number;
  /** 平均在庫率（Σ補充済スロット / Σ総スロット、スロット 0 は 0）。 */
  readonly avgStockRate: number;
  /** 補充要（在庫率 < LOW_STOCK_THRESHOLD）の台数。 */
  readonly lowStockCount: number;
  /** 売上トップの自販機（台数 0 は null）。 */
  readonly topMachine: { readonly id: string; readonly name: string; readonly monthlyRevenue: number } | null;
  /** 設置形態別の内訳（台数のある形態のみ、売上降順）。 */
  readonly placementBreakdown: readonly PlacementBreakdownRow[];
  /** 無人販売店舗 店舗数。 */
  readonly unmannedStoreCount: number;
  /** 無人販売店舗の月間売上合計。 */
  readonly unmannedMonthlyRevenue: number;
  /** 無人販売店舗の月間来店客数合計。 */
  readonly unmannedCustomers: number;
  /** 客単価（無人店舗売上 / 来店客数、客数 0 は 0）。 */
  readonly avgSpendPerCustomer: number;
  /** 平均ロス率（店舗平均、店舗 0 は 0）。 */
  readonly avgShrinkageRate: number;
  /** 売上トップの無人店舗（店舗 0 は null）。 */
  readonly topUnmannedStore: { readonly id: string; readonly name: string; readonly monthlyRevenue: number } | null;
  /** 両事業の月間売上合算（自販機 + 無人店舗）。 */
  readonly combinedMonthlyRevenue: number;
}

function stockRate(m: VendingMachineLike): number {
  if (m.slots <= 0) return 0;
  return m.stockedSlots / m.slots;
}

function topByRevenue<T extends { monthlyRevenue: number }>(rows: readonly T[]): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, r) => (r.monthlyRevenue > best.monthlyRevenue ? r : best));
}

/** 自販機・無人店舗の snapshot を統合サマリにまとめる。純粋。 */
export function summarizeVending(snap: VendingSnapshotLike): VendingSummary {
  const machines = snap.machines;
  const stores = snap.unmannedStores;

  const machineCount = machines.length;
  const activeMachines = machines.filter((m) => m.operational).length;
  const machineMonthlyRevenue = machines.reduce((s, m) => s + m.monthlyRevenue, 0);
  const machineMonthlySales = machines.reduce((s, m) => s + m.monthlySales, 0);
  const totalSlots = machines.reduce((s, m) => s + m.slots, 0);
  const stockedSlots = machines.reduce((s, m) => s + m.stockedSlots, 0);
  const lowStockCount = machines.filter((m) => stockRate(m) < LOW_STOCK_THRESHOLD).length;
  const topM = topByRevenue(machines);

  // 設置形態別の内訳を入力順で集約し、売上降順に並べ替える。
  const byPlacement = new Map<VendingPlacement, PlacementBreakdownRow>();
  for (const m of machines) {
    const row = byPlacement.get(m.placement);
    if (row) {
      byPlacement.set(m.placement, {
        ...row,
        count: row.count + 1,
        revenue: row.revenue + m.monthlyRevenue,
        sales: row.sales + m.monthlySales,
      });
    } else {
      byPlacement.set(m.placement, {
        placement: m.placement,
        label: PLACEMENT_LABEL[m.placement],
        count: 1,
        revenue: m.monthlyRevenue,
        sales: m.monthlySales,
      });
    }
  }
  const placementBreakdown = [...byPlacement.values()].sort((a, b) => b.revenue - a.revenue);

  const unmannedStoreCount = stores.length;
  const unmannedMonthlyRevenue = stores.reduce((s, st) => s + st.monthlyRevenue, 0);
  const unmannedCustomers = stores.reduce((s, st) => s + st.monthlyCustomers, 0);
  const shrinkageSum = stores.reduce((s, st) => s + st.shrinkageRate, 0);
  const topStore = topByRevenue(stores);

  return {
    machineCount,
    activeMachines,
    operatingRate: machineCount > 0 ? activeMachines / machineCount : 0,
    machineMonthlyRevenue,
    machineMonthlySales,
    avgRevenuePerMachine: machineCount > 0 ? round(machineMonthlyRevenue / machineCount) : 0,
    avgStockRate: totalSlots > 0 ? stockedSlots / totalSlots : 0,
    lowStockCount,
    topMachine: topM ? { id: topM.id, name: topM.name, monthlyRevenue: topM.monthlyRevenue } : null,
    placementBreakdown,
    unmannedStoreCount,
    unmannedMonthlyRevenue,
    unmannedCustomers,
    avgSpendPerCustomer: unmannedCustomers > 0 ? round(unmannedMonthlyRevenue / unmannedCustomers) : 0,
    avgShrinkageRate: unmannedStoreCount > 0 ? shrinkageSum / unmannedStoreCount : 0,
    topUnmannedStore: topStore ? { id: topStore.id, name: topStore.name, monthlyRevenue: topStore.monthlyRevenue } : null,
    combinedMonthlyRevenue: machineMonthlyRevenue + unmannedMonthlyRevenue,
  };
}

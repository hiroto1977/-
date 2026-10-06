import { describe, expect, it } from 'vitest';
import { summarizeVending, LOW_STOCK_THRESHOLD, PLACEMENT_LABEL, type VendingSnapshotLike } from '../vending';

const SNAP: VendingSnapshotLike = {
  machines: [
    { id: 'm1', name: 'A', placement: 'office', monthlyRevenue: 80_000, monthlySales: 1_200, slots: 40, stockedSlots: 38, operational: true },
    { id: 'm2', name: 'B', placement: 'office', monthlyRevenue: 60_000, monthlySales: 900, slots: 40, stockedSlots: 8, operational: true },
    { id: 'm3', name: 'C', placement: 'street', monthlyRevenue: 150_000, monthlySales: 2_200, slots: 50, stockedSlots: 45, operational: false },
  ],
  unmannedStores: [
    { id: 's1', name: 'StoreA', monthlyRevenue: 400_000, monthlyCustomers: 3_000, itemsSold: 7_000, machines: 4, shrinkageRate: 0.02 },
    { id: 's2', name: 'StoreB', monthlyRevenue: 500_000, monthlyCustomers: 4_000, itemsSold: 9_000, machines: 6, shrinkageRate: 0.01 },
  ],
};

describe('summarizeVending', () => {
  it('aggregates machine counts, revenue, sales and operating rate', () => {
    const v = summarizeVending(SNAP);
    expect(v.machineCount).toBe(3);
    expect(v.activeMachines).toBe(2);
    expect(v.operatingRate).toBeCloseTo(2 / 3, 10);
    expect(v.machineMonthlyRevenue).toBe(290_000);
    expect(v.machineMonthlySales).toBe(4_300);
    expect(v.avgRevenuePerMachine).toBe(Math.round(290_000 / 3));
  });

  it('computes average stock rate across total slots and flags low stock', () => {
    const v = summarizeVending(SNAP);
    // (38 + 8 + 45) / (40 + 40 + 50) = 91 / 130
    expect(v.avgStockRate).toBeCloseTo(91 / 130, 10);
    // m2 の在庫率 8/40 = 0.2 < 0.25 のみ低在庫。
    expect(LOW_STOCK_THRESHOLD).toBe(0.25);
    expect(v.lowStockCount).toBe(1);
  });

  it('picks the top machine by revenue', () => {
    const v = summarizeVending(SNAP);
    expect(v.topMachine).toEqual({ id: 'm3', name: 'C', monthlyRevenue: 150_000 });
  });

  it('breaks down by placement, revenue-descending, with labels', () => {
    const v = summarizeVending(SNAP);
    expect(v.placementBreakdown).toEqual([
      { placement: 'street', label: PLACEMENT_LABEL.street, count: 1, revenue: 150_000, sales: 2_200 },
      { placement: 'office', label: PLACEMENT_LABEL.office, count: 2, revenue: 140_000, sales: 2_100 },
    ]);
  });

  it('aggregates unmanned stores: revenue, customers, spend-per-customer, shrinkage, top', () => {
    const v = summarizeVending(SNAP);
    expect(v.unmannedStoreCount).toBe(2);
    expect(v.unmannedMonthlyRevenue).toBe(900_000);
    expect(v.unmannedCustomers).toBe(7_000);
    expect(v.avgSpendPerCustomer).toBe(Math.round(900_000 / 7_000));
    expect(v.avgShrinkageRate).toBeCloseTo((0.02 + 0.01) / 2, 10);
    expect(v.topUnmannedStore).toEqual({ id: 's2', name: 'StoreB', monthlyRevenue: 500_000 });
  });

  it('combines machine + unmanned monthly revenue', () => {
    const v = summarizeVending(SNAP);
    expect(v.combinedMonthlyRevenue).toBe(290_000 + 900_000);
  });

  it('treats slots=0 as 0% stock (no division by zero)', () => {
    const v = summarizeVending({
      machines: [{ id: 'z', name: 'Z', placement: 'factory', monthlyRevenue: 0, monthlySales: 0, slots: 0, stockedSlots: 0, operational: true }],
      unmannedStores: [],
    });
    expect(v.avgStockRate).toBe(0);
    expect(v.lowStockCount).toBe(1); // 0% < 25%
  });

  it('returns safe zeros/nulls for an empty snapshot', () => {
    const v = summarizeVending({ machines: [], unmannedStores: [] });
    expect(v.machineCount).toBe(0);
    expect(v.operatingRate).toBe(0);
    expect(v.avgRevenuePerMachine).toBe(0);
    expect(v.avgStockRate).toBe(0);
    expect(v.avgSpendPerCustomer).toBe(0);
    expect(v.avgShrinkageRate).toBe(0);
    expect(v.topMachine).toBeNull();
    expect(v.topUnmannedStore).toBeNull();
    expect(v.placementBreakdown).toEqual([]);
    expect(v.combinedMonthlyRevenue).toBe(0);
  });

  it('works with the real snapshot shape', async () => {
    const { SNAPSHOT } = await import('../snapshot');
    const v = summarizeVending(SNAPSHOT.vending);
    expect(v.machineCount).toBeGreaterThan(0);
    expect(v.unmannedStoreCount).toBeGreaterThan(0);
    expect(v.combinedMonthlyRevenue).toBeGreaterThan(0);
  });
});

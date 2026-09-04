import { describe, expect, it } from 'vitest';
import { summarizeFoodDelivery } from '../foodDelivery';

const UE = {
  weekOrders: 316,
  weekRevenue: 634_500,
  avgRating: 4.6,
  stores: [
    { name: 'A', orders: 142, revenue: 285_400, rating: 4.7 },
    { name: 'B', orders: 98, revenue: 196_800, rating: 4.5 },
  ],
};

const DC = {
  monthSummary: { orders: 612, revenue: 1_245_300, avgOrderValue: 2_035, cancellationRate: 0.018 },
  topAreas: [
    { area: '渋谷区', orders: 178, revenue: 362_400 },
    { area: '新宿区', orders: 134, revenue: 273_600 },
  ],
};

describe('summarizeFoodDelivery', () => {
  it('keeps each platform metrics and picks the top store/area by revenue', () => {
    const s = summarizeFoodDelivery(UE, DC);
    expect(s.uberEats.weekRevenue).toBe(634_500);
    expect(s.uberEats.storeCount).toBe(2);
    expect(s.uberEats.topStore).toEqual({ name: 'A', revenue: 285_400 });
    expect(s.demaeCan.monthRevenue).toBe(1_245_300);
    expect(s.demaeCan.topArea).toEqual({ area: '渋谷区', revenue: 362_400 });
  });

  it('estimates a combined monthly figure (weekly × 52/12 + monthly)', () => {
    const s = summarizeFoodDelivery(UE, DC);
    const wpm = 52 / 12;
    expect(s.combinedMonthlyEstimate.orders).toBe(Math.round(316 * wpm) + 612);
    expect(s.combinedMonthlyEstimate.revenue).toBe(Math.round(634_500 * wpm) + 1_245_300);
  });

  it('computes net revenue after platform commission (≈30%)', () => {
    const s = summarizeFoodDelivery(UE, DC);
    expect(s.commission.uberEats).toBeCloseTo(0.3, 5);
    expect(s.uberEats.weekNetRevenue).toBe(Math.round(634_500 * 0.7));
    expect(s.demaeCan.monthNetRevenue).toBe(Math.round(1_245_300 * 0.7));
    // 純売上は GMV より小さい (手数料控除後)。
    expect(s.combinedMonthlyEstimate.netRevenue).toBeLessThan(s.combinedMonthlyEstimate.revenue);
    const wpm = 52 / 12;
    expect(s.combinedMonthlyEstimate.netRevenue).toBe(
      Math.round(Math.round(634_500 * 0.7) * wpm) + Math.round(1_245_300 * 0.7),
    );
  });

  it('returns null top entries for empty inputs', () => {
    const s = summarizeFoodDelivery(
      { weekOrders: 0, weekRevenue: 0, avgRating: 0, stores: [] },
      { monthSummary: { orders: 0, revenue: 0, avgOrderValue: 0, cancellationRate: 0 }, topAreas: [] },
    );
    expect(s.uberEats.topStore).toBeNull();
    expect(s.demaeCan.topArea).toBeNull();
    expect(s.combinedMonthlyEstimate).toEqual({ orders: 0, revenue: 0, netRevenue: 0 });
  });

  it('picks a later store when it has the highest revenue (not just the first)', () => {
    // 先頭以外が最大のとき比較が実際に切り替わる。`>` を false 固定する mutant は
    // 先頭 (low) を返すため kill。
    const s = summarizeFoodDelivery(
      {
        weekOrders: 0, weekRevenue: 0, avgRating: 0,
        stores: [
          { name: 'low', orders: 1, revenue: 100, rating: 4 },
          { name: 'high', orders: 1, revenue: 200, rating: 4 },
        ],
      },
      DC,
    );
    expect(s.uberEats.topStore).toEqual({ name: 'high', revenue: 200 });
  });

  it('keeps the earlier store on a revenue tie (> strict, not >=)', () => {
    // 同額のとき `>` は先頭を保持。`>=` にする mutant は後続に切り替わるため、
    // name で kill。
    const s = summarizeFoodDelivery(
      {
        weekOrders: 0, weekRevenue: 0, avgRating: 0,
        stores: [
          { name: 'first', orders: 1, revenue: 200, rating: 4 },
          { name: 'second', orders: 1, revenue: 200, rating: 4 },
        ],
      },
      DC,
    );
    expect(s.uberEats.topStore?.name).toBe('first');
  });

  it('works with the real snapshot shapes', async () => {
    const { SNAPSHOT } = await import('../snapshot');
    const s = summarizeFoodDelivery(SNAPSHOT.uberEats, SNAPSHOT.demaeCan);
    expect(s.uberEats.storeCount).toBeGreaterThan(0);
    expect(s.combinedMonthlyEstimate.revenue).toBeGreaterThan(0);
  });
});

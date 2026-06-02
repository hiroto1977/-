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

  it('returns null top entries for empty inputs', () => {
    const s = summarizeFoodDelivery(
      { weekOrders: 0, weekRevenue: 0, avgRating: 0, stores: [] },
      { monthSummary: { orders: 0, revenue: 0, avgOrderValue: 0, cancellationRate: 0 }, topAreas: [] },
    );
    expect(s.uberEats.topStore).toBeNull();
    expect(s.demaeCan.topArea).toBeNull();
    expect(s.combinedMonthlyEstimate).toEqual({ orders: 0, revenue: 0 });
  });

  it('works with the real snapshot shapes', async () => {
    const { SNAPSHOT } = await import('../snapshot');
    const s = summarizeFoodDelivery(SNAPSHOT.uberEats, SNAPSHOT.demaeCan);
    expect(s.uberEats.storeCount).toBeGreaterThan(0);
    expect(s.combinedMonthlyEstimate.revenue).toBeGreaterThan(0);
  });
});

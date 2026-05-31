import { describe, expect, it } from 'vitest';
import { buildBusinessOverview } from '../overview';
import type { SalesEntry } from '../sales';
import type { KpiActual } from '../kpiActuals';

const SALES: SalesEntry[] = [
  { date: '2026-05-01', channel: 'amazon', amount: 60000, orders: 12 },
  { date: '2026-05-02', channel: 'shopify', amount: 40000, orders: 8 },
];
const KPI: KpiActual[] = [
  { period: '2026-05', unit: '全社', revenue: 100000, cogs: 40000, advertising: 10000, sga: 20000, depreciation: 5000 },
];

describe('buildBusinessOverview', () => {
  it('composes sales, KPI, team and plan into one summary', () => {
    const o = buildBusinessOverview({
      plan: 'business',
      sales: SALES,
      kpiActuals: KPI,
      members: [{ role: 'owner' }, { role: 'admin' }],
    });

    expect(o.plan).toEqual({ tier: 'business', label: 'Business', audience: '中小企業・チーム' });

    expect(o.sales.totalAmount).toBe(100000);
    expect(o.sales.totalOrders).toBe(20);
    expect(o.sales.aov).toBeCloseTo(5000);
    expect(o.sales.channelCount).toBe(2);
    expect(o.sales.topChannel).toBe('Amazon');

    expect(o.kpi.hasData).toBe(true);
    expect(o.kpi.revenue).toBe(100000);
    // variable=50000, fixed=25000 → OP=25000
    expect(o.kpi.operatingProfit).toBe(25000);

    expect(o.team).toEqual({ members: 2, seatLimit: 25, seatsRemaining: 23 });
    expect(o.flags.profitable).toBe(true);
    expect(o.flags.seatsFull).toBe(false);
  });

  it('handles an empty business (free plan, no data)', () => {
    const o = buildBusinessOverview({ plan: 'free', sales: [], kpiActuals: [], members: [] });
    expect(o.sales.totalAmount).toBe(0);
    expect(o.sales.topChannel).toBeNull();
    expect(o.kpi.hasData).toBe(false);
    expect(o.kpi.operatingProfit).toBe(0);
    expect(o.team.seatLimit).toBe(1);
    expect(o.flags.profitable).toBe(false);
  });

  it('flags seatsFull when members reach the plan cap', () => {
    const o = buildBusinessOverview({
      plan: 'free', // 1 seat
      sales: [],
      kpiActuals: [],
      members: [{ role: 'owner' }],
    });
    expect(o.team.seatsRemaining).toBe(0);
    expect(o.flags.seatsFull).toBe(true);
  });

  it('marks an unprofitable business when costs exceed revenue', () => {
    const loss: KpiActual[] = [
      { period: '2026-05', unit: '全社', revenue: 100, cogs: 80, advertising: 40, sga: 30, depreciation: 0 },
    ];
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: loss, members: [] });
    expect(o.kpi.operatingProfit).toBeLessThan(0);
    expect(o.flags.profitable).toBe(false);
  });

  it('exposes contribution ratio and a null growth rate for a single period', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    // contribution = revenue - (cogs + advertising) = 100000 - 50000 = 50000 → 50%
    expect(o.kpi.contributionRatio).toBeCloseTo(50);
    expect(o.kpi.revenueGrowthPct).toBeNull();
  });

  it('computes revenue growth when two periods are present', () => {
    const twoPeriods: KpiActual[] = [
      { period: '2026-04', unit: '全社', revenue: 100000, cogs: 40000, advertising: 10000, sga: 20000, depreciation: 5000 },
      { period: '2026-05', unit: '全社', revenue: 120000, cogs: 40000, advertising: 10000, sga: 20000, depreciation: 5000 },
    ];
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: twoPeriods, members: [] });
    expect(o.kpi.revenueGrowthPct).toBe(20);
  });

  it('exposes CAGR and a moving-average trend across multiple periods', () => {
    const rev = (period: string, revenue: number): KpiActual =>
      ({ period, unit: '全社', revenue, cogs: 0, advertising: 0, sga: 0, depreciation: 0 });
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      kpiActuals: [rev('2026-01', 100), rev('2026-02', 110), rev('2026-03', 120), rev('2026-04', 200)],
      members: [],
    });
    expect(o.kpi.revenueCagrPct).not.toBeNull();
    expect(o.kpi.revenueCagrPct!).toBeGreaterThan(0);
    expect(o.kpi.revenueTrend).toBe('up');
  });

  it('leaves CAGR and trend null for a single period', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    expect(o.kpi.revenueCagrPct).toBeNull();
    expect(o.kpi.revenueTrend).toBeNull();
  });
});

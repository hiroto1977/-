import { describe, expect, it } from 'vitest';
import { computeTrendAlerts } from '../trendAlerts';
import { groupOperatingProfitByPeriod, type KpiActual } from '../kpiActuals';

const rev = (period: string, revenue: number): KpiActual =>
  ({ period, unit: '全社', revenue, cogs: 0, advertising: 0, sga: 0, depreciation: 0 });

// operating profit = revenue - (cogs+adv) - (sga+dep)
const full = (period: string, revenue: number, cogs: number, sga: number): KpiActual =>
  ({ period, unit: '全社', revenue, cogs, advertising: 0, sga, depreciation: 0 });

describe('computeTrendAlerts — revenue decline streak', () => {
  it('reports no streak and hasSeries=false for a single period', () => {
    const t = computeTrendAlerts([rev('2026-05', 100)]);
    expect(t.revenue.hasSeries).toBe(false);
    expect(t.revenue.streak).toBe(0);
    expect(t.revenue.dropFromPeakPct).toBeNull();
  });

  it('counts consecutive months below the prior month', () => {
    // 100 → 120 → 90 → 80 : last two are declines → streak 2, peak 120
    const t = computeTrendAlerts([rev('2026-02', 100), rev('2026-03', 120), rev('2026-04', 90), rev('2026-05', 80)]);
    expect(t.revenue.streak).toBe(2);
    expect(t.revenue.peak).toBe(120);
    expect(t.revenue.latest).toBe(80);
    expect(t.revenue.dropFromPeakPct).toBeCloseTo(33.3);
  });

  it('resets the streak when the latest month rises', () => {
    const t = computeTrendAlerts([rev('2026-03', 120), rev('2026-04', 90), rev('2026-05', 110)]);
    expect(t.revenue.streak).toBe(0);
    expect(t.revenue.dropFromPeakPct).toBeNull();
  });

  it('counts a full monotonic decline', () => {
    const t = computeTrendAlerts([rev('2026-02', 200), rev('2026-03', 180), rev('2026-04', 150), rev('2026-05', 100)]);
    expect(t.revenue.streak).toBe(3);
    expect(t.revenue.peak).toBe(200);
    expect(t.revenue.dropFromPeakPct).toBe(50);
  });

  it('groups multiple units within a period before comparing', () => {
    const t = computeTrendAlerts([
      rev('2026-04', 60), rev('2026-04', 40), // period total 100
      rev('2026-05', 30), rev('2026-05', 30), // period total 60 → decline
    ]);
    expect(t.revenue.streak).toBe(1);
  });
});

describe('computeTrendAlerts — operating-profit decline streak', () => {
  it('detects consecutive operating-profit declines', () => {
    // OP = rev - cogs - sga: 300, 200, 100 (declining), then steady-state
    const t = computeTrendAlerts([
      full('2026-03', 1000, 400, 300), // OP 300
      full('2026-04', 900, 400, 300),  // OP 200
      full('2026-05', 800, 400, 300),  // OP 100
    ]);
    expect(t.operatingProfit.streak).toBe(2);
    expect(t.operatingProfit.latest).toBe(100);
  });
});

describe('groupOperatingProfitByPeriod', () => {
  it('sums fundamentals per period then computes operating profit, sorted ascending', () => {
    const series = groupOperatingProfitByPeriod([
      full('2026-05', 1000, 400, 300),
      full('2026-04', 800, 300, 200),
    ]);
    expect(series.map((p) => p.period)).toEqual(['2026-04', '2026-05']);
    expect(series[0]!.operatingProfit).toBe(300); // 800-300-200
    expect(series[1]!.operatingProfit).toBe(300); // 1000-400-300
  });
});

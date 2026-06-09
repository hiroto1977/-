import { describe, expect, it } from 'vitest';
import { monthlyTrendSeries, type KpiActual } from '../kpiActuals';

const row = (period: string, revenue: number, cogs = 0, sga = 0): KpiActual =>
  ({ period, unit: '全社', revenue, cogs, advertising: 0, sga, depreciation: 0 });

describe('monthlyTrendSeries', () => {
  it('returns an empty array for no actuals', () => {
    expect(monthlyTrendSeries([])).toEqual([]);
  });

  it('computes revenue, operating profit, margin and MoM growth per period (ascending)', () => {
    const series = monthlyTrendSeries([
      row('2026-05', 1200, 400, 300), // OP 500, margin 41.7%, growth +20%
      row('2026-04', 1000, 400, 300), // OP 300, margin 30%, growth null (first)
    ]);
    expect(series.map((r) => r.period)).toEqual(['2026-04', '2026-05']);
    expect(series[0]).toEqual({ period: '2026-04', revenue: 1000, operatingProfit: 300, operatingMarginPct: 30, revenueGrowthPct: null });
    expect(series[1]!.operatingProfit).toBe(500);
    expect(series[1]!.operatingMarginPct).toBeCloseTo(41.7);
    expect(series[1]!.revenueGrowthPct).toBe(20);
  });

  it('aggregates multiple units within a period before computing', () => {
    const series = monthlyTrendSeries([
      row('2026-04', 600, 200, 100),
      row('2026-04', 400, 100, 100), // period revenue 1000, cogs 300, sga 200 → OP 500
    ]);
    expect(series).toHaveLength(1);
    expect(series[0]!.revenue).toBe(1000);
    expect(series[0]!.operatingProfit).toBe(500);
  });

  it('reports a zero margin and null growth when revenue is zero', () => {
    const series = monthlyTrendSeries([row('2026-04', 0, 0, 100), row('2026-05', 0, 0, 100)]);
    expect(series[0]!.operatingMarginPct).toBe(0);
    expect(series[1]!.revenueGrowthPct).toBeNull(); // prior revenue 0 → null
  });

  it('reports negative growth and rounds to one decimal', () => {
    const series = monthlyTrendSeries([row('2026-04', 300), row('2026-05', 290)]);
    expect(series[1]!.revenueGrowthPct).toBeCloseTo(-3.3); // (290-300)/300 = -3.33%
  });
});

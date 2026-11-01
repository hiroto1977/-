import { describe, expect, it } from 'vitest';
import { computeYoYGrowth, type KpiActual } from '../kpiActuals';

const rev = (period: string, revenue: number): KpiActual =>
  ({ period, unit: '全社', revenue, cogs: 0, advertising: 0, sga: 0, depreciation: 0 });

describe('computeYoYGrowth', () => {
  it('returns null for an empty set', () => {
    expect(computeYoYGrowth([])).toBeNull();
  });

  it('returns null when the prior-year same month is absent', () => {
    // latest 2026-05 but no 2025-05
    expect(computeYoYGrowth([rev('2025-12', 100), rev('2026-05', 120)])).toBeNull();
  });

  it('compares the latest month with the same month one year earlier', () => {
    const y = computeYoYGrowth([
      rev('2025-05', 1_000_000),
      rev('2025-12', 9_999_999), // noise — not the comparison month
      rev('2026-05', 1_250_000),
    ])!;
    expect(y.period).toBe('2026-05');
    expect(y.priorPeriod).toBe('2025-05');
    expect(y.revenue).toBe(1_250_000);
    expect(y.priorRevenue).toBe(1_000_000);
    expect(y.revenueYoYPct).toBe(25);
  });

  it('reports a YoY decline as negative', () => {
    const y = computeYoYGrowth([rev('2025-05', 1_000_000), rev('2026-05', 800_000)])!;
    expect(y.revenueYoYPct).toBe(-20);
  });

  it('aggregates multiple units within each month', () => {
    const y = computeYoYGrowth([
      rev('2025-05', 600_000),
      { ...rev('2025-05', 400_000), unit: '店舗' }, // 2025-05 total 1,000,000
      rev('2026-05', 1_100_000),
    ])!;
    expect(y.priorRevenue).toBe(1_000_000);
    expect(y.revenueYoYPct).toBe(10);
  });

  it('returns null YoY pct when the prior-year revenue is zero', () => {
    const y = computeYoYGrowth([rev('2025-05', 0), rev('2026-05', 500_000)])!;
    expect(y.priorPeriod).toBe('2025-05');
    expect(y.revenueYoYPct).toBeNull();
  });

  it('rounds to one decimal place', () => {
    // 300,000 → 310,000 = +3.33% → 3.3
    const y = computeYoYGrowth([rev('2025-05', 300_000), rev('2026-05', 310_000)])!;
    expect(y.revenueYoYPct).toBe(3.3);
  });
});

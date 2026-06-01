import { describe, expect, it } from 'vitest';
import {
  isValidPeriod,
  parseKpiActual,
  summarizeFundamentals,
  computeKpiMetrics,
  computeRevenueGrowthPct,
  computeRevenueCagrPct,
  computeRevenueTrend,
  computeRevenueLandingForecast,
  computeLaborMetrics,
  summarizeLaborCost,
  groupRevenueByPeriod,
  type KpiActual,
} from '../kpiActuals';

const actual = (period: string, revenue: number, unit = '全社'): KpiActual => ({
  period,
  unit,
  revenue,
  cogs: 0,
  advertising: 0,
  sga: 0,
  depreciation: 0,
});

const BASE = {
  period: '2026-05',
  unit: 'EC',
  revenue: '1000000',
  cogs: '400000',
  advertising: '100000',
  sga: '200000',
  depreciation: '50000',
};

describe('isValidPeriod', () => {
  it('accepts YYYY-MM with a valid month', () => {
    expect(isValidPeriod('2026-01')).toBe(true);
    expect(isValidPeriod('2026-12')).toBe(true);
  });
  it('rejects bad shapes and out-of-range months', () => {
    expect(isValidPeriod('2026-13')).toBe(false);
    expect(isValidPeriod('2026-00')).toBe(false);
    expect(isValidPeriod('2026/05')).toBe(false);
    expect(isValidPeriod('26-05')).toBe(false);
    expect(isValidPeriod(202605)).toBe(false);
  });
});

describe('parseKpiActual', () => {
  it('coerces string numbers and trims the unit', () => {
    const a = parseKpiActual({ ...BASE, unit: '  EC  ' });
    expect(a).toEqual({
      period: '2026-05',
      unit: 'EC',
      revenue: 1_000_000,
      cogs: 400_000,
      advertising: 100_000,
      sga: 200_000,
      depreciation: 50_000,
    });
  });

  it('rejects an invalid period', () => {
    expect(() => parseKpiActual({ ...BASE, period: '2026-99' })).toThrow(/YYYY-MM/);
  });

  it('rejects an empty or oversized unit', () => {
    expect(() => parseKpiActual({ ...BASE, unit: '   ' })).toThrow(/事業名/);
    expect(() => parseKpiActual({ ...BASE, unit: 'x'.repeat(65) })).toThrow(/事業名/);
  });

  it('rejects negative or non-finite figures', () => {
    expect(() => parseKpiActual({ ...BASE, revenue: -1 })).toThrow(/売上高/);
    expect(() => parseKpiActual({ ...BASE, cogs: 'abc' })).toThrow(/売上原価/);
    expect(() => parseKpiActual({ ...BASE, sga: Infinity })).toThrow(/販管費/);
  });
});

describe('summarizeFundamentals', () => {
  it('returns zeros for an empty set', () => {
    expect(summarizeFundamentals([])).toEqual({
      revenue: 0,
      cogs: 0,
      advertising: 0,
      sga: 0,
      depreciation: 0,
    });
  });

  it('sums across actuals', () => {
    const rows: KpiActual[] = [
      { period: '2026-04', unit: 'EC', revenue: 100, cogs: 40, advertising: 10, sga: 20, depreciation: 5 },
      { period: '2026-05', unit: 'EC', revenue: 200, cogs: 80, advertising: 20, sga: 40, depreciation: 10 },
    ];
    expect(summarizeFundamentals(rows)).toEqual({
      revenue: 300,
      cogs: 120,
      advertising: 30,
      sga: 60,
      depreciation: 15,
    });
  });
});

describe('computeKpiMetrics', () => {
  it('computes break-even indicators on a profitable unit', () => {
    const m = computeKpiMetrics({ revenue: 1000, cogs: 400, advertising: 100, sga: 200, depreciation: 50 });
    expect(m.variableCost).toBe(500);
    expect(m.fixedCost).toBe(250);
    expect(m.contribution).toBe(500);
    expect(m.contributionRatio).toBeCloseTo(50);
    expect(m.bep).toBeCloseTo(500); // fixed / contribution * revenue = 250/500*1000
    expect(m.bepRatio).toBeCloseTo(50);
    expect(m.safetyMargin).toBeCloseTo(50);
    expect(m.operatingProfit).toBe(250);
  });

  it('marks BEP as Infinity when contribution is non-positive', () => {
    const m = computeKpiMetrics({ revenue: 100, cogs: 100, advertising: 50, sga: 10, depreciation: 0 });
    expect(m.contribution).toBeLessThanOrEqual(0);
    expect(m.bep).toBe(Infinity);
    expect(m.bepRatio).toBe(Infinity);
    expect(m.safetyMargin).toBe(0);
  });

  it('returns zeroed ratios for a zero-revenue unit', () => {
    const m = computeKpiMetrics({ revenue: 0, cogs: 0, advertising: 0, sga: 100, depreciation: 0 });
    expect(m.contributionRatio).toBe(0);
    expect(m.bep).toBe(Infinity);
    expect(m.operatingProfit).toBe(-100);
  });
});

describe('computeRevenueGrowthPct', () => {
  it('returns null for an empty set', () => {
    expect(computeRevenueGrowthPct([])).toBeNull();
  });

  it('returns null when only one period is present', () => {
    expect(computeRevenueGrowthPct([actual('2026-05', 1_000_000)])).toBeNull();
  });

  it('returns null when the prior period has zero revenue (avoids division by zero)', () => {
    expect(computeRevenueGrowthPct([actual('2026-04', 0), actual('2026-05', 1_000_000)])).toBeNull();
  });

  it('computes month-over-month growth as a rounded percentage', () => {
    // 1,000,000 → 1,200,000 = +20%
    expect(computeRevenueGrowthPct([actual('2026-04', 1_000_000), actual('2026-05', 1_200_000)])).toBe(20);
  });

  it('reports negative growth when revenue falls', () => {
    // 1,000,000 → 900,000 = -10%
    expect(computeRevenueGrowthPct([actual('2026-04', 1_000_000), actual('2026-05', 900_000)])).toBe(-10);
  });

  it('groups multiple units within a period and compares the two latest periods', () => {
    const actuals = [
      actual('2026-03', 500_000, 'EC'),
      actual('2026-04', 600_000, 'EC'),
      actual('2026-04', 400_000, '店舗'), // 2026-04 total = 1,000,000
      actual('2026-05', 750_000, 'EC'),
      actual('2026-05', 750_000, '店舗'), // 2026-05 total = 1,500,000 → +50%
    ];
    expect(computeRevenueGrowthPct(actuals)).toBe(50);
  });

  it('orders by period label regardless of input order', () => {
    const actuals = [actual('2026-05', 1_100_000), actual('2026-04', 1_000_000)];
    expect(computeRevenueGrowthPct(actuals)).toBe(10);
  });

  it('rounds to one decimal place', () => {
    // 300,000 → 310,000 = +3.333...% → 3.3
    expect(computeRevenueGrowthPct([actual('2026-04', 300_000), actual('2026-05', 310_000)])).toBe(3.3);
  });
});

describe('groupRevenueByPeriod', () => {
  it('sums revenue per period and sorts ascending by period label', () => {
    const series = groupRevenueByPeriod([
      actual('2026-05', 300, 'EC'),
      actual('2026-04', 100, 'EC'),
      actual('2026-05', 200, '店舗'),
    ]);
    expect(series).toEqual([
      { period: '2026-04', revenue: 100 },
      { period: '2026-05', revenue: 500 },
    ]);
  });

  it('returns an empty array for no actuals', () => {
    expect(groupRevenueByPeriod([])).toEqual([]);
  });
});

describe('computeRevenueCagrPct', () => {
  it('returns null with fewer than two periods', () => {
    expect(computeRevenueCagrPct([])).toBeNull();
    expect(computeRevenueCagrPct([actual('2026-05', 1_000)])).toBeNull();
  });

  it('returns null when the first period revenue is zero (invalid base)', () => {
    expect(computeRevenueCagrPct([actual('2026-04', 0), actual('2026-05', 1_000)])).toBeNull();
  });

  it('computes per-period compound growth over the span', () => {
    // 1,000,000 → 1,210,000 over 2 steps = (1.21)^(1/2) − 1 = +10%
    const out = computeRevenueCagrPct([
      actual('2026-03', 1_000_000),
      actual('2026-04', 1_100_000),
      actual('2026-05', 1_210_000),
    ]);
    expect(out).toBe(10);
  });

  it('reports negative compound growth when revenue contracts', () => {
    // 1,000,000 → 810,000 over 2 steps = (0.81)^(1/2) − 1 = −10%
    expect(computeRevenueCagrPct([
      actual('2026-03', 1_000_000),
      actual('2026-04', 900_000),
      actual('2026-05', 810_000),
    ])).toBe(-10);
  });
});

describe('computeRevenueTrend', () => {
  it('returns null when there are not enough periods for the window', () => {
    expect(computeRevenueTrend([actual('2026-04', 100), actual('2026-05', 110)])).toBeNull();
  });

  it('detects an upward trend via moving average', () => {
    const out = computeRevenueTrend([
      actual('2026-01', 100),
      actual('2026-02', 110),
      actual('2026-03', 120),
      actual('2026-04', 200),
    ]);
    expect(out).toBe('up');
  });

  it('detects a downward trend', () => {
    const out = computeRevenueTrend([
      actual('2026-01', 200),
      actual('2026-02', 190),
      actual('2026-03', 180),
      actual('2026-04', 100),
    ]);
    expect(out).toBe('down');
  });

  it('reports flat when the moving average barely moves (±1%)', () => {
    const out = computeRevenueTrend([
      actual('2026-01', 1_000),
      actual('2026-02', 1_000),
      actual('2026-03', 1_000),
      actual('2026-04', 1_005),
    ]);
    expect(out).toBe('flat');
  });

  it('honours a custom window size', () => {
    // window=2 needs 3 periods; latest avg(110,120)=115 vs prior avg(100,110)=105 → up
    const out = computeRevenueTrend([
      actual('2026-03', 100),
      actual('2026-04', 110),
      actual('2026-05', 120),
    ], 2);
    expect(out).toBe('up');
  });
});

describe('computeRevenueLandingForecast', () => {
  it('returns null with no actuals', () => {
    expect(computeRevenueLandingForecast([])).toBeNull();
  });

  it('annualises the run-rate from elapsed months of the latest year', () => {
    // 3 か月で 300万 → ランレート年換算 1,200万
    const out = computeRevenueLandingForecast([
      actual('2026-01', 1_000_000),
      actual('2026-02', 1_000_000),
      actual('2026-03', 1_000_000),
    ]);
    expect(out).toEqual({
      year: '2026',
      monthsElapsed: 3,
      actualToDate: 3_000_000,
      runRateForecast: 12_000_000,
    });
  });

  it('uses only the latest calendar year when multiple years are present', () => {
    const out = computeRevenueLandingForecast([
      actual('2025-11', 9_999_999),
      actual('2025-12', 9_999_999),
      actual('2026-01', 2_000_000),
      actual('2026-02', 2_000_000),
    ]);
    // 対象年は 2026、2 か月で 400万 → 年換算 2,400万 (2025 は無視)
    expect(out).toEqual({
      year: '2026',
      monthsElapsed: 2,
      actualToDate: 4_000_000,
      runRateForecast: 24_000_000,
    });
  });

  it('sums multiple units within the same month before annualising', () => {
    const out = computeRevenueLandingForecast([
      actual('2026-01', 600_000, 'EC'),
      actual('2026-01', 400_000, '店舗'),
    ]);
    // 1 か月で 100万 → 年換算 1,200万
    expect(out?.monthsElapsed).toBe(1);
    expect(out?.actualToDate).toBe(1_000_000);
    expect(out?.runRateForecast).toBe(12_000_000);
  });

  it('rounds the annualised figure to the nearest yen', () => {
    // 1 か月 100円 → 1,200円ちょうど。端数が出るケース: 7円/1か月 → 84円
    expect(computeRevenueLandingForecast([actual('2026-01', 7)])?.runRateForecast).toBe(84);
  });
});

describe('parseKpiActual — laborCost (optional)', () => {
  it('omits laborCost when not provided (keeps the legacy shape)', () => {
    const a = parseKpiActual(BASE);
    expect('laborCost' in a).toBe(false);
  });

  it('includes laborCost when provided', () => {
    const a = parseKpiActual({ ...BASE, laborCost: '120000' });
    expect(a.laborCost).toBe(120_000);
  });

  it('rejects labor cost greater than SG&A', () => {
    expect(() => parseKpiActual({ ...BASE, sga: '100000', laborCost: '200000' })).toThrow(/人件費/);
  });
});

describe('summarizeLaborCost / computeLaborMetrics', () => {
  const withLabor = (revenue: number, cogs: number, sga: number, laborCost: number): KpiActual => ({
    period: '2026-05', unit: '全社', revenue, cogs, advertising: 0, sga, depreciation: 0, laborCost,
  });

  it('sums labor cost treating missing entries as zero', () => {
    expect(summarizeLaborCost([actual('2026-04', 100), withLabor(100, 0, 50, 30)])).toBe(30);
  });

  it('returns all-null metrics when no labor cost is recorded', () => {
    const m = computeLaborMetrics([actual('2026-05', 1000)], 3);
    expect(m).toEqual({ laborCost: 0, laborSharePct: null, laborToRevenuePct: null, laborPerCapita: null });
  });

  it('computes labor share (of gross profit), labor-to-revenue and per-capita', () => {
    // revenue 1000, cogs 400 → gross 600; labor 300 → share 50%, labor/revenue 30%
    const m = computeLaborMetrics([withLabor(1000, 400, 400, 300)], 2);
    expect(m.laborCost).toBe(300);
    expect(m.laborSharePct).toBe(50);
    expect(m.laborToRevenuePct).toBe(30);
    expect(m.laborPerCapita).toBe(150); // 300 / 2
  });

  it('nulls per-capita when there are no members', () => {
    const m = computeLaborMetrics([withLabor(1000, 400, 400, 300)], 0);
    expect(m.laborPerCapita).toBeNull();
    expect(m.laborSharePct).toBe(50);
  });

  it('nulls labor share when gross profit is zero or negative', () => {
    const m = computeLaborMetrics([withLabor(400, 400, 300, 200)], 1);
    expect(m.laborSharePct).toBeNull(); // gross profit 0
    expect(m.laborToRevenuePct).toBe(50); // 200/400
  });
});

import { describe, expect, it } from 'vitest';
import {
  KPI_ACTUALS_COLLECTION,
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
  monthlyTrendSeries,
  computeYoYGrowth,
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

describe('KPI_ACTUALS_COLLECTION', () => {
  it('is the stable record-store collection key', () => {
    expect(KPI_ACTUALS_COLLECTION).toBe('kpi-actuals');
  });
});

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
  it('rejects junk anchored before/after a valid period (^ and $ anchors)', () => {
    // アンカーを外す Regex mutant は部分一致で true 化するため、前後ゴミ付きを kill。
    expect(isValidPeriod('x2026-05')).toBe(false); // ^ アンカー
    expect(isValidPeriod('2026-05x')).toBe(false); // $ アンカー
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

  it('names the offending field in the error (advertising / depreciation labels)', () => {
    // num() のラベルを '' にする StringLiteral mutant を、各フィールド固有の文言で kill。
    expect(() => parseKpiActual({ ...BASE, advertising: -1 })).toThrow(/広告費/);
    expect(() => parseKpiActual({ ...BASE, depreciation: 'x' })).toThrow(/減価償却費/);
  });

  it('rejects a non-string unit rather than coercing it', () => {
    // unit 三項を true 固定 (123.trim() で TypeError) / '' を別文字列にする mutant を kill。
    expect(() => parseKpiActual({ ...BASE, unit: 123 })).toThrow(/事業名/);
  });

  it('accepts a 64-char unit at the upper boundary (> strict)', () => {
    // length>64 を >=64 にする mutant を、ちょうど 64 文字許容で kill。
    const a = parseKpiActual({ ...BASE, unit: 'x'.repeat(64) });
    expect(a.unit).toBe('x'.repeat(64));
  });

  it('accepts a zero figure at the lower boundary (< strict)', () => {
    // n<0 を n<=0 にする mutant を、revenue===0 許容で kill。
    expect(parseKpiActual({ ...BASE, revenue: 0 }).revenue).toBe(0);
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
    // first===0 → last/first=Infinity → rate 非有限 → !isFinite ガードで null。
    // このガードを if(false) にする mutant は Infinity を返すため kill される。
    expect(computeRevenueCagrPct([actual('2026-04', 0), actual('2026-05', 1_000)])).toBeNull();
  });

  it('computes over exactly two periods (single step)', () => {
    // series.length<2 を <=2 にする mutant は 2 期で null を返すため、2 期 +21% で kill。
    // 1,000,000 → 1,210,000 over 1 step = 21%
    expect(computeRevenueCagrPct([actual('2026-04', 1_000_000), actual('2026-05', 1_210_000)])).toBe(21);
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

  it('treats an exactly +1% change as flat (> 0.01 strict, not >=)', () => {
    // change===0.01 ちょうど → 'flat'。> を >= にする mutant は 'up' を返すため kill。
    expect(computeRevenueTrend([actual('2026-04', 100), actual('2026-05', 101)], 1)).toBe('flat');
  });

  it('treats an exactly -1% change as flat (< -0.01 strict, not <=)', () => {
    // change===-0.01 ちょうど → 'flat'。< を <= にする mutant は 'down' を返すため kill。
    expect(computeRevenueTrend([actual('2026-04', 100), actual('2026-05', 99)], 1)).toBe('flat');
  });

  it('reports up when the prior window is zero but recent grows (zero-division → +Inf)', () => {
    // prior 窓平均 0、recent>0 → change=+Infinity → 'up'。閾値・文字列 mutant を kill。
    expect(computeRevenueTrend([actual('2026-04', 0), actual('2026-05', 300)], 1)).toBe('up');
  });

  it('reports flat when both windows are zero (zero-division → NaN)', () => {
    // prior 窓平均 0、recent 0 → change=NaN → どの閾値にも該当せず 'flat'。
    expect(computeRevenueTrend([actual('2026-04', 0), actual('2026-05', 0)], 1)).toBe('flat');
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

describe('monthlyTrendSeries', () => {
  it('returns rows in ascending period order with margin and growth', () => {
    const rows = monthlyTrendSeries([
      { period: '2026-05', unit: 'EC', revenue: 1_200_000, cogs: 400_000, advertising: 100_000, sga: 200_000, depreciation: 50_000 },
      { period: '2026-04', unit: 'EC', revenue: 1_000_000, cogs: 400_000, advertising: 100_000, sga: 200_000, depreciation: 50_000 },
    ]);
    expect(rows.map((r) => r.period)).toEqual(['2026-04', '2026-05']);
    // 先頭期は前期が無いため成長率 null (条件を true 固定する mutant は +Infinity を出す)。
    expect(rows[0]!.revenueGrowthPct).toBeNull();
    // 2 期目: 1,000,000 → 1,200,000 = +20%
    expect(rows[1]!.revenueGrowthPct).toBe(20);
    expect(rows[1]!.revenue).toBe(1_200_000);
  });

  it('nulls the growth rate when the prior period revenue is zero', () => {
    const rows = monthlyTrendSeries([actual('2026-04', 0), actual('2026-05', 500_000)]);
    expect(rows[1]!.revenueGrowthPct).toBeNull();
  });

  it('reports a zero operating margin for a zero-revenue period', () => {
    const rows = monthlyTrendSeries([actual('2026-04', 0)]);
    expect(rows[0]!.operatingMarginPct).toBe(0);
  });
});

describe('computeYoYGrowth', () => {
  it('returns null for an empty set', () => {
    expect(computeYoYGrowth([])).toBeNull();
  });

  it('compares the latest period against the same month a year earlier', () => {
    const yoy = computeYoYGrowth([actual('2025-05', 1_000_000), actual('2026-05', 1_200_000)]);
    expect(yoy).toEqual({
      period: '2026-05',
      priorPeriod: '2025-05',
      revenue: 1_200_000,
      priorRevenue: 1_000_000,
      revenueYoYPct: 20,
    });
  });

  it('returns null when the prior-year month is absent', () => {
    expect(computeYoYGrowth([actual('2026-05', 1_000_000)])).toBeNull();
  });

  it('nulls the YoY percentage when the prior-year revenue is zero', () => {
    const yoy = computeYoYGrowth([actual('2025-05', 0), actual('2026-05', 1_000_000)]);
    expect(yoy?.revenueYoYPct).toBeNull();
  });

  it('returns null when the latest period label is malformed (yearEarlier guard)', () => {
    // yearEarlier の `if (!m) return null` を if(false) にする mutant は m=null を
    // そのまま参照して例外になる → 不正期で null を期待することで kill。
    expect(computeYoYGrowth([actual('not-a-period', 1_000)])).toBeNull();
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

  it('omits laborCost for an empty-string input (treated as "not provided")', () => {
    // `!== ''` の '' を別文字列にする StringLiteral mutant は '' を有効値 0 として
    // 取り込んでしまう → laborCost 不在を確認して kill。
    expect('laborCost' in parseKpiActual({ ...BASE, laborCost: '' })).toBe(false);
  });

  it('names 人件費 when the labor figure itself is invalid (num label)', () => {
    // num() の '人件費' ラベルを '' にする mutant を、負の人件費の文言で kill。
    expect(() => parseKpiActual({ ...BASE, laborCost: -5 })).toThrow(/人件費/);
  });

  it('accepts labor cost exactly equal to SG&A (> strict boundary)', () => {
    // laborCost>sga を >=sga にする mutant を、人件費===販管費 許容で kill。
    const a = parseKpiActual({ ...BASE, sga: '100000', laborCost: '100000' });
    expect(a.laborCost).toBe(100_000);
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

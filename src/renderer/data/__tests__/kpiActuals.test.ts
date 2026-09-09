import { describe, expect, it } from 'vitest';
import {
  formatPeriodWindow,
  periodWindow,
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
  finiteBep,
  noBreakEvenNote,
  actualKey,
  hasSamePeriodUnit,
  findDuplicateActuals,
  duplicateActualMessage,
  duplicateActualsNote,
  duplicateActualsSheetNote,
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

/**
 * **窓の月数は「期の異なり数」。** (2026-09-08)
 *
 * `KpiActual` は期ごとに事業 (`unit`) の行を持つので、**行数で数えると
 * 3 事業 × 4 か月が「12 か月」になる。** この規則を留めていなかったことは
 * パス 50 の対照 (月数を `valid.length` に替える) が 1 件も落とさなかったことで
 * 分かった —— 見本がどれも「1 期 1 行」だったため、規則が測られていなかった。
 */
describe('periodWindow / formatPeriodWindow', () => {
  it('★ 同じ期の複数事業は 1 か月として数える (行数ではない)', () => {
    const w = periodWindow(['2026-04', '2026-04', '2026-04', '2026-05', '2026-05'])!;
    expect(w).toEqual({ from: '2026-04', to: '2026-05', months: 2 });
    expect(formatPeriodWindow(w)).toBe('2026-04〜2026-05・2 か月');
  });

  it('★ 並び順に依らず最初と最後を取る', () => {
    expect(periodWindow(['2026-06', '2026-01', '2026-03'])).toEqual({
      from: '2026-01', to: '2026-06', months: 3,
    });
  });

  it('★ 読めない期は無視し、読める分だけで測る', () => {
    expect(periodWindow(['2026-13', 'bad', '2026-05'])).toEqual({
      from: '2026-05', to: '2026-05', months: 1,
    });
  });

  it('★ 読める期が 1 件も無ければ null (0 か月に倒さない)', () => {
    expect(periodWindow([])).toBeNull();
    expect(periodWindow(['2026-13', '2026-00', 'nope'])).toBeNull();
  });

  it('★ 1 期だけなら from と to が同じ (範囲を偽装しない)', () => {
    expect(formatPeriodWindow(periodWindow(['2026-04'])!)).toBe('2026-04〜2026-04・1 か月');
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

  it('marks BEP as Infinity and 安全余裕率 as 算定不能 when contribution is non-positive', () => {
    const m = computeKpiMetrics({ revenue: 100, cogs: 100, advertising: 50, sga: 10, depreciation: 0 });
    expect(m.contribution).toBeLessThanOrEqual(0);
    expect(m.bep).toBe(Infinity);
    expect(m.bepRatio).toBe(Infinity);
    // 損益分岐点が存在しないので比率も存在しない。**0 に倒さない。**
    expect(m.safetyMargin).toBeNull();
  });

  // **売上 0 なら限界利益率は「算定不能」で、0 ではない。** 0 は「変動費が売上を
  // すべて食っている」という主張であり、姉妹欄 `safetyMargin` と同じ答え方に
  // 揃える (2026-09-08 まで、この見本の名前が `zeroed ratios` として 0 を固定していた)。
  it('cannot compute the contribution ratio for a zero-revenue unit (null, not 0)', () => {
    const m = computeKpiMetrics({ revenue: 0, cogs: 0, advertising: 0, sga: 100, depreciation: 0 });
    expect(m.contributionRatio).toBeNull();
    expect(m.bep).toBe(Infinity);
    expect(m.operatingProfit).toBe(-100);
  });

  // ★ 対照: 売上が在れば率は出る (上の null が「常に null」ではないこと)。
  it('computes the contribution ratio when revenue is positive', () => {
    const m = computeKpiMetrics({ revenue: 1000, cogs: 400, advertising: 0, sga: 100, depreciation: 0 });
    expect(m.contributionRatio).toBe(60);
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

  // 月次推移の営業利益率も**その月の売上が 0 なら算定不能**。経営レポートの
  // 推移テーブルと画面の表がこの値を刷るので、0.0% は「利益率が 0」の主張になる。
  it('cannot compute the operating margin for a zero-revenue period (null, not 0)', () => {
    const rows = monthlyTrendSeries([actual('2026-04', 0)]);
    expect(rows[0]!.operatingMarginPct).toBeNull();
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

/**
 * **安全余裕率は 100 − 損益分岐点比率である。0 で止めない。** (2026-09-07)
 *
 * 2026-09-07 まで `Math.max(0, 100 - bepRatio)` で下から止めていた。分母は売上なので
 * 損益分岐点を下回れば真値は負になるのに、**0.0% と表示していた** —— つまり
 * 「損益分岐点ちょうど」と「損益分岐点を 200% 下回る」が同じ数字になっていた。
 *
 * 実測 (直す前・同じ画面に出る損益分岐点比率と並べる):
 *
 * | 状況 | 損益分岐点比率 | 表示された安全余裕率 | 真値 (100 − 比率) | 営業利益 |
 * | --- | --- | --- | --- | --- |
 * | 損益分岐点ちょうど | 100.0% | 0.0% | 0.0% | 0 |
 * | 33% 下回る | 150.0% | **0.0%** | **−50.0%** | −300 |
 * | 大きく下回る | 300.0% | **0.0%** | **−200.0%** | −1,200 |
 * | 限界利益 ≤ 0 (BEP なし) | ∞ | **0.0%** | 算定不能 | −300 |
 *
 * `KpiPage` は「損益分岐点 (BEP) ¥X / 比率 150.0%」の札の**隣**に「安全余裕率 0.0%」を
 * 出しており、100 − 150 = 0 ではないので**同じ画面の 2 つの数字が両立しなかった**。
 * 金融機関等提出用の書面はさらに算式「(売上高 − 損益分岐点売上高) ÷ 売上高」を
 * 数字の隣に刷るので、**刷った算式が刷った数字を出さない**状態だった
 * (`bankSubmission.test.ts` の「印刷した式が、印刷した数字で成り立つこと」と同じ欠陥)。
 *
 * 直し方: 負の値をそのまま返す。損益分岐点が**存在しない** (限界利益 ≤ 0) ときだけ
 * `null` = 算定不能とする —— 0 に倒すと「損益分岐点上に居る」という最も安全な読みで
 * 出てしまうので、最悪の場合を最良の顔で見せることになる (パス 28 と同じ形)。
 */
describe('安全余裕率 = 100 − 損益分岐点比率 (0 で止めない)', () => {
  const f = (revenue: number, variable: number, fixed: number) => ({
    revenue,
    cogs: variable,
    advertising: 0,
    sga: fixed,
    depreciation: 0,
  });

  it('★ 損益分岐点を下回ると負の値を返す (0 に丸めない)', () => {
    const m = computeKpiMetrics(f(1000, 400, 900));
    expect(m.bepRatio).toBeCloseTo(150);
    expect(m.safetyMargin).toBeCloseTo(-50);
    expect(m.operatingProfit).toBe(-300); // 実際に赤字である
  });

  it('★ 下回り方の大きさが数字に出る (0.0% で潰れない)', () => {
    const near = computeKpiMetrics(f(1000, 400, 900)); // BEP 1,500
    const far = computeKpiMetrics(f(1000, 400, 1800)); // BEP 3,000
    expect(near.safetyMargin).toBeCloseTo(-50);
    expect(far.safetyMargin).toBeCloseTo(-200);
    // 直す前はこの 2 つがどちらも 0 で、区別が付かなかった。
    expect(near.safetyMargin).not.toBe(far.safetyMargin);
  });

  it('★ 不変条件: 損益分岐点が有限なら 安全余裕率 === 100 − 損益分岐点比率 (60 通り)', () => {
    const broken: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      const m = computeKpiMetrics(f(1000 + i * 7, 300 + i * 3, 200 + i * 37));
      if (!Number.isFinite(m.bepRatio)) continue;
      if (m.safetyMargin === null || Math.abs(m.safetyMargin - (100 - m.bepRatio)) > 1e-9) {
        broken.push(`i=${i}: bepRatio=${m.bepRatio} safetyMargin=${String(m.safetyMargin)}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('★ 対照: 走査は負の側にも実際に入っている (空回りの検査ではない)', () => {
    let negatives = 0;
    for (let i = 0; i < 60; i += 1) {
      const m = computeKpiMetrics(f(1000 + i * 7, 300 + i * 3, 200 + i * 37));
      if (m.safetyMargin !== null && m.safetyMargin < 0) negatives += 1;
    }
    // 直す前の実装ならここは 0 になる (`Math.max(0, …)` なので負は出ない)。
    expect(negatives).toBeGreaterThan(0);
  });

  it('損益分岐点ちょうどは 0 —— 負とは別の状態である', () => {
    const m = computeKpiMetrics(f(1000, 400, 600));
    expect(m.bepRatio).toBeCloseTo(100);
    expect(m.safetyMargin).toBeCloseTo(0);
    expect(m.operatingProfit).toBe(0);
  });

  it('限界利益 ≤ 0 は算定不能 (null) —— 0 でも −∞ でもない', () => {
    const m = computeKpiMetrics(f(1000, 1200, 100));
    expect(m.contribution).toBeLessThan(0);
    expect(m.bep).toBe(Infinity);
    expect(m.safetyMargin).toBeNull();
  });

  it('健全な会社は従来どおり正の値 (直しが良い側を壊していない)', () => {
    const m = computeKpiMetrics(f(2000, 800, 600));
    expect(m.bepRatio).toBeCloseTo(50);
    expect(m.safetyMargin).toBeCloseTo(50);
  });
});

/**
 * **損益分岐点が「存在しない」ことを、座標に 0 として渡さない。**
 *
 * `bep` の「無い」の印は `Infinity` (限界利益 0 以下 = どんな売上でも固定費を
 * 回収できない)。2026-09-08 まで KPI 画面の 2 つのグラフがこれを 0 に倒し、
 * BEP 線を軸の一番下に引いていた —— 「損益分岐点 0 円 = どんな売上でも黒字」で、
 * **真実の正反対**である。
 */
describe('finiteBep / noBreakEvenNote — 損益分岐点が存在しない期', () => {
  it('★ 限界利益が 0 以下なら null (0 に倒さない)', () => {
    // 売上 100 万・変動費 120 万 → 限界利益 −20 万
    const m = computeKpiMetrics({ revenue: 1_000_000, cogs: 1_200_000, advertising: 0, sga: 300_000, depreciation: 0 });
    expect(m.bep).toBe(Infinity);
    expect(finiteBep(m.bep)).toBeNull();
  });

  it('★ 限界利益ちょうど 0 も null (境目は「0 以下」)', () => {
    const m = computeKpiMetrics({ revenue: 1_000_000, cogs: 1_000_000, advertising: 0, sga: 300_000, depreciation: 0 });
    expect(finiteBep(m.bep)).toBeNull();
  });

  it('★ 対照: 限界利益が在れば数で出る (標本が在ることの確認)', () => {
    const m = computeKpiMetrics({ revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 300_000, depreciation: 0 });
    expect(finiteBep(m.bep)).toBe(500_000); // 30万 ÷ 60万 × 100万
  });

  it('★ 途切れの理由を述べ、「データが無い」と読ませない', () => {
    const out = noBreakEvenNote(2, 12);
    expect(out).toContain('12 期のうち 2 期');
    expect(out).toContain('損益分岐点が存在しません');
    expect(out).toContain('どれだけ売っても固定費を回収できない');
  });

  it('★ 対照: 欠けが無ければ断り書きは出ない', () => {
    expect(noBreakEvenNote(0, 12)).toBeNull();
    expect(noBreakEvenNote(-1, 12)).toBeNull();
  });
});

describe('同じ期・事業の重複 (パス 124)', () => {
  const row = (period: string, unit: string, revenue = 1): KpiActual => ({ period, unit, revenue, cogs: 0, advertising: 0, sga: 0, depreciation: 0 });

  it('actualKey は期と事業 (前後の空白を落とす) で決まり、金額は関係ない', () => {
    expect(actualKey(row('2026-04', '全社', 1))).toBe(actualKey(row('2026-04', ' 全社 ', 999)));
    expect(actualKey(row('2026-04', '全社'))).not.toBe(actualKey(row('2026-05', '全社')));
    expect(actualKey(row('2026-04', '全社'))).not.toBe(actualKey(row('2026-04', 'EC')));
    // 大文字小文字は別物 (同じかどうかは利用者の判断)
    expect(actualKey(row('2026-04', 'EC'))).not.toBe(actualKey(row('2026-04', 'ec')));
  });

  it('★ hasSamePeriodUnit は同じ組が在れば true・別の期や別の事業なら false', () => {
    const existing = [row('2026-04', '全社'), row('2026-04', 'EC')];
    expect(hasSamePeriodUnit(existing, { period: '2026-04', unit: '全社' })).toBe(true);
    expect(hasSamePeriodUnit(existing, { period: '2026-04', unit: ' EC ' })).toBe(true);
    expect(hasSamePeriodUnit(existing, { period: '2026-05', unit: '全社' })).toBe(false);
    expect(hasSamePeriodUnit(existing, { period: '2026-04', unit: '店舗' })).toBe(false);
    expect(hasSamePeriodUnit([], { period: '2026-04', unit: '全社' })).toBe(false);
  });

  it('findDuplicateActuals は件数 2 以上の組だけを期・事業の昇順で返す', () => {
    const groups = findDuplicateActuals([
      row('2026-05', 'EC'), row('2026-04', '全社'), row('2026-05', 'EC'), row('2026-04', '全社'), row('2026-04', '全社'), row('2026-06', '全社'),
    ]);
    expect(groups).toEqual([
      { period: '2026-04', unit: '全社', count: 3 },
      { period: '2026-05', unit: 'EC', count: 2 },
    ]);
    expect(findDuplicateActuals([row('2026-04', '全社'), row('2026-04', 'EC')])).toEqual([]);
    expect(findDuplicateActuals([])).toEqual([]);
  });

  it('合算の実測: 同じ組を 2 件持つと summarizeFundamentals / groupRevenueByPeriod は足す (だから 2 件目を断る)', () => {
    const two = [row('2026-04', '全社', 1_000_000), row('2026-04', '全社', 1_200_000)];
    expect(summarizeFundamentals(two).revenue).toBe(2_200_000);
    expect(groupRevenueByPeriod(two)).toEqual([{ period: '2026-04', revenue: 2_200_000 }]);
    expect(findDuplicateActuals(two)).toEqual([{ period: '2026-04', unit: '全社', count: 2 }]);
  });

  it('文面: 断り・一覧の警告・書面の但し書きは、期と事業と件数を名指しする', () => {
    expect(duplicateActualMessage('実績', { period: '2026-04', unit: '全社' })).toBe(
      '2026-04 の「全社」の実績は既に入力されています。訂正するときは一覧の × で消してから入れ直してください（同じ期・事業を 2 件入れると合算されます）。',
    );
    expect(duplicateActualMessage('予算', { period: '2026-04', unit: ' EC ' })).toContain('2026-04 の「EC」の予算は既に入力されています');
    const groups = [
      { period: '2026-04', unit: '全社', count: 2 },
      { period: '2026-05', unit: 'EC', count: 3 },
    ];
    expect(duplicateActualsNote('実績', groups)).toBe(
      '同じ期・事業の実績が 2 組重複しており、合算されています（2026-04 全社 ×2、2026-05 EC ×3）。一覧の × で余分な行を消してください。',
    );
    expect(duplicateActualsNote('予算', groups.slice(0, 1))).toBe(
      '同じ期・事業の予算が 1 組重複しており、合算されています（2026-04 全社 ×2）。一覧の × で余分な行を消してください。',
    );
    expect(duplicateActualsSheetNote(groups)).toBe(
      'KPI 実績に同じ期・事業の重複が 2 組あり（2026-04 全社 ×2、2026-05 EC ×3）、本表の金額はその合算値です。',
    );
    expect(duplicateActualsNote('実績', [])).toBeNull();
    expect(duplicateActualsSheetNote([])).toBeNull();
  });
});

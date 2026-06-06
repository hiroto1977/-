import { describe, expect, it } from 'vitest';
import {
  assessVariance,
  classifyFavorability,
  computeBudgetLandingForecast,
  computeBudgetVariance,
  computeBudgetVarianceFromFundamentals,
  computeMonthlyAchievement,
  decomposePriceVolumeVariance,
  KPI_BUDGETS_COLLECTION,
} from '../budgetVariance';
import type { KpiActual } from '../kpiActuals';

describe('KPI_BUDGETS_COLLECTION', () => {
  it('is the kpi-budgets collection key (paired with kpi-actuals)', () => {
    expect(KPI_BUDGETS_COLLECTION).toBe('kpi-budgets');
  });
});

const row = (revenue: number, cogs = 0, advertising = 0, sga = 0, depreciation = 0): KpiActual => ({
  period: '2026-05',
  unit: '全社',
  revenue,
  cogs,
  advertising,
  sga,
  depreciation,
});

describe('computeBudgetVarianceFromFundamentals', () => {
  it('computes revenue and operating-profit variance and achievement', () => {
    // budget: rev 1000, op = 1000 - (300+100) - (200+0) = 400
    // actual: rev 1100, op = 1100 - (300+100) - (200+0) = 500
    const v = computeBudgetVarianceFromFundamentals(
      { revenue: 1000, cogs: 300, advertising: 100, sga: 200, depreciation: 0 },
      { revenue: 1100, cogs: 300, advertising: 100, sga: 200, depreciation: 0 },
    );
    expect(v.revenue).toEqual({ budget: 1000, actual: 1100, variance: 100, achievementPct: 110 });
    expect(v.operatingProfit.budget).toBe(400);
    expect(v.operatingProfit.actual).toBe(500);
    expect(v.operatingProfit.variance).toBe(100);
    expect(v.operatingProfit.achievementPct).toBe(125);
  });

  it('returns a null achievement when the budget is zero (no division by zero)', () => {
    const v = computeBudgetVarianceFromFundamentals(
      { revenue: 0, cogs: 0, advertising: 0, sga: 0, depreciation: 0 },
      { revenue: 500, cogs: 0, advertising: 0, sga: 0, depreciation: 0 },
    );
    expect(v.revenue.achievementPct).toBeNull();
    expect(v.revenue.variance).toBe(500);
  });

  it('reports under-achievement (below 100%) and negative variance when actual lags', () => {
    const v = computeBudgetVarianceFromFundamentals(
      { revenue: 1000, cogs: 0, advertising: 0, sga: 0, depreciation: 0 },
      { revenue: 800, cogs: 0, advertising: 0, sga: 0, depreciation: 0 },
    );
    expect(v.revenue.achievementPct).toBe(80);
    expect(v.revenue.variance).toBe(-200);
  });
});

describe('computeBudgetVariance', () => {
  it('returns null when either side is empty', () => {
    expect(computeBudgetVariance([], [row(100)])).toBeNull();
    expect(computeBudgetVariance([row(100)], [])).toBeNull();
  });

  it('sums multiple rows on each side before comparing', () => {
    const budgets = [row(600), row(400)]; // 1000
    const actuals = [row(500), row(700)]; // 1200
    const v = computeBudgetVariance(budgets, actuals)!;
    expect(v.revenue.budget).toBe(1000);
    expect(v.revenue.actual).toBe(1200);
    expect(v.revenue.achievementPct).toBe(120);
  });

  it('rounds achievement to one decimal place', () => {
    // 1000 actual / 300 budget = 333.33% → 333.3
    const v = computeBudgetVariance([row(300)], [row(1000)])!;
    expect(v.revenue.achievementPct).toBe(333.3);
  });
});

// --- round 71: 加算的指標 ---

describe('decomposePriceVolumeVariance', () => {
  it('splits a revenue variance into price and volume contributions summing to total', () => {
    // budget: 100 units @ 10 = 1000; actual: 120 units @ 11 = 1320
    // price  = (11 - 10) * 120 = 120
    // volume = (120 - 100) * 10 = 200
    // total  = 1320 - 1000 = 320 = 120 + 200
    const d = decomposePriceVolumeVariance(100, 1000, 120, 1320)!;
    expect(d.budgetAmount).toBe(1000);
    expect(d.actualAmount).toBe(1320);
    expect(d.priceVariance).toBe(120);
    expect(d.volumeVariance).toBe(200);
    expect(d.totalVariance).toBe(320);
    expect(d.priceVariance + d.volumeVariance).toBe(d.totalVariance);
  });

  it('handles a pure volume change (same unit price → zero price variance)', () => {
    // budget 10/unit, actual 10/unit, qty 100→150
    const d = decomposePriceVolumeVariance(100, 1000, 150, 1500)!;
    expect(d.priceVariance).toBe(0);
    expect(d.volumeVariance).toBe(500);
    expect(d.totalVariance).toBe(500);
  });

  it('handles a pure price change (same qty → zero volume variance)', () => {
    const d = decomposePriceVolumeVariance(100, 1000, 100, 1200)!;
    expect(d.priceVariance).toBe(200);
    expect(d.volumeVariance).toBe(0);
    expect(d.totalVariance).toBe(200);
  });

  it('returns null when budget quantity is zero', () => {
    expect(decomposePriceVolumeVariance(0, 1000, 120, 1320)).toBeNull();
  });

  it('returns null when actual quantity is zero', () => {
    expect(decomposePriceVolumeVariance(100, 1000, 0, 1320)).toBeNull();
  });

  it('returns null when a quantity is negative', () => {
    expect(decomposePriceVolumeVariance(-1, 1000, 120, 1320)).toBeNull();
    expect(decomposePriceVolumeVariance(100, 1000, -5, 1320)).toBeNull();
  });

  it('returns null when a quantity is non-finite', () => {
    expect(decomposePriceVolumeVariance(Infinity, 1000, 120, 1320)).toBeNull();
    expect(decomposePriceVolumeVariance(100, 1000, NaN, 1320)).toBeNull();
  });

  it('returns null when an amount is non-finite', () => {
    expect(decomposePriceVolumeVariance(100, Infinity, 120, 1320)).toBeNull();
    expect(decomposePriceVolumeVariance(100, 1000, 120, NaN)).toBeNull();
  });
});

describe('classifyFavorability', () => {
  it('treats a positive revenue variance as favorable and negative as unfavorable', () => {
    expect(classifyFavorability(100, 'revenue')).toBe('favorable');
    expect(classifyFavorability(-100, 'revenue')).toBe('unfavorable');
  });

  it('treats a negative cost variance (under budget) as favorable and positive as unfavorable', () => {
    expect(classifyFavorability(-100, 'cost')).toBe('favorable');
    expect(classifyFavorability(100, 'cost')).toBe('unfavorable');
  });

  it('returns neutral on a zero variance for both kinds', () => {
    expect(classifyFavorability(0, 'revenue')).toBe('neutral');
    expect(classifyFavorability(0, 'cost')).toBe('neutral');
  });

  it('returns neutral on a non-finite variance', () => {
    expect(classifyFavorability(NaN, 'revenue')).toBe('neutral');
    expect(classifyFavorability(Infinity, 'cost')).toBe('neutral');
  });
});

describe('assessVariance', () => {
  it('computes variance, percent, favorability and materiality above the default threshold', () => {
    // budget 1000, actual 1150 → variance +150, 15% > 10% default → material, revenue favorable
    const a = assessVariance(1000, 1150, 'revenue');
    expect(a.variance).toBe(150);
    expect(a.variancePct).toBe(15);
    expect(a.favorability).toBe('favorable');
    expect(a.material).toBe(true);
  });

  it('marks a small variance within the threshold as immaterial', () => {
    // budget 1000, actual 1050 → 5% <= 10% → not material
    const a = assessVariance(1000, 1050, 'revenue');
    expect(a.variancePct).toBe(5);
    expect(a.material).toBe(false);
  });

  it('uses absolute budget for the percent denominator so cost overruns are positive pct', () => {
    // cost budget 1000, actual 1300 → variance +300, 30% material, unfavorable
    const a = assessVariance(1000, 1300, 'cost');
    expect(a.variancePct).toBe(30);
    expect(a.favorability).toBe('unfavorable');
    expect(a.material).toBe(true);
  });

  it('returns a null percent and immaterial when the budget is zero', () => {
    const a = assessVariance(0, 500, 'revenue');
    expect(a.variancePct).toBeNull();
    expect(a.material).toBe(false);
    expect(a.variance).toBe(500);
  });

  it('honours a custom threshold (exactly at threshold is not material)', () => {
    // 20% variance with threshold 20 → not material (strictly greater than)
    const at = assessVariance(1000, 1200, 'revenue', 20);
    expect(at.variancePct).toBe(20);
    expect(at.material).toBe(false);
    // threshold 19 → 20 > 19 → material
    expect(assessVariance(1000, 1200, 'revenue', 19).material).toBe(true);
  });

  it('falls back to the default threshold when given a negative or non-finite threshold', () => {
    // 15% variance; bad threshold → default 10 used → material
    expect(assessVariance(1000, 1150, 'revenue', -5).material).toBe(true);
    expect(assessVariance(1000, 1150, 'revenue', NaN).material).toBe(true);
  });

  it('does not let a negative threshold leak in (5% variance stays immaterial vs default 10)', () => {
    // A negative threshold must fall back to 10, NOT be used directly: 5% > 10 is false.
    // If the negative threshold leaked in, abs(5) > -5 would be true → material.
    expect(assessVariance(1000, 1050, 'revenue', -5).material).toBe(false);
    // threshold exactly 0 is valid and used → a tiny non-zero variance is material.
    expect(assessVariance(1000, 1001, 'revenue', 0).material).toBe(true);
    expect(assessVariance(1000, 1000, 'revenue', 0).material).toBe(false);
  });
});

describe('computeMonthlyAchievement', () => {
  it('returns an empty array when both series are empty', () => {
    expect(computeMonthlyAchievement([], [])).toEqual([]);
  });

  it('computes per-month and YTD cumulative achievement, sorted by period', () => {
    const budgets = [
      { period: '2026-02', revenue: 200 },
      { period: '2026-01', revenue: 100 },
    ];
    const actuals = [
      { period: '2026-01', revenue: 120 },
      { period: '2026-02', revenue: 150 },
    ];
    const rows = computeMonthlyAchievement(budgets, actuals);
    expect(rows.map((r) => r.period)).toEqual(['2026-01', '2026-02']);
    // Jan: 120/100 = 120%, YTD 120/100 = 120%
    expect(rows[0]).toMatchObject({
      budget: 100,
      actual: 120,
      achievementPct: 120,
      cumulativeBudget: 100,
      cumulativeActual: 120,
      ytdAchievementPct: 120,
    });
    // Feb: 150/200 = 75%, YTD (120+150)/(100+200) = 270/300 = 90%
    expect(rows[1]).toMatchObject({
      budget: 200,
      actual: 150,
      achievementPct: 75,
      cumulativeBudget: 300,
      cumulativeActual: 270,
      ytdAchievementPct: 90,
    });
  });

  it('treats a period missing from one side as zero', () => {
    const rows = computeMonthlyAchievement(
      [{ period: '2026-01', revenue: 100 }],
      [{ period: '2026-02', revenue: 80 }],
    );
    expect(rows).toHaveLength(2);
    // Jan: actual missing → 0, achievement 0/100 = 0
    expect(rows[0]).toMatchObject({ period: '2026-01', actual: 0, achievementPct: 0 });
    // Feb: budget missing → 0, achievement null (div by zero), YTD 80/100 = 80
    expect(rows[1]).toMatchObject({
      period: '2026-02',
      budget: 0,
      achievementPct: null,
      ytdAchievementPct: 80,
    });
  });

  it('returns null achievement when the cumulative budget is still zero', () => {
    const rows = computeMonthlyAchievement(
      [{ period: '2026-01', revenue: 0 }],
      [{ period: '2026-01', revenue: 50 }],
    );
    expect(rows[0]!.achievementPct).toBeNull();
    expect(rows[0]!.ytdAchievementPct).toBeNull();
  });
});

describe('computeBudgetLandingForecast', () => {
  it('projects a run-rate landing and compares it to the full-year budget', () => {
    // 600 over 6 months → run-rate 1200 for 12 months; budget 1000 → +200, 120%
    const f = computeBudgetLandingForecast(600, 6, 1000)!;
    expect(f.monthsElapsed).toBe(6);
    expect(f.periodMonths).toBe(12);
    expect(f.progressPct).toBe(50);
    expect(f.actualToDate).toBe(600);
    expect(f.forecast).toBe(1200);
    expect(f.fullYearBudget).toBe(1000);
    expect(f.forecastVariance).toBe(200);
    expect(f.forecastAchievementPct).toBe(120);
  });

  it('rounds the forecast to the nearest yen', () => {
    // 100 over 3 months → 100/3*12 = 400 exactly
    expect(computeBudgetLandingForecast(100, 3, 500)!.forecast).toBe(400);
    // 50 over 7 months → 50/7*12 = 85.7... → 86
    expect(computeBudgetLandingForecast(50, 7, 500)!.forecast).toBe(86);
  });

  it('supports a custom period length', () => {
    // 300 over 2 quarters → run-rate over 4 quarters = 600
    const f = computeBudgetLandingForecast(300, 2, 500, 4)!;
    expect(f.periodMonths).toBe(4);
    expect(f.progressPct).toBe(50);
    expect(f.forecast).toBe(600);
  });

  it('returns a null forecast achievement when the budget is zero', () => {
    const f = computeBudgetLandingForecast(600, 6, 0)!;
    expect(f.forecast).toBe(1200);
    expect(f.forecastAchievementPct).toBeNull();
  });

  it('returns null when monthsElapsed is zero, negative or non-finite', () => {
    expect(computeBudgetLandingForecast(600, 0, 1000)).toBeNull();
    expect(computeBudgetLandingForecast(600, -1, 1000)).toBeNull();
    expect(computeBudgetLandingForecast(600, NaN, 1000)).toBeNull();
  });

  it('returns null when periodMonths is zero, negative or non-finite', () => {
    expect(computeBudgetLandingForecast(600, 6, 1000, 0)).toBeNull();
    expect(computeBudgetLandingForecast(600, 6, 1000, -12)).toBeNull();
    expect(computeBudgetLandingForecast(600, 6, 1000, Infinity)).toBeNull();
  });

  it('returns null when monthsElapsed exceeds periodMonths (data past period end)', () => {
    expect(computeBudgetLandingForecast(600, 13, 1000)).toBeNull();
  });

  it('allows monthsElapsed equal to periodMonths (full period, forecast = actual)', () => {
    const f = computeBudgetLandingForecast(1000, 12, 1000)!;
    expect(f.forecast).toBe(1000);
    expect(f.progressPct).toBe(100);
  });

  it('returns null when actualToDate or budget is non-finite', () => {
    expect(computeBudgetLandingForecast(NaN, 6, 1000)).toBeNull();
    expect(computeBudgetLandingForecast(600, 6, Infinity)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  computeBudgetVariance,
  computeBudgetVarianceFromFundamentals,
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

import { describe, expect, it, vi } from 'vitest';
import {
  aggregateFundamentals,
  computeKpi,
  createMockDataSource,
  fetchKpiSnapshot,
  type Fundamentals,
} from '../kpi';

// --- computeKpi — the BEP engine -------------------------------------

describe('computeKpi', () => {
  const baseline: Fundamentals = {
    revenue: 10_000_000,
    cogs: 2_000_000,
    advertising: 1_000_000,
    sga: 2_400_000,
    depreciation: 600_000,
  };

  it('computes the 8 BEP indicators from the documented formula', () => {
    const k = computeKpi(baseline);
    expect(k.variableCost).toBe(3_000_000); // cogs + ad
    expect(k.fixedCost).toBe(3_000_000); // sga + dep
    expect(k.contribution).toBe(7_000_000); // rev - var
    expect(k.contributionRatio).toBeCloseTo(70.0, 1);
    expect(k.variableRatio).toBeCloseTo(30.0, 1);
    expect(k.fixedRatio).toBeCloseTo(30.0, 1);
    // BEP = fixedCost / contributionRatio. 3M / 0.70 = ~4.285M
    expect(k.bep).toBeCloseTo(4_285_714.29, 0);
    expect(k.bepRatio).toBeCloseTo(42.86, 1);
    expect(k.safetyMargin).toBeCloseTo(57.14, 1);
    expect(k.operatingProfit).toBe(4_000_000); // 7M - 3M
    expect(k.operatingLeverage).toBeCloseTo(1.75, 2); // 7M / 4M
  });

  it('returns BEP=Infinity and safetyMargin=0 when contribution is non-positive', () => {
    // Loss-making unit: variable + fixed > revenue
    const loss: Fundamentals = {
      revenue: 1_000_000,
      cogs: 800_000,
      advertising: 400_000, // variable = 1.2M, larger than revenue
      sga: 100_000,
      depreciation: 50_000,
    };
    const k = computeKpi(loss);
    expect(k.contribution).toBe(-200_000);
    expect(k.bep).toBe(Infinity);
    expect(k.bepRatio).toBe(Infinity);
    expect(k.safetyMargin).toBe(0); // clamped — never below zero
    expect(k.operatingProfit).toBe(-350_000);
  });

  it('handles zero-revenue gracefully (no NaN / Infinity in ratios)', () => {
    const zero: Fundamentals = {
      revenue: 0,
      cogs: 0,
      advertising: 0,
      sga: 100_000,
      depreciation: 50_000,
    };
    const k = computeKpi(zero);
    expect(k.contributionRatio).toBe(0);
    expect(k.variableRatio).toBe(0);
    expect(k.fixedRatio).toBe(0);
    // Contribution is 0, which is NOT > 0 → BEP = Infinity
    expect(k.bep).toBe(Infinity);
    expect(k.safetyMargin).toBe(0);
  });

  it('caps operatingLeverage at 999 when OP is near zero (avoids Infinity)', () => {
    // contribution = revenue - var = 1M - 990k = 10k
    // fixedCost = 10k exactly → operatingProfit = 0
    const breakeven: Fundamentals = {
      revenue: 1_000_000,
      cogs: 990_000,
      advertising: 0,
      sga: 10_000,
      depreciation: 0,
    };
    const k = computeKpi(breakeven);
    expect(k.operatingProfit).toBe(0);
    expect(k.operatingLeverage).toBe(999); // capped
  });

  it('uses absolute value for operatingLeverage so loss-making units stay finite', () => {
    const loss: Fundamentals = {
      revenue: 1_000_000,
      cogs: 600_000,
      advertising: 0, // var = 600k, contribution = 400k
      sga: 1_000_000,
      depreciation: 0, // fixed = 1M
    };
    const k = computeKpi(loss);
    expect(k.operatingProfit).toBe(-600_000);
    // |contribution / OP| = |400k / -600k| = 0.667
    expect(k.operatingLeverage).toBeCloseTo(0.667, 2);
  });

  it('places the BEP exactly at fixedCost / contributionRatio in JPY', () => {
    // Hand-picked: contribution ratio 50%, fixed 1M → BEP = 2M
    const f: Fundamentals = {
      revenue: 4_000_000,
      cogs: 1_500_000,
      advertising: 500_000, // var = 2M (50% of rev)
      sga: 800_000,
      depreciation: 200_000, // fixed = 1M
    };
    const k = computeKpi(f);
    expect(k.contributionRatio).toBeCloseTo(50, 1);
    expect(k.bep).toBeCloseTo(2_000_000, 0);
    expect(k.safetyMargin).toBeCloseTo(50, 1); // exactly halfway above BEP
  });
});

// --- aggregateFundamentals ------------------------------------------

describe('aggregateFundamentals', () => {
  it('sums each fundamentals field across units (most-recent period only)', () => {
    const units = [
      {
        id: 'a',
        label: 'A',
        history: [
          { revenue: 1, cogs: 2, advertising: 3, sga: 4, depreciation: 5 },
          // older periods ignored
          { revenue: 99, cogs: 99, advertising: 99, sga: 99, depreciation: 99 },
        ],
      },
      {
        id: 'b',
        label: 'B',
        history: [{ revenue: 10, cogs: 20, advertising: 30, sga: 40, depreciation: 50 }],
      },
    ];
    expect(aggregateFundamentals(units)).toEqual({
      revenue: 11,
      cogs: 22,
      advertising: 33,
      sga: 44,
      depreciation: 55,
    });
  });

  it('returns zero fundamentals for an empty unit list', () => {
    expect(aggregateFundamentals([])).toEqual({
      revenue: 0,
      cogs: 0,
      advertising: 0,
      sga: 0,
      depreciation: 0,
    });
  });

  it('handles a unit with empty history (treats it as zero fundamentals)', () => {
    expect(
      aggregateFundamentals([{ id: 'a', label: 'A', history: [] }]),
    ).toEqual({
      revenue: 0,
      cogs: 0,
      advertising: 0,
      sga: 0,
      depreciation: 0,
    });
  });
});

// --- createMockDataSource -------------------------------------------

describe('createMockDataSource', () => {
  it('returns 6 business units with 30 periods each', async () => {
    const src = createMockDataSource();
    const units = await src.fetch();
    expect(units).toHaveLength(6);
    for (const u of units) {
      expect(u.history.length).toBe(30);
      for (const period of u.history) {
        expect(period.revenue).toBeGreaterThan(0);
        expect(period.cogs).toBeGreaterThanOrEqual(0);
        expect(period.sga).toBeGreaterThan(0);
      }
    }
  });

  it('uses the documented unit IDs (deterministic mock identity)', async () => {
    const src = createMockDataSource();
    const units = await src.fetch();
    const ids = units.map((u) => u.id);
    expect(ids).toEqual(['civic', 'consult', 'retail', 'training', 'media', 'licensing']);
  });

  it('seeded noise stays within the documented ±15% drift band', async () => {
    const src = createMockDataSource();
    const units = await src.fetch();
    const civic = units.find((u) => u.id === 'civic')!;
    // baseRevenue=4_500_000, drift 0.85..1.15 → expect all in 3.825M..5.175M
    for (const p of civic.history) {
      expect(p.revenue).toBeGreaterThanOrEqual(3_825_000);
      expect(p.revenue).toBeLessThanOrEqual(5_175_000);
    }
  });
});

// --- fetchKpiSnapshot (integration) ----------------------------------

describe('fetchKpiSnapshot', () => {
  it('returns 6 units + an aggregate, sorted by revenue desc', async () => {
    const snap = await fetchKpiSnapshot({ token: '', fetch: vi.fn<typeof fetch>() });
    expect(snap.units.length).toBe(6);
    expect(snap.aggregate.id).toBe('all');
    expect(snap.aggregate.label).toBe('全社合算');
    // Sorted desc by revenue
    for (let i = 1; i < snap.units.length; i++) {
      expect(snap.units[i - 1]!.fundamentals.revenue).toBeGreaterThanOrEqual(
        snap.units[i]!.fundamentals.revenue,
      );
    }
  });

  it('flags isMock: true (Phase 6 will flip this to false)', async () => {
    const snap = await fetchKpiSnapshot({ token: '', fetch: vi.fn<typeof fetch>() });
    expect(snap.isMock).toBe(true);
  });

  it('aggregate revenue equals the sum of unit revenues', async () => {
    const snap = await fetchKpiSnapshot({ token: '', fetch: vi.fn<typeof fetch>() });
    const sumOfUnits = snap.units.reduce((acc, u) => acc + u.fundamentals.revenue, 0);
    expect(snap.aggregate.fundamentals.revenue).toBe(sumOfUnits);
  });

  it('aggregate history has 30 periods', async () => {
    const snap = await fetchKpiSnapshot({ token: '', fetch: vi.fn<typeof fetch>() });
    expect(snap.aggregate.history.length).toBe(30);
  });

  it('aggregate KPI computed from summed fundamentals (not averaged ratios)', async () => {
    const snap = await fetchKpiSnapshot({ token: '', fetch: vi.fn<typeof fetch>() });
    // Verify by re-running computeKpi on the summed fundamentals.
    const expected = computeKpi(snap.aggregate.fundamentals);
    expect(snap.aggregate.kpi).toEqual(expected);
  });
});

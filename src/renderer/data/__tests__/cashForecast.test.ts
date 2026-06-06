import { describe, expect, it } from 'vitest';
import {
  forecastCashBalance,
  cashForecastTrajectory,
  scenarioRunways,
  seasonalIndices,
  seasonalForecast,
  fundingNeed,
  cashflowSensitivity,
} from '../cashForecast';

describe('forecastCashBalance', () => {
  it('projects a growing balance when monthly CF is positive', () => {
    const f = forecastCashBalance(1_000_000, 100_000, 3);
    expect(f.rows.map((r) => r.balance)).toEqual([1_100_000, 1_200_000, 1_300_000]);
    expect(f.shortfallMonthIndex).toBeNull();
    expect(f.minBalance).toBe(1_000_000); // opening is the lowest while growing
  });

  it('detects the month the balance first goes negative under burn', () => {
    // opening 250,000, burning 100,000/mo → month 3 ends at -50,000
    const f = forecastCashBalance(250_000, -100_000, 6);
    expect(f.shortfallMonthIndex).toBe(3);
    expect(f.rows[2]!.balance).toBe(-50_000);
    expect(f.minBalance).toBeLessThan(0);
  });

  it('tracks the minimum balance across the horizon', () => {
    const f = forecastCashBalance(500_000, -100_000, 4);
    expect(f.minBalance).toBe(100_000); // 500k→400→300→200→100
  });

  it('clamps the horizon to [0, 60] and floors fractional months', () => {
    expect(forecastCashBalance(100, 10, -5).rows).toHaveLength(0);
    expect(forecastCashBalance(100, 10, 3.9).rows).toHaveLength(3);
    expect(forecastCashBalance(100, 10, 999).rows).toHaveLength(60);
  });

  it('echoes opening balance and monthly net in the result', () => {
    const f = forecastCashBalance(800_000, -50_000, 2);
    expect(f.openingBalance).toBe(800_000);
    expect(f.monthlyNet).toBe(-50_000);
    expect(f.rows[0]).toEqual({ monthIndex: 1, netCashflow: -50_000, balance: 750_000 });
  });
});

describe('cashForecastTrajectory', () => {
  it('prepends the opening balance to each month-end balance', () => {
    const f = forecastCashBalance(1_000_000, 100_000, 3);
    expect(cashForecastTrajectory(f)).toEqual([1_000_000, 1_100_000, 1_200_000, 1_300_000]);
  });

  it('returns just the opening balance when the horizon is zero', () => {
    const f = forecastCashBalance(500_000, -100_000, 0);
    expect(cashForecastTrajectory(f)).toEqual([500_000]);
  });

  it('crosses below zero in the trajectory when funds run out', () => {
    const traj = cashForecastTrajectory(forecastCashBalance(250_000, -100_000, 4));
    // 250k → 150k → 50k → -50k → -150k
    expect(traj).toEqual([250_000, 150_000, 50_000, -50_000, -150_000]);
    expect(traj.some((v) => v < 0)).toBe(true);
  });
});

describe('scenarioRunways', () => {
  it('applies default 1.2 / 1.0 / 0.8 factors to monthly net', () => {
    const r = scenarioRunways(1_000_000, -100_000, 12)!;
    expect(r.optimistic.factor).toBe(1.2);
    expect(r.base.factor).toBe(1);
    expect(r.pessimistic.factor).toBe(0.8);
    expect(r.optimistic.monthlyNet).toBe(-120_000);
    expect(r.base.monthlyNet).toBe(-100_000);
    expect(r.pessimistic.monthlyNet).toBe(-80_000);
    expect(r.optimistic.label).toBe('楽観');
    expect(r.base.label).toBe('標準');
    expect(r.pessimistic.label).toBe('悲観');
  });

  it('produces a longer runway in the pessimistic (less burn) case under burn', () => {
    // burn: optimistic burns FASTER (1.2x), pessimistic burns SLOWER (0.8x)
    const r = scenarioRunways(1_000_000, -100_000, 24)!;
    // optimistic -120k/mo → negative at month 9 (1_000_000/120_000 = 8.33 → month 9)
    expect(r.optimistic.runwayMonths).toBe(9);
    // base -100k/mo → negative at month 11 (1_000_000 - 100_000*10 = 0 at m10; m11 = -100k)
    expect(r.base.runwayMonths).toBe(11);
    // pessimistic -80k/mo → 1_000_000/80_000 = 12.5 → month 13
    expect(r.pessimistic.runwayMonths).toBe(13);
    // runwayMonths must equal the forecast's shortfallMonthIndex
    expect(r.base.runwayMonths).toBe(r.base.forecast.shortfallMonthIndex);
  });

  it('reports null runway when no scenario runs out within the horizon', () => {
    const r = scenarioRunways(1_000_000, 50_000, 12)!;
    expect(r.optimistic.runwayMonths).toBeNull();
    expect(r.base.runwayMonths).toBeNull();
    expect(r.pessimistic.runwayMonths).toBeNull();
  });

  it('honors custom factors', () => {
    const r = scenarioRunways(500_000, -50_000, 12, {
      optimistic: 2,
      base: 1,
      pessimistic: 0.5,
    })!;
    expect(r.optimistic.monthlyNet).toBe(-100_000);
    expect(r.pessimistic.monthlyNet).toBe(-25_000);
  });

  it('falls back to default factors when a custom factor is non-finite', () => {
    const r = scenarioRunways(500_000, -50_000, 12, {
      optimistic: Number.NaN,
      base: Infinity,
      pessimistic: undefined,
    })!;
    expect(r.optimistic.factor).toBe(1.2);
    expect(r.base.factor).toBe(1);
    expect(r.pessimistic.factor).toBe(0.8);
  });

  it('returns null on non-finite opening balance or monthly net', () => {
    expect(scenarioRunways(Number.NaN, -100_000, 12)).toBeNull();
    expect(scenarioRunways(1_000_000, Infinity, 12)).toBeNull();
  });
});

describe('seasonalIndices', () => {
  it('computes multiplicative indices that average to ~1', () => {
    // period 2: even slots avg 200, odd slots avg 100 → overall mean 150
    const idx = seasonalIndices([200, 100, 200, 100], 2)!;
    expect(idx).toHaveLength(2);
    expect(idx[0]).toBeCloseTo(200 / 150);
    expect(idx[1]).toBeCloseTo(100 / 150);
    expect((idx[0]! + idx[1]!) / 2).toBeCloseTo(1);
  });

  it('uses 1 for slots with no observations', () => {
    // 3 points, period 4 → slot 3 unobserved
    const idx = seasonalIndices([100, 200, 300], 4)!;
    expect(idx).toHaveLength(4);
    expect(idx[3]).toBe(1);
  });

  it('ignores non-finite history values', () => {
    const idx = seasonalIndices([200, Number.NaN, 200, Infinity], 2)!;
    // only finite values [200, 200] remain → both slots equal mean → index 1
    expect(idx[0]).toBeCloseTo(1);
  });

  it('returns null on empty history', () => {
    expect(seasonalIndices([], 12)).toBeNull();
  });

  it('returns null on all-non-finite history', () => {
    expect(seasonalIndices([Number.NaN, Infinity], 12)).toBeNull();
  });

  it('returns null when period < 1', () => {
    expect(seasonalIndices([100, 200], 0)).toBeNull();
  });

  it('returns null when the overall mean is zero', () => {
    expect(seasonalIndices([100, -100], 2)).toBeNull();
  });

  it('floors a fractional period', () => {
    const idx = seasonalIndices([100, 200, 300, 400], 2.9)!;
    expect(idx).toHaveLength(2);
  });
});

describe('seasonalForecast', () => {
  it('applies seasonal indices cyclically to the monthly net', () => {
    // base net 100k, indices [1.5, 0.5] → months alternate 150k, 50k
    const f = seasonalForecast(0, 100_000, [1.5, 0.5], 4)!;
    expect(f.rows.map((r) => r.netCashflow)).toEqual([150_000, 50_000, 150_000, 50_000]);
    expect(f.rows.map((r) => r.balance)).toEqual([150_000, 200_000, 350_000, 400_000]);
  });

  it('reports the average seasonal net as monthlyNet', () => {
    const f = seasonalForecast(0, 100_000, [1.5, 0.5], 4)!;
    expect(f.monthlyNet).toBe(100_000); // (150+50+150+50)/4 = 100
  });

  it('falls back to flat forecast when indices is null', () => {
    const f = seasonalForecast(1_000_000, 100_000, null, 3)!;
    expect(f.rows.map((r) => r.balance)).toEqual([1_100_000, 1_200_000, 1_300_000]);
    expect(f.monthlyNet).toBe(100_000);
  });

  it('falls back to flat forecast when indices is empty', () => {
    const f = seasonalForecast(500_000, -50_000, [], 2)!;
    expect(f.rows.map((r) => r.netCashflow)).toEqual([-50_000, -50_000]);
  });

  it('treats non-finite index components as 1', () => {
    const f = seasonalForecast(0, 100_000, [Number.NaN, 2], 2)!;
    expect(f.rows[0]!.netCashflow).toBe(100_000); // NaN → 1
    expect(f.rows[1]!.netCashflow).toBe(200_000);
  });

  it('detects shortfall and tracks min balance under seasonal burn', () => {
    // opening 100k, base -100k, indices [2, 0.5] → -200k month1
    const f = seasonalForecast(100_000, -100_000, [2, 0.5], 2)!;
    expect(f.rows[0]!.balance).toBe(-100_000);
    expect(f.shortfallMonthIndex).toBe(1);
    expect(f.minBalance).toBe(-150_000); // m2: -100k - 50k
  });

  it('returns opening-balance-only state at horizon 0', () => {
    const f = seasonalForecast(500_000, -100_000, [1.5, 0.5], 0)!;
    expect(f.rows).toHaveLength(0);
    expect(f.monthlyNet).toBe(-100_000); // falls back to base when horizon 0
    expect(f.minBalance).toBe(500_000);
    expect(f.shortfallMonthIndex).toBeNull();
  });

  it('clamps the horizon to [0, 60]', () => {
    expect(seasonalForecast(0, 1, [1], -3)!.rows).toHaveLength(0);
    expect(seasonalForecast(0, 1, [1], 999)!.rows).toHaveLength(60);
  });

  it('returns null on non-finite opening or net', () => {
    expect(seasonalForecast(Number.NaN, 1, [1], 3)).toBeNull();
    expect(seasonalForecast(0, Infinity, [1], 3)).toBeNull();
  });
});

describe('fundingNeed', () => {
  it('computes the worst deficit below the target buffer', () => {
    // opening 250k, -100k/mo, 4mo: 150,50,-50,-150; target 100k
    const f = forecastCashBalance(250_000, -100_000, 4);
    const need = fundingNeed(f, 100_000)!;
    // deficits vs 100k: -50, 50, 150, 250 → worst 250k
    expect(need.shortfallAmount).toBe(250_000);
    // first month balance < 100k is month 2 (50k)
    expect(need.fundingMonthIndex).toBe(2);
    expect(need.sufficient).toBe(false);
    expect(need.targetBalance).toBe(100_000);
  });

  it('reports no funding need when the buffer is always met', () => {
    const f = forecastCashBalance(1_000_000, 100_000, 6);
    const need = fundingNeed(f, 0)!;
    expect(need.shortfallAmount).toBe(0);
    expect(need.fundingMonthIndex).toBeNull();
    expect(need.sufficient).toBe(true);
  });

  it('defaults the target balance to zero', () => {
    const f = forecastCashBalance(150_000, -100_000, 2); // 50k, -50k
    const need = fundingNeed(f)!;
    expect(need.targetBalance).toBe(0);
    expect(need.shortfallAmount).toBe(50_000);
    expect(need.fundingMonthIndex).toBe(2);
  });

  it('returns null when the forecast has no rows', () => {
    const f = forecastCashBalance(100_000, -50_000, 0);
    expect(fundingNeed(f, 0)).toBeNull();
  });

  it('returns null on a non-finite target balance', () => {
    const f = forecastCashBalance(100_000, -50_000, 3);
    expect(fundingNeed(f, Number.NaN)).toBeNull();
  });

  it('marks the first dip month even if a later month recovers', () => {
    // opening 100k, custom: dip then recover is impossible with flat net, so use seasonal
    const f = seasonalForecast(100_000, -50_000, [2, -1], 4)!;
    // nets: -100k, +50k, -100k, +50k → balances: 0, 50k, -50k, 0
    const need = fundingNeed(f, 10_000)!;
    // first balance < 10k is month 1 (0)
    expect(need.fundingMonthIndex).toBe(1);
    // worst deficit vs 10k = 10 - (-50) = 60k
    expect(need.shortfallAmount).toBe(60_000);
  });
});

describe('cashflowSensitivity', () => {
  it('always includes a zero/zero baseline matching the flat forecast', () => {
    const s = cashflowSensitivity(250_000, -100_000, 6)!;
    expect(s.baseline.revenueDelta).toBe(0);
    expect(s.baseline.collectionLagMonths).toBe(0);
    expect(s.baseline.shortfallMonthIndex).toBe(3); // matches forecastCashBalance(250k,-100k)
    expect(s.baseline.minBalance).toBeLessThan(0);
  });

  it('scales monthly net by the revenue delta', () => {
    // delta -0.5 → net halved; opening 600k, base -100k → -50k under -0.5
    const s = cashflowSensitivity(600_000, -100_000, 12, [-0.5], [0])!;
    const c = s.cases.find((x) => x.revenueDelta === -0.5)!;
    // -50k/mo from 600k → never negative within 12 (600/50 = 12, m12 ends 0, not <0)
    expect(c.shortfallMonthIndex).toBeNull();
    expect(c.minBalance).toBe(0);
  });

  it('delays inflows by the collection lag, deferring shortfall', () => {
    // opening 250k, -100k/mo, lag 2 → months 1,2 net 0, then burn
    const s = cashflowSensitivity(250_000, -100_000, 8, [0], [2])!;
    const c = s.cases.find((x) => x.collectionLagMonths === 2)!;
    // m1,2: 250k; m3:150; m4:50; m5:-50 → shortfall month 5
    expect(c.shortfallMonthIndex).toBe(5);
  });

  it('produces the cartesian product of deltas and lags, de-duplicated', () => {
    const s = cashflowSensitivity(1_000_000, -100_000, 12, [-0.1, 0, 0.1], [0, 1])!;
    expect(s.cases).toHaveLength(6); // 3 deltas × 2 lags
  });

  it('de-duplicates repeated delta/lag pairs', () => {
    const s = cashflowSensitivity(1_000_000, -100_000, 12, [0, 0], [0, 0])!;
    expect(s.cases).toHaveLength(1);
  });

  it('drops non-finite deltas and negative/non-finite lags', () => {
    const s = cashflowSensitivity(1_000_000, -100_000, 12, [0, Number.NaN], [0, -1, Infinity])!;
    expect(s.cases).toHaveLength(1); // only delta 0 × lag 0
  });

  it('supplies a default delta/lag of 0 when both arrays are empty', () => {
    const s = cashflowSensitivity(250_000, -100_000, 6, [], [])!;
    expect(s.cases).toHaveLength(1);
    expect(s.cases[0]!.revenueDelta).toBe(0);
    expect(s.cases[0]!.collectionLagMonths).toBe(0);
  });

  it('floors a fractional lag', () => {
    const s = cashflowSensitivity(250_000, -100_000, 8, [0], [2.9])!;
    expect(s.cases[0]!.collectionLagMonths).toBe(2);
  });

  it('clamps the horizon and floors it', () => {
    const s = cashflowSensitivity(100, 10, 3.9, [0], [0])!;
    // horizon 3 → no shortfall while growing
    expect(s.baseline.shortfallMonthIndex).toBeNull();
    const big = cashflowSensitivity(100, -10, 999, [0], [0])!;
    expect(big.baseline.shortfallMonthIndex).toBe(11); // 100/10=10; m11 negative
  });

  it('returns null on non-finite opening or net', () => {
    expect(cashflowSensitivity(Number.NaN, -100_000, 6)).toBeNull();
    expect(cashflowSensitivity(250_000, Infinity, 6)).toBeNull();
  });

  it('treats a lag at or beyond the horizon as never receiving inflows', () => {
    // lag 6 with horizon 6 → all months net 0 → balance flat at opening
    const s = cashflowSensitivity(250_000, -100_000, 6, [0], [6])!;
    const c = s.cases[0]!;
    expect(c.shortfallMonthIndex).toBeNull();
    expect(c.minBalance).toBe(250_000);
  });
});

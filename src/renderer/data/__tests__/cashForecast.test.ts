import { describe, expect, it } from 'vitest';
import { forecastCashBalance, cashForecastTrajectory } from '../cashForecast';

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

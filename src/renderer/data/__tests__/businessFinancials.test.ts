import { describe, expect, it } from 'vitest';
import { deriveBusinessFinancials } from '../businessFinancials';
import { computeFinancialRatios } from '../financialRatios';

const KPI = { revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 };

describe('deriveBusinessFinancials', () => {
  it('annualizes the PL (×12)', () => {
    const f = deriveBusinessFinancials(KPI);
    expect(f.revenue).toBe(12_000_000);
    expect(f.cogs).toBe(4_800_000);
    expect(f.operatingProfit).toBe(2_400_000);
  });

  it('balances the BS (equity + currentLiab + fixedLiab = totalAssets)', () => {
    const f = deriveBusinessFinancials(KPI);
    expect(f.equity + f.currentLiabilities + f.fixedLiabilities).toBe(f.totalAssets);
  });

  it('is deterministic', () => {
    expect(deriveBusinessFinancials(KPI)).toEqual(deriveBusinessFinancials(KPI));
  });

  it('varies equity ratio with profitability (higher margin → thicker equity)', () => {
    const lowMargin = deriveBusinessFinancials({ ...KPI, profitMargin: 2 });
    const highMargin = deriveBusinessFinancials({ ...KPI, profitMargin: 30 });
    const eqLow = lowMargin.equity / lowMargin.totalAssets;
    const eqHigh = highMargin.equity / highMargin.totalAssets;
    expect(eqHigh).toBeGreaterThan(eqLow);
  });

  it('clamps equity ratio into a sane band (15%–65%)', () => {
    const extreme = deriveBusinessFinancials({ ...KPI, profitMargin: 999 });
    expect(extreme.equity / extreme.totalAssets).toBeLessThanOrEqual(0.65);
    const loss = deriveBusinessFinancials({ ...KPI, profitMargin: -999 });
    expect(loss.equity / loss.totalAssets).toBeGreaterThanOrEqual(0.15);
  });

  it('feeds computeFinancialRatios to produce finite ratios', () => {
    const r = computeFinancialRatios(deriveBusinessFinancials(KPI));
    expect(r.equityRatioPct).not.toBeNull();
    expect(r.operatingMarginPct).toBe(20); // 2.4M / 12M
    expect(r.roePct).not.toBeNull();
    expect(r.receivablesTurnover).not.toBeNull();
  });
});

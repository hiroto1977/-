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

  it('golden: pins every derived BS/PL constant for the worked KPI', () => {
    expect(deriveBusinessFinancials(KPI)).toEqual({
      revenue: 12_000_000, cogs: 4_800_000, operatingProfit: 2_400_000,
      ordinaryProfit: 2_355_840, netProfit: 1_649_088,
      depreciation: 360_000, // 売上3%
      laborCost: 1_800_000, // 固定費×12×0.5
      interestExpense: 44_160, // 有利子負債×2%
      totalAssets: 9_600_000, // 売上×0.8
      equity: 4_800_000, // 自己資本比率 0.5 (0.3 + 20/100)
      currentAssets: 5_280_000, // 0.55
      currentLiabilities: 2_880_000, // 0.3
      fixedAssets: 4_320_000, // 残り
      fixedLiabilities: 1_920_000, // 残り
      accountsReceivable: 1_500_000, // 1.5ヶ月
      inventory: 400_000, // 1ヶ月 (原価)
      accountsPayable: 480_000, // 1.2ヶ月 (原価)
      interestBearingDebt: 2_208_000, // 固定負債0.7 + 流動負債0.3
    });
  });

  it('feeds computeFinancialRatios to produce finite ratios', () => {
    const r = computeFinancialRatios(deriveBusinessFinancials(KPI));
    expect(r.equityRatioPct).not.toBeNull();
    expect(r.operatingMarginPct).toBe(20); // 2.4M / 12M
    expect(r.roePct).not.toBeNull();
    expect(r.receivablesTurnover).not.toBeNull();
  });
});

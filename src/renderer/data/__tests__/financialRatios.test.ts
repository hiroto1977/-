import { describe, expect, it } from 'vitest';
import { computeFinancialRatios, radarAxes, type FinancialInputs } from '../financialRatios';

const SAMPLE: FinancialInputs = {
  revenue: 12_000,
  cogs: 6_000,
  operatingProfit: 1_200,
  ordinaryProfit: 1_100,
  netProfit: 800,
  depreciation: 300,
  laborCost: 3_000,
  totalAssets: 10_000,
  equity: 4_000,
  currentAssets: 5_000,
  currentLiabilities: 2_500,
  fixedAssets: 5_000,
  fixedLiabilities: 3_000,
  accountsReceivable: 2_000,
  inventory: 1_000,
  accountsPayable: 1_500,
  interestBearingDebt: 4_000,
};

describe('computeFinancialRatios — worked example', () => {
  const r = computeFinancialRatios(SAMPLE);
  it('balance-sheet ratios', () => {
    expect(r.equityRatioPct).toBe(40); // 4000/10000
    expect(r.currentRatioPct).toBe(200); // 5000/2500
    expect(r.fixedLongTermFitPct).toBe(71.4); // 5000/7000
  });
  it('debt metrics', () => {
    expect(r.debtToMonthlySalesRatio).toBe(4); // 4000/(12000/12)
    expect(r.debtRepaymentYears).toBe(2.67); // 4000/(1200+300)
  });
  it('profitability margins', () => {
    expect(r.operatingMarginPct).toBe(10);
    expect(r.ordinaryMarginPct).toBe(9.2);
    expect(r.netProfit).toBe(800);
    expect(r.netMarginPct).toBe(6.7);
    expect(r.ebitda).toBe(1_500);
    expect(r.ebitdaMarginPct).toBe(12.5);
  });
  it('labor share over value-added', () => {
    expect(r.laborSharePct).toBe(66.7); // 3000/(1200+3000+300)
  });
  it('turnover + CCC', () => {
    expect(r.receivablesTurnover).toBe(6);
    expect(r.inventoryTurnover).toBe(6);
    expect(r.cccDays).toBe(30.4); // 60.83 + 60.83 - 91.25
  });
  it('returns on assets / equity', () => {
    expect(r.roaPct).toBe(8);
    expect(r.roePct).toBe(20);
  });
});

describe('computeFinancialRatios — null guards (zero denominators)', () => {
  const zero: FinancialInputs = {
    revenue: 0, cogs: 0, operatingProfit: 0, ordinaryProfit: 0, netProfit: 0,
    depreciation: 0, laborCost: 0, totalAssets: 0, equity: 0, currentAssets: 0,
    currentLiabilities: 0, fixedAssets: 0, fixedLiabilities: 0,
    accountsReceivable: 0, inventory: 0, accountsPayable: 0, interestBearingDebt: 0,
  };
  const r = computeFinancialRatios(zero);
  it('does not divide by zero', () => {
    expect(r.equityRatioPct).toBeNull();
    expect(r.currentRatioPct).toBeNull();
    expect(r.debtToMonthlySalesRatio).toBeNull();
    expect(r.debtRepaymentYears).toBeNull();
    expect(r.receivablesTurnover).toBeNull();
    expect(r.inventoryTurnover).toBeNull();
    expect(r.cccDays).toBeNull();
    expect(r.roaPct).toBeNull();
    expect(r.roePct).toBeNull();
    expect(r.laborSharePct).toBeNull();
  });
});

describe('computeFinancialRatios — operatingCashflow override', () => {
  it('uses provided operating CF for debt repayment years', () => {
    const r = computeFinancialRatios({ ...SAMPLE, operatingCashflow: 2_000 });
    expect(r.debtRepaymentYears).toBe(2); // 4000/2000
  });
});

describe('radarAxes', () => {
  const axes = radarAxes(computeFinancialRatios(SAMPLE));
  it('produces 15 axes with 0-100 scores', () => {
    expect(axes).toHaveLength(15);
    for (const a of axes) {
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(100);
      expect(typeof a.label).toBe('string');
    }
  });
  it('scores a healthy equity ratio (40%) at the top of its band', () => {
    const eq = axes.find((a) => a.key === 'equityRatio')!;
    expect(eq.raw).toBe(40);
    expect(eq.score).toBe(80); // linScore(40, bad=0, good=50) = 80
  });
  it('golden: scores every axis against its health benchmark', () => {
    const byKey = Object.fromEntries(axes.map((a) => [a.key, a.score]));
    expect(byKey).toEqual({
      equityRatio: 80, currentRatio: 100, fixedLongTermFit: 100, debtToMonthlySales: 40,
      debtRepaymentYears: 100, operatingMargin: 60, ordinaryMargin: 57, netMargin: 59,
      laborShare: 33, ebitdaMargin: 50, receivablesTurnover: 10, inventoryTurnover: 10,
      ccc: 66, roa: 80, roe: 100,
    });
  });
  it('treats null raw as score 0', () => {
    const zeroAxes = radarAxes(
      computeFinancialRatios({ ...SAMPLE, totalAssets: 0, equity: 0 }),
    );
    expect(zeroAxes.find((a) => a.key === 'roe')!.score).toBe(0);
  });
});

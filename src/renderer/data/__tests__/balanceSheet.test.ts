import { describe, expect, it } from 'vitest';
import { parseBalanceSheet, computeBalanceSheetMetrics } from '../balanceSheet';

describe('parseBalanceSheet', () => {
  it('coerces string inputs and allows a negative net income (loss)', () => {
    const bs = parseBalanceSheet({
      asOf: ' 2026-03-31 ',
      currentAssets: '5000',
      inventory: '1000',
      fixedAssets: '5000',
      currentLiabilities: '2000',
      fixedLiabilities: '3000',
      netIncome: '-500',
    });
    expect(bs.asOf).toBe('2026-03-31');
    expect(bs.currentAssets).toBe(5000);
    expect(bs.netIncome).toBe(-500);
  });

  const REQUIRED = { currentAssets: 100, fixedAssets: 0, currentLiabilities: 0, fixedLiabilities: 0, netIncome: 0 };

  it('rejects negative asset/liability figures', () => {
    expect(() => parseBalanceSheet({ ...REQUIRED, currentAssets: -1 })).toThrow(/流動資産/);
  });

  it('rejects inventory larger than current assets', () => {
    expect(() => parseBalanceSheet({ ...REQUIRED, currentAssets: 100, inventory: 200 })).toThrow(/棚卸資産/);
  });

  it('rejects accounts payable larger than current liabilities', () => {
    expect(() => parseBalanceSheet({ ...REQUIRED, currentLiabilities: 100, accountsPayable: 200 })).toThrow(/仕入債務/);
  });

  it('treats a blank net income and blank optional items as zero', () => {
    const bs = parseBalanceSheet({ ...REQUIRED, netIncome: '' });
    expect(bs.netIncome).toBe(0);
    expect(bs.inventory).toBe(0);
    expect(bs.accountsReceivable).toBe(0);
    expect(bs.accountsPayable).toBe(0);
  });
});

describe('computeBalanceSheetMetrics', () => {
  const bs = {
    asOf: '2026-03-31',
    currentAssets: 6000,
    inventory: 2000,
    accountsReceivable: 1500,
    fixedAssets: 4000,
    currentLiabilities: 3000,
    accountsPayable: 1000,
    fixedLiabilities: 2000,
    netIncome: 1000,
  };

  it('derives totals, equity and the standard ratios', () => {
    const m = computeBalanceSheetMetrics(bs);
    expect(m.totalAssets).toBe(10000);
    expect(m.totalLiabilities).toBe(5000);
    expect(m.netAssets).toBe(5000);
    expect(m.equityRatioPct).toBe(50); // 5000/10000
    expect(m.currentRatioPct).toBe(200); // 6000/3000
    expect(m.quickRatioPct).toBeCloseTo(133.3); // (6000-2000)/3000
    expect(m.roaPct).toBe(10); // 1000/10000
    expect(m.roePct).toBe(20); // 1000/5000
    expect(m.fixedRatioPct).toBe(80); // 4000/5000
    expect(m.insolvent).toBe(false);
  });

  it('flags insolvency and nulls ROE / fixed ratio when net assets are negative', () => {
    const m = computeBalanceSheetMetrics({
      ...bs,
      currentLiabilities: 8000,
      fixedLiabilities: 5000, // liabilities 13000 > assets 10000 → netAssets -3000
    });
    expect(m.netAssets).toBe(-3000);
    expect(m.insolvent).toBe(true);
    expect(m.equityRatioPct).toBe(-30);
    expect(m.roePct).toBeNull();
    expect(m.fixedRatioPct).toBeNull();
  });

  it('nulls ratios whose denominator is zero', () => {
    const m = computeBalanceSheetMetrics({
      asOf: '', currentAssets: 0, inventory: 0, accountsReceivable: 0, fixedAssets: 0,
      currentLiabilities: 0, accountsPayable: 0, fixedLiabilities: 0, netIncome: 0,
    });
    expect(m.equityRatioPct).toBeNull(); // total assets 0
    expect(m.currentRatioPct).toBeNull(); // current liabilities 0
    expect(m.roaPct).toBeNull();
  });
});

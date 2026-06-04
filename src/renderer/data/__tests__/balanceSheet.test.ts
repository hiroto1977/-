import { describe, expect, it } from 'vitest';
import { parseBalanceSheet, computeBalanceSheetMetrics, BALANCE_SHEET_COLLECTION } from '../balanceSheet';

const VALID = { currentAssets: 100, currentLiabilities: 100, fixedAssets: 0, fixedLiabilities: 0, netIncome: 0 };

describe('parseBalanceSheet — validation messages & boundaries', () => {
  it('exposes the balance-sheet collection key', () => {
    expect(BALANCE_SHEET_COLLECTION).toBe('balance-sheet');
  });

  it('defaults asOf to "" when not a string', () => {
    expect(parseBalanceSheet({ ...VALID, asOf: 123 }).asOf).toBe('');
  });

  it('rejects each negative figure with the exact field label', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ currentAssets: -1 }, '流動資産は 0 以上の数値で入力してください'],
      [{ cash: -1 }, '現預金は 0 以上の数値で入力してください'],
      [{ inventory: -1 }, '棚卸資産は 0 以上の数値で入力してください'],
      [{ accountsReceivable: -1 }, '売上債権は 0 以上の数値で入力してください'],
      [{ currentLiabilities: -1 }, '流動負債は 0 以上の数値で入力してください'],
      [{ accountsPayable: -1 }, '仕入債務は 0 以上の数値で入力してください'],
      [{ fixedAssets: -1 }, '固定資産は 0 以上の数値で入力してください'],
      [{ fixedLiabilities: -1 }, '固定負債は 0 以上の数値で入力してください'],
    ];
    for (const [patch, msg] of cases) {
      expect(() => parseBalanceSheet({ ...VALID, ...patch })).toThrow(msg);
    }
  });

  it('rejects a non-numeric required figure (NaN) and a non-numeric net income', () => {
    expect(() => parseBalanceSheet({ ...VALID, currentAssets: 'abc' })).toThrow('流動資産は 0 以上の数値で入力してください');
    expect(() => parseBalanceSheet({ ...VALID, netIncome: 'abc' })).toThrow('当期純利益は数値で入力してください');
  });

  it('treats an omitted net income (undefined) as 0', () => {
    const { netIncome: _omit, ...noNet } = VALID;
    expect(parseBalanceSheet(noNet).netIncome).toBe(0);
  });

  it('allows a component equal to its cap but rejects exceeding it (strict >)', () => {
    // 上限ちょうどは許容 (> は厳密)。超過は専用メッセージで reject。
    expect(() => parseBalanceSheet({ ...VALID, currentAssets: 100, cash: 100 })).not.toThrow();
    expect(() => parseBalanceSheet({ ...VALID, currentAssets: 100, inventory: 100 })).not.toThrow();
    expect(() => parseBalanceSheet({ ...VALID, currentAssets: 100, accountsReceivable: 100 })).not.toThrow();
    expect(() => parseBalanceSheet({ ...VALID, currentLiabilities: 100, accountsPayable: 100 })).not.toThrow();
    expect(() => parseBalanceSheet({ ...VALID, currentAssets: 100, cash: 101 })).toThrow('現預金は流動資産以下で入力してください');
    expect(() => parseBalanceSheet({ ...VALID, currentAssets: 100, inventory: 101 })).toThrow('棚卸資産は流動資産以下で入力してください');
    expect(() => parseBalanceSheet({ ...VALID, currentAssets: 100, accountsReceivable: 101 })).toThrow('売上債権は流動資産以下で入力してください');
    expect(() => parseBalanceSheet({ ...VALID, currentLiabilities: 100, accountsPayable: 101 })).toThrow('仕入債務は流動負債以下で入力してください');
  });
});

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

  it('treats exactly zero net assets as not insolvent and nulls ROE / fixed ratio (> strict)', () => {
    // totalAssets===totalLiabilities → netAssets 0。> 0 を >=0 / 常に true にする mutant
    // (roePct/fixedRatioPct が非nullになる) と < 0 を <= 0 にする mutant (insolvent) を kill。
    const m = computeBalanceSheetMetrics({
      asOf: '', currentAssets: 100, inventory: 0, accountsReceivable: 0, fixedAssets: 0,
      currentLiabilities: 100, accountsPayable: 0, fixedLiabilities: 0, netIncome: 50,
    });
    expect(m.netAssets).toBe(0);
    expect(m.insolvent).toBe(false);
    expect(m.roePct).toBeNull();
    expect(m.fixedRatioPct).toBeNull();
  });
});

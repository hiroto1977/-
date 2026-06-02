import { describe, expect, it } from 'vitest';
import { buildIncomeStatement, buildBalanceSheet, buildCashflowStatement } from '../financialStatements';
import { deriveBusinessFinancials } from '../businessFinancials';
import type { FinancialInputs } from '../financialRatios';

const F: FinancialInputs = {
  revenue: 12_000, cogs: 6_000, operatingProfit: 1_200, ordinaryProfit: 1_100, netProfit: 800,
  depreciation: 300, laborCost: 3_000, interestExpense: 100,
  totalAssets: 10_000, equity: 4_000, currentAssets: 5_000, currentLiabilities: 2_500,
  fixedAssets: 5_000, fixedLiabilities: 3_500, accountsReceivable: 2_000, inventory: 1_000,
  accountsPayable: 1_500, interestBearingDebt: 4_000,
};

function amt(lines: { label: string; amount: number | null }[], label: string): number | null {
  return lines.find((l) => l.label === label)?.amount ?? null;
}

describe('buildIncomeStatement', () => {
  const pl = buildIncomeStatement(F);
  it('computes the PL waterfall', () => {
    expect(amt(pl, '売上高')).toBe(12_000);
    expect(amt(pl, '売上総利益')).toBe(6_000); // 12000-6000
    expect(amt(pl, '販売費及び一般管理費')).toBe(4_800); // grossProfit - operatingProfit
    expect(amt(pl, '営業利益')).toBe(1_200);
    expect(amt(pl, '経常利益')).toBe(1_100);
    expect(amt(pl, '法人税等')).toBe(300); // 1100-800
    expect(amt(pl, '当期純利益')).toBe(800);
  });
});

describe('buildBalanceSheet', () => {
  const { assets, liabilitiesEquity } = buildBalanceSheet(F);
  it('asset side totals to totalAssets', () => {
    expect(amt(assets, '資産合計')).toBe(10_000);
    expect(amt(assets, '現預金')).toBe(2_000); // 5000 - 2000 - 1000
  });
  it('liabilities + equity balances to total assets', () => {
    expect(amt(liabilitiesEquity, '負債・純資産合計')).toBe(10_000);
    expect(amt(liabilitiesEquity, '純資産（自己資本）')).toBe(4_000);
  });
});

describe('buildCashflowStatement', () => {
  it('uses simplified indirect operating CF and FCF', () => {
    const cf = buildCashflowStatement(F);
    expect(amt(cf, '営業活動によるキャッシュフロー')).toBe(1_100); // netProfit 800 + dep 300
    expect(amt(cf, '投資活動によるキャッシュフロー')).toBe(-300);
    expect(amt(cf, 'フリーキャッシュフロー（営業+投資）')).toBe(800);
  });
  it('honors an explicit operatingCashflow', () => {
    const cf = buildCashflowStatement({ ...F, operatingCashflow: 2_000 });
    expect(amt(cf, '営業活動によるキャッシュフロー')).toBe(2_000);
  });
});

describe('integration with deriveBusinessFinancials', () => {
  it('BS built from a derived business balances', () => {
    const f = deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 });
    const { assets, liabilitiesEquity } = buildBalanceSheet(f);
    expect(amt(assets, '資産合計')).toBe(amt(liabilitiesEquity, '負債・純資産合計'));
  });
});

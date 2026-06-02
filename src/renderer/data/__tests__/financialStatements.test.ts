import { describe, expect, it } from 'vitest';
import {
  buildIncomeStatement, buildBalanceSheet, buildCashflowStatement,
  buildVariableCostingStatement, buildComprehensiveIncome, buildEquityChangeStatement, sumFinancialInputs,
  buildQuarterlyStatement, buildNotesStatement, buildSupplementarySchedule, buildAccountBreakdown,
} from '../financialStatements';
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


describe('buildVariableCostingStatement', () => {
  it('computes contribution, fixed cost and BEP', () => {
    const v = buildVariableCostingStatement(F);
    expect(amt(v, '限界利益')).toBe(6_000); // 12000-6000
    expect(amt(v, '固定費')).toBe(4_800); // 6000-1200
    // BEP = fixedCost / contributionRatio = 4800 / 0.5 = 9600
    expect(amt(v, '損益分岐点売上高')).toBe(9_600);
    expect(v.find((l) => l.label === '限界利益率')?.display).toBe('50.0%');
  });
});

describe('buildComprehensiveIncome', () => {
  it('comprehensive income = net profit when OCI is 0', () => {
    const ci = buildComprehensiveIncome(F);
    expect(amt(ci, '当期純利益')).toBe(800);
    expect(amt(ci, '包括利益')).toBe(800);
  });
});

describe('buildEquityChangeStatement', () => {
  it('rolls equity: beginning + netProfit − dividend = ending', () => {
    const s = buildEquityChangeStatement(F, 0.25);
    const beg = amt(s, '当期首 純資産残高')!;
    const end = amt(s, '当期末 純資産残高')!;
    const div = amt(s, '剰余金の配当')!; // negative
    expect(end).toBe(4_000);
    expect(beg + 800 + div).toBe(end);
    expect(div).toBe(-200); // 800 * 0.25
  });
});

describe('buildQuarterlyStatement', () => {
  it('aggregates monthly history into quarters and a full-year total', () => {
    const history = Array.from({ length: 12 }, () => ({ revenue: 100, profit: 10 }));
    const q = buildQuarterlyStatement(history);
    // 4 四半期 → 各四半期 売上 300 / 利益 30
    expect(amt(q, '第1四半期 (3ヶ月)')).toBe(null);
    expect(q.filter((l) => l.label === '売上高').every((l) => l.amount === 300)).toBe(true);
    expect(amt(q, '通期 売上高')).toBe(1_200);
    expect(amt(q, '通期 利益')).toBe(120);
    expect(q.find((l) => l.label === '通期 利益率')?.display).toBe('10.0%');
  });
  it('handles empty history', () => {
    expect(buildQuarterlyStatement([])[0]?.label).toBe('履歴データがありません');
  });
});

describe('buildNotesStatement', () => {
  it('exposes accounting policy notes and balance-sheet figures', () => {
    const n = buildNotesStatement(F);
    expect(n.find((l) => l.label === '固定資産の減価償却の方法')?.display).toBe('定額法（概算）');
    expect(amt(n, '有利子負債の額')).toBe(4_000);
    expect(amt(n, '販管費に含まれる人件費')).toBe(3_000);
  });
});

describe('buildSupplementarySchedule', () => {
  it('breaks debt into short/long term summing to interest-bearing debt', () => {
    const s = buildSupplementarySchedule(F);
    const short = amt(s, '短期借入金')!; // 2500 * 0.3 = 750
    const long = amt(s, '長期借入金')!; // 4000 - 750 = 3250
    expect(short).toBe(750);
    expect(long).toBe(3_250);
    expect(amt(s, '有利子負債 合計')).toBe(4_000);
    expect(amt(s, '有形固定資産（期末残高）')).toBe(5_000);
  });
});

describe('buildAccountBreakdown', () => {
  it('lists major account balances', () => {
    const b = buildAccountBreakdown(F);
    expect(amt(b, '現預金（概算）')).toBe(2_000); // 5000 - 2000 - 1000
    expect(amt(b, '売掛金 期末残高')).toBe(2_000);
    expect(amt(b, '買掛金 期末残高')).toBe(1_500);
    expect(amt(b, '短期借入金')).toBe(750);
  });
});

describe('sumFinancialInputs (連結)', () => {
  it('sums every field across entities', () => {
    const a = deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 });
    const b = deriveBusinessFinancials({ revenue: 500_000, variableCost: 250_000, fixedCost: 150_000, profit: 50_000, profitMargin: 10 });
    const sum = sumFinancialInputs([a, b]);
    expect(sum.revenue).toBe(a.revenue + b.revenue);
    expect(sum.totalAssets).toBe(a.totalAssets + b.totalAssets);
    // 連結 BS も均衡する (各社が均衡しているため)。
    const { assets, liabilitiesEquity } = buildBalanceSheet(sum);
    expect(amt(assets, '資産合計')).toBe(amt(liabilitiesEquity, '負債・純資産合計'));
  });
});

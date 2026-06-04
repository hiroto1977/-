import { describe, expect, it } from 'vitest';
import { summarizeAccounting, computeRunwayMonths, type AccountingMonthly } from '../accounting';

const m = (month: string, income: number, expense: number): AccountingMonthly => ({
  month, income, expense, net: income - expense,
});

describe('summarizeAccounting', () => {
  it('returns null for no months (not connected)', () => {
    expect(summarizeAccounting([])).toBeNull();
  });

  it('totals income/expense/net, averages, and exposes the latest month', () => {
    const s = summarizeAccounting([
      m('2026-03', 1_000_000, 800_000), // net +200,000
      m('2026-04', 900_000, 1_100_000), // net -200,000
      m('2026-05', 1_000_000, 700_000), // net +300,000
    ])!;
    expect(s.months).toBe(3);
    expect(s.totalIncome).toBe(2_900_000);
    expect(s.totalExpense).toBe(2_600_000);
    expect(s.totalNet).toBe(300_000);
    expect(s.avgMonthlyNet).toBe(100_000); // 300,000 / 3
    expect(s.latestMonth).toBe('2026-05');
    expect(s.latestNet).toBe(300_000);
    expect(s.cashflowPositive).toBe(true);
  });

  it('flags negative cumulative cashflow', () => {
    const s = summarizeAccounting([m('2026-04', 100, 300)])!;
    expect(s.totalNet).toBe(-200);
    expect(s.cashflowPositive).toBe(false);
  });
});

describe('computeRunwayMonths', () => {
  it('returns null when cashflow is not net-negative (no burn)', () => {
    expect(computeRunwayMonths(1_000_000, 50_000)).toBeNull();
    expect(computeRunwayMonths(1_000_000, 0)).toBeNull();
  });

  it('divides cash by the monthly burn rate', () => {
    // 3,000,000 cash, burning 500,000/month → 6 months
    expect(computeRunwayMonths(3_000_000, -500_000)).toBe(6);
  });

  it('rounds to one decimal place', () => {
    // 1,000,000 / 300,000 = 3.33… → 3.3
    expect(computeRunwayMonths(1_000_000, -300_000)).toBe(3.3);
  });

  it('returns 0 when there is no cash while burning', () => {
    expect(computeRunwayMonths(0, -100_000)).toBe(0);
    // 現金が負でも 0 (早期 return)。計算経路だと負値になるため ConditionalExpression を kill。
    expect(computeRunwayMonths(-500_000, -100_000)).toBe(0);
  });

  it('treats a break-even cumulative net (0) as cashflow-positive (>= 0)', () => {
    // totalNet===0 → cashflowPositive=true。>= を > にする mutant を kill。
    const s = summarizeAccounting([m('2026-04', 200, 200)])!;
    expect(s.totalNet).toBe(0);
    expect(s.cashflowPositive).toBe(true);
  });
});

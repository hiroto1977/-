import { describe, expect, it } from 'vitest';
import { combineCashflowDebtService } from '../cashflowDebtService';
import type { AccountingMonthly } from '../accounting';

const cf = (month: string, net: number): AccountingMonthly => ({ month, income: net, expense: 0, net });

describe('combineCashflowDebtService', () => {
  it('returns null when either side is empty', () => {
    expect(combineCashflowDebtService([], [{ month: '2026-04', repayment: 100 }])).toBeNull();
    expect(combineCashflowDebtService([cf('2026-04', 100)], [])).toBeNull();
  });

  it('returns null when there are no months with repayment', () => {
    expect(combineCashflowDebtService([cf('2026-04', 100)], [{ month: '2026-04', repayment: 0 }])).toBeNull();
  });

  it('joins cashflow and repayment by month and computes per-month + overall DSCR', () => {
    const r = combineCashflowDebtService(
      [cf('2026-04', 300_000), cf('2026-05', 150_000)],
      [{ month: '2026-04', repayment: 200_000 }, { month: '2026-05', repayment: 200_000 }],
    )!;
    expect(r.coveredMonths).toBe(2);
    expect(r.months[0]).toEqual({ month: '2026-04', operatingCashflow: 300_000, repayment: 200_000, dscr: 1.5 });
    expect(r.months[1]!.dscr).toBe(0.75); // 150,000 / 200,000
    expect(r.overallDscr).toBe(1.13); // 450,000 / 400,000 = 1.125 → 1.13
    expect(r.worstMonthDscr).toBe(0.75);
    expect(r.shortfallMonths).toBe(1); // the 0.75 month is < 1.0
  });

  it('treats a repayment month with no matching cashflow as 0 CF (DSCR 0)', () => {
    const r = combineCashflowDebtService(
      [cf('2026-04', 300_000)],
      [{ month: '2026-05', repayment: 100_000 }], // no CF for 2026-05
    )!;
    expect(r.months[0]).toEqual({ month: '2026-05', operatingCashflow: 0, repayment: 100_000, dscr: 0 });
    expect(r.shortfallMonths).toBe(1);
  });

  it('ignores months without repayment when computing the overall ratio', () => {
    const r = combineCashflowDebtService(
      [cf('2026-03', 999_999), cf('2026-04', 400_000)],
      [{ month: '2026-03', repayment: 0 }, { month: '2026-04', repayment: 200_000 }],
    )!;
    // only 2026-04 counts → 400,000 / 200,000 = 2.0
    expect(r.coveredMonths).toBe(1);
    expect(r.overallDscr).toBe(2);
  });
});

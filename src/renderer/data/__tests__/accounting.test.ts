import { describe, expect, it } from 'vitest';
import { summarizeAccounting, computeRunwayMonths, type AccountingMonthly , accountingRecency } from '../accounting';

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

/**
 * **現預金の基準日と会計連携の最新月の隔たり。** (2026-09-07)
 *
 * 資金ランウェイは `現預金 (基準日時点) ÷ 月次平均営業CF (会計の窓)` で両辺の出所が違う。
 * パス 35 の基準日の検査は KPI 実績としか突き合わせないので、KPI を最新に保ったまま
 * 会計連携が何年も止まっている控えでは何も鳴らず、「今年の現預金 ÷ 何年も前の資金流出」を
 * critical の所見と金融機関等提出用の書面が断言していた。
 */
describe('accountingRecency', () => {
  it('★ 会計連携が基準日より古ければ、隔たりと stale を返す', () => {
    const r = accountingRecency('2026-08-31', '2024-06');
    expect(r.cashAsOfMonth).toBe('2026-08');
    expect(r.latestAccountingMonth).toBe('2024-06');
    expect(r.monthsBehind).toBe(26);
    expect(r.stale).toBe(true);
    expect(r.ahead).toBe(false);
  });

  it('★ 対照: 同じ月なら隔たり 0・鳴らない', () => {
    const r = accountingRecency('2026-08-31', '2026-08');
    expect(r.monthsBehind).toBe(0);
    expect(r.stale).toBe(false);
    expect(r.ahead).toBe(false);
  });

  it('★ 境目: しきい値ちょうどは鳴らず、1 か月超えて鳴る (基準日の検査と同じ物差し)', () => {
    expect(accountingRecency('2026-08-31', '2025-08', 12).stale).toBe(false); // 12
    expect(accountingRecency('2026-08-31', '2025-07', 12).stale).toBe(true); // 13
  });

  it('★ 会計のほうがずっと新しければ ahead (基準日が古い側)', () => {
    const r = accountingRecency('2024-06-30', '2026-08');
    expect(r.monthsBehind).toBe(-26);
    expect(r.ahead).toBe(true);
    expect(r.stale).toBe(false);
  });

  it('読めない月では何も言わない (測れないときに「新しい」と言わない)', () => {
    for (const [a, b] of [['', '2026-08'], [null, '2026-08'], ['2026-08-31', ''], ['2026-08-31', 'x']] as const) {
      const r = accountingRecency(a, b);
      expect(r.monthsBehind).toBeNull();
      expect(r.stale).toBe(false);
      expect(r.ahead).toBe(false);
    }
  });
});

describe('summarizeAccounting — 窓の両端は綴りで決める', () => {
  const m = (month: string, net: number) => ({ month, income: net, expense: 0, net });

  it('★ 並びが逆でも firstMonth / latestMonth は正しい (位置に頼らない)', () => {
    const s = summarizeAccounting([m('2026-08', 300), m('2026-03', 100), m('2026-05', 200)])!;
    expect(s.firstMonth).toBe('2026-03');
    expect(s.latestMonth).toBe('2026-08');
    expect(s.latestNet).toBe(300); // 最新月の値であって「配列の最後」ではない
    expect(s.months).toBe(3);
  });

  it('対照: 昇順に並んだ入力でも同じ答え', () => {
    const s = summarizeAccounting([m('2026-03', 100), m('2026-05', 200), m('2026-08', 300)])!;
    expect(s.firstMonth).toBe('2026-03');
    expect(s.latestMonth).toBe('2026-08');
    expect(s.latestNet).toBe(300);
  });
});

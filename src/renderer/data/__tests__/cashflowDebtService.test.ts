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

  /**
   * **この検査は 2026-09-07 まで、欠陥のほうを「仕様」として留めていた。**
   * 旧: 「会計連携に月次CFが無い返済月は 営業CF 0 (DSCR 0) として扱う」。
   * 返済予定は借入期間ぶん将来へ伸びる (`shared/funding.ts` の `monthlyFlow` が
   * そう作る) のに、実績CF は過去しか無いので、**将来の月がすべて返済不足月に
   * 数えられていた** —— 実測 2.85 倍で返せている会社が 0.24 倍・55/60 か月不足と
   * 報告された (画面・金融機関等提出用の書面・スコアカードの軸・ハイライト)。
   */
  it('★ 会計連携に月次CFが無い返済月は突合しない (0 として数えない)', () => {
    const r = combineCashflowDebtService(
      [cf('2026-04', 300_000)],
      [{ month: '2026-04', repayment: 100_000 }, { month: '2026-05', repayment: 100_000 }],
    )!;
    // 2026-05 は分子が無いので対象外。2026-04 だけで 3.0 倍。
    expect(r.months.map((m) => m.month)).toEqual(['2026-04']);
    expect(r.overallDscr).toBe(3);
    expect(r.worstMonthDscr).toBe(3);
    expect(r.shortfallMonths).toBe(0);
    expect(r.coveredMonths).toBe(1);
    expect(r.unmatchedMonths).toBe(1);
  });

  it('★ 返済月がすべて未突合なら null (0 を並べた答えを作らない)', () => {
    expect(
      combineCashflowDebtService([cf('2026-04', 300_000)], [{ month: '2026-05', repayment: 100_000 }]),
    ).toBeNull();
  });

  it('★ 実測して 0 だった月は対象に残る (未取得と実測ゼロを混ぜない)', () => {
    const r = combineCashflowDebtService(
      [cf('2026-04', 0), cf('2026-05', 300_000)],
      [{ month: '2026-04', repayment: 100_000 }, { month: '2026-05', repayment: 100_000 }],
    )!;
    expect(r.months.map((m) => m.month)).toEqual(['2026-04', '2026-05']);
    expect(r.months[0]!.dscr).toBe(0); // 実測の 0 は 0 のまま
    expect(r.shortfallMonths).toBe(1);
    expect(r.unmatchedMonths).toBe(0);
  });

  it('★ 実測: 借入 60 回のうち会計が 6 か月しか無い会社 —— 突合できた月で測る', () => {
    // 営業CF 30 万/月・返済 105,167 円/月 × 60 回・会計は 2026-01〜2026-06。
    const acc = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].map((m) => cf(m, 300_000));
    const repay = Array.from({ length: 60 }, (_, i) => {
      const y = 2026 + Math.floor((1 + i) / 12);
      const mo = ((1 + i) % 12) + 1;
      return { month: `${y}-${String(mo).padStart(2, '0')}`, repayment: 105_167 };
    });
    const r = combineCashflowDebtService(acc, repay)!;
    expect(r.overallDscr).toBe(2.85); // 直す前は 0.24
    expect(r.worstMonthDscr).toBe(2.85); // 直す前は 0
    expect(r.shortfallMonths).toBe(0); // 直す前は 55
    expect(r.coveredMonths).toBe(5);
    expect(r.unmatchedMonths).toBe(55);
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

  it('tracks the worst (minimum) DSCR even when it is not the last month', () => {
    // 04 が最小 0.5、05 が 2.0。worst を「常に更新」する mutant は末尾 2.0 を取るため kill。
    const r = combineCashflowDebtService(
      [cf('2026-04', 100_000), cf('2026-05', 400_000)],
      [{ month: '2026-04', repayment: 200_000 }, { month: '2026-05', repayment: 200_000 }],
    )!;
    expect(r.months.map((m) => m.dscr)).toEqual([0.5, 2]);
    expect(r.worstMonthDscr).toBe(0.5);
  });

  it('does not count a DSCR exactly at the threshold as a shortfall (< strict)', () => {
    // 04: dscr 1.0 (=threshold) → 数えない。05: dscr 0.5 → 数える。<= にする mutant を kill。
    const r = combineCashflowDebtService(
      [cf('2026-04', 200_000), cf('2026-05', 100_000)],
      [{ month: '2026-04', repayment: 200_000 }, { month: '2026-05', repayment: 200_000 }],
    )!;
    expect(r.months.map((m) => m.dscr)).toEqual([1, 0.5]);
    expect(r.shortfallMonths).toBe(1); // 0.5 の月のみ
  });

  it('sorts repayment months chronologically regardless of input order', () => {
    // 入力 (Map 挿入順) は 05, 04。既定ソートで 04, 05 になる。sort を外す mutant を kill。
    const r = combineCashflowDebtService(
      [cf('2026-04', 100_000), cf('2026-05', 100_000)],
      [{ month: '2026-05', repayment: 100_000 }, { month: '2026-04', repayment: 100_000 }],
    )!;
    expect(r.months.map((m) => m.month)).toEqual(['2026-04', '2026-05']);
  });
});

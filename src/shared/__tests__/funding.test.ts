import { describe, expect, it } from 'vitest';
import {
  aggregateByKind,
  fundingDiversification,
  monthlyPayment,
  amortizationSchedule,
  interestSchedule,
  monthlyFlow,
  cashRunway,
  scenarioRunways,
  fundingQualityScore,
  debtServiceMetrics,
  totalInterestOf,
  effectiveFundingCostRate,
  fundingCostMetrics,
  type FundingItem,
  type FundingMonthly,
  type FundingSummary,
} from '../funding';

/** Minimal FundingItem builder (override per test). */
const item = (over: Partial<FundingItem> = {}): FundingItem => ({
  id: 'x', kind: 'loan', name: 'n', amount: 100, status: 'received', month: '2026-01', repayable: false, ...over,
});
/** Minimal FundingMonthly builder for cashRunway / debtServiceMetrics. */
const fm = (over: Partial<FundingMonthly>): FundingMonthly => ({
  month: '2026-01', funding: 0, fundingAfterTax: 0, repayment: 0, interest: 0, interestTaxShield: 0,
  // 既定は「実績が在る」—— 検査が営業CF を明示するのは「その月は測れた」という意味。
  // 未取得を表したい検査は `operatingCashflowKnown: false` を明示する (パス 182)。
  netCashflow: 0, operatingCashflow: 0, operatingCashflowKnown: true, portfolioValue: 0, ...over,
});

describe('fundingDiversification', () => {
  it('breaks a top-share tie toward the earlier kind (FUNDING_KINDS order, > strict)', () => {
    // subsidy と grant が同額 → present は [subsidy, grant]。`share > topShare` は先頭(subsidy)を
    // 保持。`>=` にする mutant は後続(grant)に切り替わるため topKind で撃墜。
    const byKind = aggregateByKind([
      item({ kind: 'subsidy', amount: 100_000, status: 'received' }),
      item({ kind: 'grant', amount: 100_000, status: 'received' }),
    ]);
    expect(fundingDiversification(byKind)?.topKind).toBe('subsidy');
  });
});

describe('monthlyPayment', () => {
  it('is principal/months for an interest-free loan', () => {
    expect(monthlyPayment(1_200_000, 0, 12)).toBe(100_000);
  });
  it('returns 0 for non-positive months (guard is load-bearing — avoids /0 = Infinity)', () => {
    expect(monthlyPayment(100_000, 0.02, 0)).toBe(0);
  });
});

describe('amortizationSchedule', () => {
  it('returns [] for a non-positive principal (guard avoids a zero-filled schedule)', () => {
    expect(amortizationSchedule(0, 0.02, 3, '2026-01')).toEqual([]);
  });
  it('produces an equal-payment schedule by default that fully amortizes', () => {
    expect(amortizationSchedule(300_000, 0, 3, '2026-01')).toEqual([
      { month: '2026-01', payment: 100_000, principal: 100_000, interest: 0, remaining: 200_000 },
      { month: '2026-02', payment: 100_000, principal: 100_000, interest: 0, remaining: 100_000 },
      { month: '2026-03', payment: 100_000, principal: 100_000, interest: 0, remaining: 0 },
    ]);
  });
  it('handles a grace period (interest-only) then amortizes', () => {
    expect(amortizationSchedule(120_000, 0.12, 2, '2026-01', 1)).toEqual([
      { month: '2026-01', payment: 1_200, principal: 0, interest: 1_200, remaining: 120_000 },
      { month: '2026-02', payment: 60_901, principal: 59_701, interest: 1_200, remaining: 60_299 },
      { month: '2026-03', payment: 60_902, principal: 60_299, interest: 603, remaining: 0 },
    ]);
  });
});

describe('interestSchedule', () => {
  it('excludes unsecured (not received/approved) loans', () => {
    // status='applied' は未確定 → 対象外。`!isSecured` を false 固定する mutant は含めるため撃墜。
    const sched = interestSchedule([
      item({ kind: 'loan', repayable: true, status: 'applied', amount: 120_000, repayment: { annualRate: 0.12, months: 2, startMonth: '2026-01' } }),
    ]);
    expect(sched.size).toBe(0);
  });
});

describe('monthlyFlow', () => {
  it('computes netCashflow = fundingAfterTax + operatingCashflow − repayment + interestTaxShield', () => {
    // 補助金 10万 (税率0で課税なし) + 営業CF 5万 → net = 100000 + 50000 = 150000。
    // `+ operatingCashflow` を `-` にする ArithmeticOperator を撃墜。
    const flow = monthlyFlow(
      [item({ kind: 'subsidy', amount: 100_000, status: 'received', month: '2026-01' })],
      { accountingCashflow: new Map([['2026-01', 50_000]]), effectiveTaxRate: 0 },
    );
    expect(flow[0]!.netCashflow).toBe(150_000);
  });
});

describe('cashRunway', () => {
  it('tracks the minimum balance and the first shortfall month', () => {
    const flow = monthlyFlow([], { accountingCashflow: new Map([['2026-01', -50], ['2026-02', -100]]) });
    const run = cashRunway(flow, 30);
    expect(run.minBalance).toBe(-120); // 30-50=-20, -20-100=-120
    expect(run.shortfallMonth).toBe('2026-01');
  });
  it('does not flag a shortfall when the balance hits exactly 0 (< 0 strict)', () => {
    // balance がちょうど 0 → 資金ショートではない。`balance < 0` を `<= 0` にする mutant を撃墜。
    const flow = monthlyFlow([], { accountingCashflow: new Map([['2026-01', -30]]) });
    expect(cashRunway(flow, 30).shortfallMonth).toBeNull();
  });
});

describe('scenarioRunways', () => {
  it('threads openingBalance and the flow options into each scenario', () => {
    const sr = scenarioRunways([], { openingBalance: 5_000, accountingCashflow: new Map([['2026-01', 100]]) });
    expect(sr.optimistic.openingBalance).toBe(5_000); // `?? 0` の LogicalOperator を撃墜
    expect(sr.optimistic.rows[0]!.balance).toBe(5_100); // flowOpts {} 化 (ObjectLiteral) を撃墜
  });
});

describe('fundingQualityScore', () => {
  it('weights the non-repayable and after-tax ratios by their weights', () => {
    // nonRep 0.6 / afterTax 0.8、weights [0.4,0.6] → (0.6*0.4 + 0.8*0.6)/1 = 0.72 → 72。
    const summary = { totalSecured: 1_000, nonRepayableSecured: 600, afterTaxSecured: 800 } as FundingSummary;
    expect(fundingQualityScore(summary, [0.4, 0.6]).compositeScore).toBe(72);
  });
  it('divides by the weight sum when weights do not total 1', () => {
    // weights [1,1] (wSum=2) → (0.6 + 0.8)/2 = 0.7 → 70。`/wSum` を `*wSum` にする mutant は
    // 2.8 → clamp 1 → 100 になるため撃墜 (和=1 の weights では区別できない盲点を塞ぐ)。
    const summary = { totalSecured: 1_000, nonRepayableSecured: 600, afterTaxSecured: 800 } as FundingSummary;
    expect(fundingQualityScore(summary, [1, 1]).compositeScore).toBe(70);
  });
});

describe('debtServiceMetrics', () => {
  it('computes the worst-month DSCR and counts months below the threshold (< strict)', () => {
    const monthly = [fm({ repayment: 100, operatingCashflow: 200 }), fm({ repayment: 100, operatingCashflow: 50 }), fm({ repayment: 100, operatingCashflow: 100 })];
    const m = debtServiceMetrics(monthly, 1);
    expect(m.worstMonthDscr).toBe(0.5); // min(2, 0.5, 1)
    expect(m.shortfallMonths).toBe(1); // dscr<1: only 0.5 (1 はちょうどで対象外)
  });
});

describe('totalInterestOf / effectiveFundingCostRate / fundingCostMetrics', () => {
  it('returns 0 interest for a non-repayable item even if a repayment object is present', () => {
    // `!repayable || !repayment` を `&&` にする mutant は repayment 付き非返済を計算してしまう。
    expect(totalInterestOf(item({ repayable: false, status: 'received', amount: 100_000, repayment: { annualRate: 0.12, months: 12, startMonth: '2026-01' } }))).toBe(0);
  });
  it('returns 0 cost rate for a zero-principal loan (guard avoids 0/0 = NaN)', () => {
    expect(effectiveFundingCostRate(item({ repayable: true, status: 'received', amount: 0, repayment: { annualRate: 0.12, months: 12, startMonth: '2026-01' } }))).toBe(0);
  });
  it('excludes non-repayable items from the loan principal even with a repayment object', () => {
    const summary = { totalSecured: 100_000, repayableSecured: 0 } as FundingSummary;
    const m = fundingCostMetrics(
      [item({ kind: 'loan', repayable: false, status: 'received', amount: 100_000, repayment: { annualRate: 0.12, months: 12, startMonth: '2026-01' } })],
      summary,
    );
    expect(m.totalLoanPrincipal).toBe(0); // `||` を `&&` にする mutant は誤って計上する
  });
});

/**
 * **未取得の営業CF を「0」として比率に混ぜない** (2026-09-12 · パス 182)。
 *
 * 返済予定は借入期間ぶん将来へ伸びるのに、会計連携の月次CF は過去しか無い。
 * `monthlyFlow` は無い月を `?? 0` で埋めるので、そのまま割ると
 * 「営業CF 0 ÷ 返済額」= DSCR 0 = 返済不足月が並ぶ。姉妹モジュール
 * `renderer/data/cashflowDebtService.ts` が 2026-09-07 (パス 45) に直した形で、
 * こちらは分母 (パス 60) だけが直り、分子が残っていた。
 */
describe('営業CF の未取得と実測ゼロ (パス 182)', () => {
  it('★ monthlyFlow: 会計連携に在る月は known・無い月は not known', () => {
    const acc = new Map([['2026-01', 500], ['2026-02', 0]]);
    const rows = monthlyFlow(
      [item({ kind: 'loan', status: 'received', amount: 1_200, month: '2026-01', repayable: true,
        repayment: { annualRate: 0, months: 3, startMonth: '2026-01' } })],
      { accountingCashflow: acc },
    );
    const by = new Map(rows.map((r) => [r.month, r]));
    expect(by.get('2026-01')?.operatingCashflowKnown, '連携に在る月').toBe(true);
    // **実測ゼロは known** —— 連携に載っていて net 0 だった月は「測れた 0」。
    expect(by.get('2026-02')?.operatingCashflow).toBe(0);
    expect(by.get('2026-02')?.operatingCashflowKnown, '実測ゼロを未取得と混ぜている').toBe(true);
    expect(by.get('2026-03')?.operatingCashflowKnown, '連携に無い月').toBe(false);
  });

  it('★ monthlyFlow: 会計連携そのものが無ければ全月 not known', () => {
    const rows = monthlyFlow([item({ month: '2026-01', status: 'received' })]);
    expect(rows.every((r) => r.operatingCashflowKnown)).toBe(false);
    expect(rows.some((r) => r.operatingCashflowKnown)).toBe(false);
  });

  it('★ 未取得の返済月は分子・分母から外し、件数で数える', () => {
    const m = debtServiceMetrics([
      fm({ month: '2026-01', repayment: 100, operatingCashflow: 300 }),
      fm({ month: '2026-02', repayment: 100, operatingCashflow: 0, operatingCashflowKnown: false }),
      fm({ month: '2026-03', repayment: 100, operatingCashflow: 0, operatingCashflowKnown: false }),
    ]);
    expect(m.overallDscr).toBe(3); // 300 / 100 —— 未取得の 2 か月を混ぜれば 1.0 になる
    expect(m.worstMonthDscr).toBe(3);
    expect(m.shortfallMonths).toBe(0);
    expect(m.coveredMonths).toBe(1);
    expect(m.unmatchedMonths).toBe(2);
    // 返済額の総額は全期間ぶん残る (節を出すかの判定と表示に使う)。
    expect(m.totalRepayment).toBe(300);
    expect(m.coveredRepayment).toBe(100);
  });

  it('★ 対照: 同じ標本で known を立てると元の欠陥が戻る (検査が区別を見ている)', () => {
    // **鳴らない対照は合格ではない。** known を全月 true にすると
    // 「営業CF 0 の月」が 2 つ分母に入り、DSCR は 3 → 1.0、不足月 0 → 2 になる。
    const m = debtServiceMetrics([
      fm({ month: '2026-01', repayment: 100, operatingCashflow: 300 }),
      fm({ month: '2026-02', repayment: 100, operatingCashflow: 0 }),
      fm({ month: '2026-03', repayment: 100, operatingCashflow: 0 }),
    ]);
    expect(m.overallDscr).toBe(1);
    expect(m.worstMonthDscr).toBe(0);
    expect(m.shortfallMonths).toBe(2);
    expect(m.unmatchedMonths).toBe(0);
  });

  it('★ 突合が 1 件も無ければ DSCR は null (0 を並べた答えを作らない)', () => {
    const m = debtServiceMetrics([
      fm({ month: '2026-01', repayment: 100, operatingCashflow: 0, operatingCashflowKnown: false }),
      fm({ month: '2026-02', repayment: 200, operatingCashflow: 0, operatingCashflowKnown: false }),
    ]);
    expect(m.overallDscr).toBeNull();
    expect(m.worstMonthDscr).toBeNull();
    expect(m.shortfallMonths).toBe(0);
    expect(m.coveredMonths).toBe(0);
    expect(m.unmatchedMonths).toBe(2);
    expect(m.totalRepayment).toBe(300); // 借入は在る (節は出す)
  });

  it('★ 実測ゼロの月は不足月として数える (安全側に倒さない)', () => {
    // 連携に載っていて営業CF が 0 だった月は**本当にカバーできていない**。
    // 未取得を外す規則が、実測ゼロまで外してしまわないこと。
    const m = debtServiceMetrics([fm({ month: '2026-01', repayment: 100, operatingCashflow: 0 })]);
    expect(m.overallDscr).toBe(0);
    expect(m.worstMonthDscr).toBe(0);
    expect(m.shortfallMonths).toBe(1);
    expect(m.coveredMonths).toBe(1);
    expect(m.unmatchedMonths).toBe(0);
  });

  it('★ 画面が刷る式が成り立つ: 分子 ÷ 分母 = DSCR', () => {
    // 画面は「営業CF合計 X ÷ 返済額 Y = DSCR」と刷る。X と Y は DSCR の
    // 実際の被演算子でなければならない (パス 53 / 81 の規準)。
    for (const rows of [
      [fm({ repayment: 100, operatingCashflow: 250 }), fm({ month: '2026-02', repayment: 300, operatingCashflow: 150 })],
      [fm({ repayment: 100, operatingCashflow: 250 }), fm({ month: '2026-02', repayment: 300, operatingCashflow: 150, operatingCashflowKnown: false })],
    ]) {
      const m = debtServiceMetrics(rows);
      expect(m.overallDscr).not.toBeNull();
      expect(m.coveredOperatingCashflow / m.coveredRepayment).toBe(m.overallDscr);
    }
  });
});

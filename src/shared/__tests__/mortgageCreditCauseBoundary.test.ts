/**
 * 住宅ローン控除が「¥0」になる**原因の選び方**の境目と、原因の文の**数の導き方**を値ごと留める (パス 502)。
 *
 * `noMortgageCreditCause` は `calcMortgageCredit` の早期 return を**同じ順序**で写して原因を選ぶ。
 * 既存の検査 (`mortgageCreditReason.test.ts`) は画面を描いて「どの原因の文が出るか」を見るが、
 *
 *   - **入力か結果のどちらか一方だけが `null`** の組 (型は許している) ・
 *   - **合計所得がちょうど上限** (`>` であって `>=` ではない) ・
 *   - **上限を台帳から差し替えたとき、文の「N 万円」もその値から導かれる**こと
 *
 * は主張していなかった。最後の 1 つは算術 (`円 ÷ 10,000`) を含む文面なので、`×` に変えても
 * 「万円」の語は残り、断片の `toContain` は通る。**単位 (万円) と境目の両方を値で留める。**
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MORTGAGE_CREDIT_PARAMS,
  MORTGAGE_INCOME_LIMIT,
  calcMortgageCredit,
  noMortgageCreditCause,
  noMortgageCreditNote,
  type MortgageCreditInput,
  type MortgageCreditResult,
} from '../taxCredits';

/** 残高 3,000 万・所得税が十分ある → 算定額 210,000 円が全額所得税から引ける (どの原因にも当たらない入力)。 */
const BASE: MortgageCreditInput = {
  yearEndBalance: 30_000_000,
  incomeTaxBeforeCredit: 500_000,
  taxableIncomeForIncomeTax: 3_000_000,
};

const cause = (input: MortgageCreditInput): ReturnType<typeof noMortgageCreditCause> =>
  noMortgageCreditCause(input, calcMortgageCredit(input));

describe('noMortgageCreditCause — 入力か結果のどちらかが無ければ「残高未入力」', () => {
  const RESULT: MortgageCreditResult = { creditable: 210_000, fromIncomeTax: 210_000, fromResidentTax: 0, unused: 0 };

  it('入力が null (画面が住宅ローンを渡さない形) は no-balance', () => {
    expect(noMortgageCreditCause(null, RESULT)).toBe('no-balance');
    expect(noMortgageCreditCause(null, null)).toBe('no-balance');
  });

  it('結果が null (計算にかけていない) は、入力に残高が在っても no-balance (結果を読んで落ちない)', () => {
    expect(noMortgageCreditCause(BASE, null)).toBe('no-balance');
  });

  it('対照: 入力も結果も在って、残高が在り、どの原因にも当たらなければ null', () => {
    expect(noMortgageCreditCause(BASE, RESULT)).toBeNull();
  });
});

describe('noMortgageCreditCause — 所得制限の境目は「超える」であって「以上」ではない', () => {
  it('合計所得がちょうど上限の年は対象 (calcMortgageCredit も早期 return しない) → 原因は無い', () => {
    const atLimit: MortgageCreditInput = { ...BASE, totalIncome: MORTGAGE_INCOME_LIMIT };
    // 計算側が同じ境目で動いていること (原因の選び方が計算と食い違わない証拠)。
    expect(calcMortgageCredit(atLimit).creditable).toBe(210_000);
    expect(cause(atLimit)).toBeNull();
  });

  it('上限を 1 円超えた年から income-over-limit (計算側も 0 円)', () => {
    const over: MortgageCreditInput = { ...BASE, totalIncome: MORTGAGE_INCOME_LIMIT + 1 };
    expect(calcMortgageCredit(over).creditable).toBe(0);
    expect(cause(over)).toBe('income-over-limit');
  });

  it('合計所得が未指定なら所得制限を判定しない (原因は無い)', () => {
    expect(cause({ ...BASE, totalIncome: undefined })).toBeNull();
  });

  it('上限は台帳から差し替えられる (既定の 2,000 万円を写さない)', () => {
    const p = { ...DEFAULT_MORTGAGE_CREDIT_PARAMS, incomeLimit: 15_000_000 };
    const at: MortgageCreditInput = { ...BASE, totalIncome: 15_000_000 };
    const over: MortgageCreditInput = { ...BASE, totalIncome: 15_000_001 };
    expect(noMortgageCreditCause(at, calcMortgageCredit(at, p), p)).toBeNull();
    expect(noMortgageCreditCause(over, calcMortgageCredit(over, p), p)).toBe('income-over-limit');
  });
});

describe('noMortgageCreditCause — 借入限度額がちょうど 0 のときだけ「省エネ基準非適合」', () => {
  it('限度額 0 (2024 年以降の非適合の新築) は not-energy-compliant', () => {
    expect(cause({ ...BASE, balanceCap: 0 })).toBe('not-energy-compliant');
  });

  it('限度額が未指定・正の額なら、限度額では原因にならない', () => {
    expect(cause({ ...BASE, balanceCap: undefined })).toBeNull();
    expect(cause({ ...BASE, balanceCap: 40_000_000 })).toBeNull();
  });
});

describe('noMortgageCreditNote — 所得制限の文は「N 万円」を上限から導く', () => {
  it('既定の上限 (2,000 万円) は「2000 万円」と言う (万円 = 円 ÷ 10,000)', () => {
    expect(noMortgageCreditNote('income-over-limit', 0)).toBe(
      '合計所得金額が 2000 万円を超える年は住宅ローン控除の適用がありません（国税庁 No.1211）。居住年・住宅性能区分を変えても適用されません。',
    );
  });

  it('上限を差し替えたら、文の数も差し替えた値になる (1,500 万円 → 「1500 万円」)', () => {
    const p = { ...DEFAULT_MORTGAGE_CREDIT_PARAMS, incomeLimit: 15_000_000 };
    expect(noMortgageCreditNote('income-over-limit', 0, p)).toBe(
      '合計所得金額が 1500 万円を超える年は住宅ローン控除の適用がありません（国税庁 No.1211）。居住年・住宅性能区分を変えても適用されません。',
    );
  });
});

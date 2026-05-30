import { describe, expect, it } from 'vitest';
import {
  applyTaxCredits,
  applyTaxCreditsWithSurtax,
  resolveMortgageParams,
  calcAllTaxCredits,
  calcDividendCredit,
  calcMortgageCredit,
  MORTGAGE_RESIDENT_CAP_MAX,
  MORTGAGE_INCOME_LIMIT,
  mortgageDeductionPeriod,
  mortgagePeriodStatus,
} from '../taxCredits';

describe('mortgageDeductionPeriod / mortgagePeriodStatus (控除期間)', () => {
  it('new builds get 13 years, used homes get 10 years', () => {
    expect(mortgageDeductionPeriod('standard')).toBe(13);
    expect(mortgageDeductionPeriod('zeh')).toBe(13);
    expect(mortgageDeductionPeriod('used')).toBe(10);
  });

  it('counts the first residence year as year 1 and reports remaining years', () => {
    // 2022 居住開始, 新築13年 → 2022 が1年目
    const first = mortgagePeriodStatus(2022, 2022, 'standard');
    expect(first.yearsElapsed).toBe(1);
    expect(first.yearsRemaining).toBe(13);
    expect(first.withinPeriod).toBe(true);
  });

  it('the final year is within the period; the next year is outside', () => {
    // 新築13年: 2022居住 → 2034 が13年目 (最終), 2035 は期間外
    const last = mortgagePeriodStatus(2022, 2034, 'standard');
    expect(last.yearsElapsed).toBe(13);
    expect(last.yearsRemaining).toBe(1);
    expect(last.withinPeriod).toBe(true);
    const after = mortgagePeriodStatus(2022, 2035, 'standard');
    expect(after.withinPeriod).toBe(false);
    expect(after.yearsRemaining).toBe(0);
  });

  it('a used home expires after 10 years', () => {
    expect(mortgagePeriodStatus(2022, 2031, 'used').withinPeriod).toBe(true); // 10年目
    expect(mortgagePeriodStatus(2022, 2032, 'used').withinPeriod).toBe(false); // 11年目
  });

  it('before residence the credit period has not started', () => {
    const before = mortgagePeriodStatus(2024, 2022, 'standard');
    expect(before.withinPeriod).toBe(false);
    expect(before.yearsRemaining).toBe(13);
  });
});

describe('calcMortgageCredit', () => {
  it('credits 0.7% of the year-end balance from income tax when it fits', () => {
    const r = calcMortgageCredit({
      yearEndBalance: 20_000_000,
      incomeTaxBeforeCredit: 300_000,
      taxableIncomeForResident: 4_000_000,
    });
    expect(r.creditable).toBe(140_000); // 20,000,000 × 0.7%
    expect(r.fromIncomeTax).toBe(140_000);
    expect(r.fromResidentTax).toBe(0);
    expect(r.unused).toBe(0);
  });

  it('spills over to resident tax (capped) when income tax is too small', () => {
    const r = calcMortgageCredit({
      yearEndBalance: 20_000_000, // creditable 140,000
      incomeTaxBeforeCredit: 50_000,
      taxableIncomeForResident: 4_000_000, // cap min(97,500, 4,000,000×5%=200,000)=97,500
    });
    expect(r.fromIncomeTax).toBe(50_000);
    // remaining 90,000 < cap 97,500 → all 90,000 from resident tax
    expect(r.fromResidentTax).toBe(90_000);
    expect(r.unused).toBe(0);
  });

  it('caps resident spill-over at 97,500 when remaining exceeds it', () => {
    const r = calcMortgageCredit({
      yearEndBalance: 30_000_000, // creditable 210,000
      incomeTaxBeforeCredit: 50_000,
      taxableIncomeForResident: 5_000_000, // cap 97,500
    });
    expect(r.fromIncomeTax).toBe(50_000);
    expect(r.fromResidentTax).toBe(MORTGAGE_RESIDENT_CAP_MAX); // 97,500
    expect(r.unused).toBe(210_000 - 50_000 - 97_500);
  });

  it('caps the balance at the balanceCap', () => {
    const r = calcMortgageCredit({
      yearEndBalance: 50_000_000,
      balanceCap: 30_000_000,
      incomeTaxBeforeCredit: 1_000_000,
      taxableIncomeForResident: 5_000_000,
    });
    expect(r.creditable).toBe(210_000); // 30,000,000 × 0.7%
  });

  it('uses income×5% when below the 97,500 resident cap', () => {
    const r = calcMortgageCredit({
      yearEndBalance: 20_000_000, // creditable 140,000
      incomeTaxBeforeCredit: 0,
      taxableIncomeForResident: 1_000_000, // cap min(97,500, 50,000)=50,000
    });
    expect(r.fromResidentTax).toBe(50_000);
  });

  it('denies the credit when total income exceeds 2,000万 (国税庁 No.1211)', () => {
    const r = calcMortgageCredit({
      yearEndBalance: 30_000_000,
      incomeTaxBeforeCredit: 500_000,
      taxableIncomeForResident: 25_000_000,
      totalIncome: 20_000_001, // just over the limit
    });
    expect(r.creditable).toBe(0);
    expect(r.fromIncomeTax).toBe(0);
    expect(r.fromResidentTax).toBe(0);
    expect(MORTGAGE_INCOME_LIMIT).toBe(20_000_000);
  });

  it('allows the credit at exactly 2,000万 total income (inclusive boundary)', () => {
    const r = calcMortgageCredit({
      yearEndBalance: 30_000_000,
      incomeTaxBeforeCredit: 500_000,
      taxableIncomeForResident: 5_000_000,
      totalIncome: 20_000_000, // exactly at the limit → still eligible
    });
    expect(r.creditable).toBe(210_000);
    expect(r.fromIncomeTax).toBe(210_000);
  });

  it('ignores the income limit when totalIncome is unspecified (backward compatible)', () => {
    const r = calcMortgageCredit({
      yearEndBalance: 30_000_000,
      incomeTaxBeforeCredit: 500_000,
      taxableIncomeForResident: 5_000_000,
    });
    expect(r.creditable).toBe(210_000);
  });

  it('denies the credit once outside the deduction period', () => {
    const r = calcMortgageCredit({
      yearEndBalance: 30_000_000,
      incomeTaxBeforeCredit: 500_000,
      taxableIncomeForResident: 5_000_000,
      outsidePeriod: true,
    });
    expect(r.creditable).toBe(0);
    expect(r.fromIncomeTax).toBe(0);
  });
});

describe('calcDividendCredit', () => {
  it('returns 0 for no dividend', () => {
    expect(calcDividendCredit({ dividendIncome: 0, taxableTotalIncome: 5_000_000 })).toEqual({
      incomeTax: 0,
      residentTax: 0,
    });
  });

  it('applies 10% / 2.8% when total income ≤ 10,000,000', () => {
    const r = calcDividendCredit({ dividendIncome: 1_000_000, taxableTotalIncome: 5_000_000 });
    expect(r.incomeTax).toBe(100_000); // 1,000,000 × 10%
    expect(r.residentTax).toBe(28_000); // 1,000,000 × 2.8%
  });

  it('applies the low rate to the portion above 10,000,000', () => {
    // total 10,500,000, dividend 1,000,000 → 500,000 over (low), 500,000 high
    const r = calcDividendCredit({ dividendIncome: 1_000_000, taxableTotalIncome: 10_500_000 });
    expect(r.incomeTax).toBe(Math.round(500_000 * 0.1 + 500_000 * 0.05));
    expect(r.residentTax).toBe(Math.round(500_000 * 0.028 + 500_000 * 0.014));
  });

  it('uses the full high rate when total income is exactly 10,000,000 (boundary)', () => {
    // total exactly at the threshold → no portion over → all high rate
    const r = calcDividendCredit({ dividendIncome: 1_000_000, taxableTotalIncome: 10_000_000 });
    expect(r.incomeTax).toBe(100_000); // 1,000,000 × 10%
    expect(r.residentTax).toBe(28_000); // 1,000,000 × 2.8%
  });
});

describe('calcAllTaxCredits', () => {
  it('returns zeros for empty input', () => {
    const c = calcAllTaxCredits({});
    expect(c.totalIncomeTax).toBe(0);
    expect(c.totalResidentTax).toBe(0);
  });

  it('aggregates mortgage + dividend + furusato', () => {
    const c = calcAllTaxCredits({
      mortgage: {
        yearEndBalance: 20_000_000,
        incomeTaxBeforeCredit: 50_000,
        taxableIncomeForResident: 4_000_000,
      },
      dividend: { dividendIncome: 1_000_000, taxableTotalIncome: 5_000_000 },
      furusatoResidentCredit: 40_000,
      otherIncomeTaxCredit: 10_000,
    });
    // mortgage: creditable 140,000, fromIncomeTax 50,000, remaining 90,000 < cap → resident 90,000
    expect(c.totalIncomeTax).toBe(50_000 + 100_000 + 10_000);
    expect(c.totalResidentTax).toBe(90_000 + 28_000 + 40_000);
  });
});

describe('applyTaxCredits', () => {
  it('subtracts credits without going below zero income tax', () => {
    const c = calcAllTaxCredits({ otherIncomeTaxCredit: 500_000 });
    const r = applyTaxCredits(300_000, 400_000, c);
    expect(r.incomeTax).toBe(0); // floored
  });

  it('never drops resident tax below the per-capita levy', () => {
    const c = calcAllTaxCredits({ furusatoResidentCredit: 1_000_000 });
    const r = applyTaxCredits(300_000, 400_000, c);
    expect(r.residentTax).toBe(5_000);
  });

  it('applies partial credits correctly', () => {
    const c = calcAllTaxCredits({ otherIncomeTaxCredit: 100_000, furusatoResidentCredit: 50_000 });
    const r = applyTaxCredits(300_000, 400_000, c);
    expect(r.incomeTax).toBe(200_000);
    expect(r.residentTax).toBe(350_000);
  });
});

describe('applyTaxCreditsWithSurtax (復興税の順序)', () => {
  it('applies income-tax credit to the base, then the surtax', () => {
    const c = calcAllTaxCredits({ otherIncomeTaxCredit: 100_000 });
    // base 500,000 - 100,000 = 400,000 → × 1.021 = 408,400
    const r = applyTaxCreditsWithSurtax(500_000, 300_000, c, 0.021);
    expect(r.incomeTax).toBe(Math.round(400_000 * 1.021));
  });

  it('floors income tax at zero when credit exceeds base', () => {
    const c = calcAllTaxCredits({ otherIncomeTaxCredit: 600_000 });
    const r = applyTaxCreditsWithSurtax(500_000, 300_000, c, 0.021);
    expect(r.incomeTax).toBe(0);
  });

  it('never drops resident tax below per-capita', () => {
    const c = calcAllTaxCredits({ furusatoResidentCredit: 1_000_000 });
    const r = applyTaxCreditsWithSurtax(500_000, 300_000, c, 0.021);
    expect(r.residentTax).toBe(5_000);
  });

  it('matches the documented order benefit vs the naive (surtax-first) approach', () => {
    const c = calcAllTaxCredits({ otherIncomeTaxCredit: 100_000 });
    const correct = applyTaxCreditsWithSurtax(500_000, 300_000, c, 0.021).incomeTax;
    const naive = applyTaxCredits(Math.round(500_000 * 1.021), 300_000, c).incomeTax;
    expect(correct).toBeLessThan(naive);
  });
});

describe('boundary coverage — mortgage / dividend edges', () => {
  it('zero balance yields no credit', () => {
    const r = calcMortgageCredit({ yearEndBalance: 0, incomeTaxBeforeCredit: 300_000, taxableIncomeForResident: 4_000_000 });
    expect(r.creditable).toBe(0);
    expect(r.fromIncomeTax).toBe(0);
    expect(r.fromResidentTax).toBe(0);
  });

  it('all credit spills to resident tax when income tax is zero (up to cap)', () => {
    const r = calcMortgageCredit({ yearEndBalance: 20_000_000, incomeTaxBeforeCredit: 0, taxableIncomeForResident: 5_000_000 });
    expect(r.fromIncomeTax).toBe(0);
    expect(r.fromResidentTax).toBe(MORTGAGE_RESIDENT_CAP_MAX); // 140,000 > 97,500 cap
    expect(r.unused).toBe(140_000 - MORTGAGE_RESIDENT_CAP_MAX);
  });

  it('dividend exactly at 10M uses the high rate fully', () => {
    const r = calcDividendCredit({ dividendIncome: 1_000_000, taxableTotalIncome: 10_000_000 });
    expect(r.incomeTax).toBe(100_000); // all high rate
  });

  it('dividend exceeding taxable income still applies (no negative low portion)', () => {
    const r = calcDividendCredit({ dividendIncome: 5_000_000, taxableTotalIncome: 3_000_000 });
    // over = max(0, 3M-10M)=0 → all high rate
    expect(r.incomeTax).toBe(Math.round(5_000_000 * 0.1));
  });
});

describe('resolveMortgageParams (居住年 × 性能区分)', () => {
  it('returns 1.0% for 令和2-3年 (2020-2021)', () => {
    expect(resolveMortgageParams(2020, 'standard')).toEqual({ rate: 0.01, balanceCap: 40_000_000 });
    expect(resolveMortgageParams(2021, 'used')).toEqual({ rate: 0.01, balanceCap: 20_000_000 });
  });

  it('returns 0.7% with performance-based caps for 令和4年以降', () => {
    expect(resolveMortgageParams(2022, 'long-life')).toEqual({ rate: 0.007, balanceCap: 50_000_000 });
    expect(resolveMortgageParams(2022, 'zeh')).toEqual({ rate: 0.007, balanceCap: 45_000_000 });
    expect(resolveMortgageParams(2022, 'standard')).toEqual({ rate: 0.007, balanceCap: 40_000_000 });
    expect(resolveMortgageParams(2022, 'used')).toEqual({ rate: 0.007, balanceCap: 30_000_000 });
  });

  it('non-standard new builds lose eligibility from 2024 (cap 0)', () => {
    expect(resolveMortgageParams(2023, 'non-standard')).toEqual({ rate: 0.007, balanceCap: 30_000_000 });
    expect(resolveMortgageParams(2024, 'non-standard')).toEqual({ rate: 0.007, balanceCap: 0 });
  });
});

describe('calcDividendCredit kinds (投信区分)', () => {
  it('mutual-fund uses half the stock rate', () => {
    const r = calcDividendCredit({ dividendIncome: 1_000_000, taxableTotalIncome: 5_000_000, kind: 'mutual-fund' });
    expect(r.incomeTax).toBe(50_000); // 5%
    expect(r.residentTax).toBe(14_000); // 1.4%
  });

  it('foreign-mutual-fund uses a quarter of the stock rate', () => {
    const r = calcDividendCredit({ dividendIncome: 1_000_000, taxableTotalIncome: 5_000_000, kind: 'foreign-mutual-fund' });
    expect(r.incomeTax).toBe(25_000); // 2.5%
    expect(r.residentTax).toBe(7_000); // 0.7%
  });

  it('defaults to stock when kind omitted', () => {
    const a = calcDividendCredit({ dividendIncome: 500_000, taxableTotalIncome: 5_000_000 });
    const b = calcDividendCredit({ dividendIncome: 500_000, taxableTotalIncome: 5_000_000, kind: 'stock' });
    expect(a).toEqual(b);
  });
});

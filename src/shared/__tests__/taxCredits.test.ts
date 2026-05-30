import { describe, expect, it } from 'vitest';
import {
  applyTaxCredits,
  calcAllTaxCredits,
  calcDividendCredit,
  calcMortgageCredit,
  MORTGAGE_RESIDENT_CAP_MAX,
} from '../taxCredits';

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

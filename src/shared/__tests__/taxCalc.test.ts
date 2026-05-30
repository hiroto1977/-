import { describe, expect, it } from 'vitest';
import {
  BASIC_DEDUCTION,
  calcConsumptionTax,
  calcIncomeTax,
  calcNetSalary,
  calcResidentTax,
  CONSUMPTION_TAX_REDUCED,
  RECONSTRUCTION_SURTAX_RATE,
  RESIDENT_TAX_PER_CAPITA,
  suggestTaxTips,
} from '../taxCalc';

describe('calcIncomeTax', () => {
  it('returns 0 for zero or negative taxable income', () => {
    expect(calcIncomeTax(0)).toBe(0);
    expect(calcIncomeTax(-100_000)).toBe(0);
  });

  it('applies the 5% bracket with reconstruction surtax', () => {
    // 1,000,000 × 5% = 50,000 → ×1.021 = 51,050
    expect(calcIncomeTax(1_000_000)).toBe(51_050);
  });

  it('applies the 20% bracket speed-table deduction', () => {
    // 5,000,000 × 20% − 427,500 = 572,500 → ×1.021 = 584,523 (rounded)
    expect(calcIncomeTax(5_000_000)).toBe(Math.round(572_500 * (1 + RECONSTRUCTION_SURTAX_RATE)));
  });

  it('applies the top 45% bracket above 40M', () => {
    const base = 50_000_000 * 0.45 - 4_796_000;
    expect(calcIncomeTax(50_000_000)).toBe(Math.round(base * (1 + RECONSTRUCTION_SURTAX_RATE)));
  });

  it('is monotonic across bracket boundaries', () => {
    expect(calcIncomeTax(3_300_001)).toBeGreaterThanOrEqual(calcIncomeTax(3_300_000));
    expect(calcIncomeTax(9_000_001)).toBeGreaterThanOrEqual(calcIncomeTax(9_000_000));
  });
});

describe('calcResidentTax', () => {
  it('returns only the per-capita levy for zero/negative income', () => {
    expect(calcResidentTax(0)).toBe(RESIDENT_TAX_PER_CAPITA);
    expect(calcResidentTax(-5_000)).toBe(RESIDENT_TAX_PER_CAPITA);
  });

  it('adds 10% income levy plus per-capita', () => {
    expect(calcResidentTax(3_000_000)).toBe(300_000 + RESIDENT_TAX_PER_CAPITA);
  });
});

describe('calcConsumptionTax', () => {
  it('returns 0 for zero/negative net amount', () => {
    expect(calcConsumptionTax(0)).toBe(0);
    expect(calcConsumptionTax(-1)).toBe(0);
  });

  it('computes 10% standard tax', () => {
    expect(calcConsumptionTax(10_000)).toBe(1_000);
  });

  it('computes 8% reduced tax', () => {
    expect(calcConsumptionTax(10_000, CONSUMPTION_TAX_REDUCED)).toBe(800);
  });
});

describe('calcNetSalary', () => {
  it('returns a per-capita-only resident tax for zero income', () => {
    const r = calcNetSalary(0);
    expect(r.takeHome).toBe(0);
    expect(r.residentTax).toBe(RESIDENT_TAX_PER_CAPITA);
    expect(r.incomeTax).toBe(0);
  });

  it('take-home is gross minus social insurance, income tax, resident tax', () => {
    const r = calcNetSalary(5_000_000);
    expect(r.gross).toBe(5_000_000);
    expect(r.socialInsurance).toBe(750_000);
    expect(r.takeHome).toBe(r.gross - r.socialInsurance - r.incomeTax - r.residentTax);
    expect(r.takeHome).toBeLessThan(r.gross);
    expect(r.takeHome).toBeGreaterThan(0);
  });

  it('uses the basic deduction (taxable income excludes it)', () => {
    // 額面が給与控除+社保+基礎控除以下なら所得税 0
    const r = calcNetSalary(1_000_000);
    expect(r.incomeTax).toBe(0);
    expect(BASIC_DEDUCTION).toBe(480_000);
  });
});

describe('suggestTaxTips', () => {
  it('always includes the universal three (iDeCo/ふるさと納税/NISA)', () => {
    const ids = suggestTaxTips(2_000_000).map((t) => t.id);
    expect(ids).toContain('ideco');
    expect(ids).toContain('furusato');
    expect(ids).toContain('nisa');
  });

  it('adds small-business plan above 3.3M', () => {
    expect(suggestTaxTips(3_300_000).map((t) => t.id)).toContain('small-biz');
    expect(suggestTaxTips(3_000_000).map((t) => t.id)).not.toContain('small-biz');
  });

  it('adds incorporation hint above 9M', () => {
    expect(suggestTaxTips(9_000_000).map((t) => t.id)).toContain('corp');
    expect(suggestTaxTips(8_000_000).map((t) => t.id)).not.toContain('corp');
  });
});

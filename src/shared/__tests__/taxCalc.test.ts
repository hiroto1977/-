import { describe, expect, it } from 'vitest';
import {
  BASIC_DEDUCTION,
  RESIDENT_BASIC_DEDUCTION,
  calcBasicDeduction,
  calcConsumptionTax,
  calcIncomeTax,
  calcNetSalary,
  calcResidentBasicDeduction,
  calcResidentTax,
  calcSalaryIncomeDeduction,
  calcSalaryWithDeductions,
  calcFurusatoResidentCredit,
  calcBaseIncomeTax,
  calcFinalIncomeTax,
  marginalIncomeTaxRate,
  CONSUMPTION_TAX_REDUCED,
  RECONSTRUCTION_SURTAX_RATE,
  RESIDENT_TAX_PER_CAPITA,
  suggestTaxTips,
  schemesForEntity,
  taxSchemeCatalog,
  complianceChecklist,
  COMPLIANCE_TOPICS,
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
    // 大きめの負値: ガードを外すと所得割が負に振れて per-capita とずれるため、
    // 早期 return ガードが必須であることを固定する。
    expect(calcResidentTax(-1_000_000)).toBe(RESIDENT_TAX_PER_CAPITA);
  });

  it('adds 10% income levy plus per-capita', () => {
    expect(calcResidentTax(3_000_000)).toBe(300_000 + RESIDENT_TAX_PER_CAPITA);
  });
});

describe('calcConsumptionTax', () => {
  it('returns 0 for zero/negative net amount', () => {
    expect(calcConsumptionTax(0)).toBe(0);
    expect(calcConsumptionTax(-1)).toBe(0);
    // 大きめの負値: ガードを外すと負の税額が出るため、早期 return を固定する。
    expect(calcConsumptionTax(-1_000_000)).toBe(0);
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

  it('exposes employment income and taxable income consistently', () => {
    const r = calcNetSalary(5_000_000);
    // 給与所得控除 = 5,000,000×20%+440,000 = 1,440,000
    expect(r.employmentIncome).toBe(5_000_000 - 1_440_000);
    // 課税所得 = 給与所得 - 社保(750,000) - 基礎控除(480,000)
    expect(r.taxableIncome).toBe(r.employmentIncome - r.socialInsurance - 480_000);
  });
});

describe('calcSalaryIncomeDeduction (令和2年分以降の正式テーブル)', () => {
  it('returns the 550,000 floor up to 1,625,000', () => {
    expect(calcSalaryIncomeDeduction(0)).toBe(0);
    expect(calcSalaryIncomeDeduction(1_000_000)).toBe(550_000);
    expect(calcSalaryIncomeDeduction(1_625_000)).toBe(550_000);
  });

  it('applies each official bracket formula', () => {
    expect(calcSalaryIncomeDeduction(1_800_000)).toBe(Math.round(1_800_000 * 0.4 - 100_000));
    expect(calcSalaryIncomeDeduction(3_600_000)).toBe(Math.round(3_600_000 * 0.3 + 80_000));
    expect(calcSalaryIncomeDeduction(6_600_000)).toBe(Math.round(6_600_000 * 0.2 + 440_000));
    expect(calcSalaryIncomeDeduction(8_500_000)).toBe(Math.round(8_500_000 * 0.1 + 1_100_000));
  });

  it('caps at 1,950,000 above 8,500,000', () => {
    expect(calcSalaryIncomeDeduction(8_500_001)).toBe(1_950_000);
    expect(calcSalaryIncomeDeduction(20_000_000)).toBe(1_950_000);
  });
});

describe('calcBasicDeduction (逓減)', () => {
  it('is 480,000 up to 24,000,000', () => {
    expect(calcBasicDeduction(0)).toBe(480_000);
    expect(calcBasicDeduction(24_000_000)).toBe(480_000);
  });

  it('steps down 320,000 / 160,000 / 0', () => {
    expect(calcBasicDeduction(24_000_001)).toBe(320_000);
    expect(calcBasicDeduction(24_500_000)).toBe(320_000);
    expect(calcBasicDeduction(24_500_001)).toBe(160_000);
    expect(calcBasicDeduction(25_000_000)).toBe(160_000);
    expect(calcBasicDeduction(25_000_001)).toBe(0);
  });
});

describe('calcResidentBasicDeduction (逓減)', () => {
  it('is 430,000 up to 24,000,000 then steps down', () => {
    expect(calcResidentBasicDeduction(24_000_000)).toBe(RESIDENT_BASIC_DEDUCTION);
    expect(calcResidentBasicDeduction(24_500_000)).toBe(290_000);
    expect(calcResidentBasicDeduction(25_000_000)).toBe(150_000);
    expect(calcResidentBasicDeduction(25_000_001)).toBe(0);
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

describe('taxSchemeCatalog', () => {
  it('returns entries with unique ids and required fields', () => {
    const cat = taxSchemeCatalog();
    expect(cat.length).toBeGreaterThan(0);
    const ids = cat.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length); // unique
    for (const s of cat) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.summary).toBeTruthy();
      expect(['corporation', 'sole-proprietor', 'both']).toContain(s.entity);
      expect(typeof s.needsAdvisor).toBe('boolean');
    }
  });

  it('flags high-risk schemes (micro-corp, family salary) as needsAdvisor', () => {
    const byId = new Map(taxSchemeCatalog().map((s) => [s.id, s]));
    expect(byId.get('both-micro-corp')?.needsAdvisor).toBe(true);
    expect(byId.get('sp-family-salary')?.needsAdvisor).toBe(true);
    expect(byId.get('sp-blue')?.needsAdvisor).toBe(false);
  });
});

describe('schemesForEntity', () => {
  it('includes both-entity schemes for corporations', () => {
    const ids = schemesForEntity('corporation').map((s) => s.id);
    expect(ids).toContain('corp-bankruptcy-kyosai'); // corp-only
    expect(ids).toContain('both-ideco'); // both
    expect(ids).not.toContain('sp-blue'); // sole-proprietor only
  });

  it('includes both-entity schemes for sole proprietors', () => {
    const ids = schemesForEntity('sole-proprietor').map((s) => s.id);
    expect(ids).toContain('sp-blue'); // sp-only
    expect(ids).toContain('both-ideco'); // both
    expect(ids).not.toContain('corp-bankruptcy-kyosai'); // corp only
  });
});

describe('complianceChecklist', () => {
  it('returns a checklist for every declared topic with non-empty items', () => {
    for (const topic of COMPLIANCE_TOPICS) {
      const cl = complianceChecklist(topic);
      expect(cl.topic).toBe(topic);
      expect(cl.title).toBeTruthy();
      expect(cl.caution).toBeTruthy();
      expect(cl.items.length).toBeGreaterThan(0);
      const ids = cl.items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length); // unique within topic
      for (const it of cl.items) {
        expect(it.id).toBeTruthy();
        expect(it.requirement).toBeTruthy();
        expect(it.why).toBeTruthy();
        if (it.officialUrl !== undefined) {
          expect(it.officialUrl.startsWith('https://')).toBe(true);
        }
      }
    }
  });

  it('micro-corp checklist covers substance and business separation', () => {
    const ids = complianceChecklist('micro-corp').items.map((i) => i.id);
    expect(ids).toContain('mc-substance');
    expect(ids).toContain('mc-separate');
  });

  it('family-transaction checklist covers fair price and 無償返還届出', () => {
    const ids = complianceChecklist('family-transaction').items.map((i) => i.id);
    expect(ids).toContain('ft-fair-price');
    expect(ids).toContain('ft-mukosho');
  });

  it('incorporation checklist covers a profitability simulation', () => {
    const ids = complianceChecklist('incorporation').items.map((i) => i.id);
    expect(ids).toContain('in-simulation');
  });

  it('exposes exactly the three known topics', () => {
    expect([...COMPLIANCE_TOPICS]).toEqual(['micro-corp', 'family-transaction', 'incorporation']);
  });
});

describe('marginalIncomeTaxRate', () => {
  it('returns 0 for non-positive income', () => {
    expect(marginalIncomeTaxRate(0)).toBe(0);
    expect(marginalIncomeTaxRate(-1)).toBe(0);
  });

  it('returns the bracket rate', () => {
    expect(marginalIncomeTaxRate(1_000_000)).toBe(0.05);
    expect(marginalIncomeTaxRate(5_000_000)).toBe(0.2);
    expect(marginalIncomeTaxRate(50_000_000)).toBe(0.45);
  });
});

describe('calcFurusatoResidentCredit', () => {
  it('returns 0 at or below the 2,000 floor', () => {
    expect(calcFurusatoResidentCredit(2_000, 300_000, 0.2)).toBe(0);
  });

  it('includes base 10% plus the special portion (capped at 20% of resident income levy)', () => {
    // donation 52,000, resident levy 300,000, marginal 0.2
    // base = 50,000×0.1 = 5,000
    // special = 50,000×(0.9 - 0.2×1.021) = 50,000×0.6958 = 34,790
    // specialCap = 300,000×0.2 = 60,000 → special kept
    expect(calcFurusatoResidentCredit(52_000, 300_000, 0.2)).toBe(Math.round(5_000 + 34_790));
  });

  it('caps the special portion at 20% of the resident income levy', () => {
    const credit = calcFurusatoResidentCredit(1_000_000, 100_000, 0.2);
    // special capped at 100,000×0.2=20,000; base=(1,000,000-2,000)×0.1=99,800
    expect(credit).toBe(Math.round(99_800 + 20_000));
  });
});

describe('calcSalaryWithDeductions', () => {
  it('returns per-capita resident tax and zero else for zero income', () => {
    const r = calcSalaryWithDeductions(0, 480_000, 430_000);
    expect(r.takeHome).toBe(0);
    expect(r.incomeTax).toBe(0);
    expect(r.residentTax).toBe(5_000);
  });

  it('computes take-home as gross minus income tax minus resident tax', () => {
    const r = calcSalaryWithDeductions(6_000_000, 1_300_000, 1_250_000);
    expect(r.gross).toBe(6_000_000);
    // 給与所得控除 6,000,000×20%+440,000 = 1,640,000
    expect(r.salaryDeduction).toBe(1_640_000);
    expect(r.employmentIncome).toBe(6_000_000 - 1_640_000);
    expect(r.takeHome).toBe(r.gross - r.incomeTax - r.residentTax);
    expect(r.takeHome).toBeLessThan(r.gross);
  });

  it('larger deductions reduce the tax (monotonic)', () => {
    const low = calcSalaryWithDeductions(6_000_000, 500_000, 500_000);
    const high = calcSalaryWithDeductions(6_000_000, 1_500_000, 1_500_000);
    expect(high.incomeTax).toBeLessThanOrEqual(low.incomeTax);
    expect(high.takeHome).toBeGreaterThanOrEqual(low.takeHome);
  });

  it('applies furusato resident credit to lower the resident tax', () => {
    const without = calcSalaryWithDeductions(6_000_000, 1_300_000, 1_250_000, 0);
    const withDonation = calcSalaryWithDeductions(6_000_000, 1_300_000, 1_250_000, 50_000);
    expect(withDonation.furusatoResidentCredit).toBeGreaterThan(0);
    expect(withDonation.residentTax).toBeLessThan(without.residentTax);
  });

  it('never drops resident tax below the per-capita levy', () => {
    const r = calcSalaryWithDeductions(3_000_000, 5_000_000, 5_000_000, 1_000_000);
    expect(r.residentTax).toBeGreaterThanOrEqual(5_000);
  });
});

describe('calcBaseIncomeTax / calcFinalIncomeTax (復興特別所得税の順序)', () => {
  it('base income tax excludes the surtax', () => {
    // 5,000,000 × 20% − 427,500 = 572,500 (基準税額)
    expect(calcBaseIncomeTax(5_000_000)).toBe(572_500);
    expect(calcBaseIncomeTax(0)).toBe(0);
    expect(calcBaseIncomeTax(-1)).toBe(0);
  });

  it('calcIncomeTax = base × 1.021 (consistency)', () => {
    for (const ti of [1_000_000, 5_000_000, 20_000_000]) {
      expect(calcIncomeTax(ti)).toBe(Math.round(calcBaseIncomeTax(ti) * (1 + RECONSTRUCTION_SURTAX_RATE)));
    }
  });

  it('applies credits BEFORE the surtax (correct order)', () => {
    // base 1,000,000, credit 500,000 → (1,000,000-500,000)×1.021 = 510,500
    expect(calcFinalIncomeTax(1_000_000, 500_000)).toBe(Math.round(500_000 * 1.021));
    // credit ≥ base → 0
    expect(calcFinalIncomeTax(300_000, 500_000)).toBe(0);
    // no credit → base × 1.021
    expect(calcFinalIncomeTax(1_000_000, 0)).toBe(Math.round(1_000_000 * 1.021));
  });

  it('differs from the wrong order (surtax then credit) by the surtax on the credit', () => {
    const base = 1_000_000;
    const credit = 500_000;
    const correct = calcFinalIncomeTax(base, credit); // (500,000)×1.021 = 510,500
    const wrong = Math.max(0, Math.round(base * 1.021) - credit); // 1,021,000-500,000 = 521,000
    expect(correct).toBeLessThan(wrong);
    expect(wrong - correct).toBe(Math.round(credit * RECONSTRUCTION_SURTAX_RATE));
  });
});

describe('boundary coverage — salary income deduction brackets', () => {
  it('switches continuously at each official boundary', () => {
    expect(calcSalaryIncomeDeduction(1_625_000)).toBe(550_000);
    expect(calcSalaryIncomeDeduction(1_625_001)).toBe(Math.round(1_625_001 * 0.4 - 100_000));
    expect(calcSalaryIncomeDeduction(1_800_001)).toBe(Math.round(1_800_001 * 0.3 + 80_000));
    expect(calcSalaryIncomeDeduction(3_600_001)).toBe(Math.round(3_600_001 * 0.2 + 440_000));
    expect(calcSalaryIncomeDeduction(6_600_001)).toBe(Math.round(6_600_001 * 0.1 + 1_100_000));
    expect(calcSalaryIncomeDeduction(8_500_000)).toBe(Math.round(8_500_000 * 0.1 + 1_100_000));
    expect(calcSalaryIncomeDeduction(8_500_001)).toBe(1_950_000);
  });
});

describe('boundary coverage — basic deduction tapering', () => {
  it('holds full amount just below 24M then steps down', () => {
    expect(calcBasicDeduction(23_999_999)).toBe(480_000);
    expect(calcBasicDeduction(24_000_001)).toBe(320_000);
    expect(calcBasicDeduction(24_499_999)).toBe(320_000);
    expect(calcBasicDeduction(24_500_001)).toBe(160_000);
    expect(calcBasicDeduction(24_999_999)).toBe(160_000);
    expect(calcBasicDeduction(25_000_001)).toBe(0);
    expect(calcResidentBasicDeduction(23_999_999)).toBe(RESIDENT_BASIC_DEDUCTION);
    expect(calcResidentBasicDeduction(24_000_001)).toBe(290_000);
    expect(calcResidentBasicDeduction(24_500_001)).toBe(150_000);
    expect(calcResidentBasicDeduction(25_000_001)).toBe(0);
    expect(BASIC_DEDUCTION).toBe(480_000);
  });
});

describe('boundary coverage — marginal income tax rate (all brackets)', () => {
  it('returns the bracket rate at each boundary and just above', () => {
    expect(marginalIncomeTaxRate(1_950_000)).toBe(0.05);
    expect(marginalIncomeTaxRate(1_950_001)).toBe(0.1);
    expect(marginalIncomeTaxRate(3_300_000)).toBe(0.1);
    expect(marginalIncomeTaxRate(3_300_001)).toBe(0.2);
    expect(marginalIncomeTaxRate(6_950_000)).toBe(0.2);
    expect(marginalIncomeTaxRate(6_950_001)).toBe(0.23);
    expect(marginalIncomeTaxRate(9_000_000)).toBe(0.23);
    expect(marginalIncomeTaxRate(9_000_001)).toBe(0.33);
    expect(marginalIncomeTaxRate(18_000_000)).toBe(0.33);
    expect(marginalIncomeTaxRate(18_000_001)).toBe(0.4);
    expect(marginalIncomeTaxRate(40_000_000)).toBe(0.4);
    expect(marginalIncomeTaxRate(40_000_001)).toBe(0.45);
  });
});

describe('boundary coverage — furusato resident credit special cap', () => {
  it('keeps the special portion when below the 20% cap', () => {
    // donation 10,000, levy 100,000, marginal 0.05
    // base = 8,000×0.1 = 800; special = 8,000×(0.9-0.05×1.021) ≈ 6,791; cap = 20,000 → no clip
    const expected = Math.round(800 + 8_000 * (0.9 - 0.05 * (1 + RECONSTRUCTION_SURTAX_RATE)));
    expect(calcFurusatoResidentCredit(10_000, 100_000, 0.05)).toBe(expected);
  });

  it('clips the special portion to 0 at very high marginal rates', () => {
    // marginal 0.9 → 0.9 - 0.9×1.021 < 0 → special floored to 0; only base remains
    const credit = calcFurusatoResidentCredit(100_000, 100_000, 0.9);
    expect(credit).toBe(Math.round((100_000 - 2_000) * 0.1));
  });
});

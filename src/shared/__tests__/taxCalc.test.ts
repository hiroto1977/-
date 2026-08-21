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
  floorTaxableThousand,
  calcResidentAdjustmentCredit,
  residentTaxExemption,
  marginalIncomeTaxRate,
  CONSUMPTION_TAX_REDUCED,
  RECONSTRUCTION_SURTAX_RATE,
  RESIDENT_TAX_RATE,
  RESIDENT_TAX_PER_CAPITA,
  RESIDENT_PER_CAPITA_BASE,
  FOREST_ENVIRONMENT_TAX,
  residentPerCapitaBreakdown,
  suggestTaxTips,
  schemesForEntity,
  taxSchemeCatalog,
  complianceChecklist,
  COMPLIANCE_TOPICS,
  type MunicipalityOverride,
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

  it('floors the taxable income to ¥1,000 before the 10% income levy', () => {
    // 3,000,999 は 3,000,000 として所得割を計算する (端数 999 切り捨て)。
    expect(calcResidentTax(3_000_999)).toBe(calcResidentTax(3_000_000));
    // 1,234,567 → 1,234,000 × 10% = 123,400 + 均等割。
    expect(calcResidentTax(1_234_567)).toBe(123_400 + RESIDENT_TAX_PER_CAPITA);
  });
});

describe('residentPerCapitaBreakdown (均等割 + 森林環境税の年度別内訳)', () => {
  it('2024年度以降: 基礎4,000 + 森林環境税1,000 = 5,000 (復興特別なし)', () => {
    const b = residentPerCapitaBreakdown(2024);
    expect(b.base).toBe(4_000);
    expect(b.reconstruction).toBe(0);
    expect(b.forestTax).toBe(1_000);
    expect(b.total).toBe(5_000);
  });

  it('2014-2023年度: 基礎4,000 + 復興特別1,000 = 5,000 (森林環境税なし)', () => {
    const b = residentPerCapitaBreakdown(2023);
    expect(b.reconstruction).toBe(1_000);
    expect(b.forestTax).toBe(0);
    expect(b.total).toBe(5_000);
    expect(residentPerCapitaBreakdown(2014).reconstruction).toBe(1_000);
  });

  it('keeps the total at 5,000 across the 2023→2024 swap (no double counting)', () => {
    expect(residentPerCapitaBreakdown(2023).total).toBe(residentPerCapitaBreakdown(2024).total);
    expect(residentPerCapitaBreakdown(2024).total).toBe(RESIDENT_TAX_PER_CAPITA);
  });

  it('before 2014: only the base 4,000 (neither surcharge)', () => {
    const b = residentPerCapitaBreakdown(2013);
    expect(b.reconstruction).toBe(0);
    expect(b.forestTax).toBe(0);
    expect(b.total).toBe(4_000);
  });

  it('exposes the base and forest-tax constants', () => {
    expect(RESIDENT_PER_CAPITA_BASE).toBe(4_000);
    expect(FOREST_ENVIRONMENT_TAX).toBe(1_000);
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
  // 年分を明示する。既定は現在の年なので、渡さないと暦が変わった日に落ちる。
  it('golden: exact employment income / taxable income / residentTax for 5,000,000 (令和8年分)', () => {
    const r = calcNetSalary(5_000_000, 2026);
    expect(r.employmentIncome).toBe(3_560_000); // 5,000,000 − 給与所得控除 1,440,000
    // 基礎控除は令和8年分の時限加算で 104 万円 (合計所得 489 万円以下)。
    // 改正前の 48 万円なら 2,330,000 だった。
    expect(r.taxableIncome).toBe(1_770_000); // 3,560,000 − 社保 750,000 − 基礎 1,040,000
    // 1,770,000 × 5% × 1.021 = 90,358。
    expect(r.incomeTax).toBe(90_358);
    // **住民税は変わらない。** 住民税の基礎控除 43 万円は据え置きで、
    // 所得税だけが動いている。ここが一緒に動いたら直しすぎている。
    expect(r.residentTax).toBe(243_000);
    expect(r.takeHome).toBe(3_916_642);
  });

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
    expect(BASIC_DEDUCTION).toBe(620_000);
  });

  it('exposes employment income and taxable income consistently (令和8年分)', () => {
    const r = calcNetSalary(5_000_000, 2026);
    // 給与所得控除 = 5,000,000×20%+440,000 = 1,440,000
    expect(r.employmentIncome).toBe(5_000_000 - 1_440_000);
    // 課税所得 = 給与所得 − 社保(750,000) − 基礎控除(1,040,000)
    expect(r.taxableIncome).toBe(r.employmentIncome - r.socialInsurance - 1_040_000);
  });
});

describe('精度境界: 調整控除 / 限界税率 / ふるさと納税控除', () => {
  it('resident adjustment credit: 2,000万 tier boundary and the 2,500万 cutoff', () => {
    // 課税所得 25,000,000 (>200万) → max(2500, (50000-2300万)×5%) = 2500
    expect(calcResidentAdjustmentCredit(25_000_000, 50_000)).toBe(2_500);
    // ちょうど 200万 (≤200万) → min(40000, 200万)×5% = 2000 (下限2500を適用しない側)
    expect(calcResidentAdjustmentCredit(2_000_000, 40_000)).toBe(2_000);
    // 200万+1 (>200万) → 下限 2500 が効く
    expect(calcResidentAdjustmentCredit(2_000_001, 40_000)).toBe(2_500);
    // 2,500万超 → 0
    expect(calcResidentAdjustmentCredit(25_000_001, 50_000)).toBe(0);
  });

  it('marginal income tax rate: 0 income → 0%, then bracket rates', () => {
    expect([0, 1_000_000, 1_950_000, 1_950_001, 4_000_000].map((t) => marginalIncomeTaxRate(t)))
      .toEqual([0, 0.05, 0.05, 0.1, 0.2]);
  });

  it('furusato resident credit: base + capped special, and ≤2,000円は0', () => {
    // base=(50000-2000)×0.1=4800, special=48000×(0.9-0.2×1.021)=33398.4, cap=300000×0.2=60000
    expect(calcFurusatoResidentCredit(50_000, 300_000, 0.2)).toBe(38_198);
    expect(calcFurusatoResidentCredit(2_000, 300_000, 0.2)).toBe(0);
  });
});

/*
 * 給与所得控除。**年分を明示して呼ぶ。**
 *
 * 既定の年分は `new Date().getFullYear()` なので、年分を渡さずに固定値を
 * 期待すると、暦が変わった日に理由もなく落ちるか、より悪いことに
 * 「新しい年分の値を古い年分の期待値で通してしまう」。
 */
describe('calcSalaryIncomeDeduction — 令和6年分以前の表', () => {
  it('returns the 550,000 floor up to 1,625,000', () => {
    expect(calcSalaryIncomeDeduction(0, 2024)).toBe(0);
    expect(calcSalaryIncomeDeduction(1_000_000, 2024)).toBe(550_000);
    expect(calcSalaryIncomeDeduction(1_625_000, 2024)).toBe(550_000);
  });

  it('applies each official bracket formula', () => {
    expect(calcSalaryIncomeDeduction(1_800_000, 2024)).toBe(Math.round(1_800_000 * 0.4 - 100_000));
    expect(calcSalaryIncomeDeduction(3_600_000, 2024)).toBe(Math.round(3_600_000 * 0.3 + 80_000));
    expect(calcSalaryIncomeDeduction(6_600_000, 2024)).toBe(Math.round(6_600_000 * 0.2 + 440_000));
    expect(calcSalaryIncomeDeduction(8_500_000, 2024)).toBe(Math.round(8_500_000 * 0.1 + 1_100_000));
  });

  it('caps at 1,950,000 above 8,500,000', () => {
    expect(calcSalaryIncomeDeduction(8_500_001, 2024)).toBe(1_950_000);
    expect(calcSalaryIncomeDeduction(20_000_000, 2024)).toBe(1_950_000);
  });
});

describe('calcBasicDeduction — 令和6年分以前と逓減部分', () => {
  it('is 480,000 up to 24,000,000', () => {
    expect(calcBasicDeduction(0, 2024)).toBe(480_000);
    expect(calcBasicDeduction(24_000_000, 2024)).toBe(480_000);
  });

  it('steps down 320,000 / 160,000 / 0', () => {
    expect(calcBasicDeduction(24_000_001, 2024)).toBe(320_000);
    expect(calcBasicDeduction(24_500_000, 2024)).toBe(320_000);
    expect(calcBasicDeduction(24_500_001, 2024)).toBe(160_000);
    expect(calcBasicDeduction(25_000_000, 2024)).toBe(160_000);
    expect(calcBasicDeduction(25_000_001, 2024)).toBe(0);
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
  it('golden: full breakdown incl. adjustment & furusato credit', () => {
    const r = calcSalaryWithDeductions(6_000_000, 1_100_000, 1_030_000, 30_000, 50_000, 0);
    expect(r.taxableIncomeForResidentTax).toBe(3_330_000);
    expect(r.baseIncomeTax).toBe(228_500);
    expect(r.incomeTax).toBe(233_298);
    expect(r.residentIncomeLevy).toBe(333_000);
    expect(r.adjustmentCredit).toBe(2_500);
    expect(r.furusatoResidentCredit).toBe(25_141);
    expect(r.residentTax).toBe(310_359);
    expect(r.takeHome).toBe(5_456_343);
  });

  it('caps the furusato special portion at (住民税所得割 − 調整控除)×20%', () => {
    // 大口寄附で特例分が上限拘束。base 19,800 + cap (333,000−2,500)×20%=66,100 = 85,900。
    const r = calcSalaryWithDeductions(6_000_000, 1_100_000, 1_030_000, 200_000, 50_000, 0);
    expect(r.furusatoResidentCredit).toBe(85_900);
  });

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

describe('課税所得の1,000円未満切り捨て (floorTaxableThousand / calcBaseIncomeTax)', () => {
  it('floors taxable income down to the nearest 1,000 yen', () => {
    expect(floorTaxableThousand(1_999_999)).toBe(1_999_000);
    expect(floorTaxableThousand(2_000_000)).toBe(2_000_000);
    expect(floorTaxableThousand(2_000_001)).toBe(2_000_000);
    expect(floorTaxableThousand(999)).toBe(0);
  });

  it('returns 0 for zero or negative income', () => {
    expect(floorTaxableThousand(0)).toBe(0);
    expect(floorTaxableThousand(-1)).toBe(0);
    expect(floorTaxableThousand(-50_000)).toBe(0);
  });

  it('calcBaseIncomeTax floors the 1,000-yen remainder before the speed table', () => {
    // 3,000,500 は課税所得 3,000,000 として計算される (端数 500 切り捨て)。
    expect(calcBaseIncomeTax(3_000_500)).toBe(calcBaseIncomeTax(3_000_000));
    // 5% ブラケット: 1,234,999 → 1,234,000 × 5% = 61,700。
    expect(calcBaseIncomeTax(1_234_999)).toBe(Math.round(1_234_000 * 0.05));
  });

  it('the floored remainder lowers the tax versus the unfloored amount', () => {
    // 端数を含む場合、切り捨て後の税額は素朴な (端数込み×税率) より小さい。
    const naive = Math.round(1_234_999 * 0.05);
    expect(calcBaseIncomeTax(1_234_999)).toBeLessThan(naive);
  });
});

describe('boundary coverage — salary income deduction brackets', () => {
  it('switches continuously at each official boundary', () => {
    expect(calcSalaryIncomeDeduction(1_625_000, 2024)).toBe(550_000);
    expect(calcSalaryIncomeDeduction(1_625_001, 2024)).toBe(Math.round(1_625_001 * 0.4 - 100_000));
    expect(calcSalaryIncomeDeduction(1_800_001, 2024)).toBe(Math.round(1_800_001 * 0.3 + 80_000));
    expect(calcSalaryIncomeDeduction(3_600_001, 2024)).toBe(Math.round(3_600_001 * 0.2 + 440_000));
    expect(calcSalaryIncomeDeduction(6_600_001, 2024)).toBe(Math.round(6_600_001 * 0.1 + 1_100_000));
    expect(calcSalaryIncomeDeduction(8_500_000, 2024)).toBe(Math.round(8_500_000 * 0.1 + 1_100_000));
    expect(calcSalaryIncomeDeduction(8_500_001, 2024)).toBe(1_950_000);
  });
});

describe('boundary coverage — basic deduction tapering', () => {
  it('holds full amount just below 24M then steps down', () => {
    expect(calcBasicDeduction(23_999_999)).toBe(480_000);
    expect(calcBasicDeduction(24_000_001, 2024)).toBe(320_000);
    expect(calcBasicDeduction(24_499_999)).toBe(320_000);
    expect(calcBasicDeduction(24_500_001, 2024)).toBe(160_000);
    expect(calcBasicDeduction(24_999_999)).toBe(160_000);
    expect(calcBasicDeduction(25_000_001, 2024)).toBe(0);
    expect(calcResidentBasicDeduction(23_999_999)).toBe(RESIDENT_BASIC_DEDUCTION);
    expect(calcResidentBasicDeduction(24_000_001)).toBe(290_000);
    expect(calcResidentBasicDeduction(24_500_001)).toBe(150_000);
    expect(calcResidentBasicDeduction(25_000_001)).toBe(0);
    expect(BASIC_DEDUCTION).toBe(620_000);
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

describe('calcResidentAdjustmentCredit (住民税の調整控除)', () => {
  it('returns 0 for non-positive income or diff', () => {
    expect(calcResidentAdjustmentCredit(0, 50_000)).toBe(0);
    expect(calcResidentAdjustmentCredit(3_000_000, 0)).toBe(0);
  });

  it('income ≤ 200万: min(diff, income) × 5%', () => {
    // diff 50,000, income 1,000,000 → min(50,000, 1,000,000)=50,000 ×5% = 2,500
    expect(calcResidentAdjustmentCredit(1_000_000, 50_000)).toBe(2_500);
    // diff 50,000, income 30,000 → min=30,000 ×5% = 1,500
    expect(calcResidentAdjustmentCredit(30_000, 50_000)).toBe(1_500);
  });

  it('income > 200万: {diff − (income − 200万)} × 5%, floored at 2,500', () => {
    // diff 50,000, income 2,200,000 → 50,000 - 200,000 = -150,000 → ×5% negative → floor 2,500
    expect(calcResidentAdjustmentCredit(2_200_000, 50_000)).toBe(2_500);
    // diff 250,000, income 2,100,000 → 250,000 - 100,000 = 150,000 ×5% = 7,500
    expect(calcResidentAdjustmentCredit(2_100_000, 250_000)).toBe(7_500);
  });

  it('returns 0 above 2,500万 income', () => {
    expect(calcResidentAdjustmentCredit(25_000_001, 50_000)).toBe(0);
  });
});

describe('residentTaxExemption (住民税の非課税限度額)', () => {
  it('single person: exempt at or below 45万 total income', () => {
    expect(residentTaxExemption(450_000, 0)).toEqual({ perCapitaExempt: true, incomeLevyExempt: true });
    expect(residentTaxExemption(450_001, 0)).toEqual({ perCapitaExempt: false, incomeLevyExempt: false });
  });

  it('with dependents uses 35万×人数 + 31万 (均等割) / +42万 (所得割)', () => {
    // 1 dependent → persons 2. 均等割限度 = 35万×2+31万 = 101万; 所得割限度 = 35万×2+42万 = 112万
    expect(residentTaxExemption(1_010_000, 1)).toEqual({ perCapitaExempt: true, incomeLevyExempt: true });
    expect(residentTaxExemption(1_010_001, 1)).toEqual({ perCapitaExempt: false, incomeLevyExempt: true });
    expect(residentTaxExemption(1_120_000, 1)).toEqual({ perCapitaExempt: false, incomeLevyExempt: true });
    expect(residentTaxExemption(1_120_001, 1)).toEqual({ perCapitaExempt: false, incomeLevyExempt: false });
  });

  it('high income is fully taxable', () => {
    expect(residentTaxExemption(5_000_000, 0)).toEqual({ perCapitaExempt: false, incomeLevyExempt: false });
  });
});

describe('calcSalaryWithDeductions resident-tax exemption integration', () => {
  it('drops resident tax to 0 for a low-income single person', () => {
    // gross 900,000 → employment 350,000 < 450,000 → 非課税
    const r = calcSalaryWithDeductions(900_000, 480_000, 430_000, 0, 50_000, 0);
    expect(r.residentTax).toBe(0);
    expect(r.residentIncomeLevy).toBe(0);
  });

  it('keeps resident tax for a normal income', () => {
    const r = calcSalaryWithDeductions(6_000_000, 1_300_000, 1_250_000, 0, 50_000, 0);
    expect(r.residentTax).toBeGreaterThan(0);
  });
});

// ============================================================
// 住民税の自治体オーバーライド (MunicipalityOverride) テスト
// ============================================================

describe('calcResidentTax — MunicipalityOverride (自治体オーバーライド)', () => {
  // --- 既定挙動: オーバーライド未指定は標準定数と完全一致 ---

  it('既存呼び出しと同じ結果: override なし = 標準定数', () => {
    const income = 3_000_000;
    // 既存の呼び出しと同じ結果を返すこと (既定挙動の不変性を確認)。
    expect(calcResidentTax(income)).toBe(calcResidentTax(income, undefined));
    expect(calcResidentTax(0)).toBe(calcResidentTax(0, undefined));
    expect(calcResidentTax(-1_000)).toBe(calcResidentTax(-1_000, undefined));
  });

  it('空の override オブジェクトは標準定数にフォールバック', () => {
    const override: MunicipalityOverride = {};
    const income = 5_000_000;
    expect(calcResidentTax(income, override)).toBe(calcResidentTax(income));
  });

  // --- incomeRate オーバーライド ---

  it('incomeRate=0.08 (例: 低率自治体) で所得割が変わる', () => {
    const income = 3_000_000;
    // 3,000,000 × 8% = 240,000 + 5,000 = 245,000
    expect(calcResidentTax(income, { incomeRate: 0.08 })).toBe(240_000 + RESIDENT_TAX_PER_CAPITA);
    // 標準 (10%) より低い
    expect(calcResidentTax(income, { incomeRate: 0.08 })).toBeLessThan(calcResidentTax(income));
  });

  it('incomeRate=0.12 (例: 高率自治体) で所得割が変わる', () => {
    const income = 3_000_000;
    // 3,000,000 × 12% = 360,000 + 5,000 = 365,000
    expect(calcResidentTax(income, { incomeRate: 0.12 })).toBe(360_000 + RESIDENT_TAX_PER_CAPITA);
    // 標準 (10%) より高い
    expect(calcResidentTax(income, { incomeRate: 0.12 })).toBeGreaterThan(calcResidentTax(income));
  });

  it('incomeRate=0 は所得割なし (均等割のみ)', () => {
    const income = 5_000_000;
    // 所得割 0 + 均等割 5,000 = 5,000
    expect(calcResidentTax(income, { incomeRate: 0 })).toBe(RESIDENT_TAX_PER_CAPITA);
  });

  it('incomeRate は 1,000 円未満を切り捨てた課税所得に適用される', () => {
    const income = 3_000_999;
    // 3,000,999 → 3,000,000 × 8% = 240,000 + 5,000 = 245,000
    expect(calcResidentTax(income, { incomeRate: 0.08 })).toBe(240_000 + RESIDENT_TAX_PER_CAPITA);
    // 端数 999 を含む場合も 3,000,000 に切り捨てた結果と一致
    expect(calcResidentTax(income, { incomeRate: 0.08 })).toBe(
      calcResidentTax(3_000_000, { incomeRate: 0.08 }),
    );
  });

  // --- perCapita オーバーライド ---

  it('perCapita=6_000 (例: 上乗せ自治体) で均等割が変わる', () => {
    const income = 3_000_000;
    // 3,000,000 × 10% = 300,000 + 6,000 = 306,000
    expect(calcResidentTax(income, { perCapita: 6_000 })).toBe(300_000 + 6_000);
    // 標準 (5,000) より高い
    expect(calcResidentTax(income, { perCapita: 6_000 })).toBeGreaterThan(calcResidentTax(income));
  });

  it('perCapita=4_000 (例: 森林環境税なしの旧基礎のみ相当) で均等割が変わる', () => {
    const income = 3_000_000;
    expect(calcResidentTax(income, { perCapita: 4_000 })).toBe(300_000 + 4_000);
  });

  it('perCapita=0 は均等割なし (所得割のみ)', () => {
    const income = 3_000_000;
    expect(calcResidentTax(income, { perCapita: 0 })).toBe(300_000);
  });

  // --- 両方オーバーライド ---

  it('incomeRate と perCapita を同時にオーバーライドできる', () => {
    const income = 2_000_000;
    // 2,000,000 × 9% = 180,000 + 4_500 = 184,500
    expect(calcResidentTax(income, { incomeRate: 0.09, perCapita: 4_500 })).toBe(180_000 + 4_500);
    // 標準計算とは異なる
    expect(calcResidentTax(income, { incomeRate: 0.09, perCapita: 4_500 })).not.toBe(
      calcResidentTax(income),
    );
  });

  // --- 非課税所得へのオーバーライド ---

  it('taxableIncome <= 0 のときは perCapita オーバーライドが返る', () => {
    // 課税所得 0 以下は均等割のみ。オーバーライドの perCapita が適用される。
    expect(calcResidentTax(0, { perCapita: 6_000 })).toBe(6_000);
    expect(calcResidentTax(-1_000, { perCapita: 3_000 })).toBe(3_000);
    // incomeRate はこの経路では使われない (所得割 0)。
    expect(calcResidentTax(0, { incomeRate: 0.12, perCapita: 5_500 })).toBe(5_500);
  });

  // --- 入力ガード: 不正値は標準にフォールバック ---

  it('負の incomeRate は標準 RESIDENT_TAX_RATE にフォールバック', () => {
    const income = 3_000_000;
    expect(calcResidentTax(income, { incomeRate: -0.05 })).toBe(calcResidentTax(income));
  });

  it('NaN の incomeRate は標準 RESIDENT_TAX_RATE にフォールバック', () => {
    const income = 3_000_000;
    expect(calcResidentTax(income, { incomeRate: NaN })).toBe(calcResidentTax(income));
  });

  it('Infinity の incomeRate は標準 RESIDENT_TAX_RATE にフォールバック', () => {
    const income = 3_000_000;
    expect(calcResidentTax(income, { incomeRate: Infinity })).toBe(calcResidentTax(income));
    expect(calcResidentTax(income, { incomeRate: -Infinity })).toBe(calcResidentTax(income));
  });

  it('負の perCapita は標準 RESIDENT_TAX_PER_CAPITA にフォールバック', () => {
    const income = 3_000_000;
    expect(calcResidentTax(income, { perCapita: -1_000 })).toBe(calcResidentTax(income));
  });

  it('NaN の perCapita は標準 RESIDENT_TAX_PER_CAPITA にフォールバック', () => {
    const income = 3_000_000;
    expect(calcResidentTax(income, { perCapita: NaN })).toBe(calcResidentTax(income));
  });

  it('Infinity の perCapita は標準 RESIDENT_TAX_PER_CAPITA にフォールバック', () => {
    const income = 3_000_000;
    expect(calcResidentTax(income, { perCapita: Infinity })).toBe(calcResidentTax(income));
  });

  // --- 定数の参照整合性 ---

  it('RESIDENT_TAX_RATE を incomeRate に渡すと override なしと同じ結果', () => {
    const income = 4_000_000;
    expect(calcResidentTax(income, { incomeRate: RESIDENT_TAX_RATE })).toBe(calcResidentTax(income));
  });

  it('RESIDENT_TAX_PER_CAPITA を perCapita に渡すと override なしと同じ結果', () => {
    const income = 4_000_000;
    expect(calcResidentTax(income, { perCapita: RESIDENT_TAX_PER_CAPITA })).toBe(
      calcResidentTax(income),
    );
  });
});

// --- 速算表の連続性 ----------------------------------------------------
//
// 境界を `<=` から `<` に変えても税額が変わらない。これは実装の緩さでは
// なく、**速算表がそう作られている**からである (控除額の列は、境界で
// 前後の式が一致するように決まっている)。
//
// つまり境界の不等号は測れない。代わりに「なぜ測れないのか」＝連続性
// そのものを検査にした。控除額の定数を打ち間違えると表が不連続になり、
// ここが落ちる。境界を 1 点ずつ突くより、こちらのほうが実際の危険
// (定数の写し間違い) に近い。


describe('所得税の速算表は境界で連続している', () => {
  const BOUNDARIES = [1_950_000, 3_300_000, 6_950_000, 9_000_000, 18_000_000, 40_000_000];

  it.each(BOUNDARIES)('%d 円ちょうどの前後で税額が跳ばない', (boundary) => {
    // 課税所得は 1,000 円未満切捨てなので、境界を跨ぐ最小の一歩は 1,000 円。
    const at = calcBaseIncomeTax(boundary);
    const over = calcBaseIncomeTax(boundary + 1_000);
    const under = calcBaseIncomeTax(boundary - 1_000);

    expect(at).toBeGreaterThan(under);
    expect(over).toBeGreaterThan(at);
    // 跳びが無い = 1,000 円ぶんの増分が、上下の税率で挟まれた範囲に収まる
    const stepUp = over - at;
    const stepDown = at - under;
    expect(stepUp).toBeGreaterThanOrEqual(stepDown);
    expect(stepUp).toBeLessThanOrEqual(1_000 * 0.45);
  });

  it('境界ちょうどは低いほうの税率で計算する', () => {
    // 195 万ちょうど → 5% ブラケット。表が連続なので金額では区別できないが、
    // 限界税率は区別できる (ふるさと納税の特例分の計算に効く)。
    expect(marginalIncomeTaxRate(1_950_000)).toBe(0.05);
    expect(marginalIncomeTaxRate(1_951_000)).toBe(0.1);
    expect(marginalIncomeTaxRate(40_000_000)).toBe(0.4);
    expect(marginalIncomeTaxRate(40_001_000)).toBe(0.45);
  });
});

describe('給与所得控除の表は境界で連続している', () => {
  const BOUNDARIES = [1_625_000, 1_800_000, 3_600_000, 6_600_000, 8_500_000];

  it.each(BOUNDARIES)('%d 円ちょうどの前後で控除額が跳ばない', (boundary) => {
    const at = calcSalaryIncomeDeduction(boundary);
    const over = calcSalaryIncomeDeduction(boundary + 1);
    const under = calcSalaryIncomeDeduction(boundary - 1);
    // 1 円動かしたら控除も 1 円以内しか動かない = 段差が無い
    expect(Math.abs(over - at)).toBeLessThanOrEqual(1);
    expect(Math.abs(at - under)).toBeLessThanOrEqual(1);
  });

  it('各区分の代表値を国税庁の表と突き合わせる', () => {
    // 定数を打ち間違えると連続性の検査は通っても値がずれるので、
    // 区分ごとの代表値も固定する。
    expect(calcSalaryIncomeDeduction(1_625_000, 2024)).toBe(550_000);
    expect(calcSalaryIncomeDeduction(1_800_000, 2024)).toBe(620_000);
    expect(calcSalaryIncomeDeduction(3_600_000, 2024)).toBe(1_160_000);
    expect(calcSalaryIncomeDeduction(6_600_000, 2024)).toBe(1_760_000);
    expect(calcSalaryIncomeDeduction(8_500_000, 2024)).toBe(1_950_000);
    expect(calcSalaryIncomeDeduction(20_000_000, 2024)).toBe(1_950_000); // 上限で頭打ち
  });

  /*
   * 令和7年分からの表。最低保障が 55 万円 → 65 万円になり、対象が
   * 162.5 万円以下 → **190 万円以下**へ広がった。
   */
  it('令和7年分以降は 190 万円以下が一律 65 万円', () => {
    for (const gross of [1, 1_000_000, 1_625_000, 1_800_000, 1_900_000]) {
      expect(calcSalaryIncomeDeduction(gross, 2025)).toBe(650_000);
      expect(calcSalaryIncomeDeduction(gross, 2026)).toBe(650_000);
    }
    // 190 万円を超えると上の段 (0.3x+8万) へ移る。
    expect(calcSalaryIncomeDeduction(1_900_001, 2026)).toBe(Math.round(1_900_001 * 0.3 + 80_000));
  });

  it('190 万円は新旧どちらの表でも 65 万円 — 表は連続したまま', () => {
    // 190 万円 × 0.3 + 8 万 = 65 万。改正はこの交点を選んで下 2 段を
    // 一律 65 万円に畳んだので、境界に段差が生まれていない。
    expect(calcSalaryIncomeDeduction(1_900_000, 2024)).toBe(650_000);
    expect(calcSalaryIncomeDeduction(1_900_000, 2026)).toBe(650_000);
  });

  it('190 万円超の段は改正されていない', () => {
    for (const gross of [3_600_000, 6_600_000, 8_500_000, 20_000_000]) {
      expect(calcSalaryIncomeDeduction(gross, 2026)).toBe(calcSalaryIncomeDeduction(gross, 2024));
    }
  });
});

// --- 入力ガード --------------------------------------------------------

describe('calcResidentAdjustmentCredit — 負の入力', () => {
  it('課税所得が負なら控除は 0 (マイナスの控除を返さない)', () => {
    // 入口で弾かないと `min(人的控除差, 課税所得) × 5%` が負になり、
    // 「控除なのに税額を増やす」値が返る。
    expect(calcResidentAdjustmentCredit(-100, 50_000)).toBe(0);
    expect(calcResidentAdjustmentCredit(-1, 1)).toBe(0);
  });
});

// --- 節税カタログの「税理士必須」表示 ----------------------------------

describe('taxSchemeCatalog — needsAdvisor', () => {
  it('個別相談が必須の制度だけに印を付ける', () => {
    // この旗は「自己判断で実行しないこと」を利用者へ伝えるためのもの。
    // 立て忘れ・立て過ぎのどちらも実害があるので、全件を固定する。
    const flags = Object.fromEntries(taxSchemeCatalog().map((s) => [s.id, s.needsAdvisor]));
    expect(flags).toEqual({
      'corp-bankruptcy-kyosai': false,
      'corp-officer-salary': false,
      'corp-company-housing': true,
      'corp-investment-tax': false,
      'corp-bonus': false,
      'sp-blue': false,
      'sp-family-salary': true,
      'sp-small-depreciation': false,
      'sp-loss-carryover': false,
      'both-small-biz-kyosai': false,
      'both-ideco': false,
      'both-furusato': false,
      'both-incorporation': true,
      'both-micro-corp': true,
    });
  });
});

/*
 * 基礎控除の年分別の段階。
 *
 * 2 年続けて改正され、しかも令和8・9年分だけの時限加算が入っている。
 * 「今年いくらか」を 1 つ持つ形にすると必ず古くなるので、年分で選ぶ。
 * 2026-08 の監査時点で、ここは令和6年分の 48 万円のままだった。
 */
describe('calcBasicDeduction — 年分ごとの段階', () => {
  it('令和6年分以前は一律 48 万円', () => {
    for (const income of [0, 1_320_000, 5_000_000, 23_500_000, 24_000_000]) {
      expect(calcBasicDeduction(income, 2024)).toBe(480_000);
    }
  });

  it('令和7年分は 95 / 88 / 68 / 63 / 58 万円の 5 段', () => {
    expect(calcBasicDeduction(1_320_000, 2025)).toBe(950_000);
    expect(calcBasicDeduction(1_320_001, 2025)).toBe(880_000);
    expect(calcBasicDeduction(3_360_000, 2025)).toBe(880_000);
    expect(calcBasicDeduction(3_360_001, 2025)).toBe(680_000);
    expect(calcBasicDeduction(4_890_000, 2025)).toBe(680_000);
    expect(calcBasicDeduction(4_890_001, 2025)).toBe(630_000);
    expect(calcBasicDeduction(6_550_000, 2025)).toBe(630_000);
    expect(calcBasicDeduction(6_550_001, 2025)).toBe(580_000);
    expect(calcBasicDeduction(23_500_000, 2025)).toBe(580_000);
  });

  it('令和8・9年分は本則 62 万円 + 時限加算 (104 / 67)', () => {
    for (const year of [2026, 2027]) {
      expect(calcBasicDeduction(0, year)).toBe(1_040_000);
      expect(calcBasicDeduction(4_890_000, year)).toBe(1_040_000);
      expect(calcBasicDeduction(4_890_001, year)).toBe(670_000);
      expect(calcBasicDeduction(6_550_000, year)).toBe(670_000);
      expect(calcBasicDeduction(6_550_001, year)).toBe(620_000);
      expect(calcBasicDeduction(23_500_000, year)).toBe(620_000);
    }
  });

  it('令和10年分以後は加算が 132 万円以下だけになる (99 / 62)', () => {
    for (const year of [2028, 2030]) {
      expect(calcBasicDeduction(1_320_000, year)).toBe(990_000);
      expect(calcBasicDeduction(1_320_001, year)).toBe(620_000);
      expect(calcBasicDeduction(23_500_000, year)).toBe(620_000);
    }
  });

  it('2,350 万円超の逓減はどの年分でも同じ (改正されていない)', () => {
    for (const year of [2024, 2025, 2026, 2028]) {
      expect(calcBasicDeduction(23_500_001, year)).toBe(480_000);
      expect(calcBasicDeduction(24_000_000, year)).toBe(480_000);
      expect(calcBasicDeduction(24_000_001, year)).toBe(320_000);
      expect(calcBasicDeduction(24_500_000, year)).toBe(320_000);
      expect(calcBasicDeduction(24_500_001, year)).toBe(160_000);
      expect(calcBasicDeduction(25_000_000, year)).toBe(160_000);
      expect(calcBasicDeduction(25_000_001, year)).toBe(0);
    }
  });

  it('負の合計所得は 0 として扱う', () => {
    expect(calcBasicDeduction(-1, 2026)).toBe(1_040_000);
  });

  it('住民税の基礎控除は年分で動かない (据え置き)', () => {
    // 所得税だけが動いている。ここを一緒に動かすと住民税が過少になる。
    for (const income of [0, 5_000_000, 23_500_000]) {
      expect(calcResidentBasicDeduction(income)).toBe(430_000);
    }
  });
});

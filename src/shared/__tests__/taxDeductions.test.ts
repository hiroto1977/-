import { describe, expect, it } from 'vitest';
import {
  calcAllDeductions,
  calcDependentDeduction,
  calcDependentDeductionWithIncome,
  DEPENDENT_INCOME_LIMIT,
  calcDonationDeduction,
  calcEarthquakeInsuranceDeduction,
  calcLifeInsuranceDeduction,
  calcMedicalDeduction,
  calcSelfMedicationDeduction,
  chooseMedicalDeductionScheme,
  clampIdecoContribution,
  clampSmallBizMutualAid,
  IDECO_ANNUAL_CAPS,
  SMALL_BIZ_MUTUAL_ANNUAL_CAP,
  SELF_MEDICATION_THRESHOLD,
  SELF_MEDICATION_CAP,
  calcSpouseDeduction,
  dependentDeduction,
  disabilityDeduction,
  SINGLE_PARENT_DEDUCTION,
  WIDOW_DEDUCTION,
} from '../taxDeductions';

describe('calcSpouseDeduction', () => {
  it('gives full 38万/33万 when spouse income ≤48万 and self ≤900万', () => {
    expect(calcSpouseDeduction(5_000_000, 0)).toEqual({ incomeTax: 380_000, residentTax: 330_000 });
  });

  it('gives elderly spouse 48万/38万', () => {
    expect(calcSpouseDeduction(5_000_000, 0, true)).toEqual({ incomeTax: 480_000, residentTax: 380_000 });
  });

  it('scales down for self income 900万〜950万 (2/3) and 950〜1000万 (1/3)', () => {
    expect(calcSpouseDeduction(9_400_000, 0)).toEqual({
      incomeTax: Math.round(380_000 * (2 / 3)),
      residentTax: Math.round(330_000 * (2 / 3)),
    });
    expect(calcSpouseDeduction(9_900_000, 0)).toEqual({
      incomeTax: Math.round(380_000 * (1 / 3)),
      residentTax: Math.round(330_000 * (1 / 3)),
    });
  });

  it('is zero when self income exceeds 1000万', () => {
    expect(calcSpouseDeduction(10_000_001, 0)).toEqual({ incomeTax: 0, residentTax: 0 });
  });

  it('uses special deduction when spouse income is 48万超〜133万', () => {
    expect(calcSpouseDeduction(5_000_000, 900_000)).toEqual({ incomeTax: 380_000, residentTax: 330_000 });
    expect(calcSpouseDeduction(5_000_000, 1_280_000)).toEqual({ incomeTax: 60_000, residentTax: 60_000 });
  });

  it('is zero when spouse income exceeds 133万', () => {
    expect(calcSpouseDeduction(5_000_000, 1_330_001)).toEqual({ incomeTax: 0, residentTax: 0 });
  });

  it('pins every spouse-income tier boundary of the 配偶者特別控除 table (本人 tier1)', () => {
    // [配偶者の合計所得, 満額の所得税控除] — 各 <= 閾値とその+1 を網羅。
    const table: ReadonlyArray<readonly [number, number]> = [
      [480_001, 380_000], [950_000, 380_000], [950_001, 360_000], [1_000_000, 360_000],
      [1_000_001, 310_000], [1_050_000, 310_000], [1_050_001, 260_000], [1_100_000, 260_000],
      [1_100_001, 210_000], [1_150_000, 210_000], [1_150_001, 160_000], [1_200_000, 160_000],
      [1_200_001, 110_000], [1_250_000, 110_000], [1_250_001, 60_000], [1_300_000, 60_000],
      [1_300_001, 30_000], [1_330_000, 30_000], [1_330_001, 0],
    ];
    for (const [spouseIncome, expected] of table) {
      expect(calcSpouseDeduction(5_000_000, spouseIncome).incomeTax).toBe(expected);
    }
  });

  it('pins the 本人所得 tier boundaries with the 2/3 and 1/3 factors', () => {
    // 配偶者控除 (満額 38万/33万) に対し tier2=2/3, tier3=1/3。
    expect(calcSpouseDeduction(9_000_000, 0)).toEqual({ incomeTax: 380_000, residentTax: 330_000 }); // tier1
    expect(calcSpouseDeduction(9_000_001, 0)).toEqual({ incomeTax: 253_333, residentTax: 220_000 }); // tier2
    expect(calcSpouseDeduction(9_500_000, 0)).toEqual({ incomeTax: 253_333, residentTax: 220_000 }); // tier2 端
    expect(calcSpouseDeduction(9_500_001, 0)).toEqual({ incomeTax: 126_667, residentTax: 110_000 }); // tier3
    expect(calcSpouseDeduction(10_000_000, 0)).toEqual({ incomeTax: 126_667, residentTax: 110_000 }); // tier3 端
    expect(calcSpouseDeduction(10_000_001, 0)).toEqual({ incomeTax: 0, residentTax: 0 }); // tier0
  });

  it('applies the elderly spouse amounts at the 48万 boundary', () => {
    expect(calcSpouseDeduction(5_000_000, 480_000, true)).toEqual({ incomeTax: 480_000, residentTax: 380_000 });
    expect(calcSpouseDeduction(5_000_000, 480_000, false)).toEqual({ incomeTax: 380_000, residentTax: 330_000 });
    // 48万超は配偶者特別控除に切替 (老人区分は無関係に満額表)。
    expect(calcSpouseDeduction(5_000_000, 480_001, true).incomeTax).toBe(380_000);
  });
});

describe('dependentDeduction / calcDependentDeduction', () => {
  it('returns 0 for under-16 dependents', () => {
    expect(dependentDeduction('under16')).toEqual({ incomeTax: 0, residentTax: 0 });
  });

  it('returns the correct amounts per age band', () => {
    expect(dependentDeduction('general')).toEqual({ incomeTax: 380_000, residentTax: 330_000 });
    expect(dependentDeduction('specific')).toEqual({ incomeTax: 630_000, residentTax: 450_000 });
    expect(dependentDeduction('elderly-livein')).toEqual({ incomeTax: 580_000, residentTax: 450_000 });
    expect(dependentDeduction('elderly')).toEqual({ incomeTax: 480_000, residentTax: 380_000 });
  });

  it('sums multiple dependents', () => {
    const d = calcDependentDeduction(['general', 'specific', 'under16']);
    expect(d).toEqual({ incomeTax: 380_000 + 630_000, residentTax: 330_000 + 450_000 });
  });
});

describe('calcDependentDeductionWithIncome (合計所得48万円の判定)', () => {
  it('counts dependents with income at or below 48万', () => {
    const d = calcDependentDeductionWithIncome([
      { kind: 'general', income: 480_000 }, // exactly at the limit → eligible
      { kind: 'specific', income: 0 },
    ]);
    expect(d).toEqual({ incomeTax: 380_000 + 630_000, residentTax: 330_000 + 450_000 });
    expect(DEPENDENT_INCOME_LIMIT).toBe(480_000);
  });

  it('excludes a dependent whose income exceeds 48万', () => {
    const d = calcDependentDeductionWithIncome([
      { kind: 'general', income: 480_001 }, // over the limit → excluded
      { kind: 'elderly', income: 0 },
    ]);
    // only the elderly dependent counts
    expect(d).toEqual({ incomeTax: 480_000, residentTax: 380_000 });
  });

  it('returns zero when all dependents are over the income limit', () => {
    const d = calcDependentDeductionWithIncome([{ kind: 'specific', income: 1_000_000 }]);
    expect(d).toEqual({ incomeTax: 0, residentTax: 0 });
  });
});

describe('calcLifeInsuranceDeduction (新制度)', () => {
  it('returns 0 for no premiums', () => {
    expect(calcLifeInsuranceDeduction({ general: 0, medical: 0, pension: 0 })).toEqual({ incomeTax: 0, residentTax: 0 });
  });

  it('caps a single category at 4万/2.8万', () => {
    const d = calcLifeInsuranceDeduction({ general: 200_000, medical: 0, pension: 0 });
    expect(d.incomeTax).toBe(40_000);
    expect(d.residentTax).toBe(28_000);
  });

  it('applies the bracket formulas', () => {
    // general 30,000: 所得税 30000/2+10000=25000, 住民 30000/2+6000=21000
    const d = calcLifeInsuranceDeduction({ general: 30_000, medical: 0, pension: 0 });
    expect(d.incomeTax).toBe(25_000);
    expect(d.residentTax).toBe(21_000);
  });

  it('caps the 3-category total at 12万/7万', () => {
    const d = calcLifeInsuranceDeduction({ general: 200_000, medical: 200_000, pension: 200_000 });
    expect(d.incomeTax).toBe(120_000); // 3×4万=12万
    expect(d.residentTax).toBe(70_000); // 3×2.8万=8.4万 → cap 7万
  });

  it('pins every new-scheme bracket boundary (所得税 2/4/8万・住民税 1.2/3.2/5.6万)', () => {
    // [保険料, 所得税控除, 住民税控除]
    const table: ReadonlyArray<readonly [number, number, number]> = [
      [12_000, 12_000, 12_000], [12_001, 12_001, 12_001], [20_000, 20_000, 16_000], [20_001, 20_001, 16_001],
      [32_000, 26_000, 22_000], [32_001, 26_001, 22_000], [40_000, 30_000, 24_000], [40_001, 30_000, 24_000],
      [56_000, 34_000, 28_000], [56_001, 34_000, 28_000], [80_000, 40_000, 28_000], [80_001, 40_000, 28_000],
    ];
    for (const [premium, it, rt] of table) {
      const d = calcLifeInsuranceDeduction({ general: premium, medical: 0, pension: 0 });
      expect([d.incomeTax, d.residentTax]).toEqual([it, rt]);
    }
  });
});

describe('calcLifeInsuranceDeduction (旧制度 / 新旧併用)', () => {
  it('old scheme caps a single category at 5万/3.5万', () => {
    const d = calcLifeInsuranceDeduction({ general: 0, medical: 0, pension: 0, generalOld: 200_000 });
    expect(d.incomeTax).toBe(50_000); // 旧制度上限
    expect(d.residentTax).toBe(35_000);
  });

  it('old scheme bracket formula (40,000 premium)', () => {
    // 旧 general 40,000: 所得税 40000/2+12500=32500, 住民 40000/2+7500=27500
    const d = calcLifeInsuranceDeduction({ general: 0, medical: 0, pension: 0, generalOld: 40_000 });
    expect(d.incomeTax).toBe(32_500);
    expect(d.residentTax).toBe(27_500);
  });

  it('pins every old-scheme bracket boundary (所得税 2.5/5/10万・住民税 1.5/4/7万)', () => {
    const table: ReadonlyArray<readonly [number, number, number]> = [
      [15_000, 15_000, 15_000], [15_001, 15_001, 15_001], [25_000, 25_000, 20_000], [25_001, 25_001, 20_001],
      [40_000, 32_500, 27_500], [40_001, 32_501, 27_500], [50_000, 37_500, 30_000], [50_001, 37_500, 30_000],
      [70_000, 42_500, 35_000], [70_001, 42_500, 35_000], [100_000, 50_000, 35_000], [100_001, 50_000, 35_000],
    ];
    for (const [premium, it, rt] of table) {
      const d = calcLifeInsuranceDeduction({ general: 0, medical: 0, pension: 0, generalOld: premium });
      expect([d.incomeTax, d.residentTax]).toEqual([it, rt]);
    }
  });

  it('combined new+old: combined is capped at 4万/2.8万, but old-only may win if larger', () => {
    // 新 80,000 (→4万) + 旧 100,000 (→5万): 併用cap=4万 だが 旧のみ=5万 が最大 → 5万/3.5万
    const d = calcLifeInsuranceDeduction({ general: 80_000, medical: 0, pension: 0, generalOld: 100_000 });
    expect(d.incomeTax).toBe(50_000);
    expect(d.residentTax).toBe(35_000);
  });

  it('combined wins when both are small (new 20,000 + old 20,000 → 4万 cap)', () => {
    // 新 20,000 (→2万) + 旧 20,000 (→2万) = 併用4万; 旧のみ=2万, 新のみ=2万 → 併用4万が最大
    const d = calcLifeInsuranceDeduction({ general: 20_000, medical: 0, pension: 0, generalOld: 20_000 });
    expect(d.incomeTax).toBe(40_000);
  });

  it('picks old-only when it is larger than new-only', () => {
    // 旧 general 100,000 → 5万 (新は 0) なので旧が選ばれる
    const d = calcLifeInsuranceDeduction({ general: 0, medical: 0, pension: 0, generalOld: 100_000 });
    expect(d.incomeTax).toBe(50_000);
  });
});

describe('calcEarthquakeInsuranceDeduction', () => {
  it('returns 0 for no premium', () => {
    expect(calcEarthquakeInsuranceDeduction(0)).toEqual({ incomeTax: 0, residentTax: 0 });
  });

  it('income tax = full (cap 5万), resident = half (cap 2.5万)', () => {
    expect(calcEarthquakeInsuranceDeduction(30_000)).toEqual({ incomeTax: 30_000, residentTax: 15_000 });
    expect(calcEarthquakeInsuranceDeduction(80_000)).toEqual({ incomeTax: 50_000, residentTax: 25_000 });
  });
});

describe('calcMedicalDeduction', () => {
  it('returns 0 when net medical is below threshold', () => {
    // net 50,000, threshold min(income×5%, 10万). income 3,000,000×5%=150,000>10万→10万
    expect(calcMedicalDeduction(50_000, 0, 3_000_000)).toEqual({ incomeTax: 0, residentTax: 0 });
  });

  it('subtracts the 10万 threshold for higher incomes', () => {
    // net 300,000, threshold 10万 → deduction 200,000
    expect(calcMedicalDeduction(300_000, 0, 5_000_000)).toEqual({ incomeTax: 200_000, residentTax: 200_000 });
  });

  it('uses income×5% threshold for low incomes', () => {
    // income 1,000,000×5%=50,000 < 10万 → threshold 50,000; net 120,000 → 70,000
    expect(calcMedicalDeduction(120_000, 0, 1_000_000)).toEqual({ incomeTax: 70_000, residentTax: 70_000 });
  });

  it('subtracts reimbursements and caps at 200万', () => {
    expect(calcMedicalDeduction(100_000, 80_000, 5_000_000)).toEqual({ incomeTax: 0, residentTax: 0 });
    expect(calcMedicalDeduction(2_500_000, 0, 50_000_000)).toEqual({ incomeTax: 2_000_000, residentTax: 2_000_000 });
  });
});

describe('calcSelfMedicationDeduction (セルフメディケーション税制)', () => {
  it('returns 0 at or below the 12,000 threshold', () => {
    expect(calcSelfMedicationDeduction(12_000)).toEqual({ incomeTax: 0, residentTax: 0 });
    expect(calcSelfMedicationDeduction(11_999)).toEqual({ incomeTax: 0, residentTax: 0 });
    expect(SELF_MEDICATION_THRESHOLD).toBe(12_000);
  });

  it('deducts (paid − 12,000) up to the 88,000 cap', () => {
    expect(calcSelfMedicationDeduction(40_000)).toEqual({ incomeTax: 28_000, residentTax: 28_000 });
    // exactly at the cap: 100,000 − 12,000 = 88,000
    expect(calcSelfMedicationDeduction(100_000)).toEqual({ incomeTax: 88_000, residentTax: 88_000 });
    // beyond the cap stays capped
    expect(calcSelfMedicationDeduction(100_001)).toEqual({ incomeTax: 88_000, residentTax: 88_000 });
    expect(SELF_MEDICATION_CAP).toBe(88_000);
  });

  it('clamps negative input to zero', () => {
    expect(calcSelfMedicationDeduction(-1)).toEqual({ incomeTax: 0, residentTax: 0 });
  });
});

describe('chooseMedicalDeductionScheme (選択制の有利判定)', () => {
  it('selects the standard medical deduction when larger', () => {
    const standard = { incomeTax: 150_000, residentTax: 150_000 };
    const selfMed = { incomeTax: 50_000, residentTax: 50_000 };
    expect(chooseMedicalDeductionScheme(standard, selfMed)).toEqual(standard);
  });

  it('selects self-medication when larger', () => {
    const standard = { incomeTax: 30_000, residentTax: 30_000 };
    const selfMed = { incomeTax: 88_000, residentTax: 88_000 };
    expect(chooseMedicalDeductionScheme(standard, selfMed)).toEqual(selfMed);
  });
});

describe('calcDonationDeduction (所得税の所得控除分)', () => {
  it('returns 0 at or below the 2,000 floor', () => {
    expect(calcDonationDeduction(2_000, 5_000_000)).toEqual({ incomeTax: 0, residentTax: 0 });
  });

  it('deducts (donation - 2,000) for income tax only', () => {
    expect(calcDonationDeduction(50_000, 5_000_000)).toEqual({ incomeTax: 48_000, residentTax: 0 });
  });

  it('caps at 40% of total income', () => {
    expect(calcDonationDeduction(5_000_000, 1_000_000)).toEqual({ incomeTax: 400_000, residentTax: 0 });
  });
});

describe('disabilityDeduction + singleParent/widow constants', () => {
  it('returns per-kind disability amounts', () => {
    expect(disabilityDeduction('ordinary')).toEqual({ incomeTax: 270_000, residentTax: 260_000 });
    expect(disabilityDeduction('special')).toEqual({ incomeTax: 400_000, residentTax: 300_000 });
    expect(disabilityDeduction('special-livein')).toEqual({ incomeTax: 750_000, residentTax: 530_000 });
  });

  it('single-parent and widow constants are correct', () => {
    expect(SINGLE_PARENT_DEDUCTION).toEqual({ incomeTax: 350_000, residentTax: 300_000 });
    expect(WIDOW_DEDUCTION).toEqual({ incomeTax: 270_000, residentTax: 260_000 });
  });
});

describe('clampIdecoContribution (職業区分別の拠出上限)', () => {
  it('caps self-employed at 81.6万', () => {
    expect(clampIdecoContribution(1_000_000, 'self-employed')).toBe(816_000);
    expect(clampIdecoContribution(816_000, 'self-employed')).toBe(816_000);
    expect(clampIdecoContribution(500_000, 'self-employed')).toBe(500_000);
  });

  it('caps each occupation at its annual limit', () => {
    expect(clampIdecoContribution(1_000_000, 'employee-no-pension')).toBe(276_000);
    expect(clampIdecoContribution(1_000_000, 'employee-with-dc')).toBe(240_000);
    expect(clampIdecoContribution(1_000_000, 'civil-servant')).toBe(144_000);
    expect(clampIdecoContribution(1_000_000, 'dependent-spouse')).toBe(276_000);
    expect(IDECO_ANNUAL_CAPS['self-employed']).toBe(816_000);
  });

  it('clamps negative to zero', () => {
    expect(clampIdecoContribution(-1, 'self-employed')).toBe(0);
  });
});

describe('clampSmallBizMutualAid (小規模企業共済の上限)', () => {
  it('caps at 84万 per year', () => {
    expect(clampSmallBizMutualAid(900_000)).toBe(840_000);
    expect(clampSmallBizMutualAid(840_000)).toBe(840_000);
    expect(clampSmallBizMutualAid(500_000)).toBe(500_000);
    expect(SMALL_BIZ_MUTUAL_ANNUAL_CAP).toBe(840_000);
  });

  it('clamps negative to zero', () => {
    expect(clampSmallBizMutualAid(-1)).toBe(0);
  });
});

describe('calcAllDeductions — iDeCo / 小規模企業共済の上限統合', () => {
  it('caps iDeCo by occupation and adds the small-biz mutual aid', () => {
    // 自営業 iDeCo 100万 (→81.6万) + 小規模共済 100万 (→84万) = 165.6万
    const d = calcAllDeductions({
      totalIncome: 5_000_000,
      idecoContribution: 1_000_000,
      idecoOccupation: 'self-employed',
      smallBizMutualAid: 1_000_000,
    });
    expect(d.smallBizMutualAid.incomeTax).toBe(816_000 + 840_000);
  });

  it('does not cap iDeCo when the occupation is unspecified (backward compatible)', () => {
    const d = calcAllDeductions({ totalIncome: 5_000_000, idecoContribution: 300_000 });
    expect(d.smallBizMutualAid.incomeTax).toBe(300_000);
  });
});

describe('calcAllDeductions', () => {
  it('returns only the basic deduction for an empty input', () => {
    const d = calcAllDeductions({ totalIncome: 5_000_000 });
    expect(d.basic).toEqual({ incomeTax: 480_000, residentTax: 430_000 });
    expect(d.total).toEqual({ incomeTax: 480_000, residentTax: 430_000 });
  });

  it('aggregates every provided deduction into the total', () => {
    const d = calcAllDeductions({
      totalIncome: 5_000_000,
      socialInsurancePaid: 700_000,
      smallBizMutualAid: 120_000,
      spouseIncome: 0,
      dependents: ['specific'],
      lifeInsurance: { general: 200_000, medical: 0, pension: 0 },
      earthquakeInsurance: 30_000,
      donation: 50_000,
      singleParent: true,
    });
    const expectedIncome =
      480_000 + 700_000 + 120_000 + 380_000 + 630_000 + 40_000 + 30_000 + 48_000 + 350_000;
    expect(d.total.incomeTax).toBe(expectedIncome);
    expect(d.socialInsurance.incomeTax).toBe(700_000);
    expect(d.spouse.incomeTax).toBe(380_000);
    expect(d.dependents.incomeTax).toBe(630_000);
    expect(d.donation.incomeTax).toBe(48_000);
    expect(d.singleParentOrWidow).toEqual(SINGLE_PARENT_DEDUCTION);
  });

  it('prefers single-parent over widow when both set', () => {
    const d = calcAllDeductions({ totalIncome: 3_000_000, singleParent: true, widow: true });
    expect(d.singleParentOrWidow).toEqual(SINGLE_PARENT_DEDUCTION);
  });

  it('omits social insurance when not provided (avoids double count)', () => {
    const d = calcAllDeductions({ totalIncome: 5_000_000 });
    expect(d.socialInsurance).toEqual({ incomeTax: 0, residentTax: 0 });
  });

  it('computes humanDeductionDiff from human deductions only (basic 5万 alone here)', () => {
    // basic only: incomeTax 480,000 - residentTax 430,000 = 50,000
    const d = calcAllDeductions({ totalIncome: 5_000_000 });
    expect(d.humanDeductionDiff).toBe(50_000);
  });

  it('adds spouse and dependent diffs to humanDeductionDiff, excludes 物的控除', () => {
    const d = calcAllDeductions({
      totalIncome: 5_000_000,
      spouseIncome: 0, // 38万 - 33万 = 5万
      dependents: ['general'], // 38万 - 33万 = 5万
      socialInsurancePaid: 700_000, // 物的控除 (差なし→0)
      lifeInsurance: { general: 200_000, medical: 0, pension: 0 }, // 物的控除
    });
    // basic 5万 + spouse 5万 + dependent 5万 = 15万 (物的控除は含まない)
    expect(d.humanDeductionDiff).toBe(150_000);
  });
});

describe('boundary coverage — spouse deduction self-income tiers', () => {
  const one = (i: number) => calcSpouseDeduction(i, 0); // spouse income 0 → full 38万/33万 base
  it('switches at 900万 / 950万 / 1000万 boundaries', () => {
    expect(one(9_000_000)).toEqual({ incomeTax: 380_000, residentTax: 330_000 }); // tier 1
    expect(one(9_000_001)).toEqual({
      incomeTax: Math.round(380_000 * (2 / 3)),
      residentTax: Math.round(330_000 * (2 / 3)),
    }); // tier 2
    expect(one(9_500_000)).toEqual({
      incomeTax: Math.round(380_000 * (2 / 3)),
      residentTax: Math.round(330_000 * (2 / 3)),
    }); // tier 2 max
    expect(one(9_500_001)).toEqual({
      incomeTax: Math.round(380_000 * (1 / 3)),
      residentTax: Math.round(330_000 * (1 / 3)),
    }); // tier 3
    expect(one(10_000_000)).toEqual({
      incomeTax: Math.round(380_000 * (1 / 3)),
      residentTax: Math.round(330_000 * (1 / 3)),
    }); // tier 3 max
    expect(one(10_000_001)).toEqual({ incomeTax: 0, residentTax: 0 }); // tier 0
  });
});

describe('boundary coverage — life insurance bracket edges (新制度, single category)', () => {
  const it1 = (premium: number) => calcLifeInsuranceDeduction({ general: premium, medical: 0, pension: 0 });
  it('hits each income-tax bracket boundary', () => {
    expect(it1(20_000).incomeTax).toBe(20_000); // full
    expect(it1(40_000).incomeTax).toBe(Math.round(40_000 / 2 + 10_000)); // 30,000
    expect(it1(80_000).incomeTax).toBe(Math.round(80_000 / 4 + 20_000)); // 40,000
    expect(it1(80_001).incomeTax).toBe(40_000); // cap
  });
  it('hits each resident-tax bracket boundary', () => {
    expect(it1(12_000).residentTax).toBe(12_000); // full
    expect(it1(32_000).residentTax).toBe(Math.round(32_000 / 2 + 6_000)); // 22,000
    expect(it1(56_000).residentTax).toBe(Math.round(56_000 / 4 + 14_000)); // 28,000
    expect(it1(56_001).residentTax).toBe(28_000); // cap
  });
});

describe('boundary coverage — medical deduction threshold switch', () => {
  it('uses income×5% vs 100,000 at the 2,000,000 income boundary', () => {
    // income 2,000,000 → threshold min(100,000, 100,000)=100,000; net 100,000 → 0
    expect(calcMedicalDeduction(100_000, 0, 2_000_000)).toEqual({ incomeTax: 0, residentTax: 0 });
    // income 2,000,000, net 100,001 → 1
    expect(calcMedicalDeduction(100_001, 0, 2_000_000)).toEqual({ incomeTax: 1, residentTax: 1 });
    // caps at 200万
    expect(calcMedicalDeduction(2_100_000, 0, 2_000_000)).toEqual({ incomeTax: 2_000_000, residentTax: 2_000_000 });
  });
});

describe('boundary coverage — dependent income requirement (UI responsibility)', () => {
  // 注: 扶養親族の所得48万以下要件はUIで担保 (calcDependentDeduction は区分のみ受け取る)。
  // ここでは区分ごとの金額が安定していることを固定する。
  it('keeps under-16 at zero regardless of count', () => {
    expect(calcDependentDeduction(['under16', 'under16', 'under16'])).toEqual({ incomeTax: 0, residentTax: 0 });
  });
});

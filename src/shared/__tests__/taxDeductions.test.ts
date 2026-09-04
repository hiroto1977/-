import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEDUCTION_PARAMS,
  BASIC_HUMAN_DEDUCTION_DIFF,
  calcAllDeductions,
  calcDependentDeduction,
  calcDependentDeductionWithIncome,
  DEPENDENT_INCOME_LIMIT,
  calcDonationDeduction,
  calcGeneralDonationDeduction,
  calcDonationTaxCredit,
  chooseDonationCreditOrDeduction,
  calcCasualtyLossDeduction,
  DONATION_DEDUCTION_FLOOR,
  DONATION_INCOME_CAP_RATE,
  DONATION_TAX_CREDIT_RATE,
  CASUALTY_DISASTER_FLOOR,
  CASUALTY_INCOME_RATE,
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
  spouseIncomeLimitYen,
  SPOUSE_SPECIAL_INCOME_LIMIT_YEN,
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

  it('applies the 2/3 and 1/3 factors to the 配偶者特別控除 (spouseIncome>48万)', () => {
    // 配偶者所得 90万 (特別控除・満額 38万/33万) に本人所得 tier の factor を乗じる。
    expect(calcSpouseDeduction(9_400_000, 900_000)).toEqual({ incomeTax: 253_333, residentTax: 220_000 }); // tier2 ×2/3
    expect(calcSpouseDeduction(9_900_000, 900_000)).toEqual({ incomeTax: 126_667, residentTax: 110_000 }); // tier3 ×1/3
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

  /*
   * 配偶者控除と配偶者特別控除の境目は**年分で動く**。
   *
   * この検査は 2026-08-21 まで 48 万円だけを見ており、令和7年分の改正
   * (48 → 58) にも令和8年分の改正 (58 → 62) にも気付けない形だった。
   * 年分を明示して 3 段階すべてを固定する。
   */
  it.each([
    [2024, 480_000],
    [2025, 580_000],
    [2026, 620_000],
    [2027, 620_000],
  ])('%i 年分の境目は %i 円 — ちょうどまでは配偶者控除', (year, limit) => {
    expect(spouseIncomeLimitYen(year)).toBe(limit);
    // 上限ちょうどは配偶者控除 (老人区分が効く)。
    expect(calcSpouseDeduction(5_000_000, limit, true, year)).toEqual({
      incomeTax: 480_000,
      residentTax: 380_000,
    });
    expect(calcSpouseDeduction(5_000_000, limit, false, year)).toEqual({
      incomeTax: 380_000,
      residentTax: 330_000,
    });
    // 1 円超えると配偶者特別控除へ切り替わる (老人区分は無関係に満額表)。
    expect(calcSpouseDeduction(5_000_000, limit + 1, true, year).incomeTax).toBe(380_000);
  });

  it('改正前の 48 万円で判定していない (今年分は 62 万円)', () => {
    // 合計所得 60 万円の配偶者は、令和8年分では配偶者控除の対象。
    // 旧法のままだと配偶者特別控除の表に落ちて老人区分が効かなくなる。
    expect(calcSpouseDeduction(5_000_000, 600_000, true, 2026)).toEqual({
      incomeTax: 480_000,
      residentTax: 380_000,
    });
    expect(calcSpouseDeduction(5_000_000, 600_000, true, 2024).incomeTax).toBe(380_000);
  });

  it('配偶者特別控除の上限と満額の範囲は改正されていない', () => {
    expect(SPOUSE_SPECIAL_INCOME_LIMIT_YEN).toBe(1_330_000);
    // どの年分でも 133 万円ちょうどまでは控除があり、超えると 0。
    for (const year of [2024, 2025, 2026]) {
      expect(calcSpouseDeduction(5_000_000, 1_330_000, false, year).incomeTax).toBeGreaterThan(0);
      expect(calcSpouseDeduction(5_000_000, 1_330_001, false, year)).toEqual({
        incomeTax: 0,
        residentTax: 0,
      });
      // 満額 38 万円が維持されるのは合計所得 95 万円以下。
      expect(calcSpouseDeduction(5_000_000, 950_000, false, year).incomeTax).toBe(380_000);
      expect(calcSpouseDeduction(5_000_000, 950_001, false, year).incomeTax).toBe(360_000);
    }
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
  // 年分を明示する。基礎控除の段階は年分で変わるので、渡さないと
  // 暦が変わった日に期待値が意味を失う。
  it('returns only the basic deduction for an empty input (令和6年分)', () => {
    const d = calcAllDeductions({ totalIncome: 5_000_000, taxYear: 2024 });
    expect(d.basic).toEqual({ incomeTax: 480_000, residentTax: 430_000 });
    expect(d.total).toEqual({ incomeTax: 480_000, residentTax: 430_000 });
  });

  it('基礎控除は年分で変わり、住民税側は据え置き', () => {
    // 合計所得 500 万円 = 489 万円超 655 万円以下の帯。
    const at = (taxYear: number) => calcAllDeductions({ totalIncome: 5_000_000, taxYear }).basic;
    expect(at(2024)).toEqual({ incomeTax: 480_000, residentTax: 430_000 });
    expect(at(2025)).toEqual({ incomeTax: 630_000, residentTax: 430_000 });
    expect(at(2026)).toEqual({ incomeTax: 670_000, residentTax: 430_000 });
    expect(at(2028)).toEqual({ incomeTax: 620_000, residentTax: 430_000 });
    // 住民税はどの年分でも 43 万円のまま。
    for (const y of [2024, 2025, 2026, 2028]) expect(at(y).residentTax).toBe(430_000);
  });

  it('調整控除の人的控除差は基礎控除の実額に引きずられない', () => {
    // 所得税の基礎控除が 48 → 67 万円に上がっても、調整控除に使う
    // 基礎控除の差額は法定の 5 万円のまま。ここが実額 (24 万円) に
    // なると調整控除が過大になり住民税を過少に見積もる。
    const old = calcAllDeductions({ totalIncome: 5_000_000, taxYear: 2024 });
    const now = calcAllDeductions({ totalIncome: 5_000_000, taxYear: 2026 });
    expect(old.humanDeductionDiff).toBe(50_000);
    expect(now.humanDeductionDiff).toBe(50_000);
    expect(now.basic.incomeTax - now.basic.residentTax).toBe(240_000); // 実額はこれだけ開く
  });

  it('aggregates every provided deduction into the total (令和6年分)', () => {
    const d = calcAllDeductions({
      totalIncome: 5_000_000,
      taxYear: 2024,
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

describe('calcGeneralDonationDeduction (一般寄附金の所得控除)', () => {
  it('returns 0 at or below the 2,000 floor', () => {
    expect(calcGeneralDonationDeduction(2_000, 5_000_000)).toEqual({ incomeTax: 0, residentTax: 0 });
    expect(calcGeneralDonationDeduction(1_999, 5_000_000)).toEqual({ incomeTax: 0, residentTax: 0 });
    expect(DONATION_DEDUCTION_FLOOR).toBe(2_000);
  });

  it('deducts (donation - 2,000) for income tax only', () => {
    expect(calcGeneralDonationDeduction(50_000, 5_000_000)).toEqual({ incomeTax: 48_000, residentTax: 0 });
    // just above floor
    expect(calcGeneralDonationDeduction(2_001, 5_000_000)).toEqual({ incomeTax: 1, residentTax: 0 });
  });

  it('caps at 40% of total income', () => {
    // income 1,000,000 × 40% = 400,000 cap; donation 5,000,000 → 400,000
    expect(calcGeneralDonationDeduction(5_000_000, 1_000_000)).toEqual({ incomeTax: 400_000, residentTax: 0 });
    expect(DONATION_INCOME_CAP_RATE).toBe(0.4);
  });

  it('pins the cap boundary (just under vs over the 40% cap)', () => {
    // income 100,000 → cap 40,000. donation 42,000 → 40,000 (donation-2,000=40,000 == cap)
    expect(calcGeneralDonationDeduction(42_000, 100_000).incomeTax).toBe(40_000);
    // donation 42,001 → donation-2,000=40,001 > cap 40,000 → capped at 40,000
    expect(calcGeneralDonationDeduction(42_001, 100_000).incomeTax).toBe(40_000);
    // donation 41,999 → 39,999 < cap → not capped
    expect(calcGeneralDonationDeduction(41_999, 100_000).incomeTax).toBe(39_999);
  });

  it('treats non-finite or negative income as a zero cap', () => {
    expect(calcGeneralDonationDeduction(50_000, Number.NaN)).toEqual({ incomeTax: 0, residentTax: 0 });
    expect(calcGeneralDonationDeduction(50_000, Number.POSITIVE_INFINITY)).toEqual({ incomeTax: 0, residentTax: 0 });
    expect(calcGeneralDonationDeduction(50_000, -1_000_000)).toEqual({ incomeTax: 0, residentTax: 0 });
  });
});

describe('calcDonationTaxCredit (寄附金特別控除 / 税額控除)', () => {
  it('returns 0 at or below the 2,000 floor', () => {
    expect(calcDonationTaxCredit(2_000, 5_000_000)).toBe(0);
    expect(calcDonationTaxCredit(1_999, 5_000_000)).toBe(0);
  });

  it('is (eligible - 2,000) × 40%', () => {
    // donation 52,000 (≤ cap), base 50,000 × 40% = 20,000
    expect(calcDonationTaxCredit(52_000, 5_000_000)).toBe(20_000);
    expect(DONATION_TAX_CREDIT_RATE).toBe(0.4);
  });

  it('caps eligible donation at 40% of total income', () => {
    // income 100,000 → eligible cap 40,000; donation 1,000,000 → (40,000-2,000)×40% = 15,200
    expect(calcDonationTaxCredit(1_000_000, 100_000)).toBe(15_200);
  });

  it('applies the absolute incomeTaxCap when smaller', () => {
    // base credit would be (50,000-2,000)? no: donation 52,000 → 20,000; cap 10,000 → 10,000
    expect(calcDonationTaxCredit(52_000, 5_000_000, 10_000)).toBe(10_000);
    // cap larger than credit → credit unchanged
    expect(calcDonationTaxCredit(52_000, 5_000_000, 30_000)).toBe(20_000);
    // negative cap clamps to 0
    expect(calcDonationTaxCredit(52_000, 5_000_000, -5)).toBe(0);
    // non-finite cap is ignored
    expect(calcDonationTaxCredit(52_000, 5_000_000, Number.NaN)).toBe(20_000);
  });

  it('treats non-finite or negative income as a zero eligible base', () => {
    expect(calcDonationTaxCredit(52_000, Number.NaN)).toBe(0);
    expect(calcDonationTaxCredit(52_000, -1)).toBe(0);
  });
});

describe('chooseDonationCreditOrDeduction (税額控除 vs 所得控除の有利選択)', () => {
  it('prefers the tax credit for a low marginal rate (typical case)', () => {
    // donation 102,000: deduction 100,000; credit (100,000)×40%=40,000.
    // marginal 20% → deductionSaving 20,000 < credit 40,000 → credit
    const r = chooseDonationCreditOrDeduction(102_000, 5_000_000, 0.2);
    expect(r.method).toBe('credit');
    expect(r.deduction).toBe(100_000);
    expect(r.credit).toBe(40_000);
    expect(r.taxSaving).toBe(40_000);
  });

  it('prefers the income deduction at a high marginal rate', () => {
    // marginal 45% → deductionSaving 100,000×0.45=45,000 > credit 40,000 → deduction
    const r = chooseDonationCreditOrDeduction(102_000, 5_000_000, 0.45);
    expect(r.method).toBe('deduction');
    expect(r.taxSaving).toBe(45_000);
  });

  it('ties go to the tax credit (credit >= deductionSaving)', () => {
    // marginal 40% → deductionSaving 40,000 == credit 40,000 → credit (tie)
    const r = chooseDonationCreditOrDeduction(102_000, 5_000_000, 0.4);
    expect(r.method).toBe('credit');
  });

  it('clamps the marginal rate to [0,1] and treats non-finite as 0', () => {
    // rate > 1 clamps to 1: deductionSaving 100,000 > credit 40,000 → deduction
    expect(chooseDonationCreditOrDeduction(102_000, 5_000_000, 5).method).toBe('deduction');
    // negative rate clamps to 0: deductionSaving 0 < credit → credit
    expect(chooseDonationCreditOrDeduction(102_000, 5_000_000, -1).method).toBe('credit');
    // NaN → 0 → credit
    expect(chooseDonationCreditOrDeduction(102_000, 5_000_000, Number.NaN).method).toBe('credit');
  });

  it('passes through the incomeTaxCap to the credit branch', () => {
    // cap the credit to 5,000; marginal 0.1 → deductionSaving 10,000 > credit 5,000 → deduction
    const r = chooseDonationCreditOrDeduction(102_000, 5_000_000, 0.1, 5_000);
    expect(r.credit).toBe(5_000);
    expect(r.method).toBe('deduction');
    expect(r.taxSaving).toBe(10_000);
  });
});

describe('calcCasualtyLossDeduction (雑損控除)', () => {
  it('exposes the constants', () => {
    expect(CASUALTY_DISASTER_FLOOR).toBe(50_000);
    expect(CASUALTY_INCOME_RATE).toBe(0.1);
  });

  it('returns 0 when net loss is zero (reimbursed fully covers)', () => {
    expect(calcCasualtyLossDeduction({ lossAmount: 100_000, reimbursed: 100_000, totalIncome: 3_000_000 }))
      .toEqual({ incomeTax: 0, residentTax: 0 });
  });

  it('uses method (1): netLoss - income×10% when no disaster spending', () => {
    // loss 1,000,000, income 3,000,000×10%=300,000 → 700,000
    expect(calcCasualtyLossDeduction({ lossAmount: 1_000_000, totalIncome: 3_000_000 }))
      .toEqual({ incomeTax: 700_000, residentTax: 700_000 });
  });

  it('subtracts reimbursements from the net loss before the 10% floor', () => {
    // (1,000,000 - 200,000) - 300,000 = 500,000
    expect(calcCasualtyLossDeduction({ lossAmount: 1_000_000, reimbursed: 200_000, totalIncome: 3_000_000 }).incomeTax)
      .toBe(500_000);
  });

  it('uses method (2): disasterPortion - 50,000 when it is larger', () => {
    // loss 0, disaster 200,000, income 10,000,000 → method1 = 200,000 - 1,000,000 = negative;
    // method2 = min(200,000, 200,000) - 50,000 = 150,000 → 150,000
    expect(calcCasualtyLossDeduction({ lossAmount: 0, disasterRelatedSpending: 200_000, totalIncome: 10_000_000 }))
      .toEqual({ incomeTax: 150_000, residentTax: 150_000 });
  });

  it('picks the larger of method (1) and method (2)', () => {
    // loss 500,000 + disaster 300,000 = netLoss 800,000, income 1,000,000×10%=100,000
    // method1 = 800,000 - 100,000 = 700,000; method2 = min(300,000,800,000) - 50,000 = 250,000
    // → 700,000
    expect(calcCasualtyLossDeduction({
      lossAmount: 500_000, disasterRelatedSpending: 300_000, totalIncome: 1_000_000,
    }).incomeTax).toBe(700_000);
  });

  it('caps the disaster portion at the net loss (after reimbursement)', () => {
    // loss 0, disaster 500,000, reimbursed 300,000 → netLoss 200,000.
    // disasterPortion = min(500,000, 200,000) = 200,000; method2 = 200,000-50,000=150,000
    // method1 = 200,000 - (10,000,000×10%=1,000,000) = negative → 150,000
    expect(calcCasualtyLossDeduction({
      lossAmount: 0, disasterRelatedSpending: 500_000, reimbursed: 300_000, totalIncome: 10_000_000,
    }).incomeTax).toBe(150_000);
  });

  it('floors the result at 0 when both methods are negative', () => {
    // small loss, huge income: method1 negative, no disaster → method2 = 0-50,000 negative → 0
    expect(calcCasualtyLossDeduction({ lossAmount: 50_000, totalIncome: 10_000_000 }))
      .toEqual({ incomeTax: 0, residentTax: 0 });
  });

  it('pins the 50,000 disaster floor boundary', () => {
    // disaster exactly 50,000, income huge so method1 loses → method2 = 50,000-50,000 = 0
    expect(calcCasualtyLossDeduction({ lossAmount: 0, disasterRelatedSpending: 50_000, totalIncome: 100_000_000 }).incomeTax)
      .toBe(0);
    // disaster 50,001 → 1
    expect(calcCasualtyLossDeduction({ lossAmount: 0, disasterRelatedSpending: 50_001, totalIncome: 100_000_000 }).incomeTax)
      .toBe(1);
  });

  it('guards non-finite and negative inputs', () => {
    expect(calcCasualtyLossDeduction({ lossAmount: Number.NaN, totalIncome: 3_000_000 }))
      .toEqual({ incomeTax: 0, residentTax: 0 });
    expect(calcCasualtyLossDeduction({ lossAmount: -100, totalIncome: 3_000_000 }))
      .toEqual({ incomeTax: 0, residentTax: 0 });
    // non-finite totalIncome → income treated as 0 → method1 = netLoss
    expect(calcCasualtyLossDeduction({ lossAmount: 1_000_000, totalIncome: Number.NaN }).incomeTax)
      .toBe(1_000_000);
    // negative reimbursed clamps to 0
    expect(calcCasualtyLossDeduction({ lossAmount: 1_000_000, reimbursed: -500_000, totalIncome: 0 }).incomeTax)
      .toBe(1_000_000);
    // non-finite disaster clamps to 0
    expect(calcCasualtyLossDeduction({ lossAmount: 1_000_000, disasterRelatedSpending: Number.NaN, totalIncome: 0 }).incomeTax)
      .toBe(1_000_000);
    // non-finite reimbursed clamps to 0
    expect(calcCasualtyLossDeduction({ lossAmount: 1_000_000, reimbursed: Number.NaN, totalIncome: 0 }).incomeTax)
      .toBe(1_000_000);
  });
});

describe('calcAllDeductions — 雑損控除の統合 (加算的)', () => {
  it('adds casualty loss to the total and breakdown', () => {
    const base = calcAllDeductions({ totalIncome: 3_000_000 });
    const withLoss = calcAllDeductions({
      totalIncome: 3_000_000,
      casualtyLoss: { lossAmount: 1_000_000 },
    });
    // method1 = 1,000,000 - 300,000 = 700,000
    expect(withLoss.casualtyLoss).toEqual({ incomeTax: 700_000, residentTax: 700_000 });
    expect(withLoss.total.incomeTax).toBe(base.total.incomeTax + 700_000);
    expect(withLoss.total.residentTax).toBe(base.total.residentTax + 700_000);
  });

  it('is zero casualty loss (and unchanged total) when not provided', () => {
    const d = calcAllDeductions({ totalIncome: 3_000_000 });
    expect(d.casualtyLoss).toEqual({ incomeTax: 0, residentTax: 0 });
  });

  it('excludes 雑損控除 from humanDeductionDiff (物的控除扱い)', () => {
    // casualty loss has equal incomeTax/residentTax so diff is unaffected regardless,
    // but confirm humanDeductionDiff stays at basic-only 50,000.
    const d = calcAllDeductions({ totalIncome: 5_000_000, casualtyLoss: { lossAmount: 1_000_000 } });
    expect(d.humanDeductionDiff).toBe(50_000);
  });
});

describe('台帳から渡す法定値・上限 (DeductionParams)', () => {
  const BASE = { totalIncome: 5_000_000, taxYear: 2026 } as const;

  it('既定の引数は定数そのもので、省略時と同じ結果', () => {
    expect(DEFAULT_DEDUCTION_PARAMS).toEqual({
      spouseSpecialIncomeLimit: SPOUSE_SPECIAL_INCOME_LIMIT_YEN,
      dependentIncomeLimit: DEPENDENT_INCOME_LIMIT,
      selfMedicationThreshold: SELF_MEDICATION_THRESHOLD,
      selfMedicationCap: SELF_MEDICATION_CAP,
      smallBizMutualAnnualCap: SMALL_BIZ_MUTUAL_ANNUAL_CAP,
      donationDeductionFloor: DONATION_DEDUCTION_FLOOR,
      donationIncomeCapRate: DONATION_INCOME_CAP_RATE,
      casualtyDisasterFloor: CASUALTY_DISASTER_FLOOR,
      casualtyIncomeRate: CASUALTY_INCOME_RATE,
      basicHumanDeductionDiff: BASIC_HUMAN_DEDUCTION_DIFF,
    });
    const input = {
      ...BASE,
      spouseIncome: 1_200_000,
      dependentsWithIncome: [{ kind: 'general', income: 400_000 }],
      selfMedicationPaid: 50_000,
      smallBizMutualAid: 1_000_000,
      donation: 100_000,
      casualtyLoss: { lossAmount: 1_000_000, disasterRelatedSpending: 200_000 },
    } as const;
    expect(calcAllDeductions(input)).toEqual(calcAllDeductions(input, DEFAULT_DEDUCTION_PARAMS));
  });

  it('配偶者特別控除の上限: 133 万超は 0、上限を上げればその所得でも控除が出る', () => {
    const at133over = calcAllDeductions({ ...BASE, spouseIncome: 1_400_000 });
    expect(at133over.spouse).toEqual({ incomeTax: 0, residentTax: 0 });
    const raised = calcAllDeductions({ ...BASE, spouseIncome: 1_400_000 }, { ...DEFAULT_DEDUCTION_PARAMS, spouseSpecialIncomeLimit: 1_500_000 });
    expect(raised.spouse.incomeTax).toBeGreaterThan(0);
    // 直接呼ぶ形でも同じ (年分は入口の判定にだけ効く)。
    expect(calcSpouseDeduction(5_000_000, 1_400_000, false, 2026, 1_500_000).incomeTax).toBe(raised.spouse.incomeTax);
    expect(calcSpouseDeduction(5_000_000, 1_400_000, false, 2026)).toEqual({ incomeTax: 0, residentTax: 0 });
  });

  it('calcAllDeductions は配偶者控除の入口に input.taxYear を渡す (現在の年で固定しない)', () => {
    // 令和6年分の入口は 48 万。50 万の配偶者は令和6年分では配偶者特別控除、令和8年分では配偶者控除 (満額)。
    const y2024 = calcAllDeductions({ totalIncome: 5_000_000, taxYear: 2024, spouseIncome: 500_000 });
    const y2026 = calcAllDeductions({ totalIncome: 5_000_000, taxYear: 2026, spouseIncome: 500_000 });
    expect(y2024.spouse).toEqual(calcSpouseDeduction(5_000_000, 500_000, false, 2024));
    expect(y2026.spouse).toEqual(calcSpouseDeduction(5_000_000, 500_000, false, 2026));
    expect(y2026.spouse.incomeTax).toBe(380_000);
  });

  it('扶養親族の所得上限: 48 万超は対象外、上げれば対象', () => {
    const deps = [{ kind: 'general', income: 500_000 }] as const;
    expect(calcAllDeductions({ ...BASE, dependentsWithIncome: deps }).dependents).toEqual({ incomeTax: 0, residentTax: 0 });
    const raised = calcAllDeductions({ ...BASE, dependentsWithIncome: deps }, { ...DEFAULT_DEDUCTION_PARAMS, dependentIncomeLimit: 500_000 });
    expect(raised.dependents).toEqual(dependentDeduction('general'));
    expect(calcDependentDeductionWithIncome(deps, 500_000)).toEqual(dependentDeduction('general'));
  });

  it('セルフメディケーション: 足切りと上限を渡す', () => {
    expect(calcSelfMedicationDeduction(50_000)).toEqual({ incomeTax: 38_000, residentTax: 38_000 });
    expect(calcSelfMedicationDeduction(50_000, 10_000, 100_000)).toEqual({ incomeTax: 40_000, residentTax: 40_000 });
    expect(calcSelfMedicationDeduction(200_000, 10_000, 100_000)).toEqual({ incomeTax: 100_000, residentTax: 100_000 });
    const r = calcAllDeductions({ ...BASE, selfMedicationPaid: 50_000 }, { ...DEFAULT_DEDUCTION_PARAMS, selfMedicationThreshold: 10_000, selfMedicationCap: 100_000 });
    expect(r.medical).toEqual({ incomeTax: 40_000, residentTax: 40_000 });
  });

  it('小規模企業共済の上限を渡す', () => {
    expect(clampSmallBizMutualAid(1_000_000)).toBe(840_000);
    expect(clampSmallBizMutualAid(1_000_000, 900_000)).toBe(900_000);
    const r = calcAllDeductions({ ...BASE, smallBizMutualAid: 1_000_000 }, { ...DEFAULT_DEDUCTION_PARAMS, smallBizMutualAnnualCap: 900_000 });
    expect(r.smallBizMutualAid).toEqual({ incomeTax: 900_000, residentTax: 900_000 });
  });

  it('寄附金控除: 足切りと所得比の上限を渡す', () => {
    expect(calcDonationDeduction(100_000, 5_000_000)).toEqual({ incomeTax: 98_000, residentTax: 0 });
    expect(calcDonationDeduction(100_000, 5_000_000, 1_000, 0.4)).toEqual({ incomeTax: 99_000, residentTax: 0 });
    // 上限 (合計所得 × 率) で頭打ち: 所得 100,000 × 50% = 50,000。
    expect(calcDonationDeduction(100_000, 100_000, 2_000, 0.5)).toEqual({ incomeTax: 50_000, residentTax: 0 });
    expect(calcDonationDeduction(1_000, 5_000_000, 1_000)).toEqual({ incomeTax: 0, residentTax: 0 });
    const r = calcAllDeductions({ ...BASE, donation: 100_000 }, { ...DEFAULT_DEDUCTION_PARAMS, donationDeductionFloor: 1_000 });
    expect(r.donation).toEqual({ incomeTax: 99_000, residentTax: 0 });
  });

  it('雑損控除: 災害関連支出の足切りと所得比の足切り率を渡す', () => {
    const input = { lossAmount: 1_000_000, disasterRelatedSpending: 200_000, totalIncome: 5_000_000 };
    // 既定: max(1,200,000 − 500,000, 200,000 − 50,000) = 700,000。
    expect(calcCasualtyLossDeduction(input)).toEqual({ incomeTax: 700_000, residentTax: 700_000 });
    // 率 5% → 1,200,000 − 250,000 = 950,000。
    expect(calcCasualtyLossDeduction(input, 50_000, 0.05)).toEqual({ incomeTax: 950_000, residentTax: 950_000 });
    // 足切り 40,000 で災害分 160,000 だが所得比の方が大きいので変わらない。損失を小さくすると災害分が効く。
    const small = { lossAmount: 0, disasterRelatedSpending: 200_000, totalIncome: 5_000_000 };
    expect(calcCasualtyLossDeduction(small).incomeTax).toBe(150_000);
    expect(calcCasualtyLossDeduction(small, 40_000).incomeTax).toBe(160_000);
    const r = calcAllDeductions({ ...BASE, casualtyLoss: { lossAmount: 0, disasterRelatedSpending: 200_000 } }, { ...DEFAULT_DEDUCTION_PARAMS, casualtyDisasterFloor: 40_000 });
    expect(r.casualtyLoss).toEqual({ incomeTax: 160_000, residentTax: 160_000 });
  });

  it('調整控除の基礎控除分の差を渡す (人的控除差の合計の底)', () => {
    expect(calcAllDeductions(BASE).humanDeductionDiff).toBe(50_000);
    expect(calcAllDeductions(BASE, { ...DEFAULT_DEDUCTION_PARAMS, basicHumanDeductionDiff: 100_000 }).humanDeductionDiff).toBe(100_000);
  });
});

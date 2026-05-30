import { describe, expect, it } from 'vitest';
import {
  calcAllDeductions,
  calcDependentDeduction,
  calcDonationDeduction,
  calcEarthquakeInsuranceDeduction,
  calcLifeInsuranceDeduction,
  calcMedicalDeduction,
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

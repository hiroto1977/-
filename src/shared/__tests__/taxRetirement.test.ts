import { describe, expect, it } from 'vitest';
import {
  calcRetirementTax,
  calcRetirementTaxableIncome,
  retirementDeduction,
  roundUpYearsOfService,
} from '../taxRetirement';
import { calcBaseIncomeTax, RECONSTRUCTION_SURTAX_RATE } from '../taxCalc';

describe('retirementDeduction', () => {
  it('is 0 for zero years', () => {
    expect(retirementDeduction(0)).toBe(0);
  });

  it('uses 40万×年数 with an 80万 floor for ≤20 years', () => {
    expect(retirementDeduction(1)).toBe(800_000); // floor
    expect(retirementDeduction(2)).toBe(800_000); // 80万 vs 80万
    expect(retirementDeduction(10)).toBe(4_000_000); // 40万×10
    expect(retirementDeduction(20)).toBe(8_000_000); // 40万×20
  });

  it('uses 800万 + 70万×(年数-20) above 20 years', () => {
    expect(retirementDeduction(21)).toBe(8_700_000);
    expect(retirementDeduction(38)).toBe(8_000_000 + 700_000 * 18); // 20,600,000
  });

  it('adds 100万 for disability retirement', () => {
    expect(retirementDeduction(10, true)).toBe(4_000_000 + 1_000_000);
  });
});

describe('calcRetirementTaxableIncome', () => {
  it('is 0 when severance does not exceed the deduction', () => {
    expect(calcRetirementTaxableIncome(3_000_000, 10)).toBe(0); // deduction 400万 > 300万
  });

  it('halves the amount after deduction (normal case)', () => {
    // 勤続30年 → 控除 800万+70万×10 = 1,500万。退職金 3,000万 → (3,000-1,500)万 ×1/2 = 750万
    expect(calcRetirementTaxableIncome(30_000_000, 30)).toBe(7_500_000);
  });

  it('short-term (≤5y): full 1/2 up to 300万 after deduction', () => {
    // 勤続3年 → 控除 120万。退職金 400万 → after 280万 ≤ 300万 → ×1/2 = 140万
    expect(calcRetirementTaxableIncome(4_000_000, 3, { shortTerm: true })).toBe(1_400_000);
  });

  it('short-term (≤5y): no 1/2 on the portion above 300万', () => {
    // 勤続3年 → 控除 120万。退職金 600万 → after 480万。
    // 300万までの1/2 = 150万 + 300万超(180万)全額 = 330万
    expect(calcRetirementTaxableIncome(6_000_000, 3, { shortTerm: true })).toBe(3_300_000);
  });

  it('short-term flag does not apply above 5 years of service', () => {
    // 勤続6年なら shortTerm でも通常の1/2。控除 240万。退職金 1,000万 → after 760万 ×1/2 = 380万
    expect(calcRetirementTaxableIncome(10_000_000, 6, { shortTerm: true })).toBe(3_800_000);
  });

  it('short-term applies at exactly 5 years (boundary)', () => {
    // 勤続5年 → 控除 max(80万, 40万×5)=200万。退職金 600万 → after 400万 (>300万)。
    // 短期: 150万 + (400万−300万) = 250万。通常なら 200万 になる差で境界を固定。
    expect(calcRetirementTaxableIncome(6_000_000, 5, { shortTerm: true })).toBe(2_500_000);
  });

  it('disability raises the deduction (+100万) and lowers taxable income', () => {
    // 退職金 500万・勤続10年: 通常控除 400万 → after 100万 → 50万。
    // 障害退職は控除 500万 → after 0 → 0。
    expect(calcRetirementTaxableIncome(5_000_000, 10, { disability: true })).toBe(0);
    expect(calcRetirementTaxableIncome(5_000_000, 10)).toBe(500_000);
  });
});

describe('calcRetirementTax', () => {
  it('returns zeros for zero severance', () => {
    const r = calcRetirementTax(0, 10);
    expect(r.taxableIncome).toBe(0);
    expect(r.incomeTax).toBe(0);
    expect(r.residentTax).toBe(0);
    expect(r.takeHome).toBe(0);
    expect(r.deduction).toBe(4_000_000);
  });

  it('honors the disability flag for the deduction on both zero and positive severance', () => {
    // ゼロ退職金でも控除は障害退職で +100万 (4M → 5M)。
    expect(calcRetirementTax(0, 10, { disability: true }).deduction).toBe(5_000_000);
    // 退職金あり: 控除 500万 → after 500万 → 課税退職所得 250万。
    const r = calcRetirementTax(10_000_000, 10, { disability: true });
    expect(r.deduction).toBe(5_000_000);
    expect(r.taxableIncome).toBe(2_500_000);
  });

  it('uses the base deduction (no +100万) on the positive-severance path without disability', () => {
    // 本道経路 (severance>0)・非障害 → 控除は基本額のみ。勤続30年 → 8,000,000 + 700,000×10 = 15,000,000。
    expect(calcRetirementTax(30_000_000, 30).deduction).toBe(15_000_000);
  });

  it('computes tax via base income tax × surtax and 10% resident', () => {
    // 勤続30年, 退職金 3,000万 → 課税退職所得 750万
    const r = calcRetirementTax(30_000_000, 30);
    expect(r.taxableIncome).toBe(7_500_000);
    expect(r.incomeTax).toBe(Math.round(calcBaseIncomeTax(7_500_000) * (1 + RECONSTRUCTION_SURTAX_RATE)));
    expect(r.residentTax).toBe(750_000); // 750万 × 10%
    expect(r.takeHome).toBe(30_000_000 - r.incomeTax - r.residentTax);
  });

  it('no tax when fully covered by the deduction', () => {
    const r = calcRetirementTax(3_000_000, 10); // deduction 400万 > 300万
    expect(r.taxableIncome).toBe(0);
    expect(r.incomeTax).toBe(0);
    expect(r.residentTax).toBe(0);
    expect(r.takeHome).toBe(3_000_000);
  });

  it('take-home is less than severance for taxable cases', () => {
    const r = calcRetirementTax(50_000_000, 20);
    expect(r.takeHome).toBeLessThan(50_000_000);
    expect(r.takeHome).toBeGreaterThan(0);
  });
});

describe('roundUpYearsOfService', () => {
  it('rounds any fraction of a year up (1年未満切り上げ)', () => {
    expect(roundUpYearsOfService(10 + 1 / 12)).toBe(11); // 10年1か月 → 11年
    expect(roundUpYearsOfService(20 + 11 / 12)).toBe(21); // 20年11か月 → 21年
    expect(roundUpYearsOfService(0.01)).toBe(1); // ごく僅かでも1年
  });

  it('keeps exact whole years unchanged', () => {
    expect(roundUpYearsOfService(20)).toBe(20);
    expect(roundUpYearsOfService(1)).toBe(1);
  });

  it('guards 0 / negative / NaN to 0', () => {
    expect(roundUpYearsOfService(0)).toBe(0);
    expect(roundUpYearsOfService(-3.5)).toBe(0);
    expect(roundUpYearsOfService(Number.NaN)).toBe(0);
  });

  it('flows into the deduction: 5年1か月 → 6年 → 控除 240万', () => {
    expect(retirementDeduction(roundUpYearsOfService(5 + 1 / 12))).toBe(2_400_000);
  });
});

describe('特定役員退職手当等 (specifiedOfficer)', () => {
  it('taxes the full post-deduction amount with no 1/2 (≤5y)', () => {
    // 勤続3年 → 控除 120万。退職金 600万 → after 480万。役員は全額課税 = 480万。
    expect(
      calcRetirementTaxableIncome(6_000_000, 3, { specifiedOfficer: true }),
    ).toBe(4_800_000);
  });

  it('ignores the 300万 boundary that short-term uses', () => {
    // 勤続3年・after 280万 (≤300万)。短期なら1/2=140万、特定役員は全額=280万。
    expect(
      calcRetirementTaxableIncome(4_000_000, 3, { specifiedOfficer: true }),
    ).toBe(2_800_000);
    expect(
      calcRetirementTaxableIncome(4_000_000, 3, { shortTerm: true }),
    ).toBe(1_400_000);
  });

  it('applies at exactly 5 years but not at 6 (boundary)', () => {
    // 勤続5年 → 控除 200万。退職金 600万 → after 400万 → 全額課税 400万。
    expect(
      calcRetirementTaxableIncome(6_000_000, 5, { specifiedOfficer: true }),
    ).toBe(4_000_000);
    // 勤続6年 → specifiedOfficer 無効 → 通常1/2。控除 240万 → after 360万 → 180万。
    expect(
      calcRetirementTaxableIncome(6_000_000, 6, { specifiedOfficer: true }),
    ).toBe(1_800_000);
  });

  it('takes precedence over shortTerm when both are set', () => {
    // 勤続3年・after 480万。両方 true なら特定役員 (全額480万)、短期(330万) ではない。
    expect(
      calcRetirementTaxableIncome(6_000_000, 3, {
        specifiedOfficer: true,
        shortTerm: true,
      }),
    ).toBe(4_800_000);
  });

  it('flows through calcRetirementTax', () => {
    const officer = calcRetirementTax(6_000_000, 3, { specifiedOfficer: true });
    expect(officer.taxableIncome).toBe(4_800_000);
    const normal = calcRetirementTax(6_000_000, 3, { shortTerm: true });
    expect(normal.taxableIncome).toBe(3_300_000);
    expect(officer.incomeTax).toBeGreaterThan(normal.incomeTax);
  });
});

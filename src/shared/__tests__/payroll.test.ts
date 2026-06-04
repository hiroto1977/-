import { describe, expect, it } from 'vitest';
import {
  COMMUTE_PUBLIC_TRANSPORT_CAP,
  publicTransportCommute,
  carCommuteNonTaxableLimit,
  bonusWithholdingRatePctDep0,
  bonusWithholdingTax,
} from '../payroll';

describe('publicTransportCommute', () => {
  it('treats commute within the cap as fully non-taxable', () => {
    expect(publicTransportCommute(120_000)).toEqual({ nonTaxable: 120_000, taxable: 0 });
  });

  it('caps the non-taxable portion at 150,000 and taxes the excess', () => {
    expect(publicTransportCommute(180_000)).toEqual({ nonTaxable: COMMUTE_PUBLIC_TRANSPORT_CAP, taxable: 30_000 });
  });

  it('treats a negative input as zero', () => {
    expect(publicTransportCommute(-1)).toEqual({ nonTaxable: 0, taxable: 0 });
  });
});

describe('carCommuteNonTaxableLimit', () => {
  it('returns 0 below 2km and steps up by distance band', () => {
    expect(carCommuteNonTaxableLimit(1)).toBe(0);
    expect(carCommuteNonTaxableLimit(5)).toBe(4_200);
    expect(carCommuteNonTaxableLimit(12)).toBe(7_100);
    expect(carCommuteNonTaxableLimit(20)).toBe(12_900);
    expect(carCommuteNonTaxableLimit(30)).toBe(18_700);
    expect(carCommuteNonTaxableLimit(40)).toBe(24_400);
    expect(carCommuteNonTaxableLimit(50)).toBe(28_000);
    expect(carCommuteNonTaxableLimit(60)).toBe(31_600);
  });

  it('uses inclusive lower / exclusive upper band boundaries', () => {
    expect(carCommuteNonTaxableLimit(2)).toBe(4_200);
    expect(carCommuteNonTaxableLimit(10)).toBe(7_100);
    // 各境界 km は上側バンド (`<` は排他的)。`<` を `<=` にする mutant を殺す。
    expect(carCommuteNonTaxableLimit(15)).toBe(12_900);
    expect(carCommuteNonTaxableLimit(25)).toBe(18_700);
    expect(carCommuteNonTaxableLimit(35)).toBe(24_400);
    expect(carCommuteNonTaxableLimit(45)).toBe(28_000);
    expect(carCommuteNonTaxableLimit(55)).toBe(31_600);
  });
});

describe('bonusWithholdingRatePctDep0', () => {
  it('returns 0% below the first bracket', () => {
    expect(bonusWithholdingRatePctDep0(50_000)).toBe(0);
  });

  it('looks up the rate by the previous-month salary bracket', () => {
    expect(bonusWithholdingRatePctDep0(70_000)).toBe(2.042); // [68k,79k)
    expect(bonusWithholdingRatePctDep0(300_000)).toBe(8.168); // [300k,334k)
    expect(bonusWithholdingRatePctDep0(5_000_000)).toBe(45.945); // top bracket
  });
});

describe('bonusWithholdingTax', () => {
  it('taxes (bonus − social insurance) at the bracket rate, flooring to yen', () => {
    // prevMonth 300,000 → 8.168%; taxable 500,000 - 70,000 = 430,000 → floor(35,122.4) = 35,122
    const w = bonusWithholdingTax({ bonus: 500_000, socialInsurance: 70_000, prevMonthSalaryAfterSI: 300_000 });
    expect(w.taxableBonus).toBe(430_000);
    expect(w.ratePct).toBe(8.168);
    expect(w.tax).toBe(35_122);
  });

  it('is zero when the previous-month salary falls in the 0% bracket', () => {
    const w = bonusWithholdingTax({ bonus: 200_000, socialInsurance: 30_000, prevMonthSalaryAfterSI: 50_000 });
    expect(w.ratePct).toBe(0);
    expect(w.tax).toBe(0);
  });

  it('never goes negative when social insurance exceeds the bonus', () => {
    const w = bonusWithholdingTax({ bonus: 50_000, socialInsurance: 80_000, prevMonthSalaryAfterSI: 300_000 });
    expect(w.taxableBonus).toBe(0);
    expect(w.tax).toBe(0);
  });
});

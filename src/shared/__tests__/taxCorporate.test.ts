import { describe, expect, it } from 'vitest';
import {
  CORP_TAX_REDUCED_RATE,
  CORP_TAX_STANDARD_RATE,
  CORP_TAX_REDUCED_THRESHOLD,
  LOCAL_CORP_TAX_RATE,
  RESIDENT_CORP_TAX_RATE,
  DEFAULT_PER_CAPITA_LEVY,
  BUSINESS_TAX_RATE_TIER1,
  BUSINESS_TAX_RATE_TIER2,
  BUSINESS_TAX_RATE_TIER3,
  BUSINESS_TAX_TIER1_LIMIT,
  BUSINESS_TAX_TIER2_LIMIT,
  SPECIAL_BUSINESS_TAX_RATE,
  LARGE_CORP_CAPITAL_THRESHOLD,
  PER_CAPITA_EMPLOYEE_THRESHOLD,
  isSmallBusiness,
  calcCorporateIncomeTax,
  calcLocalCorporateTax,
  calcResidentCorporateTax,
  calcBusinessTaxIncomePortion,
  calcSpecialBusinessTax,
  resolveCorporatePerCapita,
  resolvePerCapitaLevy,
  calcCorporateTax,
} from '../taxCorporate';

describe('isSmallBusiness', () => {
  it('defaults to small (conservative) when nothing is given', () => {
    expect(isSmallBusiness()).toBe(true);
    expect(isSmallBusiness({})).toBe(true);
  });

  it('honors an explicit smallBusiness flag over capital', () => {
    expect(isSmallBusiness({ smallBusiness: false })).toBe(false);
    expect(isSmallBusiness({ smallBusiness: true })).toBe(true);
    // explicit flag wins even when capital would say otherwise
    expect(isSmallBusiness({ smallBusiness: true, capital: 200_000_000 })).toBe(true);
    expect(isSmallBusiness({ smallBusiness: false, capital: 1_000_000 })).toBe(false);
  });

  it('classifies by capital at the 1億円 boundary (≤ is small)', () => {
    expect(isSmallBusiness({ capital: 100_000_000 })).toBe(true); // exactly 1億 → small
    expect(isSmallBusiness({ capital: 100_000_001 })).toBe(false); // just over → large
    expect(isSmallBusiness({ capital: 50_000_000 })).toBe(true);
  });
});

describe('calcCorporateIncomeTax', () => {
  it('is 0 for zero or negative income', () => {
    expect(calcCorporateIncomeTax(0, true)).toBe(0);
    expect(calcCorporateIncomeTax(-1_000_000, true)).toBe(0);
    expect(calcCorporateIncomeTax(0, false)).toBe(0);
    expect(calcCorporateIncomeTax(-5, false)).toBe(0);
  });

  it('applies the reduced 15% up to 800万 for small business', () => {
    expect(calcCorporateIncomeTax(8_000_000, true)).toBe(1_200_000); // 800万×15%
    expect(calcCorporateIncomeTax(4_000_000, true)).toBe(600_000); // 400万×15%
  });

  it('applies 23.2% only to the part above 800万 for small business', () => {
    // 10,000,000: 800万×15% + 200万×23.2% = 1,200,000 + 464,000
    expect(calcCorporateIncomeTax(10_000_000, true)).toBe(1_664_000);
  });

  it('handles the 800万 boundary precisely (just under / at / just over)', () => {
    // just under: fully at reduced rate
    expect(calcCorporateIncomeTax(7_999_999, true)).toBe(Math.round(7_999_999 * 0.15));
    // at: 800万×15%
    expect(calcCorporateIncomeTax(8_000_000, true)).toBe(1_200_000);
    // just over: 800万×15% + 1×23.2%
    expect(calcCorporateIncomeTax(8_000_001, true)).toBe(Math.round(8_000_000 * 0.15 + 1 * 0.232));
  });

  it('applies a flat 23.2% for large corporations on all income', () => {
    expect(calcCorporateIncomeTax(10_000_000, false)).toBe(2_320_000); // 1,000万×23.2%
    expect(calcCorporateIncomeTax(8_000_000, false)).toBe(Math.round(8_000_000 * 0.232));
    // large pays more than small at the same income (no reduced band)
    expect(calcCorporateIncomeTax(10_000_000, false)).toBeGreaterThan(
      calcCorporateIncomeTax(10_000_000, true),
    );
  });
});

describe('calcLocalCorporateTax', () => {
  it('is 10.3% of the corporate income tax', () => {
    expect(calcLocalCorporateTax(1_000_000)).toBe(103_000);
    expect(calcLocalCorporateTax(1_664_000)).toBe(Math.round(1_664_000 * 0.103));
  });

  it('clamps negative input to 0', () => {
    expect(calcLocalCorporateTax(-100)).toBe(0);
    expect(calcLocalCorporateTax(0)).toBe(0);
  });
});

describe('calcResidentCorporateTax', () => {
  it('adds the 7% 法人税割 to the 均等割', () => {
    // 法人税割 = 1,000,000×7% = 70,000; 均等割 = 70,000 → 140,000
    expect(calcResidentCorporateTax(1_000_000)).toBe(140_000);
  });

  it('charges only the 均等割 when corporate tax is 0', () => {
    expect(calcResidentCorporateTax(0)).toBe(DEFAULT_PER_CAPITA_LEVY);
    expect(calcResidentCorporateTax(0)).toBe(70_000);
  });

  it('uses a custom 均等割 when provided', () => {
    expect(calcResidentCorporateTax(0, 290_000)).toBe(290_000);
    expect(calcResidentCorporateTax(1_000_000, 180_000)).toBe(70_000 + 180_000);
  });

  it('clamps negative corporate tax and negative levy to 0', () => {
    expect(calcResidentCorporateTax(-1_000_000, 70_000)).toBe(70_000);
    expect(calcResidentCorporateTax(1_000_000, -5)).toBe(70_000); // 法人税割のみ
  });
});

describe('calcBusinessTaxIncomePortion', () => {
  it('is 0 for zero or negative income', () => {
    expect(calcBusinessTaxIncomePortion(0)).toBe(0);
    expect(calcBusinessTaxIncomePortion(-3_000_000)).toBe(0);
  });

  it('applies 3.5% up to 400万', () => {
    expect(calcBusinessTaxIncomePortion(4_000_000)).toBe(140_000); // 400万×3.5%
    expect(calcBusinessTaxIncomePortion(2_000_000)).toBe(70_000);
  });

  it('applies 5.3% between 400万 and 800万', () => {
    // 8,000,000: 400万×3.5% + 400万×5.3% = 140,000 + 212,000
    expect(calcBusinessTaxIncomePortion(8_000_000)).toBe(352_000);
    // 6,000,000: 400万×3.5% + 200万×5.3% = 140,000 + 106,000
    expect(calcBusinessTaxIncomePortion(6_000_000)).toBe(246_000);
  });

  it('applies 7.0% above 800万', () => {
    // 10,000,000: 140,000 + 212,000 + 200万×7% = 352,000 + 140,000
    expect(calcBusinessTaxIncomePortion(10_000_000)).toBe(492_000);
  });

  it('handles the 400万 and 800万 tier boundaries precisely', () => {
    // just under 400万 → all tier1
    expect(calcBusinessTaxIncomePortion(3_999_999)).toBe(Math.round(3_999_999 * 0.035));
    // just over 400万 → tier1 full + 1 at tier2
    expect(calcBusinessTaxIncomePortion(4_000_001)).toBe(
      Math.round(4_000_000 * 0.035 + 1 * 0.053),
    );
    // just under 800万 → tier1 full + (400万-1) at tier2
    expect(calcBusinessTaxIncomePortion(7_999_999)).toBe(
      Math.round(4_000_000 * 0.035 + 3_999_999 * 0.053),
    );
    // just over 800万 → tier1 + tier2 full + 1 at tier3
    expect(calcBusinessTaxIncomePortion(8_000_001)).toBe(
      Math.round(4_000_000 * 0.035 + 4_000_000 * 0.053 + 1 * 0.07),
    );
  });
});

describe('calcSpecialBusinessTax', () => {
  it('is 37% of the base business tax income portion', () => {
    expect(calcSpecialBusinessTax(352_000)).toBe(Math.round(352_000 * 0.37));
    expect(calcSpecialBusinessTax(1_000_000)).toBe(370_000);
  });

  it('clamps negative input to 0', () => {
    expect(calcSpecialBusinessTax(-100)).toBe(0);
    expect(calcSpecialBusinessTax(0)).toBe(0);
  });
});

describe('calcCorporateTax (aggregate)', () => {
  it('aggregates all components for a small business at 10,000,000 income', () => {
    const r = calcCorporateTax(10_000_000);
    expect(r.smallBusiness).toBe(true);
    expect(r.corporateIncomeTax).toBe(1_664_000); // 800万×15% + 200万×23.2%
    expect(r.localCorporateTax).toBe(Math.round(1_664_000 * 0.103)); // 171,392
    expect(r.businessTax).toBe(492_000);
    expect(r.specialBusinessTax).toBe(Math.round(492_000 * 0.37)); // 182,040
    expect(r.residentTax).toBe(Math.round(1_664_000 * 0.07) + 70_000); // 116,480 + 70,000
    const expectedTotal =
      r.corporateIncomeTax +
      r.localCorporateTax +
      r.residentTax +
      r.businessTax +
      r.specialBusinessTax;
    expect(r.totalTax).toBe(expectedTotal);
    expect(r.taxableIncome).toBe(10_000_000);
  });

  it('keeps effectiveRate consistent with totalTax / income', () => {
    const r = calcCorporateTax(10_000_000);
    expect(r.effectiveRate).toBeCloseTo(r.totalTax / 10_000_000, 12);
    expect(r.effectiveRate).toBeGreaterThan(0);
  });

  it('keeps afterTaxProfit consistent with income − totalTax', () => {
    const r = calcCorporateTax(10_000_000);
    expect(r.afterTaxProfit).toBe(10_000_000 - r.totalTax);
  });

  it('treats a loss (income 0) as 均等割-only', () => {
    const r = calcCorporateTax(0);
    expect(r.corporateIncomeTax).toBe(0);
    expect(r.localCorporateTax).toBe(0);
    expect(r.businessTax).toBe(0);
    expect(r.specialBusinessTax).toBe(0);
    expect(r.residentTax).toBe(70_000); // 均等割のみ
    expect(r.totalTax).toBe(70_000);
    expect(r.effectiveRate).toBe(0); // income not > 0
    expect(r.afterTaxProfit).toBe(-70_000); // 0 − 70,000
  });

  it('treats a negative income (deficit) as 均等割-only and subtracts from income', () => {
    const r = calcCorporateTax(-5_000_000);
    expect(r.corporateIncomeTax).toBe(0);
    expect(r.businessTax).toBe(0);
    expect(r.totalTax).toBe(70_000); // 均等割のみ
    expect(r.effectiveRate).toBe(0);
    expect(r.afterTaxProfit).toBe(-5_000_000 - 70_000);
    expect(r.taxableIncome).toBe(-5_000_000);
  });

  it('uses a custom 均等割 in the aggregate', () => {
    const r = calcCorporateTax(0, { perCapitaLevy: 290_000 });
    expect(r.residentTax).toBe(290_000);
    expect(r.totalTax).toBe(290_000);
  });

  it('respects the large-corporation branch (flat 23.2%, no reduced band)', () => {
    const small = calcCorporateTax(10_000_000, { smallBusiness: true });
    const large = calcCorporateTax(10_000_000, { smallBusiness: false });
    expect(large.smallBusiness).toBe(false);
    expect(large.corporateIncomeTax).toBe(2_320_000);
    expect(large.corporateIncomeTax).toBeGreaterThan(small.corporateIncomeTax);
    expect(large.totalTax).toBeGreaterThan(small.totalTax);
  });

  it('classifies large by capital over the 1億円 threshold', () => {
    const r = calcCorporateTax(10_000_000, { capital: 200_000_000 });
    expect(r.smallBusiness).toBe(false);
    expect(r.corporateIncomeTax).toBe(2_320_000);
  });

  it('produces a plausible effective rate around 30-35% for mid income', () => {
    const r = calcCorporateTax(10_000_000);
    expect(r.effectiveRate).toBeGreaterThan(0.25);
    expect(r.effectiveRate).toBeLessThan(0.4);
  });
});

describe('resolveCorporatePerCapita (均等割 区分テーブル)', () => {
  it('returns the minimum tier (7万 / 14万) for capital ≤ 1千万', () => {
    expect(resolveCorporatePerCapita(0)).toBe(70_000);
    expect(resolveCorporatePerCapita(5_000_000)).toBe(70_000);
    expect(resolveCorporatePerCapita(10_000_000)).toBe(70_000); // exactly 1千万 → still min
    expect(resolveCorporatePerCapita(10_000_000, 100)).toBe(140_000); // 50人超
  });

  it('handles the 1千万 capital boundary (≤ stays min, just over moves up)', () => {
    expect(resolveCorporatePerCapita(10_000_000)).toBe(70_000);
    expect(resolveCorporatePerCapita(10_000_001)).toBe(180_000); // just over → next tier
    expect(resolveCorporatePerCapita(10_000_001, 60)).toBe(200_000);
  });

  it('handles the 1億 capital boundary', () => {
    expect(resolveCorporatePerCapita(100_000_000)).toBe(180_000); // exactly 1億 → 2nd tier
    expect(resolveCorporatePerCapita(100_000_001)).toBe(290_000); // just over → 3rd tier
    expect(resolveCorporatePerCapita(100_000_001, 51)).toBe(530_000);
  });

  it('handles the 10億 capital boundary', () => {
    expect(resolveCorporatePerCapita(1_000_000_000)).toBe(290_000); // exactly 10億 → 3rd tier
    expect(resolveCorporatePerCapita(1_000_000_001)).toBe(410_000); // just over → 4th tier
    expect(resolveCorporatePerCapita(1_000_000_001, 100)).toBe(2_290_000);
  });

  it('handles the 50億 capital boundary and the top tier', () => {
    expect(resolveCorporatePerCapita(5_000_000_000)).toBe(410_000); // exactly 50億 → 4th tier
    expect(resolveCorporatePerCapita(5_000_000_000, 100)).toBe(2_290_000);
    expect(resolveCorporatePerCapita(5_000_000_001)).toBe(410_000); // just over → top tier, 50人以下
    expect(resolveCorporatePerCapita(5_000_000_001, 100)).toBe(3_800_000); // top tier, 50人超
    expect(resolveCorporatePerCapita(99_000_000_000, 9999)).toBe(3_800_000); // very large
  });

  it('treats the 従業者 50人 boundary as 以下/超 (50ちょうどは小区分)', () => {
    expect(PER_CAPITA_EMPLOYEE_THRESHOLD).toBe(50);
    expect(resolveCorporatePerCapita(50_000_000, 50)).toBe(180_000); // 50ちょうど → 50人以下
    expect(resolveCorporatePerCapita(50_000_000, 51)).toBe(200_000); // 51 → 50人超
    expect(resolveCorporatePerCapita(50_000_000, 49)).toBe(180_000);
  });

  it('defaults employees to 50人以下 when omitted', () => {
    expect(resolveCorporatePerCapita(50_000_000)).toBe(180_000);
    expect(resolveCorporatePerCapita(50_000_000, 0)).toBe(180_000);
  });

  it('clamps negative capital and negative employees to the min tier / 少区分', () => {
    expect(resolveCorporatePerCapita(-100)).toBe(70_000);
    expect(resolveCorporatePerCapita(50_000_000, -5)).toBe(180_000); // 負の従業者は50人以下
  });

  it('is monotonic non-decreasing in capital for each employee column', () => {
    const caps = [0, 10_000_000, 100_000_000, 1_000_000_000, 5_000_000_000, 1e12];
    for (const many of [0, 100]) {
      for (let i = 1; i < caps.length; i++) {
        expect(resolveCorporatePerCapita(caps[i]!, many)).toBeGreaterThanOrEqual(
          resolveCorporatePerCapita(caps[i - 1]!, many),
        );
      }
    }
  });

  it('the 50人超 column is always ≥ the 50人以下 column', () => {
    for (const cap of [0, 50_000_000, 500_000_000, 3_000_000_000, 1e12]) {
      expect(resolveCorporatePerCapita(cap, 100)).toBeGreaterThanOrEqual(
        resolveCorporatePerCapita(cap, 0),
      );
    }
  });
});

describe('resolvePerCapitaLevy (均等割の決定順)', () => {
  it('prefers an explicit perCapitaLevy over the table', () => {
    expect(resolvePerCapitaLevy({ perCapitaLevy: 290_000, capital: 1_000_000_000 })).toBe(290_000);
    expect(resolvePerCapitaLevy({ perCapitaLevy: 0 })).toBe(0); // explicit 0 honored (not default)
  });

  it('resolves from capital (+employees) when no explicit levy', () => {
    expect(resolvePerCapitaLevy({ capital: 100_000_001 })).toBe(290_000);
    expect(resolvePerCapitaLevy({ capital: 100_000_001, employees: 60 })).toBe(530_000);
  });

  it('falls back to the minimum tier when neither levy nor capital is given', () => {
    expect(resolvePerCapitaLevy()).toBe(DEFAULT_PER_CAPITA_LEVY);
    expect(resolvePerCapitaLevy({})).toBe(70_000);
    expect(resolvePerCapitaLevy({ employees: 100 })).toBe(70_000); // employees alone → default
  });
});

describe('calcCorporateTax 均等割 integration (round 56)', () => {
  it('is unchanged for the no-profile / explicit-levy callers (既定挙動不変)', () => {
    // no profile → 最小区分 7万 (従来どおり)
    expect(calcCorporateTax(0).residentTax).toBe(70_000);
    // explicit perCapitaLevy still wins
    expect(calcCorporateTax(0, { perCapitaLevy: 290_000 }).residentTax).toBe(290_000);
    // explicit levy wins even with a large capital that would resolve higher/lower
    expect(
      calcCorporateTax(0, { perCapitaLevy: 70_000, capital: 5_000_000_001, employees: 100 })
        .residentTax,
    ).toBe(70_000);
  });

  it('resolves 均等割 from capital alone when no explicit levy', () => {
    const r = calcCorporateTax(0, { capital: 1_000_000_001 });
    expect(r.residentTax).toBe(410_000); // 10億超・50人以下
  });

  it('resolves 均等割 from capital + employees', () => {
    const r = calcCorporateTax(0, { capital: 1_000_000_001, employees: 100 });
    expect(r.residentTax).toBe(2_290_000); // 10億超・50人超
  });

  it('adds the 法人税割 on top of the resolved 均等割', () => {
    const r = calcCorporateTax(10_000_000, { capital: 50_000_000 });
    // 均等割 = 1千万超〜1億以下・50人以下 = 180,000; 法人税割 = 1,664,000×7%
    expect(r.residentTax).toBe(Math.round(1_664_000 * 0.07) + 180_000);
  });
});

describe('year constants (令和6年度)', () => {
  it('exposes the documented rate table', () => {
    expect(CORP_TAX_REDUCED_RATE).toBe(0.15);
    expect(CORP_TAX_STANDARD_RATE).toBe(0.232);
    expect(CORP_TAX_REDUCED_THRESHOLD).toBe(8_000_000);
    expect(LOCAL_CORP_TAX_RATE).toBe(0.103);
    expect(RESIDENT_CORP_TAX_RATE).toBe(0.07);
    expect(DEFAULT_PER_CAPITA_LEVY).toBe(70_000);
    expect(BUSINESS_TAX_RATE_TIER1).toBe(0.035);
    expect(BUSINESS_TAX_RATE_TIER2).toBe(0.053);
    expect(BUSINESS_TAX_RATE_TIER3).toBe(0.07);
    expect(BUSINESS_TAX_TIER1_LIMIT).toBe(4_000_000);
    expect(BUSINESS_TAX_TIER2_LIMIT).toBe(8_000_000);
    expect(SPECIAL_BUSINESS_TAX_RATE).toBe(0.37);
    expect(LARGE_CORP_CAPITAL_THRESHOLD).toBe(100_000_000);
    expect(PER_CAPITA_EMPLOYEE_THRESHOLD).toBe(50);
  });
});

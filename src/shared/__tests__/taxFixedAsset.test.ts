import { describe, expect, it } from 'vitest';
import {
  FIXED_ASSET_STANDARD_RATE,
  CITY_PLANNING_MAX_RATE,
  LAND_TAX_THRESHOLD,
  HOUSE_TAX_THRESHOLD,
  DEPRECIABLE_ASSET_TAX_THRESHOLD,
  fixedAssetTax,
  cityPlanningTax,
  residentialLandTaxableBase,
  isBelowTaxThreshold,
  calcFixedAssetTaxTotal,
  type AssetType,
} from '../taxFixedAsset';

describe('constants', () => {
  it('exposes the fixed-asset standard rate of 1.4%', () => {
    expect(FIXED_ASSET_STANDARD_RATE).toBe(0.014);
  });

  it('exposes the city-planning max rate of 0.3%', () => {
    expect(CITY_PLANNING_MAX_RATE).toBe(0.003);
  });

  it('exposes the land tax threshold of 300,000 yen', () => {
    expect(LAND_TAX_THRESHOLD).toBe(300_000);
  });

  it('exposes the house tax threshold of 200,000 yen', () => {
    expect(HOUSE_TAX_THRESHOLD).toBe(200_000);
  });

  it('exposes the depreciable-asset tax threshold of 1,500,000 yen', () => {
    expect(DEPRECIABLE_ASSET_TAX_THRESHOLD).toBe(1_500_000);
  });
});

describe('fixedAssetTax', () => {
  it('applies the standard 1.4% rate to a clean base', () => {
    // 10,000,000 × 0.014 = 140,000
    expect(fixedAssetTax({ taxableBase: 10_000_000 })).toBe(140_000);
  });

  it('defaults to FIXED_ASSET_STANDARD_RATE when rate is omitted', () => {
    expect(fixedAssetTax({ taxableBase: 5_000_000 })).toBe(70_000);
  });

  it('floors the tax to the nearest 100 yen (drops sub-100 remainder)', () => {
    // 1,234,567 × 0.014 = 17,283.938 → floor(/100)*100 = 17,200
    expect(fixedAssetTax({ taxableBase: 1_234_567 })).toBe(17_200);
  });

  it('floors a result that is one yen below a 100 boundary', () => {
    // base 7,142,857 × 0.014 = 99,999.998 → 99,900
    expect(fixedAssetTax({ taxableBase: 7_142_857 })).toBe(99_900);
  });

  it('keeps an exact 100-yen multiple unchanged', () => {
    // base 100,000 × 0.014 = 1,400 (already a multiple of 100)
    expect(fixedAssetTax({ taxableBase: 100_000 })).toBe(1_400);
  });

  it('returns 0 for a zero base', () => {
    expect(fixedAssetTax({ taxableBase: 0 })).toBe(0);
  });

  it('accepts a custom rate', () => {
    // 10,000,000 × 0.013 = 130,000
    expect(fixedAssetTax({ taxableBase: 10_000_000, rate: 0.013 })).toBe(130_000);
  });

  it('accepts rate 0 (tax becomes 0)', () => {
    expect(fixedAssetTax({ taxableBase: 10_000_000, rate: 0 })).toBe(0);
  });

  it('accepts rate 1 (the upper bound)', () => {
    expect(fixedAssetTax({ taxableBase: 12_345 })).toBeGreaterThanOrEqual(0);
    expect(fixedAssetTax({ taxableBase: 12_345, rate: 1 })).toBe(12_300);
  });

  it('throws for a negative base', () => {
    expect(() => fixedAssetTax({ taxableBase: -1 })).toThrow();
  });

  it('throws for a non-finite base (NaN)', () => {
    expect(() => fixedAssetTax({ taxableBase: NaN })).toThrow();
  });

  it('throws for a non-finite base (Infinity)', () => {
    expect(() => fixedAssetTax({ taxableBase: Infinity })).toThrow();
  });

  it('throws for a negative rate', () => {
    expect(() => fixedAssetTax({ taxableBase: 1_000_000, rate: -0.01 })).toThrow();
  });

  it('throws for a rate above 1', () => {
    expect(() => fixedAssetTax({ taxableBase: 1_000_000, rate: 1.01 })).toThrow();
  });

  it('throws for a non-finite rate (NaN)', () => {
    expect(() => fixedAssetTax({ taxableBase: 1_000_000, rate: NaN })).toThrow();
  });

  it('throws for a non-finite rate (Infinity)', () => {
    expect(() => fixedAssetTax({ taxableBase: 1_000_000, rate: Infinity })).toThrow();
  });
});

describe('cityPlanningTax', () => {
  it('applies the default 0.3% rate to a clean base', () => {
    // 10,000,000 × 0.003 = 30,000
    expect(cityPlanningTax({ taxableBase: 10_000_000 })).toBe(30_000);
  });

  it('defaults to CITY_PLANNING_MAX_RATE when rate is omitted', () => {
    expect(cityPlanningTax({ taxableBase: 40_000_000 })).toBe(120_000);
  });

  it('floors the tax to the nearest 100 yen', () => {
    // 1,234,567 × 0.003 = 3,703.701 → 3,700
    expect(cityPlanningTax({ taxableBase: 1_234_567 })).toBe(3_700);
  });

  it('floors a result that is one yen below a 100 boundary', () => {
    // base 33,333,300 × 0.003 = 99,999.9 → 99,900
    expect(cityPlanningTax({ taxableBase: 33_333_300 })).toBe(99_900);
  });

  it('returns 0 for a zero base', () => {
    expect(cityPlanningTax({ taxableBase: 0 })).toBe(0);
  });

  it('accepts a custom rate below the cap', () => {
    // 10,000,000 × 0.002 = 20,000
    expect(cityPlanningTax({ taxableBase: 10_000_000, rate: 0.002 })).toBe(20_000);
  });

  it('accepts rate exactly at the cap (0.003)', () => {
    expect(cityPlanningTax({ taxableBase: 10_000_000, rate: 0.003 })).toBe(30_000);
  });

  it('accepts rate 0 (tax becomes 0)', () => {
    expect(cityPlanningTax({ taxableBase: 10_000_000, rate: 0 })).toBe(0);
  });

  it('throws when the rate exceeds the 0.3% cap', () => {
    expect(() => cityPlanningTax({ taxableBase: 10_000_000, rate: 0.0031 })).toThrow(/cap/);
  });

  it('throws for a negative base', () => {
    expect(() => cityPlanningTax({ taxableBase: -1 })).toThrow();
  });

  it('throws for a non-finite base (NaN)', () => {
    expect(() => cityPlanningTax({ taxableBase: NaN })).toThrow();
  });

  it('throws for a non-finite base (Infinity)', () => {
    expect(() => cityPlanningTax({ taxableBase: Infinity })).toThrow();
  });

  it('throws for a negative rate', () => {
    expect(() => cityPlanningTax({ taxableBase: 1_000_000, rate: -0.001 })).toThrow();
  });

  it('throws for a non-finite rate (NaN)', () => {
    expect(() => cityPlanningTax({ taxableBase: 1_000_000, rate: NaN })).toThrow();
  });

  it('throws for a non-finite rate (Infinity)', () => {
    expect(() => cityPlanningTax({ taxableBase: 1_000_000, rate: Infinity })).toThrow();
  });
});

describe('residentialLandTaxableBase', () => {
  it('compresses small-scale land below 200sqm to 1/6 (fixed) and 1/3 (city)', () => {
    // area 100 <= 200, dwellings 1 → all small-scale.
    // fixed = 12,000,000 / 6 = 2,000,000 ; city = 12,000,000 / 3 = 4,000,000
    expect(residentialLandTaxableBase({ assessedValue: 12_000_000, areaSqm: 100 })).toEqual({
      fixedAssetBase: 2_000_000,
      cityPlanningBase: 4_000_000,
    });
  });

  it('treats exactly 200sqm (per dwelling) as entirely small-scale', () => {
    // area 200 == limit, all small-scale.
    // fixed = 60,000,000 / 6 = 10,000,000 ; city = 60,000,000 / 3 = 20,000,000
    expect(residentialLandTaxableBase({ assessedValue: 60_000_000, areaSqm: 200 })).toEqual({
      fixedAssetBase: 10_000_000,
      cityPlanningBase: 20_000_000,
    });
  });

  it('prorates above 200sqm into small-scale (1/6, 1/3) and general (1/3, 2/3)', () => {
    // area 300, dwellings 1, valuePerSqm 300,000.
    // small 200sqm → 60,000,000 ; general 100sqm → 30,000,000
    // fixed = 60M/6 + 30M/3 = 10,000,000 + 10,000,000 = 20,000,000
    // city  = 60M/3 + 30M*2/3 = 20,000,000 + 20,000,000 = 40,000,000
    expect(residentialLandTaxableBase({ assessedValue: 90_000_000, areaSqm: 300 })).toEqual({
      fixedAssetBase: 20_000_000,
      cityPlanningBase: 40_000_000,
    });
  });

  it('scales the small-scale limit by dwelling count (2 dwellings → 400sqm)', () => {
    // area 600, dwellings 2 → limit 400, valuePerSqm 300,000.
    // small 400sqm → 120,000,000 ; general 200sqm → 60,000,000
    // fixed = 120M/6 + 60M/3 = 20,000,000 + 20,000,000 = 40,000,000
    // city  = 120M/3 + 60M*2/3 = 40,000,000 + 40,000,000 = 80,000,000
    expect(
      residentialLandTaxableBase({ assessedValue: 180_000_000, areaSqm: 600, dwellings: 2 }),
    ).toEqual({ fixedAssetBase: 40_000_000, cityPlanningBase: 80_000_000 });
  });

  it('treats 400sqm with 2 dwellings as entirely small-scale (boundary)', () => {
    // area 400 == limit (2 × 200), all small-scale.
    // fixed = 120,000,000 / 6 = 20,000,000 ; city = 120,000,000 / 3 = 40,000,000
    expect(
      residentialLandTaxableBase({ assessedValue: 120_000_000, areaSqm: 400, dwellings: 2 }),
    ).toEqual({ fixedAssetBase: 20_000_000, cityPlanningBase: 40_000_000 });
  });

  it('returns zero bases for zero area', () => {
    expect(residentialLandTaxableBase({ assessedValue: 10_000_000, areaSqm: 0 })).toEqual({
      fixedAssetBase: 0,
      cityPlanningBase: 0,
    });
  });

  it('defaults dwellings to 1 when omitted (limit is 200sqm)', () => {
    // area 201, dwellings default 1 → 200 small + 1 general.
    // valuePerSqm = 20,100,000 / 201 = 100,000.
    // small 200 → 20,000,000 ; general 1 → 100,000
    // fixed = 20M/6 + 100,000/3 = 3,333,333.333... + 33,333.333... = 3,366,666.666...
    const r = residentialLandTaxableBase({ assessedValue: 20_100_000, areaSqm: 201 });
    expect(r.fixedAssetBase).toBeCloseTo(20_000_000 / 6 + 100_000 / 3, 6);
    expect(r.cityPlanningBase).toBeCloseTo(20_000_000 / 3 + (100_000 * 2) / 3, 6);
  });

  it('throws for a negative assessed value', () => {
    expect(() => residentialLandTaxableBase({ assessedValue: -1, areaSqm: 100 })).toThrow();
  });

  it('throws for a non-finite assessed value (NaN)', () => {
    expect(() => residentialLandTaxableBase({ assessedValue: NaN, areaSqm: 100 })).toThrow();
  });

  it('throws for a non-finite assessed value (Infinity)', () => {
    expect(() => residentialLandTaxableBase({ assessedValue: Infinity, areaSqm: 100 })).toThrow();
  });

  it('throws for a negative area', () => {
    expect(() => residentialLandTaxableBase({ assessedValue: 10_000_000, areaSqm: -1 })).toThrow();
  });

  it('throws for a non-finite area (NaN)', () => {
    expect(() => residentialLandTaxableBase({ assessedValue: 10_000_000, areaSqm: NaN })).toThrow();
  });

  it('throws for a non-finite area (Infinity)', () => {
    expect(() =>
      residentialLandTaxableBase({ assessedValue: 10_000_000, areaSqm: Infinity }),
    ).toThrow();
  });

  it('throws for dwellings below 1', () => {
    expect(() =>
      residentialLandTaxableBase({ assessedValue: 10_000_000, areaSqm: 100, dwellings: 0 }),
    ).toThrow();
  });

  it('throws for a non-integer dwelling count', () => {
    expect(() =>
      residentialLandTaxableBase({ assessedValue: 10_000_000, areaSqm: 100, dwellings: 1.5 }),
    ).toThrow();
  });

  it('throws for a non-finite dwelling count (NaN)', () => {
    expect(() =>
      residentialLandTaxableBase({ assessedValue: 10_000_000, areaSqm: 100, dwellings: NaN }),
    ).toThrow();
  });
});

describe('isBelowTaxThreshold', () => {
  it('treats land below 300,000 as exempt (true)', () => {
    expect(isBelowTaxThreshold({ assetType: 'land', taxableBase: 299_999 })).toBe(true);
  });

  it('treats land at exactly 300,000 as taxable (false)', () => {
    expect(isBelowTaxThreshold({ assetType: 'land', taxableBase: 300_000 })).toBe(false);
  });

  it('treats land just above 300,000 as taxable (false)', () => {
    expect(isBelowTaxThreshold({ assetType: 'land', taxableBase: 300_001 })).toBe(false);
  });

  it('treats a house below 200,000 as exempt (true)', () => {
    expect(isBelowTaxThreshold({ assetType: 'house', taxableBase: 199_999 })).toBe(true);
  });

  it('treats a house at exactly 200,000 as taxable (false)', () => {
    expect(isBelowTaxThreshold({ assetType: 'house', taxableBase: 200_000 })).toBe(false);
  });

  it('treats a depreciable asset below 1,500,000 as exempt (true)', () => {
    expect(isBelowTaxThreshold({ assetType: 'depreciableAsset', taxableBase: 1_499_999 })).toBe(
      true,
    );
  });

  it('treats a depreciable asset at exactly 1,500,000 as taxable (false)', () => {
    expect(isBelowTaxThreshold({ assetType: 'depreciableAsset', taxableBase: 1_500_000 })).toBe(
      false,
    );
  });

  it('treats a zero base as exempt for land', () => {
    expect(isBelowTaxThreshold({ assetType: 'land', taxableBase: 0 })).toBe(true);
  });

  it('throws for a negative base', () => {
    expect(() => isBelowTaxThreshold({ assetType: 'land', taxableBase: -1 })).toThrow();
  });

  it('throws for a non-finite base (NaN)', () => {
    expect(() => isBelowTaxThreshold({ assetType: 'land', taxableBase: NaN })).toThrow();
  });

  it('throws for a non-finite base (Infinity)', () => {
    expect(() => isBelowTaxThreshold({ assetType: 'land', taxableBase: Infinity })).toThrow();
  });

  it('throws for an unknown asset type', () => {
    expect(() =>
      isBelowTaxThreshold({ assetType: 'vehicle' as unknown as AssetType, taxableBase: 100 }),
    ).toThrow(/assetType/);
  });
});

describe('calcFixedAssetTaxTotal', () => {
  it('computes fixed + city tax for small-scale residential land', () => {
    // area 200 == limit, dwellings 1. fixed base = 60M/6 = 10,000,000 ; city base = 60M/3 = 20,000,000
    // fixed tax = 10,000,000 × 0.014 = 140,000 ; city tax = 20,000,000 × 0.003 = 60,000
    expect(calcFixedAssetTaxTotal({ assessedValue: 60_000_000, areaSqm: 200 })).toEqual({
      fixedAssetTax: 140_000,
      cityPlanningTax: 60_000,
      total: 200_000,
      exempt: false,
    });
  });

  it('computes tax for prorated land (small-scale + general)', () => {
    // area 300, dwellings 1, value 90,000,000.
    // fixed base = 20,000,000 → tax 280,000 ; city base = 40,000,000 → tax 120,000
    expect(calcFixedAssetTaxTotal({ assessedValue: 90_000_000, areaSqm: 300 })).toEqual({
      fixedAssetTax: 280_000,
      cityPlanningTax: 120_000,
      total: 400_000,
      exempt: false,
    });
  });

  it('marks land as exempt when the fixed-asset base is below 300,000', () => {
    // value 1,000,000, area 100, all small-scale → fixed base = 1,000,000/6 = 166,666.67 < 300,000
    expect(calcFixedAssetTaxTotal({ assessedValue: 1_000_000, areaSqm: 100 })).toEqual({
      fixedAssetTax: 0,
      cityPlanningTax: 0,
      total: 0,
      exempt: true,
    });
  });

  it('marks land just at the exemption boundary as taxable', () => {
    // value 1,800,000, area 100, all small-scale → fixed base = 1,800,000/6 = 300,000 (not below)
    const r = calcFixedAssetTaxTotal({ assessedValue: 1_800_000, areaSqm: 100 });
    expect(r.exempt).toBe(false);
    // fixed tax = 300,000 × 0.014 = 4,200 ; city base = 1,800,000/3 = 600,000 → tax 1,800
    expect(r.fixedAssetTax).toBe(4_200);
    expect(r.cityPlanningTax).toBe(1_800);
    expect(r.total).toBe(6_000);
  });

  it('marks land just below the exemption boundary as exempt', () => {
    // value 1,799,994, area 100 → fixed base = 1,799,994/6 = 299,999 < 300,000 → exempt
    const r = calcFixedAssetTaxTotal({ assessedValue: 1_799_994, areaSqm: 100 });
    expect(r.exempt).toBe(true);
    expect(r.total).toBe(0);
  });

  it('accepts custom fixed and city-planning rates', () => {
    // small-scale 200sqm, value 60,000,000. fixed base 10,000,000, city base 20,000,000.
    // fixed @ 0.013 = 130,000 ; city @ 0.002 = 40,000
    expect(
      calcFixedAssetTaxTotal({
        assessedValue: 60_000_000,
        areaSqm: 200,
        fixedRate: 0.013,
        cityPlanningRate: 0.002,
      }),
    ).toEqual({
      fixedAssetTax: 130_000,
      cityPlanningTax: 40_000,
      total: 170_000,
      exempt: false,
    });
  });

  it('drops city-planning tax to 0 outside the urbanization zone (rate 0)', () => {
    expect(
      calcFixedAssetTaxTotal({ assessedValue: 60_000_000, areaSqm: 200, cityPlanningRate: 0 }),
    ).toEqual({
      fixedAssetTax: 140_000,
      cityPlanningTax: 0,
      total: 140_000,
      exempt: false,
    });
  });

  it('honours dwelling count in the proration', () => {
    // area 600, dwellings 2, value 180,000,000.
    // fixed base 40,000,000 → 560,000 ; city base 80,000,000 → 240,000
    expect(
      calcFixedAssetTaxTotal({ assessedValue: 180_000_000, areaSqm: 600, dwellings: 2 }),
    ).toEqual({
      fixedAssetTax: 560_000,
      cityPlanningTax: 240_000,
      total: 800_000,
      exempt: false,
    });
  });

  it('propagates validation errors (negative assessed value)', () => {
    expect(() => calcFixedAssetTaxTotal({ assessedValue: -1, areaSqm: 100 })).toThrow();
  });

  it('propagates validation errors (city-planning rate above cap)', () => {
    expect(() =>
      calcFixedAssetTaxTotal({ assessedValue: 60_000_000, areaSqm: 200, cityPlanningRate: 0.0031 }),
    ).toThrow(/cap/);
  });
});

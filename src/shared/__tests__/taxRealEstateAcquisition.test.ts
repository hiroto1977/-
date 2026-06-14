import { describe, expect, it } from 'vitest';
import {
  STANDARD_RATE,
  REDUCED_RATE,
  LAND_THRESHOLD,
  NEW_BUILDING_THRESHOLD,
  OTHER_BUILDING_THRESHOLD,
  acquisitionTaxRate,
  residentialLandTaxableBase,
  isBelowAcquisitionThreshold,
  realEstateAcquisitionTax,
  type PropertyType,
} from '../taxRealEstateAcquisition';

describe('constants', () => {
  it('exposes the standard rate of 4%', () => {
    expect(STANDARD_RATE).toBe(0.04);
  });

  it('exposes the reduced rate of 3%', () => {
    expect(REDUCED_RATE).toBe(0.03);
  });

  it('exposes the land threshold of 100,000 yen', () => {
    expect(LAND_THRESHOLD).toBe(100_000);
  });

  it('exposes the new-building threshold of 230,000 yen', () => {
    expect(NEW_BUILDING_THRESHOLD).toBe(230_000);
  });

  it('exposes the other-building threshold of 120,000 yen', () => {
    expect(OTHER_BUILDING_THRESHOLD).toBe(120_000);
  });
});

describe('acquisitionTaxRate', () => {
  it('applies the reduced 3% rate to land when reduction is applied (default)', () => {
    expect(acquisitionTaxRate({ propertyType: 'land' })).toBe(0.03);
  });

  it('applies the reduced 3% rate to a residential building (default reduction)', () => {
    expect(acquisitionTaxRate({ propertyType: 'residentialBuilding' })).toBe(0.03);
  });

  it('keeps a non-residential building at the standard 4% even with reduction (default)', () => {
    expect(acquisitionTaxRate({ propertyType: 'nonResidentialBuilding' })).toBe(0.04);
  });

  it('applies the standard 4% rate to land when reduction is disabled', () => {
    expect(acquisitionTaxRate({ propertyType: 'land', applyReduction: false })).toBe(0.04);
  });

  it('applies the standard 4% rate to a residential building when reduction is disabled', () => {
    expect(acquisitionTaxRate({ propertyType: 'residentialBuilding', applyReduction: false })).toBe(
      0.04,
    );
  });

  it('applies the standard 4% rate to a non-residential building when reduction is disabled', () => {
    expect(
      acquisitionTaxRate({ propertyType: 'nonResidentialBuilding', applyReduction: false }),
    ).toBe(0.04);
  });

  it('defaults applyReduction to true (land resolves to 3%, not 4%)', () => {
    // Pins the `applyReduction = true` default: omitting it must give the reduced rate.
    expect(acquisitionTaxRate({ propertyType: 'land' })).toBe(REDUCED_RATE);
    expect(acquisitionTaxRate({ propertyType: 'land' })).not.toBe(STANDARD_RATE);
  });

  it('returns the reduced rate explicitly with applyReduction true for residential', () => {
    expect(acquisitionTaxRate({ propertyType: 'residentialBuilding', applyReduction: true })).toBe(
      0.03,
    );
  });

  it('throws for an unknown property type', () => {
    expect(() =>
      acquisitionTaxRate({ propertyType: 'vehicle' as unknown as PropertyType }),
    ).toThrow(/unknown propertyType/);
  });
});

describe('residentialLandTaxableBase', () => {
  it('halves the assessed value when isUrbanLand is true', () => {
    expect(residentialLandTaxableBase({ assessedValue: 20_000_000, isUrbanLand: true })).toBe(
      10_000_000,
    );
  });

  it('returns the full assessed value when isUrbanLand is false', () => {
    expect(residentialLandTaxableBase({ assessedValue: 20_000_000, isUrbanLand: false })).toBe(
      20_000_000,
    );
  });

  it('defaults isUrbanLand to false (returns the full value, not the half)', () => {
    // Pins the `isUrbanLand = false` default.
    expect(residentialLandTaxableBase({ assessedValue: 20_000_000 })).toBe(20_000_000);
  });

  it('halves an odd value to a fractional base', () => {
    // 1,000,001 / 2 = 500,000.5 (exposes any rounding mutation).
    expect(residentialLandTaxableBase({ assessedValue: 1_000_001, isUrbanLand: true })).toBe(
      500_000.5,
    );
  });

  it('returns 0 for a zero assessed value (half of 0)', () => {
    expect(residentialLandTaxableBase({ assessedValue: 0, isUrbanLand: true })).toBe(0);
  });

  it('throws for a negative assessed value', () => {
    expect(() => residentialLandTaxableBase({ assessedValue: -1 })).toThrow(
      /assessedValue must be a finite number >= 0/,
    );
  });

  it('throws for a non-finite assessed value (NaN)', () => {
    expect(() => residentialLandTaxableBase({ assessedValue: NaN })).toThrow(
      /assessedValue must be a finite number/,
    );
  });

  it('throws for a non-finite assessed value (Infinity)', () => {
    expect(() => residentialLandTaxableBase({ assessedValue: Infinity })).toThrow(
      /assessedValue must be a finite number/,
    );
  });
});

describe('isBelowAcquisitionThreshold', () => {
  it('treats land just below 100,000 (99,999) as exempt (true)', () => {
    expect(isBelowAcquisitionThreshold({ propertyType: 'land', taxableValue: 99_999 })).toBe(true);
  });

  it('treats land at exactly 100,000 as taxable (false)', () => {
    expect(isBelowAcquisitionThreshold({ propertyType: 'land', taxableValue: 100_000 })).toBe(false);
  });

  it('treats land just above 100,000 (100,001) as taxable (false)', () => {
    expect(isBelowAcquisitionThreshold({ propertyType: 'land', taxableValue: 100_001 })).toBe(false);
  });

  it('treats a new building just below 230,000 (229,999) as exempt (true)', () => {
    expect(
      isBelowAcquisitionThreshold({
        propertyType: 'residentialBuilding',
        taxableValue: 229_999,
        isNewBuilding: true,
      }),
    ).toBe(true);
  });

  it('treats a new building at exactly 230,000 as taxable (false)', () => {
    expect(
      isBelowAcquisitionThreshold({
        propertyType: 'residentialBuilding',
        taxableValue: 230_000,
        isNewBuilding: true,
      }),
    ).toBe(false);
  });

  it('treats a new building just above 230,000 (230,001) as taxable (false)', () => {
    expect(
      isBelowAcquisitionThreshold({
        propertyType: 'residentialBuilding',
        taxableValue: 230_001,
        isNewBuilding: true,
      }),
    ).toBe(false);
  });

  it('treats an existing (non-new) building just below 120,000 (119,999) as exempt (true)', () => {
    expect(
      isBelowAcquisitionThreshold({
        propertyType: 'residentialBuilding',
        taxableValue: 119_999,
        isNewBuilding: false,
      }),
    ).toBe(true);
  });

  it('treats an existing building at exactly 120,000 as taxable (false)', () => {
    expect(
      isBelowAcquisitionThreshold({
        propertyType: 'residentialBuilding',
        taxableValue: 120_000,
        isNewBuilding: false,
      }),
    ).toBe(false);
  });

  it('treats an existing building just above 120,000 (120,001) as taxable (false)', () => {
    expect(
      isBelowAcquisitionThreshold({
        propertyType: 'residentialBuilding',
        taxableValue: 120_001,
        isNewBuilding: false,
      }),
    ).toBe(false);
  });

  it('defaults isNewBuilding to false (uses the 120,000 other-building threshold)', () => {
    // Pins the `isNewBuilding = false` default: 200,000 must be taxable (>= 120k) for a
    // building, which would be exempt (< 230k) had the new-building threshold been used.
    expect(
      isBelowAcquisitionThreshold({ propertyType: 'nonResidentialBuilding', taxableValue: 200_000 }),
    ).toBe(false);
  });

  it('uses the new-building threshold when isNewBuilding is true (200,000 is exempt)', () => {
    // Same 200,000 value is exempt under the 230k new-building threshold — pins the ternary.
    expect(
      isBelowAcquisitionThreshold({
        propertyType: 'nonResidentialBuilding',
        taxableValue: 200_000,
        isNewBuilding: true,
      }),
    ).toBe(true);
  });

  it('ignores isNewBuilding for land (always uses the 100,000 land threshold)', () => {
    // For land, isNewBuilding must not switch to a building threshold: 150,000 stays taxable.
    expect(
      isBelowAcquisitionThreshold({ propertyType: 'land', taxableValue: 150_000, isNewBuilding: true }),
    ).toBe(false);
    // And a land value below 100k is exempt even with isNewBuilding true.
    expect(
      isBelowAcquisitionThreshold({ propertyType: 'land', taxableValue: 99_999, isNewBuilding: true }),
    ).toBe(true);
  });

  it('treats a zero base as exempt for land', () => {
    expect(isBelowAcquisitionThreshold({ propertyType: 'land', taxableValue: 0 })).toBe(true);
  });

  it('throws for a negative base', () => {
    expect(() => isBelowAcquisitionThreshold({ propertyType: 'land', taxableValue: -1 })).toThrow(
      /taxableValue must be a finite number >= 0/,
    );
  });

  it('throws for a non-finite base (NaN)', () => {
    expect(() => isBelowAcquisitionThreshold({ propertyType: 'land', taxableValue: NaN })).toThrow(
      /taxableValue must be a finite number/,
    );
  });

  it('throws for a non-finite base (Infinity)', () => {
    expect(() =>
      isBelowAcquisitionThreshold({ propertyType: 'land', taxableValue: Infinity }),
    ).toThrow(/taxableValue must be a finite number/);
  });

  it('throws for an unknown property type', () => {
    expect(() =>
      isBelowAcquisitionThreshold({
        propertyType: 'vehicle' as unknown as PropertyType,
        taxableValue: 100,
      }),
    ).toThrow(/unknown propertyType/);
  });
});

describe('realEstateAcquisitionTax', () => {
  it('taxes land at the reduced 3% rate by default with no urban-land special', () => {
    // base = 10,000,000 (full), rate 0.03 → 300,000.
    expect(realEstateAcquisitionTax({ assessedValue: 10_000_000, propertyType: 'land' })).toEqual({
      rate: 0.03,
      taxableBase: 10_000_000,
      tax: 300_000,
      exempt: false,
    });
  });

  it('applies the 1/2 urban-land special to the taxable base for land', () => {
    // base = 10,000,000 / 2 = 5,000,000, rate 0.03 → 150,000.
    expect(
      realEstateAcquisitionTax({
        assessedValue: 10_000_000,
        propertyType: 'land',
        isUrbanLand: true,
      }),
    ).toEqual({ rate: 0.03, taxableBase: 5_000_000, tax: 150_000, exempt: false });
  });

  it('does not halve the base for a residential building even when isUrbanLand is true', () => {
    // isUrbanLand only affects land; building base stays at the full assessed value.
    expect(
      realEstateAcquisitionTax({
        assessedValue: 10_000_000,
        propertyType: 'residentialBuilding',
        isUrbanLand: true,
      }),
    ).toEqual({ rate: 0.03, taxableBase: 10_000_000, tax: 300_000, exempt: false });
  });

  it('taxes a residential building at the reduced 3% rate by default', () => {
    // base 8,000,000, rate 0.03 → 240,000.
    expect(
      realEstateAcquisitionTax({ assessedValue: 8_000_000, propertyType: 'residentialBuilding' }),
    ).toEqual({ rate: 0.03, taxableBase: 8_000_000, tax: 240_000, exempt: false });
  });

  it('taxes a non-residential building at the standard 4% rate', () => {
    // base 8,000,000, rate 0.04 → 320,000.
    expect(
      realEstateAcquisitionTax({ assessedValue: 8_000_000, propertyType: 'nonResidentialBuilding' }),
    ).toEqual({ rate: 0.04, taxableBase: 8_000_000, tax: 320_000, exempt: false });
  });

  it('taxes land at the standard 4% rate when reduction is disabled', () => {
    // base 10,000,000, rate 0.04 → 400,000.
    expect(
      realEstateAcquisitionTax({
        assessedValue: 10_000_000,
        propertyType: 'land',
        applyReduction: false,
      }),
    ).toEqual({ rate: 0.04, taxableBase: 10_000_000, tax: 400_000, exempt: false });
  });

  it('combines the 1/2 urban-land special with the disabled reduction (4% on half base)', () => {
    // base 10,000,000 / 2 = 5,000,000, rate 0.04 → 200,000.
    expect(
      realEstateAcquisitionTax({
        assessedValue: 10_000_000,
        propertyType: 'land',
        applyReduction: false,
        isUrbanLand: true,
      }),
    ).toEqual({ rate: 0.04, taxableBase: 5_000_000, tax: 200_000, exempt: false });
  });

  it('floors the tax to the nearest 100 yen (drops sub-100 remainder)', () => {
    // base 1,234,567, rate 0.03 = 37,037.01 → floor(/100)*100 = 37,000.
    const r = realEstateAcquisitionTax({ assessedValue: 1_234_567, propertyType: 'land' });
    expect(r.tax).toBe(37_000);
    expect(r.taxableBase).toBe(1_234_567);
  });

  it('floors a result that is one yen below a 100 boundary', () => {
    // base 3,333,300, rate 0.03 = 99,999 → floor → 99,900.
    expect(realEstateAcquisitionTax({ assessedValue: 3_333_300, propertyType: 'land' }).tax).toBe(
      99_900,
    );
  });

  it('keeps an exact 100-yen multiple unchanged', () => {
    // base 1,000,000, rate 0.03 = 30,000 (already a multiple of 100).
    expect(realEstateAcquisitionTax({ assessedValue: 1_000_000, propertyType: 'land' }).tax).toBe(
      30_000,
    );
  });

  it('marks land below the 100,000 threshold as exempt (tax 0, rate retained)', () => {
    // base 99,999 < 100,000 → exempt; rate still 0.03 (reduced default).
    expect(realEstateAcquisitionTax({ assessedValue: 99_999, propertyType: 'land' })).toEqual({
      rate: 0.03,
      taxableBase: 99_999,
      tax: 0,
      exempt: true,
    });
  });

  it('marks land exactly at the 100,000 threshold as taxable', () => {
    // base 100,000 (not below) → tax = 100,000 × 0.03 = 3,000.
    expect(realEstateAcquisitionTax({ assessedValue: 100_000, propertyType: 'land' })).toEqual({
      rate: 0.03,
      taxableBase: 100_000,
      tax: 3_000,
      exempt: false,
    });
  });

  it('applies the land threshold against the 1/2 base (200,000 value halves to exempt 100k boundary)', () => {
    // value 199,998 → urban base 99,999 < 100,000 → exempt (threshold checked on halved base).
    expect(
      realEstateAcquisitionTax({
        assessedValue: 199_998,
        propertyType: 'land',
        isUrbanLand: true,
      }),
    ).toEqual({ rate: 0.03, taxableBase: 99_999, tax: 0, exempt: true });
  });

  it('marks a new residential building below 230,000 as exempt', () => {
    // base 229,999 < 230,000 (new-building threshold) → exempt.
    expect(
      realEstateAcquisitionTax({
        assessedValue: 229_999,
        propertyType: 'residentialBuilding',
        isNewBuilding: true,
      }),
    ).toEqual({ rate: 0.03, taxableBase: 229_999, tax: 0, exempt: true });
  });

  it('marks a new residential building at exactly 230,000 as taxable', () => {
    // base 230,000 → tax = 230,000 × 0.03 = 6,900.
    expect(
      realEstateAcquisitionTax({
        assessedValue: 230_000,
        propertyType: 'residentialBuilding',
        isNewBuilding: true,
      }),
    ).toEqual({ rate: 0.03, taxableBase: 230_000, tax: 6_900, exempt: false });
  });

  it('marks an existing residential building below 120,000 as exempt (default isNewBuilding)', () => {
    // base 119,999 < 120,000 (other-building threshold, default new=false) → exempt.
    expect(
      realEstateAcquisitionTax({ assessedValue: 119_999, propertyType: 'residentialBuilding' }),
    ).toEqual({ rate: 0.03, taxableBase: 119_999, tax: 0, exempt: true });
  });

  it('marks an existing residential building at 120,000 as taxable (default isNewBuilding)', () => {
    // base 120,000 → tax = 120,000 × 0.03 = 3,600.
    expect(
      realEstateAcquisitionTax({ assessedValue: 120_000, propertyType: 'residentialBuilding' }),
    ).toEqual({ rate: 0.03, taxableBase: 120_000, tax: 3_600, exempt: false });
  });

  it('treats a 200,000 existing building as taxable but a new one as exempt (threshold switch)', () => {
    // value 200,000: existing (>= 120k) taxable; new (< 230k) exempt — pins the new-building flag.
    const existing = realEstateAcquisitionTax({
      assessedValue: 200_000,
      propertyType: 'residentialBuilding',
    });
    expect(existing.exempt).toBe(false);
    expect(existing.tax).toBe(6_000); // 200,000 × 0.03
    const fresh = realEstateAcquisitionTax({
      assessedValue: 200_000,
      propertyType: 'residentialBuilding',
      isNewBuilding: true,
    });
    expect(fresh.exempt).toBe(true);
    expect(fresh.tax).toBe(0);
  });

  it('returns exempt for a zero assessed value', () => {
    expect(realEstateAcquisitionTax({ assessedValue: 0, propertyType: 'land' })).toEqual({
      rate: 0.03,
      taxableBase: 0,
      tax: 0,
      exempt: true,
    });
  });

  it('throws for a negative assessed value', () => {
    expect(() =>
      realEstateAcquisitionTax({ assessedValue: -1, propertyType: 'land' }),
    ).toThrow(/assessedValue must be a finite number >= 0/);
  });

  it('throws for a non-finite assessed value (NaN)', () => {
    expect(() =>
      realEstateAcquisitionTax({ assessedValue: NaN, propertyType: 'land' }),
    ).toThrow(/assessedValue must be a finite number/);
  });

  it('throws for a non-finite assessed value (Infinity)', () => {
    expect(() =>
      realEstateAcquisitionTax({ assessedValue: Infinity, propertyType: 'land' }),
    ).toThrow(/assessedValue must be a finite number/);
  });

  it('throws for an unknown property type', () => {
    expect(() =>
      realEstateAcquisitionTax({
        assessedValue: 1_000_000,
        propertyType: 'vehicle' as unknown as PropertyType,
      }),
    ).toThrow(/unknown propertyType/);
  });
});

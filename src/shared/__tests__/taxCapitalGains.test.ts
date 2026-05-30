import { describe, expect, it } from 'vitest';
import {
  calcCapitalGainsTax,
  RESIDENTIAL_SPECIAL_DEDUCTION,
  RESIDENTIAL_REDUCED_RATE_CAP,
} from '../taxCapitalGains';

const SURTAX = 1.021;

describe('calcCapitalGainsTax (譲渡所得・申告分離課税)', () => {
  it('computes long-term real-estate tax (15% income + 5% resident)', () => {
    // 収入5,000万、取得費3,000万、譲渡費用200万 → 譲渡益1,800万
    const r = calcCapitalGainsTax(50_000_000, 30_000_000, 2_000_000, 'real-estate-long');
    expect(r.gain).toBe(18_000_000);
    expect(r.specialDeduction).toBe(0);
    expect(r.taxableGain).toBe(18_000_000);
    expect(r.incomeTax).toBe(Math.round(18_000_000 * 0.15 * SURTAX));
    expect(r.residentTax).toBe(18_000_000 * 0.05);
  });

  it('computes short-term real-estate tax (30% income + 9% resident)', () => {
    const r = calcCapitalGainsTax(50_000_000, 30_000_000, 2_000_000, 'real-estate-short');
    expect(r.incomeTax).toBe(Math.round(18_000_000 * 0.3 * SURTAX));
    expect(r.residentTax).toBe(18_000_000 * 0.09);
    // short-term is heavier than long-term
    const long = calcCapitalGainsTax(50_000_000, 30_000_000, 2_000_000, 'real-estate-long');
    expect(r.totalTax).toBeGreaterThan(long.totalTax);
  });

  it('applies the 3,000万 special deduction for residential property', () => {
    // 譲渡益 2,000万 < 3,000万 → 課税譲渡所得 0
    const r = calcCapitalGainsTax(40_000_000, 19_000_000, 1_000_000, 'residential');
    expect(r.gain).toBe(20_000_000);
    expect(r.specialDeduction).toBe(20_000_000); // capped at the gain
    expect(r.taxableGain).toBe(0);
    expect(r.totalTax).toBe(0);
  });

  it('uses the residential reduced rate (10%/4%) up to 6,000万 after the deduction', () => {
    // 譲渡益 8,000万 − 3,000万控除 = 課税 5,000万 (≤6,000万) → 軽減税率
    const r = calcCapitalGainsTax(100_000_000, 18_000_000, 2_000_000, 'residential');
    expect(r.gain).toBe(80_000_000);
    expect(r.specialDeduction).toBe(30_000_000);
    expect(r.taxableGain).toBe(50_000_000);
    expect(r.incomeTax).toBe(Math.round(50_000_000 * 0.1 * SURTAX));
    expect(r.residentTax).toBe(50_000_000 * 0.04);
  });

  it('splits residential tax at the 6,000万 reduced-rate cap', () => {
    // 課税譲渡所得 9,000万 → 6,000万は10%/4%、3,000万は15%/5%
    // gain = taxable + 3,000万控除 = 9,000万 + 3,000万 = 1.2億の譲渡益
    const r = calcCapitalGainsTax(150_000_000, 28_000_000, 2_000_000, 'residential');
    expect(r.taxableGain).toBe(90_000_000);
    const expectedIncomeBase = 60_000_000 * 0.1 + 30_000_000 * 0.15;
    expect(r.incomeTax).toBe(Math.round(expectedIncomeBase * SURTAX));
    expect(r.residentTax).toBe(60_000_000 * 0.04 + 30_000_000 * 0.05);
  });

  it('computes listed-stock tax at a flat 20.315%', () => {
    const r = calcCapitalGainsTax(3_000_000, 1_000_000, 0, 'listed-stock');
    expect(r.gain).toBe(2_000_000);
    expect(r.incomeTax).toBe(Math.round(2_000_000 * 0.15 * SURTAX));
    expect(r.residentTax).toBe(2_000_000 * 0.05);
  });

  it('returns zero tax for a loss (no gain)', () => {
    const r = calcCapitalGainsTax(10_000_000, 12_000_000, 500_000, 'real-estate-long');
    expect(r.gain).toBe(0);
    expect(r.taxableGain).toBe(0);
    expect(r.totalTax).toBe(0);
    expect(r.takeHome).toBe(10_000_000);
  });

  it('clamps negative inputs to zero', () => {
    const r = calcCapitalGainsTax(-100, -100, -100, 'listed-stock');
    expect(r.gain).toBe(0);
    expect(r.totalTax).toBe(0);
  });

  it('exposes the residential deduction/cap constants', () => {
    expect(RESIDENTIAL_SPECIAL_DEDUCTION).toBe(30_000_000);
    expect(RESIDENTIAL_REDUCED_RATE_CAP).toBe(60_000_000);
  });
});

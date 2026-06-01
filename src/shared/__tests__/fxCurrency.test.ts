import { describe, expect, it } from 'vitest';
import { convertToJpy, fxGainLoss, effectiveRate } from '../fxCurrency';

describe('convertToJpy', () => {
  it('multiplies foreign amount by the rate and rounds to yen', () => {
    expect(convertToJpy(1000, 150.5)).toBe(150_500);
  });

  it('treats negative amount or rate as zero', () => {
    expect(convertToJpy(-100, 150)).toBe(0);
    expect(convertToJpy(100, -1)).toBe(0);
  });
});

describe('fxGainLoss', () => {
  it('computes a foreign-exchange gain when the rate rises', () => {
    // 1000 USD bought at 130, now 150 → +20/USD → +20,000 JPY (+15.4%)
    const g = fxGainLoss({ amountForeign: 1000, acquisitionRate: 130, currentRate: 150 });
    expect(g.acquisitionJpy).toBe(130_000);
    expect(g.currentJpy).toBe(150_000);
    expect(g.gain).toBe(20_000);
    expect(g.gainPct).toBe(15.4); // (150-130)/130 = 15.38%
  });

  it('computes a loss when the rate falls', () => {
    const g = fxGainLoss({ amountForeign: 1000, acquisitionRate: 150, currentRate: 135 });
    expect(g.gain).toBe(-15_000);
    expect(g.gainPct).toBe(-10);
  });

  it('nulls the percentage when the acquisition rate is zero', () => {
    const g = fxGainLoss({ amountForeign: 1000, acquisitionRate: 0, currentRate: 150 });
    expect(g.gainPct).toBeNull();
    expect(g.gain).toBe(150_000);
  });
});

describe('effectiveRate', () => {
  it('returns the amount-weighted average rate across lots', () => {
    // 1000@130 + 1000@150 → 280,000 / 2000 = 140
    expect(effectiveRate([
      { amountForeign: 1000, rate: 130 },
      { amountForeign: 1000, rate: 150 },
    ])).toBe(140);
  });

  it('weights by foreign amount (not a simple mean)', () => {
    // 3000@100 + 1000@140 → 440,000 / 4000 = 110
    expect(effectiveRate([
      { amountForeign: 3000, rate: 100 },
      { amountForeign: 1000, rate: 140 },
    ])).toBe(110);
  });

  it('returns null when there is no foreign amount', () => {
    expect(effectiveRate([])).toBeNull();
    expect(effectiveRate([{ amountForeign: 0, rate: 150 }])).toBeNull();
  });

  it('rounds to four decimal places', () => {
    // 1@100 + 2@101 → 302/3 = 100.6667
    expect(effectiveRate([
      { amountForeign: 1, rate: 100 },
      { amountForeign: 2, rate: 101 },
    ])).toBe(100.6667);
  });
});

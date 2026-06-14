import { describe, expect, it } from 'vitest';
import {
  convertToJpy,
  fxGainLoss,
  effectiveRate,
  ttRates,
  roundTripCost,
  crossRate,
  effectiveExchange,
} from '../fxCurrency';

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

describe('ttRates', () => {
  it('adds the fee for TTS and subtracts it for TTB around the TTM mid', () => {
    // USDJPY TTM=150, one-way fee 1円 → TTS=151, TTB=149
    expect(ttRates(150, 1)).toEqual({ ttm: 150, tts: 151, ttb: 149 });
  });

  it('treats a negative fee as zero (TTS = TTB = TTM)', () => {
    expect(ttRates(150, -5)).toEqual({ ttm: 150, tts: 150, ttb: 150 });
  });

  it('treats a non-finite fee as zero', () => {
    expect(ttRates(150, Number.NaN)).toEqual({ ttm: 150, tts: 150, ttb: 150 });
  });

  it('floors TTB at zero when the fee exceeds the TTM', () => {
    // fee 200 > TTM 150 → TTB clamped to 0 (not -50), TTS=350
    expect(ttRates(150, 200)).toEqual({ ttm: 150, tts: 350, ttb: 0 });
  });

  it('rounds rates to four decimals', () => {
    expect(ttRates(150.123456, 0.5)).toEqual({ ttm: 150.1235, tts: 150.6235, ttb: 149.6235 });
  });

  it('returns null for a zero, negative or non-finite TTM', () => {
    expect(ttRates(0, 1)).toBeNull();
    expect(ttRates(-150, 1)).toBeNull();
    expect(ttRates(Number.NaN, 1)).toBeNull();
    expect(ttRates(Number.POSITIVE_INFINITY, 1)).toBeNull();
  });
});

describe('roundTripCost', () => {
  it('computes the spread loss of a yen→foreign→yen round trip', () => {
    // 1,510,000円 buy USD at TTS=151 → 10,000 USD; sell at TTB=149 → 1,490,000円
    // cost = 1,510,000 − 1,490,000 = 20,000円 (1.3%)
    const c = roundTripCost(1_510_000, 151, 149);
    expect(c).not.toBeNull();
    expect(c!.startJpy).toBe(1_510_000);
    expect(c!.foreign).toBe(10_000);
    expect(c!.endJpy).toBe(1_490_000);
    expect(c!.costJpy).toBe(20_000);
    expect(c!.costPct).toBe(1.3); // 20000/1510000 = 1.324% → 1.3
  });

  it('has zero cost when TTS equals TTB (no spread)', () => {
    const c = roundTripCost(150_000, 150, 150);
    expect(c!.costJpy).toBe(0);
    expect(c!.costPct).toBe(0);
    expect(c!.endJpy).toBe(150_000);
  });

  it('treats a negative TTB sell rate as zero (total loss)', () => {
    const c = roundTripCost(150_000, 150, -10);
    expect(c!.endJpy).toBe(0);
    expect(c!.costJpy).toBe(150_000);
    expect(c!.costPct).toBe(100);
  });

  it('treats a negative start as zero and nulls the percentage', () => {
    const c = roundTripCost(-100, 150, 149);
    expect(c!.startJpy).toBe(0);
    expect(c!.foreign).toBe(0);
    expect(c!.endJpy).toBe(0);
    expect(c!.costJpy).toBe(0);
    expect(c!.costPct).toBeNull();
  });

  it('treats a non-finite start as zero', () => {
    const c = roundTripCost(Number.NaN, 150, 149);
    expect(c!.startJpy).toBe(0);
    expect(c!.costPct).toBeNull();
  });

  it('rounds the foreign amount to four decimals', () => {
    // 1000 / 151 = 6.6225165... → 6.6225
    const c = roundTripCost(1000, 151, 149);
    expect(c!.foreign).toBe(6.6225);
  });

  it('returns null when TTS is zero, negative or non-finite', () => {
    expect(roundTripCost(150_000, 0, 149)).toBeNull();
    expect(roundTripCost(150_000, -1, 149)).toBeNull();
    expect(roundTripCost(150_000, Number.NaN, 149)).toBeNull();
  });
});

describe('crossRate', () => {
  it('synthesises EUR/USD from EURJPY and USDJPY', () => {
    // 160 / 150 = 1.0666... → 1.0667
    expect(crossRate(160, 150)).toBe(1.0667);
  });

  it('returns 1 when both legs are equal', () => {
    expect(crossRate(150, 150)).toBe(1);
  });

  it('returns 0 when the base leg is zero', () => {
    expect(crossRate(0, 150)).toBe(0);
  });

  it('returns null when the quote leg is zero, negative or non-finite', () => {
    expect(crossRate(160, 0)).toBeNull();
    expect(crossRate(160, -150)).toBeNull();
    expect(crossRate(160, Number.NaN)).toBeNull();
  });

  it('returns null when the base leg is negative or non-finite', () => {
    expect(crossRate(-160, 150)).toBeNull();
    expect(crossRate(Number.NaN, 150)).toBeNull();
  });
});

describe('effectiveExchange', () => {
  it('applies TTS when buying foreign with yen', () => {
    // 1,510,000円 buy at TTM=150, fee=1 → TTS=151 → 10,000 USD
    // feeCost = (1,510,000/150 − 1,510,000/151) × 150 = (10066.67 − 10000) × 150 ≈ 10,000円
    const e = effectiveExchange({ ttm: 150, oneWayFeeYen: 1, amount: 1_510_000, direction: 'buy' });
    expect(e).not.toBeNull();
    expect(e!.appliedRate).toBe(151);
    expect(e!.received).toBe(10_000);
    expect(e!.feeCostJpy).toBe(10_000);
  });

  it('applies TTB when selling foreign for yen', () => {
    // 10,000 USD sell at TTM=150, fee=1 → TTB=149 → 1,490,000円
    // feeCost = 10,000 × (150 − 149) = 10,000円
    const e = effectiveExchange({ ttm: 150, oneWayFeeYen: 1, amount: 10_000, direction: 'sell' });
    expect(e!.appliedRate).toBe(149);
    expect(e!.received).toBe(1_490_000);
    expect(e!.feeCostJpy).toBe(10_000);
  });

  it('has zero fee cost when there is no fee (buy)', () => {
    const e = effectiveExchange({ ttm: 150, oneWayFeeYen: 0, amount: 150_000, direction: 'buy' });
    expect(e!.appliedRate).toBe(150);
    expect(e!.received).toBe(1000);
    expect(e!.feeCostJpy).toBe(0);
  });

  it('has zero fee cost when there is no fee (sell)', () => {
    const e = effectiveExchange({ ttm: 150, oneWayFeeYen: 0, amount: 1000, direction: 'sell' });
    expect(e!.appliedRate).toBe(150);
    expect(e!.received).toBe(150_000);
    expect(e!.feeCostJpy).toBe(0);
  });

  it('treats a negative amount as zero', () => {
    const buy = effectiveExchange({ ttm: 150, oneWayFeeYen: 1, amount: -100, direction: 'buy' });
    expect(buy!.received).toBe(0);
    expect(buy!.feeCostJpy).toBe(0);
    const sell = effectiveExchange({ ttm: 150, oneWayFeeYen: 1, amount: -100, direction: 'sell' });
    expect(sell!.received).toBe(0);
    expect(sell!.feeCostJpy).toBe(0);
  });

  it('treats a non-finite amount as zero', () => {
    const e = effectiveExchange({ ttm: 150, oneWayFeeYen: 1, amount: Number.NaN, direction: 'buy' });
    expect(e!.received).toBe(0);
  });

  it('returns null when the TTM is invalid', () => {
    expect(effectiveExchange({ ttm: 0, oneWayFeeYen: 1, amount: 1000, direction: 'buy' })).toBeNull();
    expect(effectiveExchange({ ttm: -150, oneWayFeeYen: 1, amount: 1000, direction: 'sell' })).toBeNull();
  });
});

describe('disclaimer', () => {
  it('keeps the 投資助言ではありません note in the module', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../fxCurrency.ts', import.meta.url), 'utf8'),
    );
    expect(src).toContain('投資助言ではありません');
  });
});

import { describe, expect, it } from 'vitest';
import {
  mean,
  movingAverage,
  detrend,
  seasonalIndices,
  seasonallyAdjusted,
  linearTrend,
  decomposeChange,
  variability,
  maxDrawdown,
} from '../salesAnalytics';

describe('mean', () => {
  it('returns null for empty input', () => {
    expect(mean([])).toBe(null);
  });

  it('averages a single value', () => {
    expect(mean([42])).toBe(42);
  });

  it('averages multiple values', () => {
    expect(mean([2, 4, 6])).toBe(4);
  });

  it('handles negatives (sum then divide)', () => {
    expect(mean([-3, 3])).toBe(0);
    expect(mean([-2, -4])).toBe(-3);
  });
});

describe('movingAverage', () => {
  it('returns [] for empty input', () => {
    expect(movingAverage([], 3)).toEqual([]);
  });

  it('produces trailing window means with leading nulls', () => {
    expect(movingAverage([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3]);
  });

  it('window 1 echoes the series (no nulls)', () => {
    expect(movingAverage([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('clamps window below 1 up to 1', () => {
    expect(movingAverage([5, 7, 9], 0)).toEqual([5, 7, 9]);
    expect(movingAverage([5, 7, 9], -4)).toEqual([5, 7, 9]);
  });

  it('floors fractional windows', () => {
    // 2.9 -> 2: pairs averaged
    expect(movingAverage([2, 4, 6], 2.9)).toEqual([null, 3, 5]);
  });

  it('all-but-last are null when window equals length', () => {
    expect(movingAverage([1, 2, 3], 3)).toEqual([null, null, 2]);
  });

  it('boundary: index exactly fills the window (i+1 === w)', () => {
    // For window 2, index 1 (i+1=2 === w) must be a number, not null
    const out = movingAverage([10, 20], 2);
    expect(out).toEqual([null, 15]);
  });

  it('window larger than length yields all nulls', () => {
    expect(movingAverage([1, 2], 5)).toEqual([null, null]);
  });
});

describe('detrend', () => {
  it('returns [] for empty input', () => {
    expect(detrend([], 3)).toEqual([]);
  });

  it('subtracts the trailing moving average', () => {
    // ma([1,2,3,4],3) = [null,null,2,3]; detrend = [null,null,1,1]
    expect(detrend([1, 2, 3, 4], 3)).toEqual([null, null, 1, 1]);
  });

  it('window 1 yields all zeros (value minus itself)', () => {
    expect(detrend([5, 9, 2], 1)).toEqual([0, 0, 0]);
  });

  it('keeps nulls where moving average is unavailable', () => {
    expect(detrend([1, 2, 3], 3)).toEqual([null, null, 1]);
  });

  it('can produce negative residuals', () => {
    // ma([4,2],2) = [null,3]; detrend = [null, 2-3 = -1]
    expect(detrend([4, 2], 2)).toEqual([null, -1]);
  });
});

describe('seasonalIndices', () => {
  it('returns null when period < 2', () => {
    expect(seasonalIndices([1, 2, 3], 1)).toBe(null);
    expect(seasonalIndices([1, 2, 3], 0)).toBe(null);
  });

  it('floors the period', () => {
    // period 2.9 -> 2
    const s = seasonalIndices([10, 20, 10, 20], 2.9);
    expect(s).not.toBe(null);
    expect(s!.period).toBe(2);
  });

  it('returns null when overall mean is 0', () => {
    expect(seasonalIndices([0, 0, 0], 2)).toBe(null);
  });

  it('returns null when overall mean is negative', () => {
    expect(seasonalIndices([-2, -2], 2)).toBe(null);
  });

  it('returns null when no finite values', () => {
    expect(seasonalIndices([NaN, Infinity], 2)).toBe(null);
  });

  it('computes phase means divided by overall mean', () => {
    // values: phase0 = [10,30] mean 20, phase1 = [20,40] mean 30, overall=25
    const s = seasonalIndices([10, 20, 30, 40], 2);
    expect(s!.indices[0]).toBeCloseTo(20 / 25);
    expect(s!.indices[1]).toBeCloseTo(30 / 25);
  });

  it('marks phases with no data as null', () => {
    // period 3 but only 2 points -> phase 2 empty
    const s = seasonalIndices([10, 20], 3);
    expect(s!.indices[2]).toBe(null);
    expect(s!.indices[0]).not.toBe(null);
  });

  it('skips non-finite values when accumulating phases', () => {
    // phase0: [10, NaN] -> only 10; phase1: [20]
    const s = seasonalIndices([10, 20, NaN], 2);
    // overall mean of finite = (10+20)/2 = 15; phase0 mean = 10
    expect(s!.indices[0]).toBeCloseTo(10 / 15);
  });

  it('applies a positive phase offset', () => {
    // offset 1: index0 -> phase1, index1 -> phase0
    const noOff = seasonalIndices([10, 30], 2, 0);
    const off = seasonalIndices([10, 30], 2, 1);
    expect(off!.indices[1]).toBeCloseTo(noOff!.indices[0] as number);
    expect(off!.indices[0]).toBeCloseTo(noOff!.indices[1] as number);
  });

  it('normalizes a negative phase offset into range', () => {
    // offset -1 mod 2 -> 1, same as offset 1
    const a = seasonalIndices([10, 30], 2, -1);
    const b = seasonalIndices([10, 30], 2, 1);
    expect(a!.indices).toEqual(b!.indices);
  });

  it('all-equal series gives all indices = 1', () => {
    const s = seasonalIndices([5, 5, 5, 5], 2);
    expect(s!.indices).toEqual([1, 1]);
  });
});

describe('seasonallyAdjusted', () => {
  it('returns a copy of values when seasonality is unavailable', () => {
    const input = [1, 2, 3];
    const out = seasonallyAdjusted(input, 1);
    expect(out).toEqual([1, 2, 3]);
    expect(out).not.toBe(input);
  });

  it('returns a copy when overall mean is 0', () => {
    const out = seasonallyAdjusted([0, 0], 2);
    expect(out).toEqual([0, 0]);
  });

  it('divides each value by its phase index', () => {
    // phase0 idx = 20/25=0.8, phase1 idx = 30/25=1.2
    const out = seasonallyAdjusted([10, 20, 30, 40], 2);
    expect(out[0]).toBeCloseTo(10 / 0.8);
    expect(out[1]).toBeCloseTo(20 / 1.2);
    expect(out[2]).toBeCloseTo(30 / 0.8);
    expect(out[3]).toBeCloseTo(40 / 1.2);
  });

  it('leaves a value untouched when its phase index is null (no data)', () => {
    // period 3, point at phase 2 absent only if length<3; use length-driven null
    // Build series where one phase has zero finite data via NaN at that phase
    // phase indices: idx0 finite, idx1 finite, idx2 -> NaN only
    const out = seasonallyAdjusted([10, 20, NaN, 10, 20, NaN], 3);
    // index 2 (phase2) had only NaN entries -> index null -> value returned as-is (NaN)
    expect(Number.isNaN(out[2])).toBe(true);
  });

  it('leaves a value untouched when its phase index is <= 0', () => {
    // Construct a phase whose mean is 0 -> index 0 -> not divided
    // phase0 = [0, 0] mean 0 => idx 0; phase1 = [10, 30] mean 20
    const out = seasonallyAdjusted([0, 10, 0, 30], 2);
    expect(out[0]).toBe(0); // untouched
    expect(out[2]).toBe(0); // untouched
    // phase1 divided by (20/overall)
    const overall = (0 + 10 + 0 + 30) / 4; // 10
    expect(out[1]).toBeCloseTo(10 / (20 / overall));
  });

  it('honors phase offset consistently with seasonalIndices', () => {
    const out = seasonallyAdjusted([10, 20, 30, 40], 2, 1);
    const s = seasonalIndices([10, 20, 30, 40], 2, 1)!;
    // index0 -> phase (0+1)%2 = 1
    expect(out[0]).toBeCloseTo(10 / (s.indices[1] as number));
  });
});

describe('linearTrend', () => {
  it('returns null for empty input', () => {
    expect(linearTrend([])).toBe(null);
  });

  it('returns null for a single point', () => {
    expect(linearTrend([5])).toBe(null);
  });

  it('returns null when fewer than 2 finite points', () => {
    expect(linearTrend([NaN, Infinity, 5])).toBe(null);
  });

  it('fits with exactly 2 points (boundary: length === 2 is not null)', () => {
    // strict < 2 must admit exactly 2 points; <= 2 would wrongly bail.
    const t = linearTrend([10, 14]);
    expect(t).not.toBe(null);
    expect(t!.slope).toBeCloseTo(4);
    expect(t!.intercept).toBeCloseTo(10);
    expect(t!.forecast).toBeCloseTo(18); // x=2 -> 4*2+10
  });

  it('fits a perfect increasing line', () => {
    const t = linearTrend([1, 2, 3, 4])!;
    expect(t.slope).toBeCloseTo(1);
    expect(t.intercept).toBeCloseTo(1);
    expect(t.r2).toBeCloseTo(1);
    expect(t.forecast).toBeCloseTo(5); // x=4 -> 1*4+1
  });

  it('fits a perfect decreasing line', () => {
    const t = linearTrend([10, 8, 6])!;
    expect(t.slope).toBeCloseTo(-2);
    expect(t.forecast).toBeCloseTo(4); // x=3 -> -2*3+10
  });

  it('flat series: slope 0, R2 = 1 (規定)', () => {
    const t = linearTrend([7, 7, 7])!;
    expect(t.slope).toBeCloseTo(0);
    expect(t.intercept).toBeCloseTo(7);
    expect(t.r2).toBe(1);
    expect(t.forecast).toBeCloseTo(7);
  });

  it('noisy data yields R2 strictly between 0 and 1', () => {
    const t = linearTrend([1, 3, 2, 5, 4])!;
    expect(t.r2).toBeGreaterThan(0);
    expect(t.r2).toBeLessThan(1);
  });

  it('skips non-finite points but keeps original x indices', () => {
    // points: (0,0),(2,2),(3,3) -> slope 1, intercept 0, forecast at x=4 -> 4
    const t = linearTrend([0, NaN, 2, 3])!;
    expect(t.slope).toBeCloseTo(1);
    expect(t.intercept).toBeCloseTo(0);
    expect(t.forecast).toBeCloseTo(4); // x = values.length = 4
  });

  it('intercept reflects x=0 estimate for offset line', () => {
    // y = 2x + 5
    const t = linearTrend([5, 7, 9, 11])!;
    expect(t.intercept).toBeCloseTo(5);
    expect(t.slope).toBeCloseTo(2);
  });
});

describe('decomposeChange', () => {
  it('returns [] for empty input', () => {
    expect(decomposeChange([], 1)).toEqual([]);
  });

  it('MoM (lag 1): first is null, rest compute delta + pct', () => {
    const out = decomposeChange([100, 110, 99], 1);
    expect(out[0]).toEqual({ value: 100, base: null, delta: null, pct: null });
    expect(out[1]).toEqual({ value: 110, base: 100, delta: 10, pct: 10 });
    expect(out[2]).toEqual({ value: 99, base: 110, delta: -11, pct: -10 });
  });

  it('YoY (lag 12) leaves first 12 as null', () => {
    const vals = Array.from({ length: 13 }, (_, i) => (i + 1) * 10);
    const out = decomposeChange(vals, 12);
    for (let i = 0; i < 12; i += 1) expect(out[i]!.base).toBe(null);
    expect(out[12]).toEqual({ value: 130, base: 10, delta: 120, pct: 1200 });
  });

  it('clamps lag below 1 up to 1', () => {
    const out0 = decomposeChange([4, 8], 0);
    const out1 = decomposeChange([4, 8], 1);
    expect(out0).toEqual(out1);
  });

  it('floors fractional lag', () => {
    const out = decomposeChange([4, 8, 16], 1.9); // -> lag 1
    expect(out[1]!.base).toBe(4);
  });

  it('pct is null when base is 0', () => {
    const out = decomposeChange([0, 50], 1);
    expect(out[1]).toEqual({ value: 50, base: 0, delta: 50, pct: null });
  });

  it('pct is null when base is negative', () => {
    const out = decomposeChange([-10, 50], 1);
    expect(out[1]!.pct).toBe(null);
    expect(out[1]!.delta).toBe(60);
  });

  it('pct is null when base is non-finite', () => {
    const out = decomposeChange([Infinity, 50], 1);
    expect(out[1]!.pct).toBe(null);
  });
});

describe('variability', () => {
  it('all-null for empty input', () => {
    expect(variability([])).toEqual({ mean: null, stdDev: null, cv: null });
  });

  it('single value: mean set, stdDev + cv null', () => {
    expect(variability([42])).toEqual({ mean: 42, stdDev: null, cv: null });
  });

  it('single value after dropping non-finite: stdDev null', () => {
    expect(variability([NaN, 10])).toEqual({ mean: 10, stdDev: null, cv: null });
  });

  it('computes sample stdDev (n-1) and CV', () => {
    // values 2,4,6: mean 4, sample variance = ((4)+(0)+(4))/2 = 4, sd=2, cv=0.5
    const v = variability([2, 4, 6]);
    expect(v.mean).toBe(4);
    expect(v.stdDev).toBeCloseTo(2);
    expect(v.cv).toBeCloseTo(0.5);
  });

  it('zero-variance series: stdDev 0, cv 0', () => {
    const v = variability([5, 5, 5]);
    expect(v.stdDev).toBe(0);
    expect(v.cv).toBe(0);
  });

  it('cv is null when mean is 0', () => {
    const v = variability([-3, 3]);
    expect(v.mean).toBe(0);
    expect(v.stdDev).toBeGreaterThan(0);
    expect(v.cv).toBe(null);
  });

  it('cv is null when mean is negative', () => {
    const v = variability([-2, -6]);
    expect(v.mean).toBe(-4);
    expect(v.cv).toBe(null);
  });

  it('drops non-finite values from stdDev computation', () => {
    const v = variability([2, 4, 6, NaN, Infinity]);
    expect(v.mean).toBe(4);
    expect(v.stdDev).toBeCloseTo(2);
  });
});

describe('maxDrawdown', () => {
  it('all-null for empty / no finite input', () => {
    expect(maxDrawdown([])).toEqual({ maxDrawdown: null, peak: null, trough: null });
    expect(maxDrawdown([NaN, Infinity])).toEqual({ maxDrawdown: null, peak: null, trough: null });
  });

  it('monotonic increase: zero drawdown', () => {
    const d = maxDrawdown([1, 2, 3, 4]);
    expect(d.maxDrawdown).toBe(0);
  });

  it('computes peak-to-trough drawdown', () => {
    // peak 100, trough 60 -> 0.4
    const d = maxDrawdown([100, 80, 60, 90]);
    expect(d.maxDrawdown).toBeCloseTo(0.4);
    expect(d.peak).toBe(100);
    expect(d.trough).toBe(60);
  });

  it('tracks a new higher peak after recovery', () => {
    // up to 100 then drop to 50 (dd 0.5), recover to 200 then drop to 100 (dd 0.5)
    const d = maxDrawdown([100, 50, 200, 100]);
    expect(d.maxDrawdown).toBeCloseTo(0.5);
    // first 0.5 recorded with peak 100 trough 50 (strict > means later equal dd not replacing)
    expect(d.peak).toBe(100);
    expect(d.trough).toBe(50);
  });

  it('updates peak when a strictly higher value appears', () => {
    // 50 then 100 (new peak) then 40 -> dd from 100 = 0.6
    const d = maxDrawdown([50, 100, 40]);
    expect(d.peak).toBe(100);
    expect(d.trough).toBe(40);
    expect(d.maxDrawdown).toBeCloseTo(0.6);
  });

  it('ignores intervals where running peak is <= 0', () => {
    // negatives: peak starts -5, stays non-positive -> no drawdown recorded
    const d = maxDrawdown([-5, -10, -3]);
    expect(d.maxDrawdown).toBe(0);
  });

  it('peak exactly 0 is skipped (strict > 0 guards against /0 -> Infinity)', () => {
    // peak = 0, then a drop to -5: (0 - -5)/0 = Infinity. The strict `peak > 0`
    // guard must skip this interval, leaving maxDrawdown at 0 (not Infinity).
    const d = maxDrawdown([0, -5]);
    expect(d.maxDrawdown).toBe(0);
    expect(Number.isFinite(d.maxDrawdown!)).toBe(true);
  });

  it('single finite value: zero drawdown, peak=trough', () => {
    const d = maxDrawdown([77]);
    expect(d.maxDrawdown).toBe(0);
    expect(d.peak).toBe(77);
    expect(d.trough).toBe(77);
  });

  it('skips non-finite values mid-series', () => {
    const d = maxDrawdown([100, NaN, 50]);
    expect(d.maxDrawdown).toBeCloseTo(0.5);
  });

  it('peak crossing zero enables drawdown measurement', () => {
    // starts negative, climbs above 0, then drops -> dd computed from positive peak
    const d = maxDrawdown([-10, 100, 25]);
    expect(d.peak).toBe(100);
    expect(d.trough).toBe(25);
    expect(d.maxDrawdown).toBeCloseTo(0.75);
  });
});

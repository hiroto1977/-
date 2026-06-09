import { describe, expect, it } from 'vitest';
import { analyzeMarginTrend } from '../financialTrend';

describe('analyzeMarginTrend', () => {
  it('detects an improving margin (up)', () => {
    const t = analyzeMarginTrend([{ revenue: 100, profit: 5 }, { revenue: 100, profit: 8 }, { revenue: 100, profit: 12 }]);
    expect(t.direction).toBe('up');
    expect(t.firstMarginPct).toBe(5);
    expect(t.lastMarginPct).toBe(12);
    expect(t.deltaPct).toBe(7);
  });

  it('detects a declining margin (down)', () => {
    const t = analyzeMarginTrend([{ revenue: 100, profit: 20 }, { revenue: 100, profit: 10 }]);
    expect(t.direction).toBe('down');
    expect(t.deltaPct).toBe(-10);
  });

  it('treats small changes (≤0.2pt) as flat', () => {
    const t = analyzeMarginTrend([{ revenue: 1000, profit: 100 }, { revenue: 1000, profit: 101 }]);
    expect(t.direction).toBe('flat');
    expect(t.deltaPct).toBe(0.1);
  });

  it('treats exactly ±0.2pt as flat (strict > / < thresholds)', () => {
    // delta = +0.2 ちょうど → flat (>0.2 ではない)
    const up = analyzeMarginTrend([{ revenue: 1000, profit: 100 }, { revenue: 1000, profit: 102 }]);
    expect([up.deltaPct, up.direction]).toEqual([0.2, 'flat']);
    // delta = −0.2 ちょうど → flat (<−0.2 ではない)
    const down = analyzeMarginTrend([{ revenue: 1000, profit: 102 }, { revenue: 1000, profit: 100 }]);
    expect([down.deltaPct, down.direction]).toEqual([-0.2, 'flat']);
  });

  it('returns flat with null delta for <2 valid points', () => {
    expect(analyzeMarginTrend([]).deltaPct).toBe(null);
    expect(analyzeMarginTrend([{ revenue: 100, profit: 10 }]).deltaPct).toBe(null);
    expect(analyzeMarginTrend([{ revenue: 100, profit: 10 }]).lastMarginPct).toBe(10);
  });

  it('empty history yields null margins (not NaN) — 0期は単一値分岐に入らない', () => {
    // margins.length===0 → 三項条件 false 側 (null) を通ること。条件を true に
    // 固定する mutant は round1(undefined)=NaN になるため、この assertion で殺せる。
    const t = analyzeMarginTrend([]);
    expect(t.firstMarginPct).toBe(null);
    expect(t.lastMarginPct).toBe(null);
  });

  it('ignores zero-revenue periods', () => {
    const t = analyzeMarginTrend([{ revenue: 0, profit: 0 }, { revenue: 100, profit: 5 }, { revenue: 100, profit: 15 }]);
    expect(t.firstMarginPct).toBe(5); // 0売上は除外され、最初の有効点は5%
    expect(t.direction).toBe('up');
  });
});

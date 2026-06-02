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

  it('returns flat with null delta for <2 valid points', () => {
    expect(analyzeMarginTrend([]).deltaPct).toBe(null);
    expect(analyzeMarginTrend([{ revenue: 100, profit: 10 }]).deltaPct).toBe(null);
    expect(analyzeMarginTrend([{ revenue: 100, profit: 10 }]).lastMarginPct).toBe(10);
  });

  it('ignores zero-revenue periods', () => {
    const t = analyzeMarginTrend([{ revenue: 0, profit: 0 }, { revenue: 100, profit: 5 }, { revenue: 100, profit: 15 }]);
    expect(t.firstMarginPct).toBe(5); // 0売上は除外され、最初の有効点は5%
    expect(t.direction).toBe('up');
  });
});

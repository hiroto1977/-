import { describe, expect, it } from 'vitest';
import { computeRevenueConcentration } from '../revenueConcentration';

const ch = (label: string, amount: number) => ({ label, amount });

describe('computeRevenueConcentration', () => {
  it('returns null when there is no revenue', () => {
    expect(computeRevenueConcentration([])).toBeNull();
    expect(computeRevenueConcentration([ch('Amazon', 0)])).toBeNull();
  });

  it('scores 0 (fully concentrated) for a single channel and flags the risk', () => {
    const c = computeRevenueConcentration([ch('Amazon', 1_000_000)])!;
    expect(c.channelsPresent).toBe(1);
    expect(c.hhi).toBe(1);
    expect(c.effectiveChannels).toBe(1);
    expect(c.topChannel).toBe('Amazon');
    expect(c.topSharePct).toBe(100);
    expect(c.diversityScore).toBe(0);
    expect(c.singleChannelRisk).toBe(true);
  });

  it('scores 50 for an even two-channel split (HHI 0.5)', () => {
    const c = computeRevenueConcentration([ch('Amazon', 500_000), ch('Shopify', 500_000)])!;
    expect(c.channelsPresent).toBe(2);
    expect(c.hhi).toBe(0.5);
    expect(c.effectiveChannels).toBe(2);
    expect(c.topSharePct).toBe(50);
    expect(c.diversityScore).toBe(50);
    expect(c.singleChannelRisk).toBe(false);
  });

  it('identifies the dominant channel and flags single-channel risk above 60%', () => {
    const c = computeRevenueConcentration([ch('Amazon', 800_000), ch('Shopify', 200_000)])!;
    // shares 0.8/0.2 → HHI 0.68 → score 32
    expect(c.hhi).toBe(0.68);
    expect(c.topChannel).toBe('Amazon');
    expect(c.topSharePct).toBe(80);
    expect(c.diversityScore).toBe(32);
    expect(c.singleChannelRisk).toBe(true);
  });

  it('does not flag risk at exactly 60% (strictly greater than)', () => {
    const c = computeRevenueConcentration([ch('A', 600_000), ch('B', 400_000)])!;
    expect(c.topSharePct).toBe(60);
    expect(c.singleChannelRisk).toBe(false);
  });
});

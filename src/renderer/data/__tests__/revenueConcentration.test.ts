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

  it('excludes non-positive channels via the filter (negative amount ignored)', () => {
    // 負のチャネルを除外。filter を外す / 条件を true 固定する mutant は負値を合算へ
    // 含めて HHI/シェアを変えるため、フィルタ有りの結果と一致しないことで殺せる。
    const withNeg = computeRevenueConcentration([ch('A', 800_000), ch('B', 200_000), ch('Bad', -500_000)])!;
    const clean = computeRevenueConcentration([ch('A', 800_000), ch('B', 200_000)])!;
    expect(withNeg.channelsPresent).toBe(2);
    expect(withNeg.hhi).toBe(clean.hhi);
    expect(withNeg.topSharePct).toBe(80);
  });

  it('keeps the first channel as top on an exact share tie (strictly greater)', () => {
    // A と B が同額 → share 同値。`share > topShare` を `>=` にする mutant は後勝ちで
    // topChannel=B になるため、先勝ち (A) を検証して殺す。
    const c = computeRevenueConcentration([ch('A', 500_000), ch('B', 500_000)])!;
    expect(c.topChannel).toBe('A');
    expect(c.topSharePct).toBe(50);
  });
});

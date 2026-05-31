import { describe, expect, it } from 'vitest';
import { buildManagementScorecard } from '../managementScorecard';

describe('buildManagementScorecard', () => {
  it('scores an empty input as 0 / poor with all categories null', () => {
    const r = buildManagementScorecard({});
    expect(r.overallScore).toBe(0);
    expect(r.verdict).toBe('poor');
    expect(r.categories.every((c) => c.score === null)).toBe(true);
  });

  it('maps a strong business to a high overall score / excellent', () => {
    const r = buildManagementScorecard({
      operatingMarginPct: 12, // ≥10 → 100
      contributionRatioPct: 65, // ≥60 → 100
      safetyMarginPct: 45, // ≥40 → 100
      equityRatioPct: 55, // ≥50 → 100
      dscr: 2.5, // ≥2.0 → 100
      runwayMonths: 18, // ≥12 → 100
      revenueGrowthPct: 25, // ≥20 → 100
    });
    expect(r.overallScore).toBe(100);
    expect(r.verdict).toBe('excellent');
    expect(r.alerts).toEqual([]);
  });

  it('maps a weak business to a low score / poor with alerts', () => {
    const r = buildManagementScorecard({
      operatingMarginPct: 0,
      contributionRatioPct: 0,
      safetyMarginPct: 0,
      dscr: 0,
      runwayMonths: 0,
    });
    expect(r.overallScore).toBeLessThan(40);
    expect(r.verdict).toBe('poor');
    expect(r.alerts.length).toBeGreaterThan(0);
  });

  it('averages only the categories that have data', () => {
    // only profitability present, at midpoint → category 50, overall 50
    const r = buildManagementScorecard({ operatingMarginPct: 5, contributionRatioPct: 30 });
    const prof = r.categories.find((c) => c.category === 'profitability')!;
    expect(prof.score).toBe(50);
    expect(r.categories.find((c) => c.category === 'safety')!.score).toBeNull();
    expect(r.overallScore).toBe(50);
    expect(r.verdict).toBe('caution');
  });

  it('clamps out-of-range metrics into 0..100', () => {
    // negative growth far below the floor → 0; huge margin above the ceiling → 100
    const r = buildManagementScorecard({ revenueGrowthPct: -50, operatingMarginPct: 99 });
    expect(r.categories.find((c) => c.category === 'growth')!.score).toBe(0);
    expect(r.categories.find((c) => c.category === 'profitability')!.score).toBe(100);
  });

  it('component breakdown exposes each indicator score', () => {
    const r = buildManagementScorecard({ dscr: 1, runwayMonths: 6 });
    const liq = r.categories.find((c) => c.category === 'liquidity')!;
    expect(liq.components.map((c) => c.label)).toEqual(['DSCR', 'ランウェイ']);
    expect(liq.components.every((c) => c.score >= 0 && c.score <= 100)).toBe(true);
  });
});

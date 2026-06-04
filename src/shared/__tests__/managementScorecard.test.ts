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

  it('folds the equity ratio into the safety category (from a balance sheet)', () => {
    // 自己資本比率 50% → band(50,0,50)=100。安全余裕率 20% → band(20,0,40)=50。平均 75
    const r = buildManagementScorecard({ safetyMarginPct: 20, equityRatioPct: 50 });
    const safety = r.categories.find((c) => c.category === 'safety')!;
    expect(safety.components.map((c) => c.label)).toEqual(['安全余裕率', '自己資本比率']);
    expect(safety.score).toBe(75);
  });

  it('scores an efficiency category from CCC (shorter is better) and asset turnover', () => {
    // CCC 0日 → band(90,0,90)=100; 回転率 1.5 → band(1.5,0,1.5)=100 → 平均 100
    const r = buildManagementScorecard({ cashConversionDays: 0, assetTurnover: 1.5 });
    const eff = r.categories.find((c) => c.category === 'efficiency')!;
    expect(eff.components.map((c) => c.label)).toEqual(['CCC', '総資産回転率']);
    expect(eff.score).toBe(100);
  });

  it('penalises a long CCC in the efficiency category', () => {
    // CCC 90日 → band(0,0,90)=0
    const r = buildManagementScorecard({ cashConversionDays: 90 });
    expect(r.categories.find((c) => c.category === 'efficiency')!.score).toBe(0);
  });

  it('rewards a negative CCC (clamped to 100)', () => {
    const r = buildManagementScorecard({ cashConversionDays: -30 });
    expect(r.categories.find((c) => c.category === 'efficiency')!.score).toBe(100);
  });

  it('folds gross margin into the profitability category', () => {
    // 粗利率 20% → band(20,0,40)=50 のみ。営業利益率 0 → 0、粗利率 50 → 平均 25
    const r = buildManagementScorecard({ operatingMarginPct: 0, grossMarginPct: 20 });
    const prof = r.categories.find((c) => c.category === 'profitability')!;
    expect(prof.components.map((c) => c.label)).toEqual(['営業利益率', '粗利率']);
    expect(prof.components.find((c) => c.label === '粗利率')!.score).toBe(50);
    expect(prof.score).toBe(25); // (0 + 50) / 2
  });

  it('exposes every category label in order (StringLiteral golden)', () => {
    const r = buildManagementScorecard({});
    expect(r.categories.map((c) => [c.category, c.label])).toEqual([
      ['profitability', '収益性'],
      ['safety', '安全性'],
      ['liquidity', '資金繰り'],
      ['efficiency', '効率性'],
      ['growth', '成長性'],
    ]);
  });

  it('includes 限界利益率 / 売上成長率 component labels when provided', () => {
    const r = buildManagementScorecard({ contributionRatioPct: 30, revenueGrowthPct: 5 });
    const prof = r.categories.find((c) => c.category === 'profitability')!;
    expect(prof.components.map((c) => c.label)).toContain('限界利益率');
    const growth = r.categories.find((c) => c.category === 'growth')!;
    expect(growth.components.map((c) => c.label)).toEqual(['売上成長率']);
  });

  it('maps revenue growth on the [-10, +20] band (negative lo matters)', () => {
    // band(5, -10, 20) = (5−(−10))/(20−(−10)) = 15/30 = 0.5 → 50。
    // hi−lo を hi+lo にする / lo の −10 を +10 にする mutant はこの 50 で殺せる。
    const r = buildManagementScorecard({ revenueGrowthPct: 5 });
    expect(r.categories.find((c) => c.category === 'growth')!.score).toBe(50);
  });

  it('maps overallScore to verdict at the 80/60/40 boundaries (>= strict)', () => {
    // 単一カテゴリ (営業利益率) で overallScore = band(v,0,10) を直接制御。
    const verdictAt = (opMargin: number) => buildManagementScorecard({ operatingMarginPct: opMargin }).verdict;
    expect(buildManagementScorecard({ operatingMarginPct: 8 }).overallScore).toBe(80);
    expect(verdictAt(8)).toBe('excellent'); // 80 → >=80
    expect(verdictAt(6)).toBe('good'); // 60 → >=60
    expect(verdictAt(4)).toBe('caution'); // 40 → >=40
    expect(verdictAt(2)).toBe('poor'); // 20
  });

  it('alerts only below 40 (score===40 is not an alert) with the exact message', () => {
    // score 40 ちょうどは < 40 が false → アラート無し。<= にする mutant を殺す。
    expect(buildManagementScorecard({ operatingMarginPct: 4 }).alerts).toEqual([]);
    // score 20 はアラート対象。メッセージのリテラルを固定。
    expect(buildManagementScorecard({ operatingMarginPct: 2 }).alerts).toEqual([
      '収益性が低水準 (20/100) — 改善を検討',
    ]);
  });
});

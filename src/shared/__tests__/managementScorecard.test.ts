import { describe, expect, it } from 'vitest';
import {
  buildManagementScorecard,
  compareToIndustry,
  prioritizeWeaknesses,
  scoreTrend,
  weightedOverallScore,
  type IndustryBenchmark,
  type ManagementScorecard,
} from '../managementScorecard';

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

// ────────────────────────────────────────────────────────────────────────────
// 加算的な精緻化 (round 72)
// ────────────────────────────────────────────────────────────────────────────

/** テスト用に任意のカテゴリスコアを持つスコアカードを組み立てる。 */
function makeScorecard(
  scores: Partial<Record<ManagementScorecard['categories'][number]['category'], number | null>>,
): ManagementScorecard {
  const defs: ReadonlyArray<[ManagementScorecard['categories'][number]['category'], string]> = [
    ['profitability', '収益性'],
    ['safety', '安全性'],
    ['liquidity', '資金繰り'],
    ['efficiency', '効率性'],
    ['growth', '成長性'],
  ];
  const categories = defs.map(([category, label]) => ({
    category,
    label,
    score: category in scores ? (scores[category] ?? null) : null,
    components: [],
  }));
  return { categories, overallScore: 0, verdict: 'poor', alerts: [] };
}

describe('weightedOverallScore', () => {
  it('with no weights matches the equal-weighted average (parity with overallScore)', () => {
    const sc = makeScorecard({ profitability: 80, safety: 40, liquidity: 60 });
    const r = weightedOverallScore(sc);
    // (80+40+60)/3 = 60
    expect(r.score).toBe(60);
    expect(r.verdict).toBe('good');
    expect(r.weightSum).toBe(3);
    expect(r.contributing).toEqual(['profitability', 'safety', 'liquidity']);
  });

  it('applies category weights (safety-heavy lowers the result)', () => {
    const sc = makeScorecard({ profitability: 90, safety: 30 });
    // profitability weight 1, safety weight 3 → (90*1 + 30*3)/4 = 180/4 = 45
    const r = weightedOverallScore(sc, { safety: 3 });
    expect(r.weightSum).toBe(4);
    expect(r.score).toBe(45);
    expect(r.verdict).toBe('caution');
  });

  it('unspecified categories default to weight 1 alongside an explicit weight', () => {
    const sc = makeScorecard({ profitability: 100, safety: 0 });
    // profitability explicit 2, safety default 1 → (100*2 + 0*1)/3 = 200/3 ≈ 67
    const r = weightedOverallScore(sc, { profitability: 2 });
    expect(r.weightSum).toBe(3);
    expect(r.score).toBe(67);
  });

  it('skips null-score categories from numerator and denominator', () => {
    const sc = makeScorecard({ profitability: 80, safety: null });
    const r = weightedOverallScore(sc);
    expect(r.weightSum).toBe(1);
    expect(r.score).toBe(80);
    expect(r.contributing).toEqual(['profitability']);
  });

  it('treats zero / negative / non-finite weights as non-contributing', () => {
    const sc = makeScorecard({ profitability: 50, safety: 90, liquidity: 10 });
    // safety weight 0, liquidity weight -1 → only profitability contributes
    const r = weightedOverallScore(sc, { safety: 0, liquidity: -1 });
    expect(r.contributing).toEqual(['profitability']);
    expect(r.weightSum).toBe(1);
    expect(r.score).toBe(50);
  });

  it('drops a NaN weight (non-finite guard)', () => {
    const sc = makeScorecard({ profitability: 50, safety: 90 });
    const r = weightedOverallScore(sc, { safety: NaN });
    expect(r.contributing).toEqual(['profitability']);
    expect(r.score).toBe(50);
  });

  it('returns null score / verdict when no category contributes (all null)', () => {
    const r = weightedOverallScore(makeScorecard({}));
    expect(r.score).toBeNull();
    expect(r.verdict).toBeNull();
    expect(r.weightSum).toBe(0);
    expect(r.contributing).toEqual([]);
  });

  it('returns null when every weight is zeroed out', () => {
    const sc = makeScorecard({ profitability: 80, safety: 40 });
    const r = weightedOverallScore(sc, { profitability: 0, safety: 0 });
    expect(r.score).toBeNull();
    expect(r.verdict).toBeNull();
    expect(r.weightSum).toBe(0);
  });

  it('maps the weighted score to verdict at the 80/60/40 boundaries (>= strict)', () => {
    expect(weightedOverallScore(makeScorecard({ profitability: 80 })).verdict).toBe('excellent');
    expect(weightedOverallScore(makeScorecard({ profitability: 79 })).verdict).toBe('good');
    expect(weightedOverallScore(makeScorecard({ profitability: 60 })).verdict).toBe('good');
    expect(weightedOverallScore(makeScorecard({ profitability: 59 })).verdict).toBe('caution');
    expect(weightedOverallScore(makeScorecard({ profitability: 40 })).verdict).toBe('caution');
    expect(weightedOverallScore(makeScorecard({ profitability: 39 })).verdict).toBe('poor');
  });
});

describe('compareToIndustry', () => {
  const benchmarks: readonly IndustryBenchmark[] = [
    { metric: 'operatingMarginPct', mean: 8, sd: 4 },
    { metric: 'cashConversionDays', mean: 40, sd: 10, higherIsBetter: false },
  ];

  it('computes delta, pctOfMean, zScore and standing for a higher-is-better metric', () => {
    const r = compareToIndustry({ operatingMarginPct: 12 }, benchmarks);
    expect(r).toHaveLength(1);
    const c = r[0]!;
    expect(c.metric).toBe('operatingMarginPct');
    expect(c.actual).toBe(12);
    expect(c.delta).toBe(4); // 12 - 8
    expect(c.pctOfMean).toBe(50); // 4 / |8| * 100
    expect(c.zScore).toBe(1); // 4 / 4
    expect(c.standing).toBe('above');
  });

  it('flags below for a higher-is-better metric beneath the mean', () => {
    const r = compareToIndustry({ operatingMarginPct: 2 }, benchmarks);
    const c = r[0]!;
    expect(c.delta).toBe(-6);
    expect(c.zScore).toBe(-1.5);
    expect(c.standing).toBe('below');
  });

  it('inverts standing for a lower-is-better metric (shorter CCC is above)', () => {
    // CCC 20 vs mean 40 → delta -20 (good for lower-is-better) → above
    const r = compareToIndustry({ cashConversionDays: 20 }, benchmarks);
    const c = r.find((x) => x.metric === 'cashConversionDays')!;
    expect(c.delta).toBe(-20);
    expect(c.standing).toBe('above');
  });

  it('marks a lower-is-better metric above the mean as below', () => {
    const r = compareToIndustry({ cashConversionDays: 60 }, benchmarks);
    const c = r.find((x) => x.metric === 'cashConversionDays')!;
    expect(c.delta).toBe(20);
    expect(c.standing).toBe('below');
  });

  it('treats values within 0.25*sd of the mean as inline', () => {
    // mean 8, sd 4 → tolerance 1. actual 9 → delta 1 (== tolerance) → inline
    const r = compareToIndustry({ operatingMarginPct: 9 }, benchmarks);
    expect(r[0]!.standing).toBe('inline');
  });

  it('classifies just outside the tolerance band as above (not inline)', () => {
    // delta 1.5 > tolerance 1 → above
    const r = compareToIndustry({ operatingMarginPct: 9.5 }, benchmarks);
    expect(r[0]!.standing).toBe('above');
  });

  it('returns null zScore when sd <= 0', () => {
    const r = compareToIndustry({ operatingMarginPct: 12 }, [
      { metric: 'operatingMarginPct', mean: 8, sd: 0 },
    ]);
    expect(r[0]!.zScore).toBeNull();
    // sd invalid → tolerance 0 → delta 4 > 0 → above
    expect(r[0]!.standing).toBe('above');
  });

  it('returns null pctOfMean when mean is zero', () => {
    const r = compareToIndustry({ revenueGrowthPct: 5 }, [
      { metric: 'revenueGrowthPct', mean: 0, sd: 2 },
    ]);
    expect(r[0]!.pctOfMean).toBeNull();
    expect(r[0]!.delta).toBe(5);
    expect(r[0]!.zScore).toBe(2.5);
  });

  it('skips metrics absent from the input', () => {
    const r = compareToIndustry({ operatingMarginPct: 8 }, benchmarks);
    expect(r.map((c) => c.metric)).toEqual(['operatingMarginPct']);
  });

  it('skips non-finite actual values and non-finite benchmark means', () => {
    const r = compareToIndustry({ operatingMarginPct: Infinity }, [
      { metric: 'operatingMarginPct', mean: 8, sd: 4 },
      { metric: 'grossMarginPct', mean: NaN, sd: 5 },
    ]);
    expect(r).toEqual([]);
  });

  it('skips a finite actual when the benchmark mean is non-finite (mean guard)', () => {
    // actual 30 is finite, but mean NaN → cannot compute delta → must be skipped.
    expect(compareToIndustry({ grossMarginPct: 30 }, [
      { metric: 'grossMarginPct', mean: NaN, sd: 5 },
    ])).toEqual([]);
    expect(compareToIndustry({ grossMarginPct: 30 }, [
      { metric: 'grossMarginPct', mean: Infinity, sd: 5 },
    ])).toEqual([]);
  });

  it('treats a non-finite sd as invalid (null zScore, tolerance 0)', () => {
    const r = compareToIndustry({ operatingMarginPct: 8.0001 }, [
      { metric: 'operatingMarginPct', mean: 8, sd: Infinity },
    ]);
    expect(r[0]!.zScore).toBeNull();
    expect(r[0]!.standing).toBe('above');
  });

  it('an exactly-on-mean metric with invalid sd is inline (delta 0 <= tolerance 0)', () => {
    const r = compareToIndustry({ operatingMarginPct: 8 }, [
      { metric: 'operatingMarginPct', mean: 8, sd: -1 },
    ]);
    expect(r[0]!.delta).toBe(0);
    expect(r[0]!.standing).toBe('inline');
  });
});

describe('scoreTrend', () => {
  it('detects an improving series (positive slope)', () => {
    const r = scoreTrend([40, 50, 60, 70]);
    expect(r.slope).toBe(10);
    expect(r.latestChange).toBe(10);
    expect(r.totalChange).toBe(30);
    expect(r.direction).toBe('improving');
    expect(r.points).toBe(4);
  });

  it('detects a declining series (negative slope)', () => {
    const r = scoreTrend([70, 60, 50]);
    expect(r.slope).toBe(-10);
    expect(r.latestChange).toBe(-10);
    expect(r.totalChange).toBe(-20);
    expect(r.direction).toBe('declining');
  });

  it('classifies a near-flat series within epsilon as flat', () => {
    // slope 0 exactly
    const r = scoreTrend([50, 50, 50]);
    expect(r.slope).toBe(0);
    expect(r.direction).toBe('flat');
    expect(r.latestChange).toBe(0);
  });

  it('uses epsilon as a strict threshold for direction', () => {
    // two points 0 then 0.5 → slope 0.5; default epsilon 0.5 → not > epsilon → flat
    expect(scoreTrend([0, 0.5]).direction).toBe('flat');
    // slope 0.6 > 0.5 → improving
    expect(scoreTrend([0, 0.6]).direction).toBe('improving');
    // custom epsilon 0.4 → 0.5 > 0.4 → improving
    expect(scoreTrend([0, 0.5], 0.4).direction).toBe('improving');
    // declining mirror: slope -0.6 < -0.5
    expect(scoreTrend([0, -0.6]).direction).toBe('declining');
    // slope exactly -epsilon (-0.5): `< -epsilon` is strict → NOT declining → flat.
    // (kills the `<=` mutant on the declining branch.)
    expect(scoreTrend([0, -0.5]).slope).toBe(-0.5);
    expect(scoreTrend([0, -0.5]).direction).toBe('flat');
  });

  it('returns all null for an empty (or fully non-finite) series', () => {
    const r = scoreTrend([]);
    expect(r).toEqual({
      slope: null,
      latestChange: null,
      totalChange: null,
      direction: 'flat',
      points: 0,
    });
    expect(scoreTrend([NaN, Infinity]).points).toBe(0);
  });

  it('handles a single point: slope 0, changes null', () => {
    const r = scoreTrend([55]);
    expect(r.slope).toBe(0);
    expect(r.latestChange).toBeNull();
    expect(r.totalChange).toBeNull();
    expect(r.direction).toBe('flat');
    expect(r.points).toBe(1);
  });

  it('filters non-finite values before computing', () => {
    // effective series [40, 60] → slope 20, latestChange 20, totalChange 20
    const r = scoreTrend([40, NaN, 60]);
    expect(r.points).toBe(2);
    expect(r.slope).toBe(20);
    expect(r.totalChange).toBe(20);
  });

  it('computes a least-squares slope for a non-monotonic series', () => {
    // [10, 30, 20, 40]: meanT=1.5, meanY=25; num = Σdt*(y-ȳ), den = Σdt² = 5
    // dt = -1.5,-0.5,0.5,1.5 ; dy = -15,5,-5,15 → num = 22.5+(-2.5)+(-2.5)+22.5 = 40 → slope 8
    const r = scoreTrend([10, 30, 20, 40]);
    expect(r.slope).toBe(8);
    expect(r.latestChange).toBe(20); // 40 - 20
    expect(r.totalChange).toBe(30); // 40 - 10
  });
});

describe('prioritizeWeaknesses', () => {
  it('orders by importance * headroom descending', () => {
    const sc = makeScorecard({ profitability: 30, safety: 60, liquidity: 80 });
    // headrooms: 70, 40, 20; equal importance → priorities 70,40,20
    const r = prioritizeWeaknesses(sc);
    expect(r.map((w) => w.category)).toEqual(['profitability', 'safety', 'liquidity']);
    expect(r[0]!.headroom).toBe(70);
    expect(r[0]!.priority).toBe(70);
  });

  it('weights importance so a critical mid-score can outrank a worse low-importance one', () => {
    const sc = makeScorecard({ profitability: 30, safety: 60 });
    // safety importance 3 → priority 3*40=120 > profitability 1*70=70
    const r = prioritizeWeaknesses(sc, { safety: 3 });
    expect(r.map((w) => w.category)).toEqual(['safety', 'profitability']);
    expect(r[0]!.priority).toBe(120);
    expect(r[1]!.priority).toBe(70);
  });

  it('keeps original category order for tied priorities (stable sort)', () => {
    const sc = makeScorecard({ profitability: 50, safety: 50, liquidity: 50 });
    // all priority 50 → original order preserved
    const r = prioritizeWeaknesses(sc);
    expect(r.map((w) => w.category)).toEqual(['profitability', 'safety', 'liquidity']);
  });

  it('excludes null-score categories', () => {
    const sc = makeScorecard({ profitability: 30, safety: null });
    const r = prioritizeWeaknesses(sc);
    expect(r.map((w) => w.category)).toEqual(['profitability']);
  });

  it('only includes categories strictly below the threshold', () => {
    const sc = makeScorecard({ profitability: 40, safety: 60, liquidity: 39 });
    // threshold 40 → only score < 40 qualifies → liquidity (39); profitability 40 excluded
    const r = prioritizeWeaknesses(sc, {}, 40);
    expect(r.map((w) => w.category)).toEqual(['liquidity']);
  });

  it('excludes a perfect score under the default threshold of 100', () => {
    const sc = makeScorecard({ profitability: 100, safety: 80 });
    const r = prioritizeWeaknesses(sc);
    expect(r.map((w) => w.category)).toEqual(['safety']);
  });

  it('drops categories with zero / negative / non-finite importance', () => {
    const sc = makeScorecard({ profitability: 30, safety: 40, liquidity: 50 });
    const r = prioritizeWeaknesses(sc, { profitability: 0, safety: -2, liquidity: NaN });
    expect(r).toEqual([]);
  });

  it('exposes score, importance and headroom on each entry', () => {
    const sc = makeScorecard({ profitability: 25 });
    const r = prioritizeWeaknesses(sc, { profitability: 2 });
    expect(r[0]).toMatchObject({
      category: 'profitability',
      label: '収益性',
      score: 25,
      importance: 2,
      headroom: 75,
      priority: 150,
    });
  });

  it('returns an empty array when no category qualifies', () => {
    expect(prioritizeWeaknesses(makeScorecard({}))).toEqual([]);
  });
});

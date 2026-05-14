import { describe, expect, it } from 'vitest';
import {
  BUSINESS_CATEGORIES,
  HISTORY_LENGTH,
  computeCategoryKpi,
  aggregateBusinessUnits,
  createMockBusinessOpsDataSource,
  fetchBusinessOpsSnapshot,
  fetchBusinessOpsSnapshotImpl,
  getCategoryDef,
  isBusinessCategoryId,
  type BusinessUnit,
  type BusinessCategoryId,
} from '../business';

// --- Category taxonomy ------------------------------------------------

describe('BUSINESS_CATEGORIES', () => {
  it('declares all 10 categories with the documented IDs', () => {
    expect(BUSINESS_CATEGORIES.map((c) => c.id)).toEqual([
      'ec',
      'dropship',
      'oem-odm',
      'blog',
      'blog-affiliate',
      'ppc-affiliate',
      'video-production',
      'video-upload',
      'video-distribution',
      'sns-ops',
    ]);
  });

  it('every category has non-empty label/description and positive baseRevenue/fixedCost', () => {
    for (const c of BUSINESS_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.baseRevenue).toBeGreaterThan(0);
      expect(c.fixedCost).toBeGreaterThanOrEqual(0);
      expect(c.variableRatio).toBeGreaterThanOrEqual(0);
      expect(c.variableRatio).toBeLessThanOrEqual(1);
      expect(c.baseTraffic).toBeGreaterThan(0);
    }
  });

  it('pins the canonical trafficKind per category (kills StringLiteral mutants)', () => {
    const byId = Object.fromEntries(BUSINESS_CATEGORIES.map((c) => [c.id, c.trafficKind]));
    expect(byId['ec']).toBe('session');
    expect(byId['dropship']).toBe('session');
    expect(byId['oem-odm']).toBe('project');
    expect(byId['blog']).toBe('session');
    expect(byId['blog-affiliate']).toBe('session');
    expect(byId['ppc-affiliate']).toBe('impression');
    expect(byId['video-production']).toBe('project');
    expect(byId['video-upload']).toBe('view');
    expect(byId['video-distribution']).toBe('impression');
    expect(byId['sns-ops']).toBe('impression');
  });
});

describe('getCategoryDef + isBusinessCategoryId', () => {
  it('returns the def for every known id', () => {
    for (const c of BUSINESS_CATEGORIES) {
      expect(getCategoryDef(c.id)).toBe(c);
    }
  });

  it('isBusinessCategoryId accepts known ids only', () => {
    expect(isBusinessCategoryId('ec')).toBe(true);
    expect(isBusinessCategoryId('sns-ops')).toBe(true);
    expect(isBusinessCategoryId('unknown')).toBe(false);
    expect(isBusinessCategoryId(42)).toBe(false);
    expect(isBusinessCategoryId(null)).toBe(false);
    expect(isBusinessCategoryId(undefined)).toBe(false);
    expect(isBusinessCategoryId({})).toBe(false);
  });
});

// --- computeCategoryKpi ----------------------------------------------

describe('computeCategoryKpi', () => {
  const sampleDef = BUSINESS_CATEGORIES[0]!; // EC

  it('with drifts = 1.0 / 1.0 / 1.0 produces base values', () => {
    const k = computeCategoryKpi(sampleDef, 1, 1, 1);
    expect(k.revenue).toBe(sampleDef.baseRevenue);
    expect(k.variableCost).toBe(Math.round(sampleDef.baseRevenue * sampleDef.variableRatio));
    expect(k.fixedCost).toBe(sampleDef.fixedCost);
    expect(k.totalCost).toBe(k.variableCost + k.fixedCost);
    expect(k.profit).toBe(k.revenue - k.totalCost);
    expect(k.profitMargin).toBeCloseTo((k.profit / k.revenue) * 100, 6);
  });

  it('traffic scales linearly with driftTraffic', () => {
    const a = computeCategoryKpi(sampleDef, 1, 1, 1);
    const b = computeCategoryKpi(sampleDef, 1, 2, 1);
    expect(b.traffic).toBe(Math.round(sampleDef.baseTraffic * 2));
    expect(b.traffic).toBeGreaterThan(a.traffic);
  });

  it('roas is 0 when baseRoas is 0 (non-ad-driven categories)', () => {
    const blog = BUSINESS_CATEGORIES.find((c) => c.id === 'blog')!;
    const k = computeCategoryKpi(blog, 1, 1, 1);
    expect(blog.baseRoas).toBe(0);
    expect(k.roas).toBe(0);
  });

  it('roas scales with driftRoas when baseRoas > 0', () => {
    const ppc = BUSINESS_CATEGORIES.find((c) => c.id === 'ppc-affiliate')!;
    expect(ppc.baseRoas).toBeGreaterThan(0);
    const a = computeCategoryKpi(ppc, 1, 1, 1);
    const b = computeCategoryKpi(ppc, 1, 1, 2);
    expect(b.roas).toBeCloseTo(ppc.baseRoas * 2, 6);
    expect(b.roas).toBeGreaterThan(a.roas);
  });

  it('conversion = traffic * conversionRate (rounded)', () => {
    const k = computeCategoryKpi(sampleDef, 1, 1, 1);
    expect(k.conversion).toBe(Math.round(sampleDef.baseTraffic * sampleDef.baseConversionRate));
  });

  it('conversionRatePct = 100 * conversion / traffic; 0 when traffic 0', () => {
    const k = computeCategoryKpi(sampleDef, 1, 1, 1);
    expect(k.conversionRatePct).toBeCloseTo((k.conversion / k.traffic) * 100, 6);
    const zero = computeCategoryKpi({ ...sampleDef, baseTraffic: 0 }, 1, 0, 1);
    expect(zero.traffic).toBe(0);
    expect(zero.conversionRatePct).toBe(0);
  });

  it('aov = revenue / conversion; 0 when conversion is 0', () => {
    const k = computeCategoryKpi(sampleDef, 1, 1, 1);
    expect(k.aov).toBe(Math.round(k.revenue / k.conversion));
    const zero = computeCategoryKpi(
      { ...sampleDef, baseConversionRate: 0 } as typeof sampleDef,
      1,
      1,
      1,
    );
    expect(zero.conversion).toBe(0);
    expect(zero.aov).toBe(0);
  });

  it('profitMargin = 0 when revenue is 0 (kills divide-by-zero path)', () => {
    const k = computeCategoryKpi({ ...sampleDef, baseRevenue: 0 } as typeof sampleDef, 0, 1, 1);
    expect(k.revenue).toBe(0);
    expect(k.profitMargin).toBe(0);
  });

  it('contentOutput is taken from the def unchanged', () => {
    const k = computeCategoryKpi(sampleDef, 1, 1, 1);
    expect(k.contentOutput).toBe(sampleDef.baseContentOutput);
  });
});

// --- Mock data source ------------------------------------------------

describe('createMockBusinessOpsDataSource', () => {
  it('returns exactly the 10 categories', async () => {
    const src = createMockBusinessOpsDataSource();
    const units = await src.fetch();
    expect(units).toHaveLength(BUSINESS_CATEGORIES.length);
    expect(units.map((u) => u.id)).toEqual(BUSINESS_CATEGORIES.map((c) => c.id));
  });

  it('every unit has HISTORY_LENGTH history entries + current = last', async () => {
    const src = createMockBusinessOpsDataSource();
    const units = await src.fetch();
    for (const u of units) {
      expect(u.history).toHaveLength(HISTORY_LENGTH);
      expect(u.current).toBe(u.history[u.history.length - 1]);
    }
  });

  it('drift bands keep revenue / traffic / roas within documented multipliers', async () => {
    const src = createMockBusinessOpsDataSource();
    const units = await src.fetch();
    for (const u of units) {
      const def = getCategoryDef(u.id);
      for (const h of u.history) {
        // revenue drift 0.7..1.3
        expect(h.revenue).toBeGreaterThanOrEqual(Math.round(def.baseRevenue * 0.7) - 1);
        expect(h.revenue).toBeLessThanOrEqual(Math.round(def.baseRevenue * 1.3) + 1);
        // traffic drift 0.6..1.4
        expect(h.traffic).toBeGreaterThanOrEqual(Math.round(def.baseTraffic * 0.6) - 1);
        expect(h.traffic).toBeLessThanOrEqual(Math.round(def.baseTraffic * 1.4) + 1);
        if (def.baseRoas > 0) {
          // roas drift 0.75..1.25
          expect(h.roas).toBeGreaterThanOrEqual(def.baseRoas * 0.75 - 0.001);
          expect(h.roas).toBeLessThanOrEqual(def.baseRoas * 1.25 + 0.001);
        } else {
          expect(h.roas).toBe(0);
        }
      }
    }
  });

  it('is fully deterministic — two calls produce equal arrays', async () => {
    const a = await createMockBusinessOpsDataSource().fetch();
    const b = await createMockBusinessOpsDataSource().fetch();
    expect(a).toEqual(b);
  });

  it('different categories produce different first-period KPIs (no cross-contamination)', async () => {
    const src = createMockBusinessOpsDataSource();
    const units = await src.fetch();
    const first0 = units[0]!.history[0]!.revenue;
    const second0 = units[1]!.history[0]!.revenue;
    // Distinct categories use distinct seeds → distinct mock values.
    expect(first0).not.toBe(second0);
  });
});

// --- aggregateBusinessUnits -----------------------------------------

describe('aggregateBusinessUnits', () => {
  function unit(id: BusinessCategoryId, revenue: number, totalCost: number, output: number): BusinessUnit {
    const profit = revenue - totalCost;
    return {
      id,
      label: 'L',
      description: 'D',
      trafficKind: 'session',
      current: {
        revenue,
        variableCost: 0,
        fixedCost: totalCost,
        totalCost,
        profit,
        profitMargin: revenue > 0 ? (profit / revenue) * 100 : 0,
        traffic: 0,
        conversion: 0,
        conversionRatePct: 0,
        aov: 0,
        roas: 0,
        contentOutput: output,
      },
      history: [],
    };
  }

  it('sums revenue, totalCost, contentOutput across units', () => {
    const agg = aggregateBusinessUnits([
      unit('ec', 100, 60, 5),
      unit('blog', 50, 20, 12),
    ]);
    expect(agg.revenue).toBe(150);
    expect(agg.totalCost).toBe(80);
    expect(agg.profit).toBe(70);
    expect(agg.profitMargin).toBeCloseTo((70 / 150) * 100, 6);
    expect(agg.contentOutput).toBe(17);
  });

  it('profitMargin is 0 when revenue is 0', () => {
    const agg = aggregateBusinessUnits([unit('ec', 0, 100, 0)]);
    expect(agg.revenue).toBe(0);
    expect(agg.profitMargin).toBe(0);
  });

  it('handles empty unit list (kills `revenue > 0` boundary)', () => {
    const agg = aggregateBusinessUnits([]);
    expect(agg.revenue).toBe(0);
    expect(agg.totalCost).toBe(0);
    expect(agg.profit).toBe(0);
    expect(agg.profitMargin).toBe(0);
    expect(agg.contentOutput).toBe(0);
  });
});

// --- fetchBusinessOpsSnapshot ----------------------------------------

describe('fetchBusinessOpsSnapshot', () => {
  it('returns 10 units + aggregate + isMock=true', async () => {
    const snap = await fetchBusinessOpsSnapshot({ token: '' });
    expect(snap.units).toHaveLength(BUSINESS_CATEGORIES.length);
    expect(snap.isMock).toBe(true);
    expect(snap.fetchedAt).toBe('2026-05-14T00:00:00.000Z');
    expect(snap.aggregate.revenue).toBeGreaterThan(0);
  });

  it('isMock is exactly true (kills `true` → `false` mutant)', async () => {
    const snap = await fetchBusinessOpsSnapshot({ token: '' });
    expect(snap.isMock).toBe(true);
  });

  it('uses injected data source via Impl', async () => {
    const snap = await fetchBusinessOpsSnapshotImpl(
      { token: '' },
      {
        dataSource: {
          async fetch() {
            return [];
          },
        },
      },
    );
    expect(snap.units).toHaveLength(0);
    expect(snap.aggregate.revenue).toBe(0);
  });

  it('aggregate matches the sum of unit currents', async () => {
    const snap = await fetchBusinessOpsSnapshot({ token: '' });
    const expectedRevenue = snap.units.reduce((acc, u) => acc + u.current.revenue, 0);
    expect(snap.aggregate.revenue).toBe(expectedRevenue);
    const expectedCost = snap.units.reduce((acc, u) => acc + u.current.totalCost, 0);
    expect(snap.aggregate.totalCost).toBe(expectedCost);
  });
});

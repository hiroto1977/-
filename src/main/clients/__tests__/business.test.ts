import { describe, expect, it, vi } from 'vitest';
import {
  ACTIONS,
  BUSINESS_CATEGORIES,
  BUSINESS_ADVISOR_DISCLAIMER,
  HISTORY_LENGTH,
  computeCategoryKpi,
  aggregateBusinessUnits,
  askBusinessAdvisorImpl,
  buildCategoryAnalysis,
  createMockBusinessOpsDataSource,
  fetchBusinessOpsSnapshot,
  fetchBusinessOpsSnapshotImpl,
  getCategoryDef,
  isBusinessCategoryId,
  validateBusinessAdvisorJson,
  type BusinessUnit,
  type BusinessCategoryId,
  type BusinessAdvisorRecommendation,
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

// --- buildCategoryAnalysis -----------------------------------------------

describe('buildCategoryAnalysis', () => {
  function fakeUnit(over: {
    history: { revenue: number }[];
    current?: Partial<BusinessUnit['current']>;
  }): BusinessUnit {
    const kpiBase = {
      revenue: 1000,
      variableCost: 500,
      fixedCost: 200,
      totalCost: 700,
      profit: 300,
      profitMargin: 30,
      traffic: 100,
      conversion: 5,
      conversionRatePct: 5,
      aov: 200,
      roas: 3,
      contentOutput: 4,
    };
    return {
      id: 'ec',
      label: 'EC',
      description: '',
      trafficKind: 'session',
      current: { ...kpiBase, ...over.current },
      history: over.history.map((h) => ({ ...kpiBase, revenue: h.revenue })),
    };
  }

  it('returns flat when history has < 2 points', () => {
    const a = buildCategoryAnalysis(fakeUnit({ history: [{ revenue: 1000 }] }));
    expect(a.revenueTrend).toBe('flat');
  });

  it('returns flat when first revenue is 0 (avoids divide-by-zero)', () => {
    const a = buildCategoryAnalysis(
      fakeUnit({ history: [{ revenue: 0 }, { revenue: 1000 }] }),
    );
    expect(a.revenueTrend).toBe('flat');
  });

  it('returns positive when last/first > 0.5%', () => {
    const a = buildCategoryAnalysis(
      fakeUnit({ history: [{ revenue: 1000 }, { revenue: 1010 }] }),
    );
    expect(a.revenueTrend).toBe('positive');
  });

  it('returns negative when last/first < -0.5%', () => {
    const a = buildCategoryAnalysis(
      fakeUnit({ history: [{ revenue: 1000 }, { revenue: 990 }] }),
    );
    expect(a.revenueTrend).toBe('negative');
  });

  it('returns flat when change is within ±0.5% band (kills boundary mutants)', () => {
    const a = buildCategoryAnalysis(
      fakeUnit({ history: [{ revenue: 1000 }, { revenue: 1002 }] }),
    );
    expect(a.revenueTrend).toBe('flat');
  });

  it('propagates label / current snapshot fields', () => {
    const a = buildCategoryAnalysis(
      fakeUnit({ history: [{ revenue: 1000 }, { revenue: 1010 }] }),
    );
    expect(a.label).toBe('EC');
    expect(a.revenue).toBe(1000);
    expect(a.profitMargin).toBe(30);
    expect(a.roas).toBe(3);
    expect(a.contentOutput).toBe(4);
  });
});

// --- validateBusinessAdvisorJson ----------------------------------------

describe('validateBusinessAdvisorJson', () => {
  const allowed = new Set<string>(['ec', 'blog', 'sns-ops']);

  function goodRec(over: Partial<{ categoryId: string; rank: number; rationale: string; actionItems: string[]; riskFactors: string[] }> = {}): unknown {
    return {
      categoryId: 'ec',
      rank: 1,
      rationale: '売上規模が最大かつ利益率も健全。CVR 改善余地が残っている。',
      actionItems: ['上位 SKU のクロスセル導線を追加', 'カート離脱率を A/B テストで 5% 削減'],
      riskFactors: ['物流費高騰リスク'],
      ...over,
    };
  }

  it('accepts a well-formed response within the allowed universe', () => {
    const out = validateBusinessAdvisorJson({ recommendations: [goodRec()] }, allowed);
    expect(out).toHaveLength(1);
    expect(out[0]!.categoryId).toBe('ec');
    expect(out[0]!.rank).toBe(1);
    expect(out[0]!.actionItems).toHaveLength(2);
    expect(out[0]!.riskFactors).toHaveLength(1);
  });

  it('rejects null / non-object root', () => {
    expect(() => validateBusinessAdvisorJson(null, allowed)).toThrow(/not an object/);
    expect(() => validateBusinessAdvisorJson('x', allowed)).toThrow(/not an object/);
    expect(() => validateBusinessAdvisorJson(42, allowed)).toThrow(/not an object/);
  });

  it('rejects missing recommendations', () => {
    expect(() => validateBusinessAdvisorJson({}, allowed)).toThrow(/missing recommendations/);
    expect(() => validateBusinessAdvisorJson({ recommendations: 'x' }, allowed)).toThrow(/missing recommendations/);
  });

  it('rejects empty recommendations array', () => {
    expect(() => validateBusinessAdvisorJson({ recommendations: [] }, allowed)).toThrow(/zero recommendations/);
  });

  it('rejects > 5 recommendations and accepts exactly 5 (boundary)', () => {
    const six = Array.from({ length: 6 }, () => goodRec());
    expect(() => validateBusinessAdvisorJson({ recommendations: six }, allowed)).toThrow(/exceeds 5/);
    const five = Array.from({ length: 5 }, (_, i) => goodRec({ rank: i + 1 }));
    const out = validateBusinessAdvisorJson({ recommendations: five }, allowed);
    expect(out).toHaveLength(5);
  });

  it('rejects null entry inside recommendations array', () => {
    expect(() =>
      validateBusinessAdvisorJson({ recommendations: [null] }, allowed),
    ).toThrow(/entry is not an object/);
  });

  it('rejects out-of-universe categoryId (anti-hallucination guard)', () => {
    expect(() =>
      validateBusinessAdvisorJson({ recommendations: [goodRec({ categoryId: 'unknown-biz' })] }, allowed),
    ).toThrow(/out-of-universe/);
  });

  it('rejects non-string categoryId', () => {
    expect(() =>
      validateBusinessAdvisorJson(
        { recommendations: [{ ...(goodRec() as object), categoryId: 42 }] },
        allowed,
      ),
    ).toThrow(/invalid or out-of-universe/);
  });

  it('rejects invalid rank values', () => {
    expect(() =>
      validateBusinessAdvisorJson({ recommendations: [goodRec({ rank: 0 })] }, allowed),
    ).toThrow(/invalid rank/);
    expect(() =>
      validateBusinessAdvisorJson({ recommendations: [goodRec({ rank: Number.NaN })] }, allowed),
    ).toThrow(/invalid rank/);
    expect(() =>
      validateBusinessAdvisorJson(
        { recommendations: [{ ...(goodRec() as object), rank: 'one' }] },
        allowed,
      ),
    ).toThrow(/invalid rank/);
  });

  it('rejects empty / oversized rationale', () => {
    expect(() =>
      validateBusinessAdvisorJson({ recommendations: [goodRec({ rationale: '' })] }, allowed),
    ).toThrow(/empty rationale/);
    expect(() =>
      validateBusinessAdvisorJson({ recommendations: [goodRec({ rationale: 'x'.repeat(601) })] }, allowed),
    ).toThrow(/exceeds 600/);
  });

  it('rejects missing / empty / oversized actionItems', () => {
    expect(() =>
      validateBusinessAdvisorJson({ recommendations: [goodRec({ actionItems: [] })] }, allowed),
    ).toThrow(/no actionItems/);
    expect(() =>
      validateBusinessAdvisorJson(
        { recommendations: [{ ...(goodRec() as object), actionItems: 'x' }] },
        allowed,
      ),
    ).toThrow(/no actionItems/);
    expect(() =>
      validateBusinessAdvisorJson(
        { recommendations: [goodRec({ actionItems: Array.from({ length: 6 }, () => 'x') })] },
        allowed,
      ),
    ).toThrow(/actionItems exceeds 5/);
  });

  it('rejects malformed actionItem entries', () => {
    expect(() =>
      validateBusinessAdvisorJson({ recommendations: [goodRec({ actionItems: [''] })] }, allowed),
    ).toThrow(/actionItem entry/);
    expect(() =>
      validateBusinessAdvisorJson(
        { recommendations: [goodRec({ actionItems: ['x'.repeat(241)] })] },
        allowed,
      ),
    ).toThrow(/actionItem entry/);
    expect(() =>
      validateBusinessAdvisorJson(
        { recommendations: [{ ...(goodRec() as object), actionItems: [42] }] },
        allowed,
      ),
    ).toThrow(/actionItem entry/);
  });

  it('rejects missing / empty / oversized riskFactors', () => {
    expect(() =>
      validateBusinessAdvisorJson({ recommendations: [goodRec({ riskFactors: [] })] }, allowed),
    ).toThrow(/no riskFactors/);
    expect(() =>
      validateBusinessAdvisorJson(
        { recommendations: [{ ...(goodRec() as object), riskFactors: 'x' }] },
        allowed,
      ),
    ).toThrow(/no riskFactors/);
    expect(() =>
      validateBusinessAdvisorJson(
        { recommendations: [goodRec({ riskFactors: ['a', 'b', 'c', 'd'] })] },
        allowed,
      ),
    ).toThrow(/riskFactors exceeds 3/);
  });

  it('rejects malformed riskFactor entries', () => {
    expect(() =>
      validateBusinessAdvisorJson({ recommendations: [goodRec({ riskFactors: [''] })] }, allowed),
    ).toThrow(/riskFactor entry/);
    expect(() =>
      validateBusinessAdvisorJson(
        { recommendations: [goodRec({ riskFactors: ['x'.repeat(241)] })] },
        allowed,
      ),
    ).toThrow(/riskFactor entry/);
    expect(() =>
      validateBusinessAdvisorJson(
        { recommendations: [{ ...(goodRec() as object), riskFactors: [42] }] },
        allowed,
      ),
    ).toThrow(/riskFactor entry/);
  });
});

// --- askBusinessAdvisorImpl --------------------------------------------

describe('askBusinessAdvisorImpl', () => {
  function mockResponse(payload: unknown, ok = true, status = 200): Response {
    return {
      ok,
      status,
      async text() {
        return ok ? '' : JSON.stringify(payload);
      },
      async json() {
        return payload;
      },
    } as Response;
  }

  function llmReply(recs: BusinessAdvisorRecommendation[]): unknown {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ recommendations: recs }),
        },
      ],
    };
  }

  const goodRec: BusinessAdvisorRecommendation = {
    categoryId: 'ec',
    rank: 1,
    rationale: '売上規模が最大、CVR 改善余地あり。',
    actionItems: ['ABテスト追加'],
    riskFactors: ['物流費高騰'],
  };

  it('happy path: validates LLM JSON and returns recommendations + disclaimer', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockResponse(llmReply([goodRec])));
    const out = await askBusinessAdvisorImpl({
      token: 'sk-ant-test',
      fetch: fetchMock,
      payload: { question: '次に注力すべき事業は?' },
    });
    expect(out.recommendations).toHaveLength(1);
    expect(out.recommendations[0]!.categoryId).toBe('ec');
    expect(out.disclaimer).toBe(BUSINESS_ADVISOR_DISCLAIMER);
    expect(out.notForRealMoney).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0]![0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
  });

  it('sends question + analyses + categoryId allowlist in the prompt', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockResponse(llmReply([goodRec])));
    await askBusinessAdvisorImpl({
      token: 'sk-ant-test',
      fetch: fetchMock,
      payload: { question: 'EC を伸ばすには?' },
    });
    const init = fetchMock.mock.calls[0]![1]!;
    const body = JSON.parse(init.body as string) as {
      system: string;
      messages: { role: string; content: string }[];
    };
    expect(body.system).toContain('"ec"');
    expect(body.system).toContain('"sns-ops"');
    expect(body.system).toContain('JSON スキーマで応答');
    expect(body.messages[0]!.content).toContain('EC を伸ばすには');
  });

  it('rejects missing or non-string question', async () => {
    await expect(
      askBusinessAdvisorImpl({ token: 't', payload: {} }),
    ).rejects.toThrow(/question is required/);
    await expect(
      askBusinessAdvisorImpl({ token: 't', payload: { question: 42 } }),
    ).rejects.toThrow(/question is required/);
  });

  it('rejects oversize / control-char question', async () => {
    await expect(
      askBusinessAdvisorImpl({ token: 't', payload: { question: 'x'.repeat(1001) } }),
    ).rejects.toThrow(/exceeds 1000/);
    await expect(
      askBusinessAdvisorImpl({ token: 't', payload: { question: 'a\nb' } }),
    ).rejects.toThrow(/control characters/);
  });

  it('rejects unknown categoryId in user-supplied categories', async () => {
    await expect(
      askBusinessAdvisorImpl({
        token: 't',
        payload: { question: 'q', categories: ['ec', 'not-real'] },
      }),
    ).rejects.toThrow(/unknown id: not-real/);
  });

  it('rejects empty categories array', async () => {
    await expect(
      askBusinessAdvisorImpl({
        token: 't',
        payload: { question: 'q', categories: [] },
      }),
    ).rejects.toThrow(/categories is empty/);
  });

  it('uses default model + max_tokens when not provided', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockResponse(llmReply([goodRec])));
    await askBusinessAdvisorImpl({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q' },
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as { model: string; max_tokens: number };
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.max_tokens).toBe(1500);
  });

  it('respects custom model + max_tokens overrides', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockResponse(llmReply([goodRec])));
    await askBusinessAdvisorImpl({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q', model: 'claude-opus-4-7', maxTokens: 2000 },
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as { model: string; max_tokens: number };
    expect(body.model).toBe('claude-opus-4-7');
    expect(body.max_tokens).toBe(2000);
  });

  it('falls back to default when model is empty string or maxTokens is 0 / NaN', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockResponse(llmReply([goodRec])));
    await askBusinessAdvisorImpl({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q', model: '', maxTokens: 0 },
    });
    const body1 = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as { model: string; max_tokens: number };
    expect(body1.model).toBe('claude-sonnet-4-6');
    expect(body1.max_tokens).toBe(1500);
    fetchMock.mockResolvedValueOnce(mockResponse(llmReply([goodRec])));
    await askBusinessAdvisorImpl({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q', maxTokens: Number.NaN },
    });
    const body2 = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string) as { max_tokens: number };
    expect(body2.max_tokens).toBe(1500);
  });

  it('throws on HTTP non-2xx response', async () => {
    const errorResp = {
      ok: false,
      status: 429,
      async text() {
        return 'rate limited';
      },
      async json() {
        return {};
      },
    } as Response;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(errorResp);
    await expect(
      askBusinessAdvisorImpl({ token: 't', fetch: fetchMock, payload: { question: 'q' } }),
    ).rejects.toThrow(/business-advisor 429/);
  });

  it('throws when LLM returns no text content block', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockResponse({ content: [] }));
    await expect(
      askBusinessAdvisorImpl({ token: 't', fetch: fetchMock, payload: { question: 'q' } }),
    ).rejects.toThrow(/no text content/);
  });

  it('throws when LLM text is not valid JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockResponse({ content: [{ type: 'text', text: 'not-json{' }] }),
    );
    await expect(
      askBusinessAdvisorImpl({ token: 't', fetch: fetchMock, payload: { question: 'q' } }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it('propagates validator errors (e.g. hallucinated categoryId)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      mockResponse(
        llmReply([{ ...goodRec, categoryId: 'fake-biz' as BusinessCategoryId }]),
      ),
    );
    await expect(
      askBusinessAdvisorImpl({ token: 't', fetch: fetchMock, payload: { question: 'q' } }),
    ).rejects.toThrow(/out-of-universe/);
  });

  it('honors injected dataSource (filters analyses to caller-allowed categories)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockResponse(llmReply([goodRec])));
    await askBusinessAdvisorImpl(
      {
        token: 't',
        fetch: fetchMock,
        payload: { question: 'q', categories: ['ec', 'blog'] },
      },
      {
        dataSource: {
          async fetch() {
            return [
              {
                id: 'ec',
                label: 'EC',
                description: '',
                trafficKind: 'session',
                current: {
                  revenue: 1, variableCost: 0, fixedCost: 0, totalCost: 0,
                  profit: 1, profitMargin: 100, traffic: 1, conversion: 1,
                  conversionRatePct: 100, aov: 1, roas: 1, contentOutput: 1,
                },
                history: [],
              },
            ];
          },
        },
      },
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      messages: { content: string }[];
    };
    // The analyses array sent to the LLM should only contain entries
    // whose id is in the caller-supplied allowlist.
    expect(body.messages[0]!.content).toContain('"categoryId":"ec"');
    expect(body.messages[0]!.content).not.toContain('"categoryId":"sns-ops"');
  });
});

// --- Mutation-kill: boundary + invariant pins ---------------------------

describe('business advisor boundary pins', () => {
  const allowed = new Set<string>(['ec']);
  function rec(over: Partial<{ rationale: string; actionItems: string[]; riskFactors: string[] }> = {}): unknown {
    return {
      categoryId: 'ec',
      rank: 1,
      rationale: 'rationale text',
      actionItems: ['act'],
      riskFactors: ['risk'],
      ...over,
    };
  }

  it('rationale length = 600 (boundary) is accepted; 601 rejected', () => {
    const at = validateBusinessAdvisorJson({ recommendations: [rec({ rationale: 'x'.repeat(600) })] }, allowed);
    expect(at[0]!.rationale).toHaveLength(600);
    expect(() =>
      validateBusinessAdvisorJson({ recommendations: [rec({ rationale: 'x'.repeat(601) })] }, allowed),
    ).toThrow(/exceeds 600/);
  });

  it('actionItems length = 5 (boundary) accepted; 6 rejected', () => {
    const at = validateBusinessAdvisorJson(
      { recommendations: [rec({ actionItems: Array.from({ length: 5 }, () => 'x') })] },
      allowed,
    );
    expect(at[0]!.actionItems).toHaveLength(5);
    expect(() =>
      validateBusinessAdvisorJson(
        { recommendations: [rec({ actionItems: Array.from({ length: 6 }, () => 'x') })] },
        allowed,
      ),
    ).toThrow(/actionItems exceeds 5/);
  });

  it('actionItem entry length = 240 accepted; 241 rejected', () => {
    const at = validateBusinessAdvisorJson(
      { recommendations: [rec({ actionItems: ['x'.repeat(240)] })] },
      allowed,
    );
    expect(at[0]!.actionItems[0]).toHaveLength(240);
    expect(() =>
      validateBusinessAdvisorJson(
        { recommendations: [rec({ actionItems: ['x'.repeat(241)] })] },
        allowed,
      ),
    ).toThrow(/actionItem entry/);
  });

  it('riskFactors length = 3 (boundary) accepted; 4 rejected', () => {
    const at = validateBusinessAdvisorJson(
      { recommendations: [rec({ riskFactors: ['a', 'b', 'c'] })] },
      allowed,
    );
    expect(at[0]!.riskFactors).toHaveLength(3);
    expect(() =>
      validateBusinessAdvisorJson(
        { recommendations: [rec({ riskFactors: ['a', 'b', 'c', 'd'] })] },
        allowed,
      ),
    ).toThrow(/riskFactors exceeds 3/);
  });

  it('riskFactor entry length = 240 accepted; 241 rejected', () => {
    const at = validateBusinessAdvisorJson(
      { recommendations: [rec({ riskFactors: ['x'.repeat(240)] })] },
      allowed,
    );
    expect(at[0]!.riskFactors[0]).toHaveLength(240);
    expect(() =>
      validateBusinessAdvisorJson(
        { recommendations: [rec({ riskFactors: ['x'.repeat(241)] })] },
        allowed,
      ),
    ).toThrow(/riskFactor entry/);
  });

  it('question length = 1000 accepted; 1001 rejected', async () => {
    // 1001 already covered above; 1000 must reach the fetch — assert that.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      async text() {
        return '';
      },
      async json() {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                recommendations: [
                  {
                    categoryId: 'ec',
                    rank: 1,
                    rationale: 'r',
                    actionItems: ['a'],
                    riskFactors: ['x'],
                  },
                ],
              }),
            },
          ],
        };
      },
    } as Response);
    await askBusinessAdvisorImpl({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q'.repeat(1000) },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('disclaimer equals the exact 3-part concatenation (kills any StringLiteral mutation in initializer)', async () => {
    // Disclaimer initialization runs at module load. To make Stryker's
    // perTest coverage tracker associate this test with the mutated line,
    // we route through askBusinessAdvisorImpl which reads the const at
    // call time (`disclaimer: BUSINESS_ADVISOR_DISCLAIMER` in the return
    // expression is touched per-call, so the test->line link is recorded).
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      async text() {
        return '';
      },
      async json() {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                recommendations: [
                  {
                    categoryId: 'ec',
                    rank: 1,
                    rationale: 'r',
                    actionItems: ['a'],
                    riskFactors: ['x'],
                  },
                ],
              }),
            },
          ],
        };
      },
    } as Response);
    const out = await askBusinessAdvisorImpl({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q' },
    });
    expect(out.disclaimer).toBe(
      '本機能は経営判断の補助情報であり、投資助言・財務助言ではありません。' +
        '数値は模擬データに基づくシミュレーションです。' +
        '実際の経営判断はご自身の責任で行ってください。',
    );
    // And the exported constant matches.
    expect(BUSINESS_ADVISOR_DISCLAIMER).toBe(out.disclaimer);
  });

  it('request headers include the Anthropic auth + version headers (kills ObjectLiteral)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      async text() {
        return '';
      },
      async json() {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                recommendations: [
                  {
                    categoryId: 'ec',
                    rank: 1,
                    rationale: 'r',
                    actionItems: ['a'],
                    riskFactors: ['x'],
                  },
                ],
              }),
            },
          ],
        };
      },
    } as Response);
    await askBusinessAdvisorImpl({
      token: 'sk-ant-XYZ',
      fetch: fetchMock,
      payload: { question: 'q' },
    });
    const init = fetchMock.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-XYZ');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['content-type']).toBe('application/json');
  });

  it('filters analyses to caller-supplied categories (kills filter MethodExpression)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      async text() {
        return '';
      },
      async json() {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                recommendations: [
                  {
                    categoryId: 'ec',
                    rank: 1,
                    rationale: 'r',
                    actionItems: ['a'],
                    riskFactors: ['x'],
                  },
                ],
              }),
            },
          ],
        };
      },
    } as Response);
    const kpiBase = {
      revenue: 1, variableCost: 0, fixedCost: 0, totalCost: 0,
      profit: 1, profitMargin: 100, traffic: 1, conversion: 1,
      conversionRatePct: 100, aov: 1, roas: 1, contentOutput: 1,
    };
    await askBusinessAdvisorImpl(
      {
        token: 't',
        fetch: fetchMock,
        payload: { question: 'q', categories: ['ec'] },
      },
      {
        dataSource: {
          async fetch() {
            // Two units returned by the data source. Only 'ec' is in the
            // caller's allowlist; the filter must remove 'blog'.
            return [
              {
                id: 'ec',
                label: 'EC',
                description: '',
                trafficKind: 'session',
                current: kpiBase,
                history: [],
              },
              {
                id: 'blog',
                label: 'Blog',
                description: '',
                trafficKind: 'view',
                current: kpiBase,
                history: [],
              },
            ];
          },
        },
      },
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      messages: { content: string }[];
    };
    const userContent = body.messages[0]!.content;
    expect(userContent).toContain('"categoryId":"ec"');
    expect(userContent).not.toContain('"categoryId":"blog"');
  });

  it('truncates HTTP error body to first 200 chars (kills body.slice MethodExpression)', async () => {
    const longBody = 'x'.repeat(250) + 'SECRET';
    const errResp = {
      ok: false,
      status: 500,
      async text() {
        return longBody;
      },
      async json() {
        return {};
      },
    } as Response;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(errResp);
    await expect(
      askBusinessAdvisorImpl({ token: 't', fetch: fetchMock, payload: { question: 'q' } }),
    ).rejects.toThrow(
      // The error message must contain only the first 200 chars of the body —
      // the trailing "SECRET" sentinel after 250 chars must NOT appear.
      /^business-advisor 500: x{200}$/,
    );
  });

  it('ACTIONS.advise is callable through the public action map (kills ObjectLiteral)', async () => {
    expect(typeof ACTIONS.advise).toBe('function');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      async text() {
        return '';
      },
      async json() {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                recommendations: [
                  {
                    categoryId: 'ec',
                    rank: 1,
                    rationale: 'r',
                    actionItems: ['a'],
                    riskFactors: ['x'],
                  },
                ],
              }),
            },
          ],
        };
      },
    } as Response);
    const result = await ACTIONS.advise!({
      token: 't',
      fetch: fetchMock,
      payload: { question: 'q' },
    });
    expect(result).toMatchObject({ notForRealMoney: true });
  });
});

import { describe, expect, it } from 'vitest';
import { buildManagementHighlights } from '../managementHighlights';
import { buildBusinessOverview } from '../overview';
import type { KpiActual } from '../kpiActuals';

const kpi = (over: Partial<KpiActual> = {}): KpiActual => ({
  period: '2026-05', unit: '全社', revenue: 1_000_000, cogs: 400_000, advertising: 100_000, sga: 200_000, depreciation: 50_000, ...over,
});

describe('buildManagementHighlights', () => {
  it('returns no highlights when there is no data', () => {
    const o = buildBusinessOverview({ plan: 'free', sales: [], kpiActuals: [], members: [] });
    expect(buildManagementHighlights(o)).toEqual([]);
  });

  it('flags an operating loss as critical', () => {
    const loss = kpi({ revenue: 100_000, cogs: 90_000, advertising: 40_000, sga: 30_000, depreciation: 0 });
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [loss], members: [] });
    const hs = buildManagementHighlights(o);
    const op = hs.find((h) => h.category === '収益性');
    expect(op?.severity).toBe('critical');
    expect(op?.message).toContain('営業赤字');
  });

  it('flags insolvency (negative net assets) as critical', () => {
    const o = buildBusinessOverview({
      plan: 'pro', sales: [], kpiActuals: [kpi()], members: [],
      balanceSheet: {
        asOf: '2026-03-31', currentAssets: 1000, inventory: 0, accountsReceivable: 0, fixedAssets: 1000,
        currentLiabilities: 2000, accountsPayable: 0, fixedLiabilities: 1000, netIncome: -500,
      },
    });
    const fp = buildManagementHighlights(o).find((h) => h.category === '財政状態');
    expect(fp?.severity).toBe('critical');
    expect(fp?.message).toContain('債務超過');
  });

  it('sorts critical findings ahead of warnings and good news', () => {
    const loss = kpi({ revenue: 100_000, cogs: 90_000, advertising: 40_000, sga: 30_000, depreciation: 0 });
    const o = buildBusinessOverview({
      plan: 'free', // 1 seat → seatsFull warning
      sales: [], kpiActuals: [loss], members: [{ role: 'owner' }],
    });
    const hs = buildManagementHighlights(o);
    expect(hs.length).toBeGreaterThan(1);
    expect(hs[0]!.severity).toBe('critical');
    // severities are non-decreasing in priority order
    const order = { critical: 0, warning: 1, good: 2 } as const;
    for (let i = 1; i < hs.length; i += 1) {
      expect(order[hs[i]!.severity]).toBeGreaterThanOrEqual(order[hs[i - 1]!.severity]);
    }
  });

  it('flags a short cash runway as critical and cash burn as a warning', () => {
    const o = buildBusinessOverview({
      plan: 'pro', sales: [], kpiActuals: [kpi()], members: [],
      accounting: [
        { month: '2026-04', income: 1_000_000, expense: 1_300_000, net: -300_000 },
        { month: '2026-05', income: 1_000_000, expense: 1_300_000, net: -300_000 },
      ],
      balanceSheet: {
        asOf: '2026-05-31', currentAssets: 900_000, cash: 900_000, inventory: 0, accountsReceivable: 0,
        fixedAssets: 0, currentLiabilities: 0, accountsPayable: 0, fixedLiabilities: 0, netIncome: 0,
      },
    });
    // 900,000 / 300,000 = 3 months → critical
    const cashflow = buildManagementHighlights(o).filter((h) => h.category === '資金繰り');
    expect(cashflow.some((h) => h.severity === 'critical' && h.message.includes('ランウェイ'))).toBe(true);
    expect(cashflow.some((h) => h.severity === 'warning' && h.message.includes('資金流出'))).toBe(true);
  });

  it('flags a sub-1.0 DSCR (passed explicitly) as critical', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi()], members: [] });
    const hs = buildManagementHighlights(o, 0.8);
    const d = hs.find((h) => h.category === '返済余力');
    expect(d?.severity).toBe('critical');
    expect(d?.message).toContain('DSCR');
  });

  it('does not emit a DSCR finding when none is supplied', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi()], members: [] });
    expect(buildManagementHighlights(o).some((h) => h.category === '返済余力')).toBe(false);
  });

  it('surfaces a budget shortfall as a warning', () => {
    const budget: KpiActual[] = [kpi({ revenue: 2_000_000 })]; // actual 1,000,000 → 50%
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi()], kpiBudgets: budget, members: [] });
    const bva = buildManagementHighlights(o).find((h) => h.category === '予実');
    expect(bva?.severity).toBe('warning');
    expect(bva?.message).toContain('予算未達');
  });

  it('warns about single-channel revenue concentration', () => {
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [
        { date: '2026-05-01', channel: 'amazon', amount: 900_000, orders: 90 },
        { date: '2026-05-02', channel: 'shopify', amount: 100_000, orders: 10 },
      ],
      kpiActuals: [kpi()], members: [],
    });
    const conc = buildManagementHighlights(o).find((h) => h.category === '売上集中');
    expect(conc?.severity).toBe('warning');
    expect(conc?.message).toContain('集中');
  });

  it('escalates a 3+ period revenue decline to critical', () => {
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      kpiActuals: [
        kpi({ period: '2026-02', revenue: 2_000_000 }),
        kpi({ period: '2026-03', revenue: 1_500_000 }),
        kpi({ period: '2026-04', revenue: 1_200_000 }),
        kpi({ period: '2026-05', revenue: 1_000_000 }),
      ],
      members: [],
    });
    const trend = buildManagementHighlights(o).find((h) => h.category === '売上トレンド');
    expect(trend?.severity).toBe('critical');
    expect(trend?.message).toContain('連続');
  });

  it('respects a custom decline-streak threshold (suppresses below it)', () => {
    // 2-period revenue decline; default would warn, but raise warn threshold to 3 → suppressed
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      kpiActuals: [
        kpi({ period: '2026-03', revenue: 2_000_000 }),
        kpi({ period: '2026-04', revenue: 1_500_000 }),
        kpi({ period: '2026-05', revenue: 1_000_000 }),
      ],
      members: [],
    });
    const def = buildManagementHighlights(o).find((h) => h.category === '売上トレンド');
    expect(def?.severity).toBe('warning'); // 2-period decline at default threshold 2
    const tuned = buildManagementHighlights(o, { thresholds: { declineWarnStreak: 3, declineCriticalStreak: 4 } });
    expect(tuned.find((h) => h.category === '売上トレンド')).toBeUndefined();
  });

  it('still accepts the legacy numeric DSCR argument (back-compat)', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi()], members: [] });
    const hs = buildManagementHighlights(o, 0.8);
    expect(hs.find((h) => h.category === '返済余力')?.severity).toBe('critical');
  });

  it('accepts DSCR via the options object form', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi()], members: [] });
    const hs = buildManagementHighlights(o, { overallDscr: 0.8 });
    expect(hs.find((h) => h.category === '返済余力')?.severity).toBe('critical');
  });
});

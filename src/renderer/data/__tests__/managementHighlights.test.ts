import { describe, expect, it } from 'vitest';
import {
  buildManagementHighlights,
  summarizeHighlights,
  RISK_BAND_LABEL,
  DEFAULT_HIGHLIGHT_THRESHOLDS,
  type Highlight,
} from '../managementHighlights';
import { buildBusinessOverview, type BusinessOverview } from '../overview';
import type { KpiActual } from '../kpiActuals';

/**
 * Direct BusinessOverview builder exposing only the fields buildManagementHighlights reads,
 * defaulted so that NO highlight fires; each test overrides to trigger exactly one branch at
 * its boundary. Cast through unknown since the unrelated overview fields are irrelevant here.
 */
const mkOv = (p: any = {}): BusinessOverview => ({
  plan: { tier: 'pro', label: 'Pro', audience: '' },
  kpi: { hasData: true, operatingProfit: 100, operatingMarginPct: 5, revenue: 1000, safetyMargin: 50, revenueGrowthPct: null, ...p.kpi },
  trendAlerts: {
    revenue: { streak: 0, dropFromPeakPct: null, ...p.revStreak },
    operatingProfit: { streak: 0, dropFromPeakPct: null, ...p.opStreak },
  },
  productivity: { labor: { laborSharePct: null, ...p.labor } },
  budget: 'budget' in p ? p.budget : null,
  financialPosition: 'fp' in p ? p.fp : null,
  workingCapital: 'wc' in p ? p.wc : null,
  accounting: 'accounting' in p ? p.accounting : null,
  runwayMonths: 'runwayMonths' in p ? p.runwayMonths : null,
  sales: { concentration: 'concentration' in p ? p.concentration : null },
  flags: { seatsFull: p.seatsFull ?? false },
} as any as BusinessOverview);

const kpi = (over: Partial<KpiActual> = {}): KpiActual => ({
  period: '2026-05', unit: '全社', revenue: 1_000_000, cogs: 400_000, advertising: 100_000, sga: 200_000, depreciation: 50_000, ...over,
});
/** Find the highlight for a category (or undefined). */
const cat = (hs: Highlight[], c: string) => hs.find((h) => h.category === c);

describe('buildManagementHighlights — empty / structural', () => {
  it('returns no highlights when there is no data', () => {
    const o = buildBusinessOverview({ plan: 'free', sales: [], kpiActuals: [], members: [] });
    expect(buildManagementHighlights(o)).toEqual([]);
  });

  it('exposes the default thresholds', () => {
    expect(DEFAULT_HIGHLIGHT_THRESHOLDS).toEqual({
      declineWarnStreak: 2, declineCriticalStreak: 3, laborShareWarnPct: 60, singleChannelWarnPct: 60,
    });
  });

  it('sorts critical → warning → good (severity priority)', () => {
    const loss = kpi({ revenue: 100_000, cogs: 90_000, advertising: 40_000, sga: 30_000, depreciation: 0 });
    const hs = buildManagementHighlights(
      buildBusinessOverview({ plan: 'free', sales: [], kpiActuals: [loss], members: [{ role: 'owner' }] }),
    );
    const order = { critical: 0, warning: 1, good: 2 } as const;
    for (let i = 1; i < hs.length; i += 1) {
      expect(order[hs[i]!.severity]).toBeGreaterThanOrEqual(order[hs[i - 1]!.severity]);
    }
    expect(hs[0]!.severity).toBe('critical');
  });
});

describe('buildManagementHighlights — 収益性 (profitability)', () => {
  it('flags an operating loss as critical (operatingProfit < 0)', () => {
    const loss = kpi({ revenue: 100_000, cogs: 90_000, advertising: 40_000, sga: 30_000, depreciation: 0 });
    const h = cat(buildManagementHighlights(buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [loss], members: [] })), '収益性');
    expect(h).toMatchObject({ severity: 'critical' });
    expect(h!.message).toContain('営業赤字');
  });

  it('praises a healthy operating margin (>= 10%) as good', () => {
    // default kpi → operatingProfit 250k / margin 25% → good
    const h = cat(buildManagementHighlights(buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi()], members: [] })), '収益性');
    expect(h).toMatchObject({ severity: 'good' });
    expect(h!.message).toContain('営業利益率');
  });

  it('does not praise a thin margin just below 10% (>= strict)', () => {
    // operatingProfit > 0 but margin < 10: rev 1,000,000, contribution 250k, fixed 200k → opProfit 50k (5%)
    const thin = kpi({ revenue: 1_000_000, cogs: 600_000, advertising: 150_000, sga: 200_000, depreciation: 0 });
    const h = cat(buildManagementHighlights(buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [thin], members: [] })), '収益性');
    expect(h).toBeUndefined(); // neither loss nor >=10% margin
  });
});

describe('buildManagementHighlights — 安全性 (break-even safety)', () => {
  it('warns when the safety margin is below 10%', () => {
    // contribution 500k, fixed 470k → bep 940k, safetyMargin 6%, opProfit 30k (margin 3%)
    const k = kpi({ revenue: 1_000_000, cogs: 400_000, advertising: 100_000, sga: 470_000, depreciation: 0 });
    const h = cat(buildManagementHighlights(buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [k], members: [] })), '安全性');
    expect(h).toMatchObject({ severity: 'warning' });
    expect(h!.message).toContain('安全余裕率');
  });
});

describe('buildManagementHighlights — 成長性 (growth)', () => {
  const series = (p2Rev: number) => buildBusinessOverview({
    plan: 'pro', sales: [],
    kpiActuals: [kpi({ period: '2026-04', revenue: 1_000_000 }), kpi({ period: '2026-05', revenue: p2Rev })],
    members: [],
  });
  it('warns on a revenue decline (growth < 0)', () => {
    const h = cat(buildManagementHighlights(series(900_000)), '成長性');
    expect(h).toMatchObject({ severity: 'warning' });
    expect(h!.message).toContain('減収');
  });
  it('praises strong growth (>= 10%)', () => {
    const h = cat(buildManagementHighlights(series(1_200_000)), '成長性');
    expect(h).toMatchObject({ severity: 'good' });
    expect(h!.message).toContain('伸びて');
  });
  it('stays silent for flat-to-modest growth (0 ≤ growth < 10)', () => {
    expect(cat(buildManagementHighlights(series(1_050_000)), '成長性')).toBeUndefined();
  });
});

describe('buildManagementHighlights — トレンド (decline streaks)', () => {
  const decline = (revs: number[]) => buildBusinessOverview({
    plan: 'pro', sales: [],
    kpiActuals: revs.map((r, i) => kpi({ period: `2026-0${i + 1}`, revenue: r })),
    members: [],
  });
  it('warns on a 2-period revenue decline and escalates a 3-period one to critical', () => {
    expect(cat(buildManagementHighlights(decline([2_000_000, 1_500_000, 1_000_000])), '売上トレンド')).toMatchObject({ severity: 'warning' });
    const crit = cat(buildManagementHighlights(decline([3_000_000, 2_000_000, 1_500_000, 1_000_000])), '売上トレンド');
    expect(crit).toMatchObject({ severity: 'critical' });
    expect(crit!.message).toContain('連続');
  });
  it('honours custom decline-streak thresholds', () => {
    const o = decline([2_000_000, 1_500_000, 1_000_000]); // 2-period decline
    expect(cat(buildManagementHighlights(o, { thresholds: { declineWarnStreak: 3, declineCriticalStreak: 4 } }), '売上トレンド')).toBeUndefined();
  });
});

describe('buildManagementHighlights — 予実 (budget variance)', () => {
  it('warns on a budget shortfall (< 90%) and praises hitting target (>= 100%)', () => {
    const under = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi()], kpiBudgets: [kpi({ revenue: 2_000_000 })], members: [] });
    expect(cat(buildManagementHighlights(under), '予実')).toMatchObject({ severity: 'warning', message: expect.stringContaining('予算未達') });
    const hit = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi()], kpiBudgets: [kpi({ revenue: 800_000 })], members: [] });
    expect(cat(buildManagementHighlights(hit), '予実')).toMatchObject({ severity: 'good', message: expect.stringContaining('達成') });
  });
});

describe('buildManagementHighlights — 財政状態 (balance sheet)', () => {
  const bs = (over: Record<string, number | string>) => buildBusinessOverview({
    plan: 'pro', sales: [], kpiActuals: [kpi()], members: [],
    balanceSheet: { asOf: '2026-03-31', currentAssets: 1000, inventory: 0, accountsReceivable: 0, fixedAssets: 1000, currentLiabilities: 500, accountsPayable: 0, fixedLiabilities: 200, netIncome: 0, ...over },
  });
  it('flags insolvency (negative net assets) as critical', () => {
    const h = cat(buildManagementHighlights(bs({ currentAssets: 1000, fixedAssets: 1000, currentLiabilities: 2000, fixedLiabilities: 1000, netIncome: -500 })), '財政状態');
    expect(h).toMatchObject({ severity: 'critical', message: expect.stringContaining('債務超過') });
  });
  it('warns on a low equity ratio (< 20%)', () => {
    // assets 2000, liabilities 1700 → equity 300 → 15%
    const hs = buildManagementHighlights(bs({ currentAssets: 1000, fixedAssets: 1000, currentLiabilities: 1500, fixedLiabilities: 200 }));
    expect(hs.some((h) => h.category === '財政状態' && h.message.includes('自己資本比率'))).toBe(true);
  });
  it('warns on a low current ratio (< 100%)', () => {
    // currentAssets 1000 < currentLiabilities 1500 → 66.7%
    const hs = buildManagementHighlights(bs({ currentAssets: 1000, currentLiabilities: 1500, fixedAssets: 5000, fixedLiabilities: 0 }));
    expect(hs.some((h) => h.category === '財政状態' && h.message.includes('流動比率'))).toBe(true);
  });
});

describe('buildManagementHighlights — 資金繰り (cash) & 返済余力 (DSCR)', () => {
  it('warns on negative average monthly operating cashflow', () => {
    const o = buildBusinessOverview({
      plan: 'pro', sales: [], kpiActuals: [kpi()], members: [],
      accounting: [{ month: '2026-05', income: 1_000_000, expense: 1_300_000, net: -300_000 }],
    });
    expect(buildManagementHighlights(o).some((h) => h.category === '資金繰り' && h.severity === 'warning' && h.message.includes('資金流出'))).toBe(true);
  });
  it('praises positive operating cashflow as good', () => {
    const o = buildBusinessOverview({
      plan: 'pro', sales: [], kpiActuals: [kpi()], members: [],
      accounting: [{ month: '2026-05', income: 1_300_000, expense: 1_000_000, net: 300_000 }],
    });
    expect(buildManagementHighlights(o).some((h) => h.category === '資金繰り' && h.severity === 'good' && h.message.includes('黒字'))).toBe(true);
  });
  it('flags a sub-1.0 DSCR as critical and praises a strong (>= 1.5) DSCR', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi()], members: [] });
    expect(cat(buildManagementHighlights(o, 0.8), '返済余力')).toMatchObject({ severity: 'critical', message: expect.stringContaining('DSCR') });
    expect(cat(buildManagementHighlights(o, { overallDscr: 1.5 }), '返済余力')).toMatchObject({ severity: 'good' });
    expect(cat(buildManagementHighlights(o), '返済余力')).toBeUndefined(); // none supplied
  });
});

describe('buildManagementHighlights — 利益トレンド / 生産性 / 運転資金 / ランウェイ', () => {
  it('escalates a 3-period operating-profit decline to critical (利益トレンド)', () => {
    const o = buildBusinessOverview({
      plan: 'pro', sales: [],
      kpiActuals: [
        kpi({ period: '2026-02', revenue: 3_000_000 }),
        kpi({ period: '2026-03', revenue: 2_000_000 }),
        kpi({ period: '2026-04', revenue: 1_500_000 }),
        kpi({ period: '2026-05', revenue: 1_000_000 }),
      ],
      members: [],
    });
    const h = cat(buildManagementHighlights(o), '利益トレンド');
    expect(h).toMatchObject({ severity: 'critical', message: expect.stringContaining('営業利益') });
  });

  it('warns on a high labor share (> 60%) (生産性)', () => {
    // gross = rev - cogs = 200k, laborCost 150k → laborShare 75% > 60
    const k = kpi({ revenue: 1_000_000, cogs: 800_000, advertising: 50_000, sga: 200_000, depreciation: 0, laborCost: 150_000 });
    const h = cat(buildManagementHighlights(buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [k], members: [] })), '生産性');
    expect(h).toMatchObject({ severity: 'warning', message: expect.stringContaining('労働分配率') });
  });

  it('warns on a long CCC (> 60 days) and praises a non-positive CCC (運転資金)', () => {
    // 高い売上債権/棚卸・低い仕入債務 → CCC 長い
    const long = buildBusinessOverview({
      plan: 'pro', sales: [], kpiActuals: [kpi()], members: [],
      balanceSheet: { asOf: '2026-05-31', currentAssets: 900_000, inventory: 300_000, accountsReceivable: 400_000, fixedAssets: 0, currentLiabilities: 100_000, accountsPayable: 50_000, fixedLiabilities: 0, netIncome: 0 },
    });
    expect(cat(buildManagementHighlights(long), '運転資金')).toMatchObject({ severity: 'warning', message: expect.stringContaining('CCC') });
    // 低い債権/棚卸・高い仕入債務 → CCC <= 0
    const neg = buildBusinessOverview({
      plan: 'pro', sales: [], kpiActuals: [kpi()], members: [],
      balanceSheet: { asOf: '2026-05-31', currentAssets: 900_000, inventory: 0, accountsReceivable: 0, fixedAssets: 0, currentLiabilities: 800_000, accountsPayable: 800_000, fixedLiabilities: 0, netIncome: 0 },
    });
    expect(cat(buildManagementHighlights(neg), '運転資金')).toMatchObject({ severity: 'good', message: expect.stringContaining('CCC') });
  });

  it('flags a short cash runway as critical (< 6mo) and a medium one as warning (< 12mo)', () => {
    const mk = (cash: number) => buildBusinessOverview({
      plan: 'pro', sales: [], kpiActuals: [kpi()], members: [],
      accounting: [
        { month: '2026-04', income: 1_000_000, expense: 1_100_000, net: -100_000 },
        { month: '2026-05', income: 1_000_000, expense: 1_100_000, net: -100_000 },
      ],
      balanceSheet: { asOf: '2026-05-31', currentAssets: cash, cash, inventory: 0, accountsReceivable: 0, fixedAssets: 0, currentLiabilities: 0, accountsPayable: 0, fixedLiabilities: 0, netIncome: 0 },
    });
    // 300,000 / 100,000 = 3mo → critical
    expect(buildManagementHighlights(mk(300_000)).some((h) => h.category === '資金繰り' && h.severity === 'critical' && h.message.includes('ランウェイ'))).toBe(true);
    // 900,000 / 100,000 = 9mo → warning
    expect(buildManagementHighlights(mk(900_000)).some((h) => h.category === '資金繰り' && h.severity === 'warning' && h.message.includes('ランウェイ'))).toBe(true);
  });
});

describe('buildManagementHighlights — threshold boundaries (strict comparisons)', () => {
  it('does not flag a loss when operating profit is exactly 0 (< 0 strict)', () => {
    // contribution 500k = fixed 500k → opProfit 0 → 収益性 なし
    const k = kpi({ revenue: 1_000_000, cogs: 400_000, advertising: 100_000, sga: 500_000, depreciation: 0 });
    expect(cat(buildManagementHighlights(buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [k], members: [] })), '収益性')).toBeUndefined();
  });
  it('praises an operating margin of exactly 10% as good (>= 10)', () => {
    // contribution 350k, fixed 250k → opProfit 100k / rev 1M = 10%
    const k = kpi({ revenue: 1_000_000, cogs: 500_000, advertising: 150_000, sga: 200_000, depreciation: 50_000 });
    expect(cat(buildManagementHighlights(buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [k], members: [] })), '収益性')).toMatchObject({ severity: 'good' });
  });
});

describe('buildManagementHighlights — exact boundaries & null guards (direct overview)', () => {
  const c = (hs: Highlight[], cat: string) => hs.find((h) => h.category === cat);

  it('no kpi block when hasData is false (guard load-bearing)', () => {
    // hasData=false なのに損失 → 元は沈黙。hasData を true 固定する mutant は収益性を出す。
    expect(buildManagementHighlights(mkOv({ kpi: { hasData: false, operatingProfit: -500 } }))).toEqual([]);
  });
  it('operating profit exactly 0 → no profitability finding (< 0 strict)', () => {
    expect(c(buildManagementHighlights(mkOv({ kpi: { operatingProfit: 0, operatingMarginPct: 0 } })), '収益性')).toBeUndefined();
  });
  it('safety margin: revenue=0 suppresses, exactly 10 is not low (&&, >=10 strict)', () => {
    expect(c(buildManagementHighlights(mkOv({ kpi: { revenue: 0, safetyMargin: 5 } })), '安全性')).toBeUndefined();
    expect(c(buildManagementHighlights(mkOv({ kpi: { revenue: 1000, safetyMargin: 10 } })), '安全性')).toBeUndefined();
    expect(c(buildManagementHighlights(mkOv({ kpi: { revenue: 1000, safetyMargin: 9.9 } })), '安全性')).toMatchObject({ severity: 'warning' });
  });
  it('growth boundaries: 0 is neither, exactly 10 is good (< 0 / >= 10 strict)', () => {
    expect(c(buildManagementHighlights(mkOv({ kpi: { revenueGrowthPct: 0 } })), '成長性')).toBeUndefined();
    expect(c(buildManagementHighlights(mkOv({ kpi: { revenueGrowthPct: 10 } })), '成長性')).toMatchObject({ severity: 'good' });
    expect(c(buildManagementHighlights(mkOv({ kpi: { revenueGrowthPct: -0.1 } })), '成長性')).toMatchObject({ severity: 'warning' });
  });
  it('revenue trend: peak-drop suffix present/absent, streak 2=warning 3=critical', () => {
    const withDrop = c(buildManagementHighlights(mkOv({ revStreak: { streak: 2, dropFromPeakPct: 15 } })), '売上トレンド');
    expect(withDrop!.message).toContain('ピーク比 −15%');
    const noDrop = c(buildManagementHighlights(mkOv({ revStreak: { streak: 2, dropFromPeakPct: null } })), '売上トレンド');
    // dropFromPeakPct=null の suffix は空文字。完全一致で `: ''` を別文字列化する StringLiteral を撃墜。
    expect(noDrop!.message).toBe('売上が 2 期連続で減少しています。');
    expect(noDrop!.severity).toBe('warning');
    expect(c(buildManagementHighlights(mkOv({ revStreak: { streak: 3, dropFromPeakPct: null } })), '売上トレンド')!.severity).toBe('critical');
    expect(c(buildManagementHighlights(mkOv({ revStreak: { streak: 1 } })), '売上トレンド')).toBeUndefined();
  });
  it('operating-profit trend: streak 2=warning, 3=critical, 1=silent', () => {
    expect(c(buildManagementHighlights(mkOv({ opStreak: { streak: 2 } })), '利益トレンド')!.severity).toBe('warning');
    expect(c(buildManagementHighlights(mkOv({ opStreak: { streak: 3 } })), '利益トレンド')!.severity).toBe('critical');
    expect(c(buildManagementHighlights(mkOv({ opStreak: { streak: 1 } })), '利益トレンド')).toBeUndefined();
  });
  it('labor share: exactly 60 is not high (> strict), null is silent', () => {
    expect(c(buildManagementHighlights(mkOv({ labor: { laborSharePct: 60 } })), '生産性')).toBeUndefined();
    expect(c(buildManagementHighlights(mkOv({ labor: { laborSharePct: 60.1 } })), '生産性')).toMatchObject({ severity: 'warning' });
    expect(c(buildManagementHighlights(mkOv({ labor: { laborSharePct: null } })), '生産性')).toBeUndefined();
  });
  it('budget: 90 is not under, 100 is achieved, null is silent (no spurious push)', () => {
    expect(c(buildManagementHighlights(mkOv({ budget: { revenue: { achievementPct: 90 } } })), '予実')).toBeUndefined();
    expect(c(buildManagementHighlights(mkOv({ budget: { revenue: { achievementPct: 89.9 } } })), '予実')).toMatchObject({ severity: 'warning' });
    expect(c(buildManagementHighlights(mkOv({ budget: { revenue: { achievementPct: 100 } } })), '予実')).toMatchObject({ severity: 'good' });
    expect(c(buildManagementHighlights(mkOv({ budget: { revenue: { achievementPct: 99 } } })), '予実')).toBeUndefined();
    expect(c(buildManagementHighlights(mkOv({ budget: { revenue: { achievementPct: null } } })), '予実')).toBeUndefined();
  });
  it('financial position: insolvent critical, equity=20 / current=100 boundaries, nulls silent', () => {
    expect(c(buildManagementHighlights(mkOv({ fp: { insolvent: true, equityRatioPct: -5, currentRatioPct: 200 } })), '財政状態')!.severity).toBe('critical');
    // equity exactly 20 → not low; null → silent
    expect(buildManagementHighlights(mkOv({ fp: { insolvent: false, equityRatioPct: 20, currentRatioPct: 200 } })).some((h) => h.message.includes('自己資本比率'))).toBe(false);
    // 19% → warning。severity も検証して `severity: 'warning'` の StringLiteral を撃墜。
    const lowEquity = buildManagementHighlights(mkOv({ fp: { insolvent: false, equityRatioPct: 19, currentRatioPct: 200 } })).find((h) => h.message.includes('自己資本比率'));
    expect(lowEquity).toMatchObject({ severity: 'warning', category: '財政状態' });
    expect(buildManagementHighlights(mkOv({ fp: { insolvent: false, equityRatioPct: null, currentRatioPct: 200 } })).some((h) => h.message.includes('自己資本比率'))).toBe(false);
    // current exactly 100 → not low; null → silent
    expect(buildManagementHighlights(mkOv({ fp: { insolvent: false, equityRatioPct: 50, currentRatioPct: 100 } })).some((h) => h.message.includes('流動比率'))).toBe(false);
    // 99% → warning。severity も検証して `severity: 'warning'` の StringLiteral を撃墜。
    const lowCurrent = buildManagementHighlights(mkOv({ fp: { insolvent: false, equityRatioPct: 50, currentRatioPct: 99 } })).find((h) => h.message.includes('流動比率'));
    expect(lowCurrent).toMatchObject({ severity: 'warning', category: '財政状態' });
    expect(buildManagementHighlights(mkOv({ fp: { insolvent: false, equityRatioPct: 50, currentRatioPct: null } })).some((h) => h.message.includes('流動比率'))).toBe(false);
  });
  it('working capital: ccc=60 not long, ccc=0 good, ccc>0&<=60 silent, ccc=null silent', () => {
    expect(c(buildManagementHighlights(mkOv({ wc: { ccc: 60 } })), '運転資金')).toBeUndefined();
    expect(c(buildManagementHighlights(mkOv({ wc: { ccc: 61 } })), '運転資金')).toMatchObject({ severity: 'warning' });
    expect(c(buildManagementHighlights(mkOv({ wc: { ccc: 0 } })), '運転資金')).toMatchObject({ severity: 'good' });
    expect(c(buildManagementHighlights(mkOv({ wc: { ccc: 30 } })), '運転資金')).toBeUndefined();
    expect(c(buildManagementHighlights(mkOv({ wc: { ccc: null } })), '運転資金')).toBeUndefined();
  });
  it('cash: avgMonthlyNet exactly 0 → good (< 0 strict)', () => {
    expect(c(buildManagementHighlights(mkOv({ accounting: { avgMonthlyNet: 0 } })), '資金繰り')).toMatchObject({ severity: 'good' });
    expect(c(buildManagementHighlights(mkOv({ accounting: { avgMonthlyNet: -1 } })), '資金繰り')).toMatchObject({ severity: 'warning' });
  });
  it('runway: 6 is warning (not critical), 12 is silent, null silent', () => {
    expect(c(buildManagementHighlights(mkOv({ runwayMonths: 6 })), '資金繰り')!.severity).toBe('warning');
    expect(c(buildManagementHighlights(mkOv({ runwayMonths: 5 })), '資金繰り')!.severity).toBe('critical');
    expect(c(buildManagementHighlights(mkOv({ runwayMonths: 12 })), '資金繰り')).toBeUndefined();
    expect(c(buildManagementHighlights(mkOv({ runwayMonths: 11 })), '資金繰り')!.severity).toBe('warning');
    expect(c(buildManagementHighlights(mkOv({ runwayMonths: null })), '資金繰り')).toBeUndefined();
  });
  it('DSCR: 1 is neither, 1.5 is good, null/undefined silent', () => {
    expect(c(buildManagementHighlights(mkOv({}), 1), '返済余力')).toBeUndefined();
    expect(c(buildManagementHighlights(mkOv({}), 0.99), '返済余力')!.severity).toBe('critical');
    // good は severity と message 双方を検証して good 文言の StringLiteral を撃墜。
    expect(c(buildManagementHighlights(mkOv({}), 1.5), '返済余力')).toMatchObject({ severity: 'good', message: expect.stringContaining('DSCR') });
    expect(c(buildManagementHighlights(mkOv({}), 1.49), '返済余力')).toBeUndefined();
    expect(c(buildManagementHighlights(mkOv({}), null), '返済余力')).toBeUndefined();
    // overallDscr を明示 null で渡すと typeof === 'number' ガードが false。これを true 固定する
    // 変異は 0<1 で critical を誤出力するため撃墜できる (number 路だと null→undefined 正規化で届かない)。
    expect(c(buildManagementHighlights(mkOv({}), { overallDscr: null }), '返済余力')).toBeUndefined();
    expect(c(buildManagementHighlights(mkOv({}), { overallDscr: undefined }), '返済余力')).toBeUndefined();
    expect(c(buildManagementHighlights(mkOv({})), '返済余力')).toBeUndefined();
  });
  it('concentration: exactly 60 not concentrated, null silent (no crash)', () => {
    expect(c(buildManagementHighlights(mkOv({ concentration: { topChannel: 'amazon', topSharePct: 60 } })), '売上集中')).toBeUndefined();
    expect(c(buildManagementHighlights(mkOv({ concentration: { topChannel: 'amazon', topSharePct: 60.1 } })), '売上集中')).toMatchObject({ severity: 'warning' });
    expect(c(buildManagementHighlights(mkOv({ concentration: null })), '売上集中')).toBeUndefined();
  });
});

describe('buildManagementHighlights — 売上集中 / 組織', () => {
  it('warns about single-channel revenue concentration (> 60%)', () => {
    const o = buildBusinessOverview({
      plan: 'pro', kpiActuals: [kpi()], members: [],
      sales: [
        { date: '2026-05-01', channel: 'amazon', amount: 900_000, orders: 90 },
        { date: '2026-05-02', channel: 'shopify', amount: 100_000, orders: 10 },
      ],
    });
    expect(cat(buildManagementHighlights(o), '売上集中')).toMatchObject({ severity: 'warning', message: expect.stringContaining('集中') });
  });
  it('warns when the plan seats are full', () => {
    const o = buildBusinessOverview({ plan: 'free', sales: [], kpiActuals: [kpi()], members: [{ role: 'owner' }] });
    expect(cat(buildManagementHighlights(o), '組織')).toMatchObject({ severity: 'warning', message: expect.stringContaining('シート上限') });
  });
});

describe('summarizeHighlights — 件数 + 総合リスク帯', () => {
  const h = (severity: Highlight['severity']): Highlight => ({ severity, category: 'x', message: 'x' });

  it('empty list → all zero and band "none"', () => {
    expect(summarizeHighlights([])).toEqual({ critical: 0, warning: 0, good: 0, total: 0, riskBand: 'none' });
  });

  it('only good → band "low"', () => {
    expect(summarizeHighlights([h('good')])).toEqual({ critical: 0, warning: 0, good: 1, total: 1, riskBand: 'low' });
  });

  it('warning present (no critical) → band "medium", good does not override', () => {
    expect(summarizeHighlights([h('warning'), h('good'), h('good')])).toEqual({
      critical: 0, warning: 1, good: 2, total: 3, riskBand: 'medium',
    });
  });

  it('critical present → band "high" regardless of warnings/good', () => {
    expect(summarizeHighlights([h('good'), h('warning'), h('critical')])).toEqual({
      critical: 1, warning: 1, good: 1, total: 3, riskBand: 'high',
    });
  });

  it('counts each severity exactly and total is the sum', () => {
    const list = [h('critical'), h('critical'), h('warning'), h('good'), h('good'), h('good')];
    expect(summarizeHighlights(list)).toEqual({ critical: 2, warning: 1, good: 3, total: 6, riskBand: 'high' });
  });

  it('exposes a Japanese label for every risk band', () => {
    expect(RISK_BAND_LABEL).toEqual({ high: '要対応', medium: '注意', low: '良好', none: '所見なし' });
  });
});

import { describe, expect, it } from 'vitest';
import { buildBusinessOverview } from '../overview';
import type { SalesEntry } from '../sales';
import type { KpiActual } from '../kpiActuals';

const SALES: SalesEntry[] = [
  { date: '2026-05-01', channel: 'amazon', amount: 60000, orders: 12 },
  { date: '2026-05-02', channel: 'shopify', amount: 40000, orders: 8 },
];
const KPI: KpiActual[] = [
  { period: '2026-05', unit: '全社', revenue: 100000, cogs: 40000, advertising: 10000, sga: 20000, depreciation: 5000 },
];

describe('buildBusinessOverview', () => {
  it('composes sales, KPI, team and plan into one summary', () => {
    const o = buildBusinessOverview({
      plan: 'business',
      sales: SALES,
      kpiActuals: KPI,
      members: [{ role: 'owner' }, { role: 'admin' }],
    });

    expect(o.plan).toEqual({ tier: 'business', label: 'Business', audience: '中小企業・チーム' });

    expect(o.sales.totalAmount).toBe(100000);
    expect(o.sales.totalOrders).toBe(20);
    expect(o.sales.aov).toBeCloseTo(5000);
    expect(o.sales.channelCount).toBe(2);
    expect(o.sales.topChannel).toBe('Amazon');
    // Amazon 60,000 / Shopify 40,000 → HHI 0.52 → diversity 48, top 60%
    expect(o.sales.concentration).not.toBeNull();
    expect(o.sales.concentration!.diversityScore).toBe(48);
    expect(o.sales.concentration!.topSharePct).toBe(60);
    expect(o.sales.concentration!.singleChannelRisk).toBe(false);

    expect(o.kpi.hasData).toBe(true);
    expect(o.kpi.revenue).toBe(100000);
    // variable=50000, fixed=25000 → OP=25000
    expect(o.kpi.operatingProfit).toBe(25000);

    expect(o.team).toEqual({ members: 2, seatLimit: 25, seatsRemaining: 23 });
    expect(o.flags.profitable).toBe(true);
    expect(o.flags.seatsFull).toBe(false);
  });

  it('handles an empty business (free plan, no data)', () => {
    const o = buildBusinessOverview({ plan: 'free', sales: [], kpiActuals: [], members: [] });
    expect(o.sales.totalAmount).toBe(0);
    expect(o.sales.topChannel).toBeNull();
    expect(o.kpi.hasData).toBe(false);
    expect(o.kpi.operatingProfit).toBe(0);
    expect(o.team.seatLimit).toBe(1);
    expect(o.flags.profitable).toBe(false);
  });

  it('flags seatsFull when members reach the plan cap', () => {
    const o = buildBusinessOverview({
      plan: 'free', // 1 seat
      sales: [],
      kpiActuals: [],
      members: [{ role: 'owner' }],
    });
    expect(o.team.seatsRemaining).toBe(0);
    expect(o.flags.seatsFull).toBe(true);
  });

  it('marks an unprofitable business when costs exceed revenue', () => {
    const loss: KpiActual[] = [
      { period: '2026-05', unit: '全社', revenue: 100, cogs: 80, advertising: 40, sga: 30, depreciation: 0 },
    ];
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: loss, members: [] });
    expect(o.kpi.operatingProfit).toBeLessThan(0);
    expect(o.flags.profitable).toBe(false);
  });

  it('exposes contribution ratio and a null growth rate for a single period', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    // contribution = revenue - (cogs + advertising) = 100000 - 50000 = 50000 → 50%
    expect(o.kpi.contributionRatio).toBeCloseTo(50);
    expect(o.kpi.revenueGrowthPct).toBeNull();
  });

  it('computes revenue growth when two periods are present', () => {
    const twoPeriods: KpiActual[] = [
      { period: '2026-04', unit: '全社', revenue: 100000, cogs: 40000, advertising: 10000, sga: 20000, depreciation: 5000 },
      { period: '2026-05', unit: '全社', revenue: 120000, cogs: 40000, advertising: 10000, sga: 20000, depreciation: 5000 },
    ];
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: twoPeriods, members: [] });
    expect(o.kpi.revenueGrowthPct).toBe(20);
  });

  it('exposes CAGR and a moving-average trend across multiple periods', () => {
    const rev = (period: string, revenue: number): KpiActual =>
      ({ period, unit: '全社', revenue, cogs: 0, advertising: 0, sga: 0, depreciation: 0 });
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      kpiActuals: [rev('2026-01', 100), rev('2026-02', 110), rev('2026-03', 120), rev('2026-04', 200)],
      members: [],
    });
    expect(o.kpi.revenueCagrPct).not.toBeNull();
    expect(o.kpi.revenueCagrPct!).toBeGreaterThan(0);
    expect(o.kpi.revenueTrend).toBe('up');
  });

  it('leaves CAGR and trend null for a single period', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    expect(o.kpi.revenueCagrPct).toBeNull();
    expect(o.kpi.revenueTrend).toBeNull();
  });

  it('exposes a run-rate landing forecast from elapsed months', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    // KPI は 2026-05 の 1 か月 100,000 → 年換算 1,200,000
    expect(o.kpi.revenueLanding).toEqual({
      year: '2026',
      monthsElapsed: 1,
      actualToDate: 100000,
      runRateForecast: 1200000,
    });
  });

  it('leaves the landing forecast null when no KPI data is present', () => {
    const o = buildBusinessOverview({ plan: 'free', sales: [], kpiActuals: [], members: [] });
    expect(o.kpi.revenueLanding).toBeNull();
  });

  it('consolidates gross margin and operating margin from KPI fundamentals', () => {
    // revenue 100000, cogs 40000 → gross 60000 / 60%; operating 25000 → 25%
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    expect(o.kpi.grossProfit).toBe(60000);
    expect(o.kpi.grossMarginPct).toBeCloseTo(60);
    expect(o.kpi.operatingMarginPct).toBeCloseTo(25);
  });

  it('consolidates EBITDA and cost-structure ratios from KPI fundamentals', () => {
    // KPI: revenue 100000, cogs 40000, advertising 10000, sga 20000, depreciation 5000
    // operating = 100000 - (40000+10000) - (20000+5000) = 25000; EBITDA = 25000+5000 = 30000
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    expect(o.kpi.ebitda).toBe(30000);
    expect(o.kpi.ebitdaMarginPct).toBeCloseTo(30);
    expect(o.kpi.cogsRatioPct).toBeCloseTo(40);
    expect(o.kpi.advertisingRatioPct).toBeCloseTo(10);
    expect(o.kpi.sgaRatioPct).toBeCloseTo(20);
  });

  it('zeroes EBITDA margin and cost ratios when revenue is zero', () => {
    const noRev: KpiActual[] = [
      { period: '2026-05', unit: '全社', revenue: 0, cogs: 0, advertising: 0, sga: 1000, depreciation: 500 },
    ];
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: noRev, members: [] });
    expect(o.kpi.ebitdaMarginPct).toBe(0);
    expect(o.kpi.cogsRatioPct).toBe(0);
    // EBITDA itself is still operating + depreciation = -1500 + 500 = -1000 (a figure, not a ratio)
    expect(o.kpi.ebitda).toBe(-1000);
  });

  it('computes per-capita productivity from the member count', () => {
    const o = buildBusinessOverview({
      plan: 'business',
      sales: [],
      kpiActuals: KPI, // revenue 100000, operating 25000
      members: [{ role: 'owner' }, { role: 'admin' }, { role: 'member' }, { role: 'member' }],
    });
    expect(o.productivity.members).toBe(4);
    expect(o.productivity.revenuePerCapita).toBe(25000); // 100000 / 4
    expect(o.productivity.operatingProfitPerCapita).toBe(6250); // 25000 / 4
  });

  it('reports zero per-capita figures when there are no members (no division by zero)', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    expect(o.productivity.members).toBe(0);
    expect(o.productivity.revenuePerCapita).toBe(0);
    expect(o.productivity.operatingProfitPerCapita).toBe(0);
  });

  it('leaves the budget variance null when no budget is supplied', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    expect(o.budget).toBeNull();
  });

  it('computes the budget variance when budgets are supplied', () => {
    // budget revenue 80000 vs actual 100000 → 125%
    const budget: KpiActual[] = [
      { period: '2026-05', unit: '全社', revenue: 80000, cogs: 40000, advertising: 10000, sga: 20000, depreciation: 5000 },
    ];
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, kpiBudgets: budget, members: [] });
    expect(o.budget).not.toBeNull();
    expect(o.budget!.revenue.budget).toBe(80000);
    expect(o.budget!.revenue.actual).toBe(100000);
    expect(o.budget!.revenue.achievementPct).toBe(125);
  });

  it('leaves the financial position null when no balance sheet is supplied', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    expect(o.financialPosition).toBeNull();
  });

  it('computes financial-position metrics from a supplied balance sheet', () => {
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      kpiActuals: KPI,
      members: [],
      balanceSheet: {
        asOf: '2026-03-31', currentAssets: 6000, inventory: 2000, accountsReceivable: 1500, fixedAssets: 4000,
        currentLiabilities: 3000, accountsPayable: 1000, fixedLiabilities: 2000, netIncome: 1000,
      },
    });
    expect(o.financialPosition).not.toBeNull();
    expect(o.financialPosition!.equityRatioPct).toBe(50);
    expect(o.financialPosition!.currentRatioPct).toBe(200);
    expect(o.financialPosition!.roaPct).toBe(10);
  });

  it('computes the cash conversion cycle from the balance sheet + KPI flows', () => {
    // KPI: revenue 100000, cogs 40000. BS: AR 1500, inventory 2000, AP 1000.
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      kpiActuals: KPI,
      members: [],
      balanceSheet: {
        asOf: '2026-03-31', currentAssets: 6000, inventory: 2000, accountsReceivable: 1500, fixedAssets: 4000,
        currentLiabilities: 3000, accountsPayable: 1000, fixedLiabilities: 2000, netIncome: 1000,
      },
    });
    expect(o.workingCapital).not.toBeNull();
    expect(o.workingCapital!.workingCapital).toBe(2500); // 1500 + 2000 - 1000
    expect(o.workingCapital!.ccc).not.toBeNull();
  });

  it('leaves working capital null when no balance sheet is supplied', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    expect(o.workingCapital).toBeNull();
  });

  it('surfaces labor metrics in the productivity block when labor cost is recorded', () => {
    const withLabor: KpiActual[] = [
      { period: '2026-05', unit: '全社', revenue: 100000, cogs: 40000, advertising: 10000, sga: 20000, depreciation: 5000, laborCost: 30000 },
    ];
    const o = buildBusinessOverview({ plan: 'business', sales: [], kpiActuals: withLabor, members: [{ role: 'owner' }, { role: 'member' }] });
    // gross profit 60000, labor 30000 → 50%; labor/revenue 30%; per-capita 15000
    expect(o.productivity.labor.laborSharePct).toBe(50);
    expect(o.productivity.labor.laborToRevenuePct).toBe(30);
    expect(o.productivity.labor.laborPerCapita).toBe(15000);
  });

  it('leaves labor metrics null when no labor cost is recorded', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    expect(o.productivity.labor.laborSharePct).toBeNull();
  });

  it('exposes trend alerts and detects a consecutive revenue decline', () => {
    const decline: KpiActual[] = [
      { period: '2026-03', unit: '全社', revenue: 200000, cogs: 40000, advertising: 10000, sga: 20000, depreciation: 5000 },
      { period: '2026-04', unit: '全社', revenue: 150000, cogs: 40000, advertising: 10000, sga: 20000, depreciation: 5000 },
      { period: '2026-05', unit: '全社', revenue: 100000, cogs: 40000, advertising: 10000, sga: 20000, depreciation: 5000 },
    ];
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: decline, members: [] });
    expect(o.trendAlerts.revenue.streak).toBe(2);
    expect(o.trendAlerts.operatingProfit.streak).toBe(2);
  });

  it('summarizes accounting cashflow and leaves runway null without cash on the BS', () => {
    const o = buildBusinessOverview({
      plan: 'pro', sales: [], kpiActuals: KPI, members: [],
      accounting: [
        { month: '2026-04', income: 1_000_000, expense: 1_200_000, net: -200_000 },
        { month: '2026-05', income: 1_000_000, expense: 1_200_000, net: -200_000 },
      ],
    });
    expect(o.accounting).not.toBeNull();
    expect(o.accounting!.avgMonthlyNet).toBe(-200_000);
    expect(o.runwayMonths).toBeNull(); // no cash supplied
  });

  it('computes runway from accounting burn + BS cash', () => {
    const o = buildBusinessOverview({
      plan: 'pro', sales: [], kpiActuals: KPI, members: [],
      accounting: [
        { month: '2026-04', income: 1_000_000, expense: 1_200_000, net: -200_000 },
        { month: '2026-05', income: 1_000_000, expense: 1_200_000, net: -200_000 },
      ],
      balanceSheet: {
        asOf: '2026-05-31', currentAssets: 3_000_000, cash: 2_000_000, inventory: 0, accountsReceivable: 0,
        fixedAssets: 0, currentLiabilities: 0, accountsPayable: 0, fixedLiabilities: 0, netIncome: 0,
      },
    });
    // 2,000,000 cash / 200,000 monthly burn = 10 months
    expect(o.runwayMonths).toBe(10);
    // 12-month forecast: shortfall in month 11 (balance crosses below 0 after runway)
    expect(o.cashForecast).not.toBeNull();
    expect(o.cashForecast!.shortfallMonthIndex).toBe(11);
    expect(o.cashForecast!.rows).toHaveLength(12);
  });

  it('leaves runway / forecast null when BS cash is zero despite a burn (> strict)', () => {
    // cash===0 → `(cash ?? 0) > 0` ガードで除外。条件を true 固定 / >= 0 にする mutant は
    // runway 0 / forecast を算出してしまうため、null 期待で殺す。
    const o = buildBusinessOverview({
      plan: 'pro', sales: [], kpiActuals: KPI, members: [],
      accounting: [
        { month: '2026-04', income: 1_000_000, expense: 1_200_000, net: -200_000 },
        { month: '2026-05', income: 1_000_000, expense: 1_200_000, net: -200_000 },
      ],
      balanceSheet: {
        asOf: '', currentAssets: 0, cash: 0, inventory: 0, accountsReceivable: 0,
        fixedAssets: 0, currentLiabilities: 0, accountsPayable: 0, fixedLiabilities: 0, netIncome: 0,
      },
    });
    expect(o.accounting).not.toBeNull();
    expect(o.runwayMonths).toBeNull();
    expect(o.cashForecast).toBeNull();
  });

  it('does not mark a break-even business (operatingProfit 0) as profitable (> strict)', () => {
    const breakEven: KpiActual[] = [
      { period: '2026-05', unit: '全社', revenue: 100, cogs: 50, advertising: 0, sga: 50, depreciation: 0 },
    ];
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: breakEven, members: [] });
    expect(o.kpi.operatingProfit).toBe(0);
    expect(o.flags.profitable).toBe(false);
  });

  it('leaves accounting null when not connected (no monthly data)', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [], accounting: [] });
    expect(o.accounting).toBeNull();
    expect(o.runwayMonths).toBeNull();
  });
});

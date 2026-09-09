import { describe, expect, it } from 'vitest';
import { buildBusinessOverview } from '../overview';
import { estimateEconomics, assessLowPotassium } from '../../../shared/hydroponics';
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

  // **売上を分母にする 7 つの比率は、売上 0 では 1 つも定まらない。**
  // 0.0% に倒すと「営業利益 △1,000 / 営業利益率 0.0%」という**両立しない 2 行**が
  // 書面と画面に並ぶ (経緯は `overview.ts` の `pctOfRevenue`)。額は期間の合計なので
  // そのまま出す —— 出せない物と出せる物を分ける。
  it('nulls every revenue-denominated ratio when revenue is zero (not 0.0%)', () => {
    const noRev: KpiActual[] = [
      { period: '2026-05', unit: '全社', revenue: 0, cogs: 0, advertising: 0, sga: 1000, depreciation: 500 },
    ];
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: noRev, members: [] });
    expect(o.kpi.grossMarginPct).toBeNull();
    expect(o.kpi.operatingMarginPct).toBeNull();
    expect(o.kpi.ebitdaMarginPct).toBeNull();
    expect(o.kpi.cogsRatioPct).toBeNull();
    expect(o.kpi.advertisingRatioPct).toBeNull();
    expect(o.kpi.sgaRatioPct).toBeNull();
    expect(o.kpi.contributionRatio).toBeNull();
    // 安全余裕率は前から null (パス 33)。**同じ節の中で答え方が揃っていること。**
    expect(o.kpi.safetyMargin).toBeNull();
    // 額は出る: EBITDA = 営業利益 + 減価償却費 = -1500 + 500 = -1000 (比率ではない)
    expect(o.kpi.ebitda).toBe(-1000);
    expect(o.kpi.operatingProfit).toBe(-1500);
  });

  // ★ 対照: 売上が在れば 7 つとも数で出る (上の null が「常に null」ではないこと)。
  it('computes every revenue-denominated ratio when revenue is positive', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    for (const v of [
      o.kpi.grossMarginPct, o.kpi.operatingMarginPct, o.kpi.ebitdaMarginPct,
      o.kpi.cogsRatioPct, o.kpi.advertisingRatioPct, o.kpi.sgaRatioPct, o.kpi.contributionRatio,
    ]) expect(typeof v).toBe('number');
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

  // **従業員 0 名なら一人当たりは算定不能。** 同じ分母で割る
  // `labor.laborPerCapita` は最初から null を返していたのに、こちらは 0 に倒しており、
  // 書面 §3 に「一人当たり売上高 0」と「一人当たり人件費 ―」が並んでいた。
  it('nulls the per-capita figures when there are no members (null, not 0)', () => {
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    expect(o.productivity.members).toBe(0);
    expect(o.productivity.revenuePerCapita).toBeNull();
    expect(o.productivity.operatingProfitPerCapita).toBeNull();
    // **不変条件**: 同じ分母で割る 3 欄は必ず同じ答え方をする。
    expect(o.productivity.labor.laborPerCapita).toBeNull();
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
    expect(o.budget!.alignment.comparedPeriods).toEqual(['2026-05']);
  });

  // 2026-09-07: 期が重ならない控えでも達成率 (125%) を出していたので、突合状況を
  // 別欄で持ち、`budget` が null の理由を画面と書面が述べられるようにした。
  it('★ 予算も実績も在れば budgetAlignment は非 null (期が重ならなくても)', () => {
    const budget: KpiActual[] = [
      { period: '2025-04', unit: '全社', revenue: 80000, cogs: 0, advertising: 0, sga: 0, depreciation: 0 },
    ];
    const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, kpiBudgets: budget, members: [] });
    expect(o.budget).toBeNull(); // 突合できる期が無いので比較しない
    expect(o.budgetAlignment).toEqual({
      comparedPeriods: [],
      budgetOnlyPeriods: ['2025-04'],
      actualOnlyPeriods: ['2026-05'],
    });
  });

  it('★ 対照: 片側が空なら budgetAlignment も null (隔たりが無い)', () => {
    const noBudget = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: KPI, members: [] });
    expect(noBudget.budgetAlignment).toBeNull();
    const noActual = buildBusinessOverview({
      plan: 'pro', sales: [], kpiActuals: [], members: [],
      kpiBudgets: [{ period: '2026-05', unit: '全社', revenue: 1, cogs: 0, advertising: 0, sga: 0, depreciation: 0 }],
    });
    expect(noActual.budgetAlignment).toBeNull();
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

// --- 水耕栽培の試算 ------------------------------------------------------
//
// 試算は**実績ではない**。`kpi` に混ぜると「実績」と「これから作る計画」が
// 同じ数字として並んでしまうので、独立した節として持つ。

describe('経営サマリーの水耕栽培の節', () => {
  const CROP = {
    id: 'leaf-lettuce' as const,
    label: 'テスト用',
    nurseryDays: 20,
    growOutDays: 10,
    harvestWeightG: 100,
    ecLow: 1,
    ecHigh: 2,
    phLow: 5.5,
    phHigh: 6.5,
    plantsPerPanel: 27,
  };
  const FACILITY = { floorAreaSqm: 100, tiers: 5, usableRatio: 1, crop: CROP, yieldRate: 0.8 };
  const COST = {
    unitPriceYen: 200,
    electricityYenPerKwh: 20,
    energyIntensityKwhPerKg: 10,
    seedYenPerPlant: 3,
    nutrientYenPerPlant: 2,
    packagingYenPerPlant: 10,
    laborYenPerMonth: 3_000_000,
    depreciationYenPerMonth: 2_000_000,
    rentYenPerMonth: 500_000,
    otherFixedYenPerMonth: 300_000,
  };

  it('未入力なら節は出ない', () => {
    const o = buildBusinessOverview({ plan: 'free', sales: [], kpiActuals: [], members: [] });
    expect(o.hydroponics).toBeNull();
  });

  it('入力すると出荷量・損益・電力が経営サマリーに載る', () => {
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      kpiActuals: [],
      members: [],
      hydroponics: estimateEconomics(FACILITY, COST),
    });
    const h = o.hydroponics;
    expect(h).not.toBeNull();
    expect(h!.shippedPlantsPerDay).toBe(2_000);
    expect(h!.shippedPlantsPerMonth).toBe(60_833);
    expect(h!.shippedKgPerYear).toBe(73_000);
    expect(h!.revenue).toBe(12_166_667); // 60,833.33 株 × 200 円
    expect(h!.breakEvenPlantsPerMonth).toBe(39_573);
    expect(h!.meetsBreakEven).toBe(true);
    expect(h!.energyKwhPerYear).toBe(912_500);
    expect(h!.electricityYenPerYear).toBe(18_250_000);
  });

  it('試算は実績 (kpi) に混ざらない', () => {
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      kpiActuals: [],
      members: [],
      hydroponics: estimateEconomics(FACILITY, COST),
    });
    // 栽培の試算だけを入れても「KPI 実績あり」にはならない。
    expect(o.kpi.hasData).toBe(false);
    expect(o.kpi.revenue).toBe(0);
    expect(o.flags.profitable).toBe(false);
    // それでも栽培の節には売上が出ている。
    expect(o.hydroponics!.revenue).toBeGreaterThan(0);
  });

  it('利益率と損益分岐は他の節と同じ定義で出す', () => {
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      kpiActuals: [],
      members: [],
      hydroponics: estimateEconomics(FACILITY, COST),
    });
    const h = o.hydroponics!;
    // 営業利益 = 売上 − (原価 + 広告 + 販管費 + 減価償却)
    // 12,166,667 − (912,500 + 0 + 5,320,833 + 2,000,000) = 3,933,334
    expect(h.operatingProfit).toBe(3_933_334);
    expect(h.operatingMarginPct).toBeCloseTo(32.33, 1);
    // 限界利益率 = (売上 − 変動費) ÷ 売上 = (12,166,667 − 912,500) ÷ 12,166,667
    expect(h.contributionRatio).toBeCloseTo(92.5, 1);
    expect(h.bep).toBeGreaterThan(0);
  });

  it('電気代が費用に占める割合を出す (人工光型で最も効く費用)', () => {
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      kpiActuals: [],
      members: [],
      hydroponics: estimateEconomics(FACILITY, COST),
    });
    // 月次電気代 1,520,833 ÷ 月次費用 8,233,333 = 18.5%
    expect(o.hydroponics!.electricityCostRatioPct).toBeCloseTo(18.47, 1);
  });

  it('費用が丸ごと 0 でも電気代の割合は 0 (0 ÷ 0 を NaN にしない)', () => {
    const free = {
      unitPriceYen: 100,
      electricityYenPerKwh: 0,
      energyIntensityKwhPerKg: 0,
      seedYenPerPlant: 0,
      nutrientYenPerPlant: 0,
      packagingYenPerPlant: 0,
      laborYenPerMonth: 0,
      depreciationYenPerMonth: 0,
      rentYenPerMonth: 0,
      otherFixedYenPerMonth: 0,
    };
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      kpiActuals: [],
      members: [],
      hydroponics: estimateEconomics(FACILITY, free),
    });
    const h = o.hydroponics!;
    expect(h.electricityYenPerYear).toBe(0);
    // 分母 (月次費用) が 0 なら割れない → null。**NaN を避ける手段は 0 だけではない**
    // (この見本は 2026-09-08 まで名前ごと `割合は 0` を仕様として固定していた)。
    expect(h.electricityCostRatioPct).toBeNull();
    expect(Number.isNaN(h.electricityCostRatioPct as unknown as number)).toBe(false);
  });

  it('出荷が 0 でも 0 除算にならない', () => {
    const o = buildBusinessOverview({
      plan: 'pro',
      sales: [],
      kpiActuals: [],
      members: [],
      hydroponics: estimateEconomics({ ...FACILITY, yieldRate: 0 }, COST),
    });
    const h = o.hydroponics!;
    expect(h.revenue).toBe(0);
    // 月商 0 なら営業利益率は算定不能。**営業損失が出ているのに 0.0% と刷らない。**
    expect(h.operatingMarginPct).toBeNull();
    expect(h.contributionRatio).toBeNull();
    // **同じ理屈が 1 株あたり原価にも当たる** —— 直す前はここだけ 0 で、
    // すぐ上の 2 行 (営業利益率・限界利益率) と規準が食い違っていた。
    expect(h.costPerShippedPlantYen).toBeNull();
    // 費用は出ているので電気代の割合は数で出る (分母が 0 でないことの対照)。
    expect(typeof h.electricityCostRatioPct).toBe('number');
    // 棚を動かしている限り電気代は出ていく = 営業損失になる。
    expect(h.operatingProfit).toBeLessThan(0);
  });
});

// --- 低カリウム栽培の節 --------------------------------------------------
//
// 腎臓病の方の食事に直結するので、**測っていないものを「低カリウム」として
// 出さない**ことが要件。経営サマリー側でもそれが判別できることを固定する。

describe('経営サマリーの低カリウム栽培', () => {
  const CROP = {
    id: 'leaf-lettuce' as const, label: 'テスト用', nurseryDays: 20, growOutDays: 10,
    harvestWeightG: 100, ecLow: 1, ecHigh: 2, phLow: 5.5, phHigh: 6.5, plantsPerPanel: 27,
  };
  const FACILITY = { floorAreaSqm: 100, tiers: 5, usableRatio: 1, crop: CROP, yieldRate: 0.8 };
  const COST = {
    unitPriceYen: 200, electricityYenPerKwh: 20, energyIntensityKwhPerKg: 10,
    seedYenPerPlant: 3, nutrientYenPerPlant: 2, packagingYenPerPlant: 10,
    laborYenPerMonth: 3_000_000, depreciationYenPerMonth: 2_000_000,
    rentYenPerMonth: 500_000, otherFixedYenPerMonth: 300_000,
  };
  const build = (lowPotassium: ReturnType<typeof assessLowPotassium> | null) =>
    buildBusinessOverview({
      plan: 'pro', sales: [], kpiActuals: [], members: [],
      hydroponics: estimateEconomics(FACILITY, COST),
      lowPotassium,
    });

  it('低カリウムとして扱っていなければ null', () => {
    expect(build(null).hydroponics!.lowPotassium).toBeNull();
  });

  it('実測していれば削減率まで載る', () => {
    const a = assessLowPotassium({
      switchDaysBeforeHarvest: 8,
      measuredPotassiumMgPer100g: 89,
      referencePotassiumMgPer100g: 341,
    });
    const lp = build(a).hydroponics!.lowPotassium!;
    expect(lp.measured).toBe(true);
    expect(lp.potassiumMgPer100g).toBe(89);
    expect(lp.reductionPct).toBe(73.9);
    expect(lp.switchWindowOk).toBe(true);
  });

  it('未測定なら measured が false のまま載る (節を消して隠さない)', () => {
    const a = assessLowPotassium({ switchDaysBeforeHarvest: 8, measuredPotassiumMgPer100g: 0 });
    const lp = build(a).hydroponics!.lowPotassium!;
    // 節は出す。出さないと「低カリウムのつもり」の設定が画面から消えてしまう。
    expect(lp).not.toBeNull();
    expect(lp.measured).toBe(false);
  });

  it('低カリウムは収支の数字に影響しない (成分と採算は別)', () => {
    const withLp = build(assessLowPotassium({ switchDaysBeforeHarvest: 8, measuredPotassiumMgPer100g: 89 }));
    const without = build(null);
    expect(withLp.hydroponics!.revenue).toBe(without.hydroponics!.revenue);
    expect(withLp.hydroponics!.operatingProfit).toBe(without.hydroponics!.operatingProfit);
  });
});

/**
 * **空欄のまま保存した貸借対照表が「最良の運転資金」を報告しないこと。** (2026-09-07)
 *
 * 実測した 4 通り。以前は上の 3 行がすべて 4 行目と同じ「CCC 0 日」だった ——
 * 即日回収・即日支払で資金が 1 日も寝ていない、という最良の状態である。
 * 経緯は `data/balanceSheet.ts` の `BalanceSheet`。
 */
describe('貸借対照表の内数が空欄のとき、運転資金は算定不能 (0 日と言わない)', () => {
  const FLOW: KpiActual[] = [
    { period: '2026-06', unit: '全社', revenue: 4_000_000, cogs: 2_000_000, advertising: 0, sga: 0, depreciation: 0 },
    { period: '2026-07', unit: '全社', revenue: 4_000_000, cogs: 2_000_000, advertising: 0, sga: 0, depreciation: 0 },
    { period: '2026-08', unit: '全社', revenue: 4_000_000, cogs: 2_000_000, advertising: 0, sga: 0, depreciation: 0 },
  ];
  const CORE = { asOf: '2026-08-31', currentAssets: 5_000_000, fixedAssets: 0,
    currentLiabilities: 2_000_000, fixedLiabilities: 0, netIncome: 0 } as const;
  const build = (bs: Record<string, unknown>) =>
    buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: FLOW, members: [], balanceSheet: bs as never });

  it('4 欄を空欄で保存した控え → 回転日数・CCC・運転資本すべて算定不能', () => {
    const wc = build(CORE).workingCapital!;
    expect(wc.dso).toBeNull();
    expect(wc.dio).toBeNull();
    expect(wc.dpo).toBeNull();
    expect(wc.ccc).toBeNull();
    expect(wc.workingCapital).toBeNull();
    expect(wc.missingStocks).toEqual(['売上債権', '棚卸資産', '仕入債務']);
  });

  it('★ 対照: 本当に 0 の現金商売なら CCC 0 日を出す (0 を算定不能にしない)', () => {
    const wc = build({ ...CORE, accountsReceivable: 0, inventory: 0, accountsPayable: 0 }).workingCapital!;
    expect(wc.dso).toBe(0);
    expect(wc.ccc).toBe(0);
    expect(wc.workingCapital).toBe(0);
    expect(wc.missingStocks).toEqual([]);
  });

  it('★ 対照: 埋めてあれば実測どおりの日数が出る', () => {
    // 実績は **3 か月分** (2026-06〜08)。売上 1,200 万 / 原価 600 万は 3 か月の合計なので、
    // 期間の日数も 3 か月分 (91.25 日) で割る:
    //   AR 200 万 → DSO 15.2 日 / 棚卸 100 万 → DIO 15.2 日 / 仕入債務 112.5 万 → DPO 17.1 日
    //   → CCC 13.3 日。
    // **2026-09-07 まではここが 60.8 / 60.8 / 68.4 / 53.2 日だった** —— 3 か月の合計を
    // 365 日で割っていたので、ちょうど 4 倍に膨らんでいた (見本が食い違いを固定していた形)。
    const wc = build({ ...CORE, accountsReceivable: 2_000_000, inventory: 1_000_000, accountsPayable: 1_125_000 }).workingCapital!;
    expect(wc.periodMonths).toBe(3);
    expect(wc.dso).toBe(15.2);
    expect(wc.dio).toBe(15.2);
    expect(wc.dpo).toBe(17.1);
    expect(wc.ccc).toBe(13.3);
    expect(wc.workingCapital).toBe(1_875_000);
    expect(wc.missingStocks).toEqual([]);
  });

  it('★ 期の綴りが読めない控えでは回転日数を出さない (何か月分か測れない)', () => {
    const o = buildBusinessOverview({
      plan: 'pro', sales: [],
      kpiActuals: [{ period: '2026-13', unit: '全社', revenue: 4_000_000, cogs: 2_000_000, advertising: 0, sga: 0, depreciation: 0 }],
      members: [],
      balanceSheet: { ...CORE, accountsReceivable: 2_000_000, inventory: 1_000_000, accountsPayable: 1_125_000 } as never,
    });
    expect(o.workingCapital).toBeNull();
  });

  it('当座比率も空欄では算定不能 (流動比率 250% と同じ値を名乗らない)', () => {
    const fp = build(CORE).financialPosition!;
    expect(fp.currentRatioPct).toBe(250);
    expect(fp.quickRatioPct).toBeNull();
    // ★ 対照: 棚卸資産 0 と実測すれば当座比率も 250%。
    expect(build({ ...CORE, inventory: 0 }).financialPosition!.quickRatioPct).toBe(250);
  });
});

/**
 * **綴りの読めない期は、基準日の古さの判定を黙らせない。** (2026-09-07)
 *
 * 実績の最新期は `isValidPeriod` で選別してから最大を取る。選別を外すと
 * 辞書順で 'garbage' のような文字列が「最新の期」になり、`balanceSheetFreshness`
 * は月として読めないので **`monthsBehind` を null にして所見も但し書きも出さない**
 * —— 1 件の壊れた期で、7 年古い貸借対照表の警告が消える。
 */
describe('実績の期の選別は、基準日の古さの判定を守る', () => {
  const OLD_BS = {
    asOf: '2019-03-31', currentAssets: 1_000_000, fixedAssets: 0,
    currentLiabilities: 500_000, fixedLiabilities: 0, netIncome: 0,
  } as const;
  const kpiAt = (period: string): KpiActual =>
    ({ period, unit: '全社', revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 0, depreciation: 0 });

  it('★ 読めない期が混じっても、正しい期の最大で古さを測る', () => {
    const o = buildBusinessOverview({
      plan: 'pro', sales: [], members: [],
      // 辞書順では 'garbage' が '2026-08' より後ろに来る。
      kpiActuals: [kpiAt('2026-08'), kpiAt('garbage')],
      balanceSheet: OLD_BS as never,
    });
    expect(o.balanceSheetFreshness).not.toBeNull();
    expect(o.balanceSheetFreshness!.latestPeriod).toBe('2026-08');
    expect(o.balanceSheetFreshness!.monthsBehind).toBe(89);
    expect(o.balanceSheetFreshness!.stale).toBe(true);
  });

  it('対照: 正しい期だけでも同じ答え (選別が正しい期を落としていない)', () => {
    const o = buildBusinessOverview({
      plan: 'pro', sales: [], members: [], kpiActuals: [kpiAt('2026-08')],
      balanceSheet: OLD_BS as never,
    });
    expect(o.balanceSheetFreshness!.monthsBehind).toBe(89);
  });

  it('期が 1 つも無ければ古さは測らない (条件を書かずに算定不能へ倒る)', () => {
    const o = buildBusinessOverview({
      plan: 'pro', sales: [], members: [], kpiActuals: [], balanceSheet: OLD_BS as never,
    });
    expect(o.balanceSheetFreshness).not.toBeNull();
    expect(o.balanceSheetFreshness!.monthsBehind).toBeNull();
    expect(o.balanceSheetFreshness!.stale).toBe(false);
  });
});

describe('kpi.duplicateActuals — 同じ期・事業の重複 (パス 124)', () => {
  it('★ 同じ (期間, 事業) が 2 件あれば census に載り、合計はその合算値のまま (断り書きが事実を述べる)', () => {
    const o = buildBusinessOverview({ plan: 'business', sales: [], kpiActuals: [...KPI, ...KPI], members: [] });
    expect(o.kpi.duplicateActuals).toEqual([{ period: '2026-05', unit: '全社', count: 2 }]);
    expect(o.kpi.revenue).toBe(200000);
  });

  it('対照: 重複が無ければ空', () => {
    const o = buildBusinessOverview({ plan: 'business', sales: [], kpiActuals: KPI, members: [] });
    expect(o.kpi.duplicateActuals).toEqual([]);
    expect(o.kpi.revenue).toBe(100000);
  });
});

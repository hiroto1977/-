/**
 * 経営サマリー — ここまで作った実データ機能 (売上集計 / KPI 実績 / チーム /
 * プラン) を 1 つの経営概況に束ねる純粋な集約ロジック。各機能の純粋関数を
 * 合成するだけで、IO は持たない (呼び出し側が record store から渡す)。
 */
import { summarizeSales, type SalesEntry } from './sales';
import {
  summarizeFundamentals,
  computeKpiMetrics,
  computeRevenueGrowthPct,
  computeRevenueCagrPct,
  computeRevenueTrend,
  computeRevenueLandingForecast,
  type KpiActual,
  type RevenueTrend,
  type RevenueLandingForecast,
} from './kpiActuals';
import { seatsRemaining, type Role } from '../../shared/team';
import { getPlan, type PlanTier } from '../../shared/plan';
import { computeBudgetVariance, type BudgetVariance } from './budgetVariance';

export interface OverviewInput {
  readonly plan: PlanTier;
  readonly sales: readonly SalesEntry[];
  readonly kpiActuals: readonly KpiActual[];
  /** 予算 (計画)。実績と同じ KpiActual 形。未入力なら BVA は出さない。 */
  readonly kpiBudgets?: readonly KpiActual[];
  /** Team members (only the count + roles matter here). */
  readonly members: readonly { readonly role: Role }[];
}

export interface BusinessOverview {
  readonly plan: { tier: PlanTier; label: string; audience: string };
  readonly sales: {
    totalAmount: number;
    totalOrders: number;
    aov: number;
    channelCount: number;
    topChannel: string | null;
  };
  readonly kpi: {
    hasData: boolean;
    revenue: number;
    operatingProfit: number;
    bep: number;
    safetyMargin: number;
    /** 売上総利益 (粗利) = 売上 − 売上原価。 */
    grossProfit: number;
    /** 売上総利益率 (粗利率, %)。 */
    grossMarginPct: number;
    /** 営業利益率 (%)。 */
    operatingMarginPct: number;
    /** EBITDA = 営業利益 + 減価償却費 (償却前営業利益)。 */
    ebitda: number;
    /** EBITDA マージン (%)。 */
    ebitdaMarginPct: number;
    /** 原価率 (%) = 売上原価 ÷ 売上。 */
    cogsRatioPct: number;
    /** 広告費比率 (%)。 */
    advertisingRatioPct: number;
    /** 販管費率 (%)。 */
    sgaRatioPct: number;
    /** 限界利益率 (%)。 */
    contributionRatio: number;
    /** 売上高成長率 (%, 直近期 vs 前期)。期が 2 つ未満なら null。 */
    revenueGrowthPct: number | null;
    /** 期間平均成長率 (CAGR 相当, 1 期あたり %)。期が 2 つ未満なら null。 */
    revenueCagrPct: number | null;
    /** 直近の売上トレンド (移動平均)。期が足りなければ null。 */
    revenueTrend: RevenueTrend;
    /** 当年度の売上着地見込み (ランレート年換算)。データが無ければ null。 */
    revenueLanding: RevenueLandingForecast | null;
  };
  readonly team: {
    members: number;
    seatLimit: number;
    seatsRemaining: number;
  };
  /** 生産性 (一人当たり) 指標。メンバーが 0 人なら per-capita は 0。 */
  readonly productivity: {
    members: number;
    /** 一人当たり売上。 */
    revenuePerCapita: number;
    /** 一人当たり営業利益。 */
    operatingProfitPerCapita: number;
  };
  /** 予算実績差異 (BVA)。予算が未入力なら null。 */
  readonly budget: BudgetVariance | null;
  /** Coarse health flags surfaced to the user. */
  readonly flags: {
    /** Operating profit is positive (KPI data present and profitable). */
    profitable: boolean;
    /** No seats left on the current plan. */
    seatsFull: boolean;
  };
}

export function buildBusinessOverview(input: OverviewInput): BusinessOverview {
  const planDef = getPlan(input.plan);

  const salesSummary = summarizeSales(input.sales);
  const topChannel = salesSummary.byChannel[0]?.label ?? null;

  const hasKpi = input.kpiActuals.length > 0;
  const fundamentals = summarizeFundamentals(input.kpiActuals);
  const kpi = computeKpiMetrics(fundamentals);

  const seatLimit = planDef.maxSeats;
  const remaining = seatsRemaining({ used: input.members.length, limit: seatLimit });

  const grossProfit = fundamentals.revenue - fundamentals.cogs;
  const pctOfRevenue = (n: number): number => (fundamentals.revenue > 0 ? (n / fundamentals.revenue) * 100 : 0);
  const grossMarginPct = pctOfRevenue(grossProfit);
  const operatingMarginPct = pctOfRevenue(kpi.operatingProfit);
  const ebitda = kpi.operatingProfit + fundamentals.depreciation;
  const ebitdaMarginPct = pctOfRevenue(ebitda);
  const memberCount = input.members.length;
  const perCapita = (n: number): number => (memberCount > 0 ? Math.round(n / memberCount) : 0);

  return {
    plan: { tier: planDef.id, label: planDef.label, audience: planDef.audience },
    sales: {
      totalAmount: salesSummary.totalAmount,
      totalOrders: salesSummary.totalOrders,
      aov: salesSummary.aov,
      channelCount: salesSummary.byChannel.length,
      topChannel,
    },
    kpi: {
      hasData: hasKpi,
      revenue: fundamentals.revenue,
      operatingProfit: kpi.operatingProfit,
      bep: kpi.bep,
      safetyMargin: kpi.safetyMargin,
      grossProfit,
      grossMarginPct,
      operatingMarginPct,
      ebitda,
      ebitdaMarginPct,
      cogsRatioPct: pctOfRevenue(fundamentals.cogs),
      advertisingRatioPct: pctOfRevenue(fundamentals.advertising),
      sgaRatioPct: pctOfRevenue(fundamentals.sga),
      contributionRatio: kpi.contributionRatio,
      revenueGrowthPct: computeRevenueGrowthPct(input.kpiActuals),
      revenueCagrPct: computeRevenueCagrPct(input.kpiActuals),
      revenueTrend: computeRevenueTrend(input.kpiActuals),
      revenueLanding: computeRevenueLandingForecast(input.kpiActuals),
    },
    team: {
      members: memberCount,
      seatLimit,
      seatsRemaining: remaining,
    },
    productivity: {
      members: memberCount,
      revenuePerCapita: perCapita(fundamentals.revenue),
      operatingProfitPerCapita: perCapita(kpi.operatingProfit),
    },
    budget: computeBudgetVariance(input.kpiBudgets ?? [], input.kpiActuals),
    flags: {
      profitable: hasKpi && kpi.operatingProfit > 0,
      seatsFull: remaining === 0,
    },
  };
}

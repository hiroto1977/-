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
  computeYoYGrowth,
  computeLaborMetrics,
  type KpiActual,
  type RevenueTrend,
  type RevenueLandingForecast,
  type LaborMetrics,
  type YoYComparison,
} from './kpiActuals';
import { seatsRemaining, type Role } from '../../shared/team';
import { getPlan, type PlanTier } from '../../shared/plan';
import { computeBudgetVariance, type BudgetVariance } from './budgetVariance';
import { computeBalanceSheetMetrics, type BalanceSheet, type BalanceSheetMetrics } from './balanceSheet';
import { computeCashConversionCycle, type CashConversionCycle } from './workingCapital';
import { forecastCashBalance, type CashForecast } from './cashForecast';
import { computeRevenueConcentration, type RevenueConcentration } from './revenueConcentration';
import { computeTrendAlerts, type TrendAlerts } from './trendAlerts';
import { summarizeAccounting, computeRunwayMonths, type AccountingMonthly, type AccountingSummary } from './accounting';

export interface OverviewInput {
  readonly plan: PlanTier;
  readonly sales: readonly SalesEntry[];
  readonly kpiActuals: readonly KpiActual[];
  /** 予算 (計画)。実績と同じ KpiActual 形。未入力なら BVA は出さない。 */
  readonly kpiBudgets?: readonly KpiActual[];
  /** 貸借対照表 (最新の1時点)。未入力なら財政状態指標は出さない。 */
  readonly balanceSheet?: BalanceSheet | null;
  /** 会計連携 (freee 等) の月次キャッシュフロー。未連携なら空。 */
  readonly accounting?: readonly AccountingMonthly[];
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
    /** 売上集中度 (チャネル依存リスク)。売上が無ければ null。 */
    concentration: RevenueConcentration | null;
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
    /** 前年同月比 (YoY)。前年同月のデータが無ければ null。 */
    yoy: YoYComparison | null;
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
    /** 人件費の効率指標 (労働分配率・人件費率・一人当たり人件費)。 */
    labor: LaborMetrics;
  };
  /** 予算実績差異 (BVA)。予算が未入力なら null。 */
  readonly budget: BudgetVariance | null;
  /** 財政状態指標 (ROA/ROE/自己資本比率/流動比率)。BS 未入力なら null。 */
  readonly financialPosition: BalanceSheetMetrics | null;
  /** 運転資金 (CCC)。BS 未入力 or 売上が無いなら null。 */
  readonly workingCapital: CashConversionCycle | null;
  /** 会計連携の月次キャッシュフロー要約。未連携なら null。 */
  readonly accounting: AccountingSummary | null;
  /** 資金ランウェイ (月数)。会計連携CF と現預金が揃い、かつ資金流出時のみ。 */
  readonly runwayMonths: number | null;
  /** 月次キャッシュ予測 (現預金を起点に会計CFを外挿)。会計連携+現預金が揃うと算定。 */
  readonly cashForecast: CashForecast | null;
  /** 月次トレンドのアラート (売上・営業利益の連続下落検知)。 */
  readonly trendAlerts: TrendAlerts;
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
  const accountingSummary = summarizeAccounting(input.accounting ?? []);

  return {
    plan: { tier: planDef.id, label: planDef.label, audience: planDef.audience },
    sales: {
      totalAmount: salesSummary.totalAmount,
      totalOrders: salesSummary.totalOrders,
      aov: salesSummary.aov,
      channelCount: salesSummary.byChannel.length,
      topChannel,
      concentration: computeRevenueConcentration(salesSummary.byChannel),
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
      yoy: computeYoYGrowth(input.kpiActuals),
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
      labor: computeLaborMetrics(input.kpiActuals, memberCount),
    },
    budget: computeBudgetVariance(input.kpiBudgets ?? [], input.kpiActuals),
    financialPosition: input.balanceSheet ? computeBalanceSheetMetrics(input.balanceSheet) : null,
    workingCapital: input.balanceSheet && hasKpi
      ? computeCashConversionCycle({
          accountsReceivable: input.balanceSheet.accountsReceivable,
          inventory: input.balanceSheet.inventory,
          accountsPayable: input.balanceSheet.accountsPayable,
          revenue: fundamentals.revenue,
          cogs: fundamentals.cogs,
        })
      : null,
    accounting: accountingSummary,
    runwayMonths: accountingSummary && input.balanceSheet && (input.balanceSheet.cash ?? 0) > 0
      ? computeRunwayMonths(input.balanceSheet.cash ?? 0, accountingSummary.avgMonthlyNet)
      : null,
    cashForecast: accountingSummary && input.balanceSheet && (input.balanceSheet.cash ?? 0) > 0
      ? forecastCashBalance(input.balanceSheet.cash ?? 0, accountingSummary.avgMonthlyNet, 12)
      : null,
    trendAlerts: computeTrendAlerts(input.kpiActuals),
    flags: {
      profitable: hasKpi && kpi.operatingProfit > 0,
      seatsFull: remaining === 0,
    },
  };
}

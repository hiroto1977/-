/**
 * 経営サマリー — ここまで作った実データ機能 (売上集計 / KPI 実績 / チーム /
 * プラン) を 1 つの経営概況に束ねる純粋な集約ロジック。各機能の純粋関数を
 * 合成するだけで、IO は持たない (呼び出し側が record store から渡す)。
 */
import { summarizeSales, type SalesEntry } from './sales';
import { summarizeFundamentals, computeKpiMetrics, type KpiActual } from './kpiActuals';
import { seatsRemaining, type Role } from '../../shared/team';
import { getPlan, type PlanTier } from '../../shared/plan';

export interface OverviewInput {
  readonly plan: PlanTier;
  readonly sales: readonly SalesEntry[];
  readonly kpiActuals: readonly KpiActual[];
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
  };
  readonly team: {
    members: number;
    seatLimit: number;
    seatsRemaining: number;
  };
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
    },
    team: {
      members: input.members.length,
      seatLimit,
      seatsRemaining: remaining,
    },
    flags: {
      profitable: hasKpi && kpi.operatingProfit > 0,
      seatsFull: remaining === 0,
    },
  };
}

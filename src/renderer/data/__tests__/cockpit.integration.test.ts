import { describe, expect, it } from 'vitest';
import { buildBusinessOverview } from '../overview';
import { buildManagementScorecard } from '../../../shared/managementScorecard';
import { buildManagementHighlights } from '../managementHighlights';
import { buildManagementReport } from '../managementReport';
import { monthlyTrendSeries, summarizeFundamentals, type KpiActual } from '../kpiActuals';
import { profitSensitivity, breakEvenDeltaPct, operatingLeverage } from '../profitSensitivity';
import type { SalesEntry } from '../sales';
import type { BalanceSheet } from '../balanceSheet';
import type { AccountingMonthly } from '../accounting';

/**
 * 仮想データによる経営コックピットの統合(エンドツーエンド)稼働テスト。
 *
 * 入力(売上・KPI実績・予算・貸借対照表・会計連携CF・メンバー)を一通り与え、
 * overview → scorecard → highlights → report のパイプラインが一貫した結果を
 * 返し、クラッシュしないことを確認する。各純粋関数の単体テストは別途存在するが、
 * ここでは「組み合わせて現実的なデータで動くか」を検証する。
 */

// 6 か月分の成長する事業 (前年同月 2025-05 も含む)。
const KPI: KpiActual[] = [
  { period: '2025-05', unit: '全社', revenue: 1_000_000, cogs: 400_000, advertising: 90_000, sga: 220_000, depreciation: 40_000, laborCost: 180_000 },
  { period: '2026-01', unit: '全社', revenue: 1_120_000, cogs: 440_000, advertising: 90_000, sga: 220_000, depreciation: 40_000, laborCost: 180_000 },
  { period: '2026-02', unit: '全社', revenue: 1_240_000, cogs: 480_000, advertising: 90_000, sga: 220_000, depreciation: 40_000, laborCost: 180_000 },
  { period: '2026-03', unit: '全社', revenue: 1_360_000, cogs: 520_000, advertising: 90_000, sga: 220_000, depreciation: 40_000, laborCost: 180_000 },
  { period: '2026-04', unit: '全社', revenue: 1_480_000, cogs: 560_000, advertising: 90_000, sga: 220_000, depreciation: 40_000, laborCost: 180_000 },
  { period: '2026-05', unit: '全社', revenue: 1_600_000, cogs: 600_000, advertising: 90_000, sga: 220_000, depreciation: 40_000, laborCost: 180_000 },
];
const BUDGET: KpiActual[] = [
  { period: '2026-05', unit: '全社', revenue: 1_500_000, cogs: 560_000, advertising: 90_000, sga: 220_000, depreciation: 40_000 },
];
const SALES: SalesEntry[] = [
  { date: '2026-05-01', channel: 'amazon', amount: 700_000, orders: 140 },
  { date: '2026-05-02', channel: 'shopify', amount: 300_000, orders: 50 },
  { date: '2026-05-03', channel: 'rakuten', amount: 200_000, orders: 40 },
];
const BS: BalanceSheet = {
  asOf: '2026-05-31', currentAssets: 8_000_000, cash: 5_000_000, inventory: 1_500_000, accountsReceivable: 1_800_000,
  fixedAssets: 6_000_000, currentLiabilities: 3_000_000, accountsPayable: 1_200_000, fixedLiabilities: 4_000_000, netIncome: 1_200_000,
};
const ACCOUNTING: AccountingMonthly[] = [
  { month: '2026-04', income: 1_480_000, expense: 1_300_000, net: 180_000 },
  { month: '2026-05', income: 1_600_000, expense: 1_350_000, net: 250_000 },
];
const MEMBERS = [{ role: 'owner' as const }, { role: 'admin' as const }, { role: 'member' as const }, { role: 'member' as const }];

function cockpit() {
  const overview = buildBusinessOverview({
    plan: 'enterprise', sales: SALES, kpiActuals: KPI, kpiBudgets: BUDGET,
    balanceSheet: BS, accounting: ACCOUNTING, members: MEMBERS,
  });
  const f = summarizeFundamentals(KPI);
  const scorecard = buildManagementScorecard({
    operatingMarginPct: overview.kpi.operatingMarginPct,
    grossMarginPct: overview.kpi.grossMarginPct,
    safetyMarginPct: overview.kpi.safetyMargin,
    equityRatioPct: overview.financialPosition?.equityRatioPct ?? undefined,
    revenueGrowthPct: overview.kpi.revenueGrowthPct ?? undefined,
    cashConversionDays: overview.workingCapital?.ccc ?? undefined,
  });
  const highlights = buildManagementHighlights(overview, { thresholds: { declineWarnStreak: 2, declineCriticalStreak: 3, laborShareWarnPct: 60, singleChannelWarnPct: 60 } });
  const trend = monthlyTrendSeries(KPI);
  const report = buildManagementReport(overview, scorecard, highlights, '2026-05-31', trend, breakEvenDeltaPct(f));
  return { overview, scorecard, highlights, trend, report, f };
}

describe('management cockpit — virtual-data integration', () => {
  it('aggregates a coherent overview across all input domains', () => {
    const { overview } = cockpit();
    expect(overview.kpi.hasData).toBe(true);
    // 6 periods summed: revenue 7,800,000
    expect(overview.kpi.revenue).toBe(7_800_000);
    expect(overview.kpi.operatingProfit).toBeGreaterThan(0);
    expect(overview.sales.totalAmount).toBe(1_200_000);
    expect(overview.financialPosition).not.toBeNull();
    expect(overview.financialPosition!.equityRatioPct).toBeGreaterThan(0);
    expect(overview.workingCapital).not.toBeNull();
    expect(overview.accounting).not.toBeNull();
    expect(overview.budget).not.toBeNull();
    expect(overview.kpi.yoy).not.toBeNull(); // 2026-05 vs 2025-05 present
  });

  it('produces a scorecard with a valid 0..100 score and verdict', () => {
    const { scorecard } = cockpit();
    expect(scorecard.overallScore).toBeGreaterThanOrEqual(0);
    expect(scorecard.overallScore).toBeLessThanOrEqual(100);
    expect(['poor', 'caution', 'good', 'excellent']).toContain(scorecard.verdict);
    // every category score is null or within range
    for (const c of scorecard.categories) {
      if (c.score !== null) {
        expect(c.score).toBeGreaterThanOrEqual(0);
        expect(c.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('emits highlights sorted by severity (critical → warning → good)', () => {
    const { highlights } = cockpit();
    const order = { critical: 0, warning: 1, good: 2 } as const;
    for (let i = 1; i < highlights.length; i += 1) {
      expect(order[highlights[i]!.severity]).toBeGreaterThanOrEqual(order[highlights[i - 1]!.severity]);
    }
    // growing, profitable business → expect at least one positive highlight
    expect(highlights.some((h) => h.severity === 'good')).toBe(true);
  });

  it('builds a complete markdown report containing every major section', () => {
    const { report } = cockpit();
    for (const section of ['# 経営レポート', '## 総合判定', '## 損益 (P&L)', '## 財政状態 (BS)', '## 資金繰り (CF)', '## 予算実績差異 (BVA)', '## 月次推移']) {
      expect(report).toContain(section);
    }
    expect(report).toContain('前年同月比 (YoY)');
    expect(report).toContain('財務・税務助言ではありません');
  });

  it('keeps the monthly trend internally consistent (MoM matches series)', () => {
    const { trend } = cockpit();
    expect(trend).toHaveLength(6);
    // each month grows vs the prior → positive MoM after the first
    for (let i = 1; i < trend.length; i += 1) {
      expect(trend[i]!.revenueGrowthPct).not.toBeNull();
      expect(trend[i]!.revenueGrowthPct!).toBeGreaterThan(0);
    }
  });

  it('sensitivity, break-even room and operating leverage are mutually consistent', () => {
    const { f } = cockpit();
    const rows = profitSensitivity(f);
    const base = rows.find((r) => r.deltaPct === 0)!;
    expect(base.operatingProfit).toBe(summarizeFundamentals(KPI).revenue - (f.cogs + f.advertising) - (f.sga + f.depreciation));
    // profitable → break-even delta negative, DOL finite & > 1
    expect(breakEvenDeltaPct(f)!).toBeLessThan(0);
    const dol = operatingLeverage(f)!;
    expect(dol).toBeGreaterThan(1);
    // +10% revenue scenario profit increase ≈ DOL relationship (sanity: higher revenue → higher profit)
    const up = rows.find((r) => r.deltaPct === 10)!;
    expect(up.operatingProfit).toBeGreaterThan(base.operatingProfit);
  });

  it('degrades gracefully with empty inputs (no crash, nulls where expected)', () => {
    const empty = buildBusinessOverview({ plan: 'free', sales: [], kpiActuals: [], members: [] });
    expect(empty.kpi.hasData).toBe(false);
    expect(empty.financialPosition).toBeNull();
    expect(empty.accounting).toBeNull();
    expect(empty.budget).toBeNull();
    const sc = buildManagementScorecard({});
    const hl = buildManagementHighlights(empty);
    expect(Array.isArray(hl)).toBe(true);
    // report still builds without throwing
    const report = buildManagementReport(empty, sc, hl, '2026-05-31', [], null);
    expect(report).toContain('# 経営レポート');
  });
});

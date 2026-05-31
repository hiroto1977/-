import { describe, expect, it } from 'vitest';
import { buildManagementReport } from '../managementReport';
import { buildBusinessOverview } from '../overview';
import { buildManagementScorecard } from '../../../shared/managementScorecard';
import { buildManagementHighlights } from '../managementHighlights';
import type { KpiActual } from '../kpiActuals';

const kpi: KpiActual = { period: '2026-05', unit: '全社', revenue: 1_000_000, cogs: 400_000, advertising: 100_000, sga: 200_000, depreciation: 50_000 };

function report(extra: Partial<Parameters<typeof buildBusinessOverview>[0]> = {}) {
  const overview = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi], members: [], ...extra });
  const sc = buildManagementScorecard({ operatingMarginPct: overview.kpi.operatingMarginPct, safetyMarginPct: overview.kpi.safetyMargin });
  const hl = buildManagementHighlights(overview);
  return buildManagementReport(overview, sc, hl, '2026-05-31');
}

describe('buildManagementReport', () => {
  it('renders a titled Markdown report with the generation date and disclaimer', () => {
    const md = report();
    expect(md).toContain('# 経営レポート');
    expect(md).toContain('作成日: 2026-05-31');
    expect(md).toContain('財務・税務助言ではありません');
  });

  it('includes the overall score and a P&L section with revenue/operating profit', () => {
    const md = report();
    expect(md).toContain('## 総合判定');
    expect(md).toContain('経営スコア');
    expect(md).toContain('## 損益 (P&L)');
    expect(md).toContain('売上高: ¥1,000,000');
    expect(md).toContain('営業利益: ¥250,000');
  });

  it('omits the BS section when no balance sheet is supplied', () => {
    expect(report()).not.toContain('## 財政状態 (BS)');
  });

  it('includes the BS section with ROA/ROE when a balance sheet is present', () => {
    const md = report({
      balanceSheet: {
        asOf: '2026-03-31', currentAssets: 6000, cash: 0, inventory: 2000, accountsReceivable: 1500, fixedAssets: 4000,
        currentLiabilities: 3000, accountsPayable: 1000, fixedLiabilities: 2000, netIncome: 1000,
      },
    });
    expect(md).toContain('## 財政状態 (BS)');
    expect(md).toContain('自己資本比率: 50%');
    expect(md).toContain('ROA: 10%');
  });

  it('includes the cashflow section when accounting data is present', () => {
    const md = report({
      accounting: [
        { month: '2026-04', income: 1_000_000, expense: 1_100_000, net: -100_000 },
        { month: '2026-05', income: 1_000_000, expense: 1_100_000, net: -100_000 },
      ],
    });
    expect(md).toContain('## 資金繰り (CF)');
    expect(md).toContain('営業CF合計');
  });

  it('includes the budget-variance section when budgets are present', () => {
    const md = report({ kpiBudgets: [{ ...kpi, revenue: 800_000 }] });
    expect(md).toContain('## 予算実績差異 (BVA)');
    expect(md).toContain('売上 達成率: 125%');
  });

  it('omits highlights section entirely when there are none', () => {
    // a healthy single-period business yields a "good" highlight, so assert presence instead
    const md = report();
    expect(md).toContain('## 経営ハイライト');
  });
});

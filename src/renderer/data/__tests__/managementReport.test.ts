import { describe, expect, it } from 'vitest';
import { buildManagementReport } from '../managementReport';
import { buildBusinessOverview } from '../overview';
import { buildManagementScorecard } from '../../../shared/managementScorecard';
import { buildManagementHighlights } from '../managementHighlights';
import { monthlyTrendSeries, type KpiActual } from '../kpiActuals';

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

  it('omits the monthly-trend table when fewer than two periods are supplied', () => {
    const overview = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi], members: [] });
    const sc = buildManagementScorecard({});
    const md = buildManagementReport(overview, sc, [], '2026-05-31', monthlyTrendSeries([kpi]));
    expect(md).not.toContain('## 月次推移');
  });

  it('renders a Markdown monthly-trend table when two or more periods are supplied', () => {
    const periods: KpiActual[] = [
      { ...kpi, period: '2026-04', revenue: 1_000_000 },
      { ...kpi, period: '2026-05', revenue: 1_200_000 },
    ];
    const overview = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: periods, members: [] });
    const sc = buildManagementScorecard({});
    const md = buildManagementReport(overview, sc, [], '2026-05-31', monthlyTrendSeries(periods));
    expect(md).toContain('## 月次推移');
    expect(md).toContain('| 期間 | 売上高 | 営業利益 | 営業利益率 | 前期比 |');
    expect(md).toContain('| 2026-04 |');
    expect(md).toContain('+20%'); // 2026-05 growth
  });

  it('includes the break-even room line when a delta is supplied', () => {
    const overview = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi], members: [] });
    const sc = buildManagementScorecard({});
    const md = buildManagementReport(overview, sc, [], '2026-05-31', [], -50);
    expect(md).toContain('損益分岐点までの売上余地: -50%');
  });

  it('omits the break-even room line when null', () => {
    const overview = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi], members: [] });
    const sc = buildManagementScorecard({});
    const md = buildManagementReport(overview, sc, [], '2026-05-31', [], null);
    expect(md).not.toContain('損益分岐点までの売上余地');
  });

  it('includes a YoY line when the prior-year same month is present', () => {
    const periods: KpiActual[] = [
      { ...kpi, period: '2025-05', revenue: 1_000_000 },
      { ...kpi, period: '2026-05', revenue: 1_200_000 },
    ];
    const overview = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: periods, members: [] });
    const sc = buildManagementScorecard({});
    const md = buildManagementReport(overview, sc, [], '2026-05-31');
    expect(md).toContain('前年同月比 (YoY): +20% (2026-05 vs 2025-05)');
  });

  it('omits the YoY line when no prior-year month is available', () => {
    const md = report(); // single 2026-05 period only
    expect(md).not.toContain('前年同月比 (YoY)');
  });
});

/**
 * 変異テスト網羅 — レポートは決定論的な Markdown ビルダーなので、全セクションを満たした
 * 入力に対する完全一致 (golden) で StringLiteral / ObjectLiteral / ArrowFunction /
 * EqualityOperator を一括撃墜し、各セクション欠落・境界値テストで ConditionalExpression の
 * 両方向を撃墜する。overview は read されるフィールドのみを直接構築する。
 */
describe('buildManagementReport — exhaustive mutation coverage', () => {
  type Ov = Parameters<typeof buildManagementReport>[0];
  type Sc = Parameters<typeof buildManagementReport>[1];
  type Hl = Parameters<typeof buildManagementReport>[2];
  type Tr = NonNullable<Parameters<typeof buildManagementReport>[4]>;

  const ov = (p: any = {}): Ov => ({
    plan: { label: 'Pro' },
    kpi: {
      hasData: true, revenue: 1_000_000, operatingProfit: 250_000, operatingMarginPct: 25,
      grossProfit: 600_000, grossMarginPct: 60, ebitda: 300_000, ebitdaMarginPct: 30,
      bep: 800_000, safetyMargin: 20, revenueGrowthPct: 15,
      yoy: { revenueYoYPct: 10, period: '2026-05', priorPeriod: '2025-05' },
      ...p.kpi,
    },
    financialPosition: 'fp' in p ? p.fp : null,
    accounting: 'accounting' in p ? p.accounting : null,
    runwayMonths: 'runwayMonths' in p ? p.runwayMonths : null,
    cashForecast: 'cashForecast' in p ? p.cashForecast : null,
    budget: 'budget' in p ? p.budget : null,
  }) as any as Ov;

  const sc: Sc = {
    overallScore: 80, verdict: 'good',
    categories: [{ label: '収益性', score: 75 }, { label: '安全性', score: null }],
  } as any as Sc;
  const hl: Hl = [
    { severity: 'critical', category: '収益性', message: '営業赤字です。' },
    { severity: 'good', category: '安全性', message: '安全です。' },
  ];
  const trend: Tr = [
    { period: '2026-04', revenue: 1_000_000, operatingProfit: 200_000, operatingMarginPct: 20, revenueGrowthPct: null },
    { period: '2026-05', revenue: 1_200_000, operatingProfit: 300_000, operatingMarginPct: 25, revenueGrowthPct: 20 },
  ] as any as Tr;

  it('maps every verdict to its Japanese label', () => {
    const cases = [['poor', '要改善'], ['caution', '注意'], ['good', '良好'], ['excellent', '優良']] as const;
    for (const [verdict, label] of cases) {
      const s = { overallScore: 50, verdict, categories: [] } as any as Sc;
      expect(buildManagementReport(ov({ kpi: { hasData: false } }), s, [], '2026-05-31')).toContain(`**50 / 100** (${label})`);
    }
  });

  it('marks each highlight severity with its emoji (incl. warning 🟡)', () => {
    const marks: Hl = [
      { severity: 'critical', category: 'A', message: 'a' },
      { severity: 'warning', category: 'B', message: 'b' },
      { severity: 'good', category: 'C', message: 'c' },
    ];
    const md = buildManagementReport(ov({ kpi: { hasData: false } }), sc, marks, '2026-05-31');
    expect(md).toContain('- 🔴 [A] a');
    expect(md).toContain('- 🟡 [B] b');
    expect(md).toContain('- 🟢 [C] c');
  });

  it('prepends a risk-summary line to the highlights section', () => {
    const marks: Hl = [
      { severity: 'critical', category: 'A', message: 'a' },
      { severity: 'warning', category: 'B', message: 'b' },
      { severity: 'good', category: 'C', message: 'c' },
      { severity: 'good', category: 'D', message: 'd' },
    ];
    const md = buildManagementReport(ov({ kpi: { hasData: false } }), sc, marks, '2026-05-31');
    expect(md).toContain('総合リスク: **要対応** — 🔴 1 / 🟡 1 / 🟢 2 (計 4 件)');
  });

  it('renders the complete report exactly (golden — kills every literal/label)', () => {
    const full = ov({
      fp: { equityRatioPct: 50, currentRatioPct: 200, roaPct: 10, roePct: 20, insolvent: false },
      accounting: { totalNet: 500_000, avgMonthlyNet: 50_000 },
      runwayMonths: 12,
      cashForecast: { shortfallMonthIndex: 6 },
      budget: {
        revenue: { achievementPct: 125, budget: 800_000, actual: 1_000_000 },
        operatingProfit: { achievementPct: 110 },
      },
    });
    const md = buildManagementReport(full, sc, hl, '2026-05-31', trend, 50);
    expect(md).toBe(
      [
        '# 経営レポート (Pro プラン)',
        '',
        '作成日: 2026-05-31',
        '',
        '> ※ 本レポートは入力済みデータからの概算の経営診断であり、財務・税務助言ではありません。',
        '',
        '## 総合判定',
        '',
        '- 経営スコア: **80 / 100** (良好)',
        '- 収益性: 75 / 100',
        '',
        '## 経営ハイライト',
        '',
        '総合リスク: **要対応** — 🔴 1 / 🟡 0 / 🟢 1 (計 2 件)',
        '',
        '- 🔴 [収益性] 営業赤字です。',
        '- 🟢 [安全性] 安全です。',
        '',
        '## 損益 (P&L)',
        '',
        '- 売上高: ¥1,000,000',
        '- 営業利益: ¥250,000 (営業利益率 25.0%)',
        '- 売上総利益: ¥600,000 (粗利率 60.0%)',
        '- EBITDA: ¥300,000 (マージン 30.0%)',
        '- 損益分岐点: ¥800,000 / 安全余裕率 20.0%',
        '- 前期比成長率: 15%',
        '- 前年同月比 (YoY): +10% (2026-05 vs 2025-05)',
        '- 損益分岐点までの売上余地: +50%',
        '',
        '## 財政状態 (BS)',
        '',
        '- 自己資本比率: 50% / 流動比率: 200%',
        '- ROA: 10% / ROE: 20%',
        '',
        '## 資金繰り (CF)',
        '',
        '- 営業CF合計: ¥500,000 (月次平均 ¥50,000)',
        '- 資金ランウェイ: 12 か月',
        '- 資金ショート予測: 6 か月後',
        '',
        '## 予算実績差異 (BVA)',
        '',
        '- 売上 達成率: 125% (予算 ¥800,000 / 実績 ¥1,000,000)',
        '- 営業利益 達成率: 110%',
        '',
        '## 月次推移',
        '',
        '| 期間 | 売上高 | 営業利益 | 営業利益率 | 前期比 |',
        '| --- | ---: | ---: | ---: | ---: |',
        '| 2026-04 | ¥1,000,000 | ¥200,000 | 20.0% | — |',
        '| 2026-05 | ¥1,200,000 | ¥300,000 | 25.0% | +20% |',
        '',
      ].join('\n'),
    );
  });

  it('rounds yen via Math.round (kills the rounding arithmetic)', () => {
    // 1,000,000.6 → ¥1,000,001 (四捨五入)。Math.round を消す/別演算にする変異を撃墜。
    const md = buildManagementReport(ov({ kpi: { revenue: 1_000_000.6 } }), sc, [], '2026-05-31');
    expect(md).toContain('売上高: ¥1,000,001');
  });

  it('shows — for a non-finite break-even point', () => {
    const md = buildManagementReport(ov({ kpi: { bep: Infinity } }), sc, [], '2026-05-31');
    expect(md).toContain('損益分岐点: — / 安全余裕率');
  });

  it('omits the P&L section when kpi has no data (hasData guard)', () => {
    expect(buildManagementReport(ov({ kpi: { hasData: false } }), sc, [], '2026-05-31')).not.toContain('## 損益 (P&L)');
  });

  it('omits the highlights section when there are none (length > 0, strict)', () => {
    expect(buildManagementReport(ov(), sc, [], '2026-05-31')).not.toContain('## 経営ハイライト');
  });

  it('omits an individual category line when its score is null', () => {
    // 安全性 score=null → 行なし。c.score !== null ガードの両方向と StringLiteral を撃墜。
    const md = buildManagementReport(ov(), sc, [], '2026-05-31');
    expect(md).toContain('- 収益性: 75 / 100');
    expect(md).not.toContain('安全性:');
  });

  it('omits growth / YoY / break-even lines when their values are null', () => {
    const md = buildManagementReport(ov({ kpi: { revenueGrowthPct: null, yoy: null } }), sc, [], '2026-05-31', [], null);
    expect(md).toContain('## 損益 (P&L)');
    expect(md).not.toContain('前期比成長率');
    expect(md).not.toContain('前年同月比 (YoY)');
    expect(md).not.toContain('損益分岐点までの売上余地');
  });

  it('omits the YoY line when yoy is present but its pct is null (inner guard)', () => {
    const md = buildManagementReport(ov({ kpi: { yoy: { revenueYoYPct: null, period: '2026-05', priorPeriod: '2025-05' } } }), sc, [], '2026-05-31');
    expect(md).not.toContain('前年同月比 (YoY)');
  });

  it('signs YoY / break-even at zero and negative (kills the > 0 sign ternaries)', () => {
    const zero = buildManagementReport(ov({ kpi: { yoy: { revenueYoYPct: 0, period: '2026-05', priorPeriod: '2025-05' } } }), sc, [], '2026-05-31', [], 0);
    expect(zero).toContain('前年同月比 (YoY): 0% (2026-05 vs 2025-05)');
    expect(zero).toContain('損益分岐点までの売上余地: 0%');
    const neg = buildManagementReport(ov({ kpi: { yoy: { revenueYoYPct: -10, period: '2026-05', priorPeriod: '2025-05' } } }), sc, [], '2026-05-31', [], -50);
    expect(neg).toContain('前年同月比 (YoY): -10%');
    expect(neg).toContain('損益分岐点までの売上余地: -50%');
  });

  it('flags insolvency in the BS section and omits the flag when solvent', () => {
    const insolvent = buildManagementReport(
      ov({ fp: { equityRatioPct: -5, currentRatioPct: 80, roaPct: -2, roePct: -10, insolvent: true } }), sc, [], '2026-05-31');
    expect(insolvent).toContain('- ⚠ 純資産がマイナス (債務超過) です。');
    const solvent = buildManagementReport(
      ov({ fp: { equityRatioPct: 50, currentRatioPct: 200, roaPct: 10, roePct: 20, insolvent: false } }), sc, [], '2026-05-31');
    expect(solvent).toContain('## 財政状態 (BS)');
    expect(solvent).not.toContain('純資産がマイナス');
  });

  it('renders — for null BS ratios (pctOrDash null branch)', () => {
    const md = buildManagementReport(
      ov({ fp: { equityRatioPct: null, currentRatioPct: null, roaPct: null, roePct: null, insolvent: false } }), sc, [], '2026-05-31');
    expect(md).toContain('- 自己資本比率: — / 流動比率: —');
    expect(md).toContain('- ROA: — / ROE: —');
  });

  it('omits runway / shortfall lines when null while keeping the CF section', () => {
    const md = buildManagementReport(
      ov({ accounting: { totalNet: 100, avgMonthlyNet: 50 }, runwayMonths: null, cashForecast: { shortfallMonthIndex: null } }),
      sc, [], '2026-05-31');
    expect(md).toContain('## 資金繰り (CF)');
    expect(md).toContain('- 営業CF合計: ¥100 (月次平均 ¥50)');
    expect(md).not.toContain('資金ランウェイ');
    expect(md).not.toContain('資金ショート予測');
  });

  it('omits BS / CF / BVA / trend sections entirely when their data is absent', () => {
    const md = buildManagementReport(ov(), sc, [], '2026-05-31', trend.slice(0, 1));
    expect(md).not.toContain('## 財政状態 (BS)');
    expect(md).not.toContain('## 資金繰り (CF)');
    expect(md).not.toContain('## 予算実績差異 (BVA)');
    expect(md).not.toContain('## 月次推移'); // 1 期のみ → テーブルなし (>= 2 strict)
  });

  it('signs a negative growth row in the monthly-trend table and dashes a null one', () => {
    const rows = [
      { period: '2026-03', revenue: 1_000_000, operatingProfit: 100_000, operatingMarginPct: 10, revenueGrowthPct: null },
      { period: '2026-04', revenue: 900_000, operatingProfit: 50_000, operatingMarginPct: 5.5, revenueGrowthPct: -10 },
      { period: '2026-05', revenue: 900_000, operatingProfit: 50_000, operatingMarginPct: 5.5, revenueGrowthPct: 0 },
    ] as any as Tr;
    const md = buildManagementReport(ov(), sc, [], '2026-05-31', rows);
    expect(md).toContain('| 2026-03 | ¥1,000,000 | ¥100,000 | 10.0% | — |');
    expect(md).toContain('| 2026-04 | ¥900,000 | ¥50,000 | 5.5% | -10% |');
    expect(md).toContain('| 2026-05 | ¥900,000 | ¥50,000 | 5.5% | 0% |');
  });
});

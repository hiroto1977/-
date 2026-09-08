import { describe, expect, it } from 'vitest';
import { buildManagementReport } from '../managementReport';
import { buildBusinessOverview } from '../overview';
import { buildManagementScorecard } from '../../../shared/managementScorecard';
import { buildManagementHighlights } from '../managementHighlights';
import { monthlyTrendSeries, type KpiActual } from '../kpiActuals';
import { NO_MANUAL_OVERRIDES } from '../overviewOverrides';

/** 手入力の上書きなし。**明示して渡す** (既定値を置かない — 経緯は `overviewOverrides.ts`)。 */
const MANUAL = NO_MANUAL_OVERRIDES;

const kpi: KpiActual = { period: '2026-05', unit: '全社', revenue: 1_000_000, cogs: 400_000, advertising: 100_000, sga: 200_000, depreciation: 50_000 };

function report(extra: Partial<Parameters<typeof buildBusinessOverview>[0]> = {}) {
  const overview = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi], members: [], ...extra });
  const sc = buildManagementScorecard({ operatingMarginPct: overview.kpi.operatingMarginPct ?? undefined, safetyMarginPct: overview.kpi.safetyMargin ?? undefined });
  const hl = buildManagementHighlights(overview);
  return buildManagementReport(overview, sc, hl, '2026-05-31', MANUAL);
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

  /**
   * **このレポートは書面と同じ相手に渡る。** (2026-09-08)
   *
   * 前文に「役員会・銀行・税理士への共有にご利用ください」と書いてある。ところが
   * 金融機関等提出用の書面がパス 34/35/43/46 で足してきた「期間・基準日・会計の窓」の
   * 断り書きは、**このレポートには 1 つも無かった** (パス 47 で予実に足した 1 つを除く)。
   * 「どの節が期間を述べるか」の表を作って数えたら、面ごと空だった。
   */
  it('★ 損益の節が対象期間を書く (期間に比例する金額なので)', () => {
    const md = report();
    expect(md).toContain('- 対象期間: 2026-05〜2026-05・1 か月 (以下の金額はこの期間の累計)');
  });

  it('★ 対象期間は事業の行数ではなく期の異なり数 (2 事業 × 2 か月 = 2 か月)', () => {
    const md = report({
      kpiActuals: ['2026-04', '2026-05'].flatMap((period) => [
        { ...kpi, period, unit: 'A' },
        { ...kpi, period, unit: 'B' },
      ]),
    });
    expect(md).toContain('- 対象期間: 2026-04〜2026-05・2 か月 (以下の金額はこの期間の累計)');
  });

  it('★ 財政状態の節が基準日を書き、実績と隔たれば警告する', () => {
    const stale = report({
      balanceSheet: {
        asOf: '2019-03-31', currentAssets: 1000, inventory: 0, accountsReceivable: 0,
        fixedAssets: 1000, currentLiabilities: 500, accountsPayable: 0, fixedLiabilities: 200, netIncome: 100,
      },
    });
    expect(stale).toContain('- 基準日: 2019-03 時点の貸借対照表');
    expect(stale).toContain('⚠ 基準日が実績の最新期 (2026-05) より 86 か月古く');
  });

  it('★ 対照: 基準日が実績と同じ期なら警告は出ない (基準日の行だけ)', () => {
    const fresh = report({
      balanceSheet: {
        asOf: '2026-04-30', currentAssets: 1000, inventory: 0, accountsReceivable: 0,
        fixedAssets: 1000, currentLiabilities: 500, accountsPayable: 0, fixedLiabilities: 200, netIncome: 100,
      },
    });
    expect(fresh).toContain('- 基準日: 2026-04 時点の貸借対照表');
    expect(fresh).not.toContain('⚠ 基準日が');
  });

  it('★ 資金繰りの節が会計連携の窓を書く', () => {
    const md = report({
      accounting: [
        { month: '2026-03', income: 1_000_000, expense: 700_000, net: 300_000 },
        { month: '2026-04', income: 1_000_000, expense: 700_000, net: 300_000 },
      ],
    });
    expect(md).toContain('- 会計連携の対象期間: 2026-03〜2026-04・2 か月分');
  });

  it('★ 予実の節が突合した期を書く (通年の比較に読ませない)', () => {
    const md = report({
      kpiBudgets: ['2026-04', '2026-05', '2026-06'].map((period) => ({ ...kpi, period, revenue: 800_000 })),
    });
    expect(md).toContain('- 対象期間: 2026-05〜2026-05・1 か月 (予算と実績の両方が在る期)');
    expect(md).toContain('- 予算と実績の両方が在る 1 か月分の比較です (予算のみ 2 か月は対象外)。');
  });

  it('★ 期が重ならなければ算定していないと書く (節を黙って消さない)', () => {
    const md = report({ kpiBudgets: [{ ...kpi, period: '2025-04', revenue: 800_000 }] });
    expect(md).toContain('## 予算実績差異 (BVA)');
    expect(md).toContain('- 予算と実績で期が重なっていないため算定していません (予算 1 か月・実績 1 か月)');
    expect(md).not.toContain('売上 達成率');
  });

  it('omits highlights section entirely when there are none', () => {
    // a healthy single-period business yields a "good" highlight, so assert presence instead
    const md = report();
    expect(md).toContain('## 経営ハイライト');
  });

  /**
   * **★ レポートの「総合判定」に「0 / 100 (要改善)」を採点せずに書かない (2026-09-08)。**
   *
   * このレポートは冒頭で**役員会・銀行・税理士への共有**を明記している
   * (パス 50 で対象期間・基準日・会計の窓を書かせた面と同じ)。
   * 採点できた軸が 0 件のときに落第点を書けば、読み手はそれを診断として読む。
   */
  it('★ 採点できる指標が無ければ「0 / 100 (要改善)」ではなく未算定と述べる', () => {
    const overview = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi], members: [] });
    const md = buildManagementReport(overview, buildManagementScorecard({}), [], '2026-05-31', MANUAL, []);
    expect(md).toContain('- 経営スコア: **未算定** (採点できる指標が入力されていません)');
    // 直す前の文面
    expect(md).not.toContain('0 / 100');
    expect(md).not.toContain('(要改善)');
  });

  it('★ 対照: 指標が在れば「N / 100 (判定)」を書く (上の不在の検査が空でない証拠)', () => {
    const overview = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi], members: [] });
    const md = buildManagementReport(
      overview,
      buildManagementScorecard({ operatingMarginPct: 2 }),
      [],
      '2026-05-31',
      MANUAL,
      [],
    );
    // band(2, 0, 10) = 20 → 'poor' なので、上で禁じた 2 つの文面がここでは**出る**。
    expect(md).toContain('- 経営スコア: **20 / 100** (要改善)');
    expect(md).toContain('(要改善)');
    expect(md).not.toContain('未算定');
  });

  it('omits the monthly-trend table when fewer than two periods are supplied', () => {
    const overview = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi], members: [] });
    const sc = buildManagementScorecard({});
    const md = buildManagementReport(overview, sc, [], '2026-05-31', MANUAL, monthlyTrendSeries([kpi]));
    expect(md).not.toContain('## 月次推移');
  });

  it('renders a Markdown monthly-trend table when two or more periods are supplied', () => {
    const periods: KpiActual[] = [
      { ...kpi, period: '2026-04', revenue: 1_000_000 },
      { ...kpi, period: '2026-05', revenue: 1_200_000 },
    ];
    const overview = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: periods, members: [] });
    const sc = buildManagementScorecard({});
    const md = buildManagementReport(overview, sc, [], '2026-05-31', MANUAL, monthlyTrendSeries(periods));
    expect(md).toContain('## 月次推移');
    expect(md).toContain('| 期間 | 売上高 | 営業利益 | 営業利益率 | 前期比 |');
    expect(md).toContain('| 2026-04 |');
    expect(md).toContain('+20%'); // 2026-05 growth
  });

  it('includes the break-even room line when a delta is supplied', () => {
    const overview = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi], members: [] });
    const sc = buildManagementScorecard({});
    const md = buildManagementReport(overview, sc, [], '2026-05-31', MANUAL, [], -50);
    expect(md).toContain('損益分岐点までの売上余地: -50%');
  });

  it('omits the break-even room line when null', () => {
    const overview = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: [kpi], members: [] });
    const sc = buildManagementScorecard({});
    const md = buildManagementReport(overview, sc, [], '2026-05-31', MANUAL, [], null);
    expect(md).not.toContain('損益分岐点までの売上余地');
  });

  it('includes a YoY line when the prior-year same month is present', () => {
    const periods: KpiActual[] = [
      { ...kpi, period: '2025-05', revenue: 1_000_000 },
      { ...kpi, period: '2026-05', revenue: 1_200_000 },
    ];
    const overview = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: periods, members: [] });
    const sc = buildManagementScorecard({});
    const md = buildManagementReport(overview, sc, [], '2026-05-31', MANUAL);
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
  // 位置で型を取るので、引数を挿したら**ここも動く** (2026-09-08 に `manual` を
  // 4 番目へ入れて実際に動いた)。月次推移は 5 番目。
  type Tr = NonNullable<Parameters<typeof buildManagementReport>[5]>;

  const ov = (p: any = {}): Ov => ({
    plan: { label: 'Pro' },
    kpi: {
      hasData: true, revenue: 1_000_000, operatingProfit: 250_000, operatingMarginPct: 25,
      grossProfit: 600_000, grossMarginPct: 60, ebitda: 300_000, ebitdaMarginPct: 30,
      bep: 800_000, safetyMargin: 20, revenueGrowthPct: 15,
      yoy: { revenueYoYPct: 10, period: '2026-05', priorPeriod: '2025-05' },
      // 実績の窓 (対象期間) —— 実物の `kpi` は必ず持つ。
      periods: ['2026-04', '2026-05'],
      periodWindow: { from: '2026-04', to: '2026-05', months: 2 },
      ...p.kpi,
    },
    financialPosition: 'fp' in p ? p.fp : null,
    // 会計連携の詰め物は窓 (最初と最後の月・月数) も持つ (実物は必ず持つ)。
    accounting: 'accounting' in p && p.accounting !== null
      ? { firstMonth: '2026-04', latestMonth: '2026-05', months: 2, ...p.accounting }
      : null,
    runwayMonths: 'runwayMonths' in p ? p.runwayMonths : null,
    cashForecast: 'cashForecast' in p ? p.cashForecast : null,
    // 予実の詰め物は突合結果も持つ (実物の `budget` は必ず `alignment` を持つ)。
    budget: 'budget' in p && p.budget !== null
      ? { alignment: { comparedPeriods: ['2026-04', '2026-05'], budgetOnlyPeriods: [], actualOnlyPeriods: [], ...p.budget.alignment }, ...p.budget }
      : null,
    budgetAlignment: 'budgetAlignment' in p ? p.budgetAlignment : null,
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
      expect(buildManagementReport(ov({ kpi: { hasData: false } }), s, [], '2026-05-31', MANUAL)).toContain(`**50 / 100** (${label})`);
    }
  });

  it('marks each highlight severity with its emoji (incl. warning 🟡)', () => {
    const marks: Hl = [
      { severity: 'critical', category: 'A', message: 'a' },
      { severity: 'warning', category: 'B', message: 'b' },
      { severity: 'good', category: 'C', message: 'c' },
    ];
    const md = buildManagementReport(ov({ kpi: { hasData: false } }), sc, marks, '2026-05-31', MANUAL);
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
    const md = buildManagementReport(ov({ kpi: { hasData: false } }), sc, marks, '2026-05-31', MANUAL);
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
    const md = buildManagementReport(full, sc, hl, '2026-05-31', MANUAL, trend, 50);
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
        // **2026-09-08 まで、この全文の見本自身が期間を書かない P&L を固定していた。**
        // このレポートの前文は「役員会・銀行・税理士への共有に」と書いてあり、
        // 渡る先は金融機関等提出用の書面と同じである。
        '- 対象期間: 2026-04〜2026-05・2 か月 (以下の金額はこの期間の累計)',
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
        '- 会計連携の対象期間: 2026-04〜2026-05・2 か月分',
        '- 営業CF合計: ¥500,000 (月次平均 ¥50,000)',
        '- 資金ランウェイ: 12 か月',
        '- 資金ショート予測: 6 か月後',
        '',
        '## 予算実績差異 (BVA)',
        '',
        '- 対象期間: 2026-04〜2026-05・2 か月 (予算と実績の両方が在る期)',
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
    const md = buildManagementReport(ov({ kpi: { revenue: 1_000_000.6 } }), sc, [], '2026-05-31', MANUAL);
    expect(md).toContain('売上高: ¥1,000,001');
  });

  it('shows — for a non-finite break-even point', () => {
    const md = buildManagementReport(ov({ kpi: { bep: Infinity } }), sc, [], '2026-05-31', MANUAL);
    expect(md).toContain('損益分岐点: — / 安全余裕率');
  });

  // 安全余裕率は 2026-09-07 から `number | null` (算定不能を 0 に倒さない)。
  // 出す側の畳み込みを両方向で留める —— 片側だけだと三項の変異体が生き残る。
  it('★ 安全余裕率が算定不能 (null) なら — で出す', () => {
    const md = buildManagementReport(ov({ kpi: { bep: Infinity, safetyMargin: null } }), sc, [], '2026-05-31', MANUAL);
    expect(md).toContain('安全余裕率 —');
  });

  it('★ 対照: 値が在れば数字で出す (負でも)', () => {
    const md = buildManagementReport(ov({ kpi: { safetyMargin: -50 } }), sc, [], '2026-05-31', MANUAL);
    expect(md).toContain('安全余裕率 -50.0%');
  });

  it('omits the P&L section when kpi has no data (hasData guard)', () => {
    expect(buildManagementReport(ov({ kpi: { hasData: false } }), sc, [], '2026-05-31', MANUAL)).not.toContain('## 損益 (P&L)');
  });

  it('omits the highlights section when there are none (length > 0, strict)', () => {
    expect(buildManagementReport(ov(), sc, [], '2026-05-31', MANUAL)).not.toContain('## 経営ハイライト');
  });

  it('omits an individual category line when its score is null', () => {
    // 安全性 score=null → 行なし。c.score !== null ガードの両方向と StringLiteral を撃墜。
    const md = buildManagementReport(ov(), sc, [], '2026-05-31', MANUAL);
    expect(md).toContain('- 収益性: 75 / 100');
    expect(md).not.toContain('安全性:');
  });

  it('omits growth / YoY / break-even lines when their values are null', () => {
    const md = buildManagementReport(ov({ kpi: { revenueGrowthPct: null, yoy: null } }), sc, [], '2026-05-31', MANUAL, [], null);
    expect(md).toContain('## 損益 (P&L)');
    expect(md).not.toContain('前期比成長率');
    expect(md).not.toContain('前年同月比 (YoY)');
    expect(md).not.toContain('損益分岐点までの売上余地');
  });

  it('omits the YoY line when yoy is present but its pct is null (inner guard)', () => {
    const md = buildManagementReport(ov({ kpi: { yoy: { revenueYoYPct: null, period: '2026-05', priorPeriod: '2025-05' } } }), sc, [], '2026-05-31', MANUAL);
    expect(md).not.toContain('前年同月比 (YoY)');
  });

  it('signs YoY / break-even at zero and negative (kills the > 0 sign ternaries)', () => {
    const zero = buildManagementReport(ov({ kpi: { yoy: { revenueYoYPct: 0, period: '2026-05', priorPeriod: '2025-05' } } }), sc, [], '2026-05-31', MANUAL, [], 0);
    expect(zero).toContain('前年同月比 (YoY): 0% (2026-05 vs 2025-05)');
    expect(zero).toContain('損益分岐点までの売上余地: 0%');
    const neg = buildManagementReport(ov({ kpi: { yoy: { revenueYoYPct: -10, period: '2026-05', priorPeriod: '2025-05' } } }), sc, [], '2026-05-31', MANUAL, [], -50);
    expect(neg).toContain('前年同月比 (YoY): -10%');
    expect(neg).toContain('損益分岐点までの売上余地: -50%');
  });

  it('flags insolvency in the BS section and omits the flag when solvent', () => {
    const insolvent = buildManagementReport(
      ov({ fp: { equityRatioPct: -5, currentRatioPct: 80, roaPct: -2, roePct: -10, insolvent: true } }), sc, [], '2026-05-31', MANUAL);
    expect(insolvent).toContain('- ⚠ 純資産がマイナス (債務超過) です。');
    const solvent = buildManagementReport(
      ov({ fp: { equityRatioPct: 50, currentRatioPct: 200, roaPct: 10, roePct: 20, insolvent: false } }), sc, [], '2026-05-31', MANUAL);
    expect(solvent).toContain('## 財政状態 (BS)');
    expect(solvent).not.toContain('純資産がマイナス');
  });

  it('renders — for null BS ratios (pctOrDash null branch)', () => {
    const md = buildManagementReport(
      ov({ fp: { equityRatioPct: null, currentRatioPct: null, roaPct: null, roePct: null, insolvent: false } }), sc, [], '2026-05-31', MANUAL);
    expect(md).toContain('- 自己資本比率: — / 流動比率: —');
    expect(md).toContain('- ROA: — / ROE: —');
  });

  it('omits runway / shortfall lines when null while keeping the CF section', () => {
    const md = buildManagementReport(
      ov({ accounting: { totalNet: 100, avgMonthlyNet: 50 }, runwayMonths: null, cashForecast: { shortfallMonthIndex: null } }),
      sc, [], '2026-05-31', MANUAL);
    expect(md).toContain('## 資金繰り (CF)');
    expect(md).toContain('- 営業CF合計: ¥100 (月次平均 ¥50)');
    expect(md).not.toContain('資金ランウェイ');
    expect(md).not.toContain('資金ショート予測');
  });

  it('omits BS / CF / BVA / trend sections entirely when their data is absent', () => {
    const md = buildManagementReport(ov(), sc, [], '2026-05-31', MANUAL, trend.slice(0, 1));
    expect(md).not.toContain('## 財政状態 (BS)');
    expect(md).not.toContain('## 資金繰り (CF)');
    expect(md).not.toContain('## 予算実績差異 (BVA)');
    expect(md).not.toContain('## 月次推移'); // 1 期のみ → テーブルなし (>= 2 strict)
  });

  /**
   * **書面と同じ相手に渡るレポートも、算定不能を 0.0% と刷らない。**
   * 2026-09-08 まで「営業利益: ¥-3,000,000 (営業利益率 0.0%)」と書いていた。
   */
  describe('売上 0 — 比率は「—」で、理由を述べる', () => {
    const noRev: KpiActual[] = [
      { period: '2026-04', unit: '全社', revenue: 0, cogs: 0, advertising: 0, sga: 1_500_000, depreciation: 0 },
      { period: '2026-05', unit: '全社', revenue: 0, cogs: 0, advertising: 0, sga: 1_500_000, depreciation: 0 },
    ];

    it('★ 損益節の比率が「—」になり、空欄の理由を述べる', () => {
      const md = report({ kpiActuals: noRev });
      expect(md).toContain('- 営業利益: ¥-3,000,000 (営業利益率 —)');
      expect(md).toContain('- 売上総利益: ¥0 (粗利率 —)');
      expect(md).toContain('- EBITDA: ¥-3,000,000 (マージン —)');
      expect(md).toContain('- 損益分岐点: — / 安全余裕率 —');
      expect(md).toContain('対象期間の売上高が 0 のため');
      // **0.0% を刷らない** (書面 §1 と同じ規則)
      expect(md).not.toContain('0.0%');
    });

    it('★ 月次推移テーブルの営業利益率も「—」', () => {
      const o = buildBusinessOverview({ plan: 'pro', sales: [], kpiActuals: noRev, members: [] });
      const md = buildManagementReport(o, sc, [], '2026-05-31', MANUAL, monthlyTrendSeries(noRev));
      expect(md).toContain('| 2026-04 | ¥0 | ¥-1,500,000 | — | — |');
      expect(md).toContain('| 2026-05 | ¥0 | ¥-1,500,000 | — | — |');
    });

    it('★ 対照: 売上が在れば率が出て、理由の行は付かない', () => {
      const md = report();
      expect(md).toContain('(営業利益率 25.0%)');
      expect(md).not.toContain('売上高が 0 のため');
    });
  });

  /**
   * **手入力の上書きの断りは、書面と同じ相手に渡るレポートにも要る。**
   * 前文の直後に置く —— 下の全部に掛かるので (書面は注記に置く)。
   */
  describe('手入力の上書き', () => {
    const overridden = { overridden: ['kpi.revenue'], staleDerived: [
      { path: 'kpi.operatingMarginPct', label: '営業利益率', because: ['kpi.revenue'] },
    ] };

    it('★ 前文の直後に節が出て、手で置いた欄と自動値のままの指標を述べる', () => {
      const md = buildManagementReport(ov(), sc, [], '2026-05-31', overridden);
      expect(md).toContain('## 手入力の上書き');
      expect(md).toContain('- 売上高は手で置いた数値です');
      expect(md).toContain('- ⚠ 営業利益率は自動計算のままで');
      // 前文 → 手入力 → 総合判定 の順 (下の全部に掛かる断りなので先に置く)
      expect(md.indexOf('財務・税務助言ではありません')).toBeLessThan(md.indexOf('## 手入力の上書き'));
      expect(md.indexOf('## 手入力の上書き')).toBeLessThan(md.indexOf('## 総合判定'));
    });

    it('★ 対照: 上書きが無ければ節そのものが出ない', () => {
      const md = buildManagementReport(ov(), sc, [], '2026-05-31', MANUAL);
      expect(md).not.toContain('## 手入力の上書き');
      expect(md).not.toContain('手で置いた数値');
    });
  });

  it('signs a negative growth row in the monthly-trend table and dashes a null one', () => {
    const rows = [
      { period: '2026-03', revenue: 1_000_000, operatingProfit: 100_000, operatingMarginPct: 10, revenueGrowthPct: null },
      { period: '2026-04', revenue: 900_000, operatingProfit: 50_000, operatingMarginPct: 5.5, revenueGrowthPct: -10 },
      { period: '2026-05', revenue: 900_000, operatingProfit: 50_000, operatingMarginPct: 5.5, revenueGrowthPct: 0 },
    ] as any as Tr;
    const md = buildManagementReport(ov(), sc, [], '2026-05-31', MANUAL, rows);
    expect(md).toContain('| 2026-03 | ¥1,000,000 | ¥100,000 | 10.0% | — |');
    expect(md).toContain('| 2026-04 | ¥900,000 | ¥50,000 | 5.5% | -10% |');
    expect(md).toContain('| 2026-05 | ¥900,000 | ¥50,000 | 5.5% | 0% |');
  });
});

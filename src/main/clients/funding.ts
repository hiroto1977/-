import type { FetchContext } from './types';
import {
  aggregateByKind,
  barData,
  cashRunway,
  debtServiceMetrics,
  expectedScenario,
  fundingCostMetrics,
  fundingDiversification,
  fundingTermStructure,
  fundingQualityScore,
  monthlyFlow,
  radarScores,
  scenarioRunways,
  specifiedIncomeAdjustment,
  summarize,
  type CashRunway,
  type DebtServiceMetrics,
  type ExpectedScenario,
  type FundingCostMetrics,
  type FundingDiversification,
  type FundingTermStructure,
  type FundingQualityScore,
  type ScenarioRunways,
  type SpecifiedIncomeAdjustment,
  type FundingBar,
  type FundingByKind,
  type FundingItem,
  type FundingMonthly,
  type FundingSummary,
} from '../../shared/funding';

/**
 * 資金調達レーダー (Funding Radar) のスナップショット fetcher。
 *
 * 補助金 / 助成金 / 融資 / 公庫 / 給付金 / クラウドファンディングの案件を
 * 集計し、4 種チャート用データを返す。会計ソフト (MoneyForward 等) の月次
 * 営業キャッシュフローと、任意の株式ポートフォリオ評価額も取り込む。
 *
 * Phase 6 — 実 API (会計ソフト / 公庫 / 補助金ポータル) を `ctx.token` /
 * `ctx.fetch` 経由で差し込む。現状は再現可能なモックを返す。
 */

// --- モック案件 -------------------------------------------------------
// 以下のモックデータは Phase 6 の実 API 差込みまでの再現用プレースホルダ。文字列・数値
// リテラルの変異はロジックを検証しないため mutation 対象から除外する (overview.ts 等の
// snapshot stub と同方針)。組み立てロジック (buildFundingSnapshot) はテストで 100% 担保。
/* Stryker disable all */
const MOCK_ITEMS: FundingItem[] = [
  { id: 'f-monozukuri', kind: 'subsidy', name: 'ものづくり補助金 (設備取得・圧縮記帳)', amount: 7_500_000, status: 'approved', month: '2026-06', repayable: false, compressedEntry: true },
  { id: 'f-jizokuka', kind: 'subsidy', name: '小規模事業者持続化補助金', amount: 2_000_000, status: 'received', month: '2026-03', repayable: false },
  { id: 'f-it', kind: 'subsidy', name: 'IT導入補助金', amount: 1_500_000, status: 'applied', month: '2026-08', repayable: false },
  { id: 'f-career', kind: 'grant', name: 'キャリアアップ助成金', amount: 1_140_000, status: 'received', month: '2026-04', repayable: false },
  { id: 'f-koyou', kind: 'grant', name: '雇用調整助成金', amount: 800_000, status: 'planned', month: '2026-09', repayable: false },
  { id: 'f-bank', kind: 'loan', name: '民間金融機関 運転資金融資', amount: 10_000_000, status: 'received', month: '2026-02', repayable: true, repayment: { annualRate: 0.022, months: 60, startMonth: '2026-03' } },
  { id: 'f-jfc-startup', kind: 'jfc', name: '公庫 新規開業資金 (据置6か月・据置利息を元本組入)', amount: 6_000_000, status: 'approved', month: '2026-05', repayable: true, repayment: { annualRate: 0.012, months: 84, startMonth: '2026-06', gracePeriodMonths: 6, graceInterestHandling: 'compound' } },
  { id: 'f-jfc-safety', kind: 'jfc', name: '公庫 セーフティネット貸付', amount: 3_000_000, status: 'applied', month: '2026-07', repayable: true },
  { id: 'f-benefit', kind: 'benefit', name: '事業復活支援金', amount: 1_000_000, status: 'received', month: '2026-01', repayable: false },
  { id: 'f-cf1', kind: 'crowdfunding', name: '購入型クラウドファンディング', amount: 2_400_000, status: 'received', month: '2026-03', repayable: false },
  { id: 'f-cf2', kind: 'crowdfunding', name: '新製品 先行販売 CF', amount: 1_800_000, status: 'planned', month: '2026-10', repayable: false },
];

/** 会計ソフト連携 (MoneyForward 等) の月次営業キャッシュフロー (モック)。 */
const MOCK_ACCOUNTING: ReadonlyArray<readonly [string, number]> = [
  ['2026-01', 1_200_000],
  ['2026-02', 1_350_000],
  ['2026-03', 1_580_000],
  ['2026-04', 1_410_000],
  ['2026-05', 1_650_000],
  ['2026-06', 1_720_000],
];

/** 任意の株式投資連携 (stocks) のポートフォリオ評価額 (モック)。 */
const MOCK_PORTFOLIO: ReadonlyArray<readonly [string, number]> = [
  ['2026-01', 980_000],
  ['2026-02', 1_010_000],
  ['2026-03', 1_055_000],
  ['2026-04', 1_030_000],
  ['2026-05', 1_092_000],
  ['2026-06', 1_140_000],
];
/* Stryker restore all */

// --- スナップショット -------------------------------------------------

export interface FundingSnapshot {
  readonly items: readonly FundingItem[];
  readonly byKind: readonly FundingByKind[];
  readonly radar: readonly number[];
  readonly monthly: readonly FundingMonthly[];
  readonly bars: readonly FundingBar[];
  readonly summary: FundingSummary;
  /** 累計キャッシュ残高 (ランウェイ) 分析。 */
  readonly runway: CashRunway;
  /** 採択確率で加重した期待値シナリオ。 */
  readonly scenario: ExpectedScenario;
  /** 楽観/期待/悲観の 3 シナリオ累計キャッシュ残高。 */
  readonly scenarioRunways: ScenarioRunways;
  /** 資金調達の質スコア。 */
  readonly qualityScore: FundingQualityScore;
  /** 資金調達の多様化 (種別集中度 HHI) 指標。種別の確定額が無ければ null。 */
  readonly diversification: FundingDiversification | null;
  /** 借入の期間構成 (短期/長期・長期比率)。 */
  readonly termStructure: FundingTermStructure;
  /** 返済余力指標 (DSCR)。 */
  readonly debtService: DebtServiceMetrics;
  /** 資金調達コスト指標 (実効コスト率・自己負担比率)。 */
  readonly costMetrics: FundingCostMetrics;
  /** 消費税: 特定収入に係る仕入税額控除の調整 (概算)。 */
  readonly specifiedIncome: SpecifiedIncomeAdjustment;
  /** 会計ソフト連携の有無 (任意連携)。 */
  readonly accountingLinked: boolean;
  /** 株式投資連携の有無 (任意連携)。 */
  readonly stocksLinked: boolean;
  readonly fetchedAt: string;
  readonly isMock: boolean;
}

/**
 * スナップショットを構築する純粋ヘルパ (テスト用に公開)。
 * 案件と任意連携データから 4 種チャート用データを組み立てる。
 */
export function buildFundingSnapshot(
  items: readonly FundingItem[],
  options: {
    readonly accounting?: ReadonlyMap<string, number>;
    readonly portfolio?: ReadonlyMap<string, number>;
    readonly openingBalance?: number;
    /** 補助金等以外の総収入 (特定収入割合の分母)。既定 0。 */
    readonly otherIncome?: number;
    /** 当期の課税仕入れに係る消費税額 (仕入控除税額) の概算。既定 0。 */
    readonly taxableInputTax?: number;
    /** 簡易課税かどうか (true なら特定収入の調整は不要)。既定 false。 */
    readonly simplified?: boolean;
    readonly isMock?: boolean;
    readonly fetchedAt?: string;
  } = {},
): FundingSnapshot {
  const byKind = aggregateByKind(items);
  const monthly = monthlyFlow(items, {
    accountingCashflow: options.accounting,
    portfolioByMonth: options.portfolio,
  });
  const summaryValue = summarize(items);
  return {
    items,
    byKind,
    radar: radarScores(byKind),
    monthly,
    bars: barData(byKind),
    summary: summaryValue,
    runway: cashRunway(monthly, options.openingBalance ?? 0),
    scenario: expectedScenario(items),
    scenarioRunways: scenarioRunways(items, {
      openingBalance: options.openingBalance ?? 0,
      accountingCashflow: options.accounting,
      portfolioByMonth: options.portfolio,
    }),
    qualityScore: fundingQualityScore(summaryValue),
    diversification: fundingDiversification(byKind),
    termStructure: fundingTermStructure(items),
    debtService: debtServiceMetrics(monthly),
    costMetrics: fundingCostMetrics(items, summaryValue),
    specifiedIncome: specifiedIncomeAdjustment(items, {
      otherIncome: options.otherIncome,
      taxableInputTax: options.taxableInputTax,
      simplified: options.simplified,
    }),
    accountingLinked: (options.accounting?.size ?? 0) > 0,
    stocksLinked: (options.portfolio?.size ?? 0) > 0,
    fetchedAt: options.fetchedAt ?? new Date().toISOString(),
    isMock: options.isMock ?? true,
  };
}

/** Fetcher — `LIVE_FETCHERS` の `(ctx) => Promise<unknown>` 形に一致。 */
export async function fetchFundingSnapshot(_ctx: FetchContext): Promise<FundingSnapshot> {
  void _ctx; // 未使用 — Phase 6 で ctx.token / ctx.fetch を読む
  // Phase 6 の実 API 差込みまでのモック入力値。補助金等以外の総収入 (特定収入割合の分母) と
  // 課税仕入れに係る消費税額を会計連携の営業CF合計から概算する (プレースホルダ)。算術リテラルの
  // 変異はロジック (buildFundingSnapshot 側でテスト済) を検証しないため mutation 対象から除外する。
  /* Stryker disable all */
  const accountingTotal = MOCK_ACCOUNTING.reduce((s, [, v]) => s + v, 0);
  const fetcherOptions = {
    accounting: new Map(MOCK_ACCOUNTING),
    portfolio: new Map(MOCK_PORTFOLIO),
    openingBalance: 3_000_000, // 期首キャッシュ残高 (モック)
    otherIncome: accountingTotal, // 課税売上等の概算 (営業CF合計を代用)
    taxableInputTax: Math.round((accountingTotal * 0.6 * 0.1) / 1.1), // 課税仕入れ60%想定の仕入控除税額
    isMock: true,
  };
  /* Stryker restore all */
  return buildFundingSnapshot(MOCK_ITEMS, fetcherOptions);
}

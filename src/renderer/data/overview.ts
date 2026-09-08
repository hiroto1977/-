/**
 * 経営サマリー — ここまで作った実データ機能 (売上集計 / KPI 実績 / チーム /
 * プラン) を 1 つの経営概況に束ねる純粋な集約ロジック。各機能の純粋関数を
 * 合成するだけで、IO は持たない (呼び出し側が record store から渡す)。
 */
import { summarizeSales, type SalesEntry, type SalesPeriod } from './sales';
import {
  summarizeFundamentals,
  computeKpiMetrics,
  computeRevenueGrowthPct,
  computeRevenueCagrPct,
  computeRevenueTrend,
  computeRevenueLandingForecast,
  computeYoYGrowth,
  computeLaborMetrics,
  isValidPeriod,
  periodWindow,
  type KpiActual,
  type PeriodWindow,
  type RevenueTrend,
  type RevenueLandingForecast,
  type LaborMetrics,
  type YoYComparison,
} from './kpiActuals';
import { seatsRemaining, type Role } from '../../shared/team';
import { getPlan, type PlanTier } from '../../shared/plan';
import {
  budgetPeriodAlignment,
  computeBudgetVariance,
  type BudgetPeriodAlignment,
  type BudgetVariance,
} from './budgetVariance';
import {
  BALANCE_SHEET_STALE_AFTER_MONTHS,
  balanceSheetFreshness,
  computeBalanceSheetMetrics,
  type BalanceSheet,
  type BalanceSheetFreshness,
  type BalanceSheetMetrics,
} from './balanceSheet';
import { computeCashConversionCycle, type CashConversionCycle } from './workingCapital';
import { forecastCashBalance, type CashForecast } from './cashForecast';
import { computeRevenueConcentration, type RevenueConcentration } from './revenueConcentration';
import { computeTrendAlerts, type TrendAlerts } from './trendAlerts';
import { summarizeAccounting, accountingRecency, computeRunwayMonths, type AccountingMonthly, type AccountingRecency, type AccountingSummary } from './accounting';
import type { HydroponicsEconomics, LowPotassiumAssessment } from '../../shared/hydroponics';

export interface OverviewInput {
  readonly plan: PlanTier;
  readonly sales: readonly SalesEntry[];
  readonly kpiActuals: readonly KpiActual[];
  /** 予算 (計画)。実績と同じ KpiActual 形。未入力なら BVA は出さない。 */
  readonly kpiBudgets?: readonly KpiActual[];
  /** 貸借対照表 (最新の1時点)。未入力なら財政状態指標は出さない。 */
  readonly balanceSheet?: BalanceSheet | null;
  /**
   * 貸借対照表の基準日が実績よりこれだけ古ければ「別の期の数字」として扱う (か月)。
   * 台帳 (`src/shared/parameters.ts`) の値を画面が渡す。既定はモジュールの定数。
   */
  readonly balanceSheetStaleAfterMonths?: number;
  /** 会計連携 (freee 等) の月次キャッシュフロー。未連携なら空。 */
  readonly accounting?: readonly AccountingMonthly[];
  /** Team members (only the count + roles matter here). */
  readonly members: readonly { readonly role: Role }[];
  /**
   * 水耕栽培の試算。利用者が入力した設備・品目・費用から算出したもので、
   * 実績 (`kpiActuals`) とは混ぜない。未入力なら経営サマリーに節は出ない。
   */
  readonly hydroponics?: HydroponicsEconomics | null;
  /** 低カリウム栽培の評価 (実測値から)。扱っていなければ未指定。 */
  readonly lowPotassium?: LowPotassiumAssessment | null;
}

/** 経営サマリーに載せる水耕栽培の試算。 */
export interface HydroponicsOverview {
  /** 月間の出荷株数。 */
  readonly shippedPlantsPerMonth: number;
  /** 1 日あたりの出荷株数 (設備規模の言い表し方)。 */
  readonly shippedPlantsPerDay: number;
  /** 年間の出荷重量 (kg)。 */
  readonly shippedKgPerYear: number;
  /** 月商 (円)。 */
  readonly revenue: number;
  /** 月次の営業利益 (円)。 */
  readonly operatingProfit: number;
  /** 営業利益率 (%)。**月商 0 なら null = 算定不能** (0 に倒さない)。 */
  readonly operatingMarginPct: number | null;
  /** 限界利益率 (%)。他の節と同じ定義で出す (月商 0 なら null)。 */
  readonly contributionRatio: number | null;
  /** 損益分岐点売上高 (円)。 */
  readonly bep: number;
  /** 損益分岐の月間出荷株数。限界利益が 0 以下なら null。 */
  readonly breakEvenPlantsPerMonth: number | null;
  /** 出荷が分岐点に届いているか。 */
  readonly meetsBreakEven: boolean;
  /** 出荷 1 株あたりの総原価 (円)。 */
  readonly costPerShippedPlantYen: number;
  /** 年間電力量 (kWh)。歩留まりが落ちても減らない。 */
  readonly energyKwhPerYear: number;
  /** 年間電気代 (円)。 */
  readonly electricityYenPerYear: number;
  /** 電気代が月次費用に占める割合 (%)。**費用 0 なら null = 算定不能** (0 に倒さない)。 */
  readonly electricityCostRatioPct: number | null;
  /**
   * 低カリウム栽培の評価。低カリウムとして扱っていなければ null。
   *
   * **実測していなければ `measured` が false になる。** 画面はそのときに
   * 「低カリウム」と名乗らせてはならない (腎臓病の方の食事に直結する)。
   */
  readonly lowPotassium: LowPotassiumAssessment | null;
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
    /**
     * 販売記録の合計が覆っている期間。**KPI 実績の対象期間とは別物** ——
     * 書面は 2 つの売上高を並べて刷るので、それぞれが何か月分かを述べる口が要る
     * (読める日付が無ければ null)。
     */
    period: SalesPeriod | null;
  };
  readonly kpi: {
    hasData: boolean;
    /**
     * 実績の**読める期**の昇順一覧。**「この数字は何か月分か」を述べる所すべての 1 つの出所。**
     * 以前は書面が `kpiPeriods` を別の引数で受けていたので、型としては
     * 「図の数字と断り書きが別の期を語る」控えが作れた (実害は無かったが出所は 1 つにした)。
     */
    periods: readonly string[];
    /** 実績が覆う窓 (最初と最後の期・月数)。読める期が無ければ null。 */
    periodWindow: PeriodWindow | null;
    revenue: number;
    operatingProfit: number;
    bep: number;
    /**
     * 安全余裕率 (%)。損益分岐点を下回れば**負**、損益分岐点が存在しない
     * (限界利益 ≤ 0) なら `null` = 算定不能。0 に倒さない理由は
     * `src/renderer/data/kpiActuals.ts` の同名の欄。
     */
    safetyMargin: number | null;
    /** 売上総利益 (粗利) = 売上 − 売上原価。 */
    grossProfit: number;
    /**
     * 売上総利益率 (粗利率, %)。**売上 0 なら null = 算定不能。**
     *
     * 売上高を分母にする比率はこの節に 7 つ在り、**どれも売上 0 では定まらない**。
     * 0 に倒すと「営業利益 △3,000 千円 / 営業利益率 0.0%」のように
     * **同じ表の 2 行が両立しない**書面ができる (実測は `pctOfRevenue` の脇)。
     * 姉妹欄 `safetyMargin` と、同じ比率を出す `financialRatios.ts` /
     * `financialStatements.ts` と同じ答え方に揃えてある。
     */
    grossMarginPct: number | null;
    /** 営業利益率 (%)。売上 0 なら null (上と同じ理由)。 */
    operatingMarginPct: number | null;
    /** EBITDA = 営業利益 + 減価償却費 (償却前営業利益)。 */
    ebitda: number;
    /** EBITDA マージン (%)。売上 0 なら null。 */
    ebitdaMarginPct: number | null;
    /** 原価率 (%) = 売上原価 ÷ 売上。売上 0 なら null。 */
    cogsRatioPct: number | null;
    /** 広告費比率 (%)。売上 0 なら null。 */
    advertisingRatioPct: number | null;
    /** 販管費率 (%)。売上 0 なら null。 */
    sgaRatioPct: number | null;
    /** 限界利益率 (%)。売上 0 なら null。 */
    contributionRatio: number | null;
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
  /**
   * 生産性 (一人当たり) 指標。**メンバーが 0 人なら per-capita は null = 算定不能。**
   * 同じ分母 (従業員数) で割る `labor.laborPerCapita` が最初から null を返していた
   * のに、こちらは 0 に倒していた —— **1 つの節が「割れない」を 2 通りに答え**、
   * 書面 §3 に「一人当たり売上高 0」と「一人当たり人件費 ―」が並んでいた。
   */
  readonly productivity: {
    members: number;
    /** 一人当たり売上。従業員 0 名なら null。 */
    revenuePerCapita: number | null;
    /** 一人当たり営業利益。従業員 0 名なら null。 */
    operatingProfitPerCapita: number | null;
    /** 人件費の効率指標 (労働分配率・人件費率・一人当たり人件費)。 */
    labor: LaborMetrics;
  };
  /**
   * 予算実績差異 (BVA)。**予算と実績の両方が在る期だけ**を合算した比較で、
   * 突合できる期が 1 つも無ければ null (予算が未入力のときも同じ)。
   */
  readonly budget: BudgetVariance | null;
  /**
   * 予算と実績の期の突合状況。**予算も実績も 1 行以上在れば必ず非 null** ——
   * `budget` が null (期が重ならない) のときに「なぜ達成率が出ないか」を述べる口。
   */
  readonly budgetAlignment: BudgetPeriodAlignment | null;
  /** 財政状態指標 (ROA/ROE/自己資本比率/流動比率)。BS 未入力なら null。 */
  readonly financialPosition: BalanceSheetMetrics | null;
  /**
   * 貸借対照表の基準日と実績の期の隔たり。貸借対照表が無ければ null。
   * **溜まり ÷ 流れ の指標 (総資産回転率・CCC・ランウェイ) が両辺で別の期を
   * 見ていないかを、所見と書面がここから述べる。** 詳細は `balanceSheet.ts`。
   */
  readonly balanceSheetFreshness: BalanceSheetFreshness | null;
  /**
   * 現預金の基準日と会計連携の最新月の隔たり。資金ランウェイと 12 か月の予測は
   * この 2 つを割る (**別の出所・別の窓**) ので、隔たりを測って所見と書面が述べる。
   * どちらかが無ければ null。
   */
  readonly accountingRecency: AccountingRecency | null;
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
  /**
   * 水耕栽培の試算。**実績ではなく計画側の数字**なので `kpi` には混ぜず、
   * 独立した節として持つ。未入力なら null。
   */
  readonly hydroponics: HydroponicsOverview | null;
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
  const kpiBudgets = input.kpiBudgets ?? [];
  // 実績の最新の期。**期の綴りは `isValidPeriod` が 1 か所で持つ** (写さない)。
  const validKpiPeriods = input.kpiActuals.map((r) => r.period).filter(isValidPeriod).sort();
  // 期が 1 つも無ければ `undefined`。**`length === 0` の分岐は書かない** ——
  // `balanceSheetFreshness` は読めない値 (null / undefined / 綴り違い) を同じく
  // 「測れない」として扱うので、ここで null に畳んでも観測できる差が無く、
  // 条件だけが変異検査に「測っていない分岐」として残る (実測 2026-09-07)。
  const latestKpiPeriod = validKpiPeriods[validKpiPeriods.length - 1];
  // **実績が何か月分か** (期の異なり数。同じ月に複数事業が在るので行数ではない)。
  // 溜まり ÷ 流れ の回転日数はこの長さで決まる (`workingCapital.ts` 冒頭の実測表)。
  const kpiMonthCount = new Set(validKpiPeriods).size;
  const fundamentals = summarizeFundamentals(input.kpiActuals);
  const kpi = computeKpiMetrics(fundamentals);

  const seatLimit = planDef.maxSeats;
  const remaining = seatsRemaining({ used: input.members.length, limit: seatLimit });

  const grossProfit = fundamentals.revenue - fundamentals.cogs;
  /**
   * 売上高を分母にする比率。**売上 0 なら null (算定不能)** —— 0 に倒さない。
   *
   * 実測 (売上 0・販売費及び一般管理費 300 万円の控え。直す前の書面 §1):
   *
   * | 行 | 直す前 | 直した後 |
   * | --- | ---: | ---: |
   * | 営業利益 | △3,000 | △3,000 |
   * | **営業利益率** | **0.0%** | ― |
   * | **販売費及び一般管理費率** | **0.0%** | ― |
   * | 損益分岐点売上高 | ― | ― |
   * | 安全余裕率 | ― | ― |
   *
   * **同じ表の中で「割れない」の答え方が 2 通りあり**、下 2 行だけが ― だった。
   * 規準はすでにコードの 5 か所に在った: `computeKpiMetrics` の `safetyMargin`、
   * `financialRatios.ts` の `pct()`、`financialStatements.ts` の限界利益率、
   * `overviewScorecard.ts` の `hasRevenue` (軸を落とす)、`managementHighlights.ts`
   * の `if (k.revenue > 0)`。**この 1 か所だけが 0 に倒していた。**
   */
  const pctOfRevenue = (n: number): number | null =>
    fundamentals.revenue > 0 ? (n / fundamentals.revenue) * 100 : null;
  const grossMarginPct = pctOfRevenue(grossProfit);
  const operatingMarginPct = pctOfRevenue(kpi.operatingProfit);
  const ebitda = kpi.operatingProfit + fundamentals.depreciation;
  const ebitdaMarginPct = pctOfRevenue(ebitda);
  const memberCount = input.members.length;
  // 一人当たりの額。**従業員 0 名なら null** —— 同じ分母で割る
  // `LaborMetrics.laborPerCapita` と同じ答え方 (`productivity` の脇に経緯)。
  const perCapita = (n: number): number | null => (memberCount > 0 ? Math.round(n / memberCount) : null);
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
      period: salesSummary.period,
    },
    kpi: {
      hasData: hasKpi,
      periods: validKpiPeriods,
      periodWindow: periodWindow(validKpiPeriods),
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
    budget: computeBudgetVariance(kpiBudgets, input.kpiActuals),
    // 突合状況は「両方に行が在る」だけで測れる (期が重なるかは測った結果)。
    budgetAlignment:
      kpiBudgets.length > 0 && input.kpiActuals.length > 0
        ? budgetPeriodAlignment(kpiBudgets, input.kpiActuals)
        : null,
    financialPosition: input.balanceSheet ? computeBalanceSheetMetrics(input.balanceSheet) : null,
    // 会計連携と貸借対照表の**両方**が在るときだけ測れる (片方だけでは隔たりが無い)。
    accountingRecency: accountingSummary && input.balanceSheet
      ? accountingRecency(
          input.balanceSheet.asOf,
          accountingSummary.latestMonth,
          input.balanceSheetStaleAfterMonths ?? BALANCE_SHEET_STALE_AFTER_MONTHS,
        )
      : null,
    balanceSheetFreshness: input.balanceSheet
      ? balanceSheetFreshness(
          input.balanceSheet.asOf,
          latestKpiPeriod,
          input.balanceSheetStaleAfterMonths ?? BALANCE_SHEET_STALE_AFTER_MONTHS,
        )
      : null,
    // `hasKpi` ではなく**読める期が 1 つ以上**を条件にする —— 期の綴りが読めない控えでは
    // 流れが何か月分なのか測れないので、回転日数を出してはいけない。
    workingCapital: input.balanceSheet && kpiMonthCount > 0
      ? computeCashConversionCycle({
          accountsReceivable: input.balanceSheet.accountsReceivable,
          inventory: input.balanceSheet.inventory,
          accountsPayable: input.balanceSheet.accountsPayable,
          revenue: fundamentals.revenue,
          cogs: fundamentals.cogs,
          periodMonths: kpiMonthCount,
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
    hydroponics: summarizeHydroponics(input.hydroponics ?? null, input.lowPotassium ?? null),
    flags: {
      profitable: hasKpi && kpi.operatingProfit > 0,
      seatsFull: remaining === 0,
    },
  };
}

/**
 * 水耕栽培の試算を経営サマリーの節に整える。
 *
 * 利益率・限界利益率・損益分岐点は**他の節と同じ関数** (`computeKpiMetrics`)
 * で出す。栽培だけ別の定義で計算すると、同じ画面に定義の違う「利益率」が
 * 並ぶことになる。
 */
function summarizeHydroponics(
  e: HydroponicsEconomics | null,
  lowPotassium: LowPotassiumAssessment | null,
): HydroponicsOverview | null {
  if (!e) return null;
  const m = e.monthly;
  const metrics = computeKpiMetrics({
    revenue: m.revenue,
    cogs: m.cogs,
    advertising: m.advertising,
    sga: m.sga,
    depreciation: m.depreciation,
  });
  // 費用の合計は `computeKpiMetrics` の定義から引き算で出す。ここで足し直すと
  // 「営業利益の裏側の費用」と定義が二重になり、片方だけ変えたときに気付けない。
  const monthlyCost = m.revenue - metrics.operatingProfit;
  const monthlyElectricity = e.electricityYenPerYear / 12;
  return {
    shippedPlantsPerMonth: e.shippedPlantsPerMonth,
    shippedPlantsPerDay: e.production.shippedPlantsPerDay,
    shippedKgPerYear: e.production.shippedKgPerYear,
    revenue: m.revenue,
    operatingProfit: metrics.operatingProfit,
    operatingMarginPct: m.revenue > 0 ? (metrics.operatingProfit / m.revenue) * 100 : null,
    contributionRatio: metrics.contributionRatio,
    bep: metrics.bep,
    breakEvenPlantsPerMonth: e.breakEvenPlantsPerMonth,
    meetsBreakEven: e.meetsBreakEven,
    costPerShippedPlantYen: e.costPerShippedPlantYen,
    energyKwhPerYear: e.energyKwhPerYear,
    electricityYenPerYear: e.electricityYenPerYear,
    electricityCostRatioPct: monthlyCost > 0 ? (monthlyElectricity / monthlyCost) * 100 : null,
    lowPotassium,
  };
}

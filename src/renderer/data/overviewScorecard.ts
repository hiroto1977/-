/**
 * 経営サマリーの数値を、スコアカードの入力へ組み替える。
 *
 * ## なぜ画面から出したのか (2026-09-07 実測)
 *
 * この組み替えは `OverviewPage.tsx` の `useMemo` の中に直接書かれていた。
 * **`stryker.config.json` の `mutate` に `.tsx` は 1 件も無い** ので、画面の中に
 * 書いた算術と条件は変異検査の対象外になる —— 判断を画面へ書き足すなら共有側へ
 * 出す、という規則 (`lint:mutation-scope` の `KNOWN_UNMEASURED` にも同じ文が在る)
 * が、ここでは守られていなかった。
 *
 * そして実際に 1 件ずれていた。
 *
 * ## 見つけた欠陥 —— 最悪の場合だけ採点されない
 *
 * 旧実装は総資産回転率をこう作っていた:
 *
 * ```tsx
 * assetTurnover: overview.financialPosition && overview.financialPosition.totalAssets > 0
 *   && overview.kpi.revenue > 0
 *   ? Math.round((overview.kpi.revenue / overview.financialPosition.totalAssets) * 100) / 100
 *   : undefined,
 * ```
 *
 * `revenue > 0` が入っている。ところが総資産回転率の分母は**総資産**なので、
 * 売上 0 でも値は定まる —— **0 倍**、つまり最悪の値である。
 * `buildManagementScorecard` は `undefined` の軸を**採点対象から外す**ので、
 * 貸借対照表が在って売上が 0 の会社は「効率性: 総資産回転率」を**採点されない**。
 * 結果として効率性は残りの軸 (CCC) だけの平均になり、
 * **売上が 0 → 1 円に増えると効率性の点数が下がる** (0 点の軸が現れるため)。
 * 「効率性が低水準」の警告も、まさにそれが要る会社では出ない。
 *
 * 同じ画面の財務指標 (`financialRatios.ts` の `dupontAssetTurnover`) は
 * `ratio(revenue, totalAssets)` で、**総資産 0 のときだけ**算定不能としている。
 * 2 つの実装が「算定不能」の定義で食い違っていた。
 *
 * 直し方は 2 つとも: 算術は `assetTurnoverRatio` の 1 か所に寄せ、
 * 算定不能は「総資産 0 / 貸借対照表なし」だけにした。
 *
 * ## 見つけた欠陥 その 2 —— 何か月分を入力したかで点数が動いた (2026-09-07)
 *
 * 総資産回転率は **流れ (売上) ÷ 溜まり (総資産)** である。分子は期間の長さに比例し、
 * 分母は時点の値なので、**分子を 1 年に揃えないと比率の意味が定まらない**。
 * ところが分子には `overview.kpi.revenue` を渡していた —— これは
 * `summarizeFundamentals` が**入力済みの全期を合計**した値で、利用者が何か月分を
 * 打ち込んだかに比例する。
 *
 * 実測 (月商 100 万・総資産 500 万・毎月同じ実績):
 *
 * | 入力した月数 | 売上合計 | 回転率 | 効率性 | 総合 |
 * | --- | --- | --- | --- | --- |
 * | 1 か月 | 100 万 | 0.2 倍 | 7 | 69 |
 * | 3 か月 | 300 万 | 0.6 倍 | 20 | 63 |
 * | 6 か月 | 600 万 | 1.2 倍 | 65 | 75 |
 * | 12 か月 | 1,200 万 | 2.4 倍 | 88 | 80 |
 *
 * **同じ経営で効率性が 7 → 88**、総合の格付けも「good」から「excellent」へ動く。
 * 軸の帯 (0 → 1.5 倍で 0 → 100 点) は年商を前提にしているので、月数が揃うまで
 * 点数は意味を持たない。
 *
 * 年換算は**既にこのアプリが持っている** ——
 * `computeRevenueLandingForecast` の `runRateForecast`
 * (実績 ÷ 経過月 × 12・対象は最新年) で、上の実測ではどの行でも 1,200 万だった。
 * つまり正しい数字が同じ `overview` の中に在るのに、回転率だけが素の合計を見ていた。
 *
 * 分子をこれに替えた。年換算の基礎 (期) が無ければ**算定不能**として軸を落とす ——
 * 素の合計へ倒すと、同じ欠陥を黙って戻すことになる。
 *
 * なお `financialPosition` の ROA / ROE は同じ形に見えて健全である:
 * 分子の当期純利益を**貸借対照表のレコード自身**から取るので、分子と分母が
 * 同じ期に属する (`balanceSheet.ts` の `netIncome`)。**流れ ÷ 溜まりの比率は、
 * 両辺の期を揃えてから作る。**
 *
 * ## 売上 0 で本当に算定不能な軸は、そのまま残す
 *
 * 利益率 3 つ (営業利益率・粗利率・限界利益率) は分母が**売上**なので、
 * 売上 0 では数学的に定まらない。ここは `hasRevenue` で切るのが正しい。
 * 「売上 0 なら全部落とす」ではなく、**分母が何かで決まる**。
 */
import type { BusinessOverview } from './overview';
import type { ManagementMetricsInput } from '../../shared/managementScorecard';
import { assetTurnoverRatio } from './financialRatios';

/**
 * 総資産回転率の軸に渡す値。算定不能なら `undefined`。
 *
 * 関門を関数に出しているのは、**「算定不能」の 3 条件を 1 か所で読めるようにする**
 * ためと、`annualRevenue` が無い枝を検査から直接叩けるようにするため
 * (production では到達しない —— `hasData` が真なら `revenueLanding` は必ず在る。
 * 詳細はモジュール冒頭)。到達しないからといって**素の売上合計へ倒してはいけない** ——
 * 倒すと「月数で点数が動く」欠陥が黙って戻る。
 */
export function turnoverAxis(
  position: { readonly totalAssets: number } | null,
  annualRevenue: number | undefined,
): number | undefined {
  if (position === null) return undefined;
  if (annualRevenue === undefined) return undefined;
  return assetTurnoverRatio(annualRevenue, position.totalAssets) ?? undefined;
}

/** スコアカードに足す、経営サマリーの外から来る数値。 */
export interface ScorecardExtras {
  /**
   * 会計連携CF と返済から算出した DSCR。無ければ採点しない。
   *
   * `null` も受ける —— 呼び出し側 (`debtService?.overallDscr`) が `number | null`
   * を持つので、`null → 採点しない` の畳み込みは**このモジュールの仕事**にする
   * (画面側に `?? undefined` を書かせると、また画面が判断を持つ)。
   */
  readonly overallDscr?: number | null;
}

/**
 * スコアカードの入力を組み立てる。純粋。
 *
 * KPI 実績が 1 件も無ければ**空**を返す (どの軸も採点しない)。
 */
export function scorecardMetrics(
  overview: BusinessOverview,
  extras: ScorecardExtras = {},
): ManagementMetricsInput {
  if (!overview.kpi.hasData) return {};

  const position = overview.financialPosition;
  // 流れ ÷ 溜まりの比率に渡す分子は**年換算した売上**。素の合計を渡すと
  // 「何か月分を入力したか」で点数が動く (上の実測: 効率性 7 → 88)。
  //
  // `hasData` が真なら `revenueLanding` は必ず在る —— どちらも同じ `kpiActuals` から
  // 作られ、`hasData = actuals.length > 0` で、`groupRevenueByPeriod` は期の文字列を
  // 検証しないので系列が空にならない。`?.` はその不変条件に対する防御であって、
  // 今日は到達しない (等価変異)。不変条件そのものは検査が留めてある
  // (`groupRevenueByPeriod` が期を選別するようになったら、その検査が先に鳴る)。
  // Stryker disable next-line OptionalChaining: 上の不変条件により null にならない (到達不能)
  const annualRevenue = overview.kpi.revenueLanding?.runRateForecast;

  return {
    // 分母が売上の指標は、売上 0 では定まらない (0 除算)。**その判定は値の側が
    // 持つ** —— `overview.kpi.*` は算定不能なら `null` を返すので、ここで
    // `revenue > 0` を書き写すと同じ規則が 2 か所に分かれる (2026-09-08 まで
    // そうなっていた。画面と書面は 0 を刷り、採点だけが軸を落としていた)。
    operatingMarginPct: overview.kpi.operatingMarginPct ?? undefined,
    grossMarginPct: overview.kpi.grossMarginPct ?? undefined,
    contributionRatioPct: overview.kpi.contributionRatio ?? undefined,
    // `null` = 算定不能 (損益分岐点が存在しない) は軸を落とす。0 に倒すと
    // 「損益分岐点上に居る」という最も安全な読みで採点してしまう。
    safetyMarginPct: overview.kpi.safetyMargin ?? undefined,
    // 資金繰り: 会計連携CF + 現預金からランウェイを、会計CF×返済から DSCR を加点。
    runwayMonths: overview.runwayMonths ?? undefined,
    dscr: extras.overallDscr ?? undefined,
    // 安全性: 貸借対照表を入力すると自己資本比率が加点される。
    equityRatioPct: position?.equityRatioPct ?? undefined,
    // 成長性: 期 (YYYY-MM) が 2 つ以上揃うと前期比成長率が自動で加点される。
    revenueGrowthPct: overview.kpi.revenueGrowthPct ?? undefined,
    // 効率性: CCC と総資産回転率。
    cashConversionDays: overview.workingCapital?.ccc ?? undefined,
    // **分母は総資産**なので、売上 0 でも 0 倍として採点する (最悪の値を隠さない)。
    // 算定不能の 3 条件は `turnoverAxis` が持つ。
    assetTurnover: turnoverAxis(position, annualRevenue),
  };
}

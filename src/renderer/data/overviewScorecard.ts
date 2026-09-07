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
 * ## 売上 0 で本当に算定不能な軸は、そのまま残す
 *
 * 利益率 3 つ (営業利益率・粗利率・限界利益率) は分母が**売上**なので、
 * 売上 0 では数学的に定まらない。ここは `hasRevenue` で切るのが正しい。
 * 「売上 0 なら全部落とす」ではなく、**分母が何かで決まる**。
 */
import type { BusinessOverview } from './overview';
import type { ManagementMetricsInput } from '../../shared/managementScorecard';
import { assetTurnoverRatio } from './financialRatios';

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

  // 分母が売上の指標は、売上 0 では定まらない (0 除算)。
  const hasRevenue = overview.kpi.revenue > 0;
  const position = overview.financialPosition;

  return {
    operatingMarginPct: hasRevenue ? overview.kpi.operatingMarginPct : undefined,
    grossMarginPct: hasRevenue ? overview.kpi.grossMarginPct : undefined,
    contributionRatioPct: hasRevenue ? overview.kpi.contributionRatio : undefined,
    safetyMarginPct: overview.kpi.safetyMargin,
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
    // 算定不能は「貸借対照表なし」か「総資産 0」だけ。
    assetTurnover:
      position === null ? undefined : (assetTurnoverRatio(overview.kpi.revenue, position.totalAssets) ?? undefined),
  };
}

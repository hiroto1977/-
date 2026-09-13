/**
 * 事業別 財務インプット生成 (案A) — 各事業の月次 KPI（売上・原価・固定費・利益）から、
 * 年次の FinancialInputs（PL + 概算 BS/CF）を生成する純粋ロジック。
 *
 * 事業別の貸借対照表データは snapshot に無いため、ここで概算する。
 * - PL は月次×12 で年次化。
 * - BS は売上規模からスケールしつつ、**自己資本比率を収益性で変動**させる
 *   （高収益事業ほど自己資本が厚い）ことで、事業ごとに指標が意味のある差を持つ。
 * すべて概算であり、financialRatios.ts に渡して 15 指標を算出する。
 *
 * **重要 — 概算であり財務助言ではありません。** snapshot は模擬データ。
 */

import { finiteOr0, nonNeg } from '../../shared/num';

import type { FinancialInputs } from './financialRatios';

/** deriveBusinessFinancials の入力 (月次)。 */
export interface MonthlyBusinessKpi {
  readonly revenue: number;
  readonly variableCost: number;
  readonly fixedCost: number;
  readonly profit: number; // 営業利益 (月次)
  readonly profitMargin: number; // 営業利益率 (%)
  /**
   * 人件費 (円/月)。**分かっている事業だけが入れる。**
   *
   * 無ければ固定費の約半分と置く (下の概算)。水耕栽培のように人件費を
   * 明細で持っている事業は、置き値ではなく実額から労働分配率が出るように
   * ここへ渡す。置き値のままだと「人件費を入力したのにサマリーに効かない」
   * という形で数字が食い違う。
   */
  readonly laborCost?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r0 = (n: number) => Math.round(n);

/**
 * 短期借入相当として扱う流動負債の割合 (0..1)。
 *
 * **この 1 か所だけが持つ。** 下の `interestBearingDebt` はこの割合を
 * 「固定負債の 7 割 + 流動負債の 3 割」の後半として足し込み、
 * `financialStatements.ts` は**同じ割合**を短期借入金として切り出して
 * 残りを長期借入金にする。2026-09-07 まで `0.3` は 2 モジュールに 4 回
 * 書かれており、片方だけ動かすと 附属明細書の「有利子負債 合計」
 * (短期 + 長期) と 個別注記表の「有利子負債の額」が**黙って食い違う**
 * ところだった (両書類は同じ画面から続けて書き出せる)。不変量は
 * `financialStatements.test.ts` の「二書類の有利子負債が一致する」で留めている。
 *
 * 関数にしてあるのは、module 直下の `const` にすると読み込み時に 1 度だけ
 * 評価される「静的な変異体」になり、変異検査の届かない場所へ出るため
 * (`src/shared/__tests__/originalSource.ts` と同じ理由)。
 */
export function shortTermDebtShare(): number {
  return 0.3;
}

/**
 * 短期借入相当として扱う流動負債の額 (**丸めない** — 呼び手が丸める)。
 *
 * 丸めを持たないのは、概算 BS 側が `r0(固定負債×0.7 + ここ)` と**合計を**
 * 丸めているため。ここで先に丸めると 1 円ずれる。
 */
export function shortTermDebtPortion(currentLiabilities: number): number {
  return currentLiabilities * shortTermDebtShare();
}

/** 月次 KPI → 年次 FinancialInputs (概算)。決定論的・純粋。 */
/**
 * **この漏斗の入口で 1 度だけ消毒する。** (2026-09-13 · パス 205)
 *
 * `deriveBusinessFinancials` は財務分析の**唯一の入口**である ——
 * レーダー 15 軸・総合スコア・カテゴリ別スコアの棒・売上構成の円グラフ・
 * 事業の俯瞰図がすべてここを通る。だから 1 つでも読めない数字が入ると
 * **画面の広い範囲が NaN になる。** 実測 (消毒前・`revenue` が非有限の 1 事業):
 *
 * | 面 | 刷られていたもの |
 * | --- | --- |
 * | 概算の見出し | 「年商 **￥NaN**（概算 BS/CF）」 |
 * | 総合評価 | 「総合 **NaN**」 |
 * | カテゴリ別 | 「安全性 **NaN** / 収益性 **NaN** / 効率性 **NaN**」 |
 * | スコアの棒 | `width:**NaN**%` (CSS が無効値になり棒が消える) |
 * | レーダー | `<polygon points="**NaN,NaN NaN,NaN** …">` (多角形が描かれない) |
 *
 * **描画した markup 全体で "NaN" が 116 回**出ていた。円グラフの `|| 1` を
 * 直しただけでは足りず (最初そうして検査に捕まった)、**漏斗の入口で止める**の
 * が正しい層である —— パス 201 で `kpi.ts` に `saneFundamentals` を置いたのと
 * 同じ形。
 *
 * 消毒の種類は量で決まる (パス 204 の表): 売上・原価・固定費・人件費は
 * 負を取らないので `nonNeg`、**営業利益と営業利益率は負が正しい答え** (損失)
 * なので符号を残す `finiteOr0`。
 */
function saneMonthlyKpi(m: MonthlyBusinessKpi): MonthlyBusinessKpi {
  return {
    revenue: nonNeg(m.revenue),
    variableCost: nonNeg(m.variableCost),
    fixedCost: nonNeg(m.fixedCost),
    profit: finiteOr0(m.profit),
    profitMargin: finiteOr0(m.profitMargin),
    laborCost: m.laborCost === undefined ? undefined : nonNeg(m.laborCost),
  };
}

export function deriveBusinessFinancials(raw: MonthlyBusinessKpi): FinancialInputs {
  const m = saneMonthlyKpi(raw);
  // --- PL (年次) ---
  const revenue = r0(m.revenue * 12);
  const cogs = r0(m.variableCost * 12);
  const operatingProfit = r0(m.profit * 12);
  const depreciation = r0(revenue * 0.03); // 売上の約3%を減価償却と仮定
  // 実額があればそれを使う。無ければ固定費の約半分を人件費と仮定。
  const laborCost = m.laborCost === undefined ? r0(m.fixedCost * 12 * 0.5) : r0(m.laborCost * 12);

  // --- BS (期末・概算) ---
  // 総資産は年商の約0.8倍（資産回転率≒1.25）。
  const totalAssets = Math.max(1, r0(revenue * 0.8));
  // 自己資本比率を営業利益率で変動 (15%〜65%)。高収益ほど自己資本が厚い。
  const equityRatio = clamp(0.3 + m.profitMargin / 100, 0.15, 0.65);
  const equity = r0(totalAssets * equityRatio);
  const currentAssets = r0(totalAssets * 0.55);
  const fixedAssets = totalAssets - currentAssets;
  const currentLiabilities = r0(totalAssets * 0.3);
  const fixedLiabilities = Math.max(0, totalAssets - equity - currentLiabilities);
  // 運転資本（年商/原価ベース）。
  const accountsReceivable = r0((revenue / 12) * 1.5); // 約1.5ヶ月分
  const inventory = r0(cogs / 12); // 約1ヶ月分 (原価)
  const accountsPayable = r0((cogs / 12) * 1.2); // 約1.2ヶ月分
  // 有利子負債は固定負債の7割 + 流動負債の3割（短期借入相当）。後半は諸表側が
  // 短期借入金として切り出すのと**同じ割合**なので `shortTermDebtPortion` を読む。
  const interestBearingDebt = r0(fixedLiabilities * 0.7 + shortTermDebtPortion(currentLiabilities));

  // --- 利息・経常・純利益 ---
  const interestExpense = r0(interestBearingDebt * 0.02); // 借入利率 約2%
  const ordinaryProfit = operatingProfit - interestExpense;
  // ordinaryProfit === 0 では `> 0` / `>= 0` どちらでも結果が 0 で一致するため、
  // EqualityOperator mutation (>0 ⇄ >=0) は equivalent。次行で無効化する。
  // Stryker disable next-line EqualityOperator
  const netProfit = r0(ordinaryProfit > 0 ? ordinaryProfit * 0.7 : ordinaryProfit); // 実効税率約30%

  return {
    revenue,
    cogs,
    operatingProfit,
    ordinaryProfit,
    netProfit,
    depreciation,
    laborCost,
    interestExpense,
    totalAssets,
    equity,
    currentAssets,
    currentLiabilities,
    fixedAssets,
    fixedLiabilities,
    accountsReceivable,
    inventory,
    accountsPayable,
    interestBearingDebt,
  };
}

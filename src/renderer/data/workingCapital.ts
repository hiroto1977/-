/**
 * 運転資金 (working capital) と CCC (キャッシュ・コンバージョン・サイクル) —
 * 経営管理 (FP&A) の資金効率指標。
 *
 * CCC = 売上債権回転日数 (DSO) + 棚卸資産回転日数 (DIO) − 仕入債務回転日数 (DPO)。
 * 「売って現金になるまでの日数 − 仕入の支払を待てる日数」で、短い (またはマイナス)
 * ほど資金繰りが楽。BS 項目 (売上債権・棚卸・仕入債務) と KPI のフロー (売上・売上
 * 原価) を組み合わせて出す純粋ロジック。IO は持たない。
 *
 * 注意: 在庫 (stock) を期間フロー (売上・売上原価) で割る近似。KPI 実績が約 1 年分
 * かつ days=365 のとき年次の回転日数になる。業種で適正値は大きく異なる。
 *
 * ## 未入力の溜まりは `undefined` で受け、その回転日数だけ算定不能にする
 *
 * 3 つの溜まり (売上債権・棚卸資産・仕入債務) は貸借対照表の**任意**欄なので、
 * 空欄のまま保存できる。**未入力を 0 として受けてはいけない** —— 0 日 は
 * 「即日回収」「在庫を持たない」「即日支払」という**実測**であり、3 つが揃うと
 * CCC 0 日 = 資金が 1 日も寝ていない最良の運転資金になる。空欄で保存した控えが
 * その答えを出していた経緯と実測表は `balanceSheet.ts` の `BalanceSheet` に在る。
 *
 * **0 を算定不能にしないこと。** 現金商売の DSO 0 日は正しく、かつ有用である。
 * 区別するのは値ではなく**欄が埋まっているか**である。
 */

/** 未入力を名前で述べるための、溜まりの欄の名前。画面と書面がそのまま出す。 */
export type WorkingCapitalStock = '売上債権' | '棚卸資産' | '仕入債務';

/** CCC 算定の入力。 */
export interface WorkingCapitalInput {
  /** 売上債権 (円)。**未入力は undefined** — 0 (現金回収) と混ぜない。 */
  readonly accountsReceivable?: number;
  /** 棚卸資産 (円)。**未入力は undefined** — 0 (在庫を持たない) と混ぜない。 */
  readonly inventory?: number;
  /** 仕入債務 (円)。**未入力は undefined** — 0 (即日支払) と混ぜない。 */
  readonly accountsPayable?: number;
  /** 期間売上 (円, 通常は年次合計)。 */
  readonly revenue: number;
  /** 期間売上原価 (円)。 */
  readonly cogs: number;
  /** 期間の日数 (既定 365)。 */
  readonly days?: number;
}

/** CCC と運転資本。 */
export interface CashConversionCycle {
  /** 売上債権回転日数 (DSO)。売上が 0 なら null。 */
  readonly dso: number | null;
  /** 棚卸資産回転日数 (DIO)。売上原価が 0 なら null。 */
  readonly dio: number | null;
  /** 仕入債務回転日数 (DPO)。売上原価が 0 なら null。 */
  readonly dpo: number | null;
  /** CCC = DSO + DIO − DPO。構成要素が揃わなければ null。 */
  readonly ccc: number | null;
  /**
   * 運転資本 = 売上債権 + 棚卸資産 − 仕入債務 (円)。
   * **3 つのうち 1 つでも未入力なら null** —— 欠けた項を 0 として足すと、
   * 実測した合計と見分けが付かない額になる。
   */
  readonly workingCapital: number | null;
  /**
   * 未入力だった溜まりの欄 (入力順)。**「なぜ算定していないか」を画面と書面が
   * 名前で述べるために持つ** —— 「—」だけを出すと、利用者は自分の会社に
   * 運転資金が無いのだと読んでしまう。埋まっていれば空配列。
   */
  readonly missingStocks: readonly WorkingCapitalStock[];
}

/** 回転日数。溜まりが未入力、または分母のフローが 0 なら算定不能。 */
const day = (numer: number | undefined, denom: number, days: number): number | null =>
  numer !== undefined && denom > 0 ? Math.round((numer / denom) * days * 10) / 10 : null;

/** 運転資金指標 (CCC) を計算する。 */
export function computeCashConversionCycle(input: WorkingCapitalInput): CashConversionCycle {
  const days = input.days ?? 365;
  const ar = input.accountsReceivable;
  const inv = input.inventory;
  const ap = input.accountsPayable;
  const dso = day(ar, input.revenue, days);
  const dio = day(inv, input.cogs, days);
  const dpo = day(ap, input.cogs, days);
  /** 未入力の欄を 1 か所で名前にする (欄ごとに if を書き写さない)。 */
  const missing = (
    v: number | undefined,
    label: WorkingCapitalStock,
  ): readonly WorkingCapitalStock[] => (v === undefined ? [label] : []);
  // dio と dpo は同じ cogs を分母に持つが、**溜まりの有無は別々**なので同時に
  // null になるとは限らない (棚卸資産だけ空欄・仕入債務だけ空欄が起こる)。
  // 以前ここに在った「常に同時に null」という前提の Stryker pragma は
  // その時点で既に成り立たなくなったため外した。
  const ccc =
    dso !== null && dio !== null && dpo !== null
      ? Math.round((dso + dio - dpo) * 10) / 10
      : null;
  return {
    dso,
    dio,
    dpo,
    ccc,
    workingCapital:
      ar === undefined || inv === undefined || ap === undefined ? null : ar + inv - ap,
    missingStocks: [
      ...missing(ar, '売上債権'),
      ...missing(inv, '棚卸資産'),
      ...missing(ap, '仕入債務'),
    ],
  };
}

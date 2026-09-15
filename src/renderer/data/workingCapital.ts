/**
 * 運転資金 (working capital) と CCC (キャッシュ・コンバージョン・サイクル) —
 * 経営管理 (FP&A) の資金効率指標。
 *
 * CCC = 売上債権回転日数 (DSO) + 棚卸資産回転日数 (DIO) − 仕入債務回転日数 (DPO)。
 * 「売って現金になるまでの日数 − 仕入の支払を待てる日数」で、短い (またはマイナス)
 * ほど資金繰りが楽。BS 項目 (売上債権・棚卸・仕入債務) と KPI のフロー (売上・売上
 * 原価) を組み合わせて出す純粋ロジック。IO は持たない。
 *
 * ## 期間の長さは**渡してもらう** (2026-09-07)
 *
 * 回転日数は **溜まり ÷ 流れ × 期間の日数**である。分子は時点の値、分母は期間の合計
 * なので、**期間の長さを取り違えると答えがそのまま倍率でずれる**。
 * 2026-09-07 まで入力は `days?: number` (既定 365) で、唯一の呼び手 (`overview.ts`) は
 * **渡していなかった** —— 分母には「利用者が打ち込んだ全期の合計」が入るのに、
 * 期間は常に 1 年として割っていた。実測 (売上債権 200 万・棚卸 200 万・仕入債務 150 万・
 * 月商 400 万・原価 200 万/月・毎月同じ実績):
 *
 * | 入力した月数 | DSO | DIO | DPO | CCC | 経営ハイライト |
 * | --- | ---: | ---: | ---: | ---: | --- |
 * | 1 か月 | 182.5 | 365 | 273.8 | **273.7 日** | ⚠ 「運転資金の負担が大きい」 |
 * | 3 か月 | 60.8 | 121.7 | 91.3 | **91.2 日** | ⚠ 同 |
 * | 6 か月 | 30.4 | 60.8 | 45.6 | 45.6 日 | — |
 * | 12 か月 | 15.2 | 30.4 | 22.8 | **22.8 日** | — |
 *
 * **同じ会社が、実績を 1 か月だけ入れると CCC 273.7 日・12 か月入れると 22.8 日** に
 * なり、金融機関等提出用の書面 §5・経営スコアカードの効率性 (総合格付け)・
 * 経営ハイライトの警告がその数字で語っていた。直す道具は**既に引数として在った**
 * (`days`) のに、誰も渡していなかった。
 *
 * そこで入力を `periodMonths` (流れが何か月分の合計か) の**必須**欄にした。
 * 既定を残すと同じ欠陥が黙って戻る (パス 41 の出所と同じ考え)。
 * 12 なら年次の回転日数 (365 日基準)。業種で適正値は大きく異なる。
 *
 * 注意: 在庫 (stock) を期間フロー (売上・売上原価) で割る近似。
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
  /** 期間売上 (円)。`periodMonths` か月分の合計。 */
  readonly revenue: number;
  /** 期間売上原価 (円)。`periodMonths` か月分の合計。 */
  readonly cogs: number;
  /**
   * 上の流れ (売上・売上原価) が**何か月分の合計か**。**必須** ——
   * 回転日数は期間の長さで決まるので、既定値を置くと「打ち込んだ月数で答えが動く」
   * 欠陥が黙って戻る。0 以下・非有限なら期間が測れないので全項目 `null`。
   */
  readonly periodMonths: number;
}

/** 回転日数の基準となる 1 年の日数。**1 か所**に置く (閏年は無視する近似)。 */
export function yearDays(): number {
  return 365;
}

/**
 * 暦の 1 年の月数。**`kessanImport.ts` の `fiscalYearMonths()` とは別物** ——
 * あちらは「事業年度が 12 か月そろっているか」を判定する規則で、設立期・最終期は
 * 12 か月に満たないことが在る。こちらは月数を日数に直すための**暦の事実**。
 * 同じ 12 だからといって片方へ寄せてはいけない (寄せると `overview.ts` →
 * `workingCapital.ts` → `kessanImport.ts` → `bankSubmission.ts` → `overview.ts` の
 * 循環にもなる)。
 */
export function monthsPerYear(): number {
  return 12;
}

/** 月数を回転日数の「期間の日数」に直す。12 か月なら 365 日。 */
export function periodDaysForMonths(months: number): number {
  return (months * yearDays()) / monthsPerYear();
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
  /**
   * 算定に使った期間の月数 (= 入力の `periodMonths`)。**画面と書面が「何か月分の
   * 実績で出した回転日数か」を述べるために持ち回る** —— 日数だけを返すと、
   * 呼び手が月数を自分で数え直して食い違う。
   */
  readonly periodMonths: number;
}

/** 回転日数。溜まりが未入力、分母のフローが 0、期間が 0 日なら算定不能。 */
const day = (numer: number | undefined, denom: number, days: number): number | null =>
  numer !== undefined && denom > 0 && days > 0
    ? Math.round((numer / denom) * days * 10) / 10
    : null;

/** 運転資金指標 (CCC) を計算する。 */
export function computeCashConversionCycle(input: WorkingCapitalInput): CashConversionCycle {
  // 期間が測れなければ回転日数は定まらない。`day()` の分母の守りとは別に
  // **期間そのもの**を弾く (0 か月の合計を 365 日で割ると 12 倍膨らむ)。
  const days = Number.isFinite(input.periodMonths) && input.periodMonths > 0
    ? periodDaysForMonths(input.periodMonths)
    : 0;
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
    periodMonths: input.periodMonths,
  };
}

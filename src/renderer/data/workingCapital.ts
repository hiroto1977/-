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
 */

/** CCC 算定の入力。 */
export interface WorkingCapitalInput {
  /** 売上債権 (円)。 */
  readonly accountsReceivable: number;
  /** 棚卸資産 (円)。 */
  readonly inventory: number;
  /** 仕入債務 (円)。 */
  readonly accountsPayable: number;
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
  /** 運転資本 = 売上債権 + 棚卸資産 − 仕入債務 (常に算定可)。 */
  readonly workingCapital: number;
}

const day = (numer: number, denom: number, days: number): number | null =>
  denom > 0 ? Math.round((numer / denom) * days * 10) / 10 : null;

/** 運転資金指標 (CCC) を計算する。 */
export function computeCashConversionCycle(input: WorkingCapitalInput): CashConversionCycle {
  const days = input.days ?? 365;
  const dso = day(input.accountsReceivable, input.revenue, days);
  const dio = day(input.inventory, input.cogs, days);
  const dpo = day(input.accountsPayable, input.cogs, days);
  const ccc = dso !== null && dio !== null && dpo !== null
    ? Math.round((dso + dio - dpo) * 10) / 10
    : null;
  return {
    dso,
    dio,
    dpo,
    ccc,
    workingCapital: input.accountsReceivable + input.inventory - input.accountsPayable,
  };
}

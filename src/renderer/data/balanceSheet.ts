/**
 * 貸借対照表 (BS) ベースの財政状態指標 — 経営管理 (FP&A) の財務分析。
 *
 * 流動/固定の資産・負債と当期純利益から、自己資本比率・流動比率・当座比率・
 * ROA・ROE・固定比率を算出する純粋ロジック。BS は時点情報なので 1 レコード
 * (最新のみ) を `balance-sheet` コレクションに保存する。本モジュールは IO を
 * 持たない (呼び出し側が record store から渡す)。
 *
 * **重要 — これは概算の財務分析であり、財務助言ではありません。** しきい値は
 * 中小企業の一般的な目安で、業種・規模で適正値は異なります。
 */

export const BALANCE_SHEET_COLLECTION = 'balance-sheet';

/** 貸借対照表の入力 (円)。純資産は資産−負債で導出するため入力しない。 */
export interface BalanceSheet extends Record<string, unknown> {
  /** 基準日ラベル (任意, 例 "2026-03-31")。 */
  readonly asOf: string;
  readonly currentAssets: number;
  /** 現預金 (流動資産の内数。資金ランウェイに使う)。任意。 */
  readonly cash?: number;
  /** 棚卸資産 (流動資産の内数。当座比率・CCC に使う)。 */
  readonly inventory: number;
  /** 売上債権 (流動資産の内数。CCC の DSO に使う)。任意。 */
  readonly accountsReceivable: number;
  readonly fixedAssets: number;
  readonly currentLiabilities: number;
  /** 仕入債務 (流動負債の内数。CCC の DPO に使う)。任意。 */
  readonly accountsPayable: number;
  readonly fixedLiabilities: number;
  /** 当期純利益 (損失はマイナス可)。ROA・ROE に使う。 */
  readonly netIncome: number;
}

/** BS から導出した財政状態指標。比率は算定不能なら null。 */
export interface BalanceSheetMetrics {
  readonly totalAssets: number;
  readonly totalLiabilities: number;
  /** 純資産 (自己資本) = 総資産 − 総負債。マイナスは債務超過。 */
  readonly netAssets: number;
  /** 自己資本比率 (%) = 純資産 ÷ 総資産。 */
  readonly equityRatioPct: number | null;
  /** 流動比率 (%) = 流動資産 ÷ 流動負債。200% 以上が目安。 */
  readonly currentRatioPct: number | null;
  /** 当座比率 (%) = (流動資産 − 棚卸資産) ÷ 流動負債。100% 以上が目安。 */
  readonly quickRatioPct: number | null;
  /** 総資産利益率 ROA (%) = 当期純利益 ÷ 総資産。 */
  readonly roaPct: number | null;
  /** 自己資本利益率 ROE (%) = 当期純利益 ÷ 純資産 (純資産が正のときのみ)。 */
  readonly roePct: number | null;
  /** 固定比率 (%) = 固定資産 ÷ 純資産 (純資産が正のときのみ)。100% 以下が目安。 */
  readonly fixedRatioPct: number | null;
  /** 債務超過 (純資産がマイナス) か。 */
  readonly insolvent: boolean;
}

/** 検証 + coerce。資産・負債は 0 以上、当期純利益は損失も許容 (マイナス可)。 */
export function parseBalanceSheet(input: {
  asOf?: unknown;
  currentAssets?: unknown;
  cash?: unknown;
  inventory?: unknown;
  accountsReceivable?: unknown;
  fixedAssets?: unknown;
  currentLiabilities?: unknown;
  accountsPayable?: unknown;
  fixedLiabilities?: unknown;
  netIncome?: unknown;
}): BalanceSheet {
  // Number(number)===number なので typeof 分岐は不要 (簡約して equivalent mutant を排除)。
  const nonNeg = (v: unknown, label: string): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label}は 0 以上の数値で入力してください`);
    return n;
  };
  // Number('')===0 なので '' の特別扱いは不要。null/undefined のみ 0 に寄せる。
  const finite = (v: unknown, label: string): number => {
    const n = Number(v == null ? 0 : v);
    if (!Number.isFinite(n)) throw new Error(`${label}は数値で入力してください`);
    return n;
  };
  const asOf = typeof input.asOf === 'string' ? input.asOf.trim() : '';
  // 任意項目は未入力 (null/undefined) を 0 に。'' は nonNeg の Number('')=0 で吸収される
  // ため、ここでの '' 判定は不要 (冗長排除)。
  const opt = (v: unknown): unknown => (v == null ? 0 : v);
  const currentAssets = nonNeg(input.currentAssets, '流動資産');
  const cash = nonNeg(opt(input.cash), '現預金');
  const inventory = nonNeg(opt(input.inventory), '棚卸資産');
  const accountsReceivable = nonNeg(opt(input.accountsReceivable), '売上債権');
  const currentLiabilities = nonNeg(input.currentLiabilities, '流動負債');
  const accountsPayable = nonNeg(opt(input.accountsPayable), '仕入債務');
  if (cash > currentAssets) throw new Error('現預金は流動資産以下で入力してください');
  if (inventory > currentAssets) throw new Error('棚卸資産は流動資産以下で入力してください');
  if (accountsReceivable > currentAssets) throw new Error('売上債権は流動資産以下で入力してください');
  if (accountsPayable > currentLiabilities) throw new Error('仕入債務は流動負債以下で入力してください');
  return {
    asOf,
    currentAssets,
    cash,
    inventory,
    accountsReceivable,
    fixedAssets: nonNeg(input.fixedAssets, '固定資産'),
    currentLiabilities,
    accountsPayable,
    fixedLiabilities: nonNeg(input.fixedLiabilities, '固定負債'),
    netIncome: finite(input.netIncome, '当期純利益'),
  };
}

const pct = (numer: number, denom: number): number | null =>
  denom > 0 ? Math.round((numer / denom) * 1000) / 10 : null;

/** BS から財政状態指標を計算する。 */
export function computeBalanceSheetMetrics(bs: BalanceSheet): BalanceSheetMetrics {
  const totalAssets = bs.currentAssets + bs.fixedAssets;
  const totalLiabilities = bs.currentLiabilities + bs.fixedLiabilities;
  const netAssets = totalAssets - totalLiabilities;
  return {
    totalAssets,
    totalLiabilities,
    netAssets,
    equityRatioPct: pct(netAssets, totalAssets),
    currentRatioPct: pct(bs.currentAssets, bs.currentLiabilities),
    quickRatioPct: pct(bs.currentAssets - bs.inventory, bs.currentLiabilities),
    roaPct: pct(bs.netIncome, totalAssets),
    // pct は denom>0 のときだけ値を返し、それ以外は null。netAssets<=0 は pct 側で
    // null になるため外側の `netAssets > 0 ?` ガードは冗長 (削除して equivalent mutant を排除)。
    roePct: pct(bs.netIncome, netAssets),
    fixedRatioPct: pct(bs.fixedAssets, netAssets),
    insolvent: netAssets < 0,
  };
}

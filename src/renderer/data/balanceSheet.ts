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
  /** 棚卸資産 (流動資産の内数。当座比率に使う)。 */
  readonly inventory: number;
  readonly fixedAssets: number;
  readonly currentLiabilities: number;
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
  inventory?: unknown;
  fixedAssets?: unknown;
  currentLiabilities?: unknown;
  fixedLiabilities?: unknown;
  netIncome?: unknown;
}): BalanceSheet {
  const nonNeg = (v: unknown, label: string): number => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label}は 0 以上の数値で入力してください`);
    return n;
  };
  const finite = (v: unknown, label: string): number => {
    const n = typeof v === 'number' ? v : Number(v === '' || v == null ? 0 : v);
    if (!Number.isFinite(n)) throw new Error(`${label}は数値で入力してください`);
    return n;
  };
  const asOf = typeof input.asOf === 'string' ? input.asOf.trim() : '';
  const currentAssets = nonNeg(input.currentAssets, '流動資産');
  // 棚卸資産は任意 (未入力は 0)。
  const inventory = nonNeg(input.inventory == null || input.inventory === '' ? 0 : input.inventory, '棚卸資産');
  if (inventory > currentAssets) throw new Error('棚卸資産は流動資産以下で入力してください');
  return {
    asOf,
    currentAssets,
    inventory,
    fixedAssets: nonNeg(input.fixedAssets, '固定資産'),
    currentLiabilities: nonNeg(input.currentLiabilities, '流動負債'),
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
    roePct: netAssets > 0 ? pct(bs.netIncome, netAssets) : null,
    fixedRatioPct: netAssets > 0 ? pct(bs.fixedAssets, netAssets) : null,
    insolvent: netAssets < 0,
  };
}

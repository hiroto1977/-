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
  /**
   * 有利子負債 (借入金・社債等。流動・固定負債の内数)。任意。
   * 有利子負債比率・ネットデットに使う。未入力は 0 (無借金とみなす概算)。
   */
  readonly interestBearingDebt?: number;
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
  interestBearingDebt?: unknown;
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
  const fixedLiabilities = nonNeg(input.fixedLiabilities, '固定負債');
  const interestBearingDebt = nonNeg(opt(input.interestBearingDebt), '有利子負債');
  if (cash > currentAssets) throw new Error('現預金は流動資産以下で入力してください');
  if (inventory > currentAssets) throw new Error('棚卸資産は流動資産以下で入力してください');
  if (accountsReceivable > currentAssets) throw new Error('売上債権は流動資産以下で入力してください');
  if (accountsPayable > currentLiabilities) throw new Error('仕入債務は流動負債以下で入力してください');
  if (interestBearingDebt > currentLiabilities + fixedLiabilities)
    throw new Error('有利子負債は負債合計以下で入力してください');
  return {
    asOf,
    currentAssets,
    cash,
    inventory,
    accountsReceivable,
    fixedAssets: nonNeg(input.fixedAssets, '固定資産'),
    currentLiabilities,
    accountsPayable,
    fixedLiabilities,
    interestBearingDebt,
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

// ===========================================================================
// round 74: 貸借対照表の精緻化 (加算的) — 既存式・既存テスト期待値は不変。
// 運転資本 / 自己資本健全度 / 負債構成 / 流動性段階 / 純資産の質 を追加。
// すべて純粋関数。分母 0・負・非有限は null / 専用ラベルでガードする。
// **重要 — 概算の財務分析であり財務助言ではありません。** しきい値は中小企業の
// 一般的な目安で、業種・規模により適正値は異なります。
// ===========================================================================

/** 自己資本健全度の区分。 */
export type EquityHealthGrade =
  | 'excellent' // 自己資本比率 50% 以上
  | 'good' // 30% 以上 50% 未満
  | 'adequate' // 10% 以上 30% 未満
  | 'thin' // 0% 超 10% 未満
  | 'insolvent'; // 0% 以下 (債務超過)

/** 流動性 3 指標の総合段階。 */
export type LiquidityStage =
  | 'strong' // 当座比率 100% 以上 (即時の支払余力が十分)
  | 'sound' // 流動比率 100% 以上だが当座比率 100% 未満
  | 'tight' // 流動比率 100% 未満
  | 'unknown'; // 流動負債 0 などで算定不能

/** 純資産の質。 */
export type NetAssetQuality =
  | 'sound' // 純資産が正
  | 'breakeven' // 純資産がちょうど 0
  | 'insolvent'; // 純資産が負 (債務超過)

/** round 74 で追加する精緻化指標 (BS の深掘り)。比率は %、金額は円。 */
export interface BalanceSheetInsights {
  /** 運転資本 = 流動資産 − 流動負債 (円。常に算定可。負は資金繰り注意)。 */
  readonly workingCapital: number;
  /** 運転資本比率 (%) = 運転資本 ÷ 流動資産 (流動資産 0 なら null)。 */
  readonly workingCapitalRatioPct: number | null;
  /** 自己資本健全度の区分 (自己資本比率ベース)。 */
  readonly equityHealth: EquityHealthGrade;
  /** 固定長期適合率 (%) = 固定資産 ÷ (純資産 + 固定負債)。100% 以下が目安。分母 0/負なら null。 */
  readonly fixedLongTermFitPct: number | null;
  /** 有利子負債比率 (%) = 有利子負債 ÷ 総資産。総資産 0 なら null。 */
  readonly interestBearingDebtRatioPct: number | null;
  /** 負債比率 / D/E レシオ (%) = 総負債 ÷ 純資産 (純資産が正のときのみ)。 */
  readonly debtToEquityPct: number | null;
  /** ネットデット = 有利子負債 − 現預金 (円。負は実質無借金=ネットキャッシュ)。 */
  readonly netDebt: number;
  /** ネットキャッシュ (ネットデットが 0 以下) か。 */
  readonly netCashPositive: boolean;
  /** 流動性段階の総合判定。 */
  readonly liquidityStage: LiquidityStage;
  /** 純資産の質。 */
  readonly netAssetQuality: NetAssetQuality;
  /**
   * 実質債務超過 (純資産は正だが、有利子負債が現預金 + 換金性の高い資産を上回り
   * 純資産を食い潰している懸念) フラグ。ここでは「純資産が正かつネットデットが
   * 純資産を超える」を簡易シグナルとする (概算)。
   */
  readonly substantiveInsolvencyRisk: boolean;
}

/**
 * 自己資本健全度を純資産・総資産から判定する。
 * 純資産 0 以下 (債務超過) は insolvent。純資産が正のとき総資産は必ず正なので
 * (純資産 = 総資産 − 総負債、総負債 ≥ 0)、自己資本比率の除算は安全。
 * それ以外は自己資本比率 = 純資産 ÷ 総資産 (%) の区分で判定する。
 */
function classifyEquityHealth(netAssets: number, totalAssets: number): EquityHealthGrade {
  if (netAssets <= 0) return 'insolvent';
  const ratio = (netAssets / totalAssets) * 100;
  if (ratio >= 50) return 'excellent';
  if (ratio >= 30) return 'good';
  if (ratio >= 10) return 'adequate';
  return 'thin';
}

/**
 * 流動性段階を判定する。流動負債 0 は unknown。当座資産 (流動資産 − 棚卸資産) が
 * 流動負債以上なら strong、流動資産が流動負債以上なら sound、それ未満は tight。
 * (当座比率 100% 以上 → strong / 流動比率 100% 以上 → sound と等価。)
 */
function classifyLiquidityStage(
  currentAssets: number,
  inventory: number,
  currentLiabilities: number,
): LiquidityStage {
  if (currentLiabilities <= 0) return 'unknown';
  if (currentAssets - inventory >= currentLiabilities) return 'strong';
  if (currentAssets >= currentLiabilities) return 'sound';
  return 'tight';
}

/** 純資産額から質を判定する。 */
function classifyNetAssetQuality(netAssets: number): NetAssetQuality {
  if (netAssets > 0) return 'sound';
  if (netAssets < 0) return 'insolvent';
  return 'breakeven';
}

/**
 * BS から round 74 の精緻化指標を計算する。既存の computeBalanceSheetMetrics は
 * 変更せず、本関数で追加の深掘り分析を返す (加算的)。
 */
export function computeBalanceSheetInsights(bs: BalanceSheet): BalanceSheetInsights {
  const base = computeBalanceSheetMetrics(bs);
  const interestBearingDebt = bs.interestBearingDebt ?? 0;
  const cash = bs.cash ?? 0;

  const workingCapital = bs.currentAssets - bs.currentLiabilities;
  const longTermCapital = base.netAssets + bs.fixedLiabilities;
  const netDebt = interestBearingDebt - cash;

  return {
    workingCapital,
    workingCapitalRatioPct: pct(workingCapital, bs.currentAssets),
    equityHealth: classifyEquityHealth(base.netAssets, base.totalAssets),
    fixedLongTermFitPct: pct(bs.fixedAssets, longTermCapital),
    interestBearingDebtRatioPct: pct(interestBearingDebt, base.totalAssets),
    debtToEquityPct: pct(base.totalLiabilities, base.netAssets),
    netDebt,
    netCashPositive: netDebt <= 0,
    liquidityStage: classifyLiquidityStage(bs.currentAssets, bs.inventory, bs.currentLiabilities),
    netAssetQuality: classifyNetAssetQuality(base.netAssets),
    // 純資産が正 (sound) かつ ネットデットが純資産を上回る → 実質的な財務リスクシグナル。
    substantiveInsolvencyRisk: base.netAssets > 0 && netDebt > base.netAssets,
  };
}

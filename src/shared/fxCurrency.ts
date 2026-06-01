/**
 * 外貨換算・為替損益・実効レート (概算試算)。
 *
 * 外貨建ての金額を円換算し、取得時レートと現在レートの差から為替損益を、
 * 複数ロットから加重平均の実効レートを求める純粋関数群。IO は持たない。
 *
 * **重要 — 概算試算であり投資助言ではありません。** 実際の損益は手数料・スプレッド・
 * 税の影響を含まず、ここでは考慮しない。
 */

const yen = (n: number): number => Math.round(n);

/** 外貨額 × レート = 円換算額。負の入力は 0 とみなす。 */
export function convertToJpy(amountForeign: number, rate: number): number {
  const a = amountForeign > 0 ? amountForeign : 0;
  const r = rate > 0 ? rate : 0;
  return yen(a * r);
}

/** 為替損益の内訳。 */
export interface FxGainLoss {
  /** 取得時の円換算額。 */
  readonly acquisitionJpy: number;
  /** 現在レートでの円換算額。 */
  readonly currentJpy: number;
  /** 為替損益 (円) = 現在 − 取得。プラスで為替差益。 */
  readonly gain: number;
  /** 損益率 (%)。取得時レートが 0 以下なら null。 */
  readonly gainPct: number | null;
}

/**
 * 外貨建て元本の為替損益を計算する。
 * gain = 外貨額 × (現在レート − 取得レート)。為替変動による円ベースの損益のみ
 * (現地価格の変動は含まない)。
 */
export function fxGainLoss(input: {
  amountForeign: number;
  acquisitionRate: number;
  currentRate: number;
}): FxGainLoss {
  const amount = input.amountForeign > 0 ? input.amountForeign : 0;
  const acquisitionJpy = yen(amount * Math.max(0, input.acquisitionRate));
  const currentJpy = yen(amount * Math.max(0, input.currentRate));
  const gain = currentJpy - acquisitionJpy;
  const gainPct = input.acquisitionRate > 0
    ? Math.round(((input.currentRate - input.acquisitionRate) / input.acquisitionRate) * 1000) / 10
    : null;
  return { acquisitionJpy, currentJpy, gain, gainPct };
}

/** 1 ロット (外貨額 + 約定レート)。 */
export interface FxLot {
  readonly amountForeign: number;
  readonly rate: number;
}

/**
 * 複数ロットの加重平均 (実効) 取得レートを返す。
 * = Σ(外貨額 × レート) ÷ Σ(外貨額)。外貨額の合計が 0 なら null。
 * 結果はレートの性質上 0.0001 単位に丸める。
 */
export function effectiveRate(lots: readonly FxLot[]): number | null {
  let totalForeign = 0;
  let totalJpy = 0;
  for (const lot of lots) {
    const a = lot.amountForeign > 0 ? lot.amountForeign : 0;
    const r = lot.rate > 0 ? lot.rate : 0;
    totalForeign += a;
    totalJpy += a * r;
  }
  if (totalForeign <= 0) return null;
  return Math.round((totalJpy / totalForeign) * 10000) / 10000;
}

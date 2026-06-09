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
  const a = Math.max(0, amountForeign);
  const r = Math.max(0, rate);
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
  const amount = Math.max(0, input.amountForeign);
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
    const a = Math.max(0, lot.amountForeign);
    const r = Math.max(0, lot.rate);
    totalForeign += a;
    totalJpy += a * r;
  }
  if (totalForeign <= 0) return null;
  return Math.round((totalJpy / totalForeign) * 10000) / 10000;
}

/** レートを 0.0001 単位に丸める内部ヘルパ。 */
const rate4 = (n: number): number => Math.round(n * 10000) / 10000;

/** 有限かつ正かを判定する内部ヘルパ。 */
const isFinitePositive = (n: number): boolean => Number.isFinite(n) && n > 0;

/** 有限なら値、非有限なら 0 を返す内部ヘルパ。 */
const finiteOr0 = (n: number): number => (Number.isFinite(n) ? n : 0);

/** TTM (仲値) を基準とした対顧客 TT レートの三点。 */
export interface TtRates {
  /** 仲値 (Telegraphic Transfer Middle rate)。 */
  readonly ttm: number;
  /** 電信売相場 (銀行が外貨を売る = 顧客が買う): TTM + 片道手数料。 */
  readonly tts: number;
  /** 電信買相場 (銀行が外貨を買う = 顧客が売る): TTM − 片道手数料。 */
  readonly ttb: number;
}

/**
 * 仲値 (TTM) と片道手数料 (円/通貨単位) から TTS / TTB を算出する。
 * TTS = TTM + 手数料、TTB = TTM − 手数料。手数料の負は 0 とみなす。
 * TTM が有限正でなければ null。手数料が TTM を超える場合 TTB は 0 で下限を切る。
 */
export function ttRates(ttm: number, oneWayFeeYen: number): TtRates | null {
  if (!isFinitePositive(ttm)) return null;
  const fee = Math.max(0, finiteOr0(oneWayFeeYen));
  const tts = rate4(ttm + fee);
  const ttb = rate4(Math.max(0, ttm - fee));
  return { ttm: rate4(ttm), tts, ttb };
}

/** 円→外貨→円の往復両替コスト内訳。 */
export interface RoundTripCost {
  /** 投入円。 */
  readonly startJpy: number;
  /** TTS で買えた外貨額。 */
  readonly foreign: number;
  /** その外貨を即 TTB で売り戻して戻る円。 */
  readonly endJpy: number;
  /** 往復で失った円 (スプレッド損) = startJpy − endJpy。 */
  readonly costJpy: number;
  /** 往復コスト率 (%) = costJpy / startJpy × 100。startJpy が 0 以下なら null。 */
  readonly costPct: number | null;
}

/**
 * 投入円を TTS で外貨に替え、即座に TTB で円に戻したときの往復両替コストを試算する。
 * costJpy = startJpy − (startJpy / tts) × ttb。
 * startJpy・ttb は負を 0 とみなす。tts が有限正でなければ null
 * (買えないので往復が定義できない)。
 */
export function roundTripCost(startJpy: number, tts: number, ttb: number): RoundTripCost | null {
  if (!isFinitePositive(tts)) return null;
  const start = Math.max(0, finiteOr0(startJpy));
  const sellRate = Math.max(0, finiteOr0(ttb));
  const foreign = start / tts;
  const endJpy = yen(foreign * sellRate);
  const costJpy = yen(start) - endJpy;
  const costPct = start > 0 ? Math.round((costJpy / start) * 1000) / 10 : null;
  return {
    startJpy: yen(start),
    foreign: rate4(foreign),
    endJpy,
    costJpy,
    costPct,
  };
}

/**
 * 2 通貨の対円レートから合成クロスレート (base/quote) を返す。
 * 例: EURJPY=160, USDJPY=150 → EUR/USD = 160 / 150 ≈ 1.0667。
 * base/quote = baseJpy ÷ quoteJpy。quoteJpy が有限正でなければ、または baseJpy が
 * 負・非有限なら null。結果は 0.0001 単位に丸める。
 */
export function crossRate(baseJpy: number, quoteJpy: number): number | null {
  if (!isFinitePositive(quoteJpy)) return null;
  if (!Number.isFinite(baseJpy) || baseJpy < 0) return null;
  return rate4(baseJpy / quoteJpy);
}

/** TT レート込みの実効適用レートと両替コスト。 */
export interface EffectiveExchange {
  /** 適用した片道レート (買いなら TTS、売りなら TTB)。 */
  readonly appliedRate: number;
  /** 取引で受け渡される相手側金額。買い: 受取外貨、売り: 受取円。 */
  readonly received: number;
  /** TTM 基準額との差 = 手数料負担 (円)。 */
  readonly feeCostJpy: number;
}

/**
 * TTM と片道手数料から、円→外貨「買い」または外貨→円「売り」の実効適用レートと
 * コストを試算する。
 * - 買い (direction='buy'): 投入円 amount を TTS で外貨に。received = amount / TTS。
 *   feeCostJpy = (amount/TTM − amount/TTS) × TTM = 手数料相当の円負担。
 * - 売り (direction='sell'): 外貨 amount を TTB で円に。received = amount × TTB。
 *   feeCostJpy = amount × (TTM − TTB) = amount × 手数料。
 * TTM が有限正でなければ null。amount の負は 0 とみなす。
 */
export function effectiveExchange(input: {
  ttm: number;
  oneWayFeeYen: number;
  amount: number;
  direction: 'buy' | 'sell';
}): EffectiveExchange | null {
  const tt = ttRates(input.ttm, input.oneWayFeeYen);
  if (tt === null) return null;
  const amount = Math.max(0, finiteOr0(input.amount));
  if (input.direction === 'buy') {
    const received = rate4(amount / tt.tts);
    const atMid = amount / tt.ttm;
    const feeCostJpy = yen((atMid - amount / tt.tts) * tt.ttm);
    return { appliedRate: tt.tts, received, feeCostJpy };
  }
  const received = yen(amount * tt.ttb);
  const feeCostJpy = yen(amount * (tt.ttm - tt.ttb));
  return { appliedRate: tt.ttb, received, feeCostJpy };
}

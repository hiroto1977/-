/**
 * 養殖 (海水魚・淡水魚) —— 魚種の一覧、出荷までの収支の概算、水温の点検 (2026-11-18)。
 *
 * 魚種は利用者が足したり消したりできる ({@link FISH_SPECIES_SPEC} · 一覧の処理は `farmProductList.ts`)。
 * 魚種ごとに**海水か淡水か**を持つ —— 画面は水の種類で一覧を分けて見せる。
 *
 * ## 参考の一覧は置き値である
 *
 * {@link DEFAULT_FISH_SPECIES} の日数・重さ・生残率・増肉係数・単価・水温の目安は、**出典のある統計ではない**。
 * 入力欄を埋めやすくするための置き値で、種苗・餌・設備・地域で大きく変わる。画面がそう述べ、
 * 利用者は自分の実績に書き換えて使う。
 *
 * ## 概算の式 (1 回の出荷まで)
 *
 * - 出荷尾数 = 入れる尾数 × 生残率 (端数は切り捨て)
 * - 出荷量 (kg) = 出荷尾数 × 出荷時の重さ (g) ÷ 1000
 * - 売上 = 出荷量 × 単価 (円/kg)
 * - 餌の量 (kg) = 出荷量 × 増肉係数
 *   (簡略: 種苗の重さを差し引かず、途中で死んだ魚が食べた餌も数えない —— 画面がそう述べる)
 * - 費用 = 餌の量 × 餌の単価 + 入れる尾数 × 種苗の単価 + その他の費用
 * - 差引 = 売上 − 費用
 * - 1 年あたり = 差引 × 365 ÷ 出荷までの日数 (同じ規模で途切れず続けた場合の換算)
 */
import { nonNeg } from './num';
import type { FarmItem, FarmListSpec } from './farmProductList';

/** 水の種類。 */
export const WATER_KINDS = ['sea', 'fresh'] as const;
export type WaterKind = (typeof WATER_KINDS)[number];

/** 水の種類の呼び名。 */
export const WATER_KIND_LABELS: Readonly<Record<WaterKind, string>> = {
  sea: '海水魚',
  fresh: '淡水魚',
};

/** 水の種類として読める値か。 */
export function isWaterKind(v: unknown): v is WaterKind {
  return v === 'sea' || v === 'fresh';
}

/** 魚種の数値の欄。画面の入力欄・検査・保存が同じ並びを使う。 */
export const FISH_SPECIES_FIELDS = [
  'growOutDays',
  'harvestWeightG',
  'survivalPct',
  'feedConversion',
  'pricePerKgYen',
  'tempLowC',
  'tempHighC',
] as const;
export type FishSpeciesField = (typeof FISH_SPECIES_FIELDS)[number];

/** 魚種が数値のほかに持つ欄。 */
export interface FishSpeciesExtra {
  readonly water: WaterKind;
}

/** 魚種 1 件。 */
export type FishSpecies = FarmItem<FishSpeciesField, FishSpeciesExtra>;

/** 参考の魚種。**置き値** (上の説明)。淡水 3 種・海水 2 種。 */
export const DEFAULT_FISH_SPECIES: readonly FishSpecies[] = Object.freeze([
  {
    id: 'rainbow-trout', label: 'ニジマス', water: 'fresh',
    growOutDays: 365, harvestWeightG: 200, survivalPct: 80, feedConversion: 1.3, pricePerKgYen: 1200, tempLowC: 8, tempHighC: 18,
  },
  {
    id: 'tilapia', label: 'ティラピア', water: 'fresh',
    growOutDays: 240, harvestWeightG: 500, survivalPct: 80, feedConversion: 1.6, pricePerKgYen: 1000, tempLowC: 24, tempHighC: 30,
  },
  {
    id: 'honmoroko', label: 'ホンモロコ', water: 'fresh',
    growOutDays: 240, harvestWeightG: 10, survivalPct: 60, feedConversion: 2, pricePerKgYen: 2500, tempLowC: 15, tempHighC: 28,
  },
  {
    id: 'red-seabream', label: 'マダイ', water: 'sea',
    growOutDays: 730, harvestWeightG: 1200, survivalPct: 80, feedConversion: 2.5, pricePerKgYen: 1000, tempLowC: 15, tempHighC: 28,
  },
  {
    id: 'flounder', label: 'ヒラメ', water: 'sea',
    growOutDays: 365, harvestWeightG: 800, survivalPct: 75, feedConversion: 1.3, pricePerKgYen: 1800, tempLowC: 15, tempHighC: 25,
  },
]);

/**
 * 魚種の一覧の決まり。範囲は**桁誤りを止める幅**で、適正な値の幅ではない。
 * - 出荷までの日数: 1〜3,650 日 (0 は 0 除算 —— 年換算で割る)。
 * - 出荷時の重さ: 0.1〜500,000 g (稚魚で出す種から大型魚まで)。
 * - 生残率: 1〜100 %。
 * - 増肉係数: 0.1〜30 (餌の重さ ÷ 増えた魚の重さ。生餌では 10 を超える)。
 * - 単価: 1〜1,000,000 円/kg。
 * - 水温の目安: 0〜40 ℃、下限 ≦ 上限。
 */
export const FISH_SPECIES_SPEC: FarmListSpec<FishSpeciesField, FishSpeciesExtra> = {
  noun: '魚種',
  numericFields: FISH_SPECIES_FIELDS,
  labels: {
    growOutDays: '出荷までの日数 (日)',
    harvestWeightG: '出荷時の重さ (g/尾)',
    survivalPct: '生残率 (%)',
    feedConversion: '増肉係数 (餌 kg ÷ 増重 kg)',
    pricePerKgYen: '単価 (円/kg)',
    tempLowC: '水温の目安 下限 (℃)',
    tempHighC: '水温の目安 上限 (℃)',
  },
  bounds: {
    growOutDays: { min: 1, max: 3650, integer: true },
    harvestWeightG: { min: 0.1, max: 500_000, integer: false },
    survivalPct: { min: 1, max: 100, integer: false },
    feedConversion: { min: 0.1, max: 30, integer: false },
    pricePerKgYen: { min: 1, max: 1_000_000, integer: false },
    tempLowC: { min: 0, max: 40, integer: false },
    tempHighC: { min: 0, max: 40, integer: false },
  },
  orders: [{ low: 'tempLowC', high: 'tempHighC', message: '水温の目安は下限 ≦ 上限にしてください' }],
  extra: {
    issues: (raw) => (isWaterKind(raw.water) ? [] : ['海水魚か淡水魚かを選んでください']),
    pick: (raw) => ({ water: raw.water as WaterKind }),
  },
  builtins: DEFAULT_FISH_SPECIES,
};

/** 一覧のうち、その水の種類の魚種だけ (並びは一覧のまま)。 */
export function speciesOfWater(list: readonly FishSpecies[], water: WaterKind): readonly FishSpecies[] {
  return list.filter((s) => s.water === water);
}

/** 概算の入力 (1 回の出荷まで)。 */
export interface AquaculturePlan {
  /** 入れる尾数 (種苗)。 */
  readonly stockCount: number;
  /** 種苗の単価 (円/尾)。 */
  readonly fryYenPerFish: number;
  /** 餌の単価 (円/kg)。 */
  readonly feedYenPerKg: number;
  /** その他の費用 (円 · 1 回の出荷まで) —— 電気・人件費・水・薬など。 */
  readonly otherCostYen: number;
}

export interface AquacultureEstimate {
  /** 出荷尾数。 */
  readonly harvestCount: number;
  /** 出荷量 (kg)。 */
  readonly harvestKg: number;
  /** 売上 (円)。 */
  readonly revenueYen: number;
  /** 餌の量 (kg)。 */
  readonly feedKg: number;
  /** 餌の費用 (円)。 */
  readonly feedCostYen: number;
  /** 種苗の費用 (円)。 */
  readonly fryCostYen: number;
  /** 費用の合計 (円)。 */
  readonly costYen: number;
  /** 差引 (円 · 1 回の出荷まで)。赤字なら負。 */
  readonly profitYen: number;
  /** 出荷までの日数。 */
  readonly growOutDays: number;
  /** 1 年あたりの差引 (円)。出荷までの日数が読めなければ `null`。 */
  readonly profitPerYearYen: number | null;
}

/** 0.1 kg まで (量)。 */
function roundKg(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * 1 回の出荷までの収支を概算する。
 * 入力の負・非有限は 0 として扱う (`nonNeg`) —— 画面の関門が先に断るので、ここは床である。
 */
export function estimateAquaculture(plan: AquaculturePlan, species: FishSpecies): AquacultureEstimate {
  const stock = nonNeg(plan.stockCount);
  const harvestCount = Math.floor((stock * nonNeg(species.survivalPct)) / 100);
  const harvestKgRaw = (harvestCount * nonNeg(species.harvestWeightG)) / 1000;
  const feedKgRaw = harvestKgRaw * nonNeg(species.feedConversion);
  const revenueYen = Math.round(harvestKgRaw * nonNeg(species.pricePerKgYen));
  const feedCostYen = Math.round(feedKgRaw * nonNeg(plan.feedYenPerKg));
  const fryCostYen = Math.round(stock * nonNeg(plan.fryYenPerFish));
  const costYen = feedCostYen + fryCostYen + Math.round(nonNeg(plan.otherCostYen));
  const profitYen = revenueYen - costYen;
  const days = nonNeg(species.growOutDays);
  return {
    harvestCount,
    harvestKg: roundKg(harvestKgRaw),
    revenueYen,
    feedKg: roundKg(feedKgRaw),
    feedCostYen,
    fryCostYen,
    costYen,
    profitYen,
    growOutDays: days,
    profitPerYearYen: days > 0 ? Math.round((profitYen * 365) / days) : null,
  };
}

/** 水温の点検の結果。 */
export type WaterTempVerdict = 'low' | 'ok' | 'high';

/** 測った水温を、魚種の目安と比べる。境目 (下限・上限ちょうど) は範囲内。 */
export function waterTempVerdict(species: Pick<FishSpecies, 'tempLowC' | 'tempHighC'>, tempC: number): WaterTempVerdict {
  if (tempC < species.tempLowC) return 'low';
  return tempC > species.tempHighC ? 'high' : 'ok';
}

/** 水温の点検の文。目安の幅を必ず名乗る (何と比べたかを言う)。 */
export function waterTempNote(
  species: Pick<FishSpecies, 'label' | 'tempLowC' | 'tempHighC'>,
  tempC: number,
): string {
  const range = `${species.label}の目安 ${species.tempLowC}〜${species.tempHighC} ℃`;
  switch (waterTempVerdict(species, tempC)) {
    case 'low':
      return `水温 ${tempC} ℃ は${range}より低いです。餌を食べる量が落ちやすいので、給餌の量を見直してください。`;
    case 'high':
      return `水温 ${tempC} ℃ は${range}より高いです。酸素が不足しやすいので、ばっ気 (エアレーション) と換水を確かめ、給餌を控えめにしてください。`;
    case 'ok':
      return `水温 ${tempC} ℃ は${range}の範囲内です。`;
  }
}

/**
 * 始める前の許可・届出の案内。**アプリは要否を判定しない** —— 窓口で確かめるよう述べるだけ。
 */
export const AQUACULTURE_NOTICE =
  '養殖を事業として始めるときは、許可や届出が要る場合があります (例: うなぎの養殖は許可制、陸上の養殖は届出制、海面の養殖は漁業権)。' +
  '魚種と場所で決まりが違うので、始める前に都道府県の水産の窓口で確かめてください。';

/**
 * 養蜂 —— 産物の一覧と、群数からの収支の概算 (2026-11-18)。
 *
 * 産物 (はちみつ・蜜蝋ほか) は利用者が足したり消したりできる ({@link BEE_PRODUCT_SPEC} ·
 * 一覧の処理は `farmProductList.ts`)。概算は**一覧に在る全部の産物を合算する** ——
 * 1 つの群から複数の産物が採れるので、水耕栽培のように 1 品目を選ぶ形にしない。
 * 採らない産物は一覧から消す。
 *
 * ## 参考の一覧は置き値である
 *
 * {@link DEFAULT_BEE_PRODUCTS} の採取量と単価は、**出典のある統計ではない**。入力欄を埋めやすく
 * するための置き値で、地域・蜜源・群の強さ・売り方で大きく変わる。画面がそう述べ、
 * 利用者は自分の実績に書き換えて使う。
 *
 * ## 概算の式
 *
 * - 産物ごとの年間の量 (kg) = 群数 × 1 群あたりの年間採取量 (kg)
 * - 産物ごとの売上 = 年間の量 × 単価 (円/kg)
 * - 年間の費用 = 群数 × 1 群あたりの年間費用 + 年間の固定費
 * - 年間の差引 = 売上の合計 − 年間の費用
 */
import { nonNeg } from './num';
import { NO_EXTRA_FIELDS, type FarmItem, type FarmListSpec } from './farmProductList';

/** 産物の数値の欄。画面の入力欄・検査・保存が同じ並びを使う。 */
export const BEE_PRODUCT_FIELDS = ['yieldPerHiveKg', 'pricePerKgYen'] as const;
export type BeeProductField = (typeof BEE_PRODUCT_FIELDS)[number];

/** 産物 1 件。 */
export type BeeProduct = FarmItem<BeeProductField, object>;

/**
 * 参考の産物。**置き値** (上の説明)。3 つを合算しても 1 群の採取量として不自然にならない量にしてある
 * (はちみつ 2 種で 15 kg)。
 */
export const DEFAULT_BEE_PRODUCTS: readonly BeeProduct[] = Object.freeze([
  { id: 'honey-multifloral', label: '百花蜜', yieldPerHiveKg: 10, pricePerKgYen: 5000 },
  { id: 'honey-acacia', label: 'アカシア蜜', yieldPerHiveKg: 5, pricePerKgYen: 7000 },
  { id: 'beeswax', label: '蜜蝋', yieldPerHiveKg: 0.3, pricePerKgYen: 3000 },
]);

/**
 * 産物の一覧の決まり。範囲は**桁誤りを止める幅**で、適正な値の幅ではない。
 * - 採取量: 0.01〜500 kg/群/年 (蜜蝋やローヤルゼリーは 1 kg に満たない)。
 * - 単価: 1〜1,000,000 円/kg (ローヤルゼリーは 1 kg あたり数万円になる)。
 */
export const BEE_PRODUCT_SPEC: FarmListSpec<BeeProductField, object> = {
  noun: '産物',
  numericFields: BEE_PRODUCT_FIELDS,
  labels: {
    yieldPerHiveKg: '1 群あたりの年間採取量 (kg)',
    pricePerKgYen: '単価 (円/kg)',
  },
  bounds: {
    yieldPerHiveKg: { min: 0.01, max: 500, integer: false },
    pricePerKgYen: { min: 1, max: 1_000_000, integer: false },
  },
  orders: [],
  extra: NO_EXTRA_FIELDS,
  builtins: DEFAULT_BEE_PRODUCTS,
};

/** 概算の入力。 */
export interface BeekeepingPlan {
  /** 飼う群の数。 */
  readonly hives: number;
  /** 1 群あたりの年間費用 (円) —— 給餌・薬剤・巣箱の更新など。 */
  readonly costPerHiveYen: number;
  /** 年間の固定費 (円) —— 車両・瓶やラベル・採蜜の道具など。 */
  readonly fixedCostYen: number;
}

/** 産物ごとの概算。 */
export interface BeeProductEstimate {
  readonly id: string;
  readonly label: string;
  /** 年間の量 (kg)。 */
  readonly volumeKg: number;
  /** 年間の売上 (円)。 */
  readonly revenueYen: number;
}

export interface BeekeepingEstimate {
  readonly rows: readonly BeeProductEstimate[];
  /** 売上の合計 (円/年)。 */
  readonly revenueYen: number;
  /** 費用の合計 (円/年)。 */
  readonly costYen: number;
  /** 差引 (円/年)。赤字なら負。 */
  readonly profitYen: number;
}

/** 0.1 kg まで (量)。 */
function roundKg(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * 群数と産物の一覧から年間の収支を概算する。
 * 入力の負・非有限は 0 として扱う (`nonNeg`) —— 画面の関門が先に断るので、ここは床である。
 */
export function estimateBeekeeping(plan: BeekeepingPlan, products: readonly BeeProduct[]): BeekeepingEstimate {
  const hives = nonNeg(plan.hives);
  const rows = products.map((p) => {
    const volume = hives * nonNeg(p.yieldPerHiveKg);
    return {
      id: p.id,
      label: p.label,
      volumeKg: roundKg(volume),
      revenueYen: Math.round(volume * nonNeg(p.pricePerKgYen)),
    };
  });
  const revenueYen = rows.reduce((sum, r) => sum + r.revenueYen, 0);
  const costYen = Math.round(hives * nonNeg(plan.costPerHiveYen) + nonNeg(plan.fixedCostYen));
  return { rows, revenueYen, costYen, profitYen: revenueYen - costYen };
}

/**
 * 始める前の届出の案内。**アプリは届出の要否を判定しない** —— 窓口で確かめるよう述べるだけ。
 */
export const BEEKEEPING_NOTICE =
  '蜜蜂を飼うときは、養蜂振興法にもとづく都道府県への飼育届が要ります (趣味で飼う場合も対象になることがあります)。' +
  '巣箱を置く場所や時期の決まりは都道府県ごとに違うので、始める前に都道府県の畜産の窓口で確かめてください。';

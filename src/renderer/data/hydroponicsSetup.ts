/**
 * 水耕栽培の設備・費用の入力レコード。
 *
 * 経営サマリーに載る栽培の数字は**すべてこのレコードから**出る。参考値
 * (`HYDROPONIC_CROPS` の品目条件・電力原単位) は入力欄の初期値としてだけ
 * 使い、サマリーの数値には利用者が確定した値しか入らない。サンプルを
 * 混ぜないという経営サマリーの約束をここでも守る。
 *
 * 最新の 1 件を採用する (貸借対照表と同じ扱い)。過去の入力は履歴として残る。
 */

import {
  HYDROPONIC_CROPS,
  ENERGY_INTENSITY_KWH_PER_KG_LOW,
  ENERGY_INTENSITY_KWH_PER_KG_HIGH,
  estimateEconomics,
  type HydroponicCropId,
  type HydroponicsEconomics,
  type FacilityInput,
  type CostInput,
} from '../../shared/hydroponics';

export const HYDROPONICS_COLLECTION = 'hydroponics-setup';

/** 保存する入力。単位は各フィールドのコメントのとおり。 */
export interface HydroponicsSetup extends Record<string, unknown> {
  /** 栽培室の床面積 (m²)。 */
  readonly floorAreaSqm: number;
  /** 栽培棚の段数。 */
  readonly tiers: number;
  /** 栽培に使える床面積の割合 (%)。通路・調製室を除いた分。 */
  readonly usableRatioPct: number;
  /** 品目。 */
  readonly cropId: HydroponicCropId;
  /** 出荷できる株の割合 (%)。自分の実績を入れる。 */
  readonly yieldRatePct: number;
  /** 販売単価 (円/株)。 */
  readonly unitPriceYen: number;
  /** 電力単価 (円/kWh)。 */
  readonly electricityYenPerKwh: number;
  /** 電力原単位 (kWh/kg)。 */
  readonly energyIntensityKwhPerKg: number;
  /** 種苗費 (円/株)。 */
  readonly seedYenPerPlant: number;
  /** 肥料・養液費 (円/株)。 */
  readonly nutrientYenPerPlant: number;
  /** 包装・出荷資材費 (円/株)。 */
  readonly packagingYenPerPlant: number;
  /** 人件費 (円/月)。 */
  readonly laborYenPerMonth: number;
  /** 減価償却費 (円/月)。 */
  readonly depreciationYenPerMonth: number;
  /** 地代家賃 (円/月)。 */
  readonly rentYenPerMonth: number;
  /** その他固定費 (円/月)。 */
  readonly otherFixedYenPerMonth: number;
}

/**
 * 入力欄の初期値。**参考値であって実績ではない**ので、そのまま保存せず
 * 自分の数字に置き換えて使うこと。
 *
 * 電力原単位はレタスの参考幅 10〜20 kWh/kg の**中央**を置く。歩留まりは
 * 出典で裏付けられる一般値が無いので、控えめな 85% を初期値にしてある
 * (根拠のある数字ではなく、埋めやすさのための置き値)。
 */
export const HYDROPONICS_DEFAULTS: HydroponicsSetup = {
  floorAreaSqm: 330,
  tiers: 10,
  usableRatioPct: 70,
  cropId: 'leaf-lettuce',
  yieldRatePct: 85,
  unitPriceYen: 150,
  electricityYenPerKwh: 25,
  energyIntensityKwhPerKg: (ENERGY_INTENSITY_KWH_PER_KG_LOW + ENERGY_INTENSITY_KWH_PER_KG_HIGH) / 2,
  seedYenPerPlant: 3,
  nutrientYenPerPlant: 2,
  packagingYenPerPlant: 12,
  laborYenPerMonth: 3_000_000,
  depreciationYenPerMonth: 2_000_000,
  rentYenPerMonth: 600_000,
  otherFixedYenPerMonth: 400_000,
};

/**
 * 保存されている品目 id を既知のものへ寄せる (壊れた値で落ちないように)。
 *
 * `typeof id === 'string' &&` を前置きしたくなるが、`Set.has` は値を変換せず
 * そのまま照合するので数値・null・オブジェクトはどれも false になる。前置きは
 * 結果を変えない分岐＝観測できない変異体になるので置かない。
 */
const CROP_IDS: ReadonlySet<unknown> = new Set<unknown>(Object.keys(HYDROPONIC_CROPS));

export function resolveCrop(id: unknown): HydroponicCropId {
  return CROP_IDS.has(id) ? (id as HydroponicCropId) : 'leaf-lettuce';
}

/** レコードを設備入力へ。% は 0..1 の割合に直す。 */
export function toFacilityInput(s: HydroponicsSetup): FacilityInput {
  return {
    floorAreaSqm: s.floorAreaSqm,
    tiers: s.tiers,
    usableRatio: s.usableRatioPct / 100,
    crop: HYDROPONIC_CROPS[resolveCrop(s.cropId)],
    yieldRate: s.yieldRatePct / 100,
  };
}

/** レコードを費用入力へ。 */
export function toCostInput(s: HydroponicsSetup): CostInput {
  return {
    unitPriceYen: s.unitPriceYen,
    electricityYenPerKwh: s.electricityYenPerKwh,
    energyIntensityKwhPerKg: s.energyIntensityKwhPerKg,
    seedYenPerPlant: s.seedYenPerPlant,
    nutrientYenPerPlant: s.nutrientYenPerPlant,
    packagingYenPerPlant: s.packagingYenPerPlant,
    laborYenPerMonth: s.laborYenPerMonth,
    depreciationYenPerMonth: s.depreciationYenPerMonth,
    rentYenPerMonth: s.rentYenPerMonth,
    otherFixedYenPerMonth: s.otherFixedYenPerMonth,
  };
}

/** レコードから経営サマリーへ渡す試算を組む。未入力なら null。 */
export function economicsFromSetup(s: HydroponicsSetup | null): HydroponicsEconomics | null {
  if (!s) return null;
  return estimateEconomics(toFacilityInput(s), toCostInput(s));
}

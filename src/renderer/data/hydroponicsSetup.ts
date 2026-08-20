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
  assessLowPotassium,
  type LowPotassiumAssessment,
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

  // --- 低カリウム栽培 (腎臓病の方向け) ---
  // **成分は実測値しか受け取らない。** 推定値で「低カリウム」と名乗ると、
  // カリウムを排泄できない方の食事に直接影響する。
  /** 低カリウム栽培として扱うか。 */
  readonly lowPotassium?: boolean;
  /** 培養液を K 抜きへ切り替えるのは収穫前の何日か。 */
  readonly switchDaysBeforeHarvest?: number;
  /** 出荷ロットの**実測**カリウム (mg/100g)。未測定は 0。 */
  readonly measuredPotassiumMgPer100g?: number;
  /** 出荷ロットの実測ナトリウム (mg/100g)。未測定は 0。 */
  readonly measuredSodiumMgPer100g?: number;
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
  lowPotassium: false,
  // 切替は収穫前 7〜10 日 (ALIC 野菜情報) の中央。
  switchDaysBeforeHarvest: 8,
  // **実測値には初期値を置かない。** 埋めやすさのための置き値が、そのまま
  // 「測った」ことにされると危ない。0 のままなら未測定として扱われる。
  measuredPotassiumMgPer100g: 0,
  measuredSodiumMgPer100g: 0,
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

/**
 * 低カリウム栽培の評価を組む。低カリウムとして扱っていなければ null。
 *
 * 実測値が 0 (未測定) でも `assessLowPotassium` が `measured: false` を返すので、
 * 「測っていないのに低カリウムと名乗る」状態は画面側で判別できる。
 */
export function lowPotassiumFromSetup(s: HydroponicsSetup | null): LowPotassiumAssessment | null {
  if (!s || s.lowPotassium !== true) return null;
  const sodium = s.measuredSodiumMgPer100g ?? 0;
  return assessLowPotassium({
    switchDaysBeforeHarvest: s.switchDaysBeforeHarvest ?? 0,
    measuredPotassiumMgPer100g: s.measuredPotassiumMgPer100g ?? 0,
    // 0 は「測っていない」と扱う (0 mg の野菜は無い)。
    ...(sodium > 0 ? { measuredSodiumMgPer100g: sodium } : {}),
  });
}

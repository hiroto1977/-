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
  assessLowPotassium,
  DEFAULT_LOW_POTASSIUM_PARAMS,
  DEFAULT_PRODUCTION_PARAMS,
  type LowPotassiumAssessment,
  type LowPotassiumParams,
  type ProductionParams,
  ENERGY_INTENSITY_KWH_PER_KG_LOW,
  ENERGY_INTENSITY_KWH_PER_KG_HIGH,
  estimateEconomics,
  type HydroponicCrop,
  type HydroponicCropId,
  type HydroponicsEconomics,
  type FacilityInput,
  type CostInput,
} from '../../shared/hydroponics';
import { DEFAULT_CROP_LIST, cropListOrDefault, resolveCropFrom } from '../../shared/hydroponicCrops';
import type { BusinessFinancialUnit } from './businessUnits';
import { latestRecord } from './latestRecord';

export const HYDROPONICS_COLLECTION = 'hydroponics-setup';

/**
 * 利用者の品目一覧の collection。設定と同じく**最新の 1 件を採用**する
 * (一覧をまるごと 1 レコードに保存し、変更のたびに 1 件足す)。
 * 設定レコードとは別に持つ —— 設定を保存するたびに一覧を写すと、品目を
 * 1 つ足しただけで設定の履歴が増える。
 */
export const HYDROPONIC_CROPS_COLLECTION = 'hydroponics-crops';

/** 保存する品目一覧。 */
export interface HydroponicCropListRecord extends Record<string, unknown> {
  readonly crops: readonly HydroponicCrop[];
}

/**
 * 保存レコードから品目一覧を組む。最新の 1 件 (createdAt で選ぶ —
 * `latestRecord` の説明を参照) の `crops` を検証して返し、保存が無い・
 * 壊れている・空のときは参考値の一覧 (空にはならない)。
 *
 * `?.crops` の `?.` は、レコードの data が null で保存されていた場合の砦。
 * 数値や文字列なら `.crops` は undefined になるので `?.` 無しでも落ちないが、
 * null だけは投げる。
 */
export function cropListFromRecords(
  records: readonly { readonly createdAt: number; readonly data: unknown }[],
): readonly HydroponicCrop[] {
  const latest = latestRecord(records)?.data;
  return cropListOrDefault((latest as { crops?: unknown } | null | undefined)?.crops);
}

/** 事業間比較での水耕栽培の id。利用者の事業と衝突しないよう接頭辞を付ける。 */
export const HYDROPONICS_UNIT_ID = 'hydroponics';

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
 * 保存されている品目 id を、利用者の一覧の中の品目へ寄せる (壊れた値・消した
 * 品目の id で落ちないように)。無ければ一覧の先頭。
 *
 * 一覧を省略したときは参考値の 5 品目 —— 呼び出し側が一覧を持たない場面
 * (単体検査・旧い呼び出し) 用で、画面は必ず利用者の一覧を渡す。
 */
export function resolveCrop(
  id: unknown,
  crops: readonly HydroponicCrop[] = DEFAULT_CROP_LIST,
): HydroponicCrop {
  return resolveCropFrom(crops, id);
}

/** レコードを設備入力へ。% は 0..1 の割合に直す。 */
export function toFacilityInput(
  s: HydroponicsSetup,
  crops: readonly HydroponicCrop[] = DEFAULT_CROP_LIST,
): FacilityInput {
  return {
    floorAreaSqm: s.floorAreaSqm,
    tiers: s.tiers,
    usableRatio: s.usableRatioPct / 100,
    crop: resolveCrop(s.cropId, crops),
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
export function economicsFromSetup(
  s: HydroponicsSetup | null,
  crops: readonly HydroponicCrop[] = DEFAULT_CROP_LIST,
  p: ProductionParams = DEFAULT_PRODUCTION_PARAMS,
): HydroponicsEconomics | null {
  if (!s) return null;
  return estimateEconomics(toFacilityInput(s, crops), toCostInput(s), p);
}

/**
 * 低カリウム栽培の評価を組む。低カリウムとして扱っていなければ null。
 *
 * 実測値が 0 (未測定) でも `assessLowPotassium` が `measured: false` を返すので、
 * 「測っていないのに低カリウムと名乗る」状態は画面側で判別できる。
 */
export function lowPotassiumFromSetup(
  s: HydroponicsSetup | null,
  p: LowPotassiumParams = DEFAULT_LOW_POTASSIUM_PARAMS,
): LowPotassiumAssessment | null {
  if (!s || s.lowPotassium !== true) return null;
  const sodium = s.measuredSodiumMgPer100g ?? 0;
  return assessLowPotassium(
    {
      switchDaysBeforeHarvest: s.switchDaysBeforeHarvest ?? 0,
      measuredPotassiumMgPer100g: s.measuredPotassiumMgPer100g ?? 0,
      // 0 は「測っていない」と扱う (0 mg の野菜は無い)。
      ...(sodium > 0 ? { measuredSodiumMgPer100g: sodium } : {}),
    },
    p,
  );
}

/**
 * 水耕栽培を**事業として**経営サマリーへ載せる形に変換する。
 *
 * これを通すと、栽培が他の事業とまったく同じ扱いになる — 事業間比較の棒、
 * 3 軸の折れ線、構成比の円、連結の三表、財務指標の一覧。栽培だけ別枠で
 * 「参考」として置くと、全社の数字に入っているのかどうかが画面から
 * 分からなくなる。
 *
 * ## 費目の対応
 *
 * `MonthlyPnl` の `sga` は**人件費を内数に含む** (`estimateEconomics` の
 * 定義)。固定費を `sga + depreciation + laborCost` と足すと人件費を二重に
 * 数えて、営業利益がその分だけ小さく出る。`estimateEconomics` 自身が
 * `fixedPerMonth = sga + depreciation` と置いているので、それに合わせる。
 *
 * 人件費は実額が分かっているので `laborCost` としてそのまま渡す。固定費の
 * 半分という置き値に落とすと、入力した人件費が労働分配率に効かない。
 *
 * ## 履歴を作らない
 *
 * この収支は「今の設備と単価ならこうなる」という 1 時点の見積りである。
 * 設定の変更履歴は残っているが、それは**計画の改訂**であって月次の実績では
 * ない。月の並びとして描くと、実績が無いのに推移があるように見えるので、
 * 履歴は空にして当月 1 点だけの事業として出す。
 *
 * 未入力なら null (経営サマリーに勝手なサンプルを混ぜない)。
 */
export function hydroponicsBusinessUnit(
  economics: HydroponicsEconomics | null,
): BusinessFinancialUnit | null {
  if (economics === null) return null;
  const m = economics.monthly;
  const variableCost = m.cogs + m.advertising;
  const fixedCost = m.sga + m.depreciation;
  const profit = m.revenue - variableCost - fixedCost;
  return {
    id: HYDROPONICS_UNIT_ID,
    label: '水耕栽培',
    current: {
      revenue: m.revenue,
      variableCost,
      fixedCost,
      profit,
      profitMargin: m.revenue === 0 ? 0 : Math.round((profit / m.revenue) * 1000) / 10,
      laborCost: m.laborCost,
    },
    history: [],
  };
}

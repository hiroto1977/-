/**
 * 水耕栽培（人工光型植物工場）の数値モデル — 栽培条件を数え、収支に変換する。
 *
 * 「水耕栽培に必要な情報」は 3 層ある。この module は 3 層すべてを数値で持つ。
 *
 *   1. **育てる条件** — 品目ごとの栽培日数・養液の EC / pH・1 株の重量・
 *      パネルの穴数。育つか育たないかを決める。
 *   2. **どれだけ採れるか** — 床面積と段数から栽培面積を出し、株密度と
 *      年間回転数を掛けて年産株数にする。
 *   3. **いくらになるか** — 出荷株数 × 単価から売上を、株あたり原価と
 *      月次の固定費から費用を出し、月次の損益に落とす。
 *
 * 3 の出力は経営サマリーの KPI と**同じ項目名**（revenue / cogs / advertising /
 * sga / depreciation / laborCost）で返す。呼び出し側はそのまま経営サマリーへ
 * 載せられる。`src/shared` は renderer を import できないので型は再宣言せず、
 * 構造的に同じ形で返している。
 *
 * **重要 — これは概算試算であり、事業計画や投資判断の保証ではありません。**
 * 実際の収量は品種・光量・空調・水質・作業精度で大きく変わります。参考値は
 * 出典と時点を各定数に明記してあるので、**自分の実測値で置き換えて**使うこと。
 *
 * 参考値の出典（いずれも 2026-08 時点で確認）:
 * - 日本施設園芸協会「令和5年度 大規模施設園芸・植物工場 実態調査」（農林水産省
 *   委託調査）— 施設数 432（太陽光利用型 194 / 完全人工光型 195 / 併用 43）、
 *   黒字もしくは収支均衡の割合は太陽光利用型 73% / 完全人工光型 43% / 全体 59%。
 *   https://jgha.com/wp-content/uploads/2025/03/TM06-06-bessatsu1.pdf
 * - 農畜産業振興機構（ALIC）野菜情報「植物工場における栽培技術および品種開発」
 *   — リーフレタスは播種から収穫まで約 34 日（発芽 3 日を含む育苗棚まで 14 日 /
 *   育苗 10 日 / 定植後 10 日）、栽培パネル 60cm×90cm に 6〜8 穴、定植時 10g の
 *   苗が 10 日前後で 120g 程度になる。
 *   https://vegetable.alic.go.jp/yasaijoho/senmon/1911_chosa02.html
 * - 農畜産業振興機構（ALIC）野菜情報「人工光型植物工場における結球レタス生産」
 *   https://vegetable.alic.go.jp/yasaijoho/joho/1308_joho01.html
 * - 農林水産省「人工光型植物工場の標準仕様（案）について」
 *   https://www.maff.go.jp/j/shokusan/fcp/torikumi_jirei/attach/pdf/torikumi_jirei_02-10.pdf
 */

import { nonNeg, round1, round2, yen } from './num';

// --- 1. 育てる条件 --------------------------------------------------------

/** 参考値を用意してある品目。 */
export type HydroponicCropId =
  | 'leaf-lettuce' // リーフレタス（人工光型の主力）
  | 'frill-lettuce' // フリルレタス
  | 'romaine' // ロメインレタス
  | 'baby-leaf' // ベビーリーフ
  | 'basil'; // バジル（ハーブ）

/**
 * 品目ごとの栽培条件。
 *
 * `ecLow`/`ecHigh` は養液の電気伝導度 (mS/cm)、`phLow`/`phHigh` は pH。
 * レタス類は低〜中濃度を好み、濃すぎると苦味が出る。
 */
export interface HydroponicCrop {
  readonly id: HydroponicCropId;
  readonly label: string;
  /** 育苗日数（播種から定植まで）。 */
  readonly nurseryDays: number;
  /** 定植から収穫までの日数。**栽培棚の回転はここで決まる**。 */
  readonly growOutDays: number;
  /** 1 株の収穫重量 (g)。 */
  readonly harvestWeightG: number;
  /** 養液の電気伝導度の下限 (mS/cm)。 */
  readonly ecLow: number;
  /** 養液の電気伝導度の上限 (mS/cm)。 */
  readonly ecHigh: number;
  /** 養液 pH の下限。 */
  readonly phLow: number;
  /** 養液 pH の上限。 */
  readonly phHigh: number;
  /** 栽培パネル (60cm×90cm) 1 枚あたりの株数。 */
  readonly plantsPerPanel: number;
}

/** 栽培パネル 1 枚の面積 (m²)。60cm × 90cm。 */
export const PANEL_AREA_SQM = 0.54;

/**
 * 品目別の参考値。**自分の実測値がある品目は置き換えて使うこと。**
 *
 * **リーフレタスだけが出典で裏付けた値**（ALIC 野菜情報: 育苗棚まで 14 日 +
 * 育苗 10 日 = 24 日、定植後 10 日、パネル 60cm×90cm に 6〜8 穴、収穫 80〜90g/株）。
 * 他の 4 品目はレタスからの相対で置いた**目安**であり、出典で裏付けた値ではない。
 * 実測が取れたら置き換えること。
 */
export const HYDROPONIC_CROPS: Record<HydroponicCropId, HydroponicCrop> = {
  'leaf-lettuce': {
    id: 'leaf-lettuce',
    label: 'リーフレタス',
    nurseryDays: 24,
    growOutDays: 10,
    harvestWeightG: 85,
    ecLow: 0.8,
    ecHigh: 1.2,
    phLow: 5.8,
    phHigh: 6.3,
    plantsPerPanel: 8,
  },
  'frill-lettuce': {
    id: 'frill-lettuce',
    label: 'フリルレタス',
    nurseryDays: 24,
    growOutDays: 12,
    harvestWeightG: 90,
    ecLow: 0.8,
    ecHigh: 1.2,
    phLow: 5.8,
    phHigh: 6.3,
    plantsPerPanel: 8,
  },
  romaine: {
    id: 'romaine',
    label: 'ロメインレタス',
    nurseryDays: 24,
    growOutDays: 14,
    harvestWeightG: 120,
    ecLow: 1.0,
    ecHigh: 1.4,
    phLow: 5.8,
    phHigh: 6.3,
    plantsPerPanel: 6,
  },
  'baby-leaf': {
    id: 'baby-leaf',
    label: 'ベビーリーフ',
    nurseryDays: 10,
    growOutDays: 8,
    harvestWeightG: 30,
    ecLow: 0.8,
    ecHigh: 1.2,
    phLow: 5.8,
    phHigh: 6.3,
    plantsPerPanel: 12,
  },
  basil: {
    id: 'basil',
    label: 'バジル',
    nurseryDays: 18,
    growOutDays: 18,
    harvestWeightG: 60,
    ecLow: 1.2,
    ecHigh: 1.8,
    phLow: 5.8,
    phHigh: 6.5,
    plantsPerPanel: 8,
  },
};

/**
 * 養液が品目の適正範囲に収まっているかを判定する。
 *
 * 範囲は**両端を含む**。EC が高すぎるとレタス類は苦味が出て商品価値が落ち、
 * pH が外れると鉄・マンガン等の吸収が落ちる。
 */
export interface NutrientCheck {
  readonly ecInRange: boolean;
  readonly phInRange: boolean;
  /** 両方が範囲内。 */
  readonly ok: boolean;
}

export function checkNutrientSolution(
  crop: HydroponicCrop,
  ec: number,
  ph: number,
): NutrientCheck {
  const ecInRange = Number.isFinite(ec) && ec >= crop.ecLow && ec <= crop.ecHigh;
  const phInRange = Number.isFinite(ph) && ph >= crop.phLow && ph <= crop.phHigh;
  return { ecInRange, phInRange, ok: ecInRange && phInRange };
}

// --- 2. どれだけ採れるか --------------------------------------------------

/** 栽培設備の入力。 */
export interface FacilityInput {
  /** 栽培室の床面積 (m²)。 */
  readonly floorAreaSqm: number;
  /** 栽培棚の段数。人工光型は 5〜10 段が一般的。 */
  readonly tiers: number;
  /**
   * 床面積のうち栽培に使える割合 (0..1)。通路・作業スペース・調製室を除く。
   * 1 を超える値は 1 に丸める。
   */
  readonly usableRatio: number;
  /** 品目。 */
  readonly crop: HydroponicCrop;
  /**
   * 出荷できる株の割合 (0..1)。チップバーン・生育不良・調製ロスを引いた後。
   * **参考値は置いていない** — 出典で裏付けられる一般値が無いため、自分の
   * 実績を入れること。
   */
  readonly yieldRate: number;
}

/** 生産量の内訳。 */
export interface ProductionEstimate {
  /** 栽培面積 (m²) = 床面積 × 段数 × 有効率。 */
  readonly cultivationAreaSqm: number;
  /** 株密度 (株/m²) = パネル穴数 ÷ パネル面積。 */
  readonly plantsPerSqm: number;
  /** 同時に棚に載っている株数（在圃株数）。 */
  readonly standingPlants: number;
  /** 年間の回転数 = 365 ÷ 定植から収穫までの日数。 */
  readonly cyclesPerYear: number;
  /** 歩留まりを掛ける前の年産株数（＝棚が生む上限）。 */
  readonly potentialPlantsPerYear: number;
  /** 出荷株数 (年) = 上限 × 歩留まり。 */
  readonly shippedPlantsPerYear: number;
  /** 出荷重量 (kg/年)。 */
  readonly shippedKgPerYear: number;
  /** 1 日あたりの出荷株数（設備規模の言い表し方として一般的）。 */
  readonly shippedPlantsPerDay: number;
}

/** 1 年の日数。回転数の分子。 */
export const DAYS_PER_YEAR = 365;

/** 割合を 0..1 に収める。分岐で書くと 0 が両枝で同値になり観測できない。 */
function clampRatio(r: number): number {
  if (!Number.isFinite(r)) return 0;
  return Math.min(1, Math.max(0, r));
}

/**
 * 栽培設備から年間の生産量を見積もる。
 *
 * 段数を上げると栽培面積はそのまま増えるが、床面積あたりの照明と空調も
 * 増える点に注意（電力は下の `estimateEconomics` で効いてくる）。
 */
export function estimateProduction(input: FacilityInput): ProductionEstimate {
  const cultivationAreaSqm =
    nonNeg(input.floorAreaSqm) * nonNeg(input.tiers) * clampRatio(input.usableRatio);
  const plantsPerSqm = nonNeg(input.crop.plantsPerPanel) / PANEL_AREA_SQM;
  const standingPlants = Math.floor(cultivationAreaSqm * plantsPerSqm);
  const growOutDays = nonNeg(input.crop.growOutDays);
  const cyclesPerYear = growOutDays > 0 ? DAYS_PER_YEAR / growOutDays : 0;
  const potentialPlantsPerYear = Math.floor(standingPlants * cyclesPerYear);
  const shippedPlantsPerYear = Math.floor(potentialPlantsPerYear * clampRatio(input.yieldRate));
  return {
    cultivationAreaSqm: round2(cultivationAreaSqm),
    plantsPerSqm: round2(plantsPerSqm),
    standingPlants,
    cyclesPerYear: round2(cyclesPerYear),
    potentialPlantsPerYear,
    shippedPlantsPerYear,
    shippedKgPerYear: round1((shippedPlantsPerYear * nonNeg(input.crop.harvestWeightG)) / 1000),
    shippedPlantsPerDay: Math.floor(shippedPlantsPerYear / DAYS_PER_YEAR),
  };
}

// --- 3. いくらになるか ----------------------------------------------------

/**
 * 電力原単位 (kWh/kg) の参考幅。レタス 1kg あたり 10〜20 kWh。
 * 人工光型では照明が全電力の 60〜70%、空調が 20〜30% を占める。
 */
export const ENERGY_INTENSITY_KWH_PER_KG_LOW = 10;
export const ENERGY_INTENSITY_KWH_PER_KG_HIGH = 20;

/** 費用の入力。金額はすべて円。 */
export interface CostInput {
  /** 出荷 1 株あたりの販売単価。 */
  readonly unitPriceYen: number;
  /** 電力量あたりの単価 (円/kWh)。 */
  readonly electricityYenPerKwh: number;
  /** 電力原単位 (kWh/kg)。参考幅は 10〜20。 */
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
 * 月次の損益。**経営サマリーの KPI と同じ項目名**で返すので、そのまま
 * 1 期分の実績・計画として載せられる。
 */
export interface MonthlyPnl {
  readonly revenue: number;
  readonly cogs: number;
  readonly advertising: number;
  readonly sga: number;
  readonly depreciation: number;
  readonly laborCost: number;
}

/** 収支の内訳。 */
export interface HydroponicsEconomics {
  readonly production: ProductionEstimate;
  /** 年間電力量 (kWh)。**歩留まり前の生産量**で決まる（下のコメント参照）。 */
  readonly energyKwhPerYear: number;
  /** 年間電気代 (円)。 */
  readonly electricityYenPerYear: number;
  /** 月次の損益（経営サマリーへ載せる形）。 */
  readonly monthly: MonthlyPnl;
  /** 出荷 1 株あたりの総原価 (円)。売れた株が背負う費用。 */
  readonly costPerShippedPlantYen: number;
  /** 1 株あたり限界利益 (円) = 単価 − 株あたり変動費。 */
  readonly contributionPerPlantYen: number;
  /**
   * 損益分岐の月間出荷株数。限界利益が 0 以下なら null
   * （何株売っても固定費を回収できない）。
   */
  readonly breakEvenPlantsPerMonth: number | null;
  /** 月間の出荷株数。 */
  readonly shippedPlantsPerMonth: number;
  /** 損益分岐を満たすか（限界利益が正で、出荷が分岐点以上）。 */
  readonly meetsBreakEven: boolean;
}

/** 1 年の月数。 */
const MONTHS_PER_YEAR = 12;

/**
 * 生産量と費用から月次の損益を組む。
 *
 * **電力は歩留まりの影響を受けない。** 照明も空調も、その株が売り物に
 * なるかどうかとは無関係に動き続ける。だから電力量は出荷株数ではなく
 * **歩留まりを掛ける前の生産量**から計算する。歩留まりが落ちると売上だけが
 * 減って電気代は減らない — 人工光型で歩留まりが効くのはこのためである。
 *
 * 電気代は固定費 (`sga`) に入れる。棚を止めない限り出ていく費用なので、
 * 変動費に入れると限界利益が実態より大きく出て、損益分岐点を低く見せる。
 */
export function estimateEconomics(
  facility: FacilityInput,
  cost: CostInput,
): HydroponicsEconomics {
  const production = estimateProduction(facility);

  // 歩留まり前の重量。売れなかった株にも電力は掛かっている。
  const potentialKgPerYear =
    (production.potentialPlantsPerYear * nonNeg(facility.crop.harvestWeightG)) / 1000;
  const energyKwhPerYear = potentialKgPerYear * nonNeg(cost.energyIntensityKwhPerKg);
  const electricityYenPerYear = energyKwhPerYear * nonNeg(cost.electricityYenPerKwh);

  const shippedPlantsPerMonth = production.shippedPlantsPerYear / MONTHS_PER_YEAR;
  const variablePerPlant =
    nonNeg(cost.seedYenPerPlant) + nonNeg(cost.nutrientYenPerPlant) + nonNeg(cost.packagingYenPerPlant);

  const revenue = shippedPlantsPerMonth * nonNeg(cost.unitPriceYen);
  const cogs = shippedPlantsPerMonth * variablePerPlant;
  const laborCost = nonNeg(cost.laborYenPerMonth);
  const depreciation = nonNeg(cost.depreciationYenPerMonth);
  // 販管費 = 人件費 + 電気代 + 地代家賃 + その他。人件費は販管費の内数。
  const sga =
    laborCost +
    electricityYenPerYear / MONTHS_PER_YEAR +
    nonNeg(cost.rentYenPerMonth) +
    nonNeg(cost.otherFixedYenPerMonth);

  const fixedPerMonth = sga + depreciation;
  const contributionPerPlantYen = nonNeg(cost.unitPriceYen) - variablePerPlant;
  const breakEvenPlantsPerMonth =
    contributionPerPlantYen > 0 ? Math.ceil(fixedPerMonth / contributionPerPlantYen) : null;

  return {
    production,
    energyKwhPerYear: Math.round(energyKwhPerYear),
    electricityYenPerYear: yen(electricityYenPerYear),
    monthly: {
      revenue: yen(revenue),
      cogs: yen(cogs),
      advertising: 0,
      sga: yen(sga),
      depreciation,
      laborCost,
    },
    costPerShippedPlantYen:
      shippedPlantsPerMonth > 0 ? round2((cogs + fixedPerMonth) / shippedPlantsPerMonth) : 0,
    contributionPerPlantYen: round2(contributionPerPlantYen),
    breakEvenPlantsPerMonth,
    shippedPlantsPerMonth: Math.floor(shippedPlantsPerMonth),
    meetsBreakEven:
      breakEvenPlantsPerMonth !== null && shippedPlantsPerMonth >= breakEvenPlantsPerMonth,
  };
}

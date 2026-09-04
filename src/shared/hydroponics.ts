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
export type BuiltinHydroponicCropId =
  | 'leaf-lettuce' // リーフレタス（人工光型の主力）
  | 'frill-lettuce' // フリルレタス
  | 'romaine' // ロメインレタス
  | 'baby-leaf' // ベビーリーフ
  | 'basil'; // バジル（ハーブ）

/**
 * 品目の id。参考値の 5 つに加えて、**利用者が足した品目** (`custom-<n>`) も
 * 通るので閉じた union ではない。id の形と一覧の増減は
 * `hydroponicCrops.ts` が持つ。
 */
export type HydroponicCropId = string;

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
 *
 * **これは出発点であって固定の一覧ではない。** 利用者は品目を足したり消したり
 * できる (`hydroponicCrops.ts`)。ここに載っている 5 つは「参考値の品目」として
 * いつでも戻せる。
 */
export const HYDROPONIC_CROPS: Record<BuiltinHydroponicCropId, HydroponicCrop> = {
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

/**
 * 生産量の試算の前提。省略すると上の定数。利用者は数値パラメータの台帳
 * (`shared/parameters.ts`) から上書きできる — 画面が `useParameters()` で読んで渡す。
 */
export interface ProductionParams {
  /** 栽培パネル 1 枚の面積 (m²)。株密度の分母。 */
  readonly panelAreaSqm: number;
  /** 年間の稼働日数。回転数の分子・1 日あたり出荷の分母。 */
  readonly daysPerYear: number;
}

export const DEFAULT_PRODUCTION_PARAMS: ProductionParams = {
  panelAreaSqm: PANEL_AREA_SQM,
  daysPerYear: DAYS_PER_YEAR,
};

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
export function estimateProduction(
  input: FacilityInput,
  p: ProductionParams = DEFAULT_PRODUCTION_PARAMS,
): ProductionEstimate {
  const cultivationAreaSqm =
    nonNeg(input.floorAreaSqm) * nonNeg(input.tiers) * clampRatio(input.usableRatio);
  // 面積 0 (前提の壊れ) は株密度 0 にする — 0 で割って Infinity 株を立てない。
  const panelAreaSqm = nonNeg(p.panelAreaSqm);
  const plantsPerSqm = panelAreaSqm > 0 ? nonNeg(input.crop.plantsPerPanel) / panelAreaSqm : 0;
  const standingPlants = Math.floor(cultivationAreaSqm * plantsPerSqm);
  const growOutDays = nonNeg(input.crop.growOutDays);
  const daysPerYear = nonNeg(p.daysPerYear);
  const cyclesPerYear = growOutDays > 0 ? daysPerYear / growOutDays : 0;
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
    shippedPlantsPerDay: daysPerYear > 0 ? Math.floor(shippedPlantsPerYear / daysPerYear) : 0,
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
  p: ProductionParams = DEFAULT_PRODUCTION_PARAMS,
): HydroponicsEconomics {
  const production = estimateProduction(facility, p);

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

// --- 4. 低カリウム栽培 ----------------------------------------------------
//
// 腎機能が落ちるとカリウムを尿へ捨てられなくなり、血中に溜まると不整脈から
// 心停止に至る。だから慢性腎臓病 (CKD) の方は野菜を強く制限される — 生野菜が
// 食べられない、という形で生活の質に直に効く。培養液のカリウムを抜いて育てた
// 野菜は、その制限の中でも食べられる量を増やせる。
//
// **この節の数値は健康に直結する。** ほかの節と違い、モデルの推定値で
// 「低カリウム」と名乗ってはならない。実測しない限り出荷判断に使えないので、
// 型と関数をそう作ってある (`assessLowPotassium` は実測値を必須で要求する)。
//
// 出典 (いずれも 2026-08 時点で確認):
// - 農畜産業振興機構 (ALIC) 野菜情報「水耕栽培における低カリウム含有量野菜の
//   栽培方法の確立の取り組み」(2014年12月) — 前期は通常の培養液で育て、
//   **収穫前 7〜10 日**に硝酸カリウム (KNO3) を同濃度の硝酸ナトリウム (NaNO3)
//   へ置き換える。カリウムを抜いた分をナトリウムで補い、浸透圧と EC を保つ。
//   https://vegetable.alic.go.jp/yasaijoho/senmon/1412_chosa02.html
// - 同「植物工場における低カリウムメロンの開発」(2013年4月) — 培養液中の
//   カリウム量と与える時期の制御で低カリウム化できる。**培養液にナトリウムが
//   無いと生育不良**になる。
//   https://vegetable.alic.go.jp/yasaijoho/joho/1304_joho01.html
// - 日本腎臓学会の診療ガイドライン — カリウム制限は G3a までは行わず、
//   **G3b で 2,000 mg/日以下、G4〜G5 で 1,500 mg/日以下**。血清カリウムを
//   4.0〜5.4 mEq/L に保つことが目的で、値が安定していれば制限しないこともある。
//   https://jsn.or.jp/medic/guideline/
// - 文部科学省「日本食品標準成分表 (八訂) 増補2023年」— レタス (土耕栽培・
//   結球葉・生) のカリウムは 200 mg/100g。
//   https://fooddb.mext.go.jp/

/** 慢性腎臓病の病期。 */
export type CkdStage = 'G1' | 'G2' | 'G3a' | 'G3b' | 'G4' | 'G5';

/**
 * 病期ごとの 1 日カリウム摂取上限 (mg)。`null` は「一律の制限は設けない」。
 *
 * **これは目安であって処方ではない。** 血清カリウム値が安定していれば制限
 * しないこともあり、実際の指示は主治医と管理栄養士が個別に決める。
 */
export const CKD_POTASSIUM_LIMIT_MG: Readonly<Record<CkdStage, number | null>> = {
  G1: null,
  G2: null,
  G3a: null,
  G3b: 2000,
  G4: 1500,
  G5: 1500,
};

/** 培養液を切り替える期間の下限・上限 (収穫前の日数)。 */
export const LOW_K_SWITCH_DAYS_MIN = 7;
export const LOW_K_SWITCH_DAYS_MAX = 10;

/**
 * 比較の基準に使う通常品のカリウム (mg/100g)。
 * レタス (土耕栽培・結球葉・生) — 日本食品標準成分表 八訂 増補2023年。
 */
export const REFERENCE_LETTUCE_POTASSIUM_MG = 200;

/**
 * ナトリウム (mg) を食塩相当量 (g) に直す係数。
 * 食塩相当量 = Na(mg) × 2.54 ÷ 1000 (日本食品標準成分表の定義)。
 */
export const SALT_EQUIVALENT_FACTOR = 2.54;

/**
 * 低カリウム評価の基準値。省略すると上の定数。台帳 (`shared/parameters.ts`) から
 * 上書きできる — 医師の指示や自分の実測で置き換える場面がある。
 */
export interface LowPotassiumParams {
  /** 比較する通常品のカリウム (mg/100g)。入力側の指定が優先。 */
  readonly referencePotassiumMgPer100g: number;
  /** Na (mg) → 食塩相当量 (g) の係数。 */
  readonly saltEquivalentFactor: number;
  /** 培養液を切り替える期間の下限・上限 (収穫前の日数)。 */
  readonly switchDaysMin: number;
  readonly switchDaysMax: number;
}

export const DEFAULT_LOW_POTASSIUM_PARAMS: LowPotassiumParams = {
  referencePotassiumMgPer100g: REFERENCE_LETTUCE_POTASSIUM_MG,
  saltEquivalentFactor: SALT_EQUIVALENT_FACTOR,
  switchDaysMin: LOW_K_SWITCH_DAYS_MIN,
  switchDaysMax: LOW_K_SWITCH_DAYS_MAX,
};

/** 低カリウム栽培の入力。**成分は実測値でしか受け取らない。** */
export interface LowPotassiumInput {
  /** 培養液を K 抜きへ切り替えるのは収穫前の何日か。 */
  readonly switchDaysBeforeHarvest: number;
  /**
   * 出荷ロットの**実測**カリウム (mg/100g)。
   * モデルの推定値を入れてはならない — 腎臓病の方の食事に直結する。
   */
  readonly measuredPotassiumMgPer100g: number;
  /** 出荷ロットの実測ナトリウム (mg/100g)。測っていなければ未指定。 */
  readonly measuredSodiumMgPer100g?: number;
  /** 比較する通常品のカリウム (mg/100g)。既定はレタスの成分表値。 */
  readonly referencePotassiumMgPer100g?: number;
}

/** 低カリウム栽培の評価。 */
export interface LowPotassiumAssessment {
  /** 実測カリウム (mg/100g)。 */
  readonly potassiumMgPer100g: number;
  /** 比較した通常品の値 (mg/100g)。 */
  readonly referenceMgPer100g: number;
  /** 通常品比の削減率 (%)。増えていれば負になる。 */
  readonly reductionPct: number;
  /** 実測ナトリウムから出した食塩相当量 (g/100g)。未測定なら null。 */
  readonly saltEquivalentGPer100g: number | null;
  /** 切替期間が目安の範囲 (既定 7〜10 日) に収まっているか。 */
  readonly switchWindowOk: boolean;
  /**
   * 出荷判断に使える状態か。**実測カリウムが正の有限値であることが条件**で、
   * 0 や未測定を「カリウムが無い」と読み替えない。
   */
  readonly measured: boolean;
}

/**
 * 実測値から低カリウム栽培を評価する。
 *
 * 削減率は比較対象があって初めて意味を持つので、基準値が 0 以下なら
 * 率は 0 として扱う (「無限に減った」とは言わない)。
 */
export function assessLowPotassium(
  input: LowPotassiumInput,
  p: LowPotassiumParams = DEFAULT_LOW_POTASSIUM_PARAMS,
): LowPotassiumAssessment {
  const k = input.measuredPotassiumMgPer100g;
  const measured = Number.isFinite(k) && k > 0;
  const potassiumMgPer100g = measured ? k : 0;
  const reference = nonNeg(input.referencePotassiumMgPer100g ?? p.referencePotassiumMgPer100g);
  const na = input.measuredSodiumMgPer100g;
  const days = input.switchDaysBeforeHarvest;
  return {
    potassiumMgPer100g,
    referenceMgPer100g: reference,
    reductionPct:
      reference > 0 ? round1(((reference - potassiumMgPer100g) / reference) * 100) : 0,
    // `na !== undefined` の前置きは要らない — Number.isFinite は値を変換せず
    // 照合するので undefined も NaN も false になる。
    saltEquivalentGPer100g: Number.isFinite(na)
      ? round2((nonNeg(na as number) * nonNeg(p.saltEquivalentFactor)) / 1000)
      : null,
    switchWindowOk: days >= p.switchDaysMin && days <= p.switchDaysMax,
    measured,
  };
}

/**
 * その病期の 1 日上限のうち、指定した割合を野菜に充てるとして
 * **何 g 食べられるか**を返す。
 *
 * 制限のない病期 (G3a まで) と、実測できていない / カリウムが 0 の場合は null。
 * 「上限いっぱいまで食べてよい」と読める数字を出さないため、割合は
 * 呼び出し側が明示する (既定は置かない)。
 *
 * @param sharePct 1 日上限のうち、この野菜に充てる割合 (%)。
 * @param limits 病期別の 1 日上限。省略すると学会の目安。医師の指示で置き換える
 *   ときは台帳 (`shared/parameters.ts`) から。
 */
export function servingGramsWithinLimit(
  assessment: LowPotassiumAssessment,
  stage: CkdStage,
  sharePct: number,
  limits: Readonly<Record<CkdStage, number | null>> = CKD_POTASSIUM_LIMIT_MG,
): number | null {
  const limit = limits[stage];
  if (limit === null) return null;
  if (!assessment.measured) return null;
  const share = Math.min(100, Math.max(0, Number.isFinite(sharePct) ? sharePct : 0));
  const allowedMg = (limit * share) / 100;
  // mg/100g なので 100 を掛けて g に直す。
  return Math.floor((allowedMg / assessment.potassiumMgPer100g) * 100);
}

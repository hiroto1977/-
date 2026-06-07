/**
 * 固定資産税・都市計画税の概算算定 (純粋関数のみ、IO なし)。
 *
 * **重要 — これは概算であり税務助言ではありません。実際の課税標準・特例適用・
 * 自治体ごとの税率は市区町村に確認してください。**
 * 固定資産税 (地方税法 341 条〜) と都市計画税 (同 702 条〜) の標準的な仕組みを
 * 単純化したシミュレーションで、評価額の決定方法・住宅用地特例の按分・新築住宅の
 * 減額措置・負担調整措置・自治体ごとの税率差・年度改正を完全には反映しません。
 * 評価額・課税標準・税率は各市区町村 (固定資産税課) の最新情報で確認してください。
 *
 * UI から切り離して単体テスト可能にするため、計算はすべてここに集約する。
 */

/** 固定資産税の標準税率 (1.4%)。地方税法 350 条の標準税率。 */
export const FIXED_ASSET_STANDARD_RATE = 0.014;
/** 都市計画税の制限税率 (上限 0.3%)。地方税法 702 条の4。 */
export const CITY_PLANNING_MAX_RATE = 0.003;

/** 免税点 (この金額 **未満** は非課税)。土地30万・家屋20万・償却資産150万。 */
export const LAND_TAX_THRESHOLD = 300_000;
export const HOUSE_TAX_THRESHOLD = 200_000;
export const DEPRECIABLE_ASSET_TAX_THRESHOLD = 1_500_000;

/** 固定資産の種別 (免税点・特例の分岐に使う)。 */
export type AssetType = 'land' | 'house' | 'depreciableAsset';

/**
 * 有限な非負数であることを検証する (不正入力は throw)。
 * NaN / Infinity / 負値を弾く。
 * @param value 検証対象
 * @param label エラーメッセージに使うラベル
 */
function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite number >= 0 (got ${value})`);
  }
}

/** 固定資産税の税額端数処理: 100 円未満を切り捨てる (地方税法 20 条の4の2)。 */
function floorHundred(tax: number): number {
  return Math.floor(tax / 100) * 100;
}

export interface FixedAssetTaxParams {
  /** 課税標準額 (円)。住宅用地特例適用後の額を渡すこと。 */
  readonly taxableBase: number;
  /** 税率 (既定: 標準税率 1.4%)。0..1。 */
  readonly rate?: number;
}

/**
 * 固定資産税額を概算する: 課税標準額 × 税率、税額は 100 円未満切捨。
 *
 * **概算であり税務助言ではない。実際の課税標準・特例適用・自治体ごとの税率は
 * 市区町村に確認すること。** 自治体により標準税率 (1.4%) と異なる場合がある。
 *
 * 税額 = `Math.floor(taxableBase * rate / 100) * 100` (100 円未満切捨)。
 *
 * @param params.taxableBase 課税標準額 (円、>= 0、有限)
 * @param params.rate 税率 (既定 {@link FIXED_ASSET_STANDARD_RATE} = 0.014、0..1)
 * @returns 100 円未満を切り捨てた固定資産税額 (円)
 * @throws taxableBase が負・非有限のとき / rate が範囲外 (0 未満または 1 超) のとき
 */
export function fixedAssetTax({ taxableBase, rate = FIXED_ASSET_STANDARD_RATE }: FixedAssetTaxParams): number {
  assertNonNegativeFinite(taxableBase, 'taxableBase');
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error(`rate must be a finite number in [0, 1] (got ${rate})`);
  }
  return floorHundred(taxableBase * rate);
}

export interface CityPlanningTaxParams {
  /** 課税標準額 (円)。住宅用地特例適用後の額を渡すこと。 */
  readonly taxableBase: number;
  /** 税率 (既定: 0.3%、上限 0.3%)。0..0.003。 */
  readonly rate?: number;
}

/**
 * 都市計画税額を概算する: 課税標準額 × 税率 (既定・上限 0.3%)、100 円未満切捨。
 *
 * **概算であり税務助言ではない。実際の課税標準・特例適用・自治体ごとの税率は
 * 市区町村に確認すること。** 制限税率 0.3% を超える rate は throw する。
 * 都市計画税は市街化区域内の土地・家屋に課されるため、対象外の物件には課されない。
 *
 * 税額 = `Math.floor(taxableBase * rate / 100) * 100` (100 円未満切捨)。
 *
 * @param params.taxableBase 課税標準額 (円、>= 0、有限)
 * @param params.rate 税率 (既定・上限 {@link CITY_PLANNING_MAX_RATE} = 0.003)
 * @returns 100 円未満を切り捨てた都市計画税額 (円)
 * @throws taxableBase が負・非有限のとき / rate が負・非有限・制限税率 0.3% 超のとき
 */
export function cityPlanningTax({ taxableBase, rate = CITY_PLANNING_MAX_RATE }: CityPlanningTaxParams): number {
  assertNonNegativeFinite(taxableBase, 'taxableBase');
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error(`rate must be a finite number >= 0 (got ${rate})`);
  }
  if (rate > CITY_PLANNING_MAX_RATE) {
    throw new Error(`city planning tax rate must not exceed the cap ${CITY_PLANNING_MAX_RATE} (got ${rate})`);
  }
  return floorHundred(taxableBase * rate);
}

export interface ResidentialLandParams {
  /** 土地の固定資産税評価額 (円)。 */
  readonly assessedValue: number;
  /** 土地の面積 (㎡)。 */
  readonly areaSqm: number;
  /** 住宅の戸数 (既定 1)。小規模住宅用地の上限 (戸数 × 200㎡) に使う。 */
  readonly dwellings?: number;
}

export interface ResidentialLandBase {
  /** 固定資産税用の課税標準額 (住宅用地特例適用後、円)。 */
  readonly fixedAssetBase: number;
  /** 都市計画税用の課税標準額 (住宅用地特例適用後、円)。 */
  readonly cityPlanningBase: number;
}

/**
 * 住宅用地の課税標準特例を適用し、固定資産税用・都市計画税用の課税標準を返す。
 *
 * **概算であり税務助言ではない。実際の課税標準・特例適用・自治体ごとの税率は
 * 市区町村に確認すること。** 一般住宅用地の上限 (家屋床面積の10倍) や住宅用地の
 * 認定要件は反映しない簡略モデルで、評価額は面積比で按分する。
 *
 * - 小規模住宅用地 (1 戸あたり 200㎡ 以下の部分): 固定資産税 = 評価額 × 1/6、
 *   都市計画税 = 評価額 × 1/3。
 * - 一般住宅用地 (200㎡ 超の部分): 固定資産税 = 評価額 × 1/3、
 *   都市計画税 = 評価額 × 2/3。
 *
 * 面積を小規模部分 (戸数 × 200㎡ まで) と一般部分 (それを超える分) に按分し、
 * 評価額を面積比で分配したうえで各係数を乗じる。境界 (戸数 × 200㎡) ちょうどは
 * すべて小規模住宅用地として扱う。
 *
 * @param params.assessedValue 土地の固定資産税評価額 (円、>= 0、有限)
 * @param params.areaSqm 土地の面積 (㎡、>= 0、有限)
 * @param params.dwellings 住宅の戸数 (既定 1、>= 1 の整数、有限)
 * @returns 固定資産税用・都市計画税用の課税標準額 {@link ResidentialLandBase}
 * @throws assessedValue / areaSqm が負・非有限のとき / dwellings が 1 未満・非整数・非有限のとき
 */
export function residentialLandTaxableBase({
  assessedValue,
  areaSqm,
  dwellings = 1,
}: ResidentialLandParams): ResidentialLandBase {
  assertNonNegativeFinite(assessedValue, 'assessedValue');
  assertNonNegativeFinite(areaSqm, 'areaSqm');
  if (!Number.isInteger(dwellings) || dwellings < 1) {
    throw new Error(`dwellings must be an integer >= 1 (got ${dwellings})`);
  }
  // 面積 0 のときは課税標準も 0 (按分の 0 除算を避ける早期 return)。
  if (areaSqm === 0) {
    return { fixedAssetBase: 0, cityPlanningBase: 0 };
  }
  // 小規模住宅用地の上限面積 (戸数 × 200㎡)。これ以下は全て小規模。
  const smallScaleLimit = dwellings * 200;
  // 小規模部分・一般部分の面積に按分。
  const smallScaleArea = Math.min(areaSqm, smallScaleLimit);
  const generalArea = Math.max(0, areaSqm - smallScaleLimit);
  // 評価額を面積比で按分 (単価 × 各面積)。
  const valuePerSqm = assessedValue / areaSqm;
  const smallScaleValue = valuePerSqm * smallScaleArea;
  const generalValue = valuePerSqm * generalArea;
  // 固定資産税: 小規模 ×1/6 + 一般 ×1/3。都市計画税: 小規模 ×1/3 + 一般 ×2/3。
  const fixedAssetBase = smallScaleValue / 6 + generalValue / 3;
  const cityPlanningBase = smallScaleValue / 3 + (generalValue * 2) / 3;
  return { fixedAssetBase, cityPlanningBase };
}

export interface TaxThresholdParams {
  /** 固定資産の種別。 */
  readonly assetType: AssetType;
  /** 同一区市町村内の同種資産の課税標準額の合計 (円)。 */
  readonly taxableBase: number;
}

/**
 * 免税点判定 — 課税標準額が免税点 **未満** なら非課税 (true)。
 *
 * **概算であり税務助言ではない。実際の課税標準・特例適用・自治体ごとの税率は
 * 市区町村に確認すること。** 免税点 (地方税法 351 条・702 条の3):
 * 土地 30 万円・家屋 20 万円・償却資産 150 万円。同一の者が同一市区町村内に
 * 所有する同種資産の課税標準額の合計で判定する点に注意。
 *
 * @param params.assetType 'land' | 'house' | 'depreciableAsset'
 * @param params.taxableBase 課税標準額の合計 (円、>= 0、有限)
 * @returns 免税点 **未満** なら true (非課税)、免税点以上なら false (課税)
 * @throws taxableBase が負・非有限のとき / assetType がホワイトリスト外のとき
 */
export function isBelowTaxThreshold({ assetType, taxableBase }: TaxThresholdParams): boolean {
  assertNonNegativeFinite(taxableBase, 'taxableBase');
  let threshold: number;
  switch (assetType) {
    case 'land':
      threshold = LAND_TAX_THRESHOLD;
      break;
    case 'house':
      threshold = HOUSE_TAX_THRESHOLD;
      break;
    case 'depreciableAsset':
      threshold = DEPRECIABLE_ASSET_TAX_THRESHOLD;
      break;
    default: {
      // 網羅性チェック (ホワイトリスト外は throw)。
      const _exhaustive: never = assetType;
      throw new Error(`unknown assetType: ${String(_exhaustive)}`);
    }
  }
  return taxableBase < threshold;
}

export interface FixedAssetTaxTotalParams {
  /** 土地の固定資産税評価額 (円)。 */
  readonly assessedValue: number;
  /** 土地の面積 (㎡)。 */
  readonly areaSqm: number;
  /** 住宅の戸数 (既定 1)。 */
  readonly dwellings?: number;
  /** 固定資産税の税率 (既定 1.4%)。 */
  readonly fixedRate?: number;
  /** 都市計画税の税率 (既定・上限 0.3%)。市街化区域外なら 0 を渡す。 */
  readonly cityPlanningRate?: number;
}

export interface FixedAssetTaxTotal {
  /** 固定資産税額 (円、100 円未満切捨)。免税のとき 0。 */
  readonly fixedAssetTax: number;
  /** 都市計画税額 (円、100 円未満切捨)。免税のとき 0。 */
  readonly cityPlanningTax: number;
  /** 固定資産税 + 都市計画税の合計 (円)。免税のとき 0。 */
  readonly total: number;
  /** 免税点未満で非課税のとき true。 */
  readonly exempt: boolean;
}

/**
 * 住宅用地特例 + 免税点 + 固定資産税 + 都市計画税を合算した内訳を返す。
 *
 * **概算であり税務助言ではない。実際の課税標準・特例適用・自治体ごとの税率は
 * 市区町村に確認すること。** 住宅用地特例後の固定資産税用課税標準が土地の
 * 免税点 (30 万円) 未満なら全体を非課税 (`exempt: true`) として税額 0 を返す。
 *
 * 手順: (1) {@link residentialLandTaxableBase} で固定資産税用・都市計画税用の
 * 課税標準を算定 → (2) 固定資産税用課税標準で {@link isBelowTaxThreshold} 判定
 * (土地) → (3) 非課税でなければ {@link fixedAssetTax} / {@link cityPlanningTax}
 * を算定し合算。
 *
 * @param params 評価額・面積・戸数・各税率
 * @returns 固定資産税・都市計画税・合計・免税フラグ {@link FixedAssetTaxTotal}
 * @throws 各入力検証エラー (residentialLandTaxableBase / fixedAssetTax / cityPlanningTax に準ずる)
 */
export function calcFixedAssetTaxTotal({
  assessedValue,
  areaSqm,
  dwellings = 1,
  fixedRate = FIXED_ASSET_STANDARD_RATE,
  cityPlanningRate = CITY_PLANNING_MAX_RATE,
}: FixedAssetTaxTotalParams): FixedAssetTaxTotal {
  const { fixedAssetBase, cityPlanningBase } = residentialLandTaxableBase({
    assessedValue,
    areaSqm,
    dwellings,
  });
  // 土地の免税点判定 (固定資産税用課税標準で判定)。
  const exempt = isBelowTaxThreshold({ assetType: 'land', taxableBase: fixedAssetBase });
  if (exempt) {
    return { fixedAssetTax: 0, cityPlanningTax: 0, total: 0, exempt: true };
  }
  const fixed = fixedAssetTax({ taxableBase: fixedAssetBase, rate: fixedRate });
  const city = cityPlanningTax({ taxableBase: cityPlanningBase, rate: cityPlanningRate });
  return {
    fixedAssetTax: fixed,
    cityPlanningTax: city,
    total: fixed + city,
    exempt: false,
  };
}

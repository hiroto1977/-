/**
 * 敷地プランナー — 用途地域の建ぺい率・容積率・前面道路幅員から「建てられる
 * 最大規模」を概算し、近隣商業地域の工場 150 ㎡制限 (建築基準法 別表第二) を
 * 踏まえた平面プラン (作業場 + 直売/事務スペース) を試算する純関数群。
 *
 * 法的前提 (概算に使う一般則):
 * - 建ぺい率・容積率は都市計画で指定される (メニューから自治体が指定)。
 * - 前面道路幅員が 12m 未満の場合、容積率は「幅員 × 法定乗数 (住居系 4/10・
 *   その他 6/10)」と指定容積率の低い方 (建築基準法52条2項)。
 * - 角地は建ぺい率 +10% (53条3項2号)、防火地域内の耐火建築物等も +10%
 *   (53条3項1号)。指定 80% の区域で防火地域内の耐火建築物等は制限適用除外
 *   = 100% (53条6項1号)。
 * - 近隣商業地域では原動機を使用する工場は作業場の床面積合計 150 ㎡以下に
 *   制限される (別表第二)。
 *
 * **概算であり建築・法務助言ではありません。** 実際の可否は用途地域の指定値・
 * 斜線/日影/防火規制・条例を含めて自治体の建築指導課と建築確認で決まります。
 */

/** 前面道路幅員による容積率乗数の区分 (52条2項): 住居系 4/10・その他 6/10。 */
export type RoadMultiplierCategory = 'residential' | 'other';

/** 近隣商業地域: 原動機を使用する工場の作業場床面積の上限 (㎡・別表第二)。 */
export const NEIGHBORHOOD_COMMERCIAL_WORKSHOP_CAP = 150;

/** 非有限・負を 0 に丸める。 */
function nonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 0.1 ㎡単位に丸める。 */
function sqm(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface SitePlanInput {
  /** 敷地面積 (㎡)。 */
  readonly siteArea: number;
  /** 指定建ぺい率 (%)。 */
  readonly coverageRatioPct: number;
  /** 指定容積率 (%)。 */
  readonly farPct: number;
  /** 前面道路幅員 (m)。12m 以上なら道路による容積率制限なし。 */
  readonly roadWidthM: number;
  /** 容積率乗数の区分 (住居系 4/10・その他 6/10)。 */
  readonly category: RoadMultiplierCategory;
  /** 角地緩和 (+10%)。 */
  readonly cornerLot?: boolean;
  /** 防火地域内の耐火建築物等 (+10%。指定 80% なら適用除外 = 100%)。 */
  readonly fireproofBonus?: boolean;
}

export interface SitePlanResult {
  /** 適用建ぺい率 (%・緩和込み、上限 100)。 */
  readonly effectiveCoveragePct: number;
  /** 建築面積の上限 (㎡) = 敷地 × 適用建ぺい率。 */
  readonly maxFootprint: number;
  /** 前面道路幅員による容積率上限 (%・12m 以上は null)。 */
  readonly roadLimitedFarPct: number | null;
  /** 実効容積率 (%) = min(指定, 道路制限)。 */
  readonly effectiveFarPct: number;
  /** 延べ床面積の上限 (㎡) = 敷地 × 実効容積率。 */
  readonly maxTotalFloor: number;
  /** 延べ床上限を使い切るのに必要な目安階数 (= 延べ床 ÷ 建築面積の切上げ)。 */
  readonly floorsToUseAll: number | null;
}

/**
 * 敷地面積と規制値から建築面積・延べ床面積の上限を概算する。
 */
export function planSite(input: SitePlanInput): SitePlanResult {
  const site = nonNegative(input.siteArea);
  const baseCov = Math.min(100, nonNegative(input.coverageRatioPct));
  const far = nonNegative(input.farPct);
  const road = nonNegative(input.roadWidthM);

  // 建ぺい率の緩和: 80% 指定 × 防火地域内の耐火建築物等 → 適用除外 (100%)。
  // それ以外は 角地 +10 / 耐火 +10 を加算し 100 で頭打ち。
  let cov: number;
  if (input.fireproofBonus === true && baseCov >= 80) {
    cov = 100;
  } else {
    cov = Math.min(
      100,
      baseCov + (input.cornerLot === true ? 10 : 0) + (input.fireproofBonus === true ? 10 : 0),
    );
  }

  // 前面道路 12m 未満: 幅員 × 4/10 (住居系) or 6/10 (その他) [%換算 = m × 40/60]。
  const roadLimitedFarPct =
    road > 0 && road < 12
      ? Math.round(road * (input.category === 'residential' ? 40 : 60) * 10) / 10
      : null;
  const effectiveFarPct = roadLimitedFarPct === null ? far : Math.min(far, roadLimitedFarPct);

  const maxFootprint = sqm((site * cov) / 100);
  const maxTotalFloor = sqm((site * effectiveFarPct) / 100);

  return {
    effectiveCoveragePct: cov,
    maxFootprint,
    roadLimitedFarPct,
    effectiveFarPct,
    maxTotalFloor,
    floorsToUseAll: maxFootprint > 0 ? Math.ceil(maxTotalFloor / maxFootprint) : null,
  };
}

export interface FactoryPlanInput {
  /** planSite の建築面積上限 (㎡)。 */
  readonly maxFootprint: number;
  /** planSite の延べ床上限 (㎡)。 */
  readonly maxTotalFloor: number;
  /** 作業場の法定上限 (㎡・既定 150 = 近隣商業地域)。 */
  readonly workshopCapSqm?: number;
  /** 希望する作業場面積 (㎡・未指定は上限いっぱい)。 */
  readonly desiredWorkshopSqm?: number;
}

export interface FactoryPlanResult {
  /** 実際に確保できる作業場面積 (㎡) = min(希望, 法定上限, 建築面積, 延べ床)。 */
  readonly workshopArea: number;
  /** 1 階の残り (直売所・カフェ・事務など) = 建築面積 − 作業場 (㎡)。 */
  readonly groundFloorOther: number;
  /** 2 階以上に回せる面積 (㎡) = 延べ床 − 建築面積 (マイナスなら 0)。 */
  readonly upperFloorsArea: number;
  /** プラン合計 (㎡) = min(延べ床, 建築面積 + 上階面積)。 */
  readonly totalPlanned: number;
  /** 作業場が延べ床に占める割合 (%・延べ床 0 は null)。 */
  readonly workshopSharePct: number | null;
  /** 希望が法定上限を超えている (要・用途地域の再検討)。 */
  readonly overCap: boolean;
  /** 作業場が 1 フロア (建築面積) に収まる。 */
  readonly fitsOneFloor: boolean;
}

/**
 * 作業場上限 (近隣商業 150 ㎡) を踏まえた平面プランを試算する。
 * 作業場を 1 階に置き、残りを直売・事務、上階を販売/オフィス等に回す想定。
 */
export function planFactory(input: FactoryPlanInput): FactoryPlanResult {
  const footprint = nonNegative(input.maxFootprint);
  const totalFloor = nonNegative(input.maxTotalFloor);
  // Infinity は「作業場の面積制限なし」(準工業地域など) を表す明示値として通す。
  const capRaw = input.workshopCapSqm;
  const cap =
    capRaw === undefined
      ? NEIGHBORHOOD_COMMERCIAL_WORKSHOP_CAP
      : capRaw === Number.POSITIVE_INFINITY
        ? Number.POSITIVE_INFINITY
        : nonNegative(capRaw);
  const desired = input.desiredWorkshopSqm === undefined ? cap : nonNegative(input.desiredWorkshopSqm);

  const workshopArea = sqm(Math.min(desired, cap, footprint, totalFloor));
  const groundFloorOther = sqm(Math.max(0, footprint - workshopArea));
  const upperFloorsArea = sqm(Math.max(0, totalFloor - footprint));
  const totalPlanned = sqm(Math.min(totalFloor, footprint + upperFloorsArea));

  return {
    workshopArea,
    groundFloorOther,
    upperFloorsArea,
    totalPlanned,
    workshopSharePct: totalFloor > 0 ? Math.round((workshopArea / totalFloor) * 1000) / 10 : null,
    overCap: desired > cap,
    fitsOneFloor: workshopArea <= footprint && footprint > 0,
  };
}

/* ───────────────  高さ制限: 道路斜線 (法56条1項1号・2項)  ─────────────── */

/**
 * 道路斜線の勾配 (法別表第三(に)欄)。住居系 1.25 / その他 1.5。
 * 「反対側の境界から 1m につき何 m 上がれるか」を表す。
 */
export const ROAD_SLOPE_RESIDENTIAL = 1.25;
export const ROAD_SLOPE_OTHER = 1.5;

/**
 * 日影規制 (法56条の2) の対象となる高さ。近隣商業・商業・準工業・住居系は
 * 「高さ 10m 超」。低層住居専用・田園住居は「軒高 7m 超 または 地上 3 階以上」
 * と別基準なので、その場合は thresholdM に 7 を渡して使う。
 */
export const SHADOW_HEIGHT_THRESHOLD_M = 10;

/** 用途区分から道路斜線の勾配を引く。 */
export function roadSlopeFactor(category: RoadMultiplierCategory): number {
  return category === 'residential' ? ROAD_SLOPE_RESIDENTIAL : ROAD_SLOPE_OTHER;
}

/** 0.01 単位で切り上げる (後退距離は切り下げると違反になるため)。 */
function ceil2(n: number): number {
  return Math.ceil(n * 100) / 100;
}

/** 0.01 単位に丸める。 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface RoadSlopeInput {
  /** 前面道路の幅員 (m)。 */
  readonly roadWidthM: number;
  /** 道路境界からの後退距離 (m)。法56条2項により反対側境界も同じだけ外側とみなす。 */
  readonly setbackM: number;
  /** 用途区分 (勾配 1.25 / 1.5 の別)。 */
  readonly category: RoadMultiplierCategory;
  /** 計画している最高高さ (m)。 */
  readonly plannedHeightM: number;
  /**
   * 別表第三(は)欄の適用距離 (m)。地域と基準容積率の組合せで決まる値なので
   * **表から読んで渡す**。省略すると適用距離の判定を行わない
   * (applicationDistanceChecked=false)。推測値を埋めない。
   */
  readonly applicationDistanceM?: number;
  /** 道路の反対側境界から建築物までの水平距離 (m)。適用距離の判定に使う。 */
  readonly distanceFromOppositeBoundaryM?: number;
}

export interface RoadSlopeResult {
  /** 適用した勾配。 */
  readonly slopeFactor: number;
  /** 高さの限度 (m) = (幅員 + 後退 × 2) × 勾配。 */
  readonly limitM: number;
  /** 計画高さが限度以下か。 */
  readonly ok: boolean;
  /** 余裕 (m) = 限度 − 計画高さ。マイナスなら超過分。 */
  readonly marginM: number;
  /** 計画高さを通すのに必要な最小後退距離 (m)。後退なしで通るなら 0。 */
  readonly minSetbackM: number;
  /** 適用距離の判定を行ったか (入力が揃っている場合のみ true)。 */
  readonly applicationDistanceChecked: boolean;
  /** 適用距離の外にあり道路斜線の適用を受けないか。未判定なら false。 */
  readonly beyondApplicationDistance: boolean;
}

/**
 * 道路斜線の高さ限度と、計画高さを通すのに必要な後退距離を求める。
 *
 * 限度 = (前面道路幅員 + 後退距離 × 2) × 勾配。後退すると反対側の境界も同じだけ
 * 外側にあるとみなされる (法56条2項) ため、後退は 2 倍で効く。
 * 逆に解くと必要後退 a = (計画高さ ÷ 勾配 − 幅員) ÷ 2。
 */
export function planRoadSlope(input: RoadSlopeInput): RoadSlopeResult {
  const width = nonNegative(input.roadWidthM);
  const setback = nonNegative(input.setbackM);
  const height = nonNegative(input.plannedHeightM);
  const slopeFactor = roadSlopeFactor(input.category);

  const limitM = round2((width + setback * 2) * slopeFactor);
  const needed = (height / slopeFactor - width) / 2;

  const checked =
    input.applicationDistanceM !== undefined && input.distanceFromOppositeBoundaryM !== undefined;
  const beyond = checked
    ? nonNegative(input.distanceFromOppositeBoundaryM) > nonNegative(input.applicationDistanceM)
    : false;

  return {
    slopeFactor,
    limitM,
    // 適用距離の外なら斜線の適用を受けないので、高さに関わらず可。
    ok: beyond || height <= limitM,
    marginM: round2(limitM - height),
    // Math.max で 0 に丸める。三項分岐にすると > 0 と >= 0 が同値になり
    // 区別できない変異が残るため、分岐そのものを持たせない。
    minSetbackM: Math.max(0, ceil2(needed)),
    applicationDistanceChecked: checked,
    beyondApplicationDistance: beyond,
  };
}

/* ───────────────  高さ制限: 日影規制 (法56条の2)  ─────────────── */

export interface ShadowRegulationInput {
  /** 計画している最高高さ (m)。 */
  readonly plannedHeightM: number;
  /** 対象となる高さの閾値 (m)。既定 10 (近隣商業等)。低層住専は軒高 7。 */
  readonly thresholdM?: number;
  /**
   * 当該区域が条例で日影規制の対象区域に指定されているか。
   * **区域指定は自治体の条例なので機械判定できない**。未指定なら regulated は
   * null (不明) を返し、「対象でない」と誤って断定しない。
   */
  readonly designatedArea?: boolean;
}

export interface ShadowRegulationResult {
  /** 適用した閾値 (m)。 */
  readonly thresholdM: number;
  /** 計画高さが閾値を超えるか (対象建築物の高さ要件を満たすか)。 */
  readonly exceedsThreshold: boolean;
  /** 閾値までの余裕 (m)。マイナスなら超過分。 */
  readonly headroomM: number;
  /**
   * 実際に規制を受けるか。対象区域の指定が不明なら null。
   * true = 対象区域かつ閾値超 / false = 対象区域でない、または閾値以下。
   */
  readonly regulated: boolean | null;
  /** 規制を避けられる高さの上限 (m) = 閾値ちょうど (「超える」が要件のため)。 */
  readonly maxHeightToAvoidM: number;
}

/**
 * 日影規制の対象建築物に当たるかを判定する。
 *
 * 対象要件は「対象区域内」かつ「一定の高さを超える」の 2 つ。前者は自治体の
 * 条例指定なので入力に取り、未指定なら null を返して**不明を不明のまま扱う**。
 * 「10m を超える」が要件なので、ちょうど 10.0m は対象外になる。
 */
export function planShadowRegulation(input: ShadowRegulationInput): ShadowRegulationResult {
  const height = nonNegative(input.plannedHeightM);
  const thresholdM =
    input.thresholdM === undefined ? SHADOW_HEIGHT_THRESHOLD_M : nonNegative(input.thresholdM);
  const exceedsThreshold = height > thresholdM;

  return {
    thresholdM,
    exceedsThreshold,
    headroomM: round2(thresholdM - height),
    regulated: input.designatedArea === undefined ? null : input.designatedArea && exceedsThreshold,
    maxHeightToAvoidM: thresholdM,
  };
}

/* ───────────────  後退距離と建築面積のトレードオフ  ─────────────── */

export interface SetbackTradeoffInput {
  /** 敷地の奥行 (m・道路に直交する方向)。 */
  readonly siteDepthM: number;
  /** 敷地の間口 (m・道路に平行な方向)。 */
  readonly siteWidthM: number;
  /** 道路と反対側 (背面) の後退距離 (m)。民法 234 条の 0.5m など。 */
  readonly rearSetbackM: number;
  /** 側面の後退距離の合計 (m)。 */
  readonly sideSetbackTotalM: number;
  /** planSite が返した建築面積の上限 (㎡)。 */
  readonly maxFootprint: number;
  /** 前面道路の幅員 (m)。 */
  readonly roadWidthM: number;
  /** 用途区分。 */
  readonly category: RoadMultiplierCategory;
  /** 計画している最高高さ (m)。 */
  readonly plannedHeightM: number;
}

export interface SetbackTradeoffResult {
  /** 道路斜線を通すのに必要な最小後退 (m)。 */
  readonly requiredSetbackM: number;
  /** 建てられる奥行 (m) = 敷地奥行 − 必要後退 − 背面後退。 */
  readonly buildableDepthM: number;
  /** 建てられる間口 (m) = 敷地間口 − 側面後退合計。 */
  readonly buildableWidthM: number;
  /** 幾何的に取れる建築面積 (㎡) = 奥行 × 間口。 */
  readonly geometricFootprint: number;
  /** 実際に取れる建築面積 (㎡) = min(幾何, 建蔽率上限)。 */
  readonly footprint: number;
  /** 何に縛られているか。建蔽率か、後退による寸法か。 */
  readonly limitedBy: 'coverage' | 'geometry';
}

/**
 * 「高さを下げると後退を詰められ、その分だけ奥行が伸びる」関係を数値化する。
 *
 * 道路斜線の必要後退は高さに比例して増えるので、計画高さを下げると後退が減り、
 * 敷地の奥行をより多く使える。ただし建蔽率の上限を超えては建てられないため、
 * 最終的にどちらに縛られているかを limitedBy で示す。
 */
export function planSetbackTradeoff(input: SetbackTradeoffInput): SetbackTradeoffResult {
  const slope = planRoadSlope({
    roadWidthM: input.roadWidthM,
    setbackM: 0,
    category: input.category,
    plannedHeightM: input.plannedHeightM,
  });
  const requiredSetbackM = slope.minSetbackM;

  const buildableDepthM = round2(
    Math.max(0, nonNegative(input.siteDepthM) - requiredSetbackM - nonNegative(input.rearSetbackM)),
  );
  const buildableWidthM = round2(
    Math.max(0, nonNegative(input.siteWidthM) - nonNegative(input.sideSetbackTotalM)),
  );
  const geometricFootprint = sqm(buildableDepthM * buildableWidthM);
  const cap = nonNegative(input.maxFootprint);
  const footprint = sqm(Math.min(geometricFootprint, cap));

  return {
    requiredSetbackM,
    buildableDepthM,
    buildableWidthM,
    geometricFootprint,
    footprint,
    limitedBy: geometricFootprint > cap ? 'coverage' : 'geometry',
  };
}

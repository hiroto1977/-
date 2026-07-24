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

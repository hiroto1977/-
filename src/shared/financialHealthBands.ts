/**
 * 財務健全度のしきい値 — レーダー 15 軸の **0 点 / 100 点の水準** と、軸の評価
 * (良好 / 注意) ・総合格付け (S / A / B / C) の **下限**。
 *
 * 読むのは `renderer/data/financialRatios.ts` (採点) と `financialDiagnosis.ts` (評価) だが、
 * 数字の置き場所はこちら — 台帳 (`parameters.ts`) は `shared` からしか import できない
 * (import の境界)。利用者が台帳で上書きすると、採点と評価がその水準で動く。
 *
 * 水準は一般的な目安 (中小企業の財務指標の慣用値) であって、業種ごとの基準ではない。
 */

/** 線形採点の両端。`bad` で 0 点、`good` で 100 点 (向きはどちらでもよい)。 */
export interface AxisBand {
  readonly bad: number;
  readonly good: number;
}

/** レーダー 15 軸のキー (画面の並び順)。 */
export const RADAR_AXIS_KEYS = [
  'equityRatio',
  'currentRatio',
  'fixedLongTermFit',
  'debtToMonthlySales',
  'debtRepaymentYears',
  'operatingMargin',
  'ordinaryMargin',
  'netMargin',
  'laborShare',
  'ebitdaMargin',
  'receivablesTurnover',
  'inventoryTurnover',
  'ccc',
  'roa',
  'roe',
] as const;

export type RadarAxisKey = (typeof RADAR_AXIS_KEYS)[number];
export type RadarBands = Readonly<Record<RadarAxisKey, AxisBand>>;

/** 既定の水準。低いほど良い軸 (固定長期適合率・月商倍率・償還年数・労働分配率・CCC) は bad > good。 */
export const RADAR_AXIS_BANDS: RadarBands = {
  equityRatio: { bad: 0, good: 50 },
  currentRatio: { bad: 80, good: 200 },
  fixedLongTermFit: { bad: 130, good: 80 },
  debtToMonthlySales: { bad: 6, good: 1 },
  debtRepaymentYears: { bad: 15, good: 3 },
  operatingMargin: { bad: -5, good: 20 },
  ordinaryMargin: { bad: -5, good: 20 },
  netMargin: { bad: -5, good: 15 },
  laborShare: { bad: 80, good: 40 },
  ebitdaMargin: { bad: 0, good: 25 },
  receivablesTurnover: { bad: 4, good: 24 },
  inventoryTurnover: { bad: 4, good: 24 },
  ccc: { bad: 90, good: 0 },
  roa: { bad: 0, good: 10 },
  roe: { bad: 0, good: 15 },
};

/** 軸の評価: 点数がこれ以上なら「良好」(強み)。 */
export const HEALTH_LEVEL_GOOD_MIN = 70;
/** 軸の評価: 点数がこれ以上なら「注意」、未満は「要改善」。 */
export const HEALTH_LEVEL_WARN_MIN = 45;
/** 総合格付けの下限 (総合スコア 0-100)。未満は D。 */
export const HEALTH_GRADE_S_MIN = 80;
export const HEALTH_GRADE_A_MIN = 65;
export const HEALTH_GRADE_B_MIN = 50;
export const HEALTH_GRADE_C_MIN = 35;

export interface HealthBands {
  readonly goodMin: number;
  readonly warnMin: number;
  readonly gradeSMin: number;
  readonly gradeAMin: number;
  readonly gradeBMin: number;
  readonly gradeCMin: number;
}

export const DEFAULT_HEALTH_BANDS: HealthBands = {
  goodMin: HEALTH_LEVEL_GOOD_MIN,
  warnMin: HEALTH_LEVEL_WARN_MIN,
  gradeSMin: HEALTH_GRADE_S_MIN,
  gradeAMin: HEALTH_GRADE_A_MIN,
  gradeBMin: HEALTH_GRADE_B_MIN,
  gradeCMin: HEALTH_GRADE_C_MIN,
};

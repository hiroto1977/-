/**
 * 給与・賞与まわりの概算 — 通勤手当の非課税限度・賞与の源泉徴収税額。
 *
 * **重要 — 概算であり税務助言ではありません。** 賞与の源泉徴収は国税庁
 * 「賞与に対する源泉徴収税額の算出率の表」(甲欄) に基づきますが、本実装は
 * **扶養親族等の数 = 0 人** の列のみの概算です。扶養人数で率が変わるため、
 * 正確な税額は税理士・国税庁の表でご確認ください。
 */

/** 公共交通機関の通勤手当の非課税限度 (月額, 円)。 */
export const COMMUTE_PUBLIC_TRANSPORT_CAP = 150_000;

/** 公共交通機関の通勤手当: 非課税分と課税分 (上限超過) に分ける。 */
export function publicTransportCommute(monthly: number): { nonTaxable: number; taxable: number } {
  const amt = Math.max(0, monthly);
  const nonTaxable = Math.min(amt, COMMUTE_PUBLIC_TRANSPORT_CAP);
  return { nonTaxable, taxable: amt - nonTaxable };
}

/**
 * マイカー・自転車等通勤者の 1 か月あたり非課税限度額 (片道距離 km で決まる)。
 * 片道 2km 未満は全額課税 (非課税 0)。
 */
export function carCommuteNonTaxableLimit(oneWayKm: number): number {
  if (oneWayKm < 2) return 0;
  if (oneWayKm < 10) return 4_200;
  if (oneWayKm < 15) return 7_100;
  if (oneWayKm < 25) return 12_900;
  if (oneWayKm < 35) return 18_700;
  if (oneWayKm < 45) return 24_400;
  if (oneWayKm < 55) return 28_000;
  return 31_600;
}

/**
 * 賞与の源泉徴収税率 (%) — 甲欄・扶養 0 人の算出率表。
 * `prevMonthSalaryAfterSI` = 前月の社会保険料等控除後の給与等の金額 (円)。
 * 率は復興特別所得税を含む。
 */
const BONUS_RATE_TABLE_DEP0: ReadonlyArray<{ readonly min: number; readonly rate: number }> = [
  { min: 0, rate: 0 },
  { min: 68_000, rate: 2.042 },
  { min: 79_000, rate: 4.084 },
  { min: 252_000, rate: 6.126 },
  { min: 300_000, rate: 8.168 },
  { min: 334_000, rate: 10.21 },
  { min: 363_000, rate: 12.252 },
  { min: 395_000, rate: 14.294 },
  { min: 426_000, rate: 16.336 },
  { min: 520_000, rate: 18.378 },
  { min: 601_000, rate: 20.42 },
  { min: 678_000, rate: 22.462 },
  { min: 708_000, rate: 24.504 },
  { min: 745_000, rate: 26.546 },
  { min: 788_000, rate: 28.588 },
  { min: 846_000, rate: 30.63 },
  { min: 914_000, rate: 32.672 },
  { min: 1_312_000, rate: 35.735 },
  { min: 1_521_000, rate: 38.798 },
  { min: 2_453_000, rate: 41.861 },
  { min: 3_495_000, rate: 45.945 },
];

/** 賞与の源泉徴収税率 (%, 扶養 0 人)。前月給与 (社保控除後) の階層で決まる。 */
export function bonusWithholdingRatePctDep0(prevMonthSalaryAfterSI: number): number {
  const v = Math.max(0, prevMonthSalaryAfterSI);
  let rate = 0;
  for (const row of BONUS_RATE_TABLE_DEP0) {
    if (v >= row.min) rate = row.rate;
    else break;
  }
  return rate;
}

/** 賞与の源泉徴収 (扶養 0 人概算)。 */
export interface BonusWithholding {
  /** 課税対象額 = 賞与 − 社会保険料。 */
  readonly taxableBonus: number;
  /** 適用税率 (%)。 */
  readonly ratePct: number;
  /** 源泉徴収税額 (1 円未満切捨て)。 */
  readonly tax: number;
}

/**
 * 賞与の源泉徴収税額を概算する (甲欄・扶養 0 人)。
 * 税額 = (賞与 − 社会保険料) × 率。1 円未満切捨て。
 */
export function bonusWithholdingTax(input: {
  bonus: number;
  socialInsurance: number;
  prevMonthSalaryAfterSI: number;
}): BonusWithholding {
  const bonus = Math.max(0, input.bonus);
  const si = Math.max(0, input.socialInsurance);
  const taxableBonus = Math.max(0, bonus - si);
  const ratePct = bonusWithholdingRatePctDep0(input.prevMonthSalaryAfterSI);
  const tax = Math.floor((taxableBonus * ratePct) / 100);
  return { taxableBonus, ratePct, tax };
}

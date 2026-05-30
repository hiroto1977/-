/**
 * 社会保険料の概算計算 (標準報酬月額の上限を考慮)。
 *
 * **重要 — これは概算試算であり、正確な保険料額・助言ではありません。**
 * 健康保険・厚生年金は本来、報酬を等級に当てはめた「標準報酬月額」で保険料が
 * 決まり、それぞれ上限があります (厚生年金の標準報酬月額は65万円、健康保険は
 * 139万円が上限)。雇用保険は賃金総額に料率を乗じます。料率は年度・都道府県・
 * 事業の種類で変動するため、ここでは令和6年度・協会けんぽ全国平均ベースの
 * 本人負担を既定値とした概算です。実額は給与明細・日本年金機構で確認すること。
 *
 * 従来の額面比例 (`SOCIAL_INSURANCE_RATE = 0.15`) は上限を無視するため、高所得
 * では過大になります。本モジュールは上限を反映し精度を高めます。
 */

function yen(n: number): number {
  return Math.round(n);
}

// --- 標準報酬月額の上限 (本人負担の保険料計算に使う) --------------------

/** 厚生年金保険の標準報酬月額の上限 (第32級, 円/月)。 */
export const PENSION_MONTHLY_CAP = 650_000;
/** 健康保険の標準報酬月額の上限 (第50級, 円/月)。 */
export const HEALTH_MONTHLY_CAP = 1_390_000;

// --- 本人負担の料率 (令和6年度・協会けんぽ全国平均ベースの概算) ----------

/** 厚生年金保険料率の本人負担 (18.3% の半分)。 */
export const PENSION_RATE = 0.0915;
/** 健康保険料率の本人負担 (全国平均 約10% の半分、40歳未満)。 */
export const HEALTH_RATE = 0.05;
/** 介護保険料率の本人負担 (40歳以上65歳未満が健康保険に上乗せ)。 */
export const CARE_RATE = 0.008;
/** 雇用保険料率の本人負担 (一般の事業, 令和6年度)。 */
export const EMPLOYMENT_INSURANCE_RATE = 0.006;

export interface SocialInsuranceBreakdown {
  /** 厚生年金保険料 (本人負担, 年額)。 */
  readonly pension: number;
  /** 健康保険料 (本人負担, 年額。介護保険を含む)。 */
  readonly health: number;
  /** 雇用保険料 (本人負担, 年額)。 */
  readonly employment: number;
  /** 本人負担の社会保険料 合計 (年額)。 */
  readonly total: number;
}

/**
 * 額面年収から社会保険料 (本人負担, 年額) を標準報酬月額の上限を考慮して概算する。
 *
 * 月額報酬 = 年収 / 12 とみなし、厚生年金・健康保険それぞれの上限で頭打ちにする。
 * 雇用保険は上限なしで賃金総額 (年収) に料率を乗じる。賞与の標準賞与額の上限
 * (健康保険年573万・厚生年金月150万) は簡略化のため未反映。
 *
 * @param grossAnnual 額面年収 (円)
 * @param withCare 40歳以上65歳未満 (介護保険料を健康保険に上乗せ) か
 */
export function calcSocialInsurance(grossAnnual: number, withCare = false): SocialInsuranceBreakdown {
  if (grossAnnual <= 0) {
    return { pension: 0, health: 0, employment: 0, total: 0 };
  }
  const monthly = grossAnnual / 12;
  // 標準報酬月額の上限で頭打ち。
  const pensionBaseMonthly = Math.min(monthly, PENSION_MONTHLY_CAP);
  const healthBaseMonthly = Math.min(monthly, HEALTH_MONTHLY_CAP);
  const pension = yen(pensionBaseMonthly * PENSION_RATE * 12);
  const healthRate = HEALTH_RATE + (withCare ? CARE_RATE : 0);
  const health = yen(healthBaseMonthly * healthRate * 12);
  // 雇用保険は賃金総額 (上限なし)。
  const employment = yen(grossAnnual * EMPLOYMENT_INSURANCE_RATE);
  return { pension, health, employment, total: pension + health + employment };
}

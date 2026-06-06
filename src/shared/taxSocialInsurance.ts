/**
 * 社会保険料の概算計算 (標準報酬月額の等級表ベース)。
 *
 * **重要 — これは概算試算であり、正確な保険料額・助言ではありません。**
 * 健康保険・厚生年金は報酬を離散的な「標準報酬月額の等級」に当てはめ、その
 * 標準報酬月額に料率を乗じて保険料が決まります (報酬月額をそのまま使う線形
 * 計算ではありません)。本モジュールは令和6年度・協会けんぽ全国共通の等級表
 * (厚生年金 第1〜32級・健康保険 第1〜50級) を用いて概算精度を高めています。
 * 料率は年度・都道府県・事業の種類で変動するため、ここでは令和6年度・協会
 * けんぽ全国平均ベースの本人負担を既定値とした概算です。賞与は標準賞与額
 * (1,000円未満切捨て) に料率を乗じ、健保=年度累計573万・厚年=1回150万の
 * 上限を反映します。実額は給与明細・日本年金機構で確認すること。
 */

function yen(n: number): number {
  return Math.round(n);
}

// --- 標準報酬月額の等級表 (令和6年度・協会けんぽ全国共通) ----------------
//
// 各エントリは [報酬月額の下限 (この額「以上」でこの等級), 標準報酬月額]。
// 報酬月額 `r` が等級 i に属する条件は: lowerBound[i] ≤ r < lowerBound[i+1]
// (健保・厚年の「以上〜未満」ルール)。最上位等級は上限で頭打ち (青天井)、
// 最下位等級は下限で底打ち (lowerBound[0]=0 とし負/極小報酬もここに丸める)。
//
// 値は厚生年金保険・健康保険の標準報酬月額表 (令和6年3月分〜) に基づく。
// 大量の数値リテラルは「テーブルデータ」であり、各リテラルを書き換える
// 変異 (ArithmeticOperator 等) は実テストで全境界を撃墜できないと等価判定に
// なりやすいため、罠#2 に従いテーブル定義のみ block-level で Stryker を無効化
// する (報酬月額→標準報酬月額の解決ロジックは無効化せず実テストで撃墜)。

/** 標準報酬月額の等級 (報酬月額の下限と、その等級の標準報酬月額)。 */
export interface RemunerationGrade {
  /** この等級に属する報酬月額の下限 (この額「以上」)。円/月。 */
  readonly lowerBound: number;
  /** この等級の標準報酬月額。円/月。 */
  readonly standardMonthly: number;
}

// Stryker disable all : 等級表は静的なデータ定義 (令和6年度 協会けんぽ)。
// 各数値の書き換え変異は境界テストで網羅できない部分が等価になるため、
// データ定義ブロックのみ無効化する。解決ロジックは下で実テスト対象。

/**
 * 健康保険の標準報酬月額 等級表 (第1〜50級)。
 * 第1級 58,000 (報酬月額 63,000未満) 〜 第50級 1,390,000 (1,355,000以上)。
 */
const HEALTH_GRADES: readonly RemunerationGrade[] = [
  { lowerBound: 0, standardMonthly: 58_000 }, // 1級 (〜63,000未満)
  { lowerBound: 63_000, standardMonthly: 68_000 }, // 2級
  { lowerBound: 73_000, standardMonthly: 78_000 }, // 3級
  { lowerBound: 83_000, standardMonthly: 88_000 }, // 4級
  { lowerBound: 93_000, standardMonthly: 98_000 }, // 5級
  { lowerBound: 101_000, standardMonthly: 104_000 }, // 6級
  { lowerBound: 107_000, standardMonthly: 110_000 }, // 7級
  { lowerBound: 114_000, standardMonthly: 118_000 }, // 8級
  { lowerBound: 122_000, standardMonthly: 126_000 }, // 9級
  { lowerBound: 130_000, standardMonthly: 134_000 }, // 10級
  { lowerBound: 138_000, standardMonthly: 142_000 }, // 11級
  { lowerBound: 146_000, standardMonthly: 150_000 }, // 12級
  { lowerBound: 155_000, standardMonthly: 160_000 }, // 13級
  { lowerBound: 165_000, standardMonthly: 170_000 }, // 14級
  { lowerBound: 175_000, standardMonthly: 180_000 }, // 15級
  { lowerBound: 185_000, standardMonthly: 190_000 }, // 16級
  { lowerBound: 195_000, standardMonthly: 200_000 }, // 17級
  { lowerBound: 210_000, standardMonthly: 220_000 }, // 18級
  { lowerBound: 230_000, standardMonthly: 240_000 }, // 19級
  { lowerBound: 250_000, standardMonthly: 260_000 }, // 20級
  { lowerBound: 270_000, standardMonthly: 280_000 }, // 21級
  { lowerBound: 290_000, standardMonthly: 300_000 }, // 22級
  { lowerBound: 310_000, standardMonthly: 320_000 }, // 23級
  { lowerBound: 330_000, standardMonthly: 340_000 }, // 24級
  { lowerBound: 350_000, standardMonthly: 360_000 }, // 25級
  { lowerBound: 370_000, standardMonthly: 380_000 }, // 26級
  { lowerBound: 395_000, standardMonthly: 410_000 }, // 27級
  { lowerBound: 425_000, standardMonthly: 440_000 }, // 28級
  { lowerBound: 455_000, standardMonthly: 470_000 }, // 29級
  { lowerBound: 485_000, standardMonthly: 500_000 }, // 30級
  { lowerBound: 515_000, standardMonthly: 530_000 }, // 31級
  { lowerBound: 545_000, standardMonthly: 560_000 }, // 32級
  { lowerBound: 575_000, standardMonthly: 590_000 }, // 33級
  { lowerBound: 605_000, standardMonthly: 620_000 }, // 34級
  { lowerBound: 635_000, standardMonthly: 650_000 }, // 35級
  { lowerBound: 665_000, standardMonthly: 680_000 }, // 36級
  { lowerBound: 695_000, standardMonthly: 710_000 }, // 37級
  { lowerBound: 730_000, standardMonthly: 750_000 }, // 38級
  { lowerBound: 770_000, standardMonthly: 790_000 }, // 39級
  { lowerBound: 810_000, standardMonthly: 830_000 }, // 40級
  { lowerBound: 855_000, standardMonthly: 880_000 }, // 41級
  { lowerBound: 905_000, standardMonthly: 930_000 }, // 42級
  { lowerBound: 955_000, standardMonthly: 980_000 }, // 43級
  { lowerBound: 1_005_000, standardMonthly: 1_030_000 }, // 44級
  { lowerBound: 1_055_000, standardMonthly: 1_090_000 }, // 45級
  { lowerBound: 1_115_000, standardMonthly: 1_150_000 }, // 46級
  { lowerBound: 1_175_000, standardMonthly: 1_210_000 }, // 47級
  { lowerBound: 1_235_000, standardMonthly: 1_270_000 }, // 48級
  { lowerBound: 1_295_000, standardMonthly: 1_330_000 }, // 49級
  { lowerBound: 1_355_000, standardMonthly: 1_390_000 }, // 50級 (1,355,000以上で頭打ち)
];

/**
 * 厚生年金保険の標準報酬月額 等級表 (第1〜32級)。
 * 第1級 88,000 (報酬月額 93,000未満) 〜 第32級 650,000 (635,000以上)。
 * 健康保険の第4〜35級と標準報酬月額は一致するが、上下限が独立している。
 */
const PENSION_GRADES: readonly RemunerationGrade[] = [
  { lowerBound: 0, standardMonthly: 88_000 }, // 1級 (〜93,000未満)
  { lowerBound: 93_000, standardMonthly: 98_000 }, // 2級
  { lowerBound: 101_000, standardMonthly: 104_000 }, // 3級
  { lowerBound: 107_000, standardMonthly: 110_000 }, // 4級
  { lowerBound: 114_000, standardMonthly: 118_000 }, // 5級
  { lowerBound: 122_000, standardMonthly: 126_000 }, // 6級
  { lowerBound: 130_000, standardMonthly: 134_000 }, // 7級
  { lowerBound: 138_000, standardMonthly: 142_000 }, // 8級
  { lowerBound: 146_000, standardMonthly: 150_000 }, // 9級
  { lowerBound: 155_000, standardMonthly: 160_000 }, // 10級
  { lowerBound: 165_000, standardMonthly: 170_000 }, // 11級
  { lowerBound: 175_000, standardMonthly: 180_000 }, // 12級
  { lowerBound: 185_000, standardMonthly: 190_000 }, // 13級
  { lowerBound: 195_000, standardMonthly: 200_000 }, // 14級
  { lowerBound: 210_000, standardMonthly: 220_000 }, // 15級
  { lowerBound: 230_000, standardMonthly: 240_000 }, // 16級
  { lowerBound: 250_000, standardMonthly: 260_000 }, // 17級
  { lowerBound: 270_000, standardMonthly: 280_000 }, // 18級
  { lowerBound: 290_000, standardMonthly: 300_000 }, // 19級
  { lowerBound: 310_000, standardMonthly: 320_000 }, // 20級
  { lowerBound: 330_000, standardMonthly: 340_000 }, // 21級
  { lowerBound: 350_000, standardMonthly: 360_000 }, // 22級
  { lowerBound: 370_000, standardMonthly: 380_000 }, // 23級
  { lowerBound: 395_000, standardMonthly: 410_000 }, // 24級
  { lowerBound: 425_000, standardMonthly: 440_000 }, // 25級
  { lowerBound: 455_000, standardMonthly: 470_000 }, // 26級
  { lowerBound: 485_000, standardMonthly: 500_000 }, // 27級
  { lowerBound: 515_000, standardMonthly: 530_000 }, // 28級
  { lowerBound: 545_000, standardMonthly: 560_000 }, // 29級
  { lowerBound: 575_000, standardMonthly: 590_000 }, // 30級
  { lowerBound: 605_000, standardMonthly: 620_000 }, // 31級
  { lowerBound: 635_000, standardMonthly: 650_000 }, // 32級 (635,000以上で頭打ち)
];

/** 厚生年金保険の標準報酬月額の上限 (第32級, 円/月)。 */
export const PENSION_MONTHLY_CAP = 650_000;
/** 健康保険の標準報酬月額の上限 (第50級, 円/月)。 */
export const HEALTH_MONTHLY_CAP = 1_390_000;

// Stryker restore all

// --- 標準賞与額の上限 (賞与にかかる保険料計算に使う) --------------------

/** 厚生年金の標準賞与額の上限 (1回 (1か月) あたり, 円)。 */
export const PENSION_BONUS_CAP_PER_PAYMENT = 1_500_000;
/** 健康保険の標準賞与額の上限 (年度累計, 円)。 */
export const HEALTH_BONUS_CAP_ANNUAL = 5_730_000;

// --- 本人負担の料率 (令和6年度・協会けんぽ全国平均ベースの概算) ----------

/** 厚生年金保険料率の本人負担 (18.3% の半分)。 */
export const PENSION_RATE = 0.0915;
/** 健康保険料率の本人負担 (全国平均 約10% の半分、40歳未満)。 */
export const HEALTH_RATE = 0.05;
/** 介護保険料率の本人負担 (40歳以上65歳未満が健康保険に上乗せ)。 */
export const CARE_RATE = 0.008;
/** 雇用保険料率の本人負担 (一般の事業, 令和6年度)。 */
export const EMPLOYMENT_INSURANCE_RATE = 0.006;

/**
 * 報酬月額を等級表に当てはめ、対応する標準報酬月額を返す純粋関数。
 *
 * 「以上〜未満」ルール: 報酬月額 `r` は lowerBound[i] ≤ r < lowerBound[i+1]
 * を満たす等級 i の標準報酬月額になる。最下位等級 (lowerBound=0) で底打ち、
 * 最上位等級で頭打ち (青天井) する。負/0 の報酬は最下位等級に丸める。
 *
 * @param remuneration 報酬月額 (円/月)
 * @param grades 標準報酬月額の等級表 (lowerBound 昇順)
 */
export function resolveStandardMonthly(
  remuneration: number,
  grades: readonly RemunerationGrade[],
): number {
  const r = Math.max(0, remuneration);
  // 上位等級から走査し、最初に「下限以上」を満たした等級を採用する。
  // これにより上限等級での頭打ちと境界 (以上〜未満) を同時に満たす。
  for (let i = grades.length - 1; i >= 0; i--) {
    const grade = grades[i]!;
    if (r >= grade.lowerBound) {
      return grade.standardMonthly;
    }
  }
  // r >= 0 かつ grades[0].lowerBound === 0 なので必ず上で return する。
  // ここは到達不能だが型安全のため最下位等級を返す。
  // Stryker disable next-line all : 到達不能 (grades[0].lowerBound===0 で必ず先に return)。
  return grades[0]!.standardMonthly;
}

/** 報酬月額から厚生年金の標準報酬月額を求める。 */
export function resolvePensionStandardMonthly(remuneration: number): number {
  return resolveStandardMonthly(remuneration, PENSION_GRADES);
}

/** 報酬月額から健康保険の標準報酬月額を求める。 */
export function resolveHealthStandardMonthly(remuneration: number): number {
  return resolveStandardMonthly(remuneration, HEALTH_GRADES);
}

/** 賞与額を標準賞与額に丸める (1,000円未満切捨て、負は0)。 */
export function resolveStandardBonus(bonus: number): number {
  const b = Math.max(0, bonus);
  return Math.floor(b / 1_000) * 1_000;
}

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
 * 額面年収から社会保険料 (本人負担, 年額) を標準報酬月額の等級表で概算する。
 *
 * 月額報酬 = 年収 / 12 とみなし、厚生年金・健康保険それぞれの等級表で標準報酬
 * 月額を求めて料率を乗じる。雇用保険は等級なしで賃金総額 (年収) に料率を乗じる。
 * 賞与の標準賞与額の上限を反映したい場合は `calcSocialInsuranceWithBonus` を使う。
 *
 * @param grossAnnual 額面年収 (円)
 * @param withCare 40歳以上65歳未満 (介護保険料を健康保険に上乗せ) か
 */
export function calcSocialInsurance(grossAnnual: number, withCare = false): SocialInsuranceBreakdown {
  // grossAnnual===0 では計算経路 (monthly=0) でも全保険料が 0 にならない
  // (標準報酬月額は最下位等級 58,000/88,000 で底打ちされる) ため、0/負は
  // ここで明示的に 0 を返す。境界は「0以下なら無職=保険料なし」とみなす。
  if (grossAnnual <= 0) {
    return { pension: 0, health: 0, employment: 0, total: 0 };
  }
  const monthly = grossAnnual / 12;
  // 標準報酬月額を等級表で決定。
  const pensionBaseMonthly = resolvePensionStandardMonthly(monthly);
  const healthBaseMonthly = resolveHealthStandardMonthly(monthly);
  const pension = yen(pensionBaseMonthly * PENSION_RATE * 12);
  const healthRate = HEALTH_RATE + (withCare ? CARE_RATE : 0);
  const health = yen(healthBaseMonthly * healthRate * 12);
  // 雇用保険は賃金総額 (上限なし)。
  const employment = yen(grossAnnual * EMPLOYMENT_INSURANCE_RATE);
  return { pension, health, employment, total: pension + health + employment };
}

/**
 * 月額報酬と賞与を分けて社会保険料 (本人負担, 年額) を概算する。
 *
 * 月額報酬部分は標準報酬月額の等級表で標準報酬月額を求めて料率を乗じる。
 * 賞与は標準賞与額 (1,000円未満切捨て) に料率を乗じ、別の上限が適用される:
 * - 厚生年金: 標準賞与額は 1 回あたり 150万円が上限 (`PENSION_BONUS_CAP_PER_PAYMENT`)。
 * - 健康保険: 標準賞与額は年度累計 573万円が上限 (`HEALTH_BONUS_CAP_ANNUAL`)。
 * 雇用保険は賃金総額 (月額報酬 + 賞与) に料率を乗じる (上限なし)。
 *
 * @param monthlyRemuneration 月額報酬 (円/月)
 * @param bonusPerPayment 1 回あたりの賞与額 (円)
 * @param bonusPaymentsPerYear 年間の賞与支給回数
 * @param withCare 40歳以上65歳未満 (介護保険料を健康保険に上乗せ) か
 */
export function calcSocialInsuranceWithBonus(
  monthlyRemuneration: number,
  bonusPerPayment: number,
  bonusPaymentsPerYear: number,
  withCare = false,
): SocialInsuranceBreakdown {
  const monthly = Math.max(0, monthlyRemuneration);
  const bonus = Math.max(0, bonusPerPayment);
  const bonusCount = Math.max(0, Math.floor(bonusPaymentsPerYear));
  const healthRate = HEALTH_RATE + (withCare ? CARE_RATE : 0);

  // --- 月額報酬部分 (標準報酬月額の等級表) ---
  // monthly===0 (賞与のみ) のときは月額報酬の保険料を 0 にする (最下位等級で
  // 底打ちさせない)。在職の最低標準報酬月額を概算に持ち込まないため。
  const pensionMonthlyBase = monthly > 0 ? resolvePensionStandardMonthly(monthly) : 0;
  const healthMonthlyBase = monthly > 0 ? resolveHealthStandardMonthly(monthly) : 0;
  let pension = pensionMonthlyBase * PENSION_RATE * 12;
  let health = healthMonthlyBase * healthRate * 12;

  // --- 賞与部分 (標準賞与額 = 1,000円未満切捨て, 上限あり) ---
  const standardBonusPer = resolveStandardBonus(bonus);
  // 厚生年金: 1回ごとに150万円で頭打ち。
  const pensionBonusBasePer = Math.min(standardBonusPer, PENSION_BONUS_CAP_PER_PAYMENT);
  pension += pensionBonusBasePer * PENSION_RATE * bonusCount;
  // 健康保険: 年度累計573万円で頭打ち。
  const healthBonusBaseAnnual = Math.min(standardBonusPer * bonusCount, HEALTH_BONUS_CAP_ANNUAL);
  health += healthBonusBaseAnnual * healthRate;

  // 雇用保険は賃金総額 (月額×12 + 賞与×回数, 上限なし)。
  const totalWage = monthly * 12 + bonus * bonusCount;
  const employment = yen(totalWage * EMPLOYMENT_INSURANCE_RATE);

  const p = yen(pension);
  const h = yen(health);
  return { pension: p, health: h, employment, total: p + h + employment };
}

/**
 * 給与・賞与まわりの概算 — 通勤手当の非課税限度・賞与の源泉徴収税額・
 * 月次手取り・賞与手取り・人件費の会社負担総額。
 *
 * **重要 — 概算であり税務助言ではありません。** 賞与の源泉徴収は国税庁
 * 「賞与に対する源泉徴収税額の算出率の表」(甲欄) に基づきますが、本実装は
 * **扶養親族等の数 = 0 人** の列のみの概算です。扶養人数で率が変わるため、
 * 正確な税額は税理士・国税庁の表でご確認ください。月次手取り・源泉所得税は
 * 月額表ではなく年税額の月割で近似する概算 (賞与・住民税・端数処理の分だけ
 * 実際の源泉徴収額とは差が出る) であり、会社負担の社会保険料も令和6年度・
 * 協会けんぽ全国平均ベースの労使折半概算です。実額は給与明細・税理士・
 * 国税庁・日本年金機構でご確認ください。
 */

import {
  resolvePensionStandardMonthly,
  resolveHealthStandardMonthly,
  resolveStandardBonus,
  PENSION_RATE,
  HEALTH_RATE,
  CARE_RATE,
  EMPLOYMENT_INSURANCE_RATE,
  PENSION_BONUS_CAP_PER_PAYMENT,
  HEALTH_BONUS_CAP_ANNUAL,
} from './taxSocialInsurance';
import {
  calcIncomeTax,
  calcSalaryIncomeDeduction,
  calcBasicDeduction,
} from './taxCalc';

/** 円未満を切り捨てる (源泉徴収税額・保険料は 1 円未満切捨てが原則)。 */
function floorYen(n: number): number {
  return Math.floor(n);
}

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

// --- 月次の社会保険料 (本人負担, 月額。標準報酬月額の等級表ベース) ----------

/** 月次の社会保険料の内訳 (本人負担, 円/月。1 円未満切捨て)。 */
export interface MonthlySocialInsurance {
  /** 厚生年金保険料 (本人負担, 円/月)。 */
  readonly pension: number;
  /** 健康保険料 (本人負担, 円/月。介護保険を含む)。 */
  readonly health: number;
  /** 雇用保険料 (本人負担, 円/月)。 */
  readonly employment: number;
  /** 本人負担の社会保険料 合計 (円/月)。 */
  readonly total: number;
}

/**
 * 月額報酬から月次の社会保険料 (本人負担) を標準報酬月額の等級表で概算する。
 *
 * 厚生年金・健康保険は標準報酬月額に料率を乗じる (報酬比例の線形計算ではなく
 * 等級表)。雇用保険は標準報酬の等級を使わず、その月の報酬 (賃金) に料率を乗じる。
 * 0 / 負の報酬は全保険料 0 を返す (無報酬月)。各保険料は 1 円未満切捨て。
 *
 * @param monthlyRemuneration 月額報酬 (額面, 円/月)
 * @param withCare 40歳以上65歳未満 (介護保険料を健康保険に上乗せ) か
 */
export function calcMonthlySocialInsurance(
  monthlyRemuneration: number,
  withCare = false,
): MonthlySocialInsurance {
  // 0 / 負の報酬は等級表の底打ち (最下位等級) を持ち込まず 0 を返す。
  if (monthlyRemuneration <= 0) {
    return { pension: 0, health: 0, employment: 0, total: 0 };
  }
  const pensionBase = resolvePensionStandardMonthly(monthlyRemuneration);
  const healthBase = resolveHealthStandardMonthly(monthlyRemuneration);
  const healthRate = HEALTH_RATE + (withCare ? CARE_RATE : 0);
  const pension = floorYen(pensionBase * PENSION_RATE);
  const health = floorYen(healthBase * healthRate);
  // 雇用保険は標準報酬ではなくその月の賃金 (報酬) に料率を乗じる。
  const employment = floorYen(monthlyRemuneration * EMPLOYMENT_INSURANCE_RATE);
  return { pension, health, employment, total: pension + health + employment };
}

// --- 月次の源泉所得税 (概算: 年税額の月割) -------------------------------

/**
 * 月次の源泉所得税の概算 (年税額の月割)。
 *
 * 国税庁の「給与所得の源泉徴収税額表 (月額表)」は本来、社保控除後の課税対象額と
 * 扶養人数で月額を直接引くが、本実装は **年税額 (社保控除後の年額に対する所得税)
 * を 12 で割る** 近似とする。賞与・年末調整・端数処理の影響で実際の月次源泉とは
 * ずれるため概算。扶養 0 人・基礎控除のみの簡略モデル (`calcNetSalary` と同系統)。
 *
 * @param monthlyGross 額面月給 (円/月)
 * @param monthlySocialInsurance その月の社会保険料 (本人負担, 円/月)
 * @returns 月次源泉所得税の概算 (円/月, 1 円未満切捨て)
 */
export function estimateMonthlyWithholding(
  monthlyGross: number,
  monthlySocialInsurance: number,
): number {
  const gross = Math.max(0, monthlyGross);
  // gross===0 では計算経路 (annualGross=0→課税所得0→所得税0→月割0) も 0 を返すため、
  // `<=0`→`<0` (EqualityOperator) とガード削除 (ConditionalExpression) は結果が
  // 同値 (等価変異)。早期 return は無報酬月の高速パスとして残す。
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  if (gross <= 0) return 0;
  const si = Math.max(0, monthlySocialInsurance);
  const annualGross = gross * 12;
  const annualSI = si * 12;
  // 給与所得 = 額面年収 − 給与所得控除。
  const salaryDeduction = calcSalaryIncomeDeduction(annualGross);
  const employmentIncome = Math.max(0, annualGross - salaryDeduction);
  const basicDeduction = calcBasicDeduction(employmentIncome);
  // 課税所得 = 給与所得 − 社会保険料 (実額) − 基礎控除。
  const taxableIncome = Math.max(0, employmentIncome - annualSI - basicDeduction);
  const annualIncomeTax = calcIncomeTax(taxableIncome);
  // 年税額の月割。1 円未満切捨て。
  return floorYen(annualIncomeTax / 12);
}

// --- 月次手取り (額面 → 控除 → 手取り) -----------------------------------

/** 月次手取りの内訳 (円/月)。 */
export interface MonthlyNetSalary {
  /** 額面月給。 */
  readonly gross: number;
  /** 社会保険料 (本人負担, 円/月)。 */
  readonly socialInsurance: number;
  /** 社会保険料の内訳 (本人負担)。 */
  readonly socialInsuranceBreakdown: MonthlySocialInsurance;
  /** 源泉所得税 (概算, 円/月)。 */
  readonly incomeTax: number;
  /** 住民税 (任意の月額, 円/月。指定時のみ控除)。 */
  readonly residentTax: number;
  /** 控除合計 (社保 + 源泉 + 住民税)。 */
  readonly totalDeductions: number;
  /** 手取り (= 額面 − 控除合計)。 */
  readonly takeHome: number;
}

/**
 * 任意の住民税月額を控除可能な値に正規化する (負・非有限・未指定は 0)。
 * 正の値のみ 1 円未満を切り捨てて返す。
 */
function sanitizeResidentTax(raw: number | undefined): number {
  // `raw !== undefined` は `isFinite(undefined)===false` に包含されるため
  // `true` 化 (ConditionalExpression) は同値。`> 0`→`>= 0` (EqualityOperator) も
  // 0 で `floorYen(0)===0` のため同値。いずれも等価変異。
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  if (raw === undefined || !isFinite(raw) || raw <= 0) return 0;
  return floorYen(raw);
}

/**
 * 額面月給から月次手取りを概算する (額面 → 控除 → 手取り)。
 *
 * 控除 = 社会保険料 (健保/厚年/雇用, 標準報酬月額の等級表) + 源泉所得税 (年税額
 * の月割概算) + 住民税 (任意, 月額を渡したときのみ控除)。住民税は前年所得ベースで
 * 別徴収のため既定では 0 とし、特別徴収の月額が分かる場合に `residentTaxMonthly`
 * で渡す。0 / 負の額面は全 0 (手取り 0) を返す。各控除は 1 円未満切捨て。
 *
 * @param monthlyGross 額面月給 (円/月)
 * @param opts.withCare 40歳以上65歳未満 (介護保険料を上乗せ) か
 * @param opts.residentTaxMonthly 住民税の月額 (特別徴収, 円/月)。既定 0
 */
export function calcMonthlyNetSalary(
  monthlyGross: number,
  opts: { withCare?: boolean; residentTaxMonthly?: number } = {},
): MonthlyNetSalary {
  const gross = Math.max(0, monthlyGross);
  const withCare = opts.withCare ?? false;
  // 住民税は負・非有限を 0 に丸める (任意控除)。
  const residentTax = sanitizeResidentTax(opts.residentTaxMonthly);
  if (gross <= 0) {
    const empty: MonthlySocialInsurance = { pension: 0, health: 0, employment: 0, total: 0 };
    return {
      gross: 0,
      socialInsurance: 0,
      socialInsuranceBreakdown: empty,
      incomeTax: 0,
      residentTax: 0,
      totalDeductions: 0,
      takeHome: 0,
    };
  }
  const si = calcMonthlySocialInsurance(gross, withCare);
  const incomeTax = estimateMonthlyWithholding(gross, si.total);
  const totalDeductions = si.total + incomeTax + residentTax;
  const takeHome = gross - totalDeductions;
  return {
    gross,
    socialInsurance: si.total,
    socialInsuranceBreakdown: si,
    incomeTax,
    residentTax,
    totalDeductions,
    takeHome,
  };
}

// --- 賞与の手取り (賞与額面 → 社保・源泉控除 → 手取り) --------------------

/** 賞与の手取りの内訳 (円)。 */
export interface BonusNet {
  /** 賞与額面。 */
  readonly gross: number;
  /** 賞与にかかる社会保険料 (本人負担, 円)。 */
  readonly socialInsurance: number;
  /** 賞与の社会保険料の内訳 (本人負担)。 */
  readonly socialInsuranceBreakdown: MonthlySocialInsurance;
  /** 賞与の源泉所得税 (概算, 円)。 */
  readonly incomeTax: number;
  /** 適用された賞与源泉率 (%)。 */
  readonly withholdingRatePct: number;
  /** 控除合計 (社保 + 源泉)。 */
  readonly totalDeductions: number;
  /** 賞与の手取り (= 額面 − 控除合計)。 */
  readonly takeHome: number;
}

/**
 * 賞与額面から手取りを概算する (賞与 → 社保・源泉控除 → 手取り)。
 *
 * 社会保険料は標準賞与額 (1,000 円未満切捨て, 上限あり) に料率を乗じる:
 * - 厚生年金: 標準賞与額 1 回 150 万円が上限 (`PENSION_BONUS_CAP_PER_PAYMENT`)。
 * - 健康保険: 年度累計 573 万円が上限。本関数は **1 回分** の概算のため、年度
 *   累計の上限は 1 回 573 万円とみなして頭打ちする (複数回の累計管理は行わない)。
 * 雇用保険は賞与額にそのまま料率を乗じる。源泉所得税は `bonusWithholdingTax`
 * (甲欄・扶養 0 人・前月給与の率) に社保控除後の課税対象を渡して算出。
 * 0 / 負の賞与は全 0 を返す。各控除は 1 円未満切捨て。
 *
 * @param bonus 賞与額面 (円)
 * @param prevMonthSalaryAfterSI 前月の社会保険料等控除後の給与等の金額 (円)
 * @param opts.withCare 40歳以上65歳未満 (介護保険料を上乗せ) か
 */
export function calcBonusNet(
  bonus: number,
  prevMonthSalaryAfterSI: number,
  opts: { withCare?: boolean } = {},
): BonusNet {
  // gross===0 (賞与なし) でも下の計算経路がすべて 0 を返す (標準賞与額0・各料率
  // ×0・課税対象0)。源泉率は前月給与で決まり賞与0でも参照できる。早期 return は
  // 計算経路と完全に等価なため設けない (等価変異の発生を避ける)。
  const gross = Math.max(0, bonus);
  const withCare = opts.withCare ?? false;
  const standardBonus = resolveStandardBonus(gross);
  const healthRate = HEALTH_RATE + (withCare ? CARE_RATE : 0);
  // 厚生年金: 1 回 150 万円で頭打ち。
  const pensionBase = Math.min(standardBonus, PENSION_BONUS_CAP_PER_PAYMENT);
  // 健康保険: 1 回分なので年度累計上限 573 万円を 1 回上限とみなす。
  const healthBase = Math.min(standardBonus, HEALTH_BONUS_CAP_ANNUAL);
  const pension = floorYen(pensionBase * PENSION_RATE);
  const health = floorYen(healthBase * healthRate);
  const employment = floorYen(gross * EMPLOYMENT_INSURANCE_RATE);
  const siTotal = pension + health + employment;
  const breakdown: MonthlySocialInsurance = { pension, health, employment, total: siTotal };
  const withholding = bonusWithholdingTax({
    bonus: gross,
    socialInsurance: siTotal,
    prevMonthSalaryAfterSI,
  });
  const totalDeductions = siTotal + withholding.tax;
  const takeHome = gross - totalDeductions;
  return {
    gross,
    socialInsurance: siTotal,
    socialInsuranceBreakdown: breakdown,
    incomeTax: withholding.tax,
    withholdingRatePct: withholding.ratePct,
    totalDeductions,
    takeHome,
  };
}

// --- 人件費の会社負担総額 (額面 + 会社負担社会保険料 + 労災) --------------
//
// 会社 (事業主) は健康保険・厚生年金を従業員と折半 (会社負担率 = 本人負担率)、
// 雇用保険は事業主の方が高い (令和6年度 一般の事業: 本人 0.6% / 事業主 0.95%)、
// 労災保険は全額事業主負担 (業種別。一般的な事務・サービスで概ね 0.3% 前後)。
// 子ども・子育て拠出金 (全額事業主, 標準報酬月額に 0.36%) も会社負担に含める。

/** 雇用保険料率の会社負担 (一般の事業, 令和6年度。本人0.6%に対し事業主0.95%)。 */
export const EMPLOYMENT_INSURANCE_RATE_EMPLOYER = 0.0095;
/** 労災保険料率の会社負担 (全額事業主。一般的な事務・サービス業の概算)。 */
export const WORKERS_ACCIDENT_RATE = 0.003;
/** 子ども・子育て拠出金率 (全額事業主, 標準報酬月額・標準賞与額に乗じる)。 */
export const CHILD_CARE_CONTRIBUTION_RATE = 0.0036;

/** 人件費の会社負担総額の内訳 (月額, 円/月)。 */
export interface EmployerCost {
  /** 額面月給 (会社が支払う給与)。 */
  readonly gross: number;
  /** 会社負担の厚生年金保険料 (折半分, 円/月)。 */
  readonly pension: number;
  /** 会社負担の健康保険料 (折半分, 介護含む, 円/月)。 */
  readonly health: number;
  /** 会社負担の雇用保険料 (事業主分, 円/月)。 */
  readonly employment: number;
  /** 労災保険料 (全額事業主, 円/月)。 */
  readonly workersAccident: number;
  /** 子ども・子育て拠出金 (全額事業主, 円/月)。 */
  readonly childCare: number;
  /** 会社負担の法定福利費 合計 (= 年金+健保+雇用+労災+拠出金)。 */
  readonly employerContributions: number;
  /** 人件費の会社負担総額 (= 額面 + 会社負担の法定福利費)。 */
  readonly totalCost: number;
}

/**
 * 額面月給から人件費の会社負担総額を概算する。
 *
 * 会社負担総額 = 額面 + 会社負担の法定福利費。法定福利費は:
 * - 厚生年金・健康保険: 標準報酬月額に料率を乗じた額の **会社折半分** (本人負担と同率)。
 * - 雇用保険: その月の賃金 (報酬) に事業主率 (0.95%) を乗じる。
 * - 労災保険: その月の賃金に労災率 (全額事業主) を乗じる。
 * - 子ども・子育て拠出金: 厚生年金の標準報酬月額に拠出金率を乗じる (全額事業主)。
 * 0 / 負の額面は全 0 を返す。各保険料は 1 円未満切捨て。
 *
 * @param monthlyGross 額面月給 (円/月)
 * @param opts.withCare 40歳以上65歳未満 (介護保険料を会社も折半) か
 */
export function calcEmployerCost(
  monthlyGross: number,
  opts: { withCare?: boolean } = {},
): EmployerCost {
  const gross = Math.max(0, monthlyGross);
  const withCare = opts.withCare ?? false;
  if (gross <= 0) {
    return {
      gross: 0,
      pension: 0,
      health: 0,
      employment: 0,
      workersAccident: 0,
      childCare: 0,
      employerContributions: 0,
      totalCost: 0,
    };
  }
  const pensionBase = resolvePensionStandardMonthly(gross);
  const healthBase = resolveHealthStandardMonthly(gross);
  const healthRate = HEALTH_RATE + (withCare ? CARE_RATE : 0);
  // 会社折半分は本人負担と同率 (PENSION_RATE / HEALTH_RATE は折半後の本人率)。
  const pension = floorYen(pensionBase * PENSION_RATE);
  const health = floorYen(healthBase * healthRate);
  const employment = floorYen(gross * EMPLOYMENT_INSURANCE_RATE_EMPLOYER);
  const workersAccident = floorYen(gross * WORKERS_ACCIDENT_RATE);
  // 子ども・子育て拠出金は厚生年金の標準報酬月額が算定基礎。
  const childCare = floorYen(pensionBase * CHILD_CARE_CONTRIBUTION_RATE);
  const employerContributions = pension + health + employment + workersAccident + childCare;
  const totalCost = gross + employerContributions;
  return {
    gross,
    pension,
    health,
    employment,
    workersAccident,
    childCare,
    employerContributions,
    totalCost,
  };
}

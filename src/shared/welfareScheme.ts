import {
  calcSalaryIncomeDeduction,
  calcBasicDeduction,
  calcResidentBasicDeduction,
  calcIncomeTax,
  calcResidentTax,
} from './taxCalc';
import {
  calcMonthlySocialInsurance,
  EMPLOYMENT_INSURANCE_RATE_EMPLOYER,
  WORKERS_ACCIDENT_RATE,
} from './payroll';

/**
 * 給与デザイン / 福利厚生スキーム試算 (純ロジック・IO なし・概算)。
 *
 * 「生活費を払った後に手元へ残る自由なお金 (= 手元残り)」を**同額**に保ったまま、
 *   ① 通常給与 (従業員が家賃・育児・食事・EC を自分で支払う)
 *   ② 福利厚生スキーム (社宅・食事補助・育児補助・EC カフェテリアポイントを
 *      会社が非課税で現物支給し、基本給を下げる)
 * を比較する。額面を下げることで本人・会社双方の社会保険料と税が下がり、
 * 従業員は同じ手元残り + 現物価値、会社は総コスト減という構図を数値化する。
 *
 * **重要 (コンプライアンス):**
 * - EC は「会社から毎月の非課税ポイントを支給するカフェテリアプラン」として扱う
 *   (現金値引きの強制ではない)。社宅・食事補助・育児補助も現物/役務の非課税枠を前提。
 * - 本モジュールは**概算**であり税務助言ではない。実際の標準報酬等級・自治体料率・
 *   非課税要件 (食事は本人半額負担かつ会社負担月3,500円以下 等) の充足は要確認。
 *
 * 税・社保は既存の純モジュール (taxCalc / payroll) を合成。扶養なし・基礎控除のみの
 * 簡略モデル (所得税は年税額の月割、住民税は同課税所得 × 10% の概算)。
 */

const floorYen = (n: number) => Math.floor(n);

export interface MonthlyCompensation {
  /** 額面月給 (円/月)。 */
  readonly gross: number;
  /** 社会保険料 本人負担 (円/月)。 */
  readonly employeeSocialInsurance: number;
  /** 所得税 概算 (円/月)。 */
  readonly incomeTax: number;
  /** 住民税 概算 (円/月)。 */
  readonly residentTax: number;
  /** 手取り (= 額面 − 社保 − 所得税 − 住民税)。 */
  readonly takeHome: number;
  /** 会社負担の社会保険料 (法定福利費, 円/月)。 */
  readonly employerSocialInsurance: number;
}

/**
 * 額面月給から本人手取りと会社負担社保を概算する (扶養なし・基礎控除のみ)。
 * 0 / 負の額面は全 0。
 */
export function monthlyCompensation(grossMonthly: number, withCare = false): MonthlyCompensation {
  const gross = Math.max(0, grossMonthly);
  if (gross === 0) {
    return {
      gross: 0,
      employeeSocialInsurance: 0,
      incomeTax: 0,
      residentTax: 0,
      takeHome: 0,
      employerSocialInsurance: 0,
    };
  }
  const si = calcMonthlySocialInsurance(gross, withCare);
  const annualGross = gross * 12;
  const annualSI = si.total * 12;
  const employmentIncome = Math.max(0, annualGross - calcSalaryIncomeDeduction(annualGross));
  const basic = calcBasicDeduction(employmentIncome);
  const residentBasic = calcResidentBasicDeduction(employmentIncome);
  const taxable = Math.max(0, employmentIncome - annualSI - basic);
  // 住民税の課税所得は基礎控除が所得税と異なる (43万 / 所得税は48万) ため別計算。
  const residentTaxable = Math.max(0, employmentIncome - annualSI - residentBasic);
  const incomeTax = floorYen(calcIncomeTax(taxable) / 12);
  const residentTax = floorYen(calcResidentTax(residentTaxable) / 12);
  const takeHome = gross - si.total - incomeTax - residentTax;
  // 会社負担社保: 厚年・健保 (介護含む) は労使折半で本人と同額、雇用保険は事業主料率、
  // 労災は事業主全額。
  const employerSocialInsurance =
    si.pension +
    si.health +
    floorYen(gross * EMPLOYMENT_INSURANCE_RATE_EMPLOYER) +
    floorYen(gross * WORKERS_ACCIDENT_RATE);
  return {
    gross,
    employeeSocialInsurance: si.total,
    incomeTax,
    residentTax,
    takeHome,
    employerSocialInsurance,
  };
}

/**
 * 目標手取りに一致する額面月給を二分探索で求める (手取りは額面に対し単調増加)。
 * 1 円単位。到達不能な高額もカンスト上限で打ち切る。
 */
export function solveGrossForTakeHome(targetTakeHome: number, withCare = false): number {
  if (targetTakeHome <= 0) return 0;
  let lo = 0;
  let hi = 3_000_000; // 月額面の上限ガード
  // 50 回で 3,000,000 / 2^50 ≈ 1 円未満に収束。反復回数の境界 (i<50→i<=50) は
  // 1 回多いだけで Math.round 後の結果が変わらず等価変異。
  // Stryker disable next-line EqualityOperator
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    // 厳密一致 (< → <=) は連続値では測度0で到達せず結果不変の等価変異。
    // Stryker disable next-line EqualityOperator
    if (monthlyCompensation(mid, withCare).takeHome < targetTakeHome) lo = mid;
    else hi = mid;
  }
  return Math.round(hi);
}

export interface WelfareSchemeInput {
  /** 目標の「手元残り」(生活費支払後に自由に使える額, 円/月)。 */
  readonly targetFreeCash: number;
  /** 家賃 総額 (円/月)。 */
  readonly rentTotal: number;
  /** 社宅: 会社が直接負担する家賃 (非課税, 円/月)。残りは本人天引き。 */
  readonly rentCompanyShare: number;
  /** 食事 総額 (円/月)。 */
  readonly mealTotal: number;
  /** 食事補助: 会社負担分 (非課税, 円/月)。残りは本人天引き。 */
  readonly mealCompanyShare: number;
  /** 育児補助: 会社手配 (シッター券等・非課税, 円/月)。 */
  readonly childcare: number;
  /** 自社 EC カフェテリアポイント (非課税, 円/月)。 */
  readonly ecPoints: number;
  /** 40歳以上65歳未満 (介護保険料を上乗せ) か。 */
  readonly withCare?: boolean;
}

export interface WelfareScenario {
  /** 額面月給。 */
  readonly gross: number;
  /** 社会保険料 本人負担。 */
  readonly employeeSocialInsurance: number;
  /** 所得税 + 住民税 概算。 */
  readonly tax: number;
  /** 本人負担天引き (社宅・食事の自己負担分)。 */
  readonly payrollDeduction: number;
  /** 口座振込額 (= 額面 − 社保 − 税 − 天引き)。 */
  readonly netPaid: number;
  /** 自由に使えるお金 (= 手元残り)。両シナリオで targetFreeCash に一致。 */
  readonly freeCash: number;
  /** 現物支給の福利厚生価値 (非課税)。 */
  readonly inKindValue: number;
  /** 従業員の実質手元残り (= freeCash + inKindValue)。 */
  readonly employeeRealValue: number;
  /** 会社の総コスト (額面 + 会社負担社保 + 会社負担福利厚生)。 */
  readonly companyTotalCost: number;
}

export interface WelfareSchemeResult {
  readonly normal: WelfareScenario;
  readonly scheme: WelfareScenario;
  /** 差額 (scheme − normal)。 */
  readonly diff: {
    readonly gross: number;
    readonly employeeSocialInsurance: number;
    readonly tax: number;
    readonly employeeRealValue: number;
    readonly companyTotalCost: number;
  };
}

/**
 * 福利厚生スキームの設計図を算出する。
 *
 * 両シナリオとも「手元残り = targetFreeCash」になるよう額面を逆算し、
 * 社保・税・現物価値・会社総コストを比較する。
 */
export function designWelfareScheme(input: WelfareSchemeInput): WelfareSchemeResult {
  const withCare = input.withCare ?? false;
  const rentSelf = Math.max(0, input.rentTotal - input.rentCompanyShare);
  const mealSelf = Math.max(0, input.mealTotal - input.mealCompanyShare);

  // ① 通常: 従業員が家賃・育児・食事・EC を手取りから全額支払う。
  //    手元残り = 手取り − (家賃 + 育児 + 食事 + EC) → 目標達成に必要な手取りを逆算。
  const normalLivingCost = input.rentTotal + input.childcare + input.mealTotal + input.ecPoints;
  const normalGross = solveGrossForTakeHome(input.targetFreeCash + normalLivingCost, withCare);
  const normalComp = monthlyCompensation(normalGross, withCare);
  const normal: WelfareScenario = {
    gross: normalComp.gross,
    employeeSocialInsurance: normalComp.employeeSocialInsurance,
    tax: normalComp.incomeTax + normalComp.residentTax,
    payrollDeduction: 0,
    netPaid: normalComp.takeHome,
    freeCash: normalComp.takeHome - normalLivingCost,
    inKindValue: 0,
    employeeRealValue: normalComp.takeHome - normalLivingCost,
    companyTotalCost: normalComp.gross + normalComp.employerSocialInsurance,
  };

  // ② スキーム: 会社が家賃(社宅)・食事・育児・EC を非課税で現物支給し基本給を下げる。
  //    本人天引き = 社宅自己負担 + 食事自己負担。手元残り = 手取り − 天引き。
  const schemeDeduction = rentSelf + mealSelf;
  const schemeGross = solveGrossForTakeHome(input.targetFreeCash + schemeDeduction, withCare);
  const schemeComp = monthlyCompensation(schemeGross, withCare);
  const inKindValue =
    input.rentCompanyShare + input.mealCompanyShare + input.childcare + input.ecPoints;
  const schemeFreeCash = schemeComp.takeHome - schemeDeduction;
  const scheme: WelfareScenario = {
    gross: schemeComp.gross,
    employeeSocialInsurance: schemeComp.employeeSocialInsurance,
    tax: schemeComp.incomeTax + schemeComp.residentTax,
    payrollDeduction: schemeDeduction,
    netPaid: schemeComp.takeHome - schemeDeduction,
    freeCash: schemeFreeCash,
    inKindValue,
    employeeRealValue: schemeFreeCash + inKindValue,
    companyTotalCost: schemeComp.gross + schemeComp.employerSocialInsurance + inKindValue,
  };

  return {
    normal,
    scheme,
    diff: {
      gross: scheme.gross - normal.gross,
      employeeSocialInsurance: scheme.employeeSocialInsurance - normal.employeeSocialInsurance,
      tax: scheme.tax - normal.tax,
      employeeRealValue: scheme.employeeRealValue - normal.employeeRealValue,
      companyTotalCost: scheme.companyTotalCost - normal.companyTotalCost,
    },
  };
}

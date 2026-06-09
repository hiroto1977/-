/**
 * ふるさと納税の控除内訳・ワンストップ特例の計算。
 *
 * **重要 — これは概算試算であり、正確な税額計算・税務助言ではありません。**
 * ふるさと納税 (寄附金税額控除) は、自己負担 2,000 円を除いた寄附額が、所得税
 * (寄附金控除) と住民税 (基本分+特例分) から控除される (国税庁 No.1155 等)。
 *
 * - 確定申告: 所得税から (寄附額−2,000)×所得税率 を控除し、住民税から
 *   基本分+特例分を控除する。
 * - ワンストップ特例: 給与所得者で確定申告が不要、かつ寄附先が 5 自治体以内の
 *   場合に利用可。所得税からの控除を行わず、その相当額を住民税の「申告特例
 *   控除額」として上乗せする。**控除の総額は確定申告と変わらない**。
 *
 * 特例分は住民税所得割額の 20% が上限。上限を超えた分は自己負担になる。
 */

import { RECONSTRUCTION_SURTAX_RATE } from './taxCalc';

function yen(n: number): number {
  return Math.round(n);
}

/** ふるさと納税の自己負担額 (円)。 */
export const FURUSATO_SELF_PAY = 2_000;
/** ワンストップ特例を使える寄附先自治体数の上限。 */
export const FURUSATO_ONE_STOP_MAX_MUNICIPALITIES = 5;

export interface FurusatoOneStopEligibility {
  readonly eligible: boolean;
  readonly reason: string;
}

/**
 * ワンストップ特例の適用可否を判定する。
 *
 * @param municipalityCount 寄附先の自治体数
 * @param filesTaxReturn 確定申告 (または住民税申告) を行うか
 */
export function furusatoOneStopEligibility(
  municipalityCount: number,
  filesTaxReturn: boolean,
): FurusatoOneStopEligibility {
  if (filesTaxReturn) {
    return { eligible: false, reason: '確定申告を行う場合はワンストップ特例を使えません (申告に寄附金控除を含めます)' };
  }
  if (municipalityCount <= 0) {
    return { eligible: false, reason: '寄附先がありません' };
  }
  if (municipalityCount > FURUSATO_ONE_STOP_MAX_MUNICIPALITIES) {
    return { eligible: false, reason: `寄附先が ${FURUSATO_ONE_STOP_MAX_MUNICIPALITIES} 自治体を超えるためワンストップ特例の対象外です (確定申告が必要)` };
  }
  return { eligible: true, reason: 'ワンストップ特例の対象です (給与所得者・確定申告不要・5自治体以内)' };
}

export interface FurusatoBreakdown {
  /** 控除対象額 (= 寄附額 − 自己負担2,000円、負なら0)。 */
  readonly eligibleAmount: number;
  /** 所得税からの控除額 (確定申告のみ。ワンストップでは0)。 */
  readonly incomeTaxDeduction: number;
  /** 住民税の基本分控除。 */
  readonly residentBasic: number;
  /** 住民税の特例分控除 (所得割の20%上限)。 */
  readonly residentSpecial: number;
  /** ワンストップの申告特例控除額 (所得税相当を住民税へ上乗せ。確定申告では0)。 */
  readonly residentOneStopAddon: number;
  /** 住民税からの控除合計。 */
  readonly totalResidentCredit: number;
  /** 控除の総額 (所得税控除 + 住民税控除)。 */
  readonly totalBenefit: number;
  /** 特例分が20%上限で頭打ちになったか (超過分は自己負担)。 */
  readonly cappedBySpecialLimit: boolean;
}

/**
 * ふるさと納税の控除内訳を計算する。
 *
 * @param donation 寄附額 (円)
 * @param residentIncomeLevy 住民税の所得割額 (特例分の20%上限に使う)
 * @param marginalRate 所得税の限界税率 (0..0.45)
 * @param oneStop ワンストップ特例を適用するか (true: 所得税控除分を住民税へ振替)
 */
export function calcFurusatoBreakdown(
  donation: number,
  residentIncomeLevy: number,
  marginalRate: number,
  oneStop: boolean,
): FurusatoBreakdown {
  const empty: FurusatoBreakdown = {
    eligibleAmount: 0,
    incomeTaxDeduction: 0,
    residentBasic: 0,
    residentSpecial: 0,
    residentOneStopAddon: 0,
    totalResidentCredit: 0,
    totalBenefit: 0,
    cappedBySpecialLimit: false,
  };
  // donation===FURUSATO_SELF_PAY では eligibleAmount=0 となり計算経路でも全額0に
  // 畳まれるため、<= を < にする EqualityOperator mutation は equivalent。無効化する。
  // Stryker disable next-line EqualityOperator
  if (donation <= FURUSATO_SELF_PAY) return empty;

  const eligibleAmount = donation - FURUSATO_SELF_PAY;
  // 所得税率に復興特別所得税を上乗せした実効率。
  const surtaxRate = marginalRate * (1 + RECONSTRUCTION_SURTAX_RATE);
  const residentBasic = eligibleAmount * 0.1;
  const specialRaw = eligibleAmount * (0.9 - surtaxRate);
  const specialCap = Math.max(0, residentIncomeLevy * 0.2);
  const residentSpecial = Math.min(Math.max(0, specialRaw), specialCap);
  const cappedBySpecialLimit = specialRaw > specialCap;

  let incomeTaxDeduction = 0;
  let residentOneStopAddon = 0;
  if (oneStop) {
    // 申告特例控除額 = 特例分 × { 所得税率×1.021 / (90% − 所得税率×1.021) }。
    // (上限で頭打ちになった特例分に比例して縮小する)
    const denom = 0.9 - surtaxRate;
    // marginalRate ∈ [0,0.45] では surtaxRate ≤ 0.4595 で denom ≥ 0.44 > 0 が常に成立。
    // ゼロ除算回避の防御分岐で、有効入力では false 側に到達せず denom>0 / >=0 の差も
    // 出ない (equivalent)。ConditionalExpression / EqualityOperator を無効化する。
    // Stryker disable next-line ConditionalExpression,EqualityOperator
    residentOneStopAddon = denom > 0 ? residentSpecial * (surtaxRate / denom) : 0;
  } else {
    // 確定申告: 所得税の寄附金控除による軽減 (寄附額−2,000)×実効率。
    incomeTaxDeduction = eligibleAmount * surtaxRate;
  }

  const totalResidentCredit = yen(residentBasic) + yen(residentSpecial) + yen(residentOneStopAddon);
  return {
    eligibleAmount,
    incomeTaxDeduction: yen(incomeTaxDeduction),
    residentBasic: yen(residentBasic),
    residentSpecial: yen(residentSpecial),
    residentOneStopAddon: yen(residentOneStopAddon),
    totalResidentCredit,
    totalBenefit: yen(incomeTaxDeduction) + totalResidentCredit,
    cappedBySpecialLimit,
  };
}

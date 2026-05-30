/**
 * 所得控除エンジン (令和2年分以降の主要な所得控除)。
 *
 * **重要 — これは概算試算であり、正確な税額計算・税務助言ではありません。**
 * 主要な所得控除 (基礎・配偶者・扶養・社会保険料・生命保険料・地震保険料・
 * 医療費・寄附金・障害者・寡婦/ひとり親・勤労学生) を国税庁の一般的な
 * ルールに基づいて計算しますが、特殊なケース・年度改正・自治体差は完全には
 * 反映しません。確定申告は税理士 / 国税庁の公式ツールで確定してください。
 *
 * 所得税と住民税で控除額が異なるものは両方を返す。
 */

import { calcBasicDeduction, calcResidentBasicDeduction } from './taxCalc';

/** 円未満を四捨五入。 */
function yen(n: number): number {
  return Math.round(n);
}

/** 所得税額 / 住民税額の両方を持つ控除額。 */
export interface DeductionPair {
  /** 所得税の所得控除額 (円)。 */
  readonly incomeTax: number;
  /** 住民税の所得控除額 (円)。 */
  readonly residentTax: number;
}

// --- 配偶者控除 / 配偶者特別控除 -----------------------------------------
//
// 国税庁 No.1191 配偶者控除 / No.1195 配偶者特別控除。
// 控除額は「本人の合計所得金額」と「配偶者の合計所得金額」の両方で決まる。
// 本人の合計所得が 1,000 万円超 (給与のみなら年収 1,195 万円超) は対象外。

/** 本人の合計所得帯による配偶者控除の調整段階 (一般の控除対象配偶者・70歳未満)。 */
function spouseTierBySelfIncome(selfIncome: number): 0 | 1 | 2 | 3 {
  if (selfIncome <= 9_000_000) return 1; // 満額
  if (selfIncome <= 9_500_000) return 2; // 2/3
  if (selfIncome <= 10_000_000) return 3; // 1/3
  return 0; // 対象外
}

/**
 * 配偶者控除 + 配偶者特別控除を計算する。
 * @param selfIncome 本人の合計所得金額
 * @param spouseIncome 配偶者の合計所得金額 (給与なら年収-給与所得控除)
 * @param spouseElderly 配偶者が70歳以上 (老人控除対象配偶者) か
 */
export function calcSpouseDeduction(
  selfIncome: number,
  spouseIncome: number,
  spouseElderly = false,
): DeductionPair {
  const tier = spouseTierBySelfIncome(selfIncome);
  if (tier === 0) return { incomeTax: 0, residentTax: 0 };

  // 配偶者控除 (配偶者の合計所得 48万以下)。
  if (spouseIncome <= 480_000) {
    // 満額: 一般38万 (住民33万) / 老人48万 (住民38万)。
    const baseIncome = spouseElderly ? 480_000 : 380_000;
    const baseResident = spouseElderly ? 380_000 : 330_000;
    const factor = tier === 1 ? 1 : tier === 2 ? 2 / 3 : 1 / 3;
    return { incomeTax: yen(baseIncome * factor), residentTax: yen(baseResident * factor) };
  }

  // 配偶者特別控除 (配偶者の合計所得 48万超〜133万)。満額相当の段階表 (本人所得900万以下)。
  // No.1195 の表を所得帯で近似 (段階の刻みは簡略化)。
  if (spouseIncome > 1_330_000) return { incomeTax: 0, residentTax: 0 };
  let fullIncome: number;
  let fullResident: number;
  if (spouseIncome <= 950_000) {
    fullIncome = 380_000;
    fullResident = 330_000;
  } else if (spouseIncome <= 1_000_000) {
    fullIncome = 360_000;
    fullResident = 330_000;
  } else if (spouseIncome <= 1_050_000) {
    fullIncome = 310_000;
    fullResident = 310_000;
  } else if (spouseIncome <= 1_100_000) {
    fullIncome = 260_000;
    fullResident = 260_000;
  } else if (spouseIncome <= 1_150_000) {
    fullIncome = 210_000;
    fullResident = 210_000;
  } else if (spouseIncome <= 1_200_000) {
    fullIncome = 160_000;
    fullResident = 160_000;
  } else if (spouseIncome <= 1_250_000) {
    fullIncome = 110_000;
    fullResident = 110_000;
  } else if (spouseIncome <= 1_300_000) {
    fullIncome = 60_000;
    fullResident = 60_000;
  } else {
    fullIncome = 30_000;
    fullResident = 30_000;
  }
  const factor = tier === 1 ? 1 : tier === 2 ? 2 / 3 : 1 / 3;
  return { incomeTax: yen(fullIncome * factor), residentTax: yen(fullResident * factor) };
}

// --- 扶養控除 -------------------------------------------------------------
//
// 国税庁 No.1180 扶養控除。年齢区分で控除額が異なる。
// 16歳未満は控除対象外 (児童手当の対象)。

/** 扶養親族の年齢区分。 */
export type DependentKind =
  | 'under16' // 年少 (控除なし)
  | 'general' // 一般 (16-18, 23-69)
  | 'specific' // 特定扶養親族 (19-22)
  | 'elderly-livein' // 老人扶養 同居老親 (70+ 同居)
  | 'elderly'; // 老人扶養 その他 (70+)

/** 扶養親族 1 人分の控除額 (所得税 / 住民税)。 */
export function dependentDeduction(kind: DependentKind): DeductionPair {
  switch (kind) {
    case 'under16':
      return { incomeTax: 0, residentTax: 0 };
    case 'general':
      return { incomeTax: 380_000, residentTax: 330_000 };
    case 'specific':
      return { incomeTax: 630_000, residentTax: 450_000 };
    case 'elderly-livein':
      return { incomeTax: 580_000, residentTax: 450_000 };
    case 'elderly':
      return { incomeTax: 480_000, residentTax: 380_000 };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** 扶養親族の配列から合計の扶養控除額を計算する。 */
export function calcDependentDeduction(kinds: readonly DependentKind[]): DeductionPair {
  return kinds.reduce<DeductionPair>(
    (acc, k) => {
      const d = dependentDeduction(k);
      return { incomeTax: acc.incomeTax + d.incomeTax, residentTax: acc.residentTax + d.residentTax };
    },
    { incomeTax: 0, residentTax: 0 },
  );
}

// --- 生命保険料控除 (新制度 / 旧制度) -----------------------------------
//
// 国税庁 No.1140。
//   新制度 (平成24年1月1日以降の契約): 一般 / 介護医療 / 個人年金 の3区分。
//     各区分 所得税上限4万・住民税上限2.8万、3区分合計の上限は所得税12万・住民税7万。
//   旧制度 (平成23年12月31日以前の契約): 一般 / 個人年金 の2区分 (介護医療なし)。
//     各区分 所得税上限5万・住民税上限3.5万、合計上限は所得税10万・住民税7万。
//   新旧の両方がある区分は、(新のみ / 旧のみ / 新+旧で4万・2.8万上限) の最大を採る。

/** 新制度・生命保険料控除 1 区分の控除額を計算する。 */
function lifeInsuranceNew(premium: number): DeductionPair {
  if (premium <= 0) return { incomeTax: 0, residentTax: 0 };
  // 所得税 (新制度): 〜2万=全額, 〜4万=÷2+1万, 〜8万=÷4+2万, 8万超=4万。
  let it: number;
  if (premium <= 20_000) it = premium;
  else if (premium <= 40_000) it = yen(premium / 2 + 10_000);
  else if (premium <= 80_000) it = yen(premium / 4 + 20_000);
  else it = 40_000;
  // 住民税 (新制度): 〜1.2万=全額, 〜3.2万=÷2+0.6万, 〜5.6万=÷4+1.4万, 超=2.8万。
  let rt: number;
  if (premium <= 12_000) rt = premium;
  else if (premium <= 32_000) rt = yen(premium / 2 + 6_000);
  else if (premium <= 56_000) rt = yen(premium / 4 + 14_000);
  else rt = 28_000;
  return { incomeTax: it, residentTax: rt };
}

/** 旧制度・生命保険料控除 1 区分の控除額を計算する。 */
function lifeInsuranceOld(premium: number): DeductionPair {
  if (premium <= 0) return { incomeTax: 0, residentTax: 0 };
  // 所得税 (旧制度): 〜2.5万=全額, 〜5万=÷2+1.25万, 〜10万=÷4+2.5万, 10万超=5万。
  let it: number;
  if (premium <= 25_000) it = premium;
  else if (premium <= 50_000) it = yen(premium / 2 + 12_500);
  else if (premium <= 100_000) it = yen(premium / 4 + 25_000);
  else it = 50_000;
  // 住民税 (旧制度): 〜1.5万=全額, 〜4万=÷2+0.75万, 〜7万=÷4+1.75万, 超=3.5万。
  let rt: number;
  if (premium <= 15_000) rt = premium;
  else if (premium <= 40_000) rt = yen(premium / 2 + 7_500);
  else if (premium <= 70_000) rt = yen(premium / 4 + 17_500);
  else rt = 35_000;
  return { incomeTax: it, residentTax: rt };
}

/** 1 区分について、新・旧の保険料から最も有利な控除額を選ぶ。
 *  新+旧の併用は所得税4万・住民税2.8万を上限とする (新制度上限)。 */
function lifeInsuranceCategory(newPremium: number, oldPremium: number): DeductionPair {
  const onlyNew = lifeInsuranceNew(newPremium);
  const onlyOld = lifeInsuranceOld(oldPremium);
  const combined: DeductionPair = {
    incomeTax: Math.min(40_000, onlyNew.incomeTax + onlyOld.incomeTax),
    residentTax: Math.min(28_000, onlyNew.residentTax + onlyOld.residentTax),
  };
  return {
    incomeTax: Math.max(onlyNew.incomeTax, onlyOld.incomeTax, combined.incomeTax),
    residentTax: Math.max(onlyNew.residentTax, onlyOld.residentTax, combined.residentTax),
  };
}

export interface LifeInsurancePremiums {
  /** 一般生命保険料 (新制度・年額)。 */
  readonly general: number;
  /** 介護医療保険料 (新制度のみ・年額)。 */
  readonly medical: number;
  /** 個人年金保険料 (新制度・年額)。 */
  readonly pension: number;
  /** 一般生命保険料 (旧制度・年額)。任意。 */
  readonly generalOld?: number;
  /** 個人年金保険料 (旧制度・年額)。任意。 */
  readonly pensionOld?: number;
}

/** 3 区分の生命保険料から合計控除額 (上限適用) を計算する。新旧併用に対応。 */
export function calcLifeInsuranceDeduction(p: LifeInsurancePremiums): DeductionPair {
  const g = lifeInsuranceCategory(p.general, p.generalOld ?? 0);
  const m = lifeInsuranceCategory(p.medical, 0); // 介護医療は新制度のみ
  const n = lifeInsuranceCategory(p.pension, p.pensionOld ?? 0);
  const incomeTax = Math.min(120_000, g.incomeTax + m.incomeTax + n.incomeTax);
  const residentTax = Math.min(70_000, g.residentTax + m.residentTax + n.residentTax);
  return { incomeTax, residentTax };
}

// --- 地震保険料控除 -------------------------------------------------------
//
// 国税庁 No.1145。所得税は支払額 (上限5万)、住民税は1/2 (上限2.5万)。

/** 地震保険料から控除額を計算する。 */
export function calcEarthquakeInsuranceDeduction(premium: number): DeductionPair {
  if (premium <= 0) return { incomeTax: 0, residentTax: 0 };
  return {
    incomeTax: Math.min(50_000, yen(premium)),
    residentTax: Math.min(25_000, yen(premium / 2)),
  };
}

// --- 医療費控除 -----------------------------------------------------------
//
// 国税庁 No.1120。(支払医療費 - 保険等で補填された額) - min(合計所得×5%, 10万)。
// 上限 200 万。所得税・住民税で同額。

/** 医療費控除を計算する。 */
export function calcMedicalDeduction(
  paidMedical: number,
  reimbursed: number,
  totalIncome: number,
): DeductionPair {
  const net = paidMedical - reimbursed;
  if (net <= 0) return { incomeTax: 0, residentTax: 0 };
  const threshold = Math.min(yen(totalIncome * 0.05), 100_000);
  const deduction = Math.min(2_000_000, Math.max(0, net - threshold));
  return { incomeTax: deduction, residentTax: deduction };
}

/** セルフメディケーション税制の足切り (円)。 */
export const SELF_MEDICATION_THRESHOLD = 12_000;
/** セルフメディケーション税制の控除上限 (円)。 */
export const SELF_MEDICATION_CAP = 88_000;

/**
 * セルフメディケーション税制 (特定一般用医薬品等購入費の特例) を計算する。
 *
 * スイッチOTC医薬品等の年間購入額から 12,000 円を引いた額 (上限 88,000 円) が
 * 控除される (国税庁 No.1129)。通常の医療費控除とは選択制 (どちらか一方のみ)。
 * 適格医薬品の判定は利用者が行う前提で、本関数は購入額のみを受け取る。
 *
 * @param switchOtcPaid スイッチOTC等の年間購入額 (円)
 */
export function calcSelfMedicationDeduction(switchOtcPaid: number): DeductionPair {
  const paid = Math.max(0, switchOtcPaid);
  const deduction = Math.min(SELF_MEDICATION_CAP, Math.max(0, paid - SELF_MEDICATION_THRESHOLD));
  return { incomeTax: deduction, residentTax: deduction };
}

/**
 * 通常の医療費控除とセルフメディケーション税制の有利な方を選ぶ (選択制)。
 * 両者は所得税・住民税で同額のため単純な最大値比較で足りる。
 */
export function chooseMedicalDeductionScheme(
  standard: DeductionPair,
  selfMedication: DeductionPair,
): DeductionPair {
  return {
    incomeTax: Math.max(standard.incomeTax, selfMedication.incomeTax),
    residentTax: Math.max(standard.residentTax, selfMedication.residentTax),
  };
}

// --- 寄附金控除 (ふるさと納税ベースの所得税分) ---------------------------
//
// 国税庁 No.1150。所得税は (寄附額 - 2,000) を所得控除 (上限 合計所得×40%)。
// ※住民税の寄附金「税額控除」は別 (基本分+特例分)。ここでは所得税の所得控除のみ
//   を返し、住民税側は 0 とする (住民税は税額控除のため別関数 calcFurusatoResidentCredit)。

/** ふるさと納税等の寄附金控除 (所得税の所得控除分)。 */
export function calcDonationDeduction(donation: number, totalIncome: number): DeductionPair {
  if (donation <= 2_000) return { incomeTax: 0, residentTax: 0 };
  const cap = yen(totalIncome * 0.4);
  const deduction = Math.min(cap, donation - 2_000);
  return { incomeTax: Math.max(0, deduction), residentTax: 0 };
}

// --- 障害者控除 / 寡婦・ひとり親 / 勤労学生 ------------------------------

/** 障害者控除 (本人/配偶者/扶養 1 人分)。種別で額が異なる。 */
export type DisabilityKind = 'ordinary' | 'special' | 'special-livein';

/** 障害者控除 1 人分。 */
export function disabilityDeduction(kind: DisabilityKind): DeductionPair {
  switch (kind) {
    case 'ordinary':
      return { incomeTax: 270_000, residentTax: 260_000 };
    case 'special':
      return { incomeTax: 400_000, residentTax: 300_000 };
    case 'special-livein':
      return { incomeTax: 750_000, residentTax: 530_000 };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** ひとり親控除 (所得税35万 / 住民税30万)。 */
export const SINGLE_PARENT_DEDUCTION: DeductionPair = { incomeTax: 350_000, residentTax: 300_000 };
/** 寡婦控除 (所得税27万 / 住民税26万)。 */
export const WIDOW_DEDUCTION: DeductionPair = { incomeTax: 270_000, residentTax: 260_000 };
/** 勤労学生控除 (所得税27万 / 住民税26万)。 */
export const WORKING_STUDENT_DEDUCTION: DeductionPair = { incomeTax: 270_000, residentTax: 260_000 };

// --- 控除の集計 -----------------------------------------------------------

/** 所得控除の入力 (すべて任意・該当しなければ未指定/0)。 */
export interface DeductionInput {
  /** 合計所得金額 (給与所得控除後など、控除前の所得)。 */
  readonly totalIncome: number;
  /** 支払った社会保険料の実額 (年)。未指定なら 0。 */
  readonly socialInsurancePaid?: number;
  /** 小規模企業共済等掛金 (iDeCo 含む、年)。全額控除。 */
  readonly smallBizMutualAid?: number;
  /** 配偶者の合計所得金額 (配偶者控除/特別控除の判定用)。配偶者なしは undefined。 */
  readonly spouseIncome?: number;
  /** 配偶者が70歳以上か。 */
  readonly spouseElderly?: boolean;
  /** 扶養親族の年齢区分の配列。 */
  readonly dependents?: readonly DependentKind[];
  /** 生命保険料 (3区分)。 */
  readonly lifeInsurance?: LifeInsurancePremiums;
  /** 地震保険料 (年)。 */
  readonly earthquakeInsurance?: number;
  /** 医療費 (支払 / 補填)。 */
  readonly medical?: { readonly paid: number; readonly reimbursed: number };
  /** セルフメディケーション税制のスイッチOTC等購入額 (年)。医療費控除と選択制で、
   *  指定すると有利な方が自動採用される。 */
  readonly selfMedicationPaid?: number;
  /** ふるさと納税等の寄附額 (年)。 */
  readonly donation?: number;
  /** 障害者控除 (本人/家族の種別配列)。 */
  readonly disabilities?: readonly DisabilityKind[];
  /** ひとり親控除に該当するか。 */
  readonly singleParent?: boolean;
  /** 寡婦控除に該当するか (ひとり親と排他)。 */
  readonly widow?: boolean;
  /** 勤労学生控除に該当するか。 */
  readonly workingStudent?: boolean;
}

/** 控除内訳 (項目別)。 */
export interface DeductionBreakdown {
  readonly basic: DeductionPair;
  readonly socialInsurance: DeductionPair;
  readonly smallBizMutualAid: DeductionPair;
  readonly spouse: DeductionPair;
  readonly dependents: DeductionPair;
  readonly lifeInsurance: DeductionPair;
  readonly earthquakeInsurance: DeductionPair;
  readonly medical: DeductionPair;
  readonly donation: DeductionPair;
  readonly disability: DeductionPair;
  readonly singleParentOrWidow: DeductionPair;
  readonly workingStudent: DeductionPair;
  /** 合計。 */
  readonly total: DeductionPair;
  /** 人的控除額の差の合計 (所得税ベース − 住民税ベース)。住民税の調整控除に使う。
   *  人的控除 = 基礎・配偶者・扶養・障害者・寡婦/ひとり親・勤労学生 (物的控除は除く)。 */
  readonly humanDeductionDiff: number;
}

function addPair(a: DeductionPair, b: DeductionPair): DeductionPair {
  return { incomeTax: a.incomeTax + b.incomeTax, residentTax: a.residentTax + b.residentTax };
}

const ZERO: DeductionPair = { incomeTax: 0, residentTax: 0 };

/**
 * すべての所得控除を集計し、項目別内訳と合計を返す。
 *
 * 社会保険料控除は実額があればそれを、なければ 0 とする (calcNetSalary 側で
 * 概算社保を使う場合はそちらと二重計上しないよう注意)。
 */
export function calcAllDeductions(input: DeductionInput): DeductionBreakdown {
  const basic: DeductionPair = {
    incomeTax: calcBasicDeduction(input.totalIncome),
    residentTax: calcResidentBasicDeduction(input.totalIncome),
  };
  const social = input.socialInsurancePaid && input.socialInsurancePaid > 0
    ? { incomeTax: yen(input.socialInsurancePaid), residentTax: yen(input.socialInsurancePaid) }
    : ZERO;
  const smallBiz = input.smallBizMutualAid && input.smallBizMutualAid > 0
    ? { incomeTax: yen(input.smallBizMutualAid), residentTax: yen(input.smallBizMutualAid) }
    : ZERO;
  const spouse = input.spouseIncome !== undefined
    ? calcSpouseDeduction(input.totalIncome, input.spouseIncome, input.spouseElderly ?? false)
    : ZERO;
  const dependents = input.dependents ? calcDependentDeduction(input.dependents) : ZERO;
  const lifeIns = input.lifeInsurance ? calcLifeInsuranceDeduction(input.lifeInsurance) : ZERO;
  const quake = input.earthquakeInsurance ? calcEarthquakeInsuranceDeduction(input.earthquakeInsurance) : ZERO;
  const standardMedical = input.medical
    ? calcMedicalDeduction(input.medical.paid, input.medical.reimbursed, input.totalIncome)
    : ZERO;
  const selfMedication = input.selfMedicationPaid
    ? calcSelfMedicationDeduction(input.selfMedicationPaid)
    : ZERO;
  // 通常の医療費控除とセルフメディケーション税制は選択制。有利な方を採用する。
  const medical = chooseMedicalDeductionScheme(standardMedical, selfMedication);
  const donation = input.donation ? calcDonationDeduction(input.donation, input.totalIncome) : ZERO;
  const disability = input.disabilities
    ? input.disabilities.reduce<DeductionPair>((acc, d) => addPair(acc, disabilityDeduction(d)), ZERO)
    : ZERO;
  // ひとり親と寡婦は排他 (ひとり親を優先)。
  const singleParentOrWidow = input.singleParent
    ? SINGLE_PARENT_DEDUCTION
    : input.widow
      ? WIDOW_DEDUCTION
      : ZERO;
  const workingStudent = input.workingStudent ? WORKING_STUDENT_DEDUCTION : ZERO;

  const parts = [
    basic, social, smallBiz, spouse, dependents, lifeIns, quake, medical, donation,
    disability, singleParentOrWidow, workingStudent,
  ];
  const total = parts.reduce(addPair, ZERO);

  // 人的控除のみの (所得税 − 住民税) 差を合計 (調整控除の算定基礎)。
  // 物的控除 (社保・生命保険・地震保険・医療費・寄附金) は対象外。
  const humanParts = [basic, spouse, dependents, disability, singleParentOrWidow, workingStudent];
  const humanDeductionDiff = humanParts.reduce((s, p) => s + (p.incomeTax - p.residentTax), 0);

  return {
    basic,
    socialInsurance: social,
    smallBizMutualAid: smallBiz,
    spouse,
    dependents,
    lifeInsurance: lifeIns,
    earthquakeInsurance: quake,
    medical,
    donation,
    disability,
    singleParentOrWidow,
    workingStudent,
    total,
    humanDeductionDiff,
  };
}

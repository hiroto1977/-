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
    // Stryker disable all — exhaustive switch の防御コード (到達不能)。
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
    // Stryker restore all
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

/** 扶養親族の合計所得金額の上限 (これを超えると扶養控除の対象外)。 */
export const DEPENDENT_INCOME_LIMIT = 480_000;

/** 種別と所得を持つ扶養親族。 */
export interface DependentWithIncome {
  readonly kind: DependentKind;
  /** 扶養親族本人の合計所得金額 (円)。48万円超で控除対象外。 */
  readonly income: number;
}

/**
 * 扶養親族の合計所得金額を考慮して扶養控除を計算する。
 *
 * 扶養親族は「合計所得金額が 48 万円以下」が要件 (国税庁 No.1180)。所得が
 * 48 万円を超える親族は扶養控除の対象外として控除しない。
 */
export function calcDependentDeductionWithIncome(
  dependents: readonly DependentWithIncome[],
): DeductionPair {
  return dependents.reduce<DeductionPair>(
    (acc, dep) => {
      // 所得が上限超なら扶養控除の対象外。
      if (dep.income > DEPENDENT_INCOME_LIMIT) return acc;
      const d = dependentDeduction(dep.kind);
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
  // Stryker disable EqualityOperator: 各ブラケット境界は連続で <= と < が同値 (等価変異)。
  // Stryker disable next-line ConditionalExpression: premium<=0 の早期returnは計算経路でも {0,0} で同値。
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
  // Stryker restore EqualityOperator
  return { incomeTax: it, residentTax: rt };
}

/** 旧制度・生命保険料控除 1 区分の控除額を計算する。 */
function lifeInsuranceOld(premium: number): DeductionPair {
  // Stryker disable EqualityOperator: 各ブラケット境界は連続で <= と < が同値 (等価変異)。
  // Stryker disable next-line ConditionalExpression: premium<=0 の早期returnは計算経路でも {0,0} で同値。
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
  // Stryker restore EqualityOperator
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
  // Stryker disable next-line EqualityOperator,ConditionalExpression: premium<=0 早期returnは計算経路でも{0,0}で同値。
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
  // Stryker disable next-line EqualityOperator,ConditionalExpression: net<=0 早期returnは計算経路でも{0,0}で同値。
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

// --- 小規模企業共済等掛金控除 (iDeCo・小規模企業共済) ---------------------

/** iDeCo の職業区分。拠出限度額が異なる。 */
export type IdecoOccupation =
  | 'self-employed' // 自営業 (第1号被保険者)
  | 'employee-no-pension' // 会社員 (企業年金なし)
  | 'employee-with-dc' // 会社員 (企業型DC加入)
  | 'civil-servant' // 公務員
  | 'dependent-spouse'; // 第3号被保険者

/** iDeCo の職業区分別の年間拠出限度額 (円)。 */
export const IDECO_ANNUAL_CAPS: Record<IdecoOccupation, number> = {
  'self-employed': 816_000, // 月6.8万
  'employee-no-pension': 276_000, // 月2.3万
  'employee-with-dc': 240_000, // 月2.0万
  'civil-servant': 144_000, // 月1.2万
  'dependent-spouse': 276_000, // 月2.3万
};

/** 小規模企業共済の年間拠出限度額 (月7万 × 12, 円)。 */
export const SMALL_BIZ_MUTUAL_ANNUAL_CAP = 840_000;

/** iDeCo 拠出額を職業区分別の年間上限でクランプする (負値は0)。 */
export function clampIdecoContribution(amount: number, occupation: IdecoOccupation): number {
  return Math.min(Math.max(0, amount), IDECO_ANNUAL_CAPS[occupation]);
}

/** 小規模企業共済掛金を年間上限 (84万) でクランプする (負値は0)。 */
export function clampSmallBizMutualAid(amount: number): number {
  return Math.min(Math.max(0, amount), SMALL_BIZ_MUTUAL_ANNUAL_CAP);
}

// --- 寄附金控除 (ふるさと納税ベースの所得税分) ---------------------------
//
// 国税庁 No.1150。所得税は (寄附額 - 2,000) を所得控除 (上限 合計所得×40%)。
// ※住民税の寄附金「税額控除」は別 (基本分+特例分)。ここでは所得税の所得控除のみ
//   を返し、住民税側は 0 とする (住民税は税額控除のため別関数 calcFurusatoResidentCredit)。

/** ふるさと納税等の寄附金控除 (所得税の所得控除分)。 */
export function calcDonationDeduction(donation: number, totalIncome: number): DeductionPair {
  // Stryker disable next-line EqualityOperator,ConditionalExpression: 2,000円境界は連続(控除0)で <= と < が同値。
  if (donation <= 2_000) return { incomeTax: 0, residentTax: 0 };
  const cap = yen(totalIncome * 0.4);
  const deduction = Math.min(cap, donation - 2_000);
  return { incomeTax: Math.max(0, deduction), residentTax: 0 };
}

// --- 一般寄附金控除 (所得控除) -------------------------------------------
//
// 国税庁 No.1150。一般の特定寄附金 (ふるさと納税以外の認定NPO・公益法人・政党等) も
// 所得控除の算式は同じ: (寄附額 − 2,000) を所得控除、上限は「合計所得金額の40%」。
// ふるさと納税と本質的に同じ算式だが、用途を明示するための別名。住民税側は税額控除
// (自治体により対象が異なる) のためここでは 0 とする。

/** 寄附金控除 (所得控除) の足切り (円)。 */
export const DONATION_DEDUCTION_FLOOR = 2_000;
/** 寄附金控除 (所得控除) の上限 = 合計所得金額に対する割合。 */
export const DONATION_INCOME_CAP_RATE = 0.4;

/**
 * 一般寄附金 (ふるさと納税以外の特定寄附金) の所得控除を計算する。
 * 算式はふるさと納税と同じ (寄附額 − 2,000, 上限 合計所得×40%)。
 * 非有限・負の総所得は上限0として安全側に倒す。
 */
export function calcGeneralDonationDeduction(donation: number, totalIncome: number): DeductionPair {
  // Stryker disable next-line EqualityOperator,ConditionalExpression: 2,000円境界は連続(控除0)で <= と < が同値。
  if (donation <= DONATION_DEDUCTION_FLOOR) return { incomeTax: 0, residentTax: 0 };
  // 非有限/負の所得は上限0扱い (Math.max でガード)。
  const safeIncome = Number.isFinite(totalIncome) ? Math.max(0, totalIncome) : 0;
  const cap = yen(safeIncome * DONATION_INCOME_CAP_RATE);
  const deduction = Math.min(cap, donation - DONATION_DEDUCTION_FLOOR);
  return { incomeTax: Math.max(0, deduction), residentTax: 0 };
}

// --- 寄附金特別控除 (税額控除) と所得控除の有利選択 -----------------------
//
// 国税庁 No.1260 (政党等) / No.1263 (認定NPO法人等) / No.1266 (公益社団法人等)。
// 政党・認定NPO・一定の公益法人等への寄附は「所得控除」と「税額控除 (寄附金特別控除)」
// のいずれか有利な方を選択できる。税額控除は (寄附額 − 2,000) × 40%。
// 税額控除の対象寄附額は「合計所得金額の40%」が上限 (所得控除と共通)。
// その年の所得税額の25%等の上限は呼び出し側で `incomeTaxCap` として渡す前提。

/** 寄附金特別控除 (税額控除) の率 (政党/認定NPO/公益社団いずれも40%)。 */
export const DONATION_TAX_CREDIT_RATE = 0.4;

/**
 * 寄附金特別控除 (税額控除) の額を計算する。
 *
 * (対象寄附額 − 2,000) × 40%。対象寄附額は合計所得金額の40%が上限。
 * `incomeTaxCap` を渡すと「その年の所得税額の25%」等の上限も適用する。
 *
 * @param donation 政党等/認定NPO等への寄附額 (円)
 * @param totalIncome 合計所得金額 (円)
 * @param incomeTaxCap 税額控除の絶対上限 (所得税額×25% 等)。未指定なら無制限。
 */
export function calcDonationTaxCredit(
  donation: number,
  totalIncome: number,
  incomeTaxCap?: number,
): number {
  // Stryker disable next-line EqualityOperator,ConditionalExpression: 2,000円境界は連続(控除0)で <= と < が同値。
  if (donation <= DONATION_DEDUCTION_FLOOR) return 0;
  const safeIncome = Number.isFinite(totalIncome) ? Math.max(0, totalIncome) : 0;
  const eligible = Math.min(donation, safeIncome * DONATION_INCOME_CAP_RATE);
  const base = Math.max(0, eligible - DONATION_DEDUCTION_FLOOR);
  let credit = yen(base * DONATION_TAX_CREDIT_RATE);
  if (incomeTaxCap !== undefined && Number.isFinite(incomeTaxCap)) {
    credit = Math.min(credit, Math.max(0, yen(incomeTaxCap)));
  }
  return credit;
}

/** 寄附金: 所得控除 と 税額控除 のどちらが有利かの比較結果。 */
export interface DonationChoice {
  /** 有利な方式 ('deduction' = 所得控除 / 'credit' = 税額控除)。 */
  readonly method: 'deduction' | 'credit';
  /** 所得控除を選んだ場合の所得控除額 (所得税の課税所得から差し引く額)。 */
  readonly deduction: number;
  /** 税額控除を選んだ場合の税額控除額 (所得税額から直接差し引く額)。 */
  readonly credit: number;
  /** 有利方式の「実際の所得税の減少額」概算 (比較に用いた値)。 */
  readonly taxSaving: number;
}

/**
 * 寄附金特別控除 (税額控除) と寄附金控除 (所得控除) の有利な方を選ぶ。
 *
 * 所得控除の節税効果は (控除額 × 限界税率)、税額控除はそのまま税額から引かれる。
 * 限界税率 `marginalRate` (0〜1) を用いて両者の所得税減少額を比較し、大きい方を選ぶ。
 * 同額なら税額控除を優先 (一般に高所得でない限り税額控除が有利なため)。
 *
 * @param donation 寄附額 (円)
 * @param totalIncome 合計所得金額 (円)
 * @param marginalRate 所得税の限界税率 (0〜1)。所得控除の節税効果換算に使う。
 * @param incomeTaxCap 税額控除の絶対上限 (所得税額×25% 等)。未指定なら無制限。
 */
export function chooseDonationCreditOrDeduction(
  donation: number,
  totalIncome: number,
  marginalRate: number,
  incomeTaxCap?: number,
): DonationChoice {
  const deduction = calcGeneralDonationDeduction(donation, totalIncome).incomeTax;
  const credit = calcDonationTaxCredit(donation, totalIncome, incomeTaxCap);
  // 限界税率は 0〜1 にクランプ (非有限は0)。
  const rate = Number.isFinite(marginalRate) ? Math.min(1, Math.max(0, marginalRate)) : 0;
  const deductionSaving = yen(deduction * rate);
  // 税額控除が所得控除の節税効果以上なら税額控除を選ぶ (同額時も税額控除優先)。
  if (credit >= deductionSaving) {
    return { method: 'credit', deduction, credit, taxSaving: credit };
  }
  return { method: 'deduction', deduction, credit, taxSaving: deductionSaving };
}

// --- 雑損控除 -------------------------------------------------------------
//
// 国税庁 No.1110。災害・盗難・横領による損失。次の2つの大きい方:
//   (1) (差引損失額) − 総所得金額等 × 10%
//   (2) (差引損失額のうち災害関連支出の金額) − 5万円
// 差引損失額 = 損害金額 + 災害関連支出 − 保険金等で補填される額。
// 所得税・住民税で同額。3年間の繰越も可能だが本関数は単年分のみ。

/** 雑損控除の災害関連支出の足切り (円)。 */
export const CASUALTY_DISASTER_FLOOR = 50_000;
/** 雑損控除の総所得に対する足切り率。 */
export const CASUALTY_INCOME_RATE = 0.1;

/** 雑損控除の入力。 */
export interface CasualtyLossInput {
  /** 損害金額 (時価ベース, 円)。 */
  readonly lossAmount: number;
  /** 災害関連支出 (取り壊し・原状回復等, 円)。任意。 */
  readonly disasterRelatedSpending?: number;
  /** 保険金・損害賠償金等で補填される額 (円)。任意。 */
  readonly reimbursed?: number;
  /** 総所得金額等 (円)。10%足切りの算定基礎。 */
  readonly totalIncome: number;
}

/**
 * 雑損控除を計算する (国税庁 No.1110)。
 *
 * 差引損失額 = max(0, 損害金額 + 災害関連支出 − 補填額) とし、
 *   方式(1) = 差引損失額 − 総所得×10%
 *   方式(2) = (差引損失額のうち災害関連支出) − 5万円
 * の大きい方 (いずれも下限0) を控除額とする。所得税・住民税で同額。
 * 非有限・負の入力はガードして安全側に倒す。
 */
export function calcCasualtyLossDeduction(input: CasualtyLossInput): DeductionPair {
  const loss = Number.isFinite(input.lossAmount) ? Math.max(0, input.lossAmount) : 0;
  const disaster = Number.isFinite(input.disasterRelatedSpending ?? 0)
    ? Math.max(0, input.disasterRelatedSpending ?? 0)
    : 0;
  const reimbursed = Number.isFinite(input.reimbursed ?? 0) ? Math.max(0, input.reimbursed ?? 0) : 0;
  const income = Number.isFinite(input.totalIncome) ? Math.max(0, input.totalIncome) : 0;

  // 差引損失額 (補填額控除後, 下限0)。
  const netLoss = Math.max(0, loss + disaster - reimbursed);
  // Stryker disable next-line EqualityOperator,ConditionalExpression: netLoss<=0 早期returnは計算経路でも{0,0}で同値。
  if (netLoss <= 0) return { incomeTax: 0, residentTax: 0 };

  // 方式(1): 差引損失額 − 総所得×10%。
  const byIncome = netLoss - yen(income * CASUALTY_INCOME_RATE);
  // 方式(2): 差引損失額のうち災害関連支出 − 5万円。
  //   補填後に災害関連支出が残る上限として min(災害関連支出, 差引損失額) を採る。
  const disasterPortion = Math.min(disaster, netLoss);
  const byDisaster = disasterPortion - CASUALTY_DISASTER_FLOOR;

  const deduction = Math.max(0, byIncome, byDisaster);
  return { incomeTax: deduction, residentTax: deduction };
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
    // Stryker disable all — exhaustive switch の防御コード (到達不能)。
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
    // Stryker restore all
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
  /** 小規模企業共済掛金 (年)。年84万を上限にクランプ。 */
  readonly smallBizMutualAid?: number;
  /** iDeCo の拠出額 (年)。`idecoOccupation` 指定時は職業区分別上限でクランプ。 */
  readonly idecoContribution?: number;
  /** iDeCo の職業区分。指定すると拠出上限を判定する。 */
  readonly idecoOccupation?: IdecoOccupation;
  /** 配偶者の合計所得金額 (配偶者控除/特別控除の判定用)。配偶者なしは undefined。 */
  readonly spouseIncome?: number;
  /** 配偶者が70歳以上か。 */
  readonly spouseElderly?: boolean;
  /** 扶養親族の年齢区分の配列 (所得チェックなし)。 */
  readonly dependents?: readonly DependentKind[];
  /** 種別と所得を持つ扶養親族 (合計所得48万円超を除外)。指定時は `dependents` より優先。 */
  readonly dependentsWithIncome?: readonly DependentWithIncome[];
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
  /** 雑損控除の入力 (災害・盗難・横領による損失)。指定時のみ計上。 */
  readonly casualtyLoss?: Omit<CasualtyLossInput, 'totalIncome'>;
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
  readonly casualtyLoss: DeductionPair;
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
  // 小規模企業共済 (年84万上限) + iDeCo (職業区分別上限) の合算。
  const smallBizCapped = clampSmallBizMutualAid(input.smallBizMutualAid ?? 0);
  const idecoRaw = input.idecoContribution ?? 0;
  const idecoCapped = input.idecoOccupation
    ? clampIdecoContribution(idecoRaw, input.idecoOccupation)
    : Math.max(0, idecoRaw);
  const smallBizTotal = smallBizCapped + idecoCapped;
  const smallBiz = smallBizTotal > 0
    ? { incomeTax: yen(smallBizTotal), residentTax: yen(smallBizTotal) }
    : ZERO;
  const spouse = input.spouseIncome !== undefined
    ? calcSpouseDeduction(input.totalIncome, input.spouseIncome, input.spouseElderly ?? false)
    : ZERO;
  // 所得付きの扶養親族が指定されていれば所得チェック付きで計算 (48万円超を除外)。
  const dependents = input.dependentsWithIncome
    ? calcDependentDeductionWithIncome(input.dependentsWithIncome)
    : input.dependents
      ? calcDependentDeduction(input.dependents)
      : ZERO;
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
  const casualtyLoss = input.casualtyLoss
    ? calcCasualtyLossDeduction({ ...input.casualtyLoss, totalIncome: input.totalIncome })
    : ZERO;
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
    casualtyLoss, disability, singleParentOrWidow, workingStudent,
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
    casualtyLoss,
    disability,
    singleParentOrWidow,
    workingStudent,
    total,
    humanDeductionDiff,
  };
}

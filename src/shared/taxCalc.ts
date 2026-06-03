/**
 * 税務試算の純粋関数。
 *
 * **重要 — これは概算試算であり、正確な税額計算・税務助言ではありません。**
 * 日本の税制を単純化したシミュレーションで、各種控除・特例・地域差・年度改正を
 * 完全には反映しません。実際の申告・納税は税理士へ相談し、国税庁 / e-Tax /
 * 会計ソフトの公式ツールで確定してください (TaxPage がリンクを提供)。
 *
 * UI から切り離して単体テスト可能にするため、計算はすべてここに集約する。
 */

/** 円未満を四捨五入。 */
function yen(n: number): number {
  return Math.round(n);
}

/**
 * 課税される所得金額の 1,000 円未満を切り捨てる (国税庁の所得税額計算の前処理)。
 * 速算表は「1,000 円未満切捨て後の課税所得」に税率を適用する前提のため、
 * `calcBaseIncomeTax` でこの端数処理を行う。負値・端数なしはそのまま 0 / 据置。
 * 例: 1,999,999 → 1,999,000 / 2,000,000 → 2,000,000。
 */
export function floorTaxableThousand(taxableIncome: number): number {
  // Stryker disable next-line EqualityOperator: 0 で <= と < は同値 (floor(0)=0)。
  if (taxableIncome <= 0) return 0;
  return Math.floor(taxableIncome / 1_000) * 1_000;
}

// --- 所得税 (速算表ベース、2024 年度) -----------------------------------

/** 所得税の速算表ブラケット (課税所得の上限・税率・控除額)。 */
interface TaxBracket {
  readonly upTo: number; // この金額以下に適用 (Infinity = 上限なし)
  readonly rate: number; // 税率 (0..1)
  readonly deduction: number; // 速算控除額 (円)
}

// Stryker disable next-line all
const INCOME_TAX_BRACKETS: readonly TaxBracket[] = [
  { upTo: 1_950_000, rate: 0.05, deduction: 0 },
  { upTo: 3_300_000, rate: 0.1, deduction: 97_500 },
  { upTo: 6_950_000, rate: 0.2, deduction: 427_500 },
  { upTo: 9_000_000, rate: 0.23, deduction: 636_000 },
  { upTo: 18_000_000, rate: 0.33, deduction: 1_536_000 },
  { upTo: 40_000_000, rate: 0.4, deduction: 2_796_000 },
  { upTo: Infinity, rate: 0.45, deduction: 4_796_000 },
];

/** 復興特別所得税の付加率 (基準所得税額 × 2.1%)。 */
export const RECONSTRUCTION_SURTAX_RATE = 0.021;

/**
 * 課税所得から所得税額 (復興特別所得税込み) を概算する。
 * 負の課税所得は 0 とみなす。
 */
export function calcIncomeTax(taxableIncome: number): number {
  return yen(calcBaseIncomeTax(taxableIncome) * (1 + RECONSTRUCTION_SURTAX_RATE));
}

/**
 * 課税所得から「基準所得税額」(復興特別所得税を乗じる前の算出税額) を計算する。
 *
 * 税額控除 (住宅ローン控除・配当控除等) は復興特別所得税の計算より **前** に
 * この基準所得税額から差し引く (確定申告書 B の (41)〜(44) の流れ)。その後に
 * 残額へ 2.1% を乗じるのが正しい順序。`calcFinalIncomeTax` を参照。
 *
 * 課税される所得金額は速算表の適用前に **1,000 円未満を切り捨てる**
 * (`floorTaxableThousand`)。国税庁の所得税額の計算手順に準拠。
 */
export function calcBaseIncomeTax(taxableIncome: number): number {
  // Stryker disable next-line ConditionalExpression,EqualityOperator: 0 で速算表は 0 を返すため早期returnと同値。
  if (taxableIncome <= 0) return 0;
  // 課税される所得金額の 1,000 円未満を切り捨ててから速算表を適用する。
  const floored = floorTaxableThousand(taxableIncome);
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  const bracket = INCOME_TAX_BRACKETS.find((b) => floored <= b.upTo);
  // Infinity 上限ブラケットが必ず最後に存在するため bracket は常に定義される。
  return Math.max(0, floored * bracket!.rate - bracket!.deduction);
}

/**
 * 基準所得税額から所得税の税額控除を差し引き、復興特別所得税を乗じた
 * 最終所得税額を計算する。
 * 最終 = max(0, 基準所得税額 - 税額控除) × 1.021。
 */
export function calcFinalIncomeTax(baseIncomeTax: number, incomeTaxCredits: number): number {
  const afterCredits = Math.max(0, baseIncomeTax - incomeTaxCredits);
  return yen(afterCredits * (1 + RECONSTRUCTION_SURTAX_RATE));
}

// --- 住民税 (概算: 所得割 10% + 均等割) -----------------------------------

/** 住民税の所得割率 (市町村 6% + 都道府県 4% の標準)。 */
export const RESIDENT_TAX_RATE = 0.1;
/** 住民税の均等割 (標準額の概算、円/年)。
 *  基礎分 4,000 円 + 上乗せ 1,000 円 (2014-2023は復興特別、2024〜は森林環境税)。
 *  どちらの年度でも総額 5,000 円で変わらない (`residentPerCapitaBreakdown` 参照)。 */
export const RESIDENT_TAX_PER_CAPITA = 5_000;

/** 住民税均等割の基礎分 (道府県民税1,000 + 市町村民税3,000、円/年)。 */
export const RESIDENT_PER_CAPITA_BASE = 4_000;
/** 森林環境税 (国税。2024年度〜、均等割と併せて徴収、円/年)。 */
export const FOREST_ENVIRONMENT_TAX = 1_000;

export interface ResidentPerCapitaBreakdown {
  /** 均等割の基礎分 (4,000 円)。 */
  readonly base: number;
  /** 復興特別の均等割上乗せ (2014-2023 のみ 1,000 円、以外 0)。 */
  readonly reconstruction: number;
  /** 森林環境税 (2024年度〜 1,000 円、以前 0)。 */
  readonly forestTax: number;
  /** 納税者が負担する総額 (= base + reconstruction + forestTax)。 */
  readonly total: number;
}

/**
 * 住民税均等割 (+森林環境税) の内訳を年度別に分解する。
 *
 * 2014-2023年度: 基礎4,000 + 復興特別1,000 = 5,000円。
 * 2024年度以降: 基礎4,000 + 森林環境税1,000 = 5,000円。
 * 復興特別の上乗せが終了し、入れ替わりに森林環境税が始まったため、**総額は
 * いずれも5,000円で変わらない** (国税庁/総務省)。単純な加算は二重計上になる。
 *
 * @param taxYear 課税年度 (例: 2024)
 */
export function residentPerCapitaBreakdown(taxYear: number): ResidentPerCapitaBreakdown {
  const forestTax = taxYear >= 2024 ? FOREST_ENVIRONMENT_TAX : 0;
  // 復興特別の均等割上乗せは 2014-2023 年度に限る。
  const reconstruction = taxYear >= 2014 && taxYear <= 2023 ? 1_000 : 0;
  return {
    base: RESIDENT_PER_CAPITA_BASE,
    reconstruction,
    forestTax,
    total: RESIDENT_PER_CAPITA_BASE + reconstruction + forestTax,
  };
}

/** 課税所得から住民税額を概算する (所得割 + 均等割)。
 *  ※ 調整控除は含まない (calcResidentAdjustmentCredit を別途適用)。
 *  ※ 住民税の課税所得も所得割の算出前に 1,000 円未満を切り捨てる (地方税法)。 */
export function calcResidentTax(taxableIncome: number): number {
  // `<= 0` → `< 0` は等価: 課税所得 0 のとき所得割 `yen(0 × rate)` = 0 なので
  // どちらの分岐でも結果は PER_CAPITA。テストで区別不能なため抑制。
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  if (taxableIncome <= 0) return RESIDENT_TAX_PER_CAPITA;
  return yen(floorTaxableThousand(taxableIncome) * RESIDENT_TAX_RATE) + RESIDENT_TAX_PER_CAPITA;
}

/**
 * 住民税の調整控除を計算する (所得割から差し引く税額控除)。
 *
 * 所得税と住民税の人的控除額の差 (基礎控除 5万・配偶者控除 5万・一般扶養 5万 等)
 * によって生じる負担増を調整するための控除。地方税法に基づく:
 * - 合計課税所得 ≤ 200万: min(人的控除差の合計, 合計課税所得) × 5%
 * - 合計課税所得 > 200万: { 人的控除差の合計 − (合計課税所得 − 200万) } × 5% (最低 2,500 円)
 *
 * ※ 合計課税所得が 2,500 万円超の場合は調整控除なし (令和3年分以降)。
 *
 * @param residentTaxableIncome 住民税の課税総所得金額
 * @param humanDeductionDiff 人的控除額の差の合計 (所得税ベース − 住民税ベース)
 */
export function calcResidentAdjustmentCredit(
  residentTaxableIncome: number,
  humanDeductionDiff: number,
): number {
  // Stryker disable next-line EqualityOperator,ConditionalExpression: <=0 のガードは計算経路でも 0 を返し同値。
  if (residentTaxableIncome <= 0 || humanDeductionDiff <= 0) return 0;
  if (residentTaxableIncome > 25_000_000) return 0;
  if (residentTaxableIncome <= 2_000_000) {
    return yen(Math.min(humanDeductionDiff, residentTaxableIncome) * 0.05);
  }
  const adjusted = humanDeductionDiff - (residentTaxableIncome - 2_000_000);
  return yen(Math.max(2_500, adjusted * 0.05));
}

/**
 * 住民税の非課税限度額判定 (標準的な「1級地」基準)。
 *
 * - 均等割の非課税: 合計所得 ≤ 35万 ×(本人+扶養人数) + 31万 (扶養がある場合)
 *   ※ 単身 (扶養なし) は 45万 (35万+10万) 以下で均等割非課税。
 * - 所得割の非課税: 合計所得 ≤ 35万 ×(本人+扶養人数) + 42万 (扶養がある場合)
 *   ※ 単身は 45万 以下で所得割非課税。
 *
 * @param totalIncome 合計所得金額
 * @param dependentCount 扶養親族の数 (16歳未満含む。配偶者控除対象も1人とする)
 * @returns 均等割・所得割それぞれの非課税フラグ
 */
export function residentTaxExemption(
  totalIncome: number,
  dependentCount: number,
): { readonly perCapitaExempt: boolean; readonly incomeLevyExempt: boolean } {
  const persons = 1 + Math.max(0, dependentCount);
  const hasDependents = dependentCount > 0;
  // 均等割の非課税限度額。
  const perCapitaLimit = hasDependents ? 350_000 * persons + 310_000 : 450_000;
  // 所得割の非課税限度額。
  const incomeLevyLimit = hasDependents ? 350_000 * persons + 420_000 : 450_000;
  return {
    perCapitaExempt: totalIncome <= perCapitaLimit,
    incomeLevyExempt: totalIncome <= incomeLevyLimit,
  };
}

// --- 消費税 --------------------------------------------------------------

/** 標準税率 / 軽減税率。 */
export const CONSUMPTION_TAX_STANDARD = 0.1;
export const CONSUMPTION_TAX_REDUCED = 0.08;

/** 税抜金額と税率 (0.1 / 0.08) から消費税額を計算する。 */
export function calcConsumptionTax(netAmount: number, rate: number = CONSUMPTION_TAX_STANDARD): number {
  // `<= 0` → `< 0` は等価: 税抜 0 のとき `yen(0 × rate)` = 0 でどちらも 0。
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  if (netAmount <= 0) return 0;
  return yen(netAmount * rate);
}

// --- 給与所得控除 (正式テーブル, 令和2年分以降) -------------------------
//
// 国税庁 No.1410「給与所得控除」の速算表。給与等の収入金額 (額面) に対する
// 控除額。下限 55 万・上限 195 万。
// https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm

/**
 * 給与等の収入金額 (額面年収) から給与所得控除額を正式テーブルで計算する。
 * 令和2年分以降。
 */
export function calcSalaryIncomeDeduction(grossAnnual: number): number {
  if (grossAnnual <= 0) return 0;
  // Stryker disable EqualityOperator: 給与所得控除の各ブラケット境界は連続で <= と < が同値 (等価変異)。
  if (grossAnnual <= 1_625_000) return 550_000;
  if (grossAnnual <= 1_800_000) return yen(grossAnnual * 0.4 - 100_000);
  if (grossAnnual <= 3_600_000) return yen(grossAnnual * 0.3 + 80_000);
  if (grossAnnual <= 6_600_000) return yen(grossAnnual * 0.2 + 440_000);
  if (grossAnnual <= 8_500_000) return yen(grossAnnual * 0.1 + 1_100_000);
  // Stryker restore EqualityOperator
  return 1_950_000; // 上限
}

// --- 基礎控除 (合計所得金額により逓減, 令和2年分以降) --------------------
//
// 国税庁 No.1199「基礎控除」。合計所得金額 2,400 万以下=48万、以降逓減し
// 2,500 万超で 0。住民税の基礎控除は別 (43 万、所得 2,400 万以下)。
// https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm

/** 所得税の基礎控除上限 (合計所得 2,400 万以下)。 */
export const BASIC_DEDUCTION = 480_000;
/** 住民税の基礎控除上限 (合計所得 2,400 万以下)。 */
export const RESIDENT_BASIC_DEDUCTION = 430_000;

/** 合計所得金額から所得税の基礎控除額を計算する (逓減あり)。 */
export function calcBasicDeduction(totalIncome: number): number {
  if (totalIncome <= 24_000_000) return 480_000;
  if (totalIncome <= 24_500_000) return 320_000;
  if (totalIncome <= 25_000_000) return 160_000;
  return 0;
}

/** 合計所得金額から住民税の基礎控除額を計算する (逓減あり)。 */
export function calcResidentBasicDeduction(totalIncome: number): number {
  if (totalIncome <= 24_000_000) return 430_000;
  if (totalIncome <= 24_500_000) return 290_000;
  if (totalIncome <= 25_000_000) return 150_000;
  return 0;
}

// --- 給与手取り (概算) ----------------------------------------------------

/** 社会保険料の概算率 (健康保険 + 厚生年金 + 雇用保険の本人負担合計の目安)。
 *  ※ 社会保険料は本来、標準報酬月額の等級表で決まるが、ここでは額面比例の
 *  概算とする (この一点のみ概算で、控除・税額は正式テーブル)。 */
export const SOCIAL_INSURANCE_RATE = 0.15;

export interface NetSalary {
  readonly gross: number;
  readonly socialInsurance: number;
  /** 給与所得控除後の給与所得 (= 合計所得金額の近似)。 */
  readonly employmentIncome: number;
  /** 課税所得 (所得税ベース)。 */
  readonly taxableIncome: number;
  readonly incomeTax: number;
  readonly residentTax: number;
  readonly takeHome: number;
}

/**
 * 額面年収から手取りを試算する。
 *
 * 社会保険料のみ額面比例の概算 (約15%)。給与所得控除・基礎控除・所得税速算表・
 * 住民税は正式テーブルに基づく。所得控除は基礎控除のみを考慮 (配偶者・扶養・
 * 生命保険料控除等は含まない簡略モデル) のため、扶養がある場合は実際の税額より
 * 高めに出る点に注意。
 */
export function calcNetSalary(grossAnnual: number): NetSalary {
  // `<= 0` → `< 0` は等価寄り (0 の挙動差は下流テストで pin 済み)。境界の
  // 等価ミュータントを抑制。
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  if (grossAnnual <= 0) {
    return {
      gross: 0,
      socialInsurance: 0,
      employmentIncome: 0,
      taxableIncome: 0,
      incomeTax: 0,
      residentTax: RESIDENT_TAX_PER_CAPITA,
      takeHome: 0,
    };
  }
  const socialInsurance = yen(grossAnnual * SOCIAL_INSURANCE_RATE);
  const salaryDeduction = calcSalaryIncomeDeduction(grossAnnual);
  // 給与所得 (= 合計所得金額の近似)。社会保険料控除は所得控除なので、課税所得は
  // 給与所得から社保・基礎控除を引いて求める。
  const employmentIncome = Math.max(0, grossAnnual - salaryDeduction);
  const basicDeduction = calcBasicDeduction(employmentIncome);
  const residentBasicDeduction = calcResidentBasicDeduction(employmentIncome);
  const taxableIncome = Math.max(0, employmentIncome - socialInsurance - basicDeduction);
  const residentTaxableIncome = Math.max(0, employmentIncome - socialInsurance - residentBasicDeduction);
  const incomeTax = calcIncomeTax(taxableIncome);
  const residentTax = calcResidentTax(residentTaxableIncome);
  const takeHome = grossAnnual - socialInsurance - incomeTax - residentTax;
  return { gross: grossAnnual, socialInsurance, employmentIncome, taxableIncome, incomeTax, residentTax, takeHome };
}

// --- 全控除込みの給与税額試算 --------------------------------------------

/** ふるさと納税の住民税「税額控除」(基本分 + 特例分) を概算する。
 *  基本分 = (寄附額-2,000)×10%、特例分 = (寄附額-2,000)×(90%-所得税限界税率×1.021)。
 *  特例分は住民税所得割の20%が上限。 */
export function calcFurusatoResidentCredit(
  donation: number,
  residentIncomeTaxPortion: number, // 住民税所得割額
  marginalIncomeTaxRate: number, // 所得税の限界税率 (0..0.45)
): number {
  // Stryker disable next-line EqualityOperator: 2,000円境界は連続(控除0)で <= と < が同値。
  if (donation <= 2_000) return 0;
  const base = (donation - 2_000) * 0.1;
  const special = (donation - 2_000) * (0.9 - marginalIncomeTaxRate * (1 + RECONSTRUCTION_SURTAX_RATE));
  const specialCap = residentIncomeTaxPortion * 0.2;
  return yen(base + Math.min(Math.max(0, special), Math.max(0, specialCap)));
}

/** 所得税の限界税率 (速算表の該当ブラケットの率) を返す。 */
export function marginalIncomeTaxRate(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  const bracket = INCOME_TAX_BRACKETS.find((b) => taxableIncome <= b.upTo);
  return bracket!.rate;
}

export interface FullSalaryResult {
  readonly gross: number;
  readonly salaryDeduction: number;
  readonly employmentIncome: number;
  /** 所得控除合計 (所得税)。 */
  readonly totalDeductionIncomeTax: number;
  /** 所得控除合計 (住民税)。 */
  readonly totalDeductionResidentTax: number;
  readonly taxableIncomeForIncomeTax: number;
  readonly taxableIncomeForResidentTax: number;
  /** 基準所得税額 (復興特別所得税を乗じる前。税額控除はここから引く)。 */
  readonly baseIncomeTax: number;
  /** 復興特別所得税込みの所得税額 (税額控除適用前)。 */
  readonly incomeTax: number;
  /** 住民税の所得割額 (均等割・税額控除前)。住宅ローン控除の上限算定等に使う。 */
  readonly residentIncomeLevy: number;
  /** 住民税の調整控除 (所得割から差し引く)。 */
  readonly adjustmentCredit: number;
  /** ふるさと納税の住民税税額控除 (適用後に住民税から差し引く)。 */
  readonly furusatoResidentCredit: number;
  readonly residentTax: number;
  readonly takeHome: number;
}

/**
 * 額面年収と所得控除内訳から、全控除込みの所得税・住民税・手取りを試算する。
 *
 * 給与所得控除は正式テーブル。所得控除は呼び出し側で `calcAllDeductions` から
 * 渡す (社会保険料は実額)。ふるさと納税は所得控除 (所得税) と税額控除 (住民税)
 * の両建てで反映。社会保険料を概算で使う `calcNetSalary` とは別系統。
 */
export function calcSalaryWithDeductions(
  grossAnnual: number,
  deductionIncomeTax: number,
  deductionResidentTax: number,
  donation = 0,
  humanDeductionDiff = 0,
  dependentCount = 0,
): FullSalaryResult {
  if (grossAnnual <= 0) {
    return {
      gross: 0, salaryDeduction: 0, employmentIncome: 0,
      totalDeductionIncomeTax: deductionIncomeTax, totalDeductionResidentTax: deductionResidentTax,
      taxableIncomeForIncomeTax: 0, taxableIncomeForResidentTax: 0,
      baseIncomeTax: 0, incomeTax: 0, residentIncomeLevy: 0,
      adjustmentCredit: 0, furusatoResidentCredit: 0, residentTax: RESIDENT_TAX_PER_CAPITA, takeHome: 0,
    };
  }
  const salaryDeduction = calcSalaryIncomeDeduction(grossAnnual);
  const employmentIncome = Math.max(0, grossAnnual - salaryDeduction);
  const taxableIncomeForIncomeTax = Math.max(0, employmentIncome - deductionIncomeTax);
  const taxableIncomeForResidentTax = Math.max(0, employmentIncome - deductionResidentTax);
  const baseIncomeTax = calcBaseIncomeTax(taxableIncomeForIncomeTax);
  const incomeTax = yen(baseIncomeTax * (1 + RECONSTRUCTION_SURTAX_RATE));
  // 住民税の非課税限度額を判定 (合計所得 = 給与所得 employmentIncome で近似)。
  const exemption = residentTaxExemption(employmentIncome, dependentCount);
  const residentIncomeTaxPortion = exemption.incomeLevyExempt
    ? 0
    : yen(floorTaxableThousand(taxableIncomeForResidentTax) * RESIDENT_TAX_RATE);
  // 住民税の調整控除を所得割から差し引く。
  const adjustmentCredit = calcResidentAdjustmentCredit(taxableIncomeForResidentTax, humanDeductionDiff);
  const perCapita = exemption.perCapitaExempt ? 0 : RESIDENT_TAX_PER_CAPITA;
  const residentBeforeCredit = Math.max(0, residentIncomeTaxPortion - adjustmentCredit) + perCapita;
  const furusatoResidentCredit = calcFurusatoResidentCredit(
    donation,
    Math.max(0, residentIncomeTaxPortion - adjustmentCredit),
    marginalIncomeTaxRate(taxableIncomeForIncomeTax),
  );
  // 非課税の場合は均等割の下限を適用しない (0 まで下がる)。
  const residentFloor = exemption.perCapitaExempt ? 0 : RESIDENT_TAX_PER_CAPITA;
  const residentTax = Math.max(residentFloor, residentBeforeCredit - furusatoResidentCredit);
  const takeHome = grossAnnual - incomeTax - residentTax;
  return {
    gross: grossAnnual,
    salaryDeduction,
    employmentIncome,
    totalDeductionIncomeTax: deductionIncomeTax,
    totalDeductionResidentTax: deductionResidentTax,
    taxableIncomeForIncomeTax,
    taxableIncomeForResidentTax,
    baseIncomeTax,
    incomeTax,
    residentIncomeLevy: residentIncomeTaxPortion,
    adjustmentCredit,
    furusatoResidentCredit,
    residentTax,
    takeHome,
  };
}

// --- 節税ヒント (一般的な制度の案内のみ。助言ではない) ---------------------

export interface TaxTip {
  readonly id: string;
  readonly title: string;
  readonly note: string;
}

/**
 * 課税所得の規模に応じた一般的な節税制度の「案内」を返す。
 * 個別の助言ではなく、調べるきっかけとしての一覧。
 *
 * tip の文言 (title / note) は UX コンテンツであり契約ではない (StringLiteral /
 * ObjectLiteral mutation は user-observable な差を生まない)。一方で tip の **id**
 * と所得しきい値 (>= 9,000,000 / >= 3,300,000) の分岐はテストで pin されている。
 * SESSION_HANDOFF 罠 2 の方針に従い、本体を block-level で Stryker 抑制する。
 */
// Stryker disable all
export function suggestTaxTips(taxableIncome: number): readonly TaxTip[] {
  const tips: TaxTip[] = [
    { id: 'ideco', title: 'iDeCo (個人型確定拠出年金)', note: '掛金が全額所得控除。老後資金と節税を両立。' },
    { id: 'furusato', title: 'ふるさと納税', note: '実質 2,000 円で寄附控除。控除上限は所得により変動。' },
    { id: 'nisa', title: 'NISA', note: '運用益が非課税 (所得控除ではないが税負担を抑制)。' },
  ];
  if (taxableIncome >= 9_000_000) {
    tips.push({ id: 'corp', title: '法人化の検討', note: '高所得帯では法人実効税率の方が有利な場合がある。税理士に試算を依頼。' });
  }
  if (taxableIncome >= 3_300_000) {
    tips.push({ id: 'small-biz', title: '小規模企業共済', note: '掛金が全額所得控除。個人事業主・小規模法人役員向け。' });
  }
  return tips;
}
// Stryker restore all

// --- 節税制度カタログ (一般情報の案内のみ) -------------------------------

/** 制度が想定する事業形態。 */
export type TaxEntity = 'corporation' | 'sole-proprietor' | 'both';

export interface TaxScheme {
  readonly id: string;
  readonly name: string;
  readonly entity: TaxEntity;
  readonly summary: string;
  /**
   * 親族間取引・マイクロ法人併用など、適用判断や税務リスクが大きく
   * **税理士への個別相談が特に必須** の高度スキームか。
   */
  readonly needsAdvisor: boolean;
}

/**
 * 一般的に知られた節税制度の「案内」カタログ。
 *
 * **これは一般情報であり、個別の節税助言・スキーム提案ではありません。**
 * 適用可否・効果・要件は事業形態 / 所得 / 年度の税制改正により異なります。
 * 実行は必ず税理士に相談し、国税庁 / 中小機構等の公式情報で確認してください。
 * とくに `needsAdvisor: true` の制度 (親族間取引・マイクロ法人併用など) は
 * 租税回避と判断されると追徴課税のリスクがあるため、自己判断で実行しないこと。
 */
// Stryker disable all
export function taxSchemeCatalog(): readonly TaxScheme[] {
  return [
    // --- 法人 ---
    { id: 'corp-bankruptcy-kyosai', name: '経営セーフティ共済 (倒産防止共済)', entity: 'corporation', summary: '掛金 (月最大20万・年240万) を全額損金算入。40か月以上で解約時 100% 返戻。', needsAdvisor: false },
    { id: 'corp-officer-salary', name: '役員報酬の最適化', entity: 'corporation', summary: '定期同額給与等のルール内で個人/法人の税負担バランスを調整。', needsAdvisor: false },
    { id: 'corp-company-housing', name: '役員社宅制度', entity: 'corporation', summary: '会社契約の住居を役員へ社宅貸与。一定計算の家賃差額を法人経費化。', needsAdvisor: true },
    { id: 'corp-investment-tax', name: '中小企業投資促進税制', entity: 'corporation', summary: '一定の設備投資で 30% 特別償却 または 7% 税額控除を選択。', needsAdvisor: false },
    { id: 'corp-bonus', name: '決算賞与', entity: 'corporation', summary: '決算日までに支給通知し1か月以内に支払えば当期損金に計上可。', needsAdvisor: false },
    // --- 個人事業主 ---
    { id: 'sp-blue', name: '青色申告 (65万円特別控除)', entity: 'sole-proprietor', summary: '複式簿記+e-Tax 等で最大65万円の所得控除。基本かつ最大の節税。', needsAdvisor: false },
    { id: 'sp-family-salary', name: '青色事業専従者給与', entity: 'sole-proprietor', summary: '事前届出で生計同一親族への給与を全額経費化 (所得分散)。', needsAdvisor: true },
    { id: 'sp-small-depreciation', name: '少額減価償却資産の特例', entity: 'sole-proprietor', summary: '取得価額が基準未満の資産を取得年に一括経費化 (青色限定・年間上限あり)。', needsAdvisor: false },
    { id: 'sp-loss-carryover', name: '純損失の繰越し・繰戻し', entity: 'sole-proprietor', summary: '青色なら赤字を翌3年繰越、または前年へ繰戻し還付。', needsAdvisor: false },
    // --- 両方 ---
    { id: 'both-small-biz-kyosai', name: '小規模企業共済', entity: 'both', summary: '掛金 (月最大7万) が全額所得控除。退職金/廃業資金の準備。', needsAdvisor: false },
    { id: 'both-ideco', name: 'iDeCo (個人型確定拠出年金)', entity: 'both', summary: '掛金全額が所得控除。老後資金と節税を両立。', needsAdvisor: false },
    { id: 'both-furusato', name: 'ふるさと納税', entity: 'both', summary: '上限内の寄附で実質2,000円負担。控除上限は所得で変動。', needsAdvisor: false },
    { id: 'both-incorporation', name: '法人化 (法人成り)', entity: 'sole-proprietor', summary: '利益が大きい場合に法人税率・所得分散・消費税免税期間で有利になり得る。要試算。', needsAdvisor: true },
    { id: 'both-micro-corp', name: 'マイクロ法人の併用', entity: 'both', summary: '個人事業と小規模法人を併用し社会保険料を抑える高度スキーム。実体と税務判断が必須。', needsAdvisor: true },
  ];
}
// Stryker restore all

/** カタログから指定の事業形態向け制度を抽出する ('both' は常に含む)。 */
export function schemesForEntity(entity: 'corporation' | 'sole-proprietor'): readonly TaxScheme[] {
  return taxSchemeCatalog().filter((s) => s.entity === entity || s.entity === 'both');
}

// --- 税務コンプライアンス・チェックリスト ---------------------------------
//
// 「否認されない」ことを保証するものではない。税務署 (国税) は事実関係を
// 総合判断するため、誰も否認回避を保証できない。ここで提供するのは、
// 否認リスクを下げるために **一般に必要とされると言われる確認項目** の
// 教育的チェックリストにすぎない。判断と実行は必ず税理士へ。

/** チェックリストが対象とするスキーム種別。 */
export type ComplianceTopic =
  | 'micro-corp' // マイクロ法人併用
  | 'family-transaction' // 親族間の不動産売買・賃貸
  | 'incorporation'; // 法人化 (法人成り)

export interface ComplianceItem {
  readonly id: string;
  /** 確認項目 (やるべきこと)。 */
  readonly requirement: string;
  /** なぜ必要か (否認されやすい論点)。 */
  readonly why: string;
  /** 参考になる公式情報 (国税庁等) の URL。任意。 */
  readonly officialUrl?: string;
}

export interface ComplianceChecklist {
  readonly topic: ComplianceTopic;
  readonly title: string;
  /** スキーム全体の性質に関する注意 (最上部に出す)。 */
  readonly caution: string;
  readonly items: readonly ComplianceItem[];
}

/**
 * スキーム種別ごとの「否認リスクを下げるために一般に必要とされる確認項目」。
 *
 * **重要: これは否認されないことの保証ではありません。** 税務上の最終判断は
 * 個別の事実関係に依存し、税理士の関与なしに安全と断定できるものではありません。
 * 各項目は広く知られた一般論であり、実行は必ず税理士にご相談ください。
 */
// Stryker disable all
export function complianceChecklist(topic: ComplianceTopic): ComplianceChecklist {
  switch (topic) {
    case 'micro-corp':
      return {
        topic,
        title: 'マイクロ法人併用の確認項目',
        caution:
          '個人事業と小規模法人の併用は、社会保険料の最適化を狙う高度スキーム。実体のないペーパーカンパニーによる利益調整とみなされると租税回避として否認され、追徴課税の恐れがある。',
        items: [
          { id: 'mc-substance', requirement: '法人の事業実体を作る (HP・銀行口座・契約書・請求書)', why: '実体のないペーパーカンパニーは否認の典型', officialUrl: 'https://www.nta.go.jp/' },
          { id: 'mc-separate', requirement: '個人事業と法人で業務・顧客を明確に分ける (例: 個人=BtoC / 法人=BtoB)', why: '同一業務の付け替えは利益移転とみなされやすい' },
          { id: 'mc-purpose', requirement: '社会保険・事業上の合理的な目的を説明できるようにする', why: '節税のみが目的だと租税回避と判断されやすい' },
          { id: 'mc-officer-pay', requirement: '役員報酬は定期同額給与等のルールで適正に設定・記録する', why: '不適切な役員報酬は損金不算入になる', officialUrl: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5209.htm' },
          { id: 'mc-social-insurance', requirement: '社会保険の適用要件 (年金事務所の手続) を正しく履行する', why: '適用判断の誤りは遡及修正・追徴のもと', officialUrl: 'https://www.nenkin.go.jp/' },
        ],
      };
    case 'family-transaction':
      return {
        topic,
        title: '親族間の不動産売買・賃貸の確認項目',
        caution:
          '親族間・同族会社間の取引は、適正な時価から乖離すると「みなし贈与」「受贈益課税」として重い税が課される。第三者間と同条件の契約・価格・記録が必須。',
        items: [
          { id: 'ft-fair-price', requirement: '適正な時価で取引する (不動産は鑑定・路線価・固定資産税評価額で根拠を残す)', why: '低額譲渡は差額がみなし贈与・受贈益課税の対象', officialUrl: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4423.htm' },
          { id: 'ft-contract', requirement: '第三者間と同じ賃貸借契約書・売買契約書・金銭消費貸借契約書を交わす', why: '契約書がないと「実質贈与」と疑われる' },
          { id: 'ft-bank-transfer', requirement: '支払いは必ず銀行振込で、摘要に「○月分売買代金」等を明記し履歴を残す', why: '手渡しは証拠が残らず否認されやすい' },
          { id: 'ft-substance', requirement: '取得した不動産の事業利用の実体を残す (看板・郵便物・写真・利用記録)', why: '名義変更だけで実体がないと事業性が否認される' },
          { id: 'ft-mukosho', requirement: '法人が個人の土地に建てる場合「土地の無償返還に関する届出書」を連名提出', why: '権利金の認定課税を合法的に回避するための届出', officialUrl: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5730.htm' },
          { id: 'ft-3000', requirement: '居住用財産の3,000万円特別控除は「自己が支配する法人」への売却では使えない点を確認', why: '同族法人への売却は特例の対象外', officialUrl: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/joto/3302.htm' },
        ],
      };
    case 'incorporation':
      return {
        topic,
        title: '法人化 (法人成り) の確認項目',
        caution:
          '法人化は利益規模次第で有利だが、設立・維持コストや社会保険の負担増もある。必ず事前にシミュレーションし、形式だけの法人化にならないようにする。',
        items: [
          { id: 'in-simulation', requirement: '法人税 vs 所得税の試算を行い、法人化メリットの分岐点を確認する', why: '利益が小さいと法人維持コストで逆に不利になる' },
          { id: 'in-asset-transfer', requirement: '個人資産を法人へ移す場合は適正な時価で売買・記録する', why: '低廉譲渡は課税対象になる' },
          { id: 'in-consumption-tax', requirement: '消費税の免税期間の要件 (資本金・特定期間の課税売上等) を確認', why: '要件を満たさないと免税にならない', officialUrl: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6531.htm' },
          { id: 'in-officer-pay', requirement: '役員報酬は期首から3か月以内に決め、定期同額にする', why: '途中変更分は損金不算入になる', officialUrl: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5209.htm' },
          { id: 'in-blue', requirement: '法人でも青色申告の承認申請を期限内に出す', why: '欠損金繰越等の優遇は青色が前提' },
        ],
      };
    default: {
      // 網羅性チェック (到達不能)。
      const _exhaustive: never = topic;
      return _exhaustive;
    }
  }
}
// Stryker restore all

/** すべてのチェックリストのトピック一覧 (UI のタブ用)。 */
export const COMPLIANCE_TOPICS: readonly ComplianceTopic[] = [
  'micro-corp',
  'family-transaction',
  'incorporation',
];

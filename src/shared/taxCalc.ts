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
  if (taxableIncome <= 0) return 0;
  const bracket = INCOME_TAX_BRACKETS.find((b) => taxableIncome <= b.upTo);
  // Infinity 上限ブラケットが必ず最後に存在するため bracket は常に定義される。
  const base = taxableIncome * bracket!.rate - bracket!.deduction;
  const baseTax = Math.max(0, base);
  return yen(baseTax * (1 + RECONSTRUCTION_SURTAX_RATE));
}

// --- 住民税 (概算: 所得割 10% + 均等割) -----------------------------------

/** 住民税の所得割率 (市町村 6% + 都道府県 4% の標準)。 */
export const RESIDENT_TAX_RATE = 0.1;
/** 住民税の均等割 (標準額の概算、円/年)。 */
export const RESIDENT_TAX_PER_CAPITA = 5_000;

/** 課税所得から住民税額を概算する (所得割 + 均等割)。 */
export function calcResidentTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return RESIDENT_TAX_PER_CAPITA;
  return yen(taxableIncome * RESIDENT_TAX_RATE) + RESIDENT_TAX_PER_CAPITA;
}

// --- 消費税 --------------------------------------------------------------

/** 標準税率 / 軽減税率。 */
export const CONSUMPTION_TAX_STANDARD = 0.1;
export const CONSUMPTION_TAX_REDUCED = 0.08;

/** 税抜金額と税率 (0.1 / 0.08) から消費税額を計算する。 */
export function calcConsumptionTax(netAmount: number, rate: number = CONSUMPTION_TAX_STANDARD): number {
  if (netAmount <= 0) return 0;
  return yen(netAmount * rate);
}

// --- 給与手取り (概算) ----------------------------------------------------

/** 社会保険料の概算率 (健康保険 + 厚生年金 + 雇用保険の本人負担合計の目安)。 */
export const SOCIAL_INSURANCE_RATE = 0.15;
/** 給与所得控除の概算: 額面の 30% (下限 55 万・上限 195 万でクランプ)。 */
const SALARY_DEDUCTION_RATE = 0.3;
const SALARY_DEDUCTION_MIN = 550_000;
const SALARY_DEDUCTION_MAX = 1_950_000;
/** 基礎控除 (所得税)。 */
export const BASIC_DEDUCTION = 480_000;

export interface NetSalary {
  readonly gross: number;
  readonly socialInsurance: number;
  readonly incomeTax: number;
  readonly residentTax: number;
  readonly takeHome: number;
}

/** 額面年収から手取り (概算) を試算する。控除はすべて概算。 */
export function calcNetSalary(grossAnnual: number): NetSalary {
  if (grossAnnual <= 0) {
    return { gross: 0, socialInsurance: 0, incomeTax: 0, residentTax: RESIDENT_TAX_PER_CAPITA, takeHome: 0 };
  }
  const socialInsurance = yen(grossAnnual * SOCIAL_INSURANCE_RATE);
  const salaryDeduction = Math.min(
    SALARY_DEDUCTION_MAX,
    Math.max(SALARY_DEDUCTION_MIN, yen(grossAnnual * SALARY_DEDUCTION_RATE)),
  );
  const taxableIncome = Math.max(0, grossAnnual - socialInsurance - salaryDeduction - BASIC_DEDUCTION);
  const incomeTax = calcIncomeTax(taxableIncome);
  const residentTax = calcResidentTax(taxableIncome);
  const takeHome = grossAnnual - socialInsurance - incomeTax - residentTax;
  return { gross: grossAnnual, socialInsurance, incomeTax, residentTax, takeHome };
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
 */
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

/**
 * 税額控除エンジン (所得控除の後、算出税額から直接差し引く控除)。
 *
 * **重要 — これは概算試算であり、正確な税額計算・税務助言ではありません。**
 * 住宅ローン控除・配当控除・寄附金税額控除 (ふるさと納税の住民税分) など
 * 主要な税額控除を国税庁の一般的なルールで概算します。適用要件・居住年・
 * 借入区分・年度改正・自治体差は完全には反映しません。確定申告は税理士 /
 * 国税庁の公式ツールで確定してください。
 *
 * 税額控除は「所得控除」(課税所得を減らす) とは異なり、算出された税額そのもの
 * から差し引く点に注意 (節税インパクトが大きい)。
 */

/** 円未満を四捨五入。 */
function yen(n: number): number {
  return Math.round(n);
}

// --- 住宅ローン控除 (住宅借入金等特別控除) -------------------------------
//
// 国税庁 No.1211-1 ほか。年末借入残高 × 控除率を所得税から控除し、控除しきれ
// ない分は住民税から一定上限まで控除する。控除率・上限・期間は居住年と住宅の
// 環境性能区分で異なるため、ここでは「控除率」と「年末残高上限」を引数化した
// 汎用モデルとする (令和4年以降の標準的な 0.7% を既定)。

/** 住宅の環境性能区分 (令和4年以降の新築・買取再販の借入限度額に影響)。 */
export type HousingPerformance =
  | 'zeh' // ZEH 水準省エネ住宅
  | 'standard' // 省エネ基準適合住宅
  | 'long-life' // 認定長期優良・低炭素住宅
  | 'non-standard' // その他 (一般・非適合)
  | 'used'; // 中古 (既存住宅)

/** 居住年と性能区分から住宅ローン控除の「控除率」「年末残高上限」を解決する。
 *
 * 国税庁 No.1211 系。令和4-7年居住の新築は性能区分で借入限度額が異なる。
 * 令和2-3年は控除率1.0%、それ以前はさらに別 (本表は概算・代表値)。
 * @param residenceYear 西暦の居住開始年 (2020〜2025 を想定)
 */
export function resolveMortgageParams(
  residenceYear: number,
  performance: HousingPerformance,
): { readonly rate: number; readonly balanceCap: number } {
  // 令和2-3年 (2020-2021) は控除率 1.0%。
  if (residenceYear <= 2021) {
    return { rate: 0.01, balanceCap: performance === 'used' ? 20_000_000 : 40_000_000 };
  }
  // 令和4年以降 (2022-) は控除率 0.7%。借入限度額は性能区分で変動。
  const cap: Record<HousingPerformance, number> = {
    'long-life': 50_000_000,
    zeh: 45_000_000,
    standard: 40_000_000,
    'non-standard': residenceYear >= 2024 ? 0 : 30_000_000, // 2024- は省エネ非適合の新築は対象外
    used: 30_000_000,
  };
  return { rate: 0.007, balanceCap: cap[performance] };
}

/** 住宅ローン控除の控除期間 (年)。新築・買取再販は13年、中古 (既存住宅) は10年。 */
export function mortgageDeductionPeriod(performance: HousingPerformance): number {
  return performance === 'used' ? 10 : 13;
}

/** 控除期間の判定結果。 */
export interface MortgagePeriodStatus {
  /** 控除期間の年数 (新築13年 / 中古10年)。 */
  readonly maxYears: number;
  /** 居住開始から現在までの経過年 (居住初年を1年目とする)。 */
  readonly yearsElapsed: number;
  /** 残りの控除年数 (0 以上)。 */
  readonly yearsRemaining: number;
  /** 現在年が控除期間内か。 */
  readonly withinPeriod: boolean;
}

/**
 * 居住開始年・現在年・性能区分から控除期間の状態を判定する。
 *
 * 居住初年を 1 年目と数える (例: 2022年居住開始・2034年は13年目=最終年)。
 * 控除期間を過ぎた年は控除を受けられない (国税庁 No.1211/1212)。
 *
 * @param residenceYear 居住開始年 (西暦)
 * @param currentYear 判定対象の年 (西暦)
 * @param performance 住宅の性能区分 (中古かどうかで期間が変わる)
 */
export function mortgagePeriodStatus(
  residenceYear: number,
  currentYear: number,
  performance: HousingPerformance,
): MortgagePeriodStatus {
  const maxYears = mortgageDeductionPeriod(performance);
  const yearsElapsed = currentYear - residenceYear + 1;
  const withinPeriod = yearsElapsed >= 1 && yearsElapsed <= maxYears;
  // 残り控除年数 (当年含む)。居住前は全期間、控除期間後は 0。
  let yearsRemaining: number;
  if (yearsElapsed < 1) yearsRemaining = maxYears; // まだ居住前: 全期間が残る
  else if (yearsElapsed > maxYears) yearsRemaining = 0; // 控除期間終了
  else yearsRemaining = maxYears - yearsElapsed + 1; // 期間中: 当年を含む残年数
  return { maxYears, yearsElapsed, yearsRemaining, withinPeriod };
}

/** 住宅ローン控除の入力。 */
export interface MortgageCreditInput {
  /** 年末借入残高 (円)。 */
  readonly yearEndBalance: number;
  /** 控除率 (既定 0.7% = 0.007)。 */
  readonly rate?: number;
  /** 借入残高の上限 (住宅区分による。既定 3,000 万円)。 */
  readonly balanceCap?: number;
  /** 所得税の算出税額 (この範囲までしか所得税からは引けない)。 */
  readonly incomeTaxBeforeCredit: number;
  /** 課税総所得金額等 (住民税からの控除上限の算定に使う)。 */
  readonly taxableIncomeForResident: number;
  /**
   * 合計所得金額 (円, 任意)。指定すると、2,000 万円を超える年は住宅ローン控除を
   * 適用しない (国税庁 No.1211 の所得要件)。未指定なら所得制限を判定しない。
   */
  readonly totalIncome?: number;
  /**
   * 控除期間外フラグ (任意)。`true` のとき控除期間 (新築13年/中古10年) を
   * 過ぎているため控除しない。`mortgagePeriodStatus().withinPeriod` の否定を渡す。
   */
  readonly outsidePeriod?: boolean;
}

/** 住宅ローン控除の所得制限 (合計所得金額の上限, 円)。 */
export const MORTGAGE_INCOME_LIMIT = 20_000_000;

/** 住宅ローン控除の結果 (所得税分・住民税分・控除しきれなかった額)。 */
export interface MortgageCreditResult {
  /** 控除可能額の総額 (残高×率)。 */
  readonly creditable: number;
  /** 所得税から控除される額。 */
  readonly fromIncomeTax: number;
  /** 住民税から控除される額 (上限あり)。 */
  readonly fromResidentTax: number;
  /** どちらからも控除しきれず切り捨てられた額。 */
  readonly unused: number;
}

/** 住民税からの住宅ローン控除上限 (令和の標準: 課税総所得×5%、最大 97,500 円)。 */
export const MORTGAGE_RESIDENT_CAP_RATE = 0.05;
export const MORTGAGE_RESIDENT_CAP_MAX = 97_500;

/**
 * 住宅ローン控除を計算する。
 * - 控除可能額 = min(年末残高, 残高上限) × 控除率
 * - まず所得税から控除、引ききれない分を住民税から (課税所得×5%・最大97,500円) 控除
 */
export function calcMortgageCredit(input: MortgageCreditInput): MortgageCreditResult {
  // 合計所得金額が 2,000 万円を超える年は住宅ローン控除の適用なし (国税庁 No.1211)。
  if (input.totalIncome !== undefined && input.totalIncome > MORTGAGE_INCOME_LIMIT) {
    return { creditable: 0, fromIncomeTax: 0, fromResidentTax: 0, unused: 0 };
  }
  // 控除期間 (新築13年/中古10年) を過ぎた年は控除なし。
  if (input.outsidePeriod) {
    return { creditable: 0, fromIncomeTax: 0, fromResidentTax: 0, unused: 0 };
  }
  const rate = input.rate ?? 0.007;
  const cap = input.balanceCap ?? 30_000_000;
  const balance = Math.max(0, input.yearEndBalance);
  const creditable = yen(Math.min(balance, cap) * rate);

  const fromIncomeTax = Math.min(creditable, Math.max(0, input.incomeTaxBeforeCredit));
  const remaining = creditable - fromIncomeTax;

  const residentCap = Math.min(
    MORTGAGE_RESIDENT_CAP_MAX,
    yen(Math.max(0, input.taxableIncomeForResident) * MORTGAGE_RESIDENT_CAP_RATE),
  );
  const fromResidentTax = Math.min(remaining, residentCap);
  const unused = remaining - fromResidentTax;

  return { creditable, fromIncomeTax, fromResidentTax, unused };
}

// --- 配当控除 -------------------------------------------------------------
//
// 国税庁 No.1250。総合課税を選択した国内株式の配当について、課税総所得金額が
// 1,000 万円以下の部分は所得税10%・住民税2.8%、超える部分は所得税5%・住民税1.4%
// を配当所得に乗じて税額控除する (証券投資信託等は率が異なるが、ここでは
// 株式配当の標準率を用いる)。

/** 配当の種類 (配当控除率が異なる)。
 *  - stock: 国内株式の配当 (標準率)。
 *  - mutual-fund: 証券投資信託の収益分配金 (外貨建等以外、株式の半分の率)。
 *  - foreign-mutual-fund: 外貨建等証券投資信託 (さらに半分)。 */
export type DividendKind = 'stock' | 'mutual-fund' | 'foreign-mutual-fund';

export interface DividendCreditInput {
  /** 配当所得 (総合課税を選択した配当の金額)。 */
  readonly dividendIncome: number;
  /** 課税総所得金額 (配当を含む)。1,000 万円の判定に使う。 */
  readonly taxableTotalIncome: number;
  /** 配当の種類 (既定 'stock')。 */
  readonly kind?: DividendKind;
}

export interface DividendCreditResult {
  readonly incomeTax: number;
  readonly residentTax: number;
}

/** 配当種類ごとの控除率 (高率: 課税所得1000万以下部分 / 低率: 超過部分)。
 *  国税庁 No.1250 の率体系: 投信は株式の1/2、外貨建等はさらに1/2。 */
const DIVIDEND_RATES: Record<DividendKind, {
  highIncome: number; lowIncome: number; highResident: number; lowResident: number;
}> = {
  stock: { highIncome: 0.1, lowIncome: 0.05, highResident: 0.028, lowResident: 0.014 },
  'mutual-fund': { highIncome: 0.05, lowIncome: 0.025, highResident: 0.014, lowResident: 0.007 },
  'foreign-mutual-fund': { highIncome: 0.025, lowIncome: 0.0125, highResident: 0.007, lowResident: 0.0035 },
};

/** 配当控除を計算する (種類別の率)。 */
export function calcDividendCredit(input: DividendCreditInput): DividendCreditResult {
  const dividend = Math.max(0, input.dividendIncome);
  if (dividend === 0) return { incomeTax: 0, residentTax: 0 };
  const total = Math.max(0, input.taxableTotalIncome);
  const THRESHOLD = 10_000_000;
  const r = DIVIDEND_RATES[input.kind ?? 'stock'];

  // 課税総所得のうち 1,000 万円を超える部分に対応する配当を低率、以下を高率で。
  // 配当は課税所得の「最上部」に積まれていると考え、超過部分から低率を適用。
  const over = Math.max(0, total - THRESHOLD);
  const dividendAtLowRate = Math.min(dividend, over);
  const dividendAtHighRate = dividend - dividendAtLowRate;

  const incomeTax = yen(dividendAtHighRate * r.highIncome + dividendAtLowRate * r.lowIncome);
  const residentTax = yen(dividendAtHighRate * r.highResident + dividendAtLowRate * r.lowResident);
  return { incomeTax, residentTax };
}

// --- 税額控除の集計 -------------------------------------------------------

/** 税額控除の入力 (該当しなければ未指定)。 */
export interface TaxCreditInput {
  readonly mortgage?: MortgageCreditInput;
  readonly dividend?: DividendCreditInput;
  /** ふるさと納税等の住民税税額控除 (calcFurusatoResidentCredit の結果)。 */
  readonly furusatoResidentCredit?: number;
  /** その他の所得税の税額控除 (政党等寄附金特別控除など、直接指定)。 */
  readonly otherIncomeTaxCredit?: number;
}

/** 税額控除の内訳と合計。 */
export interface TaxCreditBreakdown {
  readonly mortgageIncomeTax: number;
  readonly mortgageResidentTax: number;
  readonly dividendIncomeTax: number;
  readonly dividendResidentTax: number;
  readonly furusatoResidentTax: number;
  readonly otherIncomeTax: number;
  /** 所得税から控除する合計。 */
  readonly totalIncomeTax: number;
  /** 住民税から控除する合計。 */
  readonly totalResidentTax: number;
}

/** すべての税額控除を集計する。 */
export function calcAllTaxCredits(input: TaxCreditInput): TaxCreditBreakdown {
  const mortgage = input.mortgage ? calcMortgageCredit(input.mortgage) : null;
  const dividend = input.dividend ? calcDividendCredit(input.dividend) : null;

  const mortgageIncomeTax = mortgage ? mortgage.fromIncomeTax : 0;
  const mortgageResidentTax = mortgage ? mortgage.fromResidentTax : 0;
  const dividendIncomeTax = dividend ? dividend.incomeTax : 0;
  const dividendResidentTax = dividend ? dividend.residentTax : 0;
  const furusatoResidentTax = Math.max(0, input.furusatoResidentCredit ?? 0);
  const otherIncomeTax = Math.max(0, input.otherIncomeTaxCredit ?? 0);

  return {
    mortgageIncomeTax,
    mortgageResidentTax,
    dividendIncomeTax,
    dividendResidentTax,
    furusatoResidentTax,
    otherIncomeTax,
    totalIncomeTax: mortgageIncomeTax + dividendIncomeTax + otherIncomeTax,
    totalResidentTax: mortgageResidentTax + dividendResidentTax + furusatoResidentTax,
  };
}

/** 算出税額に税額控除を適用する (0 未満にはならない)。
 *  ※ 復興特別所得税の順序を考慮しない簡易版 (所得税に直接適用)。 */
export function applyTaxCredits(
  incomeTaxBeforeCredit: number,
  residentTaxBeforeCredit: number,
  credits: TaxCreditBreakdown,
  residentPerCapita = 5_000,
): { readonly incomeTax: number; readonly residentTax: number } {
  const incomeTax = Math.max(0, incomeTaxBeforeCredit - credits.totalIncomeTax);
  // 住民税は均等割 (per-capita) を下回らない。
  const residentTax = Math.max(
    residentPerCapita,
    residentTaxBeforeCredit - credits.totalResidentTax,
  );
  return { incomeTax, residentTax };
}

/**
 * 復興特別所得税の順序を正しく扱った税額控除の適用。
 *
 * 住宅ローン控除・配当控除等の所得税の税額控除は、**復興特別所得税を乗じる前**
 * の「基準所得税額」から差し引き、その残額に 2.1% を乗じて最終所得税額とする
 * (確定申告書 B の流れ)。住民税は所得割の算出税額から税額控除を引く。
 *
 * @param baseIncomeTax 基準所得税額 (復興税前)
 * @param residentTaxBeforeCredit 住民税 (均等割込み・税額控除前)
 * @param surtaxRate 復興特別所得税率 (通常 0.021)
 */
export function applyTaxCreditsWithSurtax(
  baseIncomeTax: number,
  residentTaxBeforeCredit: number,
  credits: TaxCreditBreakdown,
  surtaxRate: number,
  residentPerCapita = 5_000,
): { readonly incomeTax: number; readonly residentTax: number } {
  const baseAfterCredit = Math.max(0, baseIncomeTax - credits.totalIncomeTax);
  const incomeTax = Math.round(baseAfterCredit * (1 + surtaxRate));
  const residentTax = Math.max(
    residentPerCapita,
    residentTaxBeforeCredit - credits.totalResidentTax,
  );
  return { incomeTax, residentTax };
}

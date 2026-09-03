/**
 * 数値パラメータの台帳 —— 各機能が計算に使う**法定値・参考値・しきい値・前提**を
 * 1 か所に登録し、利用者が任意の値で上書きできるようにする。
 *
 * 依頼 (2026-09-03)「全ての機能の数値を任意で設定出来る仕様に」。
 *
 * ## 設計
 * - **既定値は各モジュールの定数をそのまま参照する** (写さない)。ここに数字を
 *   書き写すと、法改正で定数を直したときに台帳だけ古くなる。
 * - **計算は純粋なまま**。各モジュールの関数は省略可の引数で値を受け取り、
 *   省略時は従来の定数を使う (既存の検査は 1 行も変えずに通る)。画面が
 *   `useParameters()` で有効値を読み、関数へ渡す。台帳を読む大域の状態は置かない。
 * - **登録した値は必ず配線する**。「設定できるのに効かない」項目は、画面が
 *   嘘をつく最悪の形なので、台帳に載せる = その値で計算が変わる、を検査で留める。
 * - **範囲は桁誤りを止める幅**。値の正しさ (この率が今年の法定値か) は見ない —
 *   それを決めるのは利用者と出典。
 *
 * ## 載せないもの
 * - 安全上限 (通信の打ち切り・応答サイズ・保存の上限・暗号の反復回数・入力長) は
 *   利用者に触らせない。緩めても画面上は何も変わらず、緩めたことに気付けない。
 * - 画面の入力欄に**直接ある**値 (水耕栽培の電力原単位・単価など) は載せない。
 *   同じ値を 2 か所で置けると、どちらが効いているかが画面から読めなくなる。
 */
import {
  PANEL_AREA_SQM,
  DAYS_PER_YEAR,
  REFERENCE_LETTUCE_POTASSIUM_MG,
  SALT_EQUIVALENT_FACTOR,
  LOW_K_SWITCH_DAYS_MIN,
  LOW_K_SWITCH_DAYS_MAX,
  CKD_POTASSIUM_LIMIT_MG,
  type CkdStage,
  type ProductionParams,
  type LowPotassiumParams,
} from './hydroponics';
import { COMMUTE_PUBLIC_TRANSPORT_CAP } from './payroll';
import { DSCR_DANGER_THRESHOLD, DSCR_CAUTION_THRESHOLD, type DscrThresholds } from './realEstateMetrics';
import {
  CONSUMPTION_TAX_STANDARD,
  CONSUMPTION_TAX_REDUCED,
  RECONSTRUCTION_SURTAX_RATE,
  RESIDENT_TAX_RATE,
  RESIDENT_TAX_PER_CAPITA,
  SOCIAL_INSURANCE_RATE,
  type MunicipalityOverride,
  type NetSalaryParams,
  type SalaryTaxParams,
} from './taxCalc';
import {
  BASIC_HUMAN_DEDUCTION_DIFF,
  CASUALTY_DISASTER_FLOOR,
  CASUALTY_INCOME_RATE,
  DEPENDENT_INCOME_LIMIT,
  DONATION_DEDUCTION_FLOOR,
  DONATION_INCOME_CAP_RATE,
  SELF_MEDICATION_CAP,
  SELF_MEDICATION_THRESHOLD,
  SMALL_BIZ_MUTUAL_ANNUAL_CAP,
  SPOUSE_SPECIAL_INCOME_LIMIT_YEN,
  type DeductionParams,
} from './taxDeductions';
import {
  MORTGAGE_INCOME_LIMIT,
  MORTGAGE_RESIDENT_CAP_MAX,
  MORTGAGE_RESIDENT_CAP_RATE,
  RESIDENT_LEVY_WITHHOLDING_RATE,
  type MortgageCreditParams,
} from './taxCredits';
import {
  CITY_PLANNING_MAX_RATE,
  DEPRECIABLE_ASSET_TAX_THRESHOLD,
  FIXED_ASSET_STANDARD_RATE,
  HOUSE_TAX_THRESHOLD,
  LAND_TAX_THRESHOLD,
  type FixedAssetThresholds,
} from './taxFixedAsset';
import {
  LAND_THRESHOLD as ACQ_LAND_THRESHOLD,
  NEW_BUILDING_THRESHOLD as ACQ_NEW_BUILDING_THRESHOLD,
  OTHER_BUILDING_THRESHOLD as ACQ_OTHER_BUILDING_THRESHOLD,
  REDUCED_RATE as ACQ_REDUCED_RATE,
  STANDARD_RATE as ACQ_STANDARD_RATE,
  type AcquisitionParams,
} from './taxRealEstateAcquisition';
import {
  RATE_MORTGAGE,
  RATE_PRESERVATION,
  RATE_TRANSFER_GIFT,
  RATE_TRANSFER_INHERITANCE,
  RATE_TRANSFER_SALE,
  type RegistrationType,
} from './taxRegistrationLicense';
import { CONTINUOUS_BASIC_CONTRACT_DUTY, NO_AMOUNT_DUTY, type StampDutyParams } from './taxStampDuty';
import {
  ESTIMATED_ACQUISITION_COST_RATE,
  RESIDENTIAL_REDUCED_RATE_CAP,
  RESIDENTIAL_SPECIAL_DEDUCTION,
  type CapitalGainsParams,
} from './taxCapitalGains';
import {
  BUSINESS_TAX_RATE_TIER1,
  BUSINESS_TAX_RATE_TIER2,
  BUSINESS_TAX_RATE_TIER3,
  BUSINESS_TAX_TIER1_LIMIT,
  BUSINESS_TAX_TIER2_LIMIT,
  CORP_TAX_REDUCED_RATE,
  CORP_TAX_REDUCED_THRESHOLD,
  CORP_TAX_STANDARD_RATE,
  DEFAULT_PER_CAPITA_LEVY,
  LARGE_CORP_CAPITAL_THRESHOLD,
  LARGE_CORP_LOSS_DEDUCTION_RATIO,
  LOCAL_CORP_TAX_RATE,
  PER_CAPITA_EMPLOYEE_THRESHOLD,
  RESIDENT_CORP_TAX_RATE,
  SPECIAL_BUSINESS_TAX_RATE,
  type CorporateTaxRates,
} from './taxCorporate';
import {
  EXEMPTION_THRESHOLD,
  FULL_CREDIT_RATIO_THRESHOLD,
  FULL_CREDIT_SALES_THRESHOLD,
  SIMPLIFIED_ELIGIBILITY_THRESHOLD,
  type BusinessConsumptionParams,
} from './taxConsumptionBusiness';
import { TWENTY_PERCENT_RATE } from './taxConsumption';
import { PENSION_DEDUCTION_MIN_OVER65, PENSION_DEDUCTION_MIN_UNDER65, type PensionDeductionParams } from './taxPublicPension';
import { CASUAL_INCOME_SPECIAL_DEDUCTION } from './taxCasual';
import { FURUSATO_ONE_STOP_MAX_MUNICIPALITIES, FURUSATO_SELF_PAY, type FurusatoParams } from './taxFurusato';
import { JP_NATIONAL_REDUCED, JP_NATIONAL_STANDARD, PERSONAL_USE_FACTOR, SMALL_VALUE_LIMIT, type ImportParams } from './tradeTax';
import {
  PENSION_RATE,
  HEALTH_RATE,
  CARE_RATE,
  EMPLOYMENT_INSURANCE_RATE,
  PENSION_BONUS_CAP_PER_PAYMENT,
  HEALTH_BONUS_CAP_ANNUAL,
  type SocialInsuranceRates,
} from './taxSocialInsurance';
import { DEFAULT_EFFECTIVE_TAX_RATE } from './funding';

/** 値の性格。画面の印と、変えるときの注意書きが変わる。 */
export type ParameterKind =
  | 'law' // 法令・公的な基準で決まる値 (改正で変わる)
  | 'reference' // 公開資料の参考値 (自分の実測で置き換える)
  | 'threshold' // 判定のしきい値 (警告を出す境目)
  | 'assumption'; // 試算の前提 (置き値)

export const PARAMETER_KIND_LABEL: Readonly<Record<ParameterKind, string>> = {
  law: '法定値',
  reference: '参考値',
  threshold: 'しきい値',
  assumption: '前提',
};

export interface ParameterDef {
  readonly id: string;
  /** 画面のまとまり (機能名)。 */
  readonly feature: string;
  readonly label: string;
  /** 画面に出す単位。`scale` を掛けた後の単位 (割合なら % と 100)。 */
  readonly unit: string;
  /** 画面表示の倍率。内部値 0.1 を画面では 10 (%) と見せる。省略は 1。 */
  readonly scale?: number;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
  readonly kind: ParameterKind;
  /** 出典 (法令名・資料名)。 */
  readonly source?: string;
  readonly note?: string;
}

const G3B = CKD_POTASSIUM_LIMIT_MG.G3b as number;
const G4 = CKD_POTASSIUM_LIMIT_MG.G4 as number;
const G5 = CKD_POTASSIUM_LIMIT_MG.G5 as number;

/**
 * 台帳の本体。関数にしてあるのは変異検査のため — モジュール読込時にだけ走る表は
 * `ignoreStatic` で測られず、`vi.resetModules()` で読み直すと**依存先の表まで**
 * 測定対象に入ってしまう (2026-09-03 に踏んだ: hydroponics / payroll の参考値表が
 * 生存として 47 件出た)。関数なら検査が呼ぶだけで表の文字と数が測れる。
 */
export function parameterDefinitions() {
  return [
  // --- 水耕栽培 -----------------------------------------------------------
  {
    id: 'hydroponics.panelAreaSqm', feature: '水耕栽培', label: '栽培パネル 1 枚の面積', unit: 'm²',
    defaultValue: PANEL_AREA_SQM, min: 0.05, max: 10, kind: 'reference',
    source: 'ALIC 野菜情報 (60cm × 90cm)', note: '株密度 = パネル穴数 ÷ この面積',
  },
  {
    id: 'hydroponics.daysPerYear', feature: '水耕栽培', label: '年間の稼働日数', unit: '日',
    defaultValue: DAYS_PER_YEAR, min: 1, max: 366, integer: true, kind: 'assumption',
    note: '年回転数 = 稼働日数 ÷ 定植後日数。休業日を除くなら減らす',
  },
  {
    id: 'hydroponics.referenceLettucePotassiumMg', feature: '水耕栽培', label: '通常レタスのカリウム (比較基準)', unit: 'mg/100g',
    defaultValue: REFERENCE_LETTUCE_POTASSIUM_MG, min: 1, max: 5_000, kind: 'reference',
    source: '日本食品標準成分表 八訂 増補2023 (土耕結球葉)', note: '低カリウムの削減率の分母',
  },
  {
    id: 'hydroponics.saltEquivalentFactor', feature: '水耕栽培', label: '食塩相当量の換算係数', unit: '',
    defaultValue: SALT_EQUIVALENT_FACTOR, min: 1, max: 5, kind: 'law',
    source: '食品表示基準 (Na mg × 2.54 ÷ 1000 = 食塩相当量 g)',
  },
  {
    id: 'hydroponics.lowKSwitchDaysMin', feature: '水耕栽培', label: '低カリウム切替の目安 (下限)', unit: '日',
    defaultValue: LOW_K_SWITCH_DAYS_MIN, min: 1, max: 60, integer: true, kind: 'reference',
    source: 'ALIC 野菜情報 (収穫前 7〜10 日)',
  },
  {
    id: 'hydroponics.lowKSwitchDaysMax', feature: '水耕栽培', label: '低カリウム切替の目安 (上限)', unit: '日',
    defaultValue: LOW_K_SWITCH_DAYS_MAX, min: 1, max: 60, integer: true, kind: 'reference',
    source: 'ALIC 野菜情報 (収穫前 7〜10 日)',
  },
  {
    id: 'hydroponics.ckdPotassiumLimitG3b', feature: '水耕栽培', label: 'CKD G3b の 1 日カリウム上限', unit: 'mg',
    defaultValue: G3B, min: 100, max: 10_000, integer: true, kind: 'reference',
    source: '日本腎臓学会 (2,000mg)', note: '医師の指示があればその値に。食べられる g 数の計算に使う',
  },
  {
    id: 'hydroponics.ckdPotassiumLimitG4', feature: '水耕栽培', label: 'CKD G4 の 1 日カリウム上限', unit: 'mg',
    defaultValue: G4, min: 100, max: 10_000, integer: true, kind: 'reference',
    source: '日本腎臓学会 (1,500mg)', note: '医師の指示があればその値に',
  },
  {
    id: 'hydroponics.ckdPotassiumLimitG5', feature: '水耕栽培', label: 'CKD G5 の 1 日カリウム上限', unit: 'mg',
    defaultValue: G5, min: 100, max: 10_000, integer: true, kind: 'reference',
    source: '日本腎臓学会 (1,500mg)', note: '医師の指示があればその値に',
  },
  // --- 給与 ---------------------------------------------------------------
  {
    id: 'payroll.commutePublicTransportCap', feature: '給与', label: '通勤手当 (公共交通機関) の非課税限度 / 月', unit: '円',
    defaultValue: COMMUTE_PUBLIC_TRANSPORT_CAP, min: 0, max: 1_000_000, integer: true, kind: 'law',
    source: '所得税法施行令 20 条の 2 (月 15 万円)',
  },
  // --- 不動産 -------------------------------------------------------------
  {
    id: 'realEstate.dscrDangerThreshold', feature: '不動産', label: 'DSCR の危険水域 (未満)', unit: '倍',
    defaultValue: DSCR_DANGER_THRESHOLD, min: 0.1, max: 10, kind: 'threshold',
    note: 'NOI で返済を賄えない境目。1.0 未満は元利返済が NOI を超える',
  },
  {
    id: 'realEstate.dscrCautionThreshold', feature: '不動産', label: 'DSCR の注意水域 (未満)', unit: '倍',
    defaultValue: DSCR_CAUTION_THRESHOLD, min: 0.1, max: 10, kind: 'threshold',
    note: '金融機関が求めることの多い 1.2〜1.3 の下側',
  },
  // --- 税 -----------------------------------------------------------------
  {
    id: 'tax.consumptionStandardRate', feature: '税', label: '消費税率 (標準)', unit: '%', scale: 100,
    defaultValue: CONSUMPTION_TAX_STANDARD, min: 0, max: 0.5, kind: 'law', source: '消費税法 (10%)',
  },
  {
    id: 'tax.consumptionReducedRate', feature: '税', label: '消費税率 (軽減)', unit: '%', scale: 100,
    defaultValue: CONSUMPTION_TAX_REDUCED, min: 0, max: 0.5, kind: 'law', source: '消費税法 (8%)',
  },
  // --- 所得税・住民税 -------------------------------------------------------
  {
    id: 'incomeTax.reconstructionSurtaxRate', feature: '所得税・住民税', label: '復興特別所得税の付加率', unit: '%', scale: 100,
    defaultValue: RECONSTRUCTION_SURTAX_RATE, min: 0, max: 0.2, kind: 'law',
    source: '復興財源確保法 (基準所得税額 × 2.1%、2037 年分まで)',
  },
  {
    id: 'incomeTax.socialInsuranceEstimateRate', feature: '所得税・住民税', label: '手取り試算の社会保険料率 (額面比例の概算)', unit: '%', scale: 100,
    defaultValue: SOCIAL_INSURANCE_RATE, min: 0, max: 0.5, kind: 'assumption',
    note: '簡易な手取り試算だけが使う。精密な社会保険料は等級表と下の料率で別に出す',
  },
  {
    id: 'residentTax.incomeRate', feature: '所得税・住民税', label: '住民税の所得割率 (都道府県 + 市町村)', unit: '%', scale: 100,
    defaultValue: RESIDENT_TAX_RATE, min: 0, max: 0.3, kind: 'law',
    source: '地方税法 (標準 4% + 6%)', note: '超過課税の自治体はその率に',
  },
  {
    id: 'residentTax.perCapita', feature: '所得税・住民税', label: '住民税の均等割 (森林環境税を含む年額)', unit: '円',
    defaultValue: RESIDENT_TAX_PER_CAPITA, min: 0, max: 100_000, integer: true, kind: 'law',
    source: '地方税法 (基礎 4,000 円) + 森林環境税 1,000 円', note: '上乗せのある自治体はその額に',
  },
  // --- 所得控除・税額控除 ---------------------------------------------------
  {
    id: 'deduction.spouseSpecialIncomeLimit', feature: '所得控除・税額控除', label: '配偶者特別控除の配偶者所得の上限', unit: '円',
    defaultValue: SPOUSE_SPECIAL_INCOME_LIMIT_YEN, min: 0, max: 10_000_000, integer: true, kind: 'law',
    source: '所得税法 (133 万円)', note: '入口 (配偶者控除の所得要件) は年分で決まるので台帳に無い',
  },
  {
    id: 'deduction.dependentIncomeLimit', feature: '所得控除・税額控除', label: '扶養親族の合計所得の上限', unit: '円',
    defaultValue: DEPENDENT_INCOME_LIMIT, min: 0, max: 10_000_000, integer: true, kind: 'law', source: '所得税法 (48 万円)',
  },
  {
    id: 'deduction.selfMedicationThreshold', feature: '所得控除・税額控除', label: 'セルフメディケーション税制の足切り', unit: '円',
    defaultValue: SELF_MEDICATION_THRESHOLD, min: 0, max: 1_000_000, integer: true, kind: 'law', source: '租税特別措置法 (12,000 円)',
  },
  {
    id: 'deduction.selfMedicationCap', feature: '所得控除・税額控除', label: 'セルフメディケーション税制の控除上限', unit: '円',
    defaultValue: SELF_MEDICATION_CAP, min: 0, max: 10_000_000, integer: true, kind: 'law', source: '租税特別措置法 (88,000 円)',
  },
  {
    id: 'deduction.smallBizMutualAnnualCap', feature: '所得控除・税額控除', label: '小規模企業共済の年間拠出上限', unit: '円',
    defaultValue: SMALL_BIZ_MUTUAL_ANNUAL_CAP, min: 0, max: 10_000_000, integer: true, kind: 'law', source: '小規模企業共済法 (月 7 万円)',
  },
  {
    id: 'deduction.donationFloor', feature: '所得控除・税額控除', label: '寄附金控除の足切り', unit: '円',
    defaultValue: DONATION_DEDUCTION_FLOOR, min: 0, max: 1_000_000, integer: true, kind: 'law', source: '所得税法 (2,000 円)',
  },
  {
    id: 'deduction.donationIncomeCapRate', feature: '所得控除・税額控除', label: '寄附金控除の上限 (合計所得に対する割合)', unit: '%', scale: 100,
    defaultValue: DONATION_INCOME_CAP_RATE, min: 0, max: 1, kind: 'law', source: '所得税法 (40%)',
  },
  {
    id: 'deduction.casualtyDisasterFloor', feature: '所得控除・税額控除', label: '雑損控除の災害関連支出の足切り', unit: '円',
    defaultValue: CASUALTY_DISASTER_FLOOR, min: 0, max: 10_000_000, integer: true, kind: 'law', source: '所得税法 (5 万円)',
  },
  {
    id: 'deduction.casualtyIncomeRate', feature: '所得控除・税額控除', label: '雑損控除の総所得に対する足切り率', unit: '%', scale: 100,
    defaultValue: CASUALTY_INCOME_RATE, min: 0, max: 1, kind: 'law', source: '所得税法 (10%)',
  },
  {
    id: 'deduction.basicHumanDeductionDiff', feature: '所得控除・税額控除', label: '調整控除の基礎控除分の人的控除差', unit: '円',
    defaultValue: BASIC_HUMAN_DEDUCTION_DIFF, min: 0, max: 1_000_000, integer: true, kind: 'law', source: '地方税法 (5 万円)',
  },
  {
    id: 'credit.mortgageIncomeLimit', feature: '所得控除・税額控除', label: '住宅ローン控除の合計所得の上限', unit: '円',
    defaultValue: MORTGAGE_INCOME_LIMIT, min: 0, max: 100_000_000, integer: true, kind: 'law', source: '租税特別措置法 (2,000 万円)',
  },
  {
    id: 'credit.mortgageResidentCapRate', feature: '所得控除・税額控除', label: '住宅ローン控除の住民税側の上限率 (課税総所得に対して)', unit: '%', scale: 100,
    defaultValue: MORTGAGE_RESIDENT_CAP_RATE, min: 0, max: 1, kind: 'law', source: '地方税法附則 (5%)',
  },
  {
    id: 'credit.mortgageResidentCapMax', feature: '所得控除・税額控除', label: '住宅ローン控除の住民税側の上限額', unit: '円',
    defaultValue: MORTGAGE_RESIDENT_CAP_MAX, min: 0, max: 1_000_000, integer: true, kind: 'law', source: '地方税法附則 (97,500 円)',
  },
  {
    id: 'credit.residentLevyWithholdingRate', feature: '所得控除・税額控除', label: '配当割・株式等譲渡所得割の源泉率 (住民税)', unit: '%', scale: 100,
    defaultValue: RESIDENT_LEVY_WITHHOLDING_RATE, min: 0, max: 0.5, kind: 'law', source: '地方税法 (5%)',
  },
  // --- 不動産・登記・印紙の税 -------------------------------------------------
  {
    id: 'fixedAsset.standardRate', feature: '不動産・登記・印紙の税', label: '固定資産税の税率', unit: '%', scale: 100,
    defaultValue: FIXED_ASSET_STANDARD_RATE, min: 0, max: 0.1, kind: 'law', source: '地方税法 350 条 (標準税率 1.4%)',
    note: '超過課税の自治体はその率に',
  },
  {
    id: 'fixedAsset.cityPlanningRate', feature: '不動産・登記・印紙の税', label: '都市計画税の税率', unit: '%', scale: 100,
    defaultValue: CITY_PLANNING_MAX_RATE, min: 0, max: 0.1, kind: 'law', source: '地方税法 702 条の 4 (制限税率 0.3%)',
    note: '市町村の条例の率に (制限税率より低いことがある)',
  },
  {
    id: 'fixedAsset.landThreshold', feature: '不動産・登記・印紙の税', label: '固定資産税の免税点 (土地)', unit: '円',
    defaultValue: LAND_TAX_THRESHOLD, min: 0, max: 100_000_000, integer: true, kind: 'law', source: '地方税法 351 条 (30 万円)',
  },
  {
    id: 'fixedAsset.houseThreshold', feature: '不動産・登記・印紙の税', label: '固定資産税の免税点 (家屋)', unit: '円',
    defaultValue: HOUSE_TAX_THRESHOLD, min: 0, max: 100_000_000, integer: true, kind: 'law', source: '地方税法 351 条 (20 万円)',
  },
  {
    id: 'fixedAsset.depreciableThreshold', feature: '不動産・登記・印紙の税', label: '固定資産税の免税点 (償却資産)', unit: '円',
    defaultValue: DEPRECIABLE_ASSET_TAX_THRESHOLD, min: 0, max: 100_000_000, integer: true, kind: 'law', source: '地方税法 351 条 (150 万円)',
  },
  {
    id: 'acquisition.standardRate', feature: '不動産・登記・印紙の税', label: '不動産取得税の本則税率', unit: '%', scale: 100,
    defaultValue: ACQ_STANDARD_RATE, min: 0, max: 0.2, kind: 'law', source: '地方税法 73 条の 15 (4%)',
  },
  {
    id: 'acquisition.reducedRate', feature: '不動産・登記・印紙の税', label: '不動産取得税の軽減税率 (土地・住宅)', unit: '%', scale: 100,
    defaultValue: ACQ_REDUCED_RATE, min: 0, max: 0.2, kind: 'law', source: '地方税法附則 11 条の 2 (3%)',
  },
  {
    id: 'acquisition.landThreshold', feature: '不動産・登記・印紙の税', label: '不動産取得税の免税点 (土地)', unit: '円',
    defaultValue: ACQ_LAND_THRESHOLD, min: 0, max: 100_000_000, integer: true, kind: 'law', source: '地方税法 73 条の 15 の 2 (10 万円)',
  },
  {
    id: 'acquisition.newBuildingThreshold', feature: '不動産・登記・印紙の税', label: '不動産取得税の免税点 (新築家屋)', unit: '円',
    defaultValue: ACQ_NEW_BUILDING_THRESHOLD, min: 0, max: 100_000_000, integer: true, kind: 'law', source: '地方税法 73 条の 15 の 2 (23 万円)',
  },
  {
    id: 'acquisition.otherBuildingThreshold', feature: '不動産・登記・印紙の税', label: '不動産取得税の免税点 (その他家屋)', unit: '円',
    defaultValue: ACQ_OTHER_BUILDING_THRESHOLD, min: 0, max: 100_000_000, integer: true, kind: 'law', source: '地方税法 73 条の 15 の 2 (12 万円)',
  },
  {
    id: 'registration.rateTransferSale', feature: '不動産・登記・印紙の税', label: '登録免許税 所有権移転 (売買)', unit: '%', scale: 100,
    defaultValue: RATE_TRANSFER_SALE, min: 0, max: 0.1, kind: 'law', source: '登録免許税法 別表第一 (20/1000)',
    note: '土地売買の軽減 (1.5%) や住宅用家屋の軽減はここに置く',
  },
  {
    id: 'registration.ratePreservation', feature: '不動産・登記・印紙の税', label: '登録免許税 所有権保存 (新築)', unit: '%', scale: 100,
    defaultValue: RATE_PRESERVATION, min: 0, max: 0.1, kind: 'law', source: '登録免許税法 別表第一 (4/1000)',
  },
  {
    id: 'registration.rateTransferInheritance', feature: '不動産・登記・印紙の税', label: '登録免許税 所有権移転 (相続)', unit: '%', scale: 100,
    defaultValue: RATE_TRANSFER_INHERITANCE, min: 0, max: 0.1, kind: 'law', source: '登録免許税法 別表第一 (4/1000)',
  },
  {
    id: 'registration.rateTransferGift', feature: '不動産・登記・印紙の税', label: '登録免許税 所有権移転 (贈与)', unit: '%', scale: 100,
    defaultValue: RATE_TRANSFER_GIFT, min: 0, max: 0.1, kind: 'law', source: '登録免許税法 別表第一 (20/1000)',
  },
  {
    id: 'registration.rateMortgage', feature: '不動産・登記・印紙の税', label: '登録免許税 抵当権設定', unit: '%', scale: 100,
    defaultValue: RATE_MORTGAGE, min: 0, max: 0.1, kind: 'law', source: '登録免許税法 別表第一 (4/1000)',
  },
  {
    id: 'stamp.continuousBasicContractDuty', feature: '不動産・登記・印紙の税', label: '印紙税 第 7 号文書 (継続的取引の基本契約) の一律額', unit: '円',
    defaultValue: CONTINUOUS_BASIC_CONTRACT_DUTY, min: 0, max: 1_000_000, integer: true, kind: 'law', source: '印紙税法 別表第一 (4,000 円)',
  },
  {
    id: 'stamp.noAmountDuty', feature: '不動産・登記・印紙の税', label: '印紙税 記載金額のない文書の税額', unit: '円',
    defaultValue: NO_AMOUNT_DUTY, min: 0, max: 1_000_000, integer: true, kind: 'law', source: '印紙税法 別表第一 (200 円)',
  },
  // --- 譲渡所得 -------------------------------------------------------------
  {
    id: 'capitalGains.residentialSpecialDeduction', feature: '譲渡所得', label: '居住用財産の特別控除', unit: '円',
    defaultValue: RESIDENTIAL_SPECIAL_DEDUCTION, min: 0, max: 1_000_000_000, integer: true, kind: 'law',
    source: '租税特別措置法 35 条 (3,000 万円)',
  },
  {
    id: 'capitalGains.residentialReducedRateCap', feature: '譲渡所得', label: '居住用財産の軽減税率が適用される課税譲渡所得の上限', unit: '円',
    defaultValue: RESIDENTIAL_REDUCED_RATE_CAP, min: 0, max: 1_000_000_000, integer: true, kind: 'law',
    source: '租税特別措置法 31 条の 3 (6,000 万円)',
  },
  {
    id: 'capitalGains.estimatedAcquisitionCostRate', feature: '譲渡所得', label: '概算取得費の割合 (譲渡収入に対して)', unit: '%', scale: 100,
    defaultValue: ESTIMATED_ACQUISITION_COST_RATE, min: 0, max: 1, kind: 'law', source: '租税特別措置法 31 条の 4 (5%)',
  },
  // --- 法人税 ---------------------------------------------------------------
  {
    id: 'corporate.reducedRate', feature: '法人税', label: '法人税の軽減税率 (中小・年 800 万円以下の部分)', unit: '%', scale: 100,
    defaultValue: CORP_TAX_REDUCED_RATE, min: 0, max: 0.5, kind: 'law', source: '租税特別措置法 42 条の 3 の 2 (15%)',
  },
  {
    id: 'corporate.standardRate', feature: '法人税', label: '法人税の本則税率', unit: '%', scale: 100,
    defaultValue: CORP_TAX_STANDARD_RATE, min: 0, max: 0.5, kind: 'law', source: '法人税法 66 条 (23.2%)',
  },
  {
    id: 'corporate.reducedThreshold', feature: '法人税', label: '軽減税率が適用される所得の上限', unit: '円',
    defaultValue: CORP_TAX_REDUCED_THRESHOLD, min: 0, max: 1_000_000_000, integer: true, kind: 'law', source: '法人税法 66 条 (年 800 万円)',
  },
  {
    id: 'corporate.localCorpTaxRate', feature: '法人税', label: '地方法人税率 (法人税額に対して)', unit: '%', scale: 100,
    defaultValue: LOCAL_CORP_TAX_RATE, min: 0, max: 0.5, kind: 'law', source: '地方法人税法 10 条 (10.3%)',
  },
  {
    id: 'corporate.residentCorpTaxRate', feature: '法人税', label: '法人住民税 法人税割の税率', unit: '%', scale: 100,
    defaultValue: RESIDENT_CORP_TAX_RATE, min: 0, max: 0.5, kind: 'law', source: '地方税法 (標準 7.0%)', note: '超過課税の自治体はその率に',
  },
  {
    id: 'corporate.defaultPerCapitaLevy', feature: '法人税', label: '法人住民税 均等割の既定 (資本金未入力のとき)', unit: '円',
    defaultValue: DEFAULT_PER_CAPITA_LEVY, min: 0, max: 10_000_000, integer: true, kind: 'assumption', note: '最小区分 7 万円 (都道府県 2 万 + 市町村 5 万)',
  },
  {
    id: 'corporate.perCapitaEmployeeThreshold', feature: '法人税', label: '均等割の従業者数の境目 (超で大区分)', unit: '人',
    defaultValue: PER_CAPITA_EMPLOYEE_THRESHOLD, min: 0, max: 10_000, integer: true, kind: 'law', source: '地方税法 (50 人)',
  },
  {
    id: 'corporate.businessTaxRateTier1', feature: '法人税', label: '法人事業税 所得割 (年 400 万円以下)', unit: '%', scale: 100,
    defaultValue: BUSINESS_TAX_RATE_TIER1, min: 0, max: 0.5, kind: 'law', source: '地方税法 72 条の 24 の 7 (標準 3.5%)',
  },
  {
    id: 'corporate.businessTaxRateTier2', feature: '法人税', label: '法人事業税 所得割 (400 万円超 800 万円以下)', unit: '%', scale: 100,
    defaultValue: BUSINESS_TAX_RATE_TIER2, min: 0, max: 0.5, kind: 'law', source: '地方税法 72 条の 24 の 7 (標準 5.3%)',
  },
  {
    id: 'corporate.businessTaxRateTier3', feature: '法人税', label: '法人事業税 所得割 (800 万円超)', unit: '%', scale: 100,
    defaultValue: BUSINESS_TAX_RATE_TIER3, min: 0, max: 0.5, kind: 'law', source: '地方税法 72 条の 24 の 7 (標準 7.0%)',
  },
  {
    id: 'corporate.businessTaxTier1Limit', feature: '法人税', label: '法人事業税の所得段階の境目 (下)', unit: '円',
    defaultValue: BUSINESS_TAX_TIER1_LIMIT, min: 0, max: 1_000_000_000, integer: true, kind: 'law', source: '地方税法 (年 400 万円)',
  },
  {
    id: 'corporate.businessTaxTier2Limit', feature: '法人税', label: '法人事業税の所得段階の境目 (上)', unit: '円',
    defaultValue: BUSINESS_TAX_TIER2_LIMIT, min: 0, max: 1_000_000_000, integer: true, kind: 'law', source: '地方税法 (年 800 万円)',
  },
  {
    id: 'corporate.specialBusinessTaxRate', feature: '法人税', label: '特別法人事業税率 (基準法人所得割額に対して)', unit: '%', scale: 100,
    defaultValue: SPECIAL_BUSINESS_TAX_RATE, min: 0, max: 2, kind: 'law', source: '特別法人事業税法 (37%)',
  },
  {
    id: 'corporate.largeCorpCapitalThreshold', feature: '法人税', label: '大法人と判定する資本金の境目 (超)', unit: '円',
    defaultValue: LARGE_CORP_CAPITAL_THRESHOLD, min: 0, max: 100_000_000_000, integer: true, kind: 'law', source: '法人税法 66 条 (1 億円)',
  },
  {
    id: 'corporate.largeCorpLossDeductionRatio', feature: '法人税', label: '大法人の繰越欠損金の控除限度 (所得に対する割合)', unit: '%', scale: 100,
    defaultValue: LARGE_CORP_LOSS_DEDUCTION_RATIO, min: 0, max: 1, kind: 'law', source: '法人税法 57 条 (50%)',
  },
  // --- 消費税 (事業者) ---------------------------------------------------------
  {
    id: 'consumptionBusiness.twentyPercentRate', feature: '消費税 (事業者)', label: '2 割特例の納付割合 (売上税額に対して)', unit: '%', scale: 100,
    defaultValue: TWENTY_PERCENT_RATE, min: 0, max: 1, kind: 'law', source: '平成 28 年改正法附則 51 条の 2 (20%)',
  },
  {
    id: 'consumptionBusiness.exemptionThreshold', feature: '消費税 (事業者)', label: '免税事業者となる基準期間の課税売上高の上限', unit: '円',
    defaultValue: EXEMPTION_THRESHOLD, min: 0, max: 10_000_000_000, integer: true, kind: 'law', source: '消費税法 9 条 (1,000 万円)',
  },
  {
    id: 'consumptionBusiness.simplifiedEligibilityThreshold', feature: '消費税 (事業者)', label: '簡易課税を選べる基準期間の課税売上高の上限', unit: '円',
    defaultValue: SIMPLIFIED_ELIGIBILITY_THRESHOLD, min: 0, max: 10_000_000_000, integer: true, kind: 'law', source: '消費税法 37 条 (5,000 万円)',
  },
  {
    id: 'consumptionBusiness.fullCreditRatioThreshold', feature: '消費税 (事業者)', label: '全額控除の要件: 課税売上割合 (以上)', unit: '%', scale: 100,
    defaultValue: FULL_CREDIT_RATIO_THRESHOLD, min: 0, max: 1, kind: 'law', source: '消費税法 30 条 (95%)',
  },
  {
    id: 'consumptionBusiness.fullCreditSalesThreshold', feature: '消費税 (事業者)', label: '全額控除の要件: 課税売上高 (以下)', unit: '円',
    defaultValue: FULL_CREDIT_SALES_THRESHOLD, min: 0, max: 100_000_000_000, integer: true, kind: 'law', source: '消費税法 30 条 (5 億円)',
  },
  // --- 年金・一時所得・ふるさと納税 -----------------------------------------------
  {
    id: 'pension.deductionMinUnder65', feature: '年金・一時所得・ふるさと納税', label: '公的年金等控除の最低額 (65 歳未満)', unit: '円',
    defaultValue: PENSION_DEDUCTION_MIN_UNDER65, min: 0, max: 10_000_000, integer: true, kind: 'law', source: '所得税法 35 条 (60 万円)',
  },
  {
    id: 'pension.deductionMinOver65', feature: '年金・一時所得・ふるさと納税', label: '公的年金等控除の最低額 (65 歳以上)', unit: '円',
    defaultValue: PENSION_DEDUCTION_MIN_OVER65, min: 0, max: 10_000_000, integer: true, kind: 'law', source: '所得税法 35 条 (110 万円)',
  },
  {
    id: 'casual.specialDeduction', feature: '年金・一時所得・ふるさと納税', label: '一時所得の特別控除の上限', unit: '円',
    defaultValue: CASUAL_INCOME_SPECIAL_DEDUCTION, min: 0, max: 10_000_000, integer: true, kind: 'law', source: '所得税法 34 条 (50 万円)',
  },
  {
    id: 'furusato.selfPay', feature: '年金・一時所得・ふるさと納税', label: 'ふるさと納税の自己負担額', unit: '円',
    defaultValue: FURUSATO_SELF_PAY, min: 0, max: 100_000, integer: true, kind: 'law', source: '地方税法 37 条の 2 (2,000 円)',
  },
  {
    id: 'furusato.oneStopMaxMunicipalities', feature: '年金・一時所得・ふるさと納税', label: 'ワンストップ特例を使える寄附先自治体数の上限', unit: '自治体',
    defaultValue: FURUSATO_ONE_STOP_MAX_MUNICIPALITIES, min: 1, max: 100, integer: true, kind: 'law', source: '地方税法附則 7 条 (5 自治体)',
  },
  // --- 貿易 -----------------------------------------------------------------
  {
    id: 'trade.nationalStandardRate', feature: '貿易', label: '輸入消費税 (国税) の標準税率', unit: '%', scale: 100,
    defaultValue: JP_NATIONAL_STANDARD, min: 0, max: 0.5, kind: 'law', source: '消費税法 29 条 (7.8%)', note: '地方消費税はその 22/78',
  },
  {
    id: 'trade.nationalReducedRate', feature: '貿易', label: '輸入消費税 (国税) の軽減税率', unit: '%', scale: 100,
    defaultValue: JP_NATIONAL_REDUCED, min: 0, max: 0.5, kind: 'law', source: '消費税法 29 条 (6.24%)',
  },
  {
    id: 'trade.smallValueLimit', feature: '貿易', label: '少額輸入貨物の免税基準 (課税価格の合計額)', unit: '円',
    defaultValue: SMALL_VALUE_LIMIT, min: 0, max: 10_000_000, integer: true, kind: 'law', source: '関税定率法 14 条 (1 万円)', note: '2028 年 4 月に廃止予定',
  },
  {
    id: 'trade.personalUseFactor', feature: '貿易', label: '個人的使用の課税価格 (海外小売価格に対する割合)', unit: '%', scale: 100,
    defaultValue: PERSONAL_USE_FACTOR, min: 0, max: 1, kind: 'law', source: '関税定率法 4 条の 6 (60%)',
  },
  // --- 社会保険 -------------------------------------------------------------
  {
    id: 'socialInsurance.pensionRate', feature: '社会保険', label: '厚生年金保険料率 (本人負担)', unit: '%', scale: 100,
    defaultValue: PENSION_RATE, min: 0, max: 0.3, kind: 'law', source: '厚生年金保険法 (18.3% の半分)',
  },
  {
    id: 'socialInsurance.healthRate', feature: '社会保険', label: '健康保険料率 (本人負担・40 歳未満)', unit: '%', scale: 100,
    defaultValue: HEALTH_RATE, min: 0, max: 0.3, kind: 'reference',
    source: '協会けんぽ 全国平均 (約 10% の半分)', note: '都道府県別の率に置き換える',
  },
  {
    id: 'socialInsurance.careRate', feature: '社会保険', label: '介護保険料率 (本人負担・40〜64 歳の上乗せ)', unit: '%', scale: 100,
    defaultValue: CARE_RATE, min: 0, max: 0.1, kind: 'law', source: '協会けんぽ 令和8年度 (1.62% の半分)',
  },
  {
    id: 'socialInsurance.employmentRate', feature: '社会保険', label: '雇用保険料率 (本人負担・一般の事業)', unit: '%', scale: 100,
    defaultValue: EMPLOYMENT_INSURANCE_RATE, min: 0, max: 0.1, kind: 'law', source: '雇用保険法 令和8年度 (0.5%)',
  },
  {
    id: 'socialInsurance.pensionBonusCapPerPayment', feature: '社会保険', label: '厚生年金の標準賞与額の上限 (1 回あたり)', unit: '円',
    defaultValue: PENSION_BONUS_CAP_PER_PAYMENT, min: 0, max: 100_000_000, integer: true, kind: 'law',
    source: '厚生年金保険法 (150 万円)',
  },
  {
    id: 'socialInsurance.healthBonusCapAnnual', feature: '社会保険', label: '健康保険の標準賞与額の上限 (年度累計)', unit: '円',
    defaultValue: HEALTH_BONUS_CAP_ANNUAL, min: 0, max: 100_000_000, integer: true, kind: 'law',
    source: '健康保険法 (573 万円)',
  },
  // --- 財務 ---------------------------------------------------------------
  {
    id: 'finance.effectiveTaxRate', feature: '財務', label: '実効税率 (NOPAT・税引後の試算)', unit: '%', scale: 100,
    defaultValue: DEFAULT_EFFECTIVE_TAX_RATE, min: 0, max: 1, kind: 'assumption',
    note: '中小法人の目安 30%。実績の税負担率が分かれば置き換える',
  },
  ] as const satisfies readonly ParameterDef[];
}

export const PARAMETERS = parameterDefinitions();

export type ParameterId = (typeof PARAMETERS)[number]['id'];
export type ParameterValues = Readonly<Record<ParameterId, number>>;
export type ParameterOverrides = Readonly<Partial<Record<ParameterId, number>>>;

export const PARAMETER_BY_ID: ReadonlyMap<string, ParameterDef> = new Map(PARAMETERS.map((p) => [p.id, p]));

export function isParameterId(id: unknown): id is ParameterId {
  // 文字列以外は Map に無いので typeof の前置きは要らない (等価な分岐を置かない)。
  return PARAMETER_BY_ID.has(id as string);
}

/** 画面のまとまり (登場順)。 */
export function parameterFeatures(): readonly string[] {
  const out: string[] = [];
  for (const p of PARAMETERS) if (!out.includes(p.feature)) out.push(p.feature);
  return out;
}

/**
 * 内部値 → 画面の値 (scale を掛ける)。0.07 × 100 = 7.000000000000001 を 7 に戻す
 * ため有効桁 12 で丸める (画面に浮動小数の尾を出さない)。
 */
export function toDisplayValue(def: ParameterDef, internal: number): number {
  return Number((internal * (def.scale ?? 1)).toPrecision(12));
}

/**
 * 画面の値 → 内部値 (scale で割る)。こちらも有効桁 12 で丸める —
 * 0.81 ÷ 100 = 0.008100000000000001 のままだと、既定 0.0081 と「違う値」に
 * 見えて保存ボタンが立ち、その尾つきの値が保存される。
 */
export function fromDisplayValue(def: ParameterDef, display: number): number {
  return Number((display / (def.scale ?? 1)).toPrecision(12));
}

/** id で引く版 (画面の文言が「いま効いている値」を単位つきで言うため)。 */
export function displayValue(id: ParameterId, internal: number): number {
  return toDisplayValue(PARAMETER_BY_ID.get(id)!, internal);
}

/**
 * 候補の値を検査する。通れば null、通らなければ利用者向けの文。
 * 範囲は**内部値** (scale を掛ける前) で見る。文の数字は画面の値で言う。
 */
export function parameterIssue(def: ParameterDef, raw: unknown): string | null {
  const shown = (v: number) => `${toDisplayValue(def, v)}${def.unit}`;
  // Number.isFinite は変換せずに照合するので、数でない値 (文字列・null・物) も false になる。
  if (!Number.isFinite(raw)) return '数値で入力してください';
  const n = raw as number;
  if (n < def.min) return `${shown(def.min)} 以上で入力してください`;
  if (n > def.max) return `${shown(def.max)} 以下で入力してください`;
  if (def.integer && !Number.isInteger(toDisplayValue(def, n))) return '整数で入力してください';
  return null;
}

/**
 * 保存された上書きを検証して返す。知らない id と通らない値は捨てる
 * (壊れた保存で画面ごと落とさない)。既定と同じ値も「上書き」として残す —
 * 利用者が明示的に置いた値は、既定が改正で動いても動かさない。
 */
export function sanitizeParameterOverrides(raw: unknown): ParameterOverrides {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Partial<Record<ParameterId, number>> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isParameterId(id)) continue;
    const def = PARAMETER_BY_ID.get(id)!;
    if (parameterIssue(def, value) !== null) continue;
    out[id] = value as number;
  }
  return out;
}

/** 既定に上書きを重ねた有効値。 */
export function resolveParameters(overrides: ParameterOverrides = {}): ParameterValues {
  const out: Record<string, number> = {};
  for (const p of PARAMETERS) {
    const o = overrides[p.id];
    // undefined は parameterIssue が「数値で」と断るので、前置きの判定は要らない。
    out[p.id] = parameterIssue(p, o) === null ? (o as number) : p.defaultValue;
  }
  return out as ParameterValues;
}

/** 既定そのもの (上書きなし)。 */
export const DEFAULT_PARAMETER_VALUES: ParameterValues = resolveParameters();

/** 上書きされている id の数 (画面の見出し用)。 */
export function overriddenCount(overrides: ParameterOverrides): number {
  return Object.keys(overrides).filter((id) => isParameterId(id)).length;
}

// --- 機能ごとの取り出し口 (画面が関数へ渡す形に組む) ---------------------------

export function hydroponicsProductionParams(v: ParameterValues): ProductionParams {
  return { panelAreaSqm: v['hydroponics.panelAreaSqm'], daysPerYear: v['hydroponics.daysPerYear'] };
}

export function lowPotassiumParams(v: ParameterValues): LowPotassiumParams {
  return {
    referencePotassiumMgPer100g: v['hydroponics.referenceLettucePotassiumMg'],
    saltEquivalentFactor: v['hydroponics.saltEquivalentFactor'],
    switchDaysMin: v['hydroponics.lowKSwitchDaysMin'],
    switchDaysMax: v['hydroponics.lowKSwitchDaysMax'],
  };
}

/** 病期別の 1 日上限。制限のない病期 (G1〜G3a) は台帳の null をそのまま保つ。 */
export function ckdPotassiumLimits(v: ParameterValues): Readonly<Record<CkdStage, number | null>> {
  return {
    ...CKD_POTASSIUM_LIMIT_MG,
    G3b: v['hydroponics.ckdPotassiumLimitG3b'],
    G4: v['hydroponics.ckdPotassiumLimitG4'],
    G5: v['hydroponics.ckdPotassiumLimitG5'],
  };
}

export function dscrThresholds(v: ParameterValues): DscrThresholds {
  return { danger: v['realEstate.dscrDangerThreshold'], caution: v['realEstate.dscrCautionThreshold'] };
}

export function deductionParams(v: ParameterValues): DeductionParams {
  return {
    spouseSpecialIncomeLimit: v['deduction.spouseSpecialIncomeLimit'],
    dependentIncomeLimit: v['deduction.dependentIncomeLimit'],
    selfMedicationThreshold: v['deduction.selfMedicationThreshold'],
    selfMedicationCap: v['deduction.selfMedicationCap'],
    smallBizMutualAnnualCap: v['deduction.smallBizMutualAnnualCap'],
    donationDeductionFloor: v['deduction.donationFloor'],
    donationIncomeCapRate: v['deduction.donationIncomeCapRate'],
    casualtyDisasterFloor: v['deduction.casualtyDisasterFloor'],
    casualtyIncomeRate: v['deduction.casualtyIncomeRate'],
    basicHumanDeductionDiff: v['deduction.basicHumanDeductionDiff'],
  };
}

export function mortgageCreditParams(v: ParameterValues): MortgageCreditParams {
  return {
    incomeLimit: v['credit.mortgageIncomeLimit'],
    residentCapRate: v['credit.mortgageResidentCapRate'],
    residentCapMax: v['credit.mortgageResidentCapMax'],
  };
}

export function fixedAssetRates(v: ParameterValues): { readonly fixedRate: number; readonly cityPlanningRate: number } {
  return { fixedRate: v['fixedAsset.standardRate'], cityPlanningRate: v['fixedAsset.cityPlanningRate'] };
}

export function fixedAssetThresholds(v: ParameterValues): FixedAssetThresholds {
  return {
    land: v['fixedAsset.landThreshold'],
    house: v['fixedAsset.houseThreshold'],
    depreciableAsset: v['fixedAsset.depreciableThreshold'],
  };
}

export function acquisitionParams(v: ParameterValues): AcquisitionParams {
  return {
    standardRate: v['acquisition.standardRate'],
    reducedRate: v['acquisition.reducedRate'],
    landThreshold: v['acquisition.landThreshold'],
    newBuildingThreshold: v['acquisition.newBuildingThreshold'],
    otherBuildingThreshold: v['acquisition.otherBuildingThreshold'],
  };
}

export function registrationRates(v: ParameterValues): Readonly<Record<RegistrationType, number>> {
  return {
    transferSale: v['registration.rateTransferSale'],
    preservation: v['registration.ratePreservation'],
    transferInheritance: v['registration.rateTransferInheritance'],
    transferGift: v['registration.rateTransferGift'],
    mortgage: v['registration.rateMortgage'],
  };
}

export function stampDutyParams(v: ParameterValues): StampDutyParams {
  return { continuousBasicContractDuty: v['stamp.continuousBasicContractDuty'], noAmountDuty: v['stamp.noAmountDuty'] };
}

/** 譲渡所得の特例と復興特別所得税 (所得税・住民税の項の付加率を共有する)。 */
export function capitalGainsParams(v: ParameterValues): CapitalGainsParams {
  return {
    residentialSpecialDeduction: v['capitalGains.residentialSpecialDeduction'],
    residentialReducedRateCap: v['capitalGains.residentialReducedRateCap'],
    surtaxRate: v['incomeTax.reconstructionSurtaxRate'],
  };
}

export function corporateTaxRates(v: ParameterValues): CorporateTaxRates {
  return {
    reducedRate: v['corporate.reducedRate'],
    standardRate: v['corporate.standardRate'],
    reducedThreshold: v['corporate.reducedThreshold'],
    localCorpTaxRate: v['corporate.localCorpTaxRate'],
    residentCorpTaxRate: v['corporate.residentCorpTaxRate'],
    defaultPerCapitaLevy: v['corporate.defaultPerCapitaLevy'],
    perCapitaEmployeeThreshold: v['corporate.perCapitaEmployeeThreshold'],
    businessTaxRateTier1: v['corporate.businessTaxRateTier1'],
    businessTaxRateTier2: v['corporate.businessTaxRateTier2'],
    businessTaxRateTier3: v['corporate.businessTaxRateTier3'],
    businessTaxTier1Limit: v['corporate.businessTaxTier1Limit'],
    businessTaxTier2Limit: v['corporate.businessTaxTier2Limit'],
    specialBusinessTaxRate: v['corporate.specialBusinessTaxRate'],
    largeCorpCapitalThreshold: v['corporate.largeCorpCapitalThreshold'],
    largeCorpLossDeductionRatio: v['corporate.largeCorpLossDeductionRatio'],
  };
}

/** 事業者の消費税 — 税率は「税」の消費税率を共有する。 */
export function businessConsumptionParams(v: ParameterValues): BusinessConsumptionParams {
  return {
    rates: { standard: v['tax.consumptionStandardRate'], reduced: v['tax.consumptionReducedRate'] },
    twentyPercentRate: v['consumptionBusiness.twentyPercentRate'],
    exemptionThreshold: v['consumptionBusiness.exemptionThreshold'],
    simplifiedEligibilityThreshold: v['consumptionBusiness.simplifiedEligibilityThreshold'],
    fullCreditRatioThreshold: v['consumptionBusiness.fullCreditRatioThreshold'],
    fullCreditSalesThreshold: v['consumptionBusiness.fullCreditSalesThreshold'],
  };
}

export function pensionDeductionParams(v: ParameterValues): PensionDeductionParams {
  return { minUnder65: v['pension.deductionMinUnder65'], minOver65: v['pension.deductionMinOver65'] };
}

/** ふるさと納税 — 付加率は所得税の項を共有する。 */
export function furusatoParams(v: ParameterValues): FurusatoParams {
  return { selfPay: v['furusato.selfPay'], surtaxRate: v['incomeTax.reconstructionSurtaxRate'] };
}

export function importParams(v: ParameterValues): ImportParams {
  return {
    nationalStandard: v['trade.nationalStandardRate'],
    nationalReduced: v['trade.nationalReducedRate'],
    smallValueLimit: v['trade.smallValueLimit'],
    personalUseFactor: v['trade.personalUseFactor'],
  };
}

export function socialInsuranceRates(v: ParameterValues): SocialInsuranceRates {
  return {
    pensionRate: v['socialInsurance.pensionRate'],
    healthRate: v['socialInsurance.healthRate'],
    careRate: v['socialInsurance.careRate'],
    employmentRate: v['socialInsurance.employmentRate'],
    pensionBonusCapPerPayment: v['socialInsurance.pensionBonusCapPerPayment'],
    healthBonusCapAnnual: v['socialInsurance.healthBonusCapAnnual'],
  };
}

/** 住民税の自治体の値 (`calcResidentTax` の override の形)。 */
export function residentTaxOverride(v: ParameterValues): MunicipalityOverride {
  return { incomeRate: v['residentTax.incomeRate'], perCapita: v['residentTax.perCapita'] };
}

export function netSalaryParams(v: ParameterValues): NetSalaryParams {
  return {
    socialInsuranceRate: v['incomeTax.socialInsuranceEstimateRate'],
    surtaxRate: v['incomeTax.reconstructionSurtaxRate'],
    resident: residentTaxOverride(v),
  };
}

export function salaryTaxParams(v: ParameterValues): SalaryTaxParams {
  return { surtaxRate: v['incomeTax.reconstructionSurtaxRate'], resident: residentTaxOverride(v) };
}

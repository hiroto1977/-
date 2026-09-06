/**
 * 数値パラメータの台帳の検査。
 *
 * 守る性質は 4 つ:
 * 1. 既定値は各モジュールの定数**そのもの** (写しではない)。
 * 2. 保存された上書きは検証して読む (壊れた保存で画面が落ちない・通らない値は効かない)。
 * 3. 画面の値 (scale 後) と内部値の往復が既定値で崩れない。
 * 4. 取り出し口は台帳の id を関数の引数の形へ**正しい対応で**組む。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMETER_VALUES,
  PARAMETERS,
  furusatoParams,
  importParams,
  zoningRules,
  effluentStandards,
  financialHealthBands,
  radarAxisBands,
  scheduleParams,
  dividendParams,
  emotionThresholds,
  pensionDeductionParams,
  acquisitionParams,
  businessConsumptionParams,
  capitalGainsParams,
  corporateTaxRates,
  fixedAssetRates,
  fixedAssetThresholds,
  registrationRates,
  stampDutyParams,
  PARAMETER_BY_ID,
  PARAMETER_KIND_LABEL,
  ckdPotassiumLimits,
  deductionParams,
  displayValue,
  dscrThresholds,
  fromDisplayValue,
  hydroponicsProductionParams,
  isParameterId,
  lowPotassiumParams,
  mortgageCreditParams,
  netSalaryParams,
  overriddenCount,
  parameterDefinitions,
  parameterFeatures,
  parameterIssue,
  resolveParameters,
  residentTaxOverride,
  salaryTaxParams,
  sanitizeParameterOverrides,
  socialInsuranceRates,
  toDisplayValue,
  type ParameterDef,
  type ParameterId,
  type ParameterOverrides,
} from '../parameters';
import {
  CKD_POTASSIUM_LIMIT_MG,
  DAYS_PER_YEAR,
  DEFAULT_LOW_POTASSIUM_PARAMS,
  DEFAULT_PRODUCTION_PARAMS,
  LOW_K_SWITCH_DAYS_MAX,
  LOW_K_SWITCH_DAYS_MIN,
  PANEL_AREA_SQM,
  REFERENCE_LETTUCE_POTASSIUM_MG,
  SALT_EQUIVALENT_FACTOR,
} from '../hydroponics';
import { COMMUTE_PUBLIC_TRANSPORT_CAP } from '../payroll';
import { DEFAULT_DSCR_THRESHOLDS, DSCR_CAUTION_THRESHOLD, DSCR_DANGER_THRESHOLD } from '../realEstateMetrics';
import {
  CONSUMPTION_TAX_REDUCED,
  CONSUMPTION_TAX_STANDARD,
  DEFAULT_NET_SALARY_PARAMS,
  DEFAULT_SALARY_TAX_PARAMS,
  RECONSTRUCTION_SURTAX_RATE,
  RESIDENT_TAX_PER_CAPITA,
  RESIDENT_TAX_RATE,
  SOCIAL_INSURANCE_RATE,
} from '../taxCalc';
import {
  BASIC_HUMAN_DEDUCTION_DIFF,
  CASUALTY_DISASTER_FLOOR,
  CASUALTY_INCOME_RATE,
  DEFAULT_DEDUCTION_PARAMS,
  DEPENDENT_INCOME_LIMIT,
  DONATION_DEDUCTION_FLOOR,
  DONATION_INCOME_CAP_RATE,
  SELF_MEDICATION_CAP,
  SELF_MEDICATION_THRESHOLD,
  SMALL_BIZ_MUTUAL_ANNUAL_CAP,
  SPOUSE_SPECIAL_INCOME_LIMIT_YEN,
} from '../taxDeductions';
import {
  DEFAULT_MORTGAGE_CREDIT_PARAMS,
  MORTGAGE_INCOME_LIMIT,
  MORTGAGE_RESIDENT_CAP_MAX,
  MORTGAGE_RESIDENT_CAP_RATE,
  RESIDENT_LEVY_WITHHOLDING_RATE,
} from '../taxCredits';
import {
  CITY_PLANNING_MAX_RATE,
  DEFAULT_FIXED_ASSET_THRESHOLDS,
  DEPRECIABLE_ASSET_TAX_THRESHOLD,
  FIXED_ASSET_STANDARD_RATE,
  HOUSE_TAX_THRESHOLD,
  LAND_TAX_THRESHOLD,
} from '../taxFixedAsset';
import {
  DEFAULT_ACQUISITION_PARAMS,
  LAND_THRESHOLD as ACQ_LAND_THRESHOLD,
  NEW_BUILDING_THRESHOLD as ACQ_NEW_BUILDING_THRESHOLD,
  OTHER_BUILDING_THRESHOLD as ACQ_OTHER_BUILDING_THRESHOLD,
  REDUCED_RATE as ACQ_REDUCED_RATE,
  STANDARD_RATE as ACQ_STANDARD_RATE,
} from '../taxRealEstateAcquisition';
import {
  RATE_MORTGAGE,
  RATE_PRESERVATION,
  RATE_TRANSFER_GIFT,
  RATE_TRANSFER_INHERITANCE,
  RATE_TRANSFER_SALE,
  REGISTRATION_TAX_RATES,
} from '../taxRegistrationLicense';
import { CONTINUOUS_BASIC_CONTRACT_DUTY, DEFAULT_STAMP_DUTY_PARAMS, NO_AMOUNT_DUTY } from '../taxStampDuty';
import {
  DEFAULT_CAPITAL_GAINS_PARAMS,
  ESTIMATED_ACQUISITION_COST_RATE,
  RESIDENTIAL_REDUCED_RATE_CAP,
  RESIDENTIAL_SPECIAL_DEDUCTION,
} from '../taxCapitalGains';
import {
  BUSINESS_TAX_RATE_TIER1,
  BUSINESS_TAX_RATE_TIER2,
  BUSINESS_TAX_RATE_TIER3,
  BUSINESS_TAX_TIER1_LIMIT,
  BUSINESS_TAX_TIER2_LIMIT,
  CORP_TAX_REDUCED_RATE,
  CORP_TAX_REDUCED_THRESHOLD,
  CORP_TAX_STANDARD_RATE,
  DEFAULT_CORPORATE_TAX_RATES,
  DEFAULT_PER_CAPITA_LEVY,
  LARGE_CORP_CAPITAL_THRESHOLD,
  LARGE_CORP_LOSS_DEDUCTION_RATIO,
  LOCAL_CORP_TAX_RATE,
  PER_CAPITA_EMPLOYEE_THRESHOLD,
  RESIDENT_CORP_TAX_RATE,
  SPECIAL_BUSINESS_TAX_RATE,
} from '../taxCorporate';
import {
  DEFAULT_BUSINESS_CONSUMPTION_PARAMS,
  EXEMPTION_THRESHOLD,
  FULL_CREDIT_RATIO_THRESHOLD,
  FULL_CREDIT_SALES_THRESHOLD,
  SIMPLIFIED_ELIGIBILITY_THRESHOLD,
} from '../taxConsumptionBusiness';
import { TWENTY_PERCENT_RATE } from '../taxConsumption';
import { DEFAULT_PENSION_DEDUCTION_PARAMS, PENSION_DEDUCTION_MIN_OVER65, PENSION_DEDUCTION_MIN_UNDER65 } from '../taxPublicPension';
import { CASUAL_INCOME_SPECIAL_DEDUCTION } from '../taxCasual';
import { DEFAULT_FURUSATO_PARAMS, FURUSATO_ONE_STOP_MAX_MUNICIPALITIES, FURUSATO_SELF_PAY } from '../taxFurusato';
import { DEFAULT_IMPORT_PARAMS, JP_NATIONAL_REDUCED, JP_NATIONAL_STANDARD, PERSONAL_USE_FACTOR, SMALL_VALUE_LIMIT } from '../tradeTax';
import {
  CARE_RATE,
  DEFAULT_SOCIAL_INSURANCE_RATES,
  EMPLOYMENT_INSURANCE_RATE,
  HEALTH_BONUS_CAP_ANNUAL,
  HEALTH_RATE,
  PENSION_BONUS_CAP_PER_PAYMENT,
  PENSION_RATE,
} from '../taxSocialInsurance';
import { DEFAULT_EFFECTIVE_TAX_RATE } from '../funding';
import { EMERGENCY_FUND_MONTHS_DEFAULT } from '../savingsPlanning';
import {
  CORNER_LOT_COVERAGE_BONUS_PCT,
  DEFAULT_ZONING_RULES,
  FIREPROOF_COVERAGE_BONUS_PCT,
  FIREPROOF_EXEMPTION_COVERAGE_PCT,
  ROAD_FAR_MULTIPLIER_OTHER,
  ROAD_FAR_MULTIPLIER_RESIDENTIAL,
  ROAD_FAR_WIDTH_THRESHOLD_M,
  ROAD_SLOPE_OTHER,
  ROAD_SLOPE_RESIDENTIAL,
} from '../zoningPlanner';
import {
  DEFAULT_EFFLUENT_STANDARDS,
  EFFLUENT_TN_UNIFORM_MG_L,
  EFFLUENT_TP_UNIFORM_MG_L,
  GROUNDWATER_NITRATE_N_STANDARD_MG_L,
  WPCL_NP_APPLICABILITY_M3_PER_DAY,
} from '../waterCyclePlanner';
import {
  DEFAULT_HEALTH_BANDS,
  HEALTH_GRADE_A_MIN,
  HEALTH_GRADE_B_MIN,
  HEALTH_GRADE_C_MIN,
  HEALTH_GRADE_S_MIN,
  HEALTH_LEVEL_GOOD_MIN,
  HEALTH_LEVEL_WARN_MIN,
  RADAR_AXIS_BANDS,
} from '../financialHealthBands';
import {
  DEFAULT_SCHEDULE_PARAMS,
  INTERIM_TIER1,
  INTERIM_TIER2,
  INTERIM_TIER3,
  NATIONAL_SHARE,
} from '../taxConsumptionSchedule';
import { DEFAULT_DIVIDEND_PARAMS, DIVIDEND_WITHHOLDING_INCOME_BASE_RATE } from '../taxDividend';
import {
  DEFAULT_EMOTION_THRESHOLDS,
  LOW_SCORE,
  RECENT_WINDOW,
  TREND_HYSTERESIS,
  TRIGGER_MIN_COUNT,
} from '../emotionThresholds';

const def = (id: ParameterId): ParameterDef => PARAMETER_BY_ID.get(id)!;

/** 走査用 — `as const` の合併型は `integer` / `scale` を持たない要素があるので、台帳の型で読む。 */
const DEFS: readonly ParameterDef[] = PARAMETERS;

/** 既定値がモジュールの定数そのものであること (id → 定数)。 */
const DEFAULT_SOURCE: Readonly<Record<ParameterId, number>> = {
  'hydroponics.panelAreaSqm': PANEL_AREA_SQM,
  'hydroponics.daysPerYear': DAYS_PER_YEAR,
  'hydroponics.referenceLettucePotassiumMg': REFERENCE_LETTUCE_POTASSIUM_MG,
  'hydroponics.saltEquivalentFactor': SALT_EQUIVALENT_FACTOR,
  'hydroponics.lowKSwitchDaysMin': LOW_K_SWITCH_DAYS_MIN,
  'hydroponics.lowKSwitchDaysMax': LOW_K_SWITCH_DAYS_MAX,
  'hydroponics.ckdPotassiumLimitG3b': CKD_POTASSIUM_LIMIT_MG.G3b!,
  'hydroponics.ckdPotassiumLimitG4': CKD_POTASSIUM_LIMIT_MG.G4!,
  'hydroponics.ckdPotassiumLimitG5': CKD_POTASSIUM_LIMIT_MG.G5!,
  'payroll.commutePublicTransportCap': COMMUTE_PUBLIC_TRANSPORT_CAP,
  'realEstate.dscrDangerThreshold': DSCR_DANGER_THRESHOLD,
  'realEstate.dscrCautionThreshold': DSCR_CAUTION_THRESHOLD,
  'tax.consumptionStandardRate': CONSUMPTION_TAX_STANDARD,
  'tax.consumptionReducedRate': CONSUMPTION_TAX_REDUCED,
  'incomeTax.reconstructionSurtaxRate': RECONSTRUCTION_SURTAX_RATE,
  'incomeTax.socialInsuranceEstimateRate': SOCIAL_INSURANCE_RATE,
  'residentTax.incomeRate': RESIDENT_TAX_RATE,
  'residentTax.perCapita': RESIDENT_TAX_PER_CAPITA,
  'deduction.spouseSpecialIncomeLimit': SPOUSE_SPECIAL_INCOME_LIMIT_YEN,
  'deduction.dependentIncomeLimit': DEPENDENT_INCOME_LIMIT,
  'deduction.selfMedicationThreshold': SELF_MEDICATION_THRESHOLD,
  'deduction.selfMedicationCap': SELF_MEDICATION_CAP,
  'deduction.smallBizMutualAnnualCap': SMALL_BIZ_MUTUAL_ANNUAL_CAP,
  'deduction.donationFloor': DONATION_DEDUCTION_FLOOR,
  'deduction.donationIncomeCapRate': DONATION_INCOME_CAP_RATE,
  'deduction.casualtyDisasterFloor': CASUALTY_DISASTER_FLOOR,
  'deduction.casualtyIncomeRate': CASUALTY_INCOME_RATE,
  'deduction.basicHumanDeductionDiff': BASIC_HUMAN_DEDUCTION_DIFF,
  'credit.mortgageIncomeLimit': MORTGAGE_INCOME_LIMIT,
  'credit.mortgageResidentCapRate': MORTGAGE_RESIDENT_CAP_RATE,
  'credit.mortgageResidentCapMax': MORTGAGE_RESIDENT_CAP_MAX,
  'credit.residentLevyWithholdingRate': RESIDENT_LEVY_WITHHOLDING_RATE,
  'fixedAsset.standardRate': FIXED_ASSET_STANDARD_RATE,
  'fixedAsset.cityPlanningRate': CITY_PLANNING_MAX_RATE,
  'fixedAsset.landThreshold': LAND_TAX_THRESHOLD,
  'fixedAsset.houseThreshold': HOUSE_TAX_THRESHOLD,
  'fixedAsset.depreciableThreshold': DEPRECIABLE_ASSET_TAX_THRESHOLD,
  'acquisition.standardRate': ACQ_STANDARD_RATE,
  'acquisition.reducedRate': ACQ_REDUCED_RATE,
  'acquisition.landThreshold': ACQ_LAND_THRESHOLD,
  'acquisition.newBuildingThreshold': ACQ_NEW_BUILDING_THRESHOLD,
  'acquisition.otherBuildingThreshold': ACQ_OTHER_BUILDING_THRESHOLD,
  'registration.rateTransferSale': RATE_TRANSFER_SALE,
  'registration.ratePreservation': RATE_PRESERVATION,
  'registration.rateTransferInheritance': RATE_TRANSFER_INHERITANCE,
  'registration.rateTransferGift': RATE_TRANSFER_GIFT,
  'registration.rateMortgage': RATE_MORTGAGE,
  'stamp.continuousBasicContractDuty': CONTINUOUS_BASIC_CONTRACT_DUTY,
  'stamp.noAmountDuty': NO_AMOUNT_DUTY,
  'capitalGains.residentialSpecialDeduction': RESIDENTIAL_SPECIAL_DEDUCTION,
  'capitalGains.residentialReducedRateCap': RESIDENTIAL_REDUCED_RATE_CAP,
  'capitalGains.estimatedAcquisitionCostRate': ESTIMATED_ACQUISITION_COST_RATE,
  'corporate.reducedRate': CORP_TAX_REDUCED_RATE,
  'corporate.standardRate': CORP_TAX_STANDARD_RATE,
  'corporate.reducedThreshold': CORP_TAX_REDUCED_THRESHOLD,
  'corporate.localCorpTaxRate': LOCAL_CORP_TAX_RATE,
  'corporate.residentCorpTaxRate': RESIDENT_CORP_TAX_RATE,
  'corporate.defaultPerCapitaLevy': DEFAULT_PER_CAPITA_LEVY,
  'corporate.perCapitaEmployeeThreshold': PER_CAPITA_EMPLOYEE_THRESHOLD,
  'corporate.businessTaxRateTier1': BUSINESS_TAX_RATE_TIER1,
  'corporate.businessTaxRateTier2': BUSINESS_TAX_RATE_TIER2,
  'corporate.businessTaxRateTier3': BUSINESS_TAX_RATE_TIER3,
  'corporate.businessTaxTier1Limit': BUSINESS_TAX_TIER1_LIMIT,
  'corporate.businessTaxTier2Limit': BUSINESS_TAX_TIER2_LIMIT,
  'corporate.specialBusinessTaxRate': SPECIAL_BUSINESS_TAX_RATE,
  'corporate.largeCorpCapitalThreshold': LARGE_CORP_CAPITAL_THRESHOLD,
  'corporate.largeCorpLossDeductionRatio': LARGE_CORP_LOSS_DEDUCTION_RATIO,
  'consumptionBusiness.twentyPercentRate': TWENTY_PERCENT_RATE,
  'consumptionBusiness.exemptionThreshold': EXEMPTION_THRESHOLD,
  'consumptionBusiness.simplifiedEligibilityThreshold': SIMPLIFIED_ELIGIBILITY_THRESHOLD,
  'consumptionBusiness.fullCreditRatioThreshold': FULL_CREDIT_RATIO_THRESHOLD,
  'consumptionBusiness.fullCreditSalesThreshold': FULL_CREDIT_SALES_THRESHOLD,
  'pension.deductionMinUnder65': PENSION_DEDUCTION_MIN_UNDER65,
  'pension.deductionMinOver65': PENSION_DEDUCTION_MIN_OVER65,
  'casual.specialDeduction': CASUAL_INCOME_SPECIAL_DEDUCTION,
  'furusato.selfPay': FURUSATO_SELF_PAY,
  'furusato.oneStopMaxMunicipalities': FURUSATO_ONE_STOP_MAX_MUNICIPALITIES,
  'trade.nationalStandardRate': JP_NATIONAL_STANDARD,
  'trade.nationalReducedRate': JP_NATIONAL_REDUCED,
  'trade.smallValueLimit': SMALL_VALUE_LIMIT,
  'trade.personalUseFactor': PERSONAL_USE_FACTOR,
  'socialInsurance.pensionRate': PENSION_RATE,
  'socialInsurance.healthRate': HEALTH_RATE,
  'socialInsurance.careRate': CARE_RATE,
  'socialInsurance.employmentRate': EMPLOYMENT_INSURANCE_RATE,
  'socialInsurance.pensionBonusCapPerPayment': PENSION_BONUS_CAP_PER_PAYMENT,
  'socialInsurance.healthBonusCapAnnual': HEALTH_BONUS_CAP_ANNUAL,
  'finance.effectiveTaxRate': DEFAULT_EFFECTIVE_TAX_RATE,
  'savings.emergencyFundMonths': EMERGENCY_FUND_MONTHS_DEFAULT,
  'zoning.roadFarWidthThresholdM': ROAD_FAR_WIDTH_THRESHOLD_M,
  'zoning.roadFarMultiplierResidential': ROAD_FAR_MULTIPLIER_RESIDENTIAL,
  'zoning.roadFarMultiplierOther': ROAD_FAR_MULTIPLIER_OTHER,
  'zoning.cornerLotBonusPct': CORNER_LOT_COVERAGE_BONUS_PCT,
  'zoning.fireproofBonusPct': FIREPROOF_COVERAGE_BONUS_PCT,
  'zoning.fireproofExemptionCoveragePct': FIREPROOF_EXEMPTION_COVERAGE_PCT,
  'zoning.roadSlopeResidential': ROAD_SLOPE_RESIDENTIAL,
  'zoning.roadSlopeOther': ROAD_SLOPE_OTHER,
  'effluent.tnUniformMgL': EFFLUENT_TN_UNIFORM_MG_L,
  'effluent.tpUniformMgL': EFFLUENT_TP_UNIFORM_MG_L,
  'effluent.npApplicabilityM3PerDay': WPCL_NP_APPLICABILITY_M3_PER_DAY,
  'effluent.groundwaterNitrateNMgL': GROUNDWATER_NITRATE_N_STANDARD_MG_L,
  'financeHealth.levelGoodMin': HEALTH_LEVEL_GOOD_MIN,
  'financeHealth.levelWarnMin': HEALTH_LEVEL_WARN_MIN,
  'financeHealth.gradeSMin': HEALTH_GRADE_S_MIN,
  'financeHealth.gradeAMin': HEALTH_GRADE_A_MIN,
  'financeHealth.gradeBMin': HEALTH_GRADE_B_MIN,
  'financeHealth.gradeCMin': HEALTH_GRADE_C_MIN,
  'financeHealth.equityRatioBad': RADAR_AXIS_BANDS.equityRatio.bad,
  'financeHealth.equityRatioGood': RADAR_AXIS_BANDS.equityRatio.good,
  'financeHealth.currentRatioBad': RADAR_AXIS_BANDS.currentRatio.bad,
  'financeHealth.currentRatioGood': RADAR_AXIS_BANDS.currentRatio.good,
  'financeHealth.fixedLongTermFitBad': RADAR_AXIS_BANDS.fixedLongTermFit.bad,
  'financeHealth.fixedLongTermFitGood': RADAR_AXIS_BANDS.fixedLongTermFit.good,
  'financeHealth.debtToMonthlySalesBad': RADAR_AXIS_BANDS.debtToMonthlySales.bad,
  'financeHealth.debtToMonthlySalesGood': RADAR_AXIS_BANDS.debtToMonthlySales.good,
  'financeHealth.debtRepaymentYearsBad': RADAR_AXIS_BANDS.debtRepaymentYears.bad,
  'financeHealth.debtRepaymentYearsGood': RADAR_AXIS_BANDS.debtRepaymentYears.good,
  'financeHealth.operatingMarginBad': RADAR_AXIS_BANDS.operatingMargin.bad,
  'financeHealth.operatingMarginGood': RADAR_AXIS_BANDS.operatingMargin.good,
  'financeHealth.ordinaryMarginBad': RADAR_AXIS_BANDS.ordinaryMargin.bad,
  'financeHealth.ordinaryMarginGood': RADAR_AXIS_BANDS.ordinaryMargin.good,
  'financeHealth.netMarginBad': RADAR_AXIS_BANDS.netMargin.bad,
  'financeHealth.netMarginGood': RADAR_AXIS_BANDS.netMargin.good,
  'financeHealth.laborShareBad': RADAR_AXIS_BANDS.laborShare.bad,
  'financeHealth.laborShareGood': RADAR_AXIS_BANDS.laborShare.good,
  'financeHealth.ebitdaMarginBad': RADAR_AXIS_BANDS.ebitdaMargin.bad,
  'financeHealth.ebitdaMarginGood': RADAR_AXIS_BANDS.ebitdaMargin.good,
  'financeHealth.receivablesTurnoverBad': RADAR_AXIS_BANDS.receivablesTurnover.bad,
  'financeHealth.receivablesTurnoverGood': RADAR_AXIS_BANDS.receivablesTurnover.good,
  'financeHealth.inventoryTurnoverBad': RADAR_AXIS_BANDS.inventoryTurnover.bad,
  'financeHealth.inventoryTurnoverGood': RADAR_AXIS_BANDS.inventoryTurnover.good,
  'financeHealth.cccBad': RADAR_AXIS_BANDS.ccc.bad,
  'financeHealth.cccGood': RADAR_AXIS_BANDS.ccc.good,
  'financeHealth.roaBad': RADAR_AXIS_BANDS.roa.bad,
  'financeHealth.roaGood': RADAR_AXIS_BANDS.roa.good,
  'financeHealth.roeBad': RADAR_AXIS_BANDS.roe.bad,
  'financeHealth.roeGood': RADAR_AXIS_BANDS.roe.good,
  'consumptionSchedule.nationalShare': NATIONAL_SHARE,
  'consumptionSchedule.interimTier1': INTERIM_TIER1,
  'consumptionSchedule.interimTier2': INTERIM_TIER2,
  'consumptionSchedule.interimTier3': INTERIM_TIER3,
  'dividend.withholdingIncomeRate': DIVIDEND_WITHHOLDING_INCOME_BASE_RATE,
  'emotion.recentWindow': RECENT_WINDOW,
  'emotion.trendHysteresis': TREND_HYSTERESIS,
  'emotion.lowScore': LOW_SCORE,
  'emotion.triggerMinCount': TRIGGER_MIN_COUNT,
};

describe('台帳の形', () => {
  it('id は重複しない・全件が写像に載る', () => {
    const ids = PARAMETERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PARAMETER_BY_ID.size).toBe(ids.length);
    for (const id of ids) expect(PARAMETER_BY_ID.get(id)?.id).toBe(id);
  });

  it('既定値はモジュールの定数そのもの (写しではない)', () => {
    expect(Object.keys(DEFAULT_SOURCE).sort()).toEqual(PARAMETERS.map((p) => p.id).slice().sort());
    for (const [id, expected] of Object.entries(DEFAULT_SOURCE)) {
      expect(def(id as ParameterId).defaultValue, id).toBe(expected);
      expect(DEFAULT_PARAMETER_VALUES[id as ParameterId], id).toBe(expected);
    }
  });

  it('既定値は範囲の内側・範囲は正の幅・整数の既定は整数・種別は表に在る', () => {
    for (const p of DEFS) {
      expect(p.min, p.id).toBeLessThan(p.max);
      expect(p.defaultValue, p.id).toBeGreaterThanOrEqual(p.min);
      expect(p.defaultValue, p.id).toBeLessThanOrEqual(p.max);
      expect(Number.isFinite(p.defaultValue), p.id).toBe(true);
      if (p.integer) expect(Number.isInteger(toDisplayValue(p, p.defaultValue)), p.id).toBe(true);
      expect(PARAMETER_KIND_LABEL[p.kind], p.id).toBeTruthy();
      expect(p.label.length, p.id).toBeGreaterThan(0);
      expect(p.feature.length, p.id).toBeGreaterThan(0);
      // 既定値そのものが検査を通らなければ、画面が最初から「範囲外」を出す。
      expect(parameterIssue(p, p.defaultValue), p.id).toBeNull();
    }
  });

  it('画面のまとまりは登場順で、重複しない', () => {
    expect(parameterFeatures()).toEqual([
      '水耕栽培', '給与', '不動産', '税', '所得税・住民税', '所得控除・税額控除', '不動産・登記・印紙の税', '譲渡所得',
      '法人税', '消費税 (事業者)', '年金・一時所得・ふるさと納税', '貿易', '社会保険', '財務',
      '敷地計画 (建築基準法)', '水循環 (排水基準)', '財務診断', '消費税 (申告・納付)', '配当所得', '感情ログ',
      '貯蓄・資産形成',
    ]);
  });

  it('割合は % で見せる (scale 100)、それ以外は素のまま', () => {
    // 内部値が率 (0〜1) ではなく**最初から % の数** (建ぺい率の指定値と比べる境目) の物は
    // 倍率を持たない。ここに無い '%' の行が倍率なしで増えたら、率を 100 倍で見せ忘れている。
    const PERCENT_VALUED: ReadonlySet<string> = new Set([
      'zoning.fireproofExemptionCoveragePct',
      // 財務診断のレーダーの水準は指標 (%) と同じ数で比べる。
      'financeHealth.equityRatioBad', 'financeHealth.equityRatioGood', 'financeHealth.currentRatioBad', 'financeHealth.currentRatioGood', 'financeHealth.fixedLongTermFitBad', 'financeHealth.fixedLongTermFitGood', 'financeHealth.operatingMarginBad', 'financeHealth.operatingMarginGood', 'financeHealth.ordinaryMarginBad', 'financeHealth.ordinaryMarginGood', 'financeHealth.netMarginBad', 'financeHealth.netMarginGood', 'financeHealth.laborShareBad', 'financeHealth.laborShareGood', 'financeHealth.ebitdaMarginBad', 'financeHealth.ebitdaMarginGood', 'financeHealth.roaBad', 'financeHealth.roaGood', 'financeHealth.roeBad', 'financeHealth.roeGood',
    ]);
    for (const p of DEFS) {
      if (PERCENT_VALUED.has(p.id)) expect([p.unit, p.scale], p.id).toEqual(['%', undefined]);
      else if (p.unit === '%') expect(p.scale, p.id).toBe(100);
      else expect(p.scale, p.id).toBeUndefined();
    }
  });

  it('安全上限 (通信・保存・暗号・入力長) は台帳に載らない', () => {
    // 載せない理由は台帳の冒頭。名前で見る — 増えたら設計から問い直す。
    for (const p of DEFS) {
      expect(p.id, p.id).not.toMatch(/timeout|iteration|maxBytes|maxLength|maxRecords|pbkdf/i);
    }
    // 標本: この規則は実際にその名前へ当たる。
    expect('vault.pbkdf2Iterations').toMatch(/timeout|iteration|maxBytes|maxLength|maxRecords|pbkdf/i);
  });

  it('isParameterId は台帳の id だけを通す', () => {
    for (const p of DEFS) expect(isParameterId(p.id)).toBe(true);
    for (const bad of ['', 'nope', 'hydroponics.energyIntensityLow', 42, null, undefined, {}]) {
      expect(isParameterId(bad), String(bad)).toBe(false);
    }
  });
});

describe('値の検査 (parameterIssue)', () => {
  const INT: ParameterDef = {
    id: 'x.int', feature: 'x', label: 'x', unit: '日', defaultValue: 5, min: 1, max: 10, integer: true, kind: 'assumption',
  };
  const PCT: ParameterDef = {
    id: 'x.pct', feature: 'x', label: 'x', unit: '%', scale: 100, defaultValue: 0.1, min: 0.05, max: 0.5, kind: 'law',
  };

  it('数でない・有限でない値を断る', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, '5', null, undefined, {}]) {
      expect(parameterIssue(INT, bad), String(bad)).toBe('数値で入力してください');
    }
  });

  it('範囲は両端を含む・外れたら画面の値と単位で言う', () => {
    expect(parameterIssue(INT, 1)).toBeNull();
    expect(parameterIssue(INT, 10)).toBeNull();
    expect(parameterIssue(INT, 0.999)).toBe('1日 以上で入力してください');
    expect(parameterIssue(INT, 10.001)).toBe('10日 以下で入力してください');
    // % は scale 後の値で言う (0.05 ではなく 5%)。
    expect(parameterIssue(PCT, 0.04)).toBe('5% 以上で入力してください');
    expect(parameterIssue(PCT, 0.51)).toBe('50% 以下で入力してください');
    expect(parameterIssue(PCT, 0.07)).toBeNull();
  });

  it('整数の指定は画面の値で見る (scale 後)', () => {
    expect(parameterIssue(INT, 2.5)).toBe('整数で入力してください');
    const INT_PCT: ParameterDef = { ...PCT, integer: true, min: 0, max: 1 };
    expect(parameterIssue(INT_PCT, 0.07)).toBeNull(); // 7%
    expect(parameterIssue(INT_PCT, 0.075)).toBe('整数で入力してください'); // 7.5%
  });

  it('範囲の順に見る (数値 → 下限 → 上限 → 整数)', () => {
    // 0.5 は下限より下でもあり整数でもない — 先に下限を言う。
    expect(parameterIssue(INT, 0.5)).toBe('1日 以上で入力してください');
    expect(parameterIssue(INT, 10.5)).toBe('10日 以下で入力してください');
  });
});

describe('画面の値と内部値の往復', () => {
  it('scale を掛けて丸める (0.07 × 100 は 7、7.000000000000001 ではない)', () => {
    const PCT = def('tax.consumptionStandardRate');
    expect(0.07 * 100).not.toBe(7); // 標本: 素の掛け算は尾を出す
    expect(toDisplayValue(PCT, 0.07)).toBe(7);
    expect(fromDisplayValue(PCT, 7)).toBe(0.07);
    // 割り算側にも尾が出る (介護保険料率 0.81% で実際に踏んだ)。
    expect(0.81 / 100).not.toBe(0.0081); // 標本: 素の割り算は尾を出す
    expect(fromDisplayValue(PCT, 0.81)).toBe(0.0081);
    expect(displayValue('tax.consumptionStandardRate', 0.1)).toBe(10);
    expect(displayValue('hydroponics.daysPerYear', 300)).toBe(300);
  });

  it('全パラメータの既定値は往復しても同じ', () => {
    for (const p of DEFS) {
      expect(fromDisplayValue(p, toDisplayValue(p, p.defaultValue)), p.id).toBe(p.defaultValue);
    }
  });
});

describe('保存された上書きの読み込み (sanitize / resolve)', () => {
  it('物でない保存は空', () => {
    for (const raw of [null, undefined, 'x', 1, true, []]) {
      expect(sanitizeParameterOverrides(raw)).toEqual({});
    }
  });

  it('知らない id・通らない値・数でない値は捨て、通る値と既定と同じ値は残す', () => {
    const out = sanitizeParameterOverrides({
      'hydroponics.daysPerYear': 300,
      'hydroponics.panelAreaSqm': 0, // 下限 0.05 未満
      'tax.consumptionStandardRate': 9, // 上限 0.5 超
      'payroll.commutePublicTransportCap': '150000', // 文字列
      'realEstate.dscrDangerThreshold': Number.NaN,
      'hydroponics.lowKSwitchDaysMin': LOW_K_SWITCH_DAYS_MIN, // 既定と同じ — 明示した値は残す
      bogus: 1,
    });
    expect(out).toEqual({
      'hydroponics.daysPerYear': 300,
      'hydroponics.lowKSwitchDaysMin': LOW_K_SWITCH_DAYS_MIN,
    });
  });

  it('resolve は既定に上書きを重ね、通らない上書きは既定に落とす', () => {
    expect(resolveParameters()).toEqual(DEFAULT_PARAMETER_VALUES);
    expect(resolveParameters({})).toEqual(DEFAULT_PARAMETER_VALUES);
    const v = resolveParameters({
      'hydroponics.daysPerYear': 300,
      'hydroponics.panelAreaSqm': 0,
      'tax.consumptionReducedRate': undefined,
    } as ParameterOverrides);
    expect(v['hydroponics.daysPerYear']).toBe(300);
    expect(v['hydroponics.panelAreaSqm']).toBe(PANEL_AREA_SQM);
    expect(v['tax.consumptionReducedRate']).toBe(CONSUMPTION_TAX_REDUCED);
    // 触っていない id は全部既定。
    for (const p of DEFS) {
      if (p.id !== 'hydroponics.daysPerYear') expect(v[p.id as ParameterId], p.id).toBe(p.defaultValue);
    }
  });

  it('既定そのものは resolve() と同じで、凍っている必要はないが写しである', () => {
    expect(DEFAULT_PARAMETER_VALUES).toEqual(resolveParameters());
    expect(DEFAULT_PARAMETER_VALUES).not.toBe(resolveParameters());
  });

  it('overriddenCount は台帳の id だけを数える', () => {
    expect(overriddenCount({})).toBe(0);
    expect(overriddenCount({ 'hydroponics.daysPerYear': 300, 'tax.consumptionStandardRate': 0.12 })).toBe(2);
    expect(overriddenCount({ bogus: 1 } as unknown as ParameterOverrides)).toBe(0);
  });
});

describe('機能ごとの取り出し口', () => {
  const custom = resolveParameters({
    'hydroponics.panelAreaSqm': 1,
    'hydroponics.daysPerYear': 300,
    'hydroponics.referenceLettucePotassiumMg': 400,
    'hydroponics.saltEquivalentFactor': 2,
    'hydroponics.lowKSwitchDaysMin': 3,
    'hydroponics.lowKSwitchDaysMax': 5,
    'hydroponics.ckdPotassiumLimitG3b': 1000,
    'hydroponics.ckdPotassiumLimitG4': 800,
    'hydroponics.ckdPotassiumLimitG5': 600,
    'realEstate.dscrDangerThreshold': 1.5,
    'realEstate.dscrCautionThreshold': 2,
  });

  it('既定は各モジュールの既定引数と同じ物', () => {
    expect(hydroponicsProductionParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_PRODUCTION_PARAMS);
    expect(lowPotassiumParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_LOW_POTASSIUM_PARAMS);
    expect(ckdPotassiumLimits(DEFAULT_PARAMETER_VALUES)).toEqual(CKD_POTASSIUM_LIMIT_MG);
    expect(dscrThresholds(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_DSCR_THRESHOLDS);
  });

  it('上書きは正しい引数へ届く (id と引数の対応を 1 つずつ)', () => {
    expect(hydroponicsProductionParams(custom)).toEqual({ panelAreaSqm: 1, daysPerYear: 300 });
    expect(lowPotassiumParams(custom)).toEqual({
      referencePotassiumMgPer100g: 400,
      saltEquivalentFactor: 2,
      switchDaysMin: 3,
      switchDaysMax: 5,
    });
    expect(ckdPotassiumLimits(custom)).toEqual({ G1: null, G2: null, G3a: null, G3b: 1000, G4: 800, G5: 600 });
    expect(dscrThresholds(custom)).toEqual({ danger: 1.5, caution: 2 });
  });

  it('税・社会保険の取り出し口 — 既定は各モジュールの既定引数と同じ物', () => {
    expect(socialInsuranceRates(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_SOCIAL_INSURANCE_RATES);
    expect(residentTaxOverride(DEFAULT_PARAMETER_VALUES)).toEqual({ incomeRate: RESIDENT_TAX_RATE, perCapita: RESIDENT_TAX_PER_CAPITA });
    expect(netSalaryParams(DEFAULT_PARAMETER_VALUES)).toEqual({
      ...DEFAULT_NET_SALARY_PARAMS,
      resident: { incomeRate: RESIDENT_TAX_RATE, perCapita: RESIDENT_TAX_PER_CAPITA },
    });
    expect(salaryTaxParams(DEFAULT_PARAMETER_VALUES)).toEqual({
      ...DEFAULT_SALARY_TAX_PARAMS,
      resident: { incomeRate: RESIDENT_TAX_RATE, perCapita: RESIDENT_TAX_PER_CAPITA },
    });
  });

  it('税・社会保険の取り出し口 — 上書きは正しい引数へ届く', () => {
    const v = resolveParameters({
      'incomeTax.reconstructionSurtaxRate': 0,
      'incomeTax.socialInsuranceEstimateRate': 0.2,
      'residentTax.incomeRate': 0.05,
      'residentTax.perCapita': 6000,
      'socialInsurance.pensionRate': 0.1,
      'socialInsurance.healthRate': 0.06,
      'socialInsurance.careRate': 0.01,
      'socialInsurance.employmentRate': 0.007,
      'socialInsurance.pensionBonusCapPerPayment': 1_000_000,
      'socialInsurance.healthBonusCapAnnual': 3_000_000,
    });
    expect(socialInsuranceRates(v)).toEqual({
      pensionRate: 0.1, healthRate: 0.06, careRate: 0.01, employmentRate: 0.007,
      pensionBonusCapPerPayment: 1_000_000, healthBonusCapAnnual: 3_000_000,
    });
    expect(residentTaxOverride(v)).toEqual({ incomeRate: 0.05, perCapita: 6000 });
    expect(netSalaryParams(v)).toEqual({ socialInsuranceRate: 0.2, surtaxRate: 0, resident: { incomeRate: 0.05, perCapita: 6000 } });
    expect(salaryTaxParams(v)).toEqual({ surtaxRate: 0, resident: { incomeRate: 0.05, perCapita: 6000 } });
  });

  it('所得控除・税額控除の取り出し口 — 既定は各モジュールの既定引数と同じ物、上書きは正しい引数へ届く', () => {
    expect(deductionParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_DEDUCTION_PARAMS);
    expect(mortgageCreditParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_MORTGAGE_CREDIT_PARAMS);
    const v = resolveParameters({
      'deduction.spouseSpecialIncomeLimit': 1_500_000,
      'deduction.dependentIncomeLimit': 500_000,
      'deduction.selfMedicationThreshold': 10_000,
      'deduction.selfMedicationCap': 100_000,
      'deduction.smallBizMutualAnnualCap': 900_000,
      'deduction.donationFloor': 1_000,
      'deduction.donationIncomeCapRate': 0.5,
      'deduction.casualtyDisasterFloor': 40_000,
      'deduction.casualtyIncomeRate': 0.05,
      'deduction.basicHumanDeductionDiff': 100_000,
      'credit.mortgageIncomeLimit': 30_000_000,
      'credit.mortgageResidentCapRate': 0.07,
      'credit.mortgageResidentCapMax': 136_500,
    });
    expect(deductionParams(v)).toEqual({
      spouseSpecialIncomeLimit: 1_500_000, dependentIncomeLimit: 500_000,
      selfMedicationThreshold: 10_000, selfMedicationCap: 100_000, smallBizMutualAnnualCap: 900_000,
      donationDeductionFloor: 1_000, donationIncomeCapRate: 0.5,
      casualtyDisasterFloor: 40_000, casualtyIncomeRate: 0.05, basicHumanDeductionDiff: 100_000,
    });
    expect(mortgageCreditParams(v)).toEqual({ incomeLimit: 30_000_000, residentCapRate: 0.07, residentCapMax: 136_500 });
  });

  it('不動産・登記・印紙・譲渡の取り出し口 — 既定は各モジュールの既定引数と同じ物、上書きは正しい引数へ届く', () => {
    expect(fixedAssetRates(DEFAULT_PARAMETER_VALUES)).toEqual({ fixedRate: FIXED_ASSET_STANDARD_RATE, cityPlanningRate: CITY_PLANNING_MAX_RATE });
    expect(fixedAssetThresholds(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_FIXED_ASSET_THRESHOLDS);
    expect(acquisitionParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_ACQUISITION_PARAMS);
    expect(registrationRates(DEFAULT_PARAMETER_VALUES)).toEqual(REGISTRATION_TAX_RATES);
    expect(stampDutyParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_STAMP_DUTY_PARAMS);
    expect(capitalGainsParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_CAPITAL_GAINS_PARAMS);
    const v = resolveParameters({
      'fixedAsset.standardRate': 0.02,
      'fixedAsset.cityPlanningRate': 0.002,
      'fixedAsset.landThreshold': 100_000,
      'fixedAsset.houseThreshold': 150_000,
      'fixedAsset.depreciableThreshold': 1_000_000,
      'acquisition.standardRate': 0.05,
      'acquisition.reducedRate': 0.02,
      'acquisition.landThreshold': 200_000,
      'acquisition.newBuildingThreshold': 300_000,
      'acquisition.otherBuildingThreshold': 150_000,
      'registration.rateTransferSale': 0.015,
      'registration.ratePreservation': 0.0015,
      'registration.rateTransferInheritance': 0.003,
      'registration.rateTransferGift': 0.025,
      'registration.rateMortgage': 0.001,
      'stamp.continuousBasicContractDuty': 5_000,
      'stamp.noAmountDuty': 300,
      'capitalGains.residentialSpecialDeduction': 10_000_000,
      'capitalGains.residentialReducedRateCap': 20_000_000,
      'capitalGains.estimatedAcquisitionCostRate': 0.1,
      'incomeTax.reconstructionSurtaxRate': 0,
    });
    expect(fixedAssetRates(v)).toEqual({ fixedRate: 0.02, cityPlanningRate: 0.002 });
    expect(fixedAssetThresholds(v)).toEqual({ land: 100_000, house: 150_000, depreciableAsset: 1_000_000 });
    expect(acquisitionParams(v)).toEqual({
      standardRate: 0.05, reducedRate: 0.02, landThreshold: 200_000, newBuildingThreshold: 300_000, otherBuildingThreshold: 150_000,
    });
    expect(registrationRates(v)).toEqual({
      transferSale: 0.015, preservation: 0.0015, transferInheritance: 0.003, transferGift: 0.025, mortgage: 0.001,
    });
    expect(stampDutyParams(v)).toEqual({ continuousBasicContractDuty: 5_000, noAmountDuty: 300 });
    // 譲渡所得の付加率は所得税の項と共有する。
    expect(capitalGainsParams(v)).toEqual({ residentialSpecialDeduction: 10_000_000, residentialReducedRateCap: 20_000_000, surtaxRate: 0 });
  });

  it('法人税・事業者の消費税の取り出し口 — 既定は各モジュールの既定引数と同じ物、上書きは正しい引数へ届く', () => {
    expect(corporateTaxRates(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_CORPORATE_TAX_RATES);
    expect(businessConsumptionParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_BUSINESS_CONSUMPTION_PARAMS);
    const v = resolveParameters({
      'corporate.reducedRate': 0.1,
      'corporate.standardRate': 0.25,
      'corporate.reducedThreshold': 10_000_000,
      'corporate.localCorpTaxRate': 0.11,
      'corporate.residentCorpTaxRate': 0.08,
      'corporate.defaultPerCapitaLevy': 80_000,
      'corporate.perCapitaEmployeeThreshold': 100,
      'corporate.businessTaxRateTier1': 0.04,
      'corporate.businessTaxRateTier2': 0.06,
      'corporate.businessTaxRateTier3': 0.08,
      'corporate.businessTaxTier1Limit': 5_000_000,
      'corporate.businessTaxTier2Limit': 9_000_000,
      'corporate.specialBusinessTaxRate': 0.4,
      'corporate.largeCorpCapitalThreshold': 300_000_000,
      'corporate.largeCorpLossDeductionRatio': 0.6,
      'consumptionBusiness.twentyPercentRate': 0.3,
      'consumptionBusiness.exemptionThreshold': 20_000_000,
      'consumptionBusiness.simplifiedEligibilityThreshold': 60_000_000,
      'consumptionBusiness.fullCreditRatioThreshold': 0.9,
      'consumptionBusiness.fullCreditSalesThreshold': 600_000_000,
      'tax.consumptionStandardRate': 0.12,
      'tax.consumptionReducedRate': 0.05,
    });
    expect(corporateTaxRates(v)).toEqual({
      reducedRate: 0.1, standardRate: 0.25, reducedThreshold: 10_000_000, localCorpTaxRate: 0.11, residentCorpTaxRate: 0.08,
      defaultPerCapitaLevy: 80_000, perCapitaEmployeeThreshold: 100,
      businessTaxRateTier1: 0.04, businessTaxRateTier2: 0.06, businessTaxRateTier3: 0.08,
      businessTaxTier1Limit: 5_000_000, businessTaxTier2Limit: 9_000_000, specialBusinessTaxRate: 0.4,
      largeCorpCapitalThreshold: 300_000_000, largeCorpLossDeductionRatio: 0.6,
    });
    // 事業者の消費税の税率は「税」の消費税率を共有する。
    expect(businessConsumptionParams(v)).toEqual({
      rates: { standard: 0.12, reduced: 0.05 },
      twentyPercentRate: 0.3, exemptionThreshold: 20_000_000, simplifiedEligibilityThreshold: 60_000_000,
      fullCreditRatioThreshold: 0.9, fullCreditSalesThreshold: 600_000_000,
    });
  });

  it('年金・一時所得・ふるさと納税・貿易の取り出し口 — 既定は各モジュールの既定引数と同じ物、上書きは正しい引数へ届く', () => {
    expect(pensionDeductionParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_PENSION_DEDUCTION_PARAMS);
    expect(furusatoParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_FURUSATO_PARAMS);
    expect(importParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_IMPORT_PARAMS);
    const v = resolveParameters({
      'pension.deductionMinUnder65': 700_000,
      'pension.deductionMinOver65': 1_200_000,
      'furusato.selfPay': 3_000,
      'incomeTax.reconstructionSurtaxRate': 0,
      'trade.nationalStandardRate': 0.1,
      'trade.nationalReducedRate': 0.07,
      'trade.smallValueLimit': 20_000,
      'trade.personalUseFactor': 0.5,
    });
    expect(pensionDeductionParams(v)).toEqual({ minUnder65: 700_000, minOver65: 1_200_000 });
    // ふるさと納税の付加率は所得税の項を共有する。
    expect(furusatoParams(v)).toEqual({ selfPay: 3_000, surtaxRate: 0 });
    expect(importParams(v)).toEqual({ nationalStandard: 0.1, nationalReduced: 0.07, smallValueLimit: 20_000, personalUseFactor: 0.5 });
  });

  it('敷地計画・排水基準の取り出し口 — 既定は各モジュールの既定引数と同じ物、上書きは正しい引数へ届く', () => {
    expect(zoningRules(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_ZONING_RULES);
    expect(effluentStandards(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_EFFLUENT_STANDARDS);
    const v = resolveParameters({
      'zoning.roadFarWidthThresholdM': 15,
      'zoning.roadFarMultiplierResidential': 30,
      'zoning.roadFarMultiplierOther': 50,
      'zoning.cornerLotBonusPct': 5,
      'zoning.fireproofBonusPct': 20,
      'zoning.fireproofExemptionCoveragePct': 70,
      'zoning.roadSlopeResidential': 1,
      'zoning.roadSlopeOther': 2,
      'effluent.tnUniformMgL': 60,
      'effluent.tpUniformMgL': 8,
      'effluent.npApplicabilityM3PerDay': 100,
      'effluent.groundwaterNitrateNMgL': 5,
    });
    expect(zoningRules(v)).toEqual({
      roadFarWidthThresholdM: 15,
      roadFarMultiplierResidential: 30,
      roadFarMultiplierOther: 50,
      cornerLotBonusPct: 5,
      fireproofBonusPct: 20,
      fireproofExemptionCoveragePct: 70,
      roadSlopeResidential: 1,
      roadSlopeOther: 2,
    });
    expect(effluentStandards(v)).toEqual({ tnUniformMgL: 60, tpUniformMgL: 8, npApplicabilityM3PerDay: 100, groundwaterNitrateNMgL: 5 });
  });

  it('財務診断の取り出し口 — 既定は各モジュールの既定引数と同じ物、上書きは正しい引数へ届く', () => {
    expect(financialHealthBands(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_HEALTH_BANDS);
    expect(radarAxisBands(DEFAULT_PARAMETER_VALUES)).toEqual(RADAR_AXIS_BANDS);
    const v = resolveParameters({
      'financeHealth.levelGoodMin': 90,
      'financeHealth.levelWarnMin': 60,
      'financeHealth.gradeSMin': 95,
      'financeHealth.gradeAMin': 90,
      'financeHealth.gradeBMin': 70,
      'financeHealth.gradeCMin': 60,
      'financeHealth.equityRatioBad': 0,
      'financeHealth.equityRatioGood': 5,
      'financeHealth.currentRatioBad': 10,
      'financeHealth.currentRatioGood': 15,
      'financeHealth.fixedLongTermFitBad': 20,
      'financeHealth.fixedLongTermFitGood': 25,
      'financeHealth.debtToMonthlySalesBad': 30,
      'financeHealth.debtToMonthlySalesGood': 35,
      'financeHealth.debtRepaymentYearsBad': 40,
      'financeHealth.debtRepaymentYearsGood': 45,
      'financeHealth.operatingMarginBad': 50,
      'financeHealth.operatingMarginGood': 55,
      'financeHealth.ordinaryMarginBad': 60,
      'financeHealth.ordinaryMarginGood': 65,
      'financeHealth.netMarginBad': 70,
      'financeHealth.netMarginGood': 75,
      'financeHealth.laborShareBad': 80,
      'financeHealth.laborShareGood': 85,
      'financeHealth.ebitdaMarginBad': 90,
      'financeHealth.ebitdaMarginGood': 95,
      'financeHealth.receivablesTurnoverBad': 100,
      'financeHealth.receivablesTurnoverGood': 105,
      'financeHealth.inventoryTurnoverBad': 110,
      'financeHealth.inventoryTurnoverGood': 115,
      'financeHealth.cccBad': 120,
      'financeHealth.cccGood': 125,
      'financeHealth.roaBad': 130,
      'financeHealth.roaGood': 135,
      'financeHealth.roeBad': 140,
      'financeHealth.roeGood': 145,
    });
    expect(financialHealthBands(v)).toEqual({ goodMin: 90, warnMin: 60, gradeSMin: 95, gradeAMin: 90, gradeBMin: 70, gradeCMin: 60 });
    expect(radarAxisBands(v)).toEqual({
      equityRatio: { bad: 0, good: 5 },
      currentRatio: { bad: 10, good: 15 },
      fixedLongTermFit: { bad: 20, good: 25 },
      debtToMonthlySales: { bad: 30, good: 35 },
      debtRepaymentYears: { bad: 40, good: 45 },
      operatingMargin: { bad: 50, good: 55 },
      ordinaryMargin: { bad: 60, good: 65 },
      netMargin: { bad: 70, good: 75 },
      laborShare: { bad: 80, good: 85 },
      ebitdaMargin: { bad: 90, good: 95 },
      receivablesTurnover: { bad: 100, good: 105 },
      inventoryTurnover: { bad: 110, good: 115 },
      ccc: { bad: 120, good: 125 },
      roa: { bad: 130, good: 135 },
      roe: { bad: 140, good: 145 },
    });
  });

  it('消費税の申告・納付・配当・感情ログの取り出し口 — 既定は各モジュールの既定引数と同じ物、上書きは正しい引数へ届く', () => {
    expect(scheduleParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_SCHEDULE_PARAMS);
    expect(dividendParams(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_DIVIDEND_PARAMS);
    expect(emotionThresholds(DEFAULT_PARAMETER_VALUES)).toEqual(DEFAULT_EMOTION_THRESHOLDS);
    const v = resolveParameters({
      'consumptionSchedule.nationalShare': 0.8,
      'consumptionBusiness.twentyPercentRate': 0.3,
      'consumptionSchedule.interimTier1': 600_000,
      'consumptionSchedule.interimTier2': 5_000_000,
      'consumptionSchedule.interimTier3': 50_000_000,
      'dividend.withholdingIncomeRate': 0.2,
      'incomeTax.reconstructionSurtaxRate': 0,
      'credit.residentLevyWithholdingRate': 0.08,
      'residentTax.incomeRate': 0.2,
      'emotion.recentWindow': 3,
      'emotion.trendHysteresis': 4,
      'emotion.lowScore': 1,
      'emotion.triggerMinCount': 5,
    });
    // 2 割特例の割合は「消費税 (事業者)」の項を共有する。
    expect(scheduleParams(v)).toEqual({ nationalShare: 0.8, twentyPercentRate: 0.3, interimTier1: 600_000, interimTier2: 5_000_000, interimTier3: 50_000_000 });
    // 付加率・配当割・住民税率は所得税・税額控除・住民税の項を共有する。
    expect(dividendParams(v)).toEqual({ withholdingIncomeRate: 0.2, surtaxRate: 0, withholdingResidentRate: 0.08, residentTaxRate: 0.2 });
    expect(emotionThresholds(v)).toEqual({ recentWindow: 3, triggerMinCount: 5, lowScore: 1, trendHysteresis: 4 });
  });

  it('制限のない病期 (G1〜G3a) の null は上書きしても保たれる', () => {
    const limits = ckdPotassiumLimits(custom);
    expect(limits.G1).toBeNull();
    expect(limits.G2).toBeNull();
    expect(limits.G3a).toBeNull();
  });
});

/**
 * 台帳の表そのものを固定する。表は関数 `parameterDefinitions()` が組む —
 * 検査がそれを呼ぶことで、モジュール読込時にしか走らない表 (静的な値) も
 * 変異が測れる (`vi.resetModules()` で読み直すと依存先の表まで測定に入る)。
 */
describe('台帳の表 (静的な値の固定)', () => {
  it('id・単位・倍率・範囲・整数・種別の組が 1 つも動いていない', () => {
    const m = { PARAMETERS: parameterDefinitions(), PARAMETER_KIND_LABEL };
    expect(m.PARAMETERS).toEqual(PARAMETERS);
    const rows = (m.PARAMETERS as readonly ParameterDef[]).map((p) => [p.id, p.unit, p.scale ?? 1, p.min, p.max, p.integer === true, p.kind]);
    expect(rows).toEqual([
      ['hydroponics.panelAreaSqm', 'm²', 1, 0.05, 10, false, 'reference'],
      ['hydroponics.daysPerYear', '日', 1, 1, 366, true, 'assumption'],
      ['hydroponics.referenceLettucePotassiumMg', 'mg/100g', 1, 1, 5_000, false, 'reference'],
      ['hydroponics.saltEquivalentFactor', '', 1, 1, 5, false, 'law'],
      ['hydroponics.lowKSwitchDaysMin', '日', 1, 1, 60, true, 'reference'],
      ['hydroponics.lowKSwitchDaysMax', '日', 1, 1, 60, true, 'reference'],
      ['hydroponics.ckdPotassiumLimitG3b', 'mg', 1, 100, 10_000, true, 'reference'],
      ['hydroponics.ckdPotassiumLimitG4', 'mg', 1, 100, 10_000, true, 'reference'],
      ['hydroponics.ckdPotassiumLimitG5', 'mg', 1, 100, 10_000, true, 'reference'],
      ['payroll.commutePublicTransportCap', '円', 1, 0, 1_000_000, true, 'law'],
      ['realEstate.dscrDangerThreshold', '倍', 1, 0.1, 10, false, 'threshold'],
      ['realEstate.dscrCautionThreshold', '倍', 1, 0.1, 10, false, 'threshold'],
      ['tax.consumptionStandardRate', '%', 100, 0, 0.5, false, 'law'],
      ['tax.consumptionReducedRate', '%', 100, 0, 0.5, false, 'law'],
      ['incomeTax.reconstructionSurtaxRate', '%', 100, 0, 0.2, false, 'law'],
      ['incomeTax.socialInsuranceEstimateRate', '%', 100, 0, 0.5, false, 'assumption'],
      ['residentTax.incomeRate', '%', 100, 0, 0.3, false, 'law'],
      ['residentTax.perCapita', '円', 1, 0, 100_000, true, 'law'],
      ['deduction.spouseSpecialIncomeLimit', '円', 1, 0, 10_000_000, true, 'law'],
      ['deduction.dependentIncomeLimit', '円', 1, 0, 10_000_000, true, 'law'],
      ['deduction.selfMedicationThreshold', '円', 1, 0, 1_000_000, true, 'law'],
      ['deduction.selfMedicationCap', '円', 1, 0, 10_000_000, true, 'law'],
      ['deduction.smallBizMutualAnnualCap', '円', 1, 0, 10_000_000, true, 'law'],
      ['deduction.donationFloor', '円', 1, 0, 1_000_000, true, 'law'],
      ['deduction.donationIncomeCapRate', '%', 100, 0, 1, false, 'law'],
      ['deduction.casualtyDisasterFloor', '円', 1, 0, 10_000_000, true, 'law'],
      ['deduction.casualtyIncomeRate', '%', 100, 0, 1, false, 'law'],
      ['deduction.basicHumanDeductionDiff', '円', 1, 0, 1_000_000, true, 'law'],
      ['credit.mortgageIncomeLimit', '円', 1, 0, 100_000_000, true, 'law'],
      ['credit.mortgageResidentCapRate', '%', 100, 0, 1, false, 'law'],
      ['credit.mortgageResidentCapMax', '円', 1, 0, 1_000_000, true, 'law'],
      ['credit.residentLevyWithholdingRate', '%', 100, 0, 0.5, false, 'law'],
      ['fixedAsset.standardRate', '%', 100, 0, 0.1, false, 'law'],
      ['fixedAsset.cityPlanningRate', '%', 100, 0, 0.1, false, 'law'],
      ['fixedAsset.landThreshold', '円', 1, 0, 100_000_000, true, 'law'],
      ['fixedAsset.houseThreshold', '円', 1, 0, 100_000_000, true, 'law'],
      ['fixedAsset.depreciableThreshold', '円', 1, 0, 100_000_000, true, 'law'],
      ['acquisition.standardRate', '%', 100, 0, 0.2, false, 'law'],
      ['acquisition.reducedRate', '%', 100, 0, 0.2, false, 'law'],
      ['acquisition.landThreshold', '円', 1, 0, 100_000_000, true, 'law'],
      ['acquisition.newBuildingThreshold', '円', 1, 0, 100_000_000, true, 'law'],
      ['acquisition.otherBuildingThreshold', '円', 1, 0, 100_000_000, true, 'law'],
      ['registration.rateTransferSale', '%', 100, 0, 0.1, false, 'law'],
      ['registration.ratePreservation', '%', 100, 0, 0.1, false, 'law'],
      ['registration.rateTransferInheritance', '%', 100, 0, 0.1, false, 'law'],
      ['registration.rateTransferGift', '%', 100, 0, 0.1, false, 'law'],
      ['registration.rateMortgage', '%', 100, 0, 0.1, false, 'law'],
      ['stamp.continuousBasicContractDuty', '円', 1, 0, 1_000_000, true, 'law'],
      ['stamp.noAmountDuty', '円', 1, 0, 1_000_000, true, 'law'],
      ['capitalGains.residentialSpecialDeduction', '円', 1, 0, 1_000_000_000, true, 'law'],
      ['capitalGains.residentialReducedRateCap', '円', 1, 0, 1_000_000_000, true, 'law'],
      ['capitalGains.estimatedAcquisitionCostRate', '%', 100, 0, 1, false, 'law'],
      ['corporate.reducedRate', '%', 100, 0, 0.5, false, 'law'],
      ['corporate.standardRate', '%', 100, 0, 0.5, false, 'law'],
      ['corporate.reducedThreshold', '円', 1, 0, 1_000_000_000, true, 'law'],
      ['corporate.localCorpTaxRate', '%', 100, 0, 0.5, false, 'law'],
      ['corporate.residentCorpTaxRate', '%', 100, 0, 0.5, false, 'law'],
      ['corporate.defaultPerCapitaLevy', '円', 1, 0, 10_000_000, true, 'assumption'],
      ['corporate.perCapitaEmployeeThreshold', '人', 1, 0, 10_000, true, 'law'],
      ['corporate.businessTaxRateTier1', '%', 100, 0, 0.5, false, 'law'],
      ['corporate.businessTaxRateTier2', '%', 100, 0, 0.5, false, 'law'],
      ['corporate.businessTaxRateTier3', '%', 100, 0, 0.5, false, 'law'],
      ['corporate.businessTaxTier1Limit', '円', 1, 0, 1_000_000_000, true, 'law'],
      ['corporate.businessTaxTier2Limit', '円', 1, 0, 1_000_000_000, true, 'law'],
      ['corporate.specialBusinessTaxRate', '%', 100, 0, 2, false, 'law'],
      ['corporate.largeCorpCapitalThreshold', '円', 1, 0, 100_000_000_000, true, 'law'],
      ['corporate.largeCorpLossDeductionRatio', '%', 100, 0, 1, false, 'law'],
      ['consumptionBusiness.twentyPercentRate', '%', 100, 0, 1, false, 'law'],
      ['consumptionBusiness.exemptionThreshold', '円', 1, 0, 10_000_000_000, true, 'law'],
      ['consumptionBusiness.simplifiedEligibilityThreshold', '円', 1, 0, 10_000_000_000, true, 'law'],
      ['consumptionBusiness.fullCreditRatioThreshold', '%', 100, 0, 1, false, 'law'],
      ['consumptionBusiness.fullCreditSalesThreshold', '円', 1, 0, 100_000_000_000, true, 'law'],
      ['pension.deductionMinUnder65', '円', 1, 0, 10_000_000, true, 'law'],
      ['pension.deductionMinOver65', '円', 1, 0, 10_000_000, true, 'law'],
      ['casual.specialDeduction', '円', 1, 0, 10_000_000, true, 'law'],
      ['furusato.selfPay', '円', 1, 0, 100_000, true, 'law'],
      ['furusato.oneStopMaxMunicipalities', '自治体', 1, 1, 100, true, 'law'],
      ['trade.nationalStandardRate', '%', 100, 0, 0.5, false, 'law'],
      ['trade.nationalReducedRate', '%', 100, 0, 0.5, false, 'law'],
      ['trade.smallValueLimit', '円', 1, 0, 10_000_000, true, 'law'],
      ['trade.personalUseFactor', '%', 100, 0, 1, false, 'law'],
      ['socialInsurance.pensionRate', '%', 100, 0, 0.3, false, 'law'],
      ['socialInsurance.healthRate', '%', 100, 0, 0.3, false, 'reference'],
      ['socialInsurance.careRate', '%', 100, 0, 0.1, false, 'law'],
      ['socialInsurance.employmentRate', '%', 100, 0, 0.1, false, 'law'],
      ['socialInsurance.pensionBonusCapPerPayment', '円', 1, 0, 100_000_000, true, 'law'],
      ['socialInsurance.healthBonusCapAnnual', '円', 1, 0, 100_000_000, true, 'law'],
      ['finance.effectiveTaxRate', '%', 100, 0, 1, false, 'assumption'],
      ['zoning.roadFarWidthThresholdM', 'm', 1, 0, 100, false, 'law'],
      ['zoning.roadFarMultiplierResidential', '%/m', 1, 0, 1_000, false, 'law'],
      ['zoning.roadFarMultiplierOther', '%/m', 1, 0, 1_000, false, 'law'],
      ['zoning.cornerLotBonusPct', 'ポイント', 1, 0, 100, false, 'law'],
      ['zoning.fireproofBonusPct', 'ポイント', 1, 0, 100, false, 'law'],
      ['zoning.fireproofExemptionCoveragePct', '%', 1, 0, 100, false, 'law'],
      ['zoning.roadSlopeResidential', '', 1, 0.1, 10, false, 'law'],
      ['zoning.roadSlopeOther', '', 1, 0.1, 10, false, 'law'],
      ['effluent.tnUniformMgL', 'mg/L', 1, 0.1, 10_000, false, 'law'],
      ['effluent.tpUniformMgL', 'mg/L', 1, 0.1, 10_000, false, 'law'],
      ['effluent.npApplicabilityM3PerDay', 'm³/日', 1, 0.1, 1_000_000, false, 'law'],
      ['effluent.groundwaterNitrateNMgL', 'mg/L', 1, 0.1, 10_000, false, 'law'],
      ['financeHealth.levelGoodMin', '点', 1, 0, 100, true, 'threshold'],
      ['financeHealth.levelWarnMin', '点', 1, 0, 100, true, 'threshold'],
      ['financeHealth.gradeSMin', '点', 1, 0, 100, true, 'threshold'],
      ['financeHealth.gradeAMin', '点', 1, 0, 100, true, 'threshold'],
      ['financeHealth.gradeBMin', '点', 1, 0, 100, true, 'threshold'],
      ['financeHealth.gradeCMin', '点', 1, 0, 100, true, 'threshold'],
      ['financeHealth.equityRatioBad', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.equityRatioGood', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.currentRatioBad', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.currentRatioGood', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.fixedLongTermFitBad', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.fixedLongTermFitGood', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.debtToMonthlySalesBad', 'ヶ月', 1, 0, 1_200, false, 'threshold'],
      ['financeHealth.debtToMonthlySalesGood', 'ヶ月', 1, 0, 1_200, false, 'threshold'],
      ['financeHealth.debtRepaymentYearsBad', '年', 1, 0, 1_000, false, 'threshold'],
      ['financeHealth.debtRepaymentYearsGood', '年', 1, 0, 1_000, false, 'threshold'],
      ['financeHealth.operatingMarginBad', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.operatingMarginGood', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.ordinaryMarginBad', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.ordinaryMarginGood', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.netMarginBad', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.netMarginGood', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.laborShareBad', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.laborShareGood', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.ebitdaMarginBad', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.ebitdaMarginGood', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.receivablesTurnoverBad', '倍', 1, 0, 10_000, false, 'threshold'],
      ['financeHealth.receivablesTurnoverGood', '倍', 1, 0, 10_000, false, 'threshold'],
      ['financeHealth.inventoryTurnoverBad', '倍', 1, 0, 10_000, false, 'threshold'],
      ['financeHealth.inventoryTurnoverGood', '倍', 1, 0, 10_000, false, 'threshold'],
      ['financeHealth.cccBad', '日', 1, -3_650, 3_650, false, 'threshold'],
      ['financeHealth.cccGood', '日', 1, -3_650, 3_650, false, 'threshold'],
      ['financeHealth.roaBad', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.roaGood', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.roeBad', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['financeHealth.roeGood', '%', 1, -1_000, 1_000, false, 'threshold'],
      ['consumptionSchedule.nationalShare', '%', 100, 0.01, 1, false, 'law'],
      ['consumptionSchedule.interimTier1', '円', 1, 0, 1_000_000_000_000, true, 'law'],
      ['consumptionSchedule.interimTier2', '円', 1, 0, 1_000_000_000_000, true, 'law'],
      ['consumptionSchedule.interimTier3', '円', 1, 0, 1_000_000_000_000, true, 'law'],
      ['dividend.withholdingIncomeRate', '%', 100, 0, 1, false, 'law'],
      ['emotion.recentWindow', '件', 1, 1, 365, true, 'assumption'],
      ['emotion.trendHysteresis', '点', 1, 0, 4, false, 'threshold'],
      ['emotion.lowScore', '点', 1, 1, 5, true, 'threshold'],
      ['emotion.triggerMinCount', '回', 1, 1, 100, true, 'threshold'],
      ['savings.emergencyFundMonths', 'か月', 1, 0, 24, true, 'reference'],
    ]);
    expect(m.PARAMETER_KIND_LABEL).toEqual({ law: '法定値', reference: '参考値', threshold: 'しきい値', assumption: '前提' });
    // 出典と注記は空でない (法定値には出典が要る)。
    for (const p of m.PARAMETERS as readonly ParameterDef[]) {
      if (p.kind === 'law') expect(p.source, p.id).toBeTruthy();
      expect(p.label.trim(), p.id).toBe(p.label);
    }
  });
});

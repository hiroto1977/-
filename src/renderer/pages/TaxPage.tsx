import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { tableStyle, thStyle, tdStyle } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import { jpy } from '../../shared/formatters';
import { parseAmountInput } from '../components/serviceActionUtils';
import {
  CONSUMPTION_TAX_REDUCED,
  CONSUMPTION_TAX_STANDARD,
  RECONSTRUCTION_SURTAX_RATE,
  calcConsumptionTax,
  calcIncomeTax,
  calcNetSalary,
  calcResidentTax,
  calcSalaryIncomeDeduction,
  calcSalaryWithDeductions,
  marginalIncomeTaxRate,
  schemesForEntity,
  suggestTaxTips,
  complianceChecklist,
  COMPLIANCE_TOPICS,
  type ComplianceTopic,
} from '../../shared/taxCalc';
import {
  calcAllDeductions,
  type DependentKind,
  type DeductionInput,
  type IdecoOccupation,
} from '../../shared/taxDeductions';
import {
  calcAllTaxCredits,
  applyTaxCreditsWithSurtax,
  resolveMortgageParams,
  mortgagePeriodStatus,
  calcDividendLevyCredit,
  type HousingPerformance,
  type DividendKind,
} from '../../shared/taxCredits';
import { calcRetirementTax } from '../../shared/taxRetirement';
import { calcCasualIncome } from '../../shared/taxCasual';
import { calcCapitalGainsTax, resolveAcquisitionCost, type CapitalAssetKind } from '../../shared/taxCapitalGains';
import { calcPublicPensionIncome } from '../../shared/taxPublicPension';
import { type SimplifiedBusinessType, type ConsumptionTaxMethod } from '../../shared/taxConsumption';
import { compareBusinessTaxMethods, isTaxExempt } from '../../shared/taxConsumptionBusiness';
import { calcSocialInsurance, calcSocialInsuranceWithBonus } from '../../shared/taxSocialInsurance';
import { calcFurusatoBreakdown, furusatoOneStopEligibility } from '../../shared/taxFurusato';
import { compareDividendMethods, type DividendMethod } from '../../shared/taxDividend';
import {
  calcFixedAssetTaxTotal,
  fixedAssetTax,
  cityPlanningTax,
} from '../../shared/taxFixedAsset';
import {
  realEstateAcquisitionTax,
  type PropertyType,
} from '../../shared/taxRealEstateAcquisition';
import {
  realEstateRegistrationTax,
  type RegistrationType,
} from '../../shared/taxRegistrationLicense';
import { stampDutyAmount, type DocumentType } from '../../shared/taxStampDuty';
import { estimateRealEstatePurchaseTaxCost } from '../../shared/taxRealEstateTransactionCost';
import { estimateInheritanceTax } from '../../shared/taxInheritance';
import {
  annualGiftTax,
  settlementGiftTax,
  type GiftType,
} from '../../shared/taxGift';
import {
  automobileTaxByDisplacement,
  environmentalPerformanceLevy,
  type EnvironmentalPerformanceCategory,
} from '../../shared/taxAutomobile';
import { businessOfficeTax } from '../../shared/taxBusinessOffice';

/** 公式ツール (試算・申告・納付)。申告・納付はここで手動実行する。 */
const OFFICIAL_TOOLS: { label: string; url: string; note: string }[] = [
  { label: '国税庁 確定申告書等作成コーナー', url: 'https://www.keisan.nta.go.jp/', note: '申告書をブラウザで作成' },
  { label: 'e-Tax (国税電子申告・納税)', url: 'https://www.e-tax.nta.go.jp/', note: 'マイナンバーカードで電子申告・納付' },
  { label: '国税庁 年末調整の計算', url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/gensen/annai/nencho_keisan/index.htm', note: '年末調整の公式手順' },
  { label: '弥生 確定申告お役立ち試算', url: 'https://www.yayoi-kk.co.jp/shinkoku/oyakudachi/simulation/', note: '会計ソフト連携の試算' },
];

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 13,
  width: 160,
};

export function TaxPage() {
  const { source, status, errorMessage, refresh, isConfigured } = useServiceData('tax', SNAPSHOT.tax);

  const [incomeStr, setIncomeStr] = useState('5000000');
  const [grossStr, setGrossStr] = useState('6000000');
  const [netStr, setNetStr] = useState('10000');
  const [reduced, setReduced] = useState(false);
  const [entity, setEntity] = useState<'corporation' | 'sole-proprietor'>('sole-proprietor');
  const [topic, setTopic] = useState<ComplianceTopic>('micro-corp');

  const schemes = useMemo(() => schemesForEntity(entity), [entity]);
  const checklist = useMemo(() => complianceChecklist(topic), [topic]);

  const TOPIC_LABEL: Record<ComplianceTopic, string> = {
    'micro-corp': 'マイクロ法人併用',
    'family-transaction': '親族間の不動産取引',
    incorporation: '法人化 (法人成り)',
  };

  const taxableIncome = useMemo(() => {
    const p = parseAmountInput(incomeStr);
    return p.ok && p.value !== undefined && p.value > 0 ? p.value : 0;
  }, [incomeStr]);

  const netAmount = useMemo(() => {
    const p = parseAmountInput(netStr);
    return p.ok && p.value !== undefined && p.value > 0 ? p.value : 0;
  }, [netStr]);

  const grossAnnual = useMemo(() => {
    const p = parseAmountInput(grossStr);
    return p.ok && p.value !== undefined && p.value > 0 ? p.value : 0;
  }, [grossStr]);

  const incomeTax = useMemo(() => calcIncomeTax(taxableIncome), [taxableIncome]);
  const residentTax = useMemo(() => calcResidentTax(taxableIncome), [taxableIncome]);
  const netSalary = useMemo(() => calcNetSalary(grossAnnual), [grossAnnual]);
  const [careInsurance, setCareInsurance] = useState(false);
  const [bonusPerStr, setBonusPerStr] = useState('0');
  const [bonusCountStr, setBonusCountStr] = useState('2');
  // 文字列入力を数値に変換する純粋ヘルパ。下の useMemo 群がレンダー時に
  // 即時実行されるため、それより前に宣言しておく必要がある (TDZ 回避)。
  const num = (s: string): number => {
    const p = parseAmountInput(s);
    return p.ok && p.value !== undefined && p.value > 0 ? p.value : 0;
  };
  const socialInsurancePrecise = useMemo(() => {
    const bonusPer = num(bonusPerStr);
    const bonusCount = num(bonusCountStr);
    if (bonusPer > 0 && bonusCount > 0) {
      // 賞与あり: 年収から賞与総額を引いた残りを月額報酬とみなす。
      const annualBonus = bonusPer * bonusCount;
      const monthly = Math.max(0, (grossAnnual - annualBonus) / 12);
      return calcSocialInsuranceWithBonus(monthly, bonusPer, bonusCount, careInsurance);
    }
    return calcSocialInsurance(grossAnnual, careInsurance);
  }, [grossAnnual, careInsurance, bonusPerStr, bonusCountStr]);
  const consumptionTax = useMemo(
    () => calcConsumptionTax(netAmount, reduced ? CONSUMPTION_TAX_REDUCED : CONSUMPTION_TAX_STANDARD),
    [netAmount, reduced],
  );
  const tips = useMemo(() => suggestTaxTips(taxableIncome), [taxableIncome]);

  // --- ③ 全控除込みの精密試算 ---
  const [dGrossStr, setDGrossStr] = useState('6000000');
  const [dSocialStr, setDSocialStr] = useState('900000');
  const [dIdecoStr, setDIdecoStr] = useState('0');
  const [idecoOccupation, setIdecoOccupation] = useState<IdecoOccupation | ''>('');
  const [dSmallBizStr, setDSmallBizStr] = useState('0');
  const [dLifeStr, setDLifeStr] = useState('0');
  const [dLifeOldStr, setDLifeOldStr] = useState('0');
  const [dQuakeStr, setDQuakeStr] = useState('0');
  const [dMedicalStr, setDMedicalStr] = useState('0');
  const [dSelfMedStr, setDSelfMedStr] = useState('0');
  const [dDonationStr, setDDonationStr] = useState('0');
  const [hasSpouse, setHasSpouse] = useState(false);
  const [spouseIncomeStr, setSpouseIncomeStr] = useState('0');
  const [generalDeps, setGeneralDeps] = useState('0');
  const [specificDeps, setSpecificDeps] = useState('0');
  const [singleParent, setSingleParent] = useState(false);
  const [mortgageBalanceStr, setMortgageBalanceStr] = useState('0');
  const [mortgageYear, setMortgageYear] = useState(2024);
  const [mortgagePerf, setMortgagePerf] = useState<HousingPerformance>('standard');
  const [dividendStr, setDividendStr] = useState('0');
  const [dividendKind, setDividendKind] = useState<DividendKind>('stock');

  const precise = useMemo(() => {
    const dGross = num(dGrossStr);
    const employmentIncome = Math.max(0, dGross - calcSalaryIncomeDeduction(dGross));
    const dependents: DependentKind[] = [
      ...Array<DependentKind>(Math.min(20, Math.floor(num(generalDeps)))).fill('general'),
      ...Array<DependentKind>(Math.min(20, Math.floor(num(specificDeps)))).fill('specific'),
    ];
    const donation = num(dDonationStr);
    const input: DeductionInput = {
      totalIncome: employmentIncome,
      socialInsurancePaid: num(dSocialStr),
      idecoContribution: num(dIdecoStr),
      idecoOccupation: idecoOccupation || undefined,
      smallBizMutualAid: num(dSmallBizStr),
      spouseIncome: hasSpouse ? num(spouseIncomeStr) : undefined,
      dependents,
      lifeInsurance: {
        general: num(dLifeStr),
        medical: 0,
        pension: 0,
        generalOld: num(dLifeOldStr),
      },
      earthquakeInsurance: num(dQuakeStr),
      medical: { paid: num(dMedicalStr), reimbursed: 0 },
      selfMedicationPaid: num(dSelfMedStr),
      donation,
      singleParent,
    };
    const ded = calcAllDeductions(input);
    // 住民税の非課税限度額判定に使う扶養人数 (配偶者 + 扶養親族)。
    const dependentCount = (hasSpouse ? 1 : 0) + dependents.length;
    // ① 所得控除込みの税額 (ふるさと納税の住民税控除・住民税の調整控除・非課税限度額も内部適用済み)。
    const result = calcSalaryWithDeductions(
      dGross, ded.total.incomeTax, ded.total.residentTax, donation, ded.humanDeductionDiff, dependentCount,
    );

    // ② 税額控除 (住宅ローン・配当) を、復興特別所得税の前の「基準所得税額」に
    //    対して適用する (正しい順序)。住宅ローン控除の所得税枠も基準税額ベース。
    const mortgageBalance = num(mortgageBalanceStr);
    const dividendIncome = num(dividendStr);
    const mortgageParams = resolveMortgageParams(mortgageYear, mortgagePerf);
    // 控除期間 (新築13年/中古10年) の判定。現在年は試算基準年とする。
    const mortgagePeriod = mortgagePeriodStatus(mortgageYear, new Date().getFullYear(), mortgagePerf);
    const credits = calcAllTaxCredits({
      mortgage: mortgageBalance > 0
        ? {
            yearEndBalance: mortgageBalance,
            rate: mortgageParams.rate,
            balanceCap: mortgageParams.balanceCap,
            incomeTaxBeforeCredit: result.baseIncomeTax,
            taxableIncomeForResident: result.taxableIncomeForResidentTax,
            // 合計所得金額の近似 (給与所得)。2,000万超で住宅ローン控除は不適用。
            totalIncome: result.employmentIncome,
            outsidePeriod: !mortgagePeriod.withinPeriod,
          }
        : undefined,
      dividend: dividendIncome > 0
        ? { dividendIncome, taxableTotalIncome: result.taxableIncomeForIncomeTax, kind: dividendKind }
        : undefined,
    });
    const afterCredits = applyTaxCreditsWithSurtax(
      result.baseIncomeTax,
      result.residentTax,
      credits,
      RECONSTRUCTION_SURTAX_RATE,
    );
    const finalTakeHome = dGross - afterCredits.incomeTax - afterCredits.residentTax;

    return { ded, result, credits, afterCredits, finalTakeHome };
  }, [dGrossStr, dSocialStr, dIdecoStr, idecoOccupation, dSmallBizStr, dLifeStr, dLifeOldStr, dQuakeStr, dMedicalStr, dSelfMedStr, dDonationStr, hasSpouse, spouseIncomeStr, generalDeps, specificDeps, singleParent, mortgageBalanceStr, mortgageYear, mortgagePerf, dividendStr, dividendKind]);

  // --- ④ 退職所得の試算 ---
  const [severanceStr, setSeveranceStr] = useState('20000000');
  const [yearsStr, setYearsStr] = useState('30');
  const [shortTerm, setShortTerm] = useState(false);
  const [retDisability, setRetDisability] = useState(false);

  const retirement = useMemo(() => {
    return calcRetirementTax(num(severanceStr), num(yearsStr), {
      shortTerm,
      disability: retDisability,
    });
  }, [severanceStr, yearsStr, shortTerm, retDisability]);

  // --- ⑤ 一時所得の試算 (総合課税) ---
  const [casualGrossStr, setCasualGrossStr] = useState('3000000');
  const [casualExpStr, setCasualExpStr] = useState('2000000');

  const casual = useMemo(() => {
    return calcCasualIncome(num(casualGrossStr), num(casualExpStr));
  }, [casualGrossStr, casualExpStr]);

  // --- ⑥ 譲渡所得の試算 (申告分離課税) ---
  const [cgProceedsStr, setCgProceedsStr] = useState('50000000');
  const [cgCostStr, setCgCostStr] = useState('30000000');
  const [cgFeeStr, setCgFeeStr] = useState('2000000');
  const [cgKind, setCgKind] = useState<CapitalAssetKind>('real-estate-long');
  const [cgUseEstimate, setCgUseEstimate] = useState(false);

  const capitalGains = useMemo(() => {
    // 概算取得費5%特例: 取得費不明 or 概算の方が大きい場合は概算取得費を使う。
    const cost = resolveAcquisitionCost(num(cgProceedsStr), num(cgCostStr), cgUseEstimate);
    return calcCapitalGainsTax(num(cgProceedsStr), cost, num(cgFeeStr), cgKind);
  }, [cgProceedsStr, cgCostStr, cgFeeStr, cgKind, cgUseEstimate]);

  // --- ⑦ ふるさと納税ワンストップ特例の内訳 ---
  const [fsDonationStr, setFsDonationStr] = useState('52000');
  const [fsMunicipalitiesStr, setFsMunicipalitiesStr] = useState('3');
  const [fsFilesReturn, setFsFilesReturn] = useState(false);

  const furusato = useMemo(() => {
    // セクション③の精密試算から住民税所得割額・限界税率を引いて使う。
    const levy = precise.result.residentIncomeLevy;
    const marginal = marginalIncomeTaxRate(precise.result.taxableIncomeForIncomeTax);
    const eligibility = furusatoOneStopEligibility(num(fsMunicipalitiesStr), fsFilesReturn);
    // ワンストップが使える かつ 申告しない場合のみ one-stop 計算。
    const useOneStop = eligibility.eligible;
    return {
      eligibility,
      filing: calcFurusatoBreakdown(num(fsDonationStr), levy, marginal, false),
      oneStop: calcFurusatoBreakdown(num(fsDonationStr), levy, marginal, true),
      useOneStop,
      levy,
      marginal,
    };
  }, [fsDonationStr, fsMunicipalitiesStr, fsFilesReturn, precise.result.residentIncomeLevy, precise.result.taxableIncomeForIncomeTax]);

  // --- ⑧ 上場株式配当の課税方式 有利判定 ---
  const [divIncomeStr, setDivIncomeStr] = useState('1000000');
  const dividendComparison = useMemo(() => {
    // 配当以外の課税所得はセクション③の精密試算 (配当を含まない) を使う。
    return compareDividendMethods(num(divIncomeStr), precise.result.taxableIncomeForIncomeTax, 'stock');
  }, [divIncomeStr, precise.result.taxableIncomeForIncomeTax]);

  const dividendMethodLabel: Record<DividendMethod, string> = {
    withholding: '申告不要 (源泉徴収)',
    separate: '申告分離課税',
    aggregate: '総合課税',
  };
  // 配当を申告した場合に所得割から差し引ける配当割控除 (住民税5%)。
  const dividendLevyCredit = useMemo(() => calcDividendLevyCredit(num(divIncomeStr)), [divIncomeStr]);

  // --- ⑨ 公的年金等の雑所得 ---
  const [pensionIncomeStr, setPensionIncomeStr] = useState('3000000');
  const [pensionOver65, setPensionOver65] = useState(true);
  const pension = useMemo(
    () => calcPublicPensionIncome(num(pensionIncomeStr), pensionOver65),
    [pensionIncomeStr, pensionOver65],
  );

  // --- ⑩ 消費税の納付方式の比較 (本則/簡易/2割特例) ---
  const [ctSalesStr, setCtSalesStr] = useState('8000000');
  const [ctReducedSalesStr, setCtReducedSalesStr] = useState('0');
  const [ctPurchaseStr, setCtPurchaseStr] = useState('3000000');
  const [ctBizType, setCtBizType] = useState<SimplifiedBusinessType>('service');
  const consumptionMethods = useMemo(
    () =>
      compareBusinessTaxMethods(
        [{ type: ctBizType, sales: { standard: num(ctSalesStr), reduced: num(ctReducedSalesStr) } }],
        { standard: num(ctPurchaseStr), reduced: 0 },
      ),
    [ctSalesStr, ctReducedSalesStr, ctPurchaseStr, ctBizType],
  );
  const ctExempt = useMemo(
    () => isTaxExempt(num(ctSalesStr) + num(ctReducedSalesStr)),
    [ctSalesStr, ctReducedSalesStr],
  );
  const ctMethodLabel: Record<ConsumptionTaxMethod, string> = {
    standard: '本則課税',
    simplified: '簡易課税',
    'twenty-percent': '2割特例',
  };

  // --- ⑫ 相続・贈与・その他の税 (概算) ---
  // すべて純粋関数のライブ呼び出し。入力は文字列で保持し、num() で正の数値化。
  // 純粋関数は 0/不正入力で throw する場合があるため、各 useMemo は try/catch で
  // ガードし、描画クラッシュを防ぐ (バッチ1と同じく「throw させず描画継続」)。

  // (a) 相続税: 法定相続分は「均等按分」の簡易UI。法定相続人数 n を入力し、
  //     legalShares を [1/n, ...] で生成する (配偶者の 1/2 等の実際の按分は簡略化)。
  const [inhEstateStr, setInhEstateStr] = useState('100000000');
  const [inhDebtsStr, setInhDebtsStr] = useState('0');
  const [inhFuneralStr, setInhFuneralStr] = useState('0');
  const [inhHeirsStr, setInhHeirsStr] = useState('2');
  const inheritance = useMemo(() => {
    try {
      // 法定相続人数は 1 以上の整数。0/不正は 1 に丸める。
      const heirs = Math.max(1, Math.floor(num(inhHeirsStr)) || 1);
      // 均等按分の簡易モデル: 各相続人 1/n。合計はちょうど 1.0 にするため
      // 端数を先頭に寄せる (1/3 等の浮動小数和の誤差を吸収)。
      const each = 1 / heirs;
      const legalShares = Array<number>(heirs).fill(each);
      legalShares[0] = 1 - each * (heirs - 1);
      return estimateInheritanceTax({
        grossEstate: num(inhEstateStr),
        debts: num(inhDebtsStr),
        funeralExpenses: num(inhFuneralStr),
        legalShares,
      });
    } catch {
      return { basicDeduction: 0, taxableEstate: 0, totalTax: 0 };
    }
  }, [inhEstateStr, inhDebtsStr, inhFuneralStr, inhHeirsStr]);

  // (b) 贈与税: 暦年課税 / 相続時精算課税 を選択。暦年は一般/特例の速算表選択。
  const [giftAmountStr, setGiftAmountStr] = useState('5000000');
  const [giftMethod, setGiftMethod] = useState<'annual' | 'settlement'>('annual');
  const [giftType, setGiftType] = useState<GiftType>('special');
  const [giftPriorStr, setGiftPriorStr] = useState('0');
  const gift = useMemo(() => {
    try {
      if (giftMethod === 'settlement') {
        const r = settlementGiftTax({
          giftAmount: num(giftAmountStr),
          cumulativePriorGifts: num(giftPriorStr),
        });
        return { taxableAmount: r.taxableAmount, tax: r.tax };
      }
      const r = annualGiftTax({ giftAmount: num(giftAmountStr), giftType });
      return { taxableAmount: r.taxableAmount, tax: r.tax };
    } catch {
      return { taxableAmount: 0, tax: 0 };
    }
  }, [giftAmountStr, giftMethod, giftType, giftPriorStr]);

  // (c) 自動車税: 排気量 → 種別割年額。取得価額 + 環境性能区分 → 環境性能割。
  const [autoCcStr, setAutoCcStr] = useState('2000');
  const [autoPriceStr, setAutoPriceStr] = useState('3000000');
  const [autoEnvCategory, setAutoEnvCategory] = useState<EnvironmentalPerformanceCategory>('gas2030_60');
  const automobile = useMemo(() => {
    let typeTax = 0;
    try {
      const cc = num(autoCcStr);
      // 排気量 0 以下は throw するため、正値のときだけ計算する。
      typeTax = cc > 0 ? automobileTaxByDisplacement(cc) : 0;
    } catch {
      typeTax = 0;
    }
    let envRate = 0;
    let envLevy = 0;
    try {
      const r = environmentalPerformanceLevy({
        acquisitionPrice: num(autoPriceStr),
        category: autoEnvCategory,
      });
      envRate = r.rate;
      envLevy = r.levy;
    } catch {
      envRate = 0;
      envLevy = 0;
    }
    return { typeTax, envRate, envLevy };
  }, [autoCcStr, autoPriceStr, autoEnvCategory]);

  // (d) 事業所税: 事業所床面積・従業者数・給与総額 → 資産割 + 従業者割 + 合計。
  const [boAreaStr, setBoAreaStr] = useState('2000');
  const [boEmployeesStr, setBoEmployeesStr] = useState('150');
  const [boSalaryStr, setBoSalaryStr] = useState('600000000');
  const businessOffice = useMemo(() => {
    try {
      return businessOfficeTax({
        floorAreaSqm: num(boAreaStr),
        employeeCount: num(boEmployeesStr),
        totalSalary: num(boSalaryStr),
      });
    } catch {
      return {
        assetTax: 0,
        employeeTax: 0,
        total: 0,
        assetExempt: true,
        employeeExempt: true,
      };
    }
  }, [boAreaStr, boEmployeesStr, boSalaryStr]);

  const GIFT_TYPE_LABEL: Record<GiftType, string> = {
    general: '一般贈与財産 (兄弟間・夫婦間・親→未成年の子等)',
    special: '特例贈与財産 (直系尊属→18歳以上の子・孫)',
  };
  const ENV_CATEGORY_LABEL: Record<EnvironmentalPerformanceCategory, string> = {
    electric: '電気自動車等 (非課税 0%)',
    gas2030_85: '2030年度燃費基準85%達成 (非課税 0%)',
    gas2030_75: '2030年度燃費基準75%達成 (1%)',
    gas2030_60: '2030年度燃費基準60%達成 (2%)',
    other: 'それ以外 (3%)',
  };

  // --- ⑪ 不動産・資産にかかる税 (概算) ---
  // すべて純粋関数のライブ呼び出し。入力は文字列で保持し、num() で正の数値化。
  // 不正/空入力でも throw しないよう、num() は 0 を返し、各純粋関数は 0 入力で
  // 安全に動く (固定資産税0・取得税は免税点未満で exempt) ため try/catch は不要。

  // (a) 固定資産税・都市計画税
  const [faAssessedStr, setFaAssessedStr] = useState('30000000');
  const [faAreaStr, setFaAreaStr] = useState('200');
  const [faDwellingsStr, setFaDwellingsStr] = useState('1');
  const [faResidential, setFaResidential] = useState(true);
  const fixedAsset = useMemo(() => {
    const assessedValue = num(faAssessedStr);
    const areaSqm = num(faAreaStr);
    // 戸数は 1 以上の整数 (residentialLandTaxableBase の要件)。0/不正は 1 に。
    const dwellings = Math.max(1, Math.floor(num(faDwellingsStr)) || 1);
    if (faResidential) {
      // 住宅用地特例あり: 課税標準を 1/6・1/3 等に按分して合算する。
      return calcFixedAssetTaxTotal({ assessedValue, areaSqm, dwellings });
    }
    // 特例なし: 評価額をそのまま課税標準として課税。
    const fixed = fixedAssetTax({ taxableBase: assessedValue });
    const city = cityPlanningTax({ taxableBase: assessedValue });
    return { fixedAssetTax: fixed, cityPlanningTax: city, total: fixed + city, exempt: false };
  }, [faAssessedStr, faAreaStr, faDwellingsStr, faResidential]);

  // (b) 不動産取得税
  const [acqAssessedStr, setAcqAssessedStr] = useState('20000000');
  const [acqPropertyType, setAcqPropertyType] = useState<PropertyType>('residentialBuilding');
  const [acqUrbanLand, setAcqUrbanLand] = useState(true);
  const [acqNewBuilding, setAcqNewBuilding] = useState(true);
  const [acqReduction, setAcqReduction] = useState(true);
  const acquisition = useMemo(
    () =>
      realEstateAcquisitionTax({
        assessedValue: num(acqAssessedStr),
        propertyType: acqPropertyType,
        applyReduction: acqReduction,
        isUrbanLand: acqUrbanLand,
        isNewBuilding: acqNewBuilding,
      }),
    [acqAssessedStr, acqPropertyType, acqUrbanLand, acqNewBuilding, acqReduction],
  );

  // (c) 登録免許税
  const [regTaxableStr, setRegTaxableStr] = useState('20000000');
  const [regType, setRegType] = useState<RegistrationType>('transferSale');
  const registration = useMemo(
    () => realEstateRegistrationTax({ taxableValue: num(regTaxableStr), registrationType: regType }),
    [regTaxableStr, regType],
  );

  // (d) 印紙税
  const [stampDocType, setStampDocType] = useState<DocumentType>('realEstateTransfer');
  const [stampAmountStr, setStampAmountStr] = useState('30000000');
  const stamp = useMemo(() => {
    // 第7号 (継続的取引基本契約) は記載金額によらず一律のため金額は無視される。
    const amount = num(stampAmountStr);
    return stampDutyAmount({
      documentType: stampDocType,
      contractAmount: amount > 0 ? amount : undefined,
    });
  }, [stampDocType, stampAmountStr]);

  // (e) 不動産取得コスト総額 (取得税 + 登録免許税 + 印紙税)
  const [costAssessedStr, setCostAssessedStr] = useState('20000000');
  const [costContractStr, setCostContractStr] = useState('30000000');
  const [costPropertyType, setCostPropertyType] = useState<PropertyType>('residentialBuilding');
  const [costRegType, setCostRegType] = useState<RegistrationType>('transferSale');
  const purchaseCost = useMemo(() => {
    const contract = num(costContractStr);
    return estimateRealEstatePurchaseTaxCost({
      assessedValue: num(costAssessedStr),
      contractAmount: contract > 0 ? contract : undefined,
      propertyType: costPropertyType,
      registrationType: costRegType,
    });
  }, [costAssessedStr, costContractStr, costPropertyType, costRegType]);

  const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
    land: '土地',
    residentialBuilding: '住宅家屋',
    nonResidentialBuilding: '非住宅家屋 (店舗・事務所)',
  };
  const REGISTRATION_TYPE_LABEL: Record<RegistrationType, string> = {
    transferSale: '所有権移転 (売買 2.0%)',
    preservation: '所有権保存 (新築 0.4%)',
    transferInheritance: '所有権移転 (相続 0.4%)',
    transferGift: '所有権移転 (贈与 2.0%)',
    mortgage: '抵当権設定 (債権額 0.4%)',
  };
  const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
    realEstateTransfer: '第1号 不動産譲渡契約書',
    construction: '第2号 請負契約書 (建設工事等)',
    receipt: '第17号 売上代金の受取書 (領収書)',
    continuousBasicContract: '第7号 継続的取引の基本契約書 (一律4,000円)',
  };

  const openTool = (url: string) => {
    void window.serviceHub.openExternal(url);
  };

  return (
    <div>
      <StatusBar
        serviceId="tax"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>税務試算 · 概算シミュレーション</>}
      />

      <div
        role="note"
        style={{
          margin: '0 0 12px',
          padding: 10,
          background: 'rgba(251, 191, 36, 0.08)',
          border: '1px solid #fbbf24',
          borderRadius: 6,
          fontSize: 11,
          color: '#fbbf24',
          lineHeight: 1.6,
        }}
      >
        ⚠️ 本機能は<strong>概算シミュレーション</strong>であり、正確な税額計算・税務助言ではありません。
        各種控除・特例・地域差・年度改正は完全には反映されません。実際の申告・納税は税理士にご相談のうえ、
        下部の公式ツール (国税庁 / e-Tax / 会計ソフト) で確定してください。
        <strong>本アプリが自動で納付・申告を行うことはありません。</strong>
      </div>

      <Section title="① 課税所得から所得税・住民税を試算" count={2}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-mute)' }}>課税所得 (年, 円)</label>
          <input
            type="text"
            inputMode="decimal"
            value={incomeStr}
            onChange={(e) => setIncomeStr(e.target.value)}
            placeholder="例: 5,000,000"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Stat label="所得税 (速算表 + 復興税2.1%)" value={jpy(incomeTax)} />
          <Stat label="住民税 (所得割10% + 均等割)" value={jpy(residentTax)} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 所得税は国税庁の速算表 (7段階・累進)、住民税は所得割10%+均等割で計算。ここでの「課税所得」は
          各種所得控除をすべて差し引いた後の金額を入力してください。
          均等割5,000円の内訳は、2024年度以降は基礎4,000円+森林環境税1,000円 (それ以前は基礎4,000円+復興特別1,000円) で、
          総額は変わりません。
        </div>
      </Section>

      <Section title="② 額面年収から手取りを試算" count={3}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--text-mute)' }}>額面年収 (円)</label>
          <input
            type="text"
            inputMode="decimal"
            value={grossStr}
            onChange={(e) => setGrossStr(e.target.value)}
            placeholder="例: 6,000,000"
            style={inputStyle}
          />
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={careInsurance} onChange={(e) => setCareInsurance(e.target.checked)} />
            40〜64歳 (介護保険料を上乗せ)
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            賞与 (1回・円)
            <input type="text" inputMode="decimal" value={bonusPerStr} onChange={(e) => setBonusPerStr(e.target.value)} style={{ ...inputStyle, width: 120 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            賞与 年間回数
            <input type="text" inputMode="decimal" value={bonusCountStr} onChange={(e) => setBonusCountStr(e.target.value)} style={{ ...inputStyle, width: 90 }} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="所得税" value={jpy(netSalary.incomeTax)} />
          <Stat label="住民税" value={jpy(netSalary.residentTax)} />
          <Stat label="手取り (年)" value={jpy(netSalary.takeHome)} positive />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 給与所得控除・基礎控除・所得税速算表・住民税は<strong>正式テーブル</strong>で計算。手取りの社会保険料は額面比例の概算 (約15%)。
          配偶者・扶養・生命保険料等の控除は含まないため、扶養がある場合は実際より高めに出ます。<br />
          内訳: 給与所得 {jpy(netSalary.employmentIncome)} / 社保 {jpy(netSalary.socialInsurance)} /
          課税所得 {jpy(netSalary.taxableIncome)} / 所得税 {jpy(netSalary.incomeTax)} / 住民税 {jpy(netSalary.residentTax)}。
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <strong>社会保険料の精密概算 (標準報酬月額の上限を反映)</strong>：
          合計 {jpy(socialInsurancePrecise.total)}（厚生年金 {jpy(socialInsurancePrecise.pension)} /
          健康保険{careInsurance ? '+介護' : ''} {jpy(socialInsurancePrecise.health)} /
          雇用保険 {jpy(socialInsurancePrecise.employment)}）。
          厚生年金は標準報酬月額65万円、健康保険は139万円で頭打ちになるため、高年収では上の額面比例(15%)より低くなります (令和6年度・協会けんぽ全国平均ベース)。
          {num(bonusPerStr) > 0 && num(bonusCountStr) > 0 && (
            <> 賞与を入力した場合は、標準賞与額の上限 (厚生年金 1回150万円 / 健康保険 年573万円) を反映し、年収から賞与総額を引いた残りを月額報酬として計算します。</>
          )}
        </div>
      </Section>

      <Section title="③ 全控除込みの精密試算" count={3}>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
          主要な所得控除 (基礎・社会保険料・小規模企業共済/iDeCo・配偶者・扶養・生命保険料・地震保険料・医療費・寄附金/ふるさと納税・ひとり親) を反映した精密試算です。
          給与所得控除・各控除・税率は<strong>正式テーブル</strong>。確定申告は必ず公式ツール / 税理士でご確認ください。
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 10, marginBottom: 12 }}>
          {([
            ['額面年収 (円)', dGrossStr, setDGrossStr],
            ['支払社会保険料 (実額/年)', dSocialStr, setDSocialStr],
            ['iDeCo 拠出 (年)', dIdecoStr, setDIdecoStr],
            ['小規模企業共済 (年・上限84万)', dSmallBizStr, setDSmallBizStr],
            ['一般生命保険料・新制度 (年)', dLifeStr, setDLifeStr],
            ['一般生命保険料・旧制度 (年)', dLifeOldStr, setDLifeOldStr],
            ['地震保険料 (年)', dQuakeStr, setDQuakeStr],
            ['医療費 (年・自己負担)', dMedicalStr, setDMedicalStr],
            ['セルフメディケーション (年・スイッチOTC)', dSelfMedStr, setDSelfMedStr],
            ['ふるさと納税 (年)', dDonationStr, setDDonationStr],
            ['一般扶養 (人)', generalDeps, setGeneralDeps],
            ['特定扶養 19-22歳 (人)', specificDeps, setSpecificDeps],
            ['住宅ローン年末残高 (円)', mortgageBalanceStr, setMortgageBalanceStr],
            ['配当所得・総合課税 (年)', dividendStr, setDividendStr],
          ] as const).map(([label, val, setter]) => (
            <label key={label} style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {label}
              <input
                type="text"
                inputMode="decimal"
                value={val}
                onChange={(e) => setter(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              />
            </label>
          ))}
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            iDeCo 職業区分 (拠出上限)
            <select value={idecoOccupation} onChange={(e) => setIdecoOccupation(e.target.value as IdecoOccupation | '')} style={{ ...inputStyle, width: '100%' }}>
              <option value="">未指定 (上限なし)</option>
              <option value="self-employed">自営業 (月6.8万)</option>
              <option value="employee-no-pension">会社員・企業年金なし (月2.3万)</option>
              <option value="employee-with-dc">会社員・企業型DC (月2.0万)</option>
              <option value="civil-servant">公務員 (月1.2万)</option>
              <option value="dependent-spouse">第3号被保険者 (月2.3万)</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={hasSpouse} onChange={(e) => setHasSpouse(e.target.checked)} />
            配偶者あり
          </label>
          {hasSpouse && (
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', alignItems: 'center', gap: 4 }}>
              配偶者の合計所得 (円)
              <input
                type="text"
                inputMode="decimal"
                value={spouseIncomeStr}
                onChange={(e) => setSpouseIncomeStr(e.target.value)}
                style={{ ...inputStyle, width: 120 }}
              />
            </label>
          )}
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={singleParent} onChange={(e) => setSingleParent(e.target.checked)} />
            ひとり親
          </label>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            住宅ローン: 居住開始年
            <select value={mortgageYear} onChange={(e) => setMortgageYear(Number(e.target.value))} style={{ ...inputStyle, width: 120 }}>
              {[2020, 2021, 2022, 2023, 2024, 2025].map((y) => (
                <option key={y} value={y}>{y}年（{y <= 2021 ? '控除率1.0%' : '0.7%'}）</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            住宅性能区分
            <select value={mortgagePerf} onChange={(e) => setMortgagePerf(e.target.value as HousingPerformance)} style={{ ...inputStyle, width: 200 }}>
              <option value="long-life">認定長期優良・低炭素 (5,000万)</option>
              <option value="zeh">ZEH水準省エネ (4,500万)</option>
              <option value="standard">省エネ基準適合 (4,000万)</option>
              <option value="non-standard">その他/非適合 (〜3,000万)</option>
              <option value="used">中古住宅 (3,000万)</option>
            </select>
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            配当の種類
            <select value={dividendKind} onChange={(e) => setDividendKind(e.target.value as DividendKind)} style={{ ...inputStyle, width: 200 }}>
              <option value="stock">国内株式 (10%/5%)</option>
              <option value="mutual-fund">証券投資信託 (5%/2.5%)</option>
              <option value="foreign-mutual-fund">外貨建等投信 (2.5%/1.25%)</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="所得税 (税額控除後)" value={jpy(precise.afterCredits.incomeTax)} />
          <Stat label="住民税 (税額控除後)" value={jpy(precise.afterCredits.residentTax)} />
          <Stat label="手取り (年)" value={jpy(precise.finalTakeHome)} positive />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.7 }}>
          給与所得控除 {jpy(precise.result.salaryDeduction)} / 給与所得 {jpy(precise.result.employmentIncome)}<br />
          所得控除合計: 所得税ベース {jpy(precise.ded.total.incomeTax)} / 住民税ベース {jpy(precise.ded.total.residentTax)}<br />
          （内訳: 基礎 {jpy(precise.ded.basic.incomeTax)} / 社保 {jpy(precise.ded.socialInsurance.incomeTax)} /
          共済+iDeCo {jpy(precise.ded.smallBizMutualAid.incomeTax)} / 配偶者 {jpy(precise.ded.spouse.incomeTax)} /
          扶養 {jpy(precise.ded.dependents.incomeTax)} / 生命保険 {jpy(precise.ded.lifeInsurance.incomeTax)} /
          地震保険 {jpy(precise.ded.earthquakeInsurance.incomeTax)} / 医療費・セルフメディケーション {jpy(precise.ded.medical.incomeTax)} (有利な方を自動採用) /
          寄附金 {jpy(precise.ded.donation.incomeTax)} / ひとり親 {jpy(precise.ded.singleParentOrWidow.incomeTax)}）<br />
          所得控除適用後の税額: 所得税 {jpy(precise.result.incomeTax)} / 住民税 {jpy(precise.result.residentTax)}
          (住民税の調整控除 {jpy(precise.result.adjustmentCredit)} / ふるさと納税の住民税控除 {jpy(precise.result.furusatoResidentCredit)} 適用済)<br />
          <strong>税額控除</strong>: 住宅ローン (所得税 {jpy(precise.credits.mortgageIncomeTax)} / 住民税 {jpy(precise.credits.mortgageResidentTax)}) /
          配当控除 (所得税 {jpy(precise.credits.dividendIncomeTax)} / 住民税 {jpy(precise.credits.dividendResidentTax)})。
        </div>
        <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 8, lineHeight: 1.6 }}>
          ⚠️ 社会保険料は「実額」を入力してください (額面比例の概算ではありません)。配当は総合課税を選択した配当を想定 (申告分離・上場株式の特例は別計算)。
          住宅ローン控除は居住年・住宅性能区分で控除率/上限が変わります (上のセレクタで選択)。
          扶養親族はそれぞれ<strong>合計所得 48 万円以下</strong>が要件です (要件を満たす人数のみ入力してください)。
          税額控除は復興特別所得税より前の基準所得税額から差し引き、住民税の調整控除も反映しています。
          (人的控除差は基礎・配偶者・扶養・障害者・寡婦/ひとり親・勤労学生の所得税/住民税差から算定。社会保険の非課税限度額は未反映。)
        </div>
      </Section>

      <Section title="④ 退職所得の試算 (分離課税)" count={3}>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
          退職金は給与所得と分離して課税されます。退職所得控除を引いた残額の <strong>1/2</strong> に対し、
          所得税 (速算表+復興税) と住民税 (10%) がかかります (正式ルール)。
          ※ 同一年に複数の退職金がある場合や前年以前の退職との通算は未対応です。
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            退職金 (円)
            <input type="text" inputMode="decimal" value={severanceStr} onChange={(e) => setSeveranceStr(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            勤続年数 (1年未満切上)
            <input type="text" inputMode="decimal" value={yearsStr} onChange={(e) => setYearsStr(e.target.value)} style={{ ...inputStyle, width: 120 }} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={shortTerm} onChange={(e) => setShortTerm(e.target.checked)} />
            短期退職手当等 (勤続5年以下)
          </label>
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={retDisability} onChange={(e) => setRetDisability(e.target.checked)} />
            障害退職 (控除+100万)
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="所得税 (退職所得)" value={jpy(retirement.incomeTax)} />
          <Stat label="住民税 (退職所得)" value={jpy(retirement.residentTax)} />
          <Stat label="手取り" value={jpy(retirement.takeHome)} positive />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          退職所得控除 {jpy(retirement.deduction)} / 課税退職所得金額 {jpy(retirement.taxableIncome)}。
          {shortTerm && <> 短期退職手当等は控除後300万円を超える部分の1/2課税が適用されません。</>}
        </div>
      </Section>

      <Section title="⑤ 一時所得の試算 (総合課税)" count={2}>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
          生命保険の満期返戻金・解約返戻金 (一時金)、懸賞・福引の賞金、競馬の払戻金、法人からの贈与などが一時所得です。
          <strong>(収入 − 経費 − 特別控除50万円) × 1/2</strong> が総合課税の課税所得に算入されます (国税庁 No.1490)。
          ※ 算入額は他の所得と合算して課税されます。本欄は算入額のみを計算します。
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            総収入金額 (円)
            <input type="text" inputMode="decimal" value={casualGrossStr} onChange={(e) => setCasualGrossStr(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            収入を得るための支出 (円)
            <input type="text" inputMode="decimal" value={casualExpStr} onChange={(e) => setCasualExpStr(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Stat label="一時所得の金額 (1/2前)" value={jpy(casual.casualIncome)} />
          <Stat label="課税所得への算入額 (×1/2)" value={jpy(casual.taxableAmount)} positive />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          特別控除 {jpy(casual.specialDeduction)} (最高50万円)。算入額を ① の課税所得に足して総合課税で試算してください。
        </div>
      </Section>

      <Section title="⑥ 譲渡所得の試算 (申告分離課税)" count={3}>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
          土地・建物・株式などの売却益は、給与等と分離して課税されます。
          <strong>譲渡益 = 収入 − 取得費 − 譲渡費用</strong>。所有期間 (5年) で短期/長期の税率が変わり、
          居住用財産は3,000万円特別控除と軽減税率があります (国税庁 No.3202/3305/1463)。
          取得費が不明な場合は「取得費不明 (概算取得費5%)」にチェックすると、譲渡収入の5%を取得費として計算します (国税庁 No.3258)。
          ※ 買換特例・損益通算・繰越控除は未対応です。
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            譲渡収入 (円)
            <input type="text" inputMode="decimal" value={cgProceedsStr} onChange={(e) => setCgProceedsStr(e.target.value)} style={{ ...inputStyle, width: 150 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            取得費 (円)
            <input type="text" inputMode="decimal" value={cgCostStr} onChange={(e) => setCgCostStr(e.target.value)} style={{ ...inputStyle, width: 150 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            譲渡費用 (円)
            <input type="text" inputMode="decimal" value={cgFeeStr} onChange={(e) => setCgFeeStr(e.target.value)} style={{ ...inputStyle, width: 130 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            資産区分
            <select value={cgKind} onChange={(e) => setCgKind(e.target.value as CapitalAssetKind)} style={{ ...inputStyle, width: 220 }}>
              <option value="real-estate-long">土地建物・長期 (5年超 15%+5%)</option>
              <option value="real-estate-short">土地建物・短期 (5年以下 30%+9%)</option>
              <option value="residential">居住用財産 (3,000万控除+軽減税率)</option>
              <option value="listed-stock">上場株式等 (20.315%)</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={cgUseEstimate} onChange={(e) => setCgUseEstimate(e.target.checked)} />
            取得費不明 (概算取得費5%)
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="所得税 (譲渡所得)" value={jpy(capitalGains.incomeTax)} />
          <Stat label="住民税 (譲渡所得)" value={jpy(capitalGains.residentTax)} />
          <Stat label="税額合計" value={jpy(capitalGains.totalTax)} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          譲渡益 {jpy(capitalGains.gain)}
          {capitalGains.specialDeduction > 0 && <> / 特別控除 {jpy(capitalGains.specialDeduction)}</>}
          {' '}/ 課税譲渡所得 {jpy(capitalGains.taxableGain)} / 売却代金からの手取り {jpy(capitalGains.takeHome)}。
        </div>
      </Section>

      <Section title="⑦ ふるさと納税 ワンストップ特例の内訳" count={2}>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
          ふるさと納税は自己負担2,000円を除いた寄附額が所得税・住民税から控除されます。
          <strong>ワンストップ特例</strong> (給与所得者・確定申告不要・寄附先5自治体以内) では所得税からの控除を行わず、
          その相当額を住民税に上乗せします。<strong>控除の総額は確定申告と変わりません</strong> (国税庁 No.1155)。
          ※ 住民税所得割額・限界税率はセクション③の精密試算の値を使用します。
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            寄附額 (年・円)
            <input type="text" inputMode="decimal" value={fsDonationStr} onChange={(e) => setFsDonationStr(e.target.value)} style={{ ...inputStyle, width: 150 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            寄附先 自治体数
            <input type="text" inputMode="decimal" value={fsMunicipalitiesStr} onChange={(e) => setFsMunicipalitiesStr(e.target.value)} style={{ ...inputStyle, width: 120 }} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={fsFilesReturn} onChange={(e) => setFsFilesReturn(e.target.checked)} />
            確定申告を行う
          </label>
        </div>
        <div
          style={{
            border: '1px solid var(--border)',
            borderLeft: `3px solid ${furusato.eligibility.eligible ? 'var(--success, #3ec98a)' : 'var(--text-mute)'}`,
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 12,
            color: 'var(--text)',
          }}
        >
          {furusato.eligibility.eligible ? '✅' : 'ℹ️'} {furusato.eligibility.reason}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>確定申告</div>
            <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.7 }}>
              所得税控除 {jpy(furusato.filing.incomeTaxDeduction)}<br />
              住民税控除 {jpy(furusato.filing.totalResidentCredit)} (基本 {jpy(furusato.filing.residentBasic)} / 特例 {jpy(furusato.filing.residentSpecial)})<br />
              <strong>控除総額 {jpy(furusato.filing.totalBenefit)}</strong>
            </div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>ワンストップ特例</div>
            <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.7 }}>
              所得税控除 {jpy(furusato.oneStop.incomeTaxDeduction)} (住民税へ振替)<br />
              住民税控除 {jpy(furusato.oneStop.totalResidentCredit)} (基本+特例+申告特例 {jpy(furusato.oneStop.residentOneStopAddon)})<br />
              <strong>控除総額 {jpy(furusato.oneStop.totalBenefit)}</strong>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          {furusato.filing.cappedBySpecialLimit && (
            <>⚠️ 特例分が住民税所得割額の20%上限で頭打ちです。超過分は自己負担になります。<br /></>
          )}
          どちらの方式でも控除総額はほぼ同じです (端数処理の差のみ)。ワンストップは申告不要が利点、確定申告は他の控除と併せて行えます。
        </div>
      </Section>

      <Section title="⑧ 上場株式の配当 課税方式の有利判定" count={3}>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
          上場株式等の配当は、<strong>申告不要 (源泉徴収20.315%)・申告分離課税・総合課税</strong>から選べます (国税庁 No.1330)。
          総合課税は累進税率ですが<strong>配当控除</strong>が使え、課税所得が低いほど有利になりやすいです。
          ※ 配当以外の課税所得はセクション③の精密試算の値を使用。社会保険料への影響・損益通算は反映しません。
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            上場株式の配当所得 (年・円)
            <input type="text" inputMode="decimal" value={divIncomeStr} onChange={(e) => setDivIncomeStr(e.target.value)} style={{ ...inputStyle, width: 180 }} />
          </label>
        </div>
        <div
          style={{
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--success, #3ec98a)',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 13,
            color: 'var(--text)',
          }}
        >
          ✅ 最有利: <strong>{dividendMethodLabel[dividendComparison.best]}</strong>
          （税負担 {jpy(dividendComparison[dividendComparison.best].totalTax)}）
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {([dividendComparison.withholding, dividendComparison.separate, dividendComparison.aggregate]).map((m) => (
            <div
              key={m.method}
              style={{
                border: m.method === dividendComparison.best ? '2px solid var(--success, #3ec98a)' : '1px solid var(--border)',
                borderRadius: 8,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.7 }}>
                所得税 {jpy(m.incomeTax)}<br />
                住民税 {jpy(m.residentTax)}<br />
                <strong>税負担 {jpy(m.totalTax)}</strong>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 申告分離は申告不要と同じ税率ですが、上場株式等の譲渡損との損益通算・繰越控除ができる点が異なります。
          令和6年度以降、所得税と住民税で異なる課税方式は選べません。
          {dividendLevyCredit > 0 && (
            <> なお総合課税・申告分離で申告すると、源泉徴収済みの<strong>配当割控除 約{jpy(dividendLevyCredit)}</strong> (配当×5%) を住民税の所得割から差し引けます。</>
          )}
        </div>
      </Section>

      <Section title="⑨ 公的年金等の雑所得 (年金受給者)" count={2}>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
          国民年金・厚生年金・企業年金・iDeCo の年金受取などは「公的年金等」として、
          <strong>公的年金等控除</strong>を差し引いた額が雑所得になります (国税庁 No.1600)。
          控除額は65歳以上で手厚くなります (最低110万円、65歳未満は最低60万円)。
          ※ 算入額は他の所得と合算して総合課税します。本欄は雑所得のみを計算します。
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            公的年金等の収入 (年・円)
            <input type="text" inputMode="decimal" value={pensionIncomeStr} onChange={(e) => setPensionIncomeStr(e.target.value)} style={{ ...inputStyle, width: 180 }} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={pensionOver65} onChange={(e) => setPensionOver65(e.target.checked)} />
            65歳以上 (12/31時点)
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Stat label="公的年金等控除" value={jpy(pension.deduction)} />
          <Stat label="雑所得 (課税対象)" value={jpy(pension.taxableIncome)} positive />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          雑所得 {jpy(pension.taxableIncome)} を ① の課税所得に足して総合課税で試算してください。
          ※ 公的年金等以外の合計所得1,000万円超での控除引下げ等は未反映です。
        </div>
      </Section>

      <Section title="消費税の計算" count={1}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--text-mute)' }}>税抜金額 (円)</label>
          <input
            type="text"
            inputMode="decimal"
            value={netStr}
            onChange={(e) => setNetStr(e.target.value)}
            placeholder="例: 10,000"
            style={inputStyle}
          />
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
            軽減税率 (8%)
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Stat label={`消費税 (${reduced ? '8%' : '10%'})`} value={jpy(consumptionTax)} />
          <Stat label="税込合計" value={jpy(netAmount + consumptionTax)} />
        </div>
      </Section>

      <Section title="⑩ 消費税の納付方式の比較 (本則 / 簡易 / 2割特例)" count={3}>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
          消費税の課税事業者は<strong>本則課税・簡易課税・2割特例</strong>から納付方式を選べます。
          簡易課税は基準期間の課税売上5,000万円以下、2割特例はインボイス登録した免税事業者向けの経過措置 (令和8年分まで) です。
          ※ 概算試算であり、適用要件・端数処理の細部は反映しません。確定申告は税理士・国税庁でご確認ください。
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            課税売上 標準10% (税抜・年)
            <input type="text" inputMode="decimal" value={ctSalesStr} onChange={(e) => setCtSalesStr(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            課税売上 軽減8% (税抜・年)
            <input type="text" inputMode="decimal" value={ctReducedSalesStr} onChange={(e) => setCtReducedSalesStr(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            課税仕入 (税抜・本則用)
            <input type="text" inputMode="decimal" value={ctPurchaseStr} onChange={(e) => setCtPurchaseStr(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            事業区分 (簡易課税)
            <select value={ctBizType} onChange={(e) => setCtBizType(e.target.value as SimplifiedBusinessType)} style={{ ...inputStyle, width: 200 }}>
              <option value="wholesale">第1種 卸売業 (90%)</option>
              <option value="retail">第2種 小売業 (80%)</option>
              <option value="manufacturing">第3種 製造業・建設業 (70%)</option>
              <option value="other">第4種 その他・飲食店 (60%)</option>
              <option value="service">第5種 サービス業 (50%)</option>
              <option value="real-estate">第6種 不動産業 (40%)</option>
            </select>
          </label>
        </div>
        <div
          style={{
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--success, #3ec98a)',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 13,
            color: 'var(--text)',
          }}
        >
          ✅ 最も納付が少ない方式: <strong>{ctMethodLabel[consumptionMethods.best]}</strong>
          （納付 {jpy(consumptionMethods.bestAmount)}）
          {ctExempt && (
            <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>
              ※ 課税売上が1,000万円以下です。基準期間で同水準なら原則<strong>免税事業者</strong>（インボイス登録時を除く）。
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="本則課税" value={jpy(consumptionMethods.standard)} positive={consumptionMethods.best === 'standard'} />
          <Stat label="簡易課税" value={jpy(consumptionMethods.simplified)} positive={consumptionMethods.best === 'simplified'} />
          <Stat label="2割特例" value={jpy(consumptionMethods.twentyPercent)} positive={consumptionMethods.best === 'twenty-percent'} />
        </div>
      </Section>

      <Section title="⑪ 不動産・資産にかかる税 (概算)" count={5}>
        <div
          role="note"
          style={{
            margin: '0 0 12px',
            padding: 10,
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid #fbbf24',
            borderRadius: 6,
            fontSize: 11,
            color: '#fbbf24',
            lineHeight: 1.6,
          }}
        >
          ⚠️ 以下はいずれも<strong>概算であり税務助言ではありません。</strong>
          各税の特例・軽減措置 (新築住宅の課税標準控除・住宅用家屋の登録免許税軽減・契約書の印紙税軽減など)・
          自治体差・年度改正は反映しません。実際の課税標準・税額は<strong>都道府県税事務所 / 法務局 / 司法書士 / 税理士</strong>に
          ご確認ください。
        </div>

        {/* (a) 固定資産税・都市計画税 */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            (a) 固定資産税・都市計画税
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
            毎年1月1日時点の所有者に課されます。固定資産税は標準税率1.4%、都市計画税は制限税率0.3%。
            住宅用地特例 (小規模住宅用地は固定資産税1/6・都市計画税1/3) を反映します。
            ※ 新築住宅の減額措置・負担調整措置・自治体ごとの税率差は未反映の概算です (市区町村に確認してください)。
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              土地の固定資産税評価額 (円)
              <input type="text" inputMode="decimal" value={faAssessedStr} onChange={(e) => setFaAssessedStr(e.target.value)} style={{ ...inputStyle, width: 160 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              土地面積 (㎡)
              <input type="text" inputMode="decimal" value={faAreaStr} onChange={(e) => setFaAreaStr(e.target.value)} style={{ ...inputStyle, width: 120 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              住宅の戸数
              <input type="text" inputMode="decimal" value={faDwellingsStr} onChange={(e) => setFaDwellingsStr(e.target.value)} style={{ ...inputStyle, width: 90 }} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={faResidential} onChange={(e) => setFaResidential(e.target.checked)} />
              住宅用地特例を適用
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Stat label="固定資産税 (1.4%)" value={jpy(fixedAsset.fixedAssetTax)} />
            <Stat label="都市計画税 (0.3%)" value={jpy(fixedAsset.cityPlanningTax)} />
            <Stat label="合計 (年)" value={jpy(fixedAsset.total)} />
          </div>
          {fixedAsset.exempt && (
            <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8 }}>
              ※ 特例適用後の課税標準が免税点 (土地30万円) 未満のため非課税です。
            </div>
          )}
        </div>

        {/* (b) 不動産取得税 */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            (b) 不動産取得税
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
            不動産を取得したときに一度だけ課されます。本則4%、土地・住宅は軽減3%。宅地は課税標準1/2特例があります。
            ※ <strong>住宅の課税標準の特別控除 (新築1,200万円控除等) は未対応</strong>のため、実際より高めに出る概算です (都道府県税事務所に確認してください)。
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              固定資産税評価額 (円)
              <input type="text" inputMode="decimal" value={acqAssessedStr} onChange={(e) => setAcqAssessedStr(e.target.value)} style={{ ...inputStyle, width: 160 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              物件種別
              <select value={acqPropertyType} onChange={(e) => setAcqPropertyType(e.target.value as PropertyType)} style={{ ...inputStyle, width: 220 }}>
                <option value="land">{PROPERTY_TYPE_LABEL.land}</option>
                <option value="residentialBuilding">{PROPERTY_TYPE_LABEL.residentialBuilding}</option>
                <option value="nonResidentialBuilding">{PROPERTY_TYPE_LABEL.nonResidentialBuilding}</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={acqReduction} onChange={(e) => setAcqReduction(e.target.checked)} />
              軽減税率 (3%)
            </label>
            <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={acqUrbanLand} onChange={(e) => setAcqUrbanLand(e.target.checked)} />
              宅地評価 (土地1/2特例)
            </label>
            <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={acqNewBuilding} onChange={(e) => setAcqNewBuilding(e.target.checked)} />
              新築家屋
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Stat label="適用税率" value={`${(acquisition.rate * 100).toFixed(1)}%`} />
            <Stat label="課税標準" value={jpy(acquisition.taxableBase)} />
            <Stat label="不動産取得税" value={jpy(acquisition.tax)} />
          </div>
          {acquisition.exempt && (
            <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8 }}>
              ※ 課税標準が免税点未満のため非課税です。
            </div>
          )}
        </div>

        {/* (c) 登録免許税 */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            (c) 登録免許税
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
            登記をするときに課されます。課税標準は所有権の登記が固定資産税評価額、抵当権設定は債権額。
            ※ <strong>本則税率のみ対応</strong>で、住宅用家屋の軽減税率・土地売買の軽減 (1.5%) は未対応の概算です (法務局/司法書士に確認してください)。
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              課税標準 (評価額/債権額・円)
              <input type="text" inputMode="decimal" value={regTaxableStr} onChange={(e) => setRegTaxableStr(e.target.value)} style={{ ...inputStyle, width: 180 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              登記種別
              <select value={regType} onChange={(e) => setRegType(e.target.value as RegistrationType)} style={{ ...inputStyle, width: 240 }}>
                <option value="transferSale">{REGISTRATION_TYPE_LABEL.transferSale}</option>
                <option value="preservation">{REGISTRATION_TYPE_LABEL.preservation}</option>
                <option value="transferInheritance">{REGISTRATION_TYPE_LABEL.transferInheritance}</option>
                <option value="transferGift">{REGISTRATION_TYPE_LABEL.transferGift}</option>
                <option value="mortgage">{REGISTRATION_TYPE_LABEL.mortgage}</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <Stat label="適用税率 (本則)" value={`${(registration.rate * 100).toFixed(1)}%`} />
            <Stat label="登録免許税" value={jpy(registration.tax)} />
          </div>
        </div>

        {/* (d) 印紙税 */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            (d) 印紙税
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
            契約書・領収書などの課税文書に課されます。記載金額の階段表で税額が決まります。
            ※ <strong>本則税額のみ対応</strong>で、不動産譲渡契約書・建設工事請負契約書の軽減措置は未対応の概算です (税務署/税理士に確認してください)。
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              文書種別
              <select value={stampDocType} onChange={(e) => setStampDocType(e.target.value as DocumentType)} style={{ ...inputStyle, width: 260 }}>
                <option value="realEstateTransfer">{DOCUMENT_TYPE_LABEL.realEstateTransfer}</option>
                <option value="construction">{DOCUMENT_TYPE_LABEL.construction}</option>
                <option value="receipt">{DOCUMENT_TYPE_LABEL.receipt}</option>
                <option value="continuousBasicContract">{DOCUMENT_TYPE_LABEL.continuousBasicContract}</option>
              </select>
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              記載金額 (円・0で記載なし扱い)
              <input type="text" inputMode="decimal" value={stampAmountStr} onChange={(e) => setStampAmountStr(e.target.value)} style={{ ...inputStyle, width: 180 }} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 12 }}>
            <Stat label="印紙税額" value={jpy(stamp)} />
          </div>
        </div>

        {/* (e) 不動産取得コスト総額 */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            (e) 不動産取得コスト総額 (取得税 + 登録免許税 + 印紙税)
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
            不動産購入時にかかる主要3税を合算した概算です。
            ※ 各税の特例・軽減措置は未反映、固定資産税の日割清算・仲介手数料・消費税等は含みません (税理士/司法書士に確認してください)。
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              固定資産税評価額 (円)
              <input type="text" inputMode="decimal" value={costAssessedStr} onChange={(e) => setCostAssessedStr(e.target.value)} style={{ ...inputStyle, width: 160 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              契約金額 (印紙税・円)
              <input type="text" inputMode="decimal" value={costContractStr} onChange={(e) => setCostContractStr(e.target.value)} style={{ ...inputStyle, width: 160 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              物件種別
              <select value={costPropertyType} onChange={(e) => setCostPropertyType(e.target.value as PropertyType)} style={{ ...inputStyle, width: 220 }}>
                <option value="land">{PROPERTY_TYPE_LABEL.land}</option>
                <option value="residentialBuilding">{PROPERTY_TYPE_LABEL.residentialBuilding}</option>
                <option value="nonResidentialBuilding">{PROPERTY_TYPE_LABEL.nonResidentialBuilding}</option>
              </select>
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              登記種別
              <select value={costRegType} onChange={(e) => setCostRegType(e.target.value as RegistrationType)} style={{ ...inputStyle, width: 240 }}>
                <option value="transferSale">{REGISTRATION_TYPE_LABEL.transferSale}</option>
                <option value="preservation">{REGISTRATION_TYPE_LABEL.preservation}</option>
                <option value="transferInheritance">{REGISTRATION_TYPE_LABEL.transferInheritance}</option>
                <option value="transferGift">{REGISTRATION_TYPE_LABEL.transferGift}</option>
                <option value="mortgage">{REGISTRATION_TYPE_LABEL.mortgage}</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Stat label="不動産取得税" value={jpy(purchaseCost.acquisitionTax)} />
            <Stat label="登録免許税" value={jpy(purchaseCost.registrationTax)} />
            <Stat label="印紙税" value={jpy(purchaseCost.stampDuty)} />
            <Stat label="取得コスト合計" value={jpy(purchaseCost.total)} positive />
          </div>
        </div>
      </Section>

      <Section title="⑫ 相続・贈与・その他の税 (概算)" count={4}>
        <div
          role="note"
          style={{
            margin: '0 0 12px',
            padding: 10,
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid #fbbf24',
            borderRadius: 6,
            fontSize: 11,
            color: '#fbbf24',
            lineHeight: 1.6,
          }}
        >
          ⚠️ 以下はいずれも<strong>概算であり税務助言ではありません。</strong>
          相続税の配偶者の税額軽減・小規模宅地等の特例・2割加算、贈与税の各種非課税特例
          (住宅取得等資金・教育資金・配偶者控除など)、自動車税のグリーン化特例・自治体差、
          事業所税の課税対象自治体 (指定都市等) の判定・課税標準の特例は反映しません。
          実際の課税要否・税額は<strong>税理士 / 都道府県税事務所 / 市区町村</strong>に
          ご確認ください。
        </div>

        {/* (a) 相続税 */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            (a) 相続税
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
            基礎控除 (3,000万円 + 600万円 × 法定相続人数) を超えた課税遺産総額に、法定相続分課税方式の
            速算表を適用した<strong>相続税の総額</strong>までを概算します。
            ※ <strong>法定相続分は簡易に「均等按分 (各 1/n)」</strong>とする簡略UIです (配偶者1/2等の実際の按分・
            配偶者の税額軽減・小規模宅地等の特例・2割加算・各人への按分後の納付額は未対応のため、実際とは異なります)。
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              遺産総額 (課税価格・円)
              <input type="text" inputMode="decimal" value={inhEstateStr} onChange={(e) => setInhEstateStr(e.target.value)} style={{ ...inputStyle, width: 170 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              債務 (借入金等・円)
              <input type="text" inputMode="decimal" value={inhDebtsStr} onChange={(e) => setInhDebtsStr(e.target.value)} style={{ ...inputStyle, width: 150 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              葬式費用 (円)
              <input type="text" inputMode="decimal" value={inhFuneralStr} onChange={(e) => setInhFuneralStr(e.target.value)} style={{ ...inputStyle, width: 130 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              法定相続人数 (均等按分)
              <input type="text" inputMode="decimal" value={inhHeirsStr} onChange={(e) => setInhHeirsStr(e.target.value)} style={{ ...inputStyle, width: 110 }} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Stat label="基礎控除" value={jpy(inheritance.basicDeduction)} />
            <Stat label="課税遺産総額 (基礎控除後)" value={jpy(inheritance.taxableEstate)} />
            <Stat label="相続税の総額" value={jpy(inheritance.totalTax)} />
          </div>
          {inheritance.taxableEstate === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8 }}>
              ※ 課税価格が基礎控除以下のため、相続税はかかりません (申告も原則不要)。
            </div>
          )}
        </div>

        {/* (b) 贈与税 */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            (b) 贈与税
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
            その年に贈与を受けた財産に課されます。<strong>暦年課税</strong> (基礎控除110万円 + 速算表) と
            <strong>相続時精算課税</strong> (年110万円基礎控除 + 累計2,500万円の特別控除超過分に一律20%) を選べます。
            ※ 各種非課税特例 (住宅取得等資金・教育資金一括贈与・配偶者控除等) は未対応の概算です。
            相続時精算課税は選択要件 (贈与者60歳以上・受贈者18歳以上の推定相続人/孫・届出) を満たす前提の簡略モデルです。
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              贈与額 (年・円)
              <input type="text" inputMode="decimal" value={giftAmountStr} onChange={(e) => setGiftAmountStr(e.target.value)} style={{ ...inputStyle, width: 160 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              課税方式
              <select value={giftMethod} onChange={(e) => setGiftMethod(e.target.value as 'annual' | 'settlement')} style={{ ...inputStyle, width: 200 }}>
                <option value="annual">暦年課税</option>
                <option value="settlement">相続時精算課税</option>
              </select>
            </label>
            {giftMethod === 'annual' ? (
              <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                贈与財産の種別
                <select value={giftType} onChange={(e) => setGiftType(e.target.value as GiftType)} style={{ ...inputStyle, width: 320 }}>
                  <option value="general">{GIFT_TYPE_LABEL.general}</option>
                  <option value="special">{GIFT_TYPE_LABEL.special}</option>
                </select>
              </label>
            ) : (
              <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                過去の累計 (基礎控除後・円)
                <input type="text" inputMode="decimal" value={giftPriorStr} onChange={(e) => setGiftPriorStr(e.target.value)} style={{ ...inputStyle, width: 180 }} />
              </label>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <Stat label="基礎控除後の課税価格" value={jpy(gift.taxableAmount)} />
            <Stat label="贈与税額" value={jpy(gift.tax)} />
          </div>
        </div>

        {/* (c) 自動車税 */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            (c) 自動車税 (自家用乗用車)
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
            総排気量に応じた<strong>種別割</strong>の年税額 (令和元年10月以降の新規登録の本則税率表) と、
            取得価額 × 燃費達成度区分の税率による<strong>環境性能割</strong>を概算します。
            ※ グリーン化特例 (経年重課・新車の軽課)・自治体差・年度途中登録の月割は未反映の概算です (都道府県税事務所に確認してください)。
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              総排気量 (cc)
              <input type="text" inputMode="decimal" value={autoCcStr} onChange={(e) => setAutoCcStr(e.target.value)} style={{ ...inputStyle, width: 120 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              取得価額 (環境性能割・円)
              <input type="text" inputMode="decimal" value={autoPriceStr} onChange={(e) => setAutoPriceStr(e.target.value)} style={{ ...inputStyle, width: 170 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              燃費達成度区分 (環境性能割)
              <select value={autoEnvCategory} onChange={(e) => setAutoEnvCategory(e.target.value as EnvironmentalPerformanceCategory)} style={{ ...inputStyle, width: 280 }}>
                <option value="electric">{ENV_CATEGORY_LABEL.electric}</option>
                <option value="gas2030_85">{ENV_CATEGORY_LABEL.gas2030_85}</option>
                <option value="gas2030_75">{ENV_CATEGORY_LABEL.gas2030_75}</option>
                <option value="gas2030_60">{ENV_CATEGORY_LABEL.gas2030_60}</option>
                <option value="other">{ENV_CATEGORY_LABEL.other}</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Stat label="種別割 (年額)" value={jpy(automobile.typeTax)} />
            <Stat label="環境性能割 税率" value={`${(automobile.envRate * 100).toFixed(1)}%`} />
            <Stat label="環境性能割 税額" value={jpy(automobile.envLevy)} />
          </div>
        </div>

        {/* (d) 事業所税 */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            (d) 事業所税
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
            政令指定都市・東京都23区など<strong>課税対象の自治体 (指定都市等) でのみ</strong>課されます。
            <strong>資産割</strong> (事業所床面積 × 600円/㎡) と<strong>従業者割</strong> (従業者給与総額 × 0.25%) を概算します。
            免税点 (資産割: 床面積1,000㎡以下 / 従業者割: 従業者数100人以下) <strong>以下なら非課税</strong>です。
            ※ 課税対象自治体か否かの判定・課税標準の特例 (共用部分の按分・非課税用途部分の控除等) は未反映の概算です (市区町村に確認してください)。
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              事業所床面積 (㎡)
              <input type="text" inputMode="decimal" value={boAreaStr} onChange={(e) => setBoAreaStr(e.target.value)} style={{ ...inputStyle, width: 140 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              従業者数 (人)
              <input type="text" inputMode="decimal" value={boEmployeesStr} onChange={(e) => setBoEmployeesStr(e.target.value)} style={{ ...inputStyle, width: 120 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              従業者給与総額 (年・円)
              <input type="text" inputMode="decimal" value={boSalaryStr} onChange={(e) => setBoSalaryStr(e.target.value)} style={{ ...inputStyle, width: 180 }} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Stat label="資産割 (600円/㎡)" value={jpy(businessOffice.assetTax)} />
            <Stat label="従業者割 (0.25%)" value={jpy(businessOffice.employeeTax)} />
            <Stat label="事業所税 合計" value={jpy(businessOffice.total)} positive />
          </div>
          {(businessOffice.assetExempt || businessOffice.employeeExempt) && (
            <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
              ※ {businessOffice.assetExempt && '資産割は床面積1,000㎡以下のため免税点未満で非課税。'}
              {businessOffice.employeeExempt && '従業者割は従業者数100人以下のため免税点未満で非課税。'}
            </div>
          )}
        </div>
      </Section>

      <Section title="節税制度の案内 (一般情報)" count={tips.length}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.9 }}>
          {tips.map((t) => (
            <li key={t.id}>
              <strong>{t.title}</strong> — <span style={{ color: 'var(--text-mute)' }}>{t.note}</span>
            </li>
          ))}
        </ul>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8 }}>
          ※ 一般的な制度の案内であり、適用可否・効果は個人の状況により異なります。具体的な節税は税理士にご相談ください。
        </div>
      </Section>

      <Section title="節税制度カタログ (事業形態別・一般情報)" count={schemes.length}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(['sole-proprietor', 'corporation'] as const).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEntity(e)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: entity === e ? 'var(--accent)' : 'var(--bg-elev)',
                color: entity === e ? '#fff' : 'var(--text)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {e === 'corporation' ? '法人' : '個人事業主'}
            </button>
          ))}
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>制度</th>
              <th style={thStyle}>概要</th>
              <th style={thStyle}>専門家相談</th>
            </tr>
          </thead>
          <tbody>
            {schemes.map((s) => (
              <tr key={s.id}>
                <td style={tdStyle}>{s.name}</td>
                <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.5 }}>{s.summary}</td>
                <td style={tdStyle}>
                  {s.needsAdvisor ? (
                    <span style={{ color: '#fbbf24', fontWeight: 600 }}>⚠️ 必須</span>
                  ) : (
                    <span style={{ color: 'var(--text-mute)' }}>推奨</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ いずれも<strong>一般的な制度の案内</strong>であり、個別の節税提案ではありません。
          「⚠️ 必須」の制度 (親族間取引・マイクロ法人併用・役員社宅など) は適用判断・税務リスクが大きく、
          租税回避と判断されると追徴課税の恐れがあります。<strong>実行前に必ず税理士へご相談ください。</strong>
        </div>
      </Section>

      <Section title="税務コンプライアンス・チェックリスト" count={checklist.items.length}>
        <div
          role="note"
          style={{
            margin: '0 0 12px',
            padding: 10,
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid #ef4444',
            borderRadius: 6,
            fontSize: 11,
            color: '#fca5a5',
            lineHeight: 1.6,
          }}
        >
          🚫 これは<strong>「否認されないことの保証」ではありません。</strong>
          国税は事実関係を総合判断するため、否認回避を保証できる仕組みは存在しません。
          以下は否認リスクを下げるために<strong>一般に必要とされると言われる確認項目</strong>の
          教育的チェックリストです。判断と実行は<strong>必ず税理士へ</strong>。
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {COMPLIANCE_TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(t)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: topic === t ? 'var(--accent)' : 'var(--bg-elev)',
                color: topic === t ? '#fff' : 'var(--text)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {TOPIC_LABEL[t]}
            </button>
          ))}
        </div>

        <div
          style={{
            padding: 10,
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid #fbbf24',
            borderRadius: 6,
            fontSize: 11,
            color: '#fbbf24',
            lineHeight: 1.6,
            marginBottom: 12,
          }}
        >
          ⚠️ {checklist.caution}
        </div>

        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>確認項目 (一般論)</th>
              <th style={thStyle}>なぜ必要か (否認されやすい論点)</th>
              <th style={thStyle}>公式情報</th>
            </tr>
          </thead>
          <tbody>
            {checklist.items.map((it) => (
              <tr key={it.id}>
                <td style={tdStyle}>{it.requirement}</td>
                <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.5 }}>{it.why}</td>
                <td style={tdStyle}>
                  {it.officialUrl ? (
                    <button
                      type="button"
                      onClick={() => openTool(it.officialUrl!)}
                      style={{
                        padding: '2px 8px',
                        background: 'var(--bg-elev)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        color: 'var(--text)',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      🔗 開く
                    </button>
                  ) : (
                    <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ チェックを満たしても否認されないとは限りません。事実関係・契約・価格の妥当性は
          個別判断であり、<strong>税理士の関与なしに安全と断定できるものではありません。</strong>
        </div>
      </Section>

      <Section title="公式ツールで申告・納付する" count={OFFICIAL_TOOLS.length}>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 8 }}>
          申告・納税は下記の公式サイトで行ってください (本アプリは外部ブラウザで開くだけです)。
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {OFFICIAL_TOOLS.map((t) => (
            <button
              key={t.url}
              type="button"
              onClick={() => openTool(t.url)}
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                background: 'var(--bg-elev)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              🔗 {t.label}
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>{t.note}</span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

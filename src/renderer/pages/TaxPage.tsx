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
} from '../../shared/taxDeductions';
import {
  calcAllTaxCredits,
  applyTaxCreditsWithSurtax,
  resolveMortgageParams,
  type HousingPerformance,
  type DividendKind,
} from '../../shared/taxCredits';
import { calcRetirementTax } from '../../shared/taxRetirement';

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
  const consumptionTax = useMemo(
    () => calcConsumptionTax(netAmount, reduced ? CONSUMPTION_TAX_REDUCED : CONSUMPTION_TAX_STANDARD),
    [netAmount, reduced],
  );
  const tips = useMemo(() => suggestTaxTips(taxableIncome), [taxableIncome]);

  // --- ③ 全控除込みの精密試算 ---
  const [dGrossStr, setDGrossStr] = useState('6000000');
  const [dSocialStr, setDSocialStr] = useState('900000');
  const [dIdecoStr, setDIdecoStr] = useState('0');
  const [dLifeStr, setDLifeStr] = useState('0');
  const [dLifeOldStr, setDLifeOldStr] = useState('0');
  const [dQuakeStr, setDQuakeStr] = useState('0');
  const [dMedicalStr, setDMedicalStr] = useState('0');
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

  const num = (s: string): number => {
    const p = parseAmountInput(s);
    return p.ok && p.value !== undefined && p.value > 0 ? p.value : 0;
  };

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
      smallBizMutualAid: num(dIdecoStr),
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
    const credits = calcAllTaxCredits({
      mortgage: mortgageBalance > 0
        ? {
            yearEndBalance: mortgageBalance,
            rate: mortgageParams.rate,
            balanceCap: mortgageParams.balanceCap,
            incomeTaxBeforeCredit: result.baseIncomeTax,
            taxableIncomeForResident: result.taxableIncomeForResidentTax,
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
  }, [dGrossStr, dSocialStr, dIdecoStr, dLifeStr, dLifeOldStr, dQuakeStr, dMedicalStr, dDonationStr, hasSpouse, spouseIncomeStr, generalDeps, specificDeps, singleParent, mortgageBalanceStr, mortgageYear, mortgagePerf, dividendStr, dividendKind]);

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
        </div>
      </Section>

      <Section title="② 額面年収から手取りを試算" count={3}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-mute)' }}>額面年収 (円)</label>
          <input
            type="text"
            inputMode="decimal"
            value={grossStr}
            onChange={(e) => setGrossStr(e.target.value)}
            placeholder="例: 6,000,000"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="所得税" value={jpy(netSalary.incomeTax)} />
          <Stat label="住民税" value={jpy(netSalary.residentTax)} />
          <Stat label="手取り (年)" value={jpy(netSalary.takeHome)} positive />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 給与所得控除・基礎控除・所得税速算表・住民税は<strong>正式テーブル</strong>で計算。社会保険料のみ額面比例の概算 (約15%)。
          配偶者・扶養・生命保険料等の控除は含まないため、扶養がある場合は実際より高めに出ます。<br />
          内訳: 給与所得 {jpy(netSalary.employmentIncome)} / 社保 {jpy(netSalary.socialInsurance)} /
          課税所得 {jpy(netSalary.taxableIncome)} / 所得税 {jpy(netSalary.incomeTax)} / 住民税 {jpy(netSalary.residentTax)}。
        </div>
      </Section>

      <Section title="③ 全控除込みの精密試算" count={3}>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.6 }}>
          主要な所得控除 (基礎・社会保険料・小規模企業共済/iDeCo・配偶者・扶養・生命保険料・地震保険料・医療費・寄附金/ふるさと納税・ひとり親) を反映した精密試算です。
          給与所得控除・各控除・税率は<strong>正式テーブル</strong>。確定申告は必ず公式ツール / 税理士でご確認ください。
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
          {([
            ['額面年収 (円)', dGrossStr, setDGrossStr],
            ['支払社会保険料 (実額/年)', dSocialStr, setDSocialStr],
            ['小規模企業共済+iDeCo (年)', dIdecoStr, setDIdecoStr],
            ['一般生命保険料・新制度 (年)', dLifeStr, setDLifeStr],
            ['一般生命保険料・旧制度 (年)', dLifeOldStr, setDLifeOldStr],
            ['地震保険料 (年)', dQuakeStr, setDQuakeStr],
            ['医療費 (年・自己負担)', dMedicalStr, setDMedicalStr],
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
          地震保険 {jpy(precise.ded.earthquakeInsurance.incomeTax)} / 医療費 {jpy(precise.ded.medical.incomeTax)} /
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

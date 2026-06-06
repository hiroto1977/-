import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { ServiceActionPanel } from '../components/ServiceActionPanel';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import { jpy } from '../../shared/formatters';
import {
  calcRealEstateYield,
  calcRealEstateLeverage,
  calcNoiYield,
  calcDscr,
  calcBreakEvenOccupancyPct,
  calcNpv,
  calcIrr,
} from '../../shared/realEstateMetrics';
import { straightLineAnnual, straightLineSchedule } from '../../shared/depreciation';

const reInputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: 13,
  width: 140,
};
const reNum = (s: string): number => {
  const n = Number(s.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const jpyM = (n: number) => `¥${(n / 1_000_000).toFixed(1)}M`;

export function RealEstatePage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'real-estate',
    SNAPSHOT.realEstate,
  );
  const { properties, monthlyCashflow, portfolioYield, occupancyRate } = data;

  // レバレッジ試算 (CCR・イールドギャップ) — 入力はローカル。
  const [reRentStr, setReRentStr] = useState('168000');
  const [rePriceStr, setRePriceStr] = useState('42000000');
  const [reExpenseStr, setReExpenseStr] = useState('600000');
  const [reEquityStr, setReEquityStr] = useState('10000000');
  const [reDebtStr, setReDebtStr] = useState('1500000');
  const [reLoanRateStr, setReLoanRateStr] = useState('2.0');
  const leverage = useMemo(() => {
    const y = calcRealEstateYield(reNum(reRentStr), reNum(rePriceStr), 1, reNum(reExpenseStr));
    const lev = calcRealEstateLeverage(y.annualNetIncome, reNum(reEquityStr), reNum(reDebtStr), y.netYieldPct, reNum(reLoanRateStr));
    return { y, lev };
  }, [reRentStr, rePriceStr, reExpenseStr, reEquityStr, reDebtStr, reLoanRateStr]);

  // 精緻化指標 (NOI 利回り・DSCR・損益分岐入居率) — レバレッジ試算の入力を再利用。
  const [reOccStr, setReOccStr] = useState('95'); // 想定入居率 (%)
  const refined = useMemo(() => {
    const annualGrossRent = reNum(reRentStr) * 12;
    const occ = Math.min(1, Math.max(0, reNum(reOccStr) / 100));
    const opex = reNum(reExpenseStr);
    const debt = reNum(reDebtStr);
    const noiY = calcNoiYield(annualGrossRent, occ, opex, reNum(rePriceStr));
    const dscr = calcDscr(noiY.noi, debt);
    const ber = calcBreakEvenOccupancyPct(opex, debt, annualGrossRent);
    return { noiY, dscr, ber };
  }, [reRentStr, reOccStr, reExpenseStr, reDebtStr, rePriceStr]);

  // NPV / IRR — 自己資金を初期投資 (マイナス) とし、各年の税引前CF、最終年に売却ネット手取りを加算。
  const [npvDiscountStr, setNpvDiscountStr] = useState('4.0'); // 割引率 (%)
  const [npvYearsStr, setNpvYearsStr] = useState('10'); // 保有年数
  const [npvSaleStr, setNpvSaleStr] = useState('35000000'); // 売却ネット手取り
  const dcf = useMemo(() => {
    const years = Math.max(1, Math.min(50, Math.round(reNum(npvYearsStr))));
    const annualCf = leverage.lev.annualCashflow; // 返済後の年間CF (概算)
    const sale = reNum(npvSaleStr);
    const equity = reNum(reEquityStr);
    const flows: number[] = [-equity];
    for (let t = 1; t <= years; t += 1) {
      flows.push(t === years ? annualCf + sale : annualCf);
    }
    const npv = calcNpv(flows, reNum(npvDiscountStr) / 100);
    const irr = calcIrr(flows);
    return { years, npv, irr };
  }, [npvYearsStr, npvSaleStr, reEquityStr, npvDiscountStr, leverage.lev.annualCashflow]);

  // 建物の減価償却 (定額法) — 取得後の建物は定額法。RC造の法定耐用年数は 47 年。
  const [bldgCostStr, setBldgCostStr] = useState('25000000');
  const [bldgLifeStr, setBldgLifeStr] = useState('47');
  const depreciation = useMemo(() => {
    const cost = reNum(bldgCostStr);
    const life = Math.round(reNum(bldgLifeStr));
    return { annual: straightLineAnnual(cost, life), schedule: straightLineSchedule(cost, life) };
  }, [bldgCostStr, bldgLifeStr]);

  return (
    <div>
      <StatusBar
        serviceId="real-estate"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>不動産投資 · {properties.length} 物件 / 月次 CF {jpy(monthlyCashflow.netCashflow)}</>}
      />

      <Section title="ポートフォリオ KPI" count={4}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <Stat label="月次キャッシュフロー" value={jpy(monthlyCashflow.netCashflow)} />
          <Stat label="ポートフォリオ利回り" value={`${portfolioYield.toFixed(1)}%`} />
          <Stat label="入居率" value={`${(occupancyRate * 100).toFixed(0)}%`} />
          <Stat label="月次家賃収入 (実績)" value={jpy(monthlyCashflow.grossRent)} />
        </div>
      </Section>

      <Section title="保有物件" count={properties.length}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>物件名</th>
              <th style={thStyle}>種別</th>
              <th style={thNum}>家賃 (月)</th>
              <th style={thNum}>取得価格</th>
              <th style={thNum}>表面利回り</th>
              <th style={thNum}>実質利回り (入居反映)</th>
              <th style={thStyle}>入居</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => {
              const y = calcRealEstateYield(p.monthlyRent, p.purchasePrice, p.occupied ? 1 : 0);
              return (
              <tr key={p.id}>
                <td style={tdStyle}>{p.name}</td>
                <td style={tdStyle}>{p.type}</td>
                <td style={tdNum}>{jpy(p.monthlyRent)}</td>
                <td style={tdNum}>{jpyM(p.purchasePrice)}</td>
                <td style={tdNum}>{y.grossYieldPct.toFixed(1)}%</td>
                <td style={tdNum}>{y.netYieldPct.toFixed(1)}%</td>
                <td style={tdStyle}>
                  <span style={{ color: p.occupied ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                    {p.occupied ? '● 入居中' : '○ 空室'}
                  </span>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <ServiceActionPanel serviceId="real-estate" serviceLabel="不動産投資" />

      <Section title="月次キャッシュフロー内訳" count={4}>
        <table style={tableStyle}>
          <tbody>
            <tr><td style={tdStyle}>家賃収入 (実績、空室除外)</td><td style={tdNum}>{jpy(monthlyCashflow.grossRent)}</td></tr>
            <tr><td style={tdStyle}>運営費用</td><td style={tdNum}>−{jpy(monthlyCashflow.operatingExpenses)}</td></tr>
            <tr><td style={tdStyle}>ローン返済</td><td style={tdNum}>−{jpy(monthlyCashflow.mortgagePayment)}</td></tr>
            <tr style={{ background: 'var(--bg-elev)' }}>
              <td style={{ ...tdStyle, fontWeight: 700 }}>純キャッシュフロー</td>
              <td style={{ ...tdNum, fontWeight: 700, color: '#22c55e' }}>{jpy(monthlyCashflow.netCashflow)}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="レバレッジ試算 (CCR・イールドギャップ)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          自己資金回収率 (CCR) と イールドギャップ (実質利回り − ローン金利) の目安です。
          イールドギャップがプラスなら借入が収益にプラスに働きます (正レバレッジ)。
          <strong>※ 概算であり投資助言ではありません。</strong>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
          {([
            ['月額賃料', reRentStr, setReRentStr],
            ['物件価格', rePriceStr, setRePriceStr],
            ['年間経費', reExpenseStr, setReExpenseStr],
            ['自己資金', reEquityStr, setReEquityStr],
            ['年間返済額', reDebtStr, setReDebtStr],
            ['ローン金利(%)', reLoanRateStr, setReLoanRateStr],
          ] as const).map(([label, val, setter]) => (
            <label key={label} style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {label}
              <input type="text" inputMode="decimal" value={val} onChange={(e) => setter(e.target.value)} style={reInputStyle} />
            </label>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Stat label="実質利回り" value={`${leverage.y.netYieldPct}%`} />
          <Stat label="返済後CF (年)" value={jpy(leverage.lev.annualCashflow)} positive={leverage.lev.annualCashflow >= 0} />
          <Stat label="CCR (自己資金回収率)" value={`${leverage.lev.cashOnCashReturnPct}%`} />
          <Stat label="イールドギャップ" value={`${leverage.lev.yieldGapPct}%`} positive={leverage.lev.yieldGapPct >= 0} />
        </div>
      </Section>

      <Section title="精緻化指標 (NOI 利回り・DSCR・損益分岐入居率)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          上の試算入力に想定入居率を加え、空室損を控除した NOI ベースで評価します。
          DSCR は NOI ÷ 年間返済額で、<strong>1.0 未満は危険水域</strong>、1.2 以上が目安。
          損益分岐入居率を実際の入居率が下回ると赤字に転じます。
          <strong>※ 概算であり投資助言ではありません。</strong>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            想定入居率(%)
            <input type="text" inputMode="decimal" value={reOccStr} onChange={(e) => setReOccStr(e.target.value)} style={reInputStyle} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Stat label="NOI (年)" value={jpy(refined.noiY.noi)} positive={refined.noiY.noi >= 0} />
          <Stat label="NOI 利回り" value={refined.noiY.noiYieldPct === null ? '—' : `${refined.noiY.noiYieldPct}%`} />
          <Stat
            label="DSCR"
            value={refined.dscr.dscr === null ? '—' : refined.dscr.dscr.toFixed(2)}
            positive={refined.dscr.band === 'healthy'}
          />
          <Stat label="損益分岐入居率" value={refined.ber === null ? '—' : `${refined.ber}%`} />
        </div>
      </Section>

      <Section title="NPV / IRR (割引キャッシュフロー試算)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          自己資金を初期投資 (マイナス)、各年の返済後CF、最終年に売却ネット手取りを加えた
          キャッシュフロー列から NPV (割引率指定) と IRR (二分法で概算) を求めます。
          IRR は NPV がゼロになる割引率の目安です。
          <strong>※ 概算であり投資助言ではありません。</strong>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
          {([
            ['割引率(%)', npvDiscountStr, setNpvDiscountStr],
            ['保有年数', npvYearsStr, setNpvYearsStr],
            ['売却ネット手取り', npvSaleStr, setNpvSaleStr],
          ] as const).map(([label, val, setter]) => (
            <label key={label} style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {label}
              <input type="text" inputMode="decimal" value={val} onChange={(e) => setter(e.target.value)} style={reInputStyle} />
            </label>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label={`NPV (${dcf.years}年・割引後)`} value={dcf.npv === null ? '—' : jpy(dcf.npv)} positive={(dcf.npv ?? 0) >= 0} />
          <Stat label="IRR (年率概算)" value={dcf.irr === null ? '—' : `${(dcf.irr * 100).toFixed(2)}%`} positive={(dcf.irr ?? 0) >= 0} />
          <Stat label="返済後CF (年・前提)" value={jpy(leverage.lev.annualCashflow)} positive={leverage.lev.annualCashflow >= 0} />
        </div>
      </Section>

      <Section title="建物の減価償却 (定額法・概算)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          建物 (1998年4月以降取得) は定額法。法定耐用年数は構造で異なります (RC造 47年 / 重量鉄骨 34年 / 木造 22年)。
          減価償却費は会計上の費用で節税に寄与しますが、<strong>※ 概算であり税務助言ではありません。</strong>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            建物取得価額
            <input type="text" inputMode="decimal" value={bldgCostStr} onChange={(e) => setBldgCostStr(e.target.value)} style={reInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            耐用年数
            <input type="text" inputMode="decimal" value={bldgLifeStr} onChange={(e) => setBldgLifeStr(e.target.value)} style={reInputStyle} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Stat label="年間減価償却費 (定額法)" value={jpy(depreciation.annual)} />
          <Stat label="償却年数" value={`${depreciation.schedule.length} 年`} />
        </div>
      </Section>
    </div>
  );
}


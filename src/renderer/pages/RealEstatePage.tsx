import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { ServiceActionPanel } from '../components/ServiceActionPanel';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import { jpy } from '../../shared/formatters';
import { calcRealEstateYield } from '../../shared/realEstateMetrics';

const jpyM = (n: number) => `¥${(n / 1_000_000).toFixed(1)}M`;

export function RealEstatePage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'real-estate',
    SNAPSHOT.realEstate,
  );
  const { properties, monthlyCashflow, portfolioYield, occupancyRate } = data;

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
    </div>
  );
}


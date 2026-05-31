import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { ServiceActionPanel } from '../components/ServiceActionPanel';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import { jpy } from '../../shared/formatters';
import { calcCompoundingFutureValue } from '../../shared/mutualFundsMetrics';
import { requiredMonthlyContribution, yearsToDouble, emergencyFund } from '../../shared/savingsPlanning';

const simInputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: 13,
  width: 110,
};

export function MutualFundsPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'mutual-funds',
    SNAPSHOT.mutualFunds,
  );
  const { holdings, portfolio, recentDividends } = data;

  const [simMonthly, setSimMonthly] = useState('30000');
  const [simRate, setSimRate] = useState('5');
  const [simYears, setSimYears] = useState('20');
  const sim = useMemo(
    () => calcCompoundingFutureValue(Number(simMonthly) || 0, Number(simRate) || 0, Number(simYears) || 0),
    [simMonthly, simRate, simYears],
  );

  // 貯蓄計画: 目標達成積立額・72の法則・緊急予備資金。
  const [goalTarget, setGoalTarget] = useState('10000000');
  const [goalRate, setGoalRate] = useState('3');
  const [goalYears, setGoalYears] = useState('10');
  const [monthlyExpense, setMonthlyExpense] = useState('300000');
  const requiredMonthly = useMemo(
    () => requiredMonthlyContribution(Number(goalTarget) || 0, Number(goalRate) || 0, Number(goalYears) || 0),
    [goalTarget, goalRate, goalYears],
  );
  const doubleYears = useMemo(() => yearsToDouble(Number(goalRate) || 0), [goalRate]);
  const emergency = useMemo(() => emergencyFund(Number(monthlyExpense) || 0, 6), [monthlyExpense]);

  return (
    <div>
      <StatusBar
        serviceId="mutual-funds"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>投資信託 · {holdings.length} 銘柄 / 評価額 {jpy(portfolio.totalValuation)}</>}
      />

      <Section title="ポートフォリオ" count={4}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <Stat label="評価額" value={jpy(portfolio.totalValuation)} />
          <Stat label="取得原価" value={jpy(portfolio.totalCostBasis)} />
          <Stat label="評価損益" value={jpy(portfolio.unrealizedGain)} positive={portfolio.unrealizedGain >= 0} />
          <Stat label="評価損益率" value={`${portfolio.unrealizedGainPct.toFixed(1)}%`} positive={portfolio.unrealizedGainPct >= 0} />
        </div>
      </Section>

      <Section title="保有銘柄" count={holdings.length}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>銘柄コード</th>
              <th style={thStyle}>ファンド名</th>
              <th style={thNum}>口数</th>
              <th style={thNum}>基準価額</th>
              <th style={thNum}>評価額</th>
              <th style={thNum}>YTD</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.code}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{h.code}</td>
                <td style={tdStyle}>
                  {h.name}
                  {h.userTag && (
                    <span style={{ marginLeft: 6, padding: '1px 6px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', borderRadius: 3, fontSize: 10 }}>
                      {h.userTag}
                    </span>
                  )}
                </td>
                <td style={tdNum}>{h.units.toLocaleString()}</td>
                <td style={tdNum}>{jpy(h.navPerUnit)}</td>
                <td style={tdNum}>{jpy(h.valuation)}</td>
                <td style={{ ...tdNum, color: h.ytdReturnPct >= 0 ? '#22c55e' : '#ef4444' }}>
                  {h.ytdReturnPct >= 0 ? '+' : ''}{h.ytdReturnPct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <ServiceActionPanel serviceId="mutual-funds" serviceLabel="投資信託" />

      <Section title="直近の分配金" count={recentDividends.length}>
        {recentDividends.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>分配金履歴はまだありません</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>銘柄コード</th>
                <th style={thStyle}>支払日</th>
                <th style={thNum}>金額</th>
              </tr>
            </thead>
            <tbody>
              {recentDividends.map((d, i) => (
                <tr key={`${d.code}-${i}`}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{d.code}</td>
                  <td style={tdStyle}>{d.paidAt}</td>
                  <td style={tdNum}>{jpy(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="積立シミュレーション (複利・概算)">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            月額積立 (円)
            <input type="text" inputMode="decimal" value={simMonthly} onChange={(e) => setSimMonthly(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            想定年率 (%)
            <input type="text" inputMode="decimal" value={simRate} onChange={(e) => setSimRate(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            積立年数
            <input type="text" inputMode="decimal" value={simYears} onChange={(e) => setSimYears(e.target.value)} style={simInputStyle} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="将来評価額" value={jpy(sim.futureValue)} positive />
          <Stat label="累計拠出額" value={jpy(sim.totalContributed)} />
          <Stat label={`運用益 (${sim.gainPct.toFixed(1)}%)`} value={jpy(sim.totalGain)} positive={sim.totalGain >= 0} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 毎月末積立・年率一定を仮定した複利の概算です。実際の運用成績は変動し元本割れの可能性があります。投資助言ではありません。
        </div>
      </Section>

      <Section title="貯蓄計画 (目標達成・緊急予備資金・概算)">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            目標額 (円)
            <input type="text" inputMode="decimal" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            想定年率 (%)
            <input type="text" inputMode="decimal" value={goalRate} onChange={(e) => setGoalRate(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            達成年数
            <input type="text" inputMode="decimal" value={goalYears} onChange={(e) => setGoalYears(e.target.value)} style={simInputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            毎月の生活費 (円)
            <input type="text" inputMode="decimal" value={monthlyExpense} onChange={(e) => setMonthlyExpense(e.target.value)} style={simInputStyle} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Stat label="目標達成に必要な毎月積立額" value={jpy(requiredMonthly)} />
          <Stat label="72の法則 (資産倍増)" value={doubleYears === null ? '—' : `約 ${doubleYears} 年`} />
          <Stat label="緊急予備資金 (生活費6か月)" value={jpy(emergency)} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          ※ 毎月末積立・年率一定を仮定した概算です。緊急予備資金は生活費の6か月分（会社員3〜6・自営6〜12か月が目安）。投資助言ではありません。
        </div>
      </Section>
    </div>
  );
}


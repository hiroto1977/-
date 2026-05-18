import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';

const jpy = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

export function MutualFundsPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'mutual-funds',
    SNAPSHOT.mutualFunds,
  );
  const { holdings, portfolio, recentDividends } = data;

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
    </div>
  );
}


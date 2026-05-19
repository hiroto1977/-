import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';

const jpy = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

const STATUS_COLOR: Record<string, string> = {
  受付済み: '#94a3b8',
  調理中: '#fbbf24',
  配達中: '#3b82f6',
  配達完了: '#22c55e',
};

export function DemaeCanPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'demae-can',
    SNAPSHOT.demaeCan,
  );
  const { orders, monthSummary, topAreas } = data;

  return (
    <div>
      <StatusBar
        serviceId="demae-can"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>出前館 · 今月 {monthSummary.orders.toLocaleString()} 件 / {jpy(monthSummary.revenue)}</>}
      />

      <Section title="月次サマリ" count={4}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <Stat label="注文数" value={monthSummary.orders.toLocaleString()} />
          <Stat label="売上" value={jpy(monthSummary.revenue)} />
          <Stat label="客単価" value={jpy(monthSummary.avgOrderValue)} />
          <Stat label="キャンセル率" value={`${(monthSummary.cancellationRate * 100).toFixed(2)}%`} />
        </div>
      </Section>

      <Section title="進行中の注文" count={orders.length}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>注文 ID</th>
              <th style={thStyle}>お客様</th>
              <th style={thNum}>点数</th>
              <th style={thNum}>金額</th>
              <th style={thStyle}>エリア</th>
              <th style={thStyle}>ステータス</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{o.id}</td>
                <td style={tdStyle}>{o.customer}</td>
                <td style={tdNum}>{o.items}</td>
                <td style={tdNum}>{jpy(o.total)}</td>
                <td style={tdStyle}>{o.area}</td>
                <td style={tdStyle}>
                  <span style={{ color: STATUS_COLOR[o.status] ?? 'var(--text)', fontWeight: 600 }}>● {o.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="人気エリア TOP3" count={topAreas.length}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>エリア</th>
              <th style={thNum}>注文数</th>
              <th style={thNum}>売上</th>
            </tr>
          </thead>
          <tbody>
            {topAreas.map((a) => (
              <tr key={a.area}>
                <td style={tdStyle}>{a.area}</td>
                <td style={tdNum}>{a.orders}</td>
                <td style={tdNum}>{jpy(a.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

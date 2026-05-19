import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';

const jpy = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

export function UberEatsPage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'uber-eats',
    SNAPSHOT.uberEats,
  );
  const { stores, topItems, weekRevenue, weekOrders, avgRating } = data;

  return (
    <div>
      <StatusBar
        serviceId="uber-eats"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Uber Eats · 今週 {weekOrders.toLocaleString()} 注文 / {jpy(weekRevenue)}</>}
      />

      <Section title="今週のパフォーマンス" count={3}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          <Stat label="売上 (週)" value={jpy(weekRevenue)} />
          <Stat label="注文数 (週)" value={weekOrders.toLocaleString()} />
          <Stat label="平均評価" value={`★ ${avgRating.toFixed(2)} / 5.0`} />
        </div>
      </Section>

      <Section title={`店舗別売上 (上位 ${stores.length} 店舗)`} count={stores.length}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>店舗</th>
              <th style={thNum}>注文数</th>
              <th style={thNum}>売上</th>
              <th style={thNum}>評価</th>
              <th style={thNum}>稼働率</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id}>
                <td style={tdStyle}>{s.name}</td>
                <td style={tdNum}>{s.orders}</td>
                <td style={tdNum}>{jpy(s.revenue)}</td>
                <td style={tdNum}>★ {s.rating.toFixed(1)}</td>
                <td style={tdNum}>{(s.openRate * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="人気メニュー TOP3" count={topItems.length}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>メニュー</th>
              <th style={thNum}>販売数</th>
              <th style={thNum}>売上</th>
            </tr>
          </thead>
          <tbody>
            {topItems.map((it) => (
              <tr key={it.name}>
                <td style={tdStyle}>{it.name}</td>
                <td style={tdNum}>{it.sold}</td>
                <td style={tdNum}>{jpy(it.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

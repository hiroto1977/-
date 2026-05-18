/**
 * KPI Stat card — single-value tile used in business dashboards.
 *
 * Used by UberEatsPage / DemaeCanPage / RealEstatePage / MutualFundsPage
 * to render the "今週の売上 / 月次キャッシュフロー / 評価損益" grid at
 * the top of each page. Optional `positive` flips the color (green when
 * true, red when false) for gain/loss style values; leave undefined for
 * neutral display.
 */
export function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div style={cardStyle}>
      <div style={labelStyle}>{label}</div>
      <div
        style={{
          ...valueStyle,
          color: positive == null ? undefined : positive ? '#22c55e' : '#ef4444',
        }}
      >
        {value}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: 12,
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 8,
};
const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 };
const valueStyle: React.CSSProperties = { fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' };

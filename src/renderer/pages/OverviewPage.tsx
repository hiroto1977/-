import { useMemo } from 'react';
import { Section } from '../components/StatusBar';
import { useCollection } from '../data/useCollection';
import { SALES_COLLECTION, type SalesEntry } from '../data/sales';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../data/kpiActuals';
import { MEMBERS_COLLECTION, type Member } from '../data/members';
import { usePlan } from '../plan/usePlan';
import { buildBusinessOverview } from '../data/overview';

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('ja-JP');
const safeYen = (n: number) => (Number.isFinite(n) ? yen.format(Math.round(n)) : '∞');

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: 'var(--bg-elev)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '14px 18px',
      flex: 1,
      minWidth: 170,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function OverviewPage() {
  const { plan } = usePlan();
  const { records: salesRecords } = useCollection<SalesEntry>(SALES_COLLECTION);
  const { records: kpiRecords } = useCollection<KpiActual>(KPI_ACTUALS_COLLECTION);
  const { records: memberRecords } = useCollection<Member>(MEMBERS_COLLECTION);

  const overview = useMemo(
    () =>
      buildBusinessOverview({
        plan,
        sales: salesRecords.map((r) => r.data),
        kpiActuals: kpiRecords.map((r) => r.data),
        members: memberRecords.map((r) => ({ role: r.data.role })),
      }),
    [plan, salesRecords, kpiRecords, memberRecords],
  );

  const hasData =
    salesRecords.length > 0 || kpiRecords.length > 0 || memberRecords.length > 0;

  return (
    <div>
      <Section title={`経営サマリー — ${overview.plan.label} プラン（${overview.plan.audience}）`}>
        {!hasData && (
          <p style={{ color: 'var(--text-mute)', fontSize: 13, marginBottom: 12 }}>
            売上集計・KPI 実績・チーム管理にデータを入力すると、ここに経営概況がまとまって表示されます。
          </p>
        )}

        <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>売上</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <Tile label="総売上" value={yen.format(overview.sales.totalAmount)} sub={overview.sales.topChannel ? `主力: ${overview.sales.topChannel}` : undefined} />
          <Tile label="総注文件数" value={num.format(overview.sales.totalOrders)} />
          <Tile label="平均注文単価" value={safeYen(overview.sales.aov)} />
          <Tile label="販売チャネル数" value={`${overview.sales.channelCount}`} />
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>収益性 (KPI)</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {overview.kpi.hasData ? (
            <>
              <Tile
                label="営業利益"
                value={yen.format(overview.kpi.operatingProfit)}
                accent={overview.flags.profitable ? '#22c55e' : '#ef4444'}
                sub={overview.flags.profitable ? '黒字' : '赤字'}
              />
              <Tile label="損益分岐点 (BEP)" value={safeYen(overview.kpi.bep)} />
              <Tile label="安全余裕率" value={`${overview.kpi.safetyMargin.toFixed(1)}%`} sub="高いほど安全" />
            </>
          ) : (
            <Tile label="KPI" value="未入力" sub="KPI 実績を入力すると表示" />
          )}
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>組織</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Tile
            label="メンバー / シート"
            value={`${overview.team.members} / ${overview.team.seatLimit === Infinity ? '∞' : overview.team.seatLimit}`}
            accent={overview.flags.seatsFull ? '#f59e0b' : undefined}
            sub={overview.flags.seatsFull ? 'シート上限に到達' : `残り ${overview.team.seatsRemaining === Infinity ? '無制限' : overview.team.seatsRemaining}`}
          />
        </div>
      </Section>
    </div>
  );
}

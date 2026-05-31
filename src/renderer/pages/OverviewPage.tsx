import { useMemo } from 'react';
import { Section } from '../components/StatusBar';
import { useCollection } from '../data/useCollection';
import { SALES_COLLECTION, type SalesEntry } from '../data/sales';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../data/kpiActuals';
import { MEMBERS_COLLECTION, type Member } from '../data/members';
import { usePlan } from '../plan/usePlan';
import { buildBusinessOverview } from '../data/overview';
import { buildManagementScorecard } from '../../shared/managementScorecard';

const SCORE_COLOR = (s: number | null): string =>
  s === null ? 'var(--text-mute)' : s >= 80 ? '#22c55e' : s >= 60 ? '#3ec98a' : s >= 40 ? '#f59e0b' : '#ef4444';
const VERDICT_LABEL: Record<string, string> = { poor: '要改善', caution: '注意', good: '良好', excellent: '優良' };
const TREND_LABEL: Record<string, string> = { up: '↗ 上昇', down: '↘ 下降', flat: '→ 横ばい', none: '—' };
const TREND_COLOR: Record<string, string | undefined> = { up: '#22c55e', down: '#ef4444', flat: undefined, none: undefined };

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

  // 経営スコアカード — KPI実績から収益性・安全性・成長性を集約 (データがある時のみ意味を持つ)。
  const scorecard = useMemo(() => {
    if (!overview.kpi.hasData) return buildManagementScorecard({});
    const opMargin = overview.kpi.revenue > 0
      ? (overview.kpi.operatingProfit / overview.kpi.revenue) * 100
      : undefined;
    return buildManagementScorecard({
      operatingMarginPct: opMargin,
      contributionRatioPct: overview.kpi.revenue > 0 ? overview.kpi.contributionRatio : undefined,
      safetyMarginPct: overview.kpi.safetyMargin,
      // 成長性: 期 (YYYY-MM) が 2 つ以上揃うと前期比成長率が自動で加点される。
      revenueGrowthPct: overview.kpi.revenueGrowthPct ?? undefined,
    });
  }, [overview]);

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

      {overview.kpi.hasData && (
        <Section title={`経営スコアカード — 総合 ${scorecard.overallScore}/100（${VERDICT_LABEL[scorecard.verdict]}）`}>
          <p style={{ color: 'var(--text-mute)', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
            収益性・安全性・資金繰り・成長性の経営指標を 0〜100 で集約した健全性スコアです。
            <strong>※ 概算の経営診断であり財務助言ではありません。</strong>業種・規模で適正値は異なります。
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {scorecard.categories.map((c) => (
              <div key={c.category} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{c.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: SCORE_COLOR(c.score) }}>
                  {c.score === null ? '—' : `${c.score}`}
                  {c.score !== null && <span style={{ fontSize: 12, color: 'var(--text-mute)' }}> /100</span>}
                </div>
                {c.components.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 4 }}>
                    {c.components.map((x) => x.label).join(' / ')}
                  </div>
                )}
              </div>
            ))}
          </div>
          {scorecard.alerts.length > 0 && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 12, color: '#f59e0b', lineHeight: 1.7 }}>
              {scorecard.alerts.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
          {(overview.kpi.revenueGrowthPct !== null || overview.kpi.revenueCagrPct !== null) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <Tile
                label="前期比成長率"
                value={overview.kpi.revenueGrowthPct === null ? '—' : `${overview.kpi.revenueGrowthPct > 0 ? '+' : ''}${overview.kpi.revenueGrowthPct}%`}
                accent={overview.kpi.revenueGrowthPct === null ? undefined : overview.kpi.revenueGrowthPct >= 0 ? '#22c55e' : '#ef4444'}
                sub="直近期 vs 前期"
              />
              <Tile
                label="平均成長率 (CAGR)"
                value={overview.kpi.revenueCagrPct === null ? '—' : `${overview.kpi.revenueCagrPct > 0 ? '+' : ''}${overview.kpi.revenueCagrPct}%`}
                sub="1 期あたり複利"
              />
              <Tile
                label="トレンド"
                value={TREND_LABEL[overview.kpi.revenueTrend ?? 'none'] ?? '—'}
                accent={TREND_COLOR[overview.kpi.revenueTrend ?? 'none']}
                sub="移動平均の方向"
              />
            </div>
          )}
          <p style={{ color: 'var(--text-mute)', fontSize: 11, marginTop: 10, lineHeight: 1.6 }}>
            成長性は KPI 実績の期 (YYYY-MM) が 2 つ以上揃うと前期比で自動加点されます。CAGR・トレンドは
            期が増えるほど精度が上がります。資金繰り (DSCR・ランウェイ) は会計連携データが揃うと加点されます。
          </p>
        </Section>
      )}
    </div>
  );
}

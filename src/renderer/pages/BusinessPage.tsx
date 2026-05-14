import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

interface CategoryKpi {
  revenue: number;
  variableCost: number;
  fixedCost: number;
  totalCost: number;
  profit: number;
  profitMargin: number;
  traffic: number;
  conversion: number;
  conversionRatePct: number;
  aov: number;
  roas: number;
  contentOutput: number;
}

interface BusinessUnit {
  id: string;
  label: string;
  description: string;
  trafficKind: 'session' | 'view' | 'impression' | 'order' | 'project';
  current: CategoryKpi;
  history: CategoryKpi[];
}

interface BusinessSnapshot {
  units: BusinessUnit[];
  aggregate: {
    revenue: number;
    totalCost: number;
    profit: number;
    profitMargin: number;
    contentOutput: number;
  };
  fetchedAt: string;
  isMock: boolean;
}

const yen = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });
const TRAFFIC_KIND_LABEL: Record<BusinessUnit['trafficKind'], string> = {
  session: 'セッション',
  view: '再生回数',
  impression: 'インプレッション',
  order: '受注',
  project: '案件',
};

// --- Sparkline -------------------------------------------------------

function Sparkline({
  values,
  width = 160,
  height = 36,
  positive,
}: {
  values: number[];
  width?: number;
  height?: number;
  positive?: boolean;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const color = positive === false ? '#ef4444' : '#22c55e';
  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth={1.5} points={pts} />
    </svg>
  );
}

// --- Tile ------------------------------------------------------------

function Tile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '12px 16px',
        flex: 1,
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: accent ?? 'var(--text)' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

// --- Per-category card ----------------------------------------------

function CategoryCard({ unit }: { unit: BusinessUnit }) {
  const c = unit.current;
  const revHistory = unit.history.map((h) => h.revenue);
  const profHistory = unit.history.map((h) => h.profit);
  const trafficHistory = unit.history.map((h) => h.traffic);
  return (
    <div
      style={{
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{unit.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>
            {unit.description}
          </div>
        </div>
        <div
          style={{
            padding: '2px 8px',
            background: c.profit >= 0 ? '#22c55e' : '#ef4444',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 4,
          }}
        >
          {c.profitMargin >= 0 ? '+' : ''}
          {c.profitMargin.toFixed(1)}%
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-mute)' }}>売上</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{yen.format(c.revenue)}</div>
          <Sparkline values={revHistory} width={120} height={28} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-mute)' }}>利益</div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: c.profit >= 0 ? '#22c55e' : '#ef4444',
            }}
          >
            {yen.format(c.profit)}
          </div>
          <Sparkline values={profHistory} width={120} height={28} positive={c.profit >= 0} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-mute)' }}>
            {TRAFFIC_KIND_LABEL[unit.trafficKind]}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{num.format(c.traffic)}</div>
          <Sparkline values={trafficHistory} width={120} height={28} />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: 8,
          fontSize: 11,
          color: 'var(--text-mute)',
          marginTop: 4,
        }}
      >
        <div>
          <span style={{ color: 'var(--text-mute)' }}>CVR:</span>{' '}
          <span style={{ color: 'var(--text)' }}>{c.conversionRatePct.toFixed(2)}%</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-mute)' }}>AOV:</span>{' '}
          <span style={{ color: 'var(--text)' }}>{c.aov > 0 ? yen.format(c.aov) : '—'}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-mute)' }}>ROAS:</span>{' '}
          <span style={{ color: 'var(--text)' }}>{c.roas > 0 ? c.roas.toFixed(2) + 'x' : '—'}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-mute)' }}>出力:</span>{' '}
          <span style={{ color: 'var(--text)' }}>{c.contentOutput}件/月</span>
        </div>
      </div>
    </div>
  );
}

// --- Page -----------------------------------------------------------

export function BusinessPage() {
  const { data, source, status, errorMessage, refresh } = useServiceData<BusinessSnapshot>(
    'business',
    SNAPSHOT.business as unknown as BusinessSnapshot,
  );

  const [sortKey, setSortKey] = useState<'revenue' | 'profit' | 'margin'>('revenue');
  const sortedUnits = useMemo(() => {
    const arr = [...data.units];
    arr.sort((a, b) => {
      const av = sortKey === 'revenue' ? a.current.revenue
        : sortKey === 'profit' ? a.current.profit
        : a.current.profitMargin;
      const bv = sortKey === 'revenue' ? b.current.revenue
        : sortKey === 'profit' ? b.current.profit
        : b.current.profitMargin;
      return bv - av;
    });
    return arr;
  }, [data.units, sortKey]);

  const agg = data.aggregate;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StatusBar
        who="事業ダッシュボード · 模擬データ"
        serviceId="business"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured
        onRefresh={refresh}
      />

      {data.isMock && (
        <div
          style={{
            border: '1px solid #fbbf24',
            background: 'rgba(251, 191, 36, 0.08)',
            color: '#fbbf24',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong>シミュレーション中:</strong> 模擬データを表示しています。Phase 6 で
          freee / 楽天 SP-API / Shopify / GA4 / YouTube Data API / X API などへ接続予定。
          数値はランダム性のあるモック値であり、実事業の指標ではありません。
        </div>
      )}

      <Section title="全社合算" count={data.units.length}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Tile label="月次売上 (8 事業合計)" value={yen.format(agg.revenue)} />
          <Tile label="月次費用" value={yen.format(agg.totalCost)} />
          <Tile
            label="月次利益"
            value={(agg.profit >= 0 ? '+' : '') + yen.format(agg.profit)}
            sub={(agg.profitMargin >= 0 ? '+' : '') + agg.profitMargin.toFixed(1) + '%'}
            accent={agg.profit >= 0 ? '#22c55e' : '#ef4444'}
          />
          <Tile
            label="月次コンテンツ出力"
            value={num.format(agg.contentOutput) + ' 件'}
            sub="記事 / 動画 / 投稿 / 案件 等の合計"
          />
        </div>
      </Section>

      <Section title="事業別カード" count={data.units.length}>
        <div style={{ display: 'flex', gap: 8, fontSize: 12, marginBottom: 12 }}>
          <span style={{ color: 'var(--text-mute)', alignSelf: 'center' }}>並び順:</span>
          {(['revenue', 'profit', 'margin'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              style={{
                padding: '4px 12px',
                background: sortKey === k ? 'var(--accent)' : 'var(--bg-elev)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {k === 'revenue' ? '売上順' : k === 'profit' ? '利益順' : '利益率順'}
            </button>
          ))}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: 12,
          }}
        >
          {sortedUnits.map((u) => (
            <CategoryCard key={u.id} unit={u} />
          ))}
        </div>
      </Section>
    </div>
  );
}

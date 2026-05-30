import { useMemo } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

// 資金調達レーダー — 補助金/助成金/融資/公庫/給付金/クラウドファンディングを
// 会計ソフト・株式投資連携と合わせて 4 種チャート (レーダー/折れ線/円/棒) で
// 可視化する。集計ロジックは src/shared/funding.ts (純粋関数) に集約。

const COLORS = {
  axis: '#2a2f3a',
  grid: '#363b47',
  text: 'var(--text)',
  mute: 'var(--text-mute)',
  funding: '#4f9cf9',
  cashflow: '#3ec98a',
  portfolio: '#f5a623',
  secured: '#4f9cf9',
  pipeline: '#7d8597',
};

// 種別ごとの円グラフ・棒グラフ用の色 (6 種)。
const KIND_COLORS = ['#4f9cf9', '#3ec98a', '#f5a623', '#e0568a', '#9b6cf0', '#46c7d8'];

type FundingSnapshot = typeof SNAPSHOT.funding;

function jpy(n: number): string {
  return `¥${Math.round(n).toLocaleString('ja-JP')}`;
}

// --- Chart 1: レーダーチャート (種別別の確定額・正規化) ----------------

function axisPoint(cx: number, cy: number, r: number, idx: number, count: number, value: number, max: number) {
  const theta = -Math.PI / 2 + (idx / count) * 2 * Math.PI;
  const radius = max > 0 ? (value / max) * r : 0;
  return { x: cx + Math.cos(theta) * radius, y: cy + Math.sin(theta) * radius };
}

function RadarChart({ data }: { data: FundingSnapshot }) {
  const W = 360, H = 320;
  const cx = W / 2, cy = H / 2 + 8, radius = 110;
  const axes = data.byKind;
  const n = axes.length;
  const SCORE_MAX = 5;
  if (n === 0) return null;

  const rings = [1, 2, 3, 4, 5];
  const scorePts = data.radar
    .map((s, i) => {
      const p = axisPoint(cx, cy, radius, i, n, s, SCORE_MAX);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', maxWidth: 420, margin: '0 auto' }}>
      {rings.map((lvl) => {
        const pts = axes.map((_, i) => {
          const p = axisPoint(cx, cy, radius, i, n, lvl, SCORE_MAX);
          return `${p.x},${p.y}`;
        });
        return <polygon key={lvl} points={pts.join(' ')} fill="none" stroke={COLORS.axis} strokeDasharray="3,3" />;
      })}
      {axes.map((a, i) => {
        const outer = axisPoint(cx, cy, radius, i, n, SCORE_MAX, SCORE_MAX);
        const label = axisPoint(cx, cy, radius * 1.18, i, n, SCORE_MAX, SCORE_MAX);
        const anchor = Math.abs(label.x - cx) < 8 ? 'middle' : label.x > cx ? 'start' : 'end';
        return (
          <g key={a.kind}>
            <line x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke={COLORS.axis} />
            <text x={label.x} y={label.y} fontSize="10" fill={COLORS.mute} textAnchor={anchor}>
              {a.label}
            </text>
          </g>
        );
      })}
      <polygon points={scorePts} fill="rgba(79,156,249,0.25)" stroke={COLORS.funding} strokeWidth={2} />
      {data.radar.map((s, i) => {
        const p = axisPoint(cx, cy, radius, i, n, s, SCORE_MAX);
        return <circle key={i} cx={p.x} cy={p.y} r={3} fill={COLORS.funding} />;
      })}
    </svg>
  );
}

// --- Chart 2: 折れ線グラフ (月次: 資金調達 / 営業CF / 株式評価額) -------

function LineChart({ data }: { data: FundingSnapshot }) {
  const W = 720, H = 240, P = 40;
  const rows = data.monthly;
  if (rows.length === 0) return null;
  const maxV = Math.max(1, ...rows.flatMap((r) => [r.funding, r.operatingCashflow, r.portfolioValue]));
  const x = (i: number) => P + (i * (W - P * 2)) / Math.max(1, rows.length - 1);
  const y = (v: number) => H - P - (v / maxV) * (H - P * 2);
  const path = (key: 'funding' | 'operatingCashflow' | 'portfolioValue') =>
    rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(r[key])}`).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <line x1={P} y1={y(0)} x2={W - P} y2={y(0)} stroke={COLORS.axis} />
      <line x1={P} y1={P / 2} x2={P} y2={H - P} stroke={COLORS.axis} />
      <path d={path('funding')} stroke={COLORS.funding} fill="none" strokeWidth="2" />
      {data.accountingLinked && (
        <path d={path('operatingCashflow')} stroke={COLORS.cashflow} fill="none" strokeWidth="2" strokeDasharray="5,3" />
      )}
      {data.stocksLinked && (
        <path d={path('portfolioValue')} stroke={COLORS.portfolio} fill="none" strokeWidth="2" strokeDasharray="2,2" />
      )}
      {rows.map((r, i) => (
        <text key={r.month} x={x(i)} y={H - P + 14} fontSize="9" fill={COLORS.mute} textAnchor="middle">
          {r.month.slice(2)}
        </text>
      ))}
      <g fontSize="11">
        <rect x={W - 168} y={6} width="162" height={18 + (data.accountingLinked ? 16 : 0) + (data.stocksLinked ? 16 : 0)} fill="var(--bg)" stroke={COLORS.axis} />
        <line x1={W - 160} y1={18} x2={W - 148} y2={18} stroke={COLORS.funding} strokeWidth="2" />
        <text x={W - 144} y={22} fill={COLORS.text}>資金調達</text>
        {data.accountingLinked && (
          <>
            <line x1={W - 160} y1={34} x2={W - 148} y2={34} stroke={COLORS.cashflow} strokeWidth="2" strokeDasharray="3,2" />
            <text x={W - 144} y={38} fill={COLORS.text}>営業CF (会計)</text>
          </>
        )}
        {data.stocksLinked && (
          <>
            <line x1={W - 160} y1={data.accountingLinked ? 50 : 34} x2={W - 148} y2={data.accountingLinked ? 50 : 34} stroke={COLORS.portfolio} strokeWidth="2" strokeDasharray="2,2" />
            <text x={W - 144} y={data.accountingLinked ? 54 : 38} fill={COLORS.text}>株式評価額</text>
          </>
        )}
      </g>
    </svg>
  );
}

// --- Chart 3: 円グラフ (種別別の確定額構成比) --------------------------

function PieChart({ data }: { data: FundingSnapshot }) {
  const W = 300, H = 300;
  const cx = W / 2, cy = H / 2, r = 110;
  const slices = data.byKind.filter((b) => b.secured > 0);
  const total = slices.reduce((s, b) => s + b.secured, 0);
  if (total <= 0) {
    return (
      <div style={{ color: COLORS.mute, fontSize: 13, padding: 24, textAlign: 'center' }}>
        確定済みの資金がまだありません。
      </div>
    );
  }
  let angle = -Math.PI / 2;
  const arcs = slices.map((b, i) => {
    const frac = b.secured / total;
    const start = angle;
    const end = angle + frac * 2 * Math.PI;
    angle = end;
    const x1 = cx + Math.cos(start) * r, y1 = cy + Math.sin(start) * r;
    const x2 = cx + Math.cos(end) * r, y2 = cy + Math.sin(end) * r;
    const large = end - start > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return { d, color: KIND_COLORS[i % KIND_COLORS.length], label: b.label, pct: Math.round(frac * 100) };
  });

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', maxWidth: 260 }}>
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.color} stroke="var(--bg)" strokeWidth="1.5" />
        ))}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
        {arcs.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 12, height: 12, background: a.color, borderRadius: 2, display: 'inline-block' }} />
            <span style={{ color: COLORS.text }}>{a.label}</span>
            <span style={{ color: COLORS.mute }}>{a.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Chart 4: 棒グラフ (種別別: 確定額 vs パイプライン) ----------------

function BarChart({ data }: { data: FundingSnapshot }) {
  const W = 720, H = 260, P = 40;
  const bars = data.bars;
  if (bars.length === 0) return null;
  const maxV = Math.max(1, ...bars.map((b) => b.pipeline));
  const groupW = (W - P * 2) / bars.length;
  const barW = groupW * 0.28;
  const y = (v: number) => H - P - (v / maxV) * (H - P * 2);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke={COLORS.axis} />
      {bars.map((b, i) => {
        const gx = P + i * groupW + groupW / 2;
        return (
          <g key={b.label}>
            <rect x={gx - barW - 2} y={y(b.pipeline)} width={barW} height={H - P - y(b.pipeline)} fill={COLORS.pipeline} />
            <rect x={gx + 2} y={y(b.secured)} width={barW} height={H - P - y(b.secured)} fill={COLORS.secured} />
            <text x={gx} y={H - P + 14} fontSize="9" fill={COLORS.mute} textAnchor="middle">
              {b.label}
            </text>
          </g>
        );
      })}
      <g fontSize="11">
        <rect x={W - 150} y={6} width="144" height="38" fill="var(--bg)" stroke={COLORS.axis} />
        <rect x={W - 142} y={14} width="10" height="10" fill={COLORS.secured} />
        <text x={W - 128} y={23} fill={COLORS.text}>確定額</text>
        <rect x={W - 142} y={28} width="10" height="10" fill={COLORS.pipeline} />
        <text x={W - 128} y={37} fill={COLORS.text}>パイプライン (申請中込)</text>
      </g>
    </svg>
  );
}

// --- Page -------------------------------------------------------------

export function FundingPage() {
  const { data, source, status, errorMessage, refresh } = useServiceData('funding', SNAPSHOT.funding);

  const live = data as FundingSnapshot;
  const hasData = live.items.length > 0;

  const statTiles = useMemo(
    () => [
      { label: '確定総額', value: jpy(live.summary.totalSecured) },
      { label: '返済不要 (補助金等)', value: jpy(live.summary.nonRepayableSecured) },
      { label: '返済必要 (融資/公庫)', value: jpy(live.summary.repayableSecured) },
      { label: 'パイプライン総額', value: jpy(live.summary.totalPipeline) },
      { label: '課税対象 (補助金等)', value: jpy(live.summary.taxableSecured) },
      { label: '概算手残り (税引後)', value: jpy(live.summary.afterTaxSecured) },
    ],
    [live],
  );

  return (
    <div>
      <StatusBar
        who="資金調達レーダー"
        serviceId="funding"
        source={source}
        status={status}
        errorMessage={errorMessage}
        onRefresh={refresh}
      />

      <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 16 }}>
        補助金・助成金・融資・日本政策金融公庫・給付金・クラウドファンディングの実績／予定を集計し、
        会計ソフト連携の営業キャッシュフローと任意の株式投資の評価額を合わせて可視化します。
        <strong>※ 本画面は概算の可視化であり、採択可否・審査結果・財務助言を保証するものではありません。</strong>
        金額・要件・締切は各実施機関の公式情報でご確認ください。
      </div>

      <Section title="サマリー">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {statTiles.map((t) => (
            <div key={t.label} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{t.label}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{t.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-mute)' }}>
          会計ソフト連携: {live.accountingLinked ? '✅ 連携中' : '— 未連携'} ／
          株式投資連携: {live.stocksLinked ? '✅ 連携中' : '— 未連携 (任意)'}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.6 }}>
          ※ 補助金・助成金・給付金・購入型クラウドファンディングは原則「益金 (事業収入)」として課税対象、
          融資・公庫は借入金で非課税です。「概算手残り」は課税対象額に実効税率 (既定 約30%) を課した
          目安であり、圧縮記帳の特例・消費税・個別の課税関係は反映していません。正確な金額は税理士へご確認ください。
        </div>
      </Section>

      {!hasData && (
        <Section title="データ">
          <div style={{ color: 'var(--text-mute)', fontSize: 13 }}>
            「更新」を押すと資金調達データ (snapshot) を読み込みます。
          </div>
        </Section>
      )}

      {hasData && (
        <>
          <Section title="① レーダーチャート — 種別別の確定額バランス">
            <RadarChart data={live} />
          </Section>

          <Section title="② 折れ線グラフ — 月次の資金フロー (会計・株式連携)">
            <LineChart data={live} />
          </Section>

          <Section title="③ 円グラフ — 確定資金の種別構成比">
            <PieChart data={live} />
          </Section>

          <Section title="④ 棒グラフ — 種別別 確定額 vs パイプライン">
            <BarChart data={live} />
          </Section>

          <Section title="案件一覧">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {live.items.map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--text)' }}>{it.name}</span>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>{it.month}</span>
                    <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>
                      {it.repayable ? '要返済' : '返済不要'}
                    </span>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{jpy(it.amount)}</span>
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

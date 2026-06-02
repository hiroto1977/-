/**
 * 事業別 財務分析ビュー (Phase 2) — 各事業の概算財務から 15 指標を算出し、
 * レーダー / 折れ線 / 円 / 棒 の 4 種チャート + 指標テーブルで可視化する。
 *
 * データ源: BusinessPage と同じ事業ユニット (月次 KPI + 履歴)。
 * deriveBusinessFinancials → computeFinancialRatios → radarAxes で連動する。
 *
 * **概算であり財務助言ではありません。**
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { deriveBusinessFinancials, type MonthlyBusinessKpi } from '../data/businessFinancials';
import { computeFinancialRatios, radarAxes, type FinancialRatios } from '../data/financialRatios';

export interface FinancialUnit {
  readonly id: string;
  readonly label: string;
  readonly current: MonthlyBusinessKpi;
  readonly history: readonly { readonly revenue: number; readonly profit: number }[];
}

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });
const PALETTE = ['#5b8def', '#ec9a3d', '#5cb85c', '#e36b6b', '#a06bd2', '#43c3b8', '#d2b06b', '#888'];

function fmtRatio(v: number | null, unit: string): string {
  if (v == null) return '—';
  return `${v.toLocaleString('ja-JP')}${unit}`;
}

// --- レーダー (15 軸・0-100 スコア) --------------------------------------
function RadarChart({ axes }: { axes: ReturnType<typeof radarAxes> }) {
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const n = axes.length;
  const point = (i: number, score: number) => {
    const theta = -Math.PI / 2 + (i / n) * 2 * Math.PI;
    const rr = (score / 100) * radius;
    return { x: cx + Math.cos(theta) * rr, y: cy + Math.sin(theta) * rr };
  };
  const poly = axes.map((a, i) => point(i, a.score)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, height: 'auto', display: 'block', margin: '0 auto' }} role="img" aria-label="財務指標レーダー">
      {[20, 40, 60, 80, 100].map((lvl) => (
        <polygon key={lvl} points={axes.map((_, i) => point(i, lvl)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="#2a2f3a" strokeDasharray="2,3" />
      ))}
      {axes.map((a, i) => {
        const outer = point(i, 100);
        const lp = point(i, 118);
        const anchor = Math.abs(lp.x - cx) < 8 ? 'middle' : lp.x > cx ? 'start' : 'end';
        return (
          <g key={a.key}>
            <line x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="#2a2f3a" />
            <text x={lp.x} y={lp.y} fontSize={8.5} fill="#94a3b8" textAnchor={anchor} dominantBaseline="middle">{a.label}</text>
          </g>
        );
      })}
      <polygon points={poly} fill="rgba(91,141,239,0.20)" stroke="#5b8def" strokeWidth={2} />
      {axes.map((a, i) => { const p = point(i, a.score); return <circle key={a.key} cx={p.x} cy={p.y} r={2.5} fill="#5b8def" />; })}
    </svg>
  );
}

// --- 折れ線 (営業利益率の推移) ------------------------------------------
function LineChart({ values }: { values: number[] }) {
  const W = 360, H = 140, P = 28;
  if (values.length < 2) return <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>履歴データが不足しています</div>;
  const min = Math.min(0, ...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const x = (i: number) => P + (i / (values.length - 1)) * (W - P * 2);
  const y = (v: number) => H - P - ((v - min) / range) * (H - P * 2);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, height: 'auto', display: 'block' }} role="img" aria-label="営業利益率の推移">
      <line x1={P} y1={y(0)} x2={W - P} y2={y(0)} stroke="#2a2f3a" strokeDasharray="2,3" />
      <polyline fill="none" stroke="#5cb85c" strokeWidth={2} points={pts} />
      {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill="#5cb85c" />)}
      <text x={P} y={12} fontSize={9} fill="#94a3b8">営業利益率の推移 (%)</text>
    </svg>
  );
}

// --- 円 (売上構成) ------------------------------------------------------
function PieChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const size = 150, cx = size / 2, cy = size / 2, r = size * 0.42;
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  let angle = -Math.PI / 2;
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="売上構成">
        {slices.map((s) => {
          const frac = Math.max(0, s.value) / total;
          const a0 = angle;
          const a1 = angle + frac * 2 * Math.PI;
          angle = a1;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r;
          const x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
          if (frac <= 0) return null;
          return <path key={s.label} d={`M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`} fill={s.color} stroke="var(--bg)" strokeWidth={1} />;
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2, display: 'inline-block' }} />
            {s.label} {((Math.max(0, s.value) / total) * 100).toFixed(1)}%
          </div>
        ))}
      </div>
    </div>
  );
}

// --- 棒 (1指標の事業間比較) --------------------------------------------
function BarChart({ rows, unit }: { rows: { label: string; value: number | null }[]; unit: string }) {
  const vals = rows.map((r) => r.value ?? 0);
  const max = Math.max(1, ...vals.map((v) => Math.abs(v)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map((r, i) => {
        const v = r.value ?? 0;
        const w = (Math.abs(v) / max) * 100;
        return (
          <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 64px', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <span style={{ color: 'var(--text-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
            <div style={{ background: 'var(--bg)', borderRadius: 3, height: 14, position: 'relative' }}>
              <div style={{ width: `${w}%`, height: '100%', background: PALETTE[i % PALETTE.length], borderRadius: 3 }} />
            </div>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtRatio(r.value, unit)}</span>
          </div>
        );
      })}
    </div>
  );
}

// --- 指標テーブル -------------------------------------------------------
const RATIO_ROWS: { key: keyof FinancialRatios; label: string; unit: string; money?: boolean }[] = [
  { key: 'equityRatioPct', label: '自己資本比率', unit: '%' },
  { key: 'currentRatioPct', label: '流動比率', unit: '%' },
  { key: 'fixedLongTermFitPct', label: '固定長期適合率', unit: '%' },
  { key: 'debtToMonthlySalesRatio', label: '借入金月商倍率', unit: 'ヶ月' },
  { key: 'debtRepaymentYears', label: '債務償還年数', unit: '年' },
  { key: 'operatingMarginPct', label: '営業利益率', unit: '%' },
  { key: 'ordinaryMarginPct', label: '経常利益率', unit: '%' },
  { key: 'netMarginPct', label: '当期純利益率', unit: '%' },
  { key: 'netProfit', label: '当期純利益', unit: '', money: true },
  { key: 'laborSharePct', label: '労働分配率', unit: '%' },
  { key: 'ebitda', label: 'EBITDA', unit: '', money: true },
  { key: 'ebitdaMarginPct', label: 'EBITDAマージン', unit: '%' },
  { key: 'receivablesTurnover', label: '売上債権回転率', unit: '倍' },
  { key: 'inventoryTurnover', label: '棚卸資産回転率', unit: '倍' },
  { key: 'cccDays', label: 'CCC', unit: '日' },
  { key: 'roaPct', label: 'ROA', unit: '%' },
  { key: 'roePct', label: 'ROE', unit: '%' },
];

const BAR_OPTIONS: { key: keyof FinancialRatios; label: string; unit: string }[] = [
  { key: 'operatingMarginPct', label: '営業利益率', unit: '%' },
  { key: 'equityRatioPct', label: '自己資本比率', unit: '%' },
  { key: 'roePct', label: 'ROE', unit: '%' },
  { key: 'roaPct', label: 'ROA', unit: '%' },
  { key: 'ebitdaMarginPct', label: 'EBITDAマージン', unit: '%' },
  { key: 'cccDays', label: 'CCC', unit: '日' },
];

const cardStyle: CSSProperties = {
  background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, minWidth: 0,
};

export function FinancialAnalysis({ units }: { units: readonly FinancialUnit[] }) {
  const [selectedId, setSelectedId] = useState(units[0]?.id ?? '');
  const [barKey, setBarKey] = useState<keyof FinancialRatios>('operatingMarginPct');

  const perUnit = useMemo(
    () => units.map((u) => ({ unit: u, ratios: computeFinancialRatios(deriveBusinessFinancials(u.current)) })),
    [units],
  );
  const selected = perUnit.find((p) => p.unit.id === selectedId) ?? perUnit[0];

  if (!selected) return null;
  const fin = deriveBusinessFinancials(selected.unit.current);
  const axes = radarAxes(selected.ratios);
  const marginHistory = selected.unit.history.map((h) => (h.revenue > 0 ? Math.round((h.profit / h.revenue) * 1000) / 10 : 0));
  const otherCost = Math.max(0, fin.revenue - fin.cogs - fin.laborCost - fin.operatingProfit);
  const pieSlices = [
    { label: '売上原価', value: fin.cogs, color: PALETTE[1]! },
    { label: '人件費', value: fin.laborCost, color: PALETTE[2]! },
    { label: 'その他費用', value: otherCost, color: PALETTE[4]! },
    { label: '営業利益', value: Math.max(0, fin.operatingProfit), color: PALETTE[0]! },
  ];
  const barOpt = BAR_OPTIONS.find((b) => b.key === barKey)!;
  const barRows = perUnit.map((p) => ({ label: p.unit.label, value: p.ratios[barKey] as number | null }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--text-mute)' }}>対象事業:</label>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px', fontSize: 13 }}>
          {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </select>
        <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>年商 {yen.format(fin.revenue)}（概算 BS/CF）</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📡 財務指標レーダー（15指標・健全度0-100）</div>
          <RadarChart axes={axes} />
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📈 営業利益率の推移</div>
          <LineChart values={marginHistory} />
          <div style={{ fontSize: 13, fontWeight: 700, margin: '12px 0 6px' }}>🥧 売上構成（年次）</div>
          <PieChart slices={pieSlices} />
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>📊 事業間比較（棒グラフ）</div>
          <select value={barKey} onChange={(e) => setBarKey(e.target.value as keyof FinancialRatios)} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '3px 8px', fontSize: 12 }}>
            {BAR_OPTIONS.map((b) => <option key={String(b.key)} value={String(b.key)}>{b.label}</option>)}
          </select>
        </div>
        <BarChart rows={barRows} unit={barOpt.unit} />
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🧮 {selected.unit.label} の財務指標一覧（15指標）</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '4px 16px' }}>
          {RATIO_ROWS.map((row) => {
            const v = selected.ratios[row.key] as number | null;
            return (
              <div key={String(row.key)} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '3px 0', fontSize: 12 }}>
                <span style={{ color: 'var(--text-mute)' }}>{row.label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.money ? (v == null ? '—' : yen.format(v)) : fmtRatio(v, row.unit)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>
        ※ 事業別の貸借対照表データが無いため、各事業の BS / CF は売上・収益性から概算生成しています（自己資本比率は収益性で変動）。概算であり財務助言ではありません。
      </div>
    </div>
  );
}

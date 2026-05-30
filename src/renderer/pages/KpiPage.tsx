import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { useCollection } from '../data/useCollection';
import {
  KPI_ACTUALS_COLLECTION,
  parseKpiActual,
  summarizeFundamentals,
  computeKpiMetrics,
  type KpiActual,
} from '../data/kpiActuals';
import { SALES_COLLECTION, type SalesEntry } from '../data/sales';
import { salesMonths, revenueForMonth } from '../data/salesKpiBridge';
import { kpiActualsToCsv, kpiActualsFromCsv } from '../data/kpiActualsCsv';

interface Fund {
  revenue: number;
  cogs: number;
  advertising: number;
  sga: number;
  depreciation: number;
}

interface Kpi {
  variableCost: number;
  fixedCost: number;
  contribution: number;
  contributionRatio: number;
  variableRatio: number;
  fixedRatio: number;
  bep: number;
  bepRatio: number;
  safetyMargin: number;
  operatingProfit: number;
  operatingLeverage: number;
}

interface Unit {
  id: string;
  label: string;
  fundamentals: Fund;
  kpi: Kpi;
  history: Fund[];
}

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });
const pct = (n: number) => (Number.isFinite(n) ? n.toFixed(1) + '%' : '∞');
const safeYen = (n: number) => (Number.isFinite(n) ? yen.format(n) : '∞');

const COLORS = {
  revenue: '#4ade80',
  bep: '#f87171',
  op: '#60a5fa',
  variable: '#fbbf24',
  fixed: '#a78bfa',
  axis: '#475569',
};

// --- KPI tile ---------------------------------------------------------

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--bg-elev)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '12px 16px',
      flex: 1,
      minWidth: 160,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// --- Chart 1: time-series line (revenue vs BEP vs OP) -----------------

function TimeSeriesChart({ unit }: { unit: Unit }) {
  const W = 720, H = 220, P = 36;
  // history is newest-first; reverse to oldest→newest for left-to-right plotting
  const periods = [...unit.history].reverse();
  if (periods.length === 0) return null;

  // Compute BEP + OP per period
  const rows = periods.map((f) => {
    const variable = f.cogs + f.advertising;
    const fixed = f.sga + f.depreciation;
    const contrib = f.revenue - variable;
    const bep = contrib > 0 ? (fixed / contrib) * f.revenue : 0;
    const op = contrib - fixed;
    return { revenue: f.revenue, bep, op };
  });
  const maxV = Math.max(...rows.flatMap((r) => [r.revenue, r.bep, Math.max(0, r.op)]));
  const minOp = Math.min(0, ...rows.map((r) => r.op));
  const range = maxV - minOp || 1;
  const x = (i: number) => P + (i * (W - P * 2)) / Math.max(1, rows.length - 1);
  const y = (v: number) => H - P - ((v - minOp) / range) * (H - P * 2);

  const path = (key: 'revenue' | 'bep' | 'op') =>
    rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(r[key])}`).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <line x1={P} y1={y(0)} x2={W - P} y2={y(0)} stroke={COLORS.axis} strokeDasharray="2,3" />
      <text x={P - 4} y={y(0) + 4} fontSize="10" fill={COLORS.axis} textAnchor="end">0</text>
      <path d={path('revenue')} stroke={COLORS.revenue} fill="none" strokeWidth="2" />
      <path d={path('bep')} stroke={COLORS.bep} fill="none" strokeWidth="2" strokeDasharray="4,3" />
      <path d={path('op')} stroke={COLORS.op} fill="none" strokeWidth="2" />
      <g fontSize="11">
        <rect x={W - 130} y={8} width="124" height="56" fill="var(--bg)" stroke={COLORS.axis} />
        <circle cx={W - 118} cy={20} r={4} fill={COLORS.revenue} />
        <text x={W - 110} y={24} fill="var(--text)">売上</text>
        <line x1={W - 122} y1={36} x2={W - 114} y2={36} stroke={COLORS.bep} strokeWidth="2" strokeDasharray="3,2" />
        <text x={W - 110} y={40} fill="var(--text)">BEP</text>
        <circle cx={W - 118} cy={52} r={4} fill={COLORS.op} />
        <text x={W - 110} y={56} fill="var(--text)">営業利益</text>
      </g>
    </svg>
  );
}

// --- Chart 2: BEP intersection diagram --------------------------------

function BepDiagram({ unit }: { unit: Unit }) {
  const W = 480, H = 220, P = 36;
  const f = unit.fundamentals;
  const variable = f.cogs + f.advertising;
  const fixed = f.sga + f.depreciation;
  const vRatio = f.revenue > 0 ? variable / f.revenue : 0;
  // Volume axis: 0 → 200% of current revenue
  const xMax = f.revenue * 2;
  const yMax = Math.max(f.revenue, fixed + variable * 2) * 1.05;
  const X = (v: number) => P + (v / xMax) * (W - P * 2);
  const Y = (v: number) => H - P - (v / yMax) * (H - P * 2);
  // Revenue line: y = x
  // Total cost line: y = fixed + vRatio * x
  // BEP intersection: where x = fixed + vRatio*x  →  x = fixed / (1 - vRatio)
  const bepX = vRatio < 1 ? fixed / (1 - vRatio) : Infinity;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {/* axes */}
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke={COLORS.axis} />
      <line x1={P} y1={P / 2} x2={P} y2={H - P} stroke={COLORS.axis} />
      <text x={W - P} y={H - P + 12} fontSize="10" fill={COLORS.axis} textAnchor="end">売上高 →</text>
      <text x={P} y={P / 2 - 4} fontSize="10" fill={COLORS.axis}>↑金額</text>
      {/* total cost line */}
      <line x1={X(0)} y1={Y(fixed)} x2={X(xMax)} y2={Y(fixed + vRatio * xMax)}
            stroke={COLORS.variable} strokeWidth="2" />
      {/* revenue (y=x) */}
      <line x1={X(0)} y1={Y(0)} x2={X(xMax)} y2={Y(xMax)} stroke={COLORS.revenue} strokeWidth="2" />
      {/* fixed cost baseline */}
      <line x1={X(0)} y1={Y(fixed)} x2={X(xMax)} y2={Y(fixed)}
            stroke={COLORS.fixed} strokeWidth="1" strokeDasharray="3,3" />
      {/* BEP marker */}
      {Number.isFinite(bepX) && bepX > 0 && bepX < xMax && (
        <>
          <line x1={X(bepX)} y1={Y(0)} x2={X(bepX)} y2={Y(bepX)} stroke={COLORS.bep} strokeWidth="1" strokeDasharray="2,2" />
          <circle cx={X(bepX)} cy={Y(bepX)} r="5" fill={COLORS.bep} />
          <text x={X(bepX) + 8} y={Y(bepX) - 6} fontSize="10" fill={COLORS.bep}>
            BEP: {yen.format(bepX)}
          </text>
        </>
      )}
      {/* current-revenue marker */}
      <line x1={X(f.revenue)} y1={Y(0)} x2={X(f.revenue)} y2={Y(f.revenue)}
            stroke={COLORS.op} strokeWidth="1" strokeDasharray="2,2" />
      <text x={X(f.revenue) + 4} y={Y(f.revenue) - 6} fontSize="10" fill={COLORS.op}>
        現在: {yen.format(f.revenue)}
      </text>
      {/* legend */}
      <g fontSize="11" transform={`translate(${P + 8}, ${P / 2 + 8})`}>
        <line x1={0} y1={4} x2={12} y2={4} stroke={COLORS.revenue} strokeWidth="2" />
        <text x={16} y={8} fill="var(--text)">売上</text>
        <line x1={50} y1={4} x2={62} y2={4} stroke={COLORS.variable} strokeWidth="2" />
        <text x={66} y={8} fill="var(--text)">総費用</text>
        <line x1={120} y1={4} x2={132} y2={4} stroke={COLORS.fixed} strokeDasharray="2,2" />
        <text x={136} y={8} fill="var(--text)">固定費</text>
      </g>
    </svg>
  );
}

// --- Chart 3: donut (variable / fixed / OP composition) ---------------

function DonutChart({ unit }: { unit: Unit }) {
  const W = 240, H = 220;
  const cx = W / 2, cy = H / 2, r = 70, rInner = 40;
  const v = unit.kpi.variableCost;
  const fx = unit.kpi.fixedCost;
  const op = Math.max(0, unit.kpi.operatingProfit);
  const total = v + fx + op || 1;
  const slices = [
    { v, color: COLORS.variable, label: '変動費' },
    { v: fx, color: COLORS.fixed, label: '固定費' },
    { v: op, color: COLORS.op, label: '営業利益' },
  ];
  let cursor = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const angle = (s.v / total) * Math.PI * 2;
    const x0 = cx + Math.cos(cursor) * r;
    const y0 = cy + Math.sin(cursor) * r;
    const x1 = cx + Math.cos(cursor + angle) * r;
    const y1 = cy + Math.sin(cursor + angle) * r;
    const x0i = cx + Math.cos(cursor + angle) * rInner;
    const y0i = cy + Math.sin(cursor + angle) * rInner;
    const x1i = cx + Math.cos(cursor) * rInner;
    const y1i = cy + Math.sin(cursor) * rInner;
    const large = angle > Math.PI ? 1 : 0;
    cursor += angle;
    return { d: `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${x0i} ${y0i} A ${rInner} ${rInner} 0 ${large} 0 ${x1i} ${y1i} Z`, color: s.color, label: s.label, pct: (s.v / total) * 100 };
  });

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} />)}
      <text x={cx} y={cy} fontSize="11" fill="var(--text-mute)" textAnchor="middle" dy="0.35em">構成比</text>
      <g fontSize="11" transform={`translate(10, ${H - 50})`}>
        {arcs.map((a, i) => (
          <g key={i} transform={`translate(0, ${i * 14})`}>
            <rect width={10} height={10} fill={a.color} />
            <text x={14} y={9} fill="var(--text)">{a.label}: {a.pct.toFixed(1)}%</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// --- Chart 4: per-unit bar comparison ---------------------------------

function UnitBars({ units }: { units: Unit[] }) {
  const W = 720, H = 220, P = 40;
  if (units.length === 0) return null;
  const maxV = Math.max(...units.flatMap((u) => [u.fundamentals.revenue, Number.isFinite(u.kpi.bep) ? u.kpi.bep : 0, Math.max(0, u.kpi.operatingProfit)]));
  const groupW = (W - P * 2) / units.length;
  const barW = (groupW - 8) / 3;
  const Y = (v: number) => H - P - (v / (maxV || 1)) * (H - P * 2);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke={COLORS.axis} />
      {units.map((u, i) => {
        const gx = P + i * groupW + 4;
        const bep = Number.isFinite(u.kpi.bep) ? u.kpi.bep : 0;
        return (
          <g key={u.id}>
            <rect x={gx} y={Y(u.fundamentals.revenue)} width={barW} height={H - P - Y(u.fundamentals.revenue)} fill={COLORS.revenue} />
            <rect x={gx + barW} y={Y(bep)} width={barW} height={H - P - Y(bep)} fill={COLORS.bep} />
            <rect x={gx + barW * 2} y={Y(Math.max(0, u.kpi.operatingProfit))} width={barW} height={H - P - Y(Math.max(0, u.kpi.operatingProfit))} fill={COLORS.op} />
            <text x={gx + groupW / 2 - 4} y={H - P + 14} fontSize="10" fill="var(--text-mute)" textAnchor="middle">{u.label}</text>
          </g>
        );
      })}
      <g fontSize="11">
        <rect x={W - 110} y={8} width="100" height="50" fill="var(--bg)" stroke={COLORS.axis} />
        <rect x={W - 102} y={14} width="10" height="10" fill={COLORS.revenue} />
        <text x={W - 88} y={23} fill="var(--text)">売上</text>
        <rect x={W - 102} y={28} width="10" height="10" fill={COLORS.bep} />
        <text x={W - 88} y={37} fill="var(--text)">BEP</text>
        <rect x={W - 102} y={42} width="10" height="10" fill={COLORS.op} />
        <text x={W - 88} y={51} fill="var(--text)">営業利益</text>
      </g>
    </svg>
  );
}

// --- Real-data actuals panel ------------------------------------------

const EMPTY_FORM = { period: '', unit: '', revenue: '', cogs: '', advertising: '', sga: '', depreciation: '' };

function ActualsPanel() {
  const { records, add, addMany, remove } = useCollection<KpiActual>(KPI_ACTUALS_COLLECTION);
  const { records: salesRecords } = useCollection<SalesEntry>(SALES_COLLECTION);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string>();
  const [importMonth, setImportMonth] = useState('');

  const summary = useMemo(() => {
    const rows = records.map((r) => r.data);
    return computeKpiMetrics(summarizeFundamentals(rows));
  }, [records]);

  // Months available from the sales feature, for the "売上集計から取り込む" link.
  const salesEntries = useMemo(() => salesRecords.map((r) => r.data), [salesRecords]);
  const monthOptions = useMemo(() => salesMonths(salesEntries), [salesEntries]);

  function importFromSales(month: string) {
    if (!month) return;
    const revenue = revenueForMonth(salesEntries, month);
    // Prefill period + revenue from sales; costs stay blank for the user to fill.
    setForm((f) => ({ ...f, period: month, unit: f.unit || '全社', revenue: String(revenue) }));
    setError(undefined);
  }

  function onExportCsv() {
    const blob = new Blob(['﻿' + kpiActualsToCsv(records.map((r) => r.data))], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kpi-actuals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImportCsv(file: File) {
    const { entries, errors } = kpiActualsFromCsv(await file.text());
    // Atomic: all valid rows commit together or none (no partial import).
    if (entries.length > 0) await addMany(entries);
    setError(
      errors.length > 0 ? `${entries.length} 件取り込み / ${errors.length} 件スキップ (行 ${errors.map((x) => x.row).join(', ')})` : undefined,
    );
  }

  async function onAdd() {
    try {
      const parsed = parseKpiActual(form);
      setError(undefined);
      await add(parsed);
      setForm(EMPTY_FORM);
    } catch (e) {
      setError(e instanceof Error ? e.message : '入力エラー');
    }
  }

  const field = (key: keyof typeof EMPTY_FORM, placeholder: string) => (
    <input
      value={form[key]}
      placeholder={placeholder}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        color: 'var(--text)',
        padding: '6px 8px',
        fontSize: 13,
        width: key === 'period' || key === 'unit' ? 110 : 100,
      }}
    />
  );

  return (
    <div>
      {monthOptions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>売上集計から取り込む:</span>
          <select
            value={importMonth}
            onChange={(e) => setImportMonth(e.target.value)}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '6px 8px', fontSize: 13 }}
          >
            <option value="">月を選択</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>{m}（{yen.format(revenueForMonth(salesEntries, m))}）</option>
            ))}
          </select>
          <button type="button" onClick={() => importFromSales(importMonth)} disabled={!importMonth}>
            売上を取り込む
          </button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {field('period', 'YYYY-MM')}
        {field('unit', '事業名')}
        {field('revenue', '売上高')}
        {field('cogs', '売上原価')}
        {field('advertising', '広告費')}
        {field('sga', '販管費')}
        {field('depreciation', '減価償却費')}
        <button type="button" onClick={onAdd}>追加</button>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
        <button type="button" onClick={onExportCsv} disabled={records.length === 0}>CSV エクスポート</button>
        <label style={{ fontSize: 13, cursor: 'pointer', color: 'var(--accent)' }}>
          CSV インポート
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportCsv(file);
              e.target.value = '';
            }}
          />
        </label>
        <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>
          列: period, unit, revenue, cogs, advertising, sga, depreciation
        </span>
      </div>
      {error && <div style={{ color: '#f87171', fontSize: 12, marginTop: 6 }}>{error}</div>}

      {records.length > 0 ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
            <Tile label="実績合計 売上高" value={safeYen(summarizeRevenue(records))} />
            <Tile label="損益分岐点 (BEP)" value={safeYen(summary.bep)} sub={`比率 ${pct(summary.bepRatio)}`} />
            <Tile label="安全余裕率" value={pct(summary.safetyMargin)} sub="高いほど安全" />
            <Tile label="限界利益率" value={pct(summary.contributionRatio)} />
            <Tile label="営業利益" value={safeYen(summary.operatingProfit)} />
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-mute)' }}>
                <th style={{ padding: '4px 8px' }}>期間</th>
                <th style={{ padding: '4px 8px' }}>事業</th>
                <th style={{ padding: '4px 8px', textAlign: 'right' }}>売上高</th>
                <th style={{ padding: '4px 8px', textAlign: 'right' }}>営業利益</th>
                <th style={{ padding: '4px 8px' }} />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const m = computeKpiMetrics(summarizeFundamentals([r.data]));
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 8px' }}>{r.data.period}</td>
                    <td style={{ padding: '4px 8px' }}>{r.data.unit}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{yen.format(r.data.revenue)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{yen.format(m.operatingProfit)}</td>
                    <td style={{ padding: '4px 8px' }}>
                      <button type="button" onClick={() => remove(r.id)} aria-label="削除">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : (
        <p style={{ color: 'var(--text-mute)', fontSize: 13, marginTop: 12 }}>
          実績を入力すると、ローカルに保存され KPI が実データで再計算されます。
        </p>
      )}
    </div>
  );
}

function summarizeRevenue(records: readonly { data: KpiActual }[]): number {
  return records.reduce((acc, r) => acc + r.data.revenue, 0);
}

// --- Page -------------------------------------------------------------

export function KpiPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'kpi',
    SNAPSHOT.kpi,
  );
  const { units, aggregate, isMock } = data;
  const [selectedId, setSelectedId] = useState<string>('all');

  const selected = useMemo<Unit>(() => {
    if (selectedId === 'all') return aggregate as Unit;
    return (units.find((u) => u.id === selectedId) ?? aggregate) as Unit;
  }, [selectedId, units, aggregate]);

  return (
    <div>
      <StatusBar
        who="KPI / BEP ダッシュボード"
        serviceId="kpi"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        onRefresh={refresh}
        isConfigured={isConfigured}
      />

      {isMock && (
        <div style={{
          background: 'rgba(251, 191, 36, 0.12)',
          border: '1px solid #d97706',
          color: '#fbbf24',
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 12,
          margin: '12px 0',
        }}>
          ⚠ 模擬データ表示中 — 実数値を反映するには Phase 6 で <code>KpiDataSource</code> アダプタを実装し、
          会計 API (freee / Xero / Google Sheets) に接続してください。
        </div>
      )}

      <Section title="実績入力 — ローカル保存 (実データで KPI 再計算)">
        <ActualsPanel />
      </Section>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0' }}>
        <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>事業 (模擬データ):</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text)',
            padding: '6px 10px',
            fontSize: 13,
          }}
        >
          <option value="all">全社合算</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        <Tile label="売上高" value={yen.format(selected.fundamentals.revenue)} />
        <Tile label="損益分岐点 (BEP)" value={safeYen(selected.kpi.bep)} sub={`比率 ${pct(selected.kpi.bepRatio)}`} />
        <Tile label="安全余裕率" value={pct(selected.kpi.safetyMargin)} sub="高いほど安全" />
        <Tile label="限界利益率" value={pct(selected.kpi.contributionRatio)} />
        <Tile label="営業利益" value={yen.format(selected.kpi.operatingProfit)} sub={`営業レバレッジ ${selected.kpi.operatingLeverage.toFixed(2)}x`} />
      </div>

      <Section title="時系列推移 — 売上 vs BEP vs 営業利益 (直近 30 期)">
        <TimeSeriesChart unit={selected} />
      </Section>

      <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 320 }}>
          <Section title="損益分岐点グラフ">
            <BepDiagram unit={selected} />
          </Section>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Section title="費用構成">
            <DonutChart unit={selected} />
          </Section>
        </div>
      </div>

      <Section title="事業別比較">
        <UnitBars units={units as Unit[]} />
      </Section>
    </div>
  );
}

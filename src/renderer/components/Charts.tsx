/**
 * チャート 3 種の SVG 描画。座標計算は `data/charts.ts` の純関数に委ね、
 * ここは**描くだけ**にする (計算をここに持ち込むとテストできなくなる)。
 *
 * 依存ライブラリは入れない。ブラウザ版は CSP が厳しく外部ホストへ一切
 * 取りに行けない単一 HTML なので、SVG を自前で組むのが最も確実。
 */

import type { ReactElement } from 'react';
import {
  lineChart,
  pieChart,
  radarChart,
  type LineChartOptions,
  type LineSeries,
  type PieChartOptions,
  type PieSlice,
  type RadarChartOptions,
  type RadarSeries,
} from '../data/charts';
import { seriesColor } from '../data/chartFixtures';

/** データが無いときの共通表示。「空の図」を出さずに理由を書く。 */
function EmptyChart({ reason }: { reason: string }): ReactElement {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 120,
        padding: 16,
        border: '1px dashed var(--border, #444)',
        borderRadius: 8,
        color: 'var(--text-mute, #888)',
        fontSize: 12,
        textAlign: 'center',
      }}
    >
      {reason}
    </div>
  );
}

function Legend({ labels }: { labels: readonly string[] }): ReactElement {
  return (
    <ul
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        listStyle: 'none',
        margin: '8px 0 0',
        padding: 0,
        fontSize: 11,
      }}
    >
      {labels.map((label, i) => (
        <li key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: seriesColor(i),
              display: 'inline-block',
            }}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */

export interface LineChartViewProps {
  readonly series: readonly LineSeries[];
  readonly options?: LineChartOptions;
  readonly title?: string;
  readonly unit?: string;
}

export function LineChartView({
  series,
  options,
  title,
  unit,
}: LineChartViewProps): ReactElement {
  const width = options?.width ?? 480;
  const height = options?.height ?? 200;
  // 目盛りラベルの幅ぶん左に溝を空ける（指定が無ければ既定値を入れる）。
  const gutter = options?.gutter ?? 52;
  const geo = lineChart(series, { ...options, gutter });
  if (geo.series.length === 0) return <EmptyChart reason="データがありません（系列が空）" />;

  return (
    <figure style={{ margin: 0 }}>
      {title !== undefined && (
        <figcaption style={{ fontSize: 12, marginBottom: 4 }}>{title}</figcaption>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`${title ?? '折れ線グラフ'}（${geo.series.length} 系列）`}
        style={{ overflow: 'visible' }}
      >
        {geo.yTicks.map((t) => (
          <g key={`y${t.value}`}>
            <line
              x1={gutter}
              y1={t.pos}
              x2={width}
              y2={t.pos}
              stroke="var(--border, #333)"
              strokeWidth={0.5}
            />
            <text x={gutter - 4} y={t.pos + 3} fontSize={9} textAnchor="end" fill="var(--text-mute, #888)">
              {t.label}
              {unit !== undefined && unit !== '—' ? ` ${unit}` : ''}
            </text>
          </g>
        ))}
        {geo.zeroY !== null && (
          <line
            x1={gutter}
            y1={geo.zeroY}
            x2={width}
            y2={geo.zeroY}
            stroke="var(--text-mute, #888)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}
        {geo.series.map((s, i) => (
          <g key={s.label}>
            <polyline
              points={s.polyline}
              fill="none"
              stroke={seriesColor(i)}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* 点が 1 つだけだと polyline は何も描かないので、必ず丸も打つ */}
            {s.points.map((p) => (
              <circle key={`${s.label}-${p.x}-${p.y}`} cx={p.x} cy={p.y} r={2.2} fill={seriesColor(i)} />
            ))}
          </g>
        ))}
        {geo.xTicks.map((t) => (
          <text
            key={`x${t.value}`}
            x={t.pos}
            y={height - 1}
            fontSize={9}
            textAnchor="middle"
            fill="var(--text-mute, #888)"
          >
            {t.label}
          </text>
        ))}
      </svg>
      <Legend labels={geo.series.map((s) => s.label)} />
    </figure>
  );
}

/* ------------------------------------------------------------------ */

export interface PieChartViewProps {
  readonly slices: readonly PieSlice[];
  readonly options?: PieChartOptions;
  readonly title?: string;
}

export function PieChartView({ slices, options, title }: PieChartViewProps): ReactElement {
  const size = options?.size ?? 200;
  const geo = pieChart(slices, options);
  if (geo.slices.length === 0) {
    return <EmptyChart reason="データがありません（正の値が 1 つもない）" />;
  }

  return (
    <figure style={{ margin: 0 }}>
      {title !== undefined && (
        <figcaption style={{ fontSize: 12, marginBottom: 4 }}>{title}</figcaption>
      )}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label={`${title ?? '円グラフ'}（${geo.slices.length} 区分）`}
      >
        {geo.slices.map((s, i) => (
          <path
            key={s.label}
            d={s.path}
            fill={seriesColor(i)}
            stroke="var(--bg, #0f1117)"
            strokeWidth={1}
          >
            <title>{`${s.label}: ${s.value}（${Math.round(s.ratio * 1000) / 10}%）`}</title>
          </path>
        ))}
        {geo.slices
          .filter((s) => s.ratio >= 0.06)
          .map((s) => (
            <text
              key={`l-${s.label}`}
              x={s.labelAt.x}
              y={s.labelAt.y}
              fontSize={9}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#fff"
            >
              {Math.round(s.ratio * 100)}%
            </text>
          ))}
      </svg>
      <Legend labels={geo.slices.map((s) => s.label)} />
    </figure>
  );
}

/* ------------------------------------------------------------------ */

export interface RadarChartViewProps {
  readonly axes: readonly string[];
  readonly series: readonly RadarSeries[];
  readonly options?: RadarChartOptions;
  readonly title?: string;
}

export function RadarChartView({
  axes,
  series,
  options,
  title,
}: RadarChartViewProps): ReactElement {
  const size = options?.size ?? 220;
  const geo = radarChart(axes, series, options);
  if (geo.axes.length === 0) {
    return <EmptyChart reason="レーダーには 3 本以上の軸が必要です" />;
  }

  return (
    <figure style={{ margin: 0 }}>
      {title !== undefined && (
        <figcaption style={{ fontSize: 12, marginBottom: 4 }}>{title}</figcaption>
      )}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label={`${title ?? 'レーダーチャート'}（${geo.axes.length} 軸）`}
      >
        {geo.rings.map((ring) => (
          <polygon
            key={ring}
            points={ring}
            fill="none"
            stroke="var(--border, #333)"
            strokeWidth={0.5}
          />
        ))}
        {geo.axes.map((a) => (
          <line
            key={`sp-${a.label}`}
            x1={geo.cx}
            y1={geo.cy}
            x2={a.at.x}
            y2={a.at.y}
            stroke="var(--border, #333)"
            strokeWidth={0.5}
          />
        ))}
        {geo.series.map((s, i) => (
          <polygon
            key={s.label}
            points={s.polygon}
            fill={seriesColor(i)}
            fillOpacity={0.18}
            stroke={seriesColor(i)}
            strokeWidth={1.6}
          />
        ))}
        {geo.axes.map((a) => (
          <text
            key={`t-${a.label}`}
            x={a.labelAt.x}
            y={a.labelAt.y}
            fontSize={9}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--text-mute, #888)"
          >
            {a.label}
          </text>
        ))}
      </svg>
      <Legend labels={geo.series.map((s) => s.label)} />
    </figure>
  );
}

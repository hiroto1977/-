/**
 * 全業務を 3 軸 (縦軸 / 横軸 / 斜め軸) で重ねて見る図。
 *
 * 計算は `src/renderer/data/businessAxonometric.ts` に置いてある。ここは
 * **描くだけ** — 座標を作る式をこちらに書くと、図の正しさ (奥行きで縮まない /
 * 当月が縦に揃う / 0 が縦軸に入る) が検査できない場所へ移ってしまう。
 *
 * 折れ線は事業ごとに 1 本。奥へ行くほど右上へずれるので、手前の線が奥の線を
 * 隠しにくい。奥から先に描いて手前を後に重ねる (`z` の降順) ことで、
 * 重なったときに手前が上に来る = 図として自然な前後関係になる。
 */
import { useMemo, useState } from 'react';
import {
  buildAxonometric,
  buildComposition,
  COMPOSITION_LABELS,
  INDICATORS,
  projectAxonometric,
  type AxonometricUnitInput,
  type CompositionKey,
  type IndicatorSpec,
} from '../data/businessAxonometric';

const PALETTE = ['#5b8def', '#ec9a3d', '#5cb85c', '#e36b6b', '#a06bd2', '#43c3b8', '#d2b06b', '#8fa1c7', '#c77f9e', '#7fc7a1', '#c7b57f', '#9e7fc7'];

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 14,
};

function color(i: number): string {
  return PALETTE[i % PALETTE.length]!;
}

/** 縦軸の目盛り。金額は万・億でまとめる (生の桁数だと軸が読めない)。 */
const compactYen = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 });

function formatTick(value: number, spec: IndicatorSpec): string {
  if (spec.unit === '円') return compactYen.format(value);
  return String(Math.round(value * 10) / 10);
}

/** 指標の値を単位付きで読める形にする。算定不能は「—」。 */
export function formatIndicator(value: number | null, spec: IndicatorSpec): string {
  if (value === null) return '—';
  if (spec.unit === '円') return yen.format(value);
  return `${value}${spec.unit}`;
}

// --- 3 軸の折れ線 ----------------------------------------------------------

const W = 560;
const H = 340;
/** 描画領域の余白。左は縦軸の目盛り、下は横軸のラベル、上と右は斜め軸の伸びしろ。 */
const PAD = { left: 58, right: 20, top: 26, bottom: 34 };
/**
 * 斜め軸 1 段 (= 1 事業) あたりの奥行き (画素)。
 *
 * 事業が増えるほど奥行きの総量が増えるので、上限を決めて 1 段を縮める。
 * 縮めても平行投影のままなので、段どうしの間隔は最後まで等しい。
 */
const DEPTH_PX_MAX = 18;
const DEPTH_TOTAL_MAX = 110;

function AxonometricLineChart({
  chart,
}: {
  chart: NonNullable<ReturnType<typeof buildAxonometric>>;
}) {
  const { series, periods, min, max, indicator } = chart;
  const depth = Math.max(0, series.length - 1);

  // 斜め軸が使う幅と高さを先に測り、残りを縦横の平面に割り当てる。
  // こうしないと奥の事業が枠から出る。
  const depthPx = depth === 0 ? 0 : Math.min(DEPTH_PX_MAX, DEPTH_TOTAL_MAX / depth);
  const far = projectAxonometric(0, 0, depth * depthPx);
  const depthW = far.x;
  const depthH = far.y;
  const planeW = Math.max(1, W - PAD.left - PAD.right - depthW);
  const planeH = Math.max(1, H - PAD.top - PAD.bottom - depthH);

  const stepX = periods > 1 ? planeW / (periods - 1) : 0;
  const scaleY = planeH / (max - min);

  /** 抽象座標 → SVG 座標。SVG は下向きが正なので縦を反転する。 */
  const at = (xi: number, value: number, z: number) => {
    // z は「何段目か」。画素へ直してから投影する (段数のまま渡すと
    // 奥行きが 1 画素も動かない)。
    const p = projectAxonometric(xi * stepX, (value - min) * scaleY, z * depthPx);
    return { x: PAD.left + p.x, y: H - PAD.bottom - p.y };
  };

  const zeroAt = (z: number) => at(0, Math.max(min, Math.min(max, 0)), z);
  // 奥から描いて手前を上に重ねる。
  const drawOrder = [...series].sort((a, b) => b.z - a.z);
  const ticks = [min, min + (max - min) / 2, max];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ maxWidth: W, height: 'auto', display: 'block' }}
      role="img"
      aria-label={`${indicator.label}の全業務推移（縦軸=値・横軸=期間・斜め軸=業務）`}
    >
      {/* 縦軸 (値) */}
      <line x1={PAD.left} y1={H - PAD.bottom} x2={PAD.left} y2={PAD.top} stroke="#4a5568" />
      {ticks.map((t) => {
        const p = at(0, t, 0);
        return (
          <g key={`ty${t}`}>
            <line x1={PAD.left - 4} y1={p.y} x2={PAD.left} y2={p.y} stroke="#4a5568" />
            <text x={PAD.left - 6} y={p.y} fontSize={9} fill="#94a3b8" textAnchor="end" dominantBaseline="middle">
              {formatTick(t, indicator)}
            </text>
          </g>
        );
      })}
      {/* 軸の名前は左上にまとめる。斜め軸の先端に置くと図の真ん中に来て
          折れ線と重なる (実際に重なった)。 */}
      <text x={2} y={PAD.top - 14} fontSize={9} fill="#94a3b8">
        縦軸 {indicator.unit}
      </text>
      {depth > 0 && (
        <text x={2} y={PAD.top - 4} fontSize={9} fill="#94a3b8">
          斜め軸 業務（{series.length}）
        </text>
      )}

      {/* 横軸 (期間) — 0 の高さに引く */}
      <line
        x1={zeroAt(0).x}
        y1={zeroAt(0).y}
        x2={at(periods - 1, Math.max(min, Math.min(max, 0)), 0).x}
        y2={at(periods - 1, Math.max(min, Math.min(max, 0)), 0).y}
        stroke="#4a5568"
      />
      {series[0]?.points.map((p) => {
        const q = at(p.x, Math.max(min, Math.min(max, 0)), 0);
        return (
          <text key={`tx${p.x}`} x={q.x} y={H - PAD.bottom + 12} fontSize={9} fill="#94a3b8" textAnchor="middle">
            {p.monthsAgo === 0 ? '当月' : `-${p.monthsAgo}`}
          </text>
        );
      })}
      <text x={PAD.left} y={H - 6} fontSize={9} fill="#94a3b8">
        横軸 期間（ヶ月前）
      </text>

      {/* 斜め軸 (業務) — 原点から奥へ伸びる案内線。 */}
      {depth > 0 && (
        <line
          x1={zeroAt(0).x}
          y1={zeroAt(0).y}
          x2={zeroAt(depth).x}
          y2={zeroAt(depth).y}
          stroke="#4a5568"
          strokeDasharray="3,3"
        />
      )}

      {/* 事業ごとの折れ線 */}
      {drawOrder.map((s) => {
        const drawn = s.points.filter((p) => p.value !== null);
        const pts = drawn.map((p) => at(p.x, p.value!, s.z));
        const c = color(s.z);
        return (
          <g key={s.id}>
            {pts.length > 1 && (
              <polyline
                fill="none"
                stroke={c}
                strokeWidth={s.sample ? 1.2 : 2}
                strokeDasharray={s.sample ? '4,3' : undefined}
                points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              />
            )}
            {pts.map((p, i) => (
              <circle key={`${s.id}-${i}`} cx={p.x} cy={p.y} r={2} fill={c}>
                <title>
                  {`${s.label} / ${drawn[i]!.label} / ${formatIndicator(drawn[i]!.value, indicator)}`}
                </title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// --- 円 (構成比) -----------------------------------------------------------

function CompositionPie({
  composition,
  colorOf,
}: {
  composition: ReturnType<typeof buildComposition>;
  colorOf: (id: string) => string;
}) {
  const size = 132;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  let angle = -Math.PI / 2;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
        🥧 {composition.label}の構成
      </div>
      {composition.slices.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-mute)', padding: '8px 0' }}>
          正の値の事業がないため、構成比は描けません。
        </div>
      ) : (
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${composition.label}の構成`}>
          {composition.slices.map((s) => {
            const frac = s.value / composition.total;
            const a0 = angle;
            const a1 = angle + frac * 2 * Math.PI;
            angle = a1;
            const large = a1 - a0 > Math.PI ? 1 : 0;
            const x0 = cx + Math.cos(a0) * r;
            const y0 = cy + Math.sin(a0) * r;
            const x1 = cx + Math.cos(a1) * r;
            const y1 = cy + Math.sin(a1) * r;
            return (
              <path
                key={s.id}
                d={`M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`}
                fill={colorOf(s.id)}
                stroke="var(--bg)"
                strokeWidth={1}
              >
                <title>{`${s.label} ${s.pct}%（${yen.format(s.value)}）`}</title>
              </path>
            );
          })}
        </svg>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
        {composition.slices.slice(0, 6).map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
            <span style={{ width: 8, height: 8, background: colorOf(s.id), borderRadius: 2, display: 'inline-block', flex: '0 0 auto' }} />
            <span style={{ overflowWrap: 'anywhere' }}>{s.label}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--text-mute)' }}>{s.pct}%</span>
          </div>
        ))}
        {composition.slices.length > 6 && (
          <div style={{ fontSize: 10, color: 'var(--text-mute)' }}>ほか {composition.slices.length - 6} 事業</div>
        )}
      </div>
      {composition.negatives.length > 0 && (
        // 負の値は円に描きようがない。0% として黙って消すと、赤字の事業が
        // 無かったことになり全体が黒字に見える。必ず言葉で出す。
        <div style={{ fontSize: 10, color: '#e36b6b', marginTop: 6, lineHeight: 1.5 }}>
          ⚠ 円に含めていない赤字:{' '}
          {composition.negatives.map((n) => `${n.label} ${yen.format(n.value)}`).join(' / ')}
        </div>
      )}
    </div>
  );
}

// --- 本体 ------------------------------------------------------------------

const COMPOSITION_KEYS: readonly CompositionKey[] = ['revenue', 'netProfit', 'ebitda', 'laborCost'];

export function AxonometricCharts({ units }: { units: readonly AxonometricUnitInput[] }) {
  const [indicatorKey, setIndicatorKey] = useState(INDICATORS[0]!.key);
  const chart = useMemo(() => buildAxonometric(units, indicatorKey), [units, indicatorKey]);
  const compositions = useMemo(
    () => COMPOSITION_KEYS.map((k) => buildComposition(units, k)),
    [units],
  );
  const colorById = useMemo(() => {
    const m = new Map<string, string>();
    units.forEach((u, i) => m.set(u.id, color(i)));
    return m;
  }, [units]);

  if (units.length === 0 || chart === null) return null;

  const sampleCount = units.filter((u) => u.sample === true).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            🧊 全業務 3 軸推移（縦軸 = 値 / 横軸 = 期間 / 斜め軸 = 業務）
          </div>
          <select
            data-axonometric-indicator
            value={indicatorKey}
            onChange={(e) => setIndicatorKey(e.target.value)}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '3px 8px', fontSize: 12 }}
          >
            {INDICATORS.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}（{i.unit}）
              </option>
            ))}
          </select>
        </div>
        <AxonometricLineChart chart={chart} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {chart.series.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
              <span style={{ width: 10, height: 2, background: color(s.z), display: 'inline-block' }} />
              <span>{s.label}</span>
              <span style={{ color: 'var(--text-mute)' }}>
                {formatIndicator(s.points[s.points.length - 1]?.value ?? null, chart.indicator)}
              </span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
          各点はその月の実績を年換算して算出（概算 BS/CF）。線が途切れている箇所は算定不能（分母 0）。
          破線は同梱サンプル{sampleCount > 0 ? `（${sampleCount} 事業）` : ''}。
          平行投影なので奥の事業も同じ縮尺で読めます。単位の違う指標は縦軸に混ぜず、上のセレクタで切り替えます。
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
          🥧 全業務の構成比（当月・年換算）
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 16 }}>
          {compositions.map((c) => (
            <CompositionPie key={c.key} composition={c} colorOf={(id) => colorById.get(id) ?? PALETTE[0]!} />
          ))}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 10, lineHeight: 1.6 }}>
          円グラフに出せるのは事業をまたいで足せる金額だけです（{COMPOSITION_KEYS.map((k) => COMPOSITION_LABELS[k]).join(' / ')}）。
          比率は足しても意味を成さないため、構成比ではなく上の 3 軸グラフで比べてください。
        </div>
      </div>
    </div>
  );
}

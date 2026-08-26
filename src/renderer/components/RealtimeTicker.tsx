import { useEffect, useRef, useState } from 'react';
import { useRealtimeTick, DEFAULT_TICK_MS } from '../hooks/useRealtimeTick';
import {
  accruedSoFar,
  formatElapsed,
  perSecond,
  remainingDays,
  yearProgress,
} from '../../shared/realtimeProjection';

/**
 * 年額から「いま」を秒単位で見せる帯。**税務試算と経営サマリーが共有する。**
 *
 * ## 何が本当に毎秒動くのか
 *
 * 元データ (フォームの入力・集計済みの売上) は毎秒変わらない。毎秒変わるのは
 * **時刻が入っている値**だけ —— 年初からの経過、その経過に応じた発生額、
 * 残り時間。ここはそれだけを描く。
 *
 * 発生額は小数 2 桁まで出す。年額 500 万円なら 1 秒あたり約 0.16 円で、
 * 整数のままだと 6 秒に 1 度しか動かない。**「毎秒更新」と言うなら、
 * 毎秒動いて見えなければ嘘になる。**
 *
 * ## 取りに行くのは別の刻み
 *
 * 元データの再取得はここではしない。毎秒 API を叩くと上限に当たり、
 * ブラウザ版では利用者の鍵を毎秒使う。刻みを分けるのが要点である。
 */

export interface RealtimeRow {
  readonly label: string;
  /** 年額 (円)。0 や NaN でも落ちないこと。 */
  readonly annual: number;
  readonly color?: string;
  readonly hint?: string;
}

export interface RealtimeTickerProps {
  readonly rows: readonly RealtimeRow[];
  /** 刻み (ms)。既定 1 秒。 */
  readonly intervalMs?: number;
  /** 直近何点を折れ線に残すか。既定 60 (= 1 分)。 */
  readonly windowPoints?: number;
  /** 帯の下に出す注記。 */
  readonly note?: string;
  /** 「経過」の起点。省略時はこの帯が現れた時刻。 */
  readonly since?: number;
}

const yen2 = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const yen0 = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });

/** 数でない値を 0 に落とす (NaN を画面へ流さない)。 */
function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function clock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 直近 `window` 点だけを保つ折れ線。毎秒 1 点ずつ左へ流れる。 */
function RollingLine({ values, color }: { values: readonly number[]; color: string }) {
  const W = 220;
  const H = 36;
  if (values.length < 2) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="推移 (計測中)">
        <rect x={0} y={0} width={W} height={H} fill="none" />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = W / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(H - ((v - min) / span) * (H - 4) - 2).toFixed(2)}`);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="直近の推移" style={{ display: 'block' }}>
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.5} />
      <circle
        cx={W}
        cy={Number(points[points.length - 1]?.split(',')[1] ?? H / 2)}
        r={2.5}
        fill={color}
      />
    </svg>
  );
}

export function RealtimeTicker({
  rows,
  intervalMs = DEFAULT_TICK_MS,
  windowPoints = 60,
  note,
  since,
}: RealtimeTickerProps) {
  const at = useRealtimeTick(intervalMs);
  const now = new Date(at);
  const progress = yearProgress(now);

  const startRef = useRef<number>(since ?? at);
  const cap = Number.isFinite(windowPoints) && windowPoints >= 2 ? Math.floor(windowPoints) : 60;

  /** 行ごとの直近値。**上限つきの輪** —— 毎秒足すので、上限が無いと際限なく伸びる。 */
  const [history, setHistory] = useState<number[][]>(() => rows.map(() => []));
  useEffect(() => {
    setHistory((prev) =>
      rows.map((r, i) => {
        const next = [...(prev[i] ?? []), safe(accruedSoFar(r.annual, new Date(at)))];
        return next.length > cap ? next.slice(next.length - cap) : next;
      }),
    );
    // 行の中身 (年額) が変わったときも、刻みが進んだときも足す。
  }, [at, cap, rows]);

  return (
    <div
      style={{
        border: '1px solid #2a3550',
        borderRadius: 10,
        padding: '12px 14px',
        background: 'linear-gradient(180deg, #131a2b 0%, #101626 100%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#8fa3c8' }}>リアルタイム</span>
        <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 18 }}>{clock(at)}</strong>
        <span style={{ fontSize: 12, color: '#8fa3c8', fontVariantNumeric: 'tabular-nums' }}>
          年初来 {(progress * 100).toFixed(6)}% / 残り {remainingDays(now)} 日 / 表示から{' '}
          {formatElapsed(at - startRef.current)}
        </span>
      </div>

      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {rows.map((r, i) => {
          const annual = safe(r.annual);
          const soFar = safe(accruedSoFar(annual, now));
          const rate = safe(perSecond(annual, now));
          const color = r.color ?? '#4f9cf9';
          return (
            <div
              key={r.label}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(120px, 1fr) minmax(140px, auto) auto',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: '#8fa3c8' }}>{r.label}</div>
                <div style={{ fontSize: 11, color: '#6c7c9c' }}>
                  年額 {yen0.format(annual)} 円 / 秒あたり {rate.toFixed(4)} 円
                  {r.hint !== undefined ? ` — ${r.hint}` : ''}
                </div>
              </div>
              <div
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 16,
                  fontWeight: 600,
                  color,
                  textAlign: 'right',
                }}
              >
                {yen2.format(soFar)} 円
              </div>
              <RollingLine values={history[i] ?? []} color={color} />
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11, color: '#6c7c9c', marginTop: 10, marginBottom: 0, lineHeight: 1.6 }}>
        {note ??
          '年額を年内の経過で按分した「ここまでの発生見込み」です。実際の課税・入金の時点とは一致しません。'}
        {' '}
        画面の刻みは {Math.round((Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_TICK_MS) / 100) / 10} 秒。
        元データの取り直しはこの刻みでは行いません (上流の API 上限を守るため)。
        タブを隠している間は止まり、戻ると追いつきます。
      </p>
    </div>
  );
}

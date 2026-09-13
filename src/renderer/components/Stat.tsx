/**
 * KPI Stat card — single-value tile used in business dashboards.
 *
 * Used by UberEatsPage / DemaeCanPage / RealEstatePage / MutualFundsPage
 * to render the "今週の売上 / 月次キャッシュフロー / 評価損益" grid at
 * the top of each page. Optional `positive` flips the color (green when
 * true, red when false) for gain/loss style values; leave undefined for
 * neutral display.
 */

/** 算定不能を表す印。画面はこの 1 文字で「値が無い」ことを言う。 */
export const UNDETERMINED = '—';

/**
 * `number | null` から `positive` を作る。**算定不能 (null / undefined) は色を付けない。**
 *
 * 呼び出し側が書きがちな `positive={(x ?? 0) >= 0}` は、`(null ?? 0) >= 0` が
 * `true` になるため**算定できなかった値を緑 (良好) に倒す**。色は値についての
 * 主張なので、値が無いときに主張してはいけない。
 */
export function positiveIfKnown(n: number | null | undefined): boolean | undefined {
  return n == null ? undefined : n >= 0;
}

export function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  // **「—」に色を付けない。** 呼び出し側の `positive` がどう計算されていても、
  // 刷る値が算定不能なら判定を捨てる —— 色だけが「良い / 悪い」と言い続ける形を
  // ここで止める (2026-09-08 · パス 91)。
  const judged = value === UNDETERMINED ? undefined : positive;
  return (
    <div style={cardStyle}>
      <div style={labelStyle}>{label}</div>
      <div
        style={{
          ...valueStyle,
          color: judged == null ? undefined : judged ? '#22c55e' : '#ef4444',
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

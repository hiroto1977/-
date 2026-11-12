import { ROW_WINDOW_STEP } from '../data/rowWindow';

/**
 * 一覧の窓 (`data/rowWindow.ts`) の「さらに表示」。残りが無ければ何も描かない。
 * 切り捨てではないことを文で言う (残りの件数・新しい順・押せば全部に届く)。
 */
export function RowWindowMore({ hidden, total, showMore }: { hidden: number; total: number; showMore: () => void }) {
  if (hidden <= 0) return null;
  const step = Math.min(ROW_WINDOW_STEP, hidden);
  return (
    <div data-row-window style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>
        新しい順に {(total - hidden).toLocaleString('ja-JP')} 件を表示しています (全 {total.toLocaleString('ja-JP')} 件・残り{' '}
        {hidden.toLocaleString('ja-JP')} 件)。
      </span>
      <button type="button" data-row-window-more onClick={showMore}>
        さらに {step.toLocaleString('ja-JP')} 件を表示
      </button>
    </div>
  );
}

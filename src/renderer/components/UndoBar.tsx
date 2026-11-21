/**
 * 消した直後の知らせと「元に戻す」。
 *
 * 行の「×」は確認の窓を出さずに消す (押す回数を増やさない) —— 代わりに、押し間違いを
 * その場で戻せるようにする。戻せるのは直前の 1 件だけで、控えは画面の状態に持つだけである
 * (保存しない)。出す・消すは呼ぶ側が決める。
 *
 * `line` は呼ぶ側が天井を通した文 (保管した値を素で渡さない)。
 */
export function UndoBar({ mark, line, busy, onUndo }: {
  /** どの一覧の知らせか (検査と実機が場所を取り違えないための印)。 */
  mark: string;
  line: string;
  busy: boolean;
  onUndo: () => void;
}) {
  return (
    <div
      role="status"
      data-undo-bar={mark}
      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, margin: '8px 0' }}
    >
      <span style={{ overflowWrap: 'anywhere' }}>消しました: {line}</span>
      <button type="button" onClick={onUndo} disabled={busy}>元に戻す</button>
    </div>
  );
}

/*
 * **一覧の描画に件数の天井を置く窓** (2026-10-19 · パス 538 · R-3)。
 *
 * 保管した行をそのまま `<tr>` に描く一覧は、行が増えるほど画面が止まる。CSV の取り込みは
 * 20 万行まで正当に通る (`MAX_CSV_IMPORT_ROWS`) ので、これは異常な入力ではなく**製品の通常の道**である。
 * 実測 (実 Chromium・実際の CSV 取り込み・売上集計): 5,000 行で一覧が出るまで 3.0 秒 (長いタスク 2.1 秒)・
 * 2 万行で 14 秒 (7.7 秒・DOM 16 万ノード)・10 万行で 95 秒 (43 秒・80 万ノード) で、取り込んだ後も
 * 描き直すたびに 1.6 秒かかり続けた。
 *
 * 直しは**窓**であって切り捨てではない —— 最初は新しい側の `ROW_WINDOW_STEP` 件だけを描き、
 * 残りは「さらに表示」で必ず全部に届く。切ると、隠れた行の個別の削除 (×) が画面から消える
 * (法則 `escape-hatch-stays-open`)。件数の見出し (`Section count`) は全件のまま。
 */

/** 最初に描く件数と、「さらに表示」1 回で足す件数 (実測: 200 行は jsdom で約 0.2 秒・実ブラウザで体感できない)。 */
export const ROW_WINDOW_STEP = 200;

export interface RowWindow<T> {
  /** いま描く行 (先頭から `shown` 件)。 */
  readonly visible: readonly T[];
  /** まだ描いていない件数 (0 なら全部)。 */
  readonly hidden: number;
  /** 全件の件数。 */
  readonly total: number;
}

/** 純関数: 先頭から `shown` 件を描く窓。`shown` が不正 (非有限・負) なら最初の 1 窓へ倒す。 */
export function windowRows<T>(rows: readonly T[], shown: number): RowWindow<T> {
  const n = Number.isFinite(shown) && shown >= ROW_WINDOW_STEP ? Math.floor(shown) : ROW_WINDOW_STEP;
  const visible = rows.length <= n ? rows : rows.slice(0, n);
  return { visible, hidden: rows.length - visible.length, total: rows.length };
}

/** 「さらに表示」を 1 回押した後の `shown`。 */
export function nextShown(shown: number): number {
  return (Number.isFinite(shown) && shown >= ROW_WINDOW_STEP ? Math.floor(shown) : ROW_WINDOW_STEP) + ROW_WINDOW_STEP;
}

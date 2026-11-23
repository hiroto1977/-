/**
 * **売上の記録を、新しいスプレッドシートへ書き出す表にする** (2026-11-22 · `drive/export-sheet`)。
 *
 * 行の出どころは CSV の書き出しと同じ欄 (日付・販売先・金額・注文の数・メモ) で、
 * **読める行だけ** (`readableSalesRows` —— 合計・月別の集計と同じ部分集合) を書き出す。
 * 読めない行は落とし、その件数を返す (画面が「N 件は書き出しません」と言う)。
 *
 * 表の天井 (`MAX_SHEET_ROWS`) を超えるときは**切らずに断る** —— 501 行目以降を黙って落とすと、
 * 利用者は全部を書き出したと思う。断りは CSV の書き出し (件数の上限が無い) を名指しする。
 */
import { CHANNEL_LABEL, isSalesChannel, readableSalesRows, salesNoteText, type SalesEntry } from './sales';
import { displayField, finiteNumberOf } from '../../shared/apiResponse';
import { MAX_SHEET_ROWS } from '../../shared/writeFieldLimits';
import type { SheetCell } from '../../shared/api/google';

/** 見出し (画面の入力欄と同じ言い方)。 */
export const SALES_SHEET_COLUMNS = ['日付', '販売先', '金額', '注文の数', 'メモ'] as const;

export interface SalesSheetPayload {
  readonly title: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly SheetCell[])[];
}

export type SalesSheetPlan =
  | { readonly kind: 'ready'; readonly payload: SalesSheetPayload; readonly dropped: number }
  | { readonly kind: 'empty'; readonly dropped: number }
  | { readonly kind: 'too-many'; readonly count: number; readonly dropped: number };

/** 1 行をセルの並びにする。メモが空なら空のセル (`null`)。 */
function salesSheetRow(e: SalesEntry): SheetCell[] {
  const note = salesNoteText(e);
  return [
    e.date,
    isSalesChannel(e.channel) ? CHANNEL_LABEL[e.channel] : displayField(e.channel),
    finiteNumberOf(e.amount),
    finiteNumberOf(e.orders),
    note === '' ? null : note,
  ];
}

/** 書き出す表を組む。`today` は表題に入れる日付 (`YYYY-MM-DD`)。行は日付の古い順。 */
export function planSalesSheet(entries: readonly SalesEntry[], today: string): SalesSheetPlan {
  const readable = readableSalesRows(entries);
  const dropped = readable.dropped;
  const count = readable.rows.length;
  if (count === 0) return { kind: 'empty', dropped };
  if (count > MAX_SHEET_ROWS) return { kind: 'too-many', count, dropped };
  const rows = [...readable.rows].sort((a, b) => a.date.localeCompare(b.date)).map(salesSheetRow);
  return { kind: 'ready', payload: { title: `売上の記録 (${today})`, columns: SALES_SHEET_COLUMNS, rows }, dropped };
}

/** 読めない行を書き出さないことを言う 1 文。落としていなければ `null`。 */
export function droppedFromSheetNote(dropped: number): string | null {
  // 件数は整数だけを文にする (`NaN` / `Infinity` を文章に埋めない —— 法則 `no-zero-fold` の隣の形)。
  return Number.isInteger(dropped) && dropped > 0 ? `日付・金額・注文の数が読めない ${dropped} 件は書き出しません。` : null;
}

/** 天井を超えたときの断り。 */
export function tooManyForSheetNote(count: number): string {
  return `スプレッドシートへ一度に書き出せるのは ${MAX_SHEET_ROWS} 件までです (いま ${count} 件)。すべてを書き出すときは「CSV エクスポート」を使ってください。`;
}

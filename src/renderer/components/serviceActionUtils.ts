/**
 * ServiceActionPanel の純粋ヘルパー。
 *
 * UI から切り離して単体テスト可能にするため、金額入力の正規化と
 * メモのサニタイズをここに集約する (PR #4 R2-2 / NIT)。
 *
 * 上限の既定値は `shared/recordEntryLimits.ts` の `MAX_RECORD_NOTE_CHARS` を
 * **読む** (2026-09-12 · パス 167)。それまで `maxLen = 2000` と字面で持っており、
 * 4 つの main handler とブラウザ版が定数を読んでいるのに、**画面側の 2 か所
 * (ここと `ServiceActionPanel.tsx` の `maxLength`) だけが写し**だった。
 */
import { clampToCeiling } from '../../shared/inputCeiling';
import { readNumeric } from '../../shared/readNumeric';
import { MAX_RECORD_NOTE_CHARS } from '../../shared/recordEntryLimits';

export type AmountParse =
  | { readonly ok: true; readonly value?: number }
  | { readonly ok: false };

/**
 * 金額入力を数にする。
 *
 * - 空文字は「金額なし」= `{ ok: true, value: undefined }`
 * - 読めなければ `{ ok: false }` (呼び手が画面へ断りを出す)
 *
 * **読み取りそのものは書かない** (2026-09-21 · パス 375)。以前はここに
 * 「全角化 → カンマと空白を**どこからでも**除去 → 厳格な 10 進数」の写しを持っており、
 * `shared/readNumeric.ts` と同じ入力に別の答えを返していた (実測 26 標本中 11):
 *
 * ```
 *   '5,000,00'  こちら 500000 / readNumeric null   桁区切りの位置が違う
 *   '30 000'    こちら 30000  / readNumeric null   空白区切り
 *   '1 2 3'     こちら 123    / readNumeric null   2 つの数の連結
 *   '500円'     こちら 断る   / readNumeric 500    単位つき
 * ```
 *
 * `TaxPage` は**関門 (`guardAll` → `GuardSummary`) を `readNumeric` で判定し、
 * ①課税所得 / ②額面年収 / 目標手取りの計算だけをこちらで読んでいた** ——
 * そのため「読み取れなかった欄は 0 として計算されています」と断りながら
 * ¥25,525 を出す (`'5,000,00'`)・⛔ を 1 つも出さずに ¥0 を出す (`'5,000,000円'`)
 * が両方起きていた。答えを決めるのは 1 つにし、ここは**返り値の形**
 * (未入力と読めないを分ける) だけを持つ。母集団は
 * `renderer/__tests__/numericInputReaderCensus.test.ts`。
 */
export function parseAmountInput(raw: string): AmountParse {
  if (raw.trim().length === 0) return { ok: true };
  const value = readNumeric(raw);
  return value === null ? { ok: false } : { ok: true, value };
}

/**
 * 保持する制御文字: タブ (U+0009) / 改行 (U+000A) / 復帰 (U+000D)。
 * それ以外の C0 (U+0000–U+001F) と DEL/C1 (U+007F–U+009F) は除去対象。
 */
function isStrippableControlChar(code: number): boolean {
  if (code === 0x09 || code === 0x0a || code === 0x0d) return false;
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/**
 * メモを保存前にサニタイズする (PR #4 NIT)。
 *
 * React は描画時に自動エスケープするため表示 XSS は無いが、
 * - NULL / 制御文字 (タブ・改行を除く C0/C1) は永続化前に除去
 * - 前後の空白を trim
 * - 上限長 (既定は `MAX_RECORD_NOTE_CHARS`) で切り詰め
 * しておくことで、後段 (Phase 6 の IndexedDB / 外部送信) での不正データを防ぐ。
 *
 * **切り詰めは最後の砦であって、画面の振る舞いではない。** 画面
 * (`ServiceActionPanel`) は天井を超えた入力を黙って落とさず、超えた字数を述べる
 * (パス 167)。ここまで来るのは、制御文字を抜いてもまだ天井を超えている入力だけ。
 */
export function sanitizeNote(raw: string, maxLen = MAX_RECORD_NOTE_CHARS): string {
  let stripped = '';
  for (const ch of raw) {
    if (!isStrippableControlChar(ch.charCodeAt(0))) stripped += ch;
  }
  // **切るのは文字境界で。** `slice` はコード単位で切るのでサロゲート対を割り、
  // 孤立サロゲート (`isWellFormed()` が false) を保存側へ渡していた (パス 195)。
  return clampToCeiling(stripped.trim(), maxLen);
}

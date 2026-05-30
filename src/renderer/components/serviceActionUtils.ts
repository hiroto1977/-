/**
 * ServiceActionPanel の純粋ヘルパー。
 *
 * UI から切り離して単体テスト可能にするため、金額入力の正規化と
 * メモのサニタイズをここに集約する (PR #4 R2-2 / NIT)。
 */

/** 全角英数記号 (U+FF01–U+FF5E) → 半角 (U+0021–U+007E) へ変換。 */
function toHalfWidth(input: string): string {
  return input.replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
}

export type AmountParse =
  | { readonly ok: true; readonly value?: number }
  | { readonly ok: false };

/**
 * 金額入力を locale 寛容にパースする。
 *
 * - 全角数字 (０-９) / 全角ピリオド / 全角マイナスを半角化
 * - 桁区切りカンマ (半角・全角) と空白を除去
 * - 空文字は「金額なし」= `{ ok: true, value: undefined }`
 * - 数値にならない場合は `{ ok: false }`
 */
export function parseAmountInput(raw: string): AmountParse {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true };

  const normalized = toHalfWidth(trimmed)
    .replace(/[,\s]/g, '') // 桁区切り・空白を除去
    .replace(/^\+/, ''); // 先頭の + は許容して除去

  if (normalized.length === 0) return { ok: false };

  const n = Number(normalized);
  if (!Number.isFinite(n)) return { ok: false };

  return { ok: true, value: n };
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
 * - 上限長 (既定 2000) で切り詰め
 * しておくことで、後段 (Phase 6 の IndexedDB / 外部送信) での不正データを防ぐ。
 */
export function sanitizeNote(raw: string, maxLen = 2000): string {
  let stripped = '';
  for (const ch of raw) {
    if (!isStrippableControlChar(ch.charCodeAt(0))) stripped += ch;
  }
  return stripped.trim().slice(0, maxLen);
}

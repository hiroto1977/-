/**
 * `ServiceActionPanel` の入力検証ヘルパ。
 *
 * UI コンポーネントから切り出して **純関数** として独立テスト可能に。
 * PR #4 NIT (note の XSS / control-char) と R2-2 (amount の locale 対応)
 * の対応として導入。
 */

const NULL_BYTE = String.fromCharCode(0);

/**
 * 取り除く制御文字かどうかを判定。
 *
 * 許容: タブ (U+0009) / LF (U+000A) / CR (U+000D)
 * 除去: C0 (U+0001-001F の上記以外) / C1 (U+007F-009F) /
 *       zero-width + bidi (U+200B-200F) / line-para sep (U+2028 / U+2029) /
 *       BOM (U+FEFF)
 *
 * U+0000 (NULL) はここでは対象外 — `sanitizeNote` が明示的に reject する。
 */
function isStrippableControlChar(code: number): boolean {
  if (code === 0x09 || code === 0x0a || code === 0x0d) return false;
  if (code >= 0x01 && code <= 0x1f) return true;
  if (code >= 0x7f && code <= 0x9f) return true;
  if (code >= 0x200b && code <= 0x200f) return true;
  if (code === 0x2028 || code === 0x2029) return true;
  if (code === 0xfeff) return true;
  return false;
}

/**
 * `note` フィールドのサニタイズ。
 *
 * 制御文字 (C0 / C1 / DEL / 不可視の bidi / zero-width 系) を取り除き、
 * サニタイズ済の文字列とエラー文言を返す。NULL バイトは silent strip だと
 * 改竄リスクがあるため明示的に reject。
 *
 * React の自動 escape により XSS 経路は遮断されているが、サーバが
 * echo back する / ログに出る / 永続化先 (Phase 6) で再描画される
 * 場面で control char が悪さする余地を defense-in-depth で断つ
 * (PR #4 NIT)。
 */
export function sanitizeNote(input: string): { value: string; error: string | null } {
  if (input.indexOf(NULL_BYTE) !== -1) {
    return { value: '', error: 'note に NULL バイトを含めることはできません' };
  }
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (isStrippableControlChar(code)) continue;
    out += ch;
  }
  return { value: out, error: null };
}

/**
 * `amount` 入力の locale 正規化。
 *
 * - 全角数字 (U+FF10-FF19) → 半角 (0-9)
 * - 全角ピリオド (U+FF0E) → 半角 `.`
 * - 全角カンマ (U+FF0C) → 半角 `,`
 * - 桁区切りカンマ + 空白を除去
 * - 結果が有限数なら数値、それ以外は `null`
 *
 * 日本語環境では「１，０００」や「1,000」を入力する人が多い。
 * `Number('1,000')` は `NaN` になるため事前正規化が必要 (PR #4 R2-2)。
 *
 * Note: 負号は通常 amount フィールドでは使われないため特別な扱いはしない
 * (ASCII `-` のみ Number() が解釈する)。
 */
export function normalizeAmount(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  let ascii = '';
  for (const ch of trimmed) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (code >= 0xff10 && code <= 0xff19) {
      ascii += String.fromCharCode(code - 0xff10 + 0x30);
    } else if (code === 0xff0e) {
      ascii += '.';
    } else if (code === 0xff0c) {
      ascii += ',';
    } else {
      ascii += ch;
    }
  }
  const stripped = ascii.replace(/[, \t]/g, '');
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

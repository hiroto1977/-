/**
 * ファイル名として受け取ってよい文字列か —— アプリ全体で 1 つだけ持つ。
 *
 * 同じ判断が `renderer/library/library.ts` と `renderer/fs/fsa.ts` に
 * **別々の規則で** 書かれていた (2026-08-22 に判明):
 *
 * ```
 *                  library.ts      fsa.ts
 *   '.' / '..'      通す           弾く
 *   '\'             通す           弾く
 *   '/' NUL CR LF   弾く           弾く
 *   長さ            1..256         1..256
 * ```
 *
 * 危ないのは、**この 2 つが同じ入力を並んで受け取っている**こと ——
 * `web-shim.ts` の `saveToLibrary` は 1 つの `filename` を
 * `library.put()` と `writeBlobToFolder()` の両方へ渡す。今日は実ファイルに
 * 触る側 (fsa) が厳しいので外へは出ないが、**入口が出口より緩い**状態は、
 * 「新しい書き出し経路が再検査を忘れた瞬間」に穴になる。
 *
 * 厳しい側に寄せて 1 つにした。緩める方向の統合はしない ——
 * `..` や `\` を含む正当なファイル名はこのアプリには無い。
 *
 * ## 何を弾くか
 *
 * - `.` と `..` ちょうど —— ディレクトリ自身を指す。書き込み先として渡ると
 *   「ファイル名」ではなくなる
 * - `/` と `\` —— パス区切り。1 階層ぶんの名前しか受け取らない契約を守る
 *   (Windows は `\` も区切りなので、POSIX だけを見て通すと片方だけ抜ける)
 * - NUL / CR / LF —— 名前の分断に使われうる
 * - 空と 256 字超 —— 大半のファイルシステムの上限
 *
 * 先頭ドット (`.hidden`) は**通す**。隠しファイルは書き出し先の中に作れて
 * 構わないし、弾くと `.gitignore` のような正当な名前まで落ちる。
 */
export const MAX_FILENAME_LENGTH = 256;

export function isSafeFilename(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  if (s === '.' || s === '..') return false;
  if (s.length === 0 || s.length > MAX_FILENAME_LENGTH) return false;
  return !/[\0\r\n/\\]/.test(s);
}

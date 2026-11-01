/**
 * 鍵が**本当に** OS のキーチェーンに在るか (2026-10-14 · パス 520 · threat: T-041)。
 *
 * `safeStorage` の「使えるか」は Linux で `basic_text` backend のときも **true** を返しうる
 * (Electron のドキュメント: basic_text は「ハードコードされた鍵」で、キーチェーンが無い環境へ
 * Chromium が倒す backend。`isEncryptionAvailable` は「暗号化の API が使えるか」であって
 * 「鍵が守られているか」ではない)。`secrets.ts` と `atRest.ts` はその答えで
 * ① 書く形 (封緘 / `plain:` の難読化) ② 設定画面の「OS キーチェーン」の札 ③ `plain:` の
 * 値を封緘へ「昇格」させるか を決めていたので、gnome-keyring も kwallet も無い Linux では
 * **ハードコードされた鍵で包んだ値を「OS キーチェーンで暗号化」と名乗っていた** ——
 * 利用者は守られているつもりで、userData を読める人は `basic_text` の鍵で全部開ける。
 * しかも `plain:` の警告 (`console.warn` と設定画面の ⚠) はこの形では**出ない**。
 *
 * 直し: 書く側と名乗る側はこの述語を通す。**読む側 (`decode` / `openAtRest`) は通さない** ——
 * basic_text で包んだ既存の値は basic_text で開けるので、読みまで止めると資格情報が消えて見える。
 * 次に書くときに `plain:` へ倒れ、画面は「この端末は暗号化できません」と正直に言う
 * (難読化の強さは basic_text と同じで、違うのは**名乗り**だけである)。
 *
 * `getSelectedStorageBackend` は Linux 専用 (他の OS は `unknown` を返す) で、代役が持たない
 * ことも在るので関数であるときだけ訊く。`unknown` は `app.ready` の前に返る値で、ここは
 * ready の後にしか呼ばれない —— 答えが読めないときは今までどおり暗号化 API の可否に従う。
 *
 * **非同期 (2026-10-23 · Electron 44 → 45 の準備)**: 同期の `isEncryptionAvailable` / `encryptString` /
 * `decryptString` は Electron 45 で非推奨・46 で削除される。可否は `isAsyncEncryptionAvailable()` で訊く。
 * ★ 実測 (Electron 44.9.3 · キーリングの無い Linux = `basic_text`): 同期は `false`、非同期は `true` を返す ——
 * 非同期は `basic_text` でも封緘できる。だからこの述語の `basic_text` の枝は**前より重い**: ここを通さずに
 * 非同期の可否だけで書くと、キーチェーンの無い環境でハードコードされた鍵の封緘を「OS キーチェーン」と名乗る。
 */
import { safeStorage } from 'electron';

/** Chromium が「鍵をハードコードした」backend を名乗る綴り (Electron の docs の値)。 */
export const HARDCODED_KEY_BACKEND = 'basic_text';

export async function realKeychainAvailable(): Promise<boolean> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) return false;
  if (process.platform !== 'linux') return true;
  const read = (safeStorage as { getSelectedStorageBackend?: () => string }).getSelectedStorageBackend;
  if (typeof read !== 'function') return true;
  return read.call(safeStorage) !== HARDCODED_KEY_BACKEND;
}

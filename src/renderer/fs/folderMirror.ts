/**
 * 書き出しを PC の指定フォルダへ写す —— **飛ばした理由・失敗した理由を返す。**
 *
 * 実測 (2026-09-06) の呼び出し側 (`web-shim.ts` の `saveToLibrary`) はこうだった:
 *
 * ```ts
 *   try {
 *     const loaded = await loadFolderHandle();
 *     if (loaded && loaded.permission === 'granted') {
 *       await writeBlobToFolder(loaded.handle, filename, blob);
 *     }
 *   } catch {
 *     // ignore — folder write is best-effort
 *   }
 * ```
 *
 * 問題は 2 つある。
 *
 * 1. **許可が `prompt` に戻っていると、試しもせず黙って飛ばす。**
 *    File System Access の許可はブラウザを再起動すると戻りうる（保管した handle は
 *    残るので設定画面は「フォルダあり」に見える）。つまりこれは異常時ではなく
 *    **普通に起きる状態**で、そのとき利用者は「自動保存します」と読んだまま
 *    1 バイトも書かれない。
 * 2. **`permission === 'unknown'` でも飛ばしていた。** `queryPermission` を持たない
 *    実装では状態が分からないだけで、書き込み自体は通りうる
 *    （`writeBlobToFolder` は内部で `ensurePermission` を通す）。
 *    「分からない」を「駄目」に丸めて、書ける環境で書かないでいた。
 *
 * ここは**判断だけ**を持ち、`load` / `write` は引数で受ける（単体で全経路を測る）。
 * 許可の再要求は**しない** —— `requestPermission` は利用者の操作を要するので、
 * 書き出しの裏で勝手に出すのではなく、設定画面の「権限を再取得」に任せる。
 */

import type { SinkOutcome } from '../data/exportOutcome';
import { loadFolderHandle, writeBlobToFolder } from './fsa';

/** 保管済み handle の読み出しと書き込み。実物は `REAL_MIRROR`。 */
export interface MirrorDeps {
  readonly load: () => Promise<{
    handle: FileSystemDirectoryHandle;
    permission: 'granted' | 'prompt' | 'denied' | 'unknown';
  } | null>;
  readonly write: (handle: FileSystemDirectoryHandle, filename: string, blob: Blob) => Promise<void>;
}

export const REAL_MIRROR: MirrorDeps = {
  load: loadFolderHandle,
  write: writeBlobToFolder,
};

/**
 * フォルダへ写す。**投げない。**
 *
 * - `off`         … フォルダ未設定 / 非対応ブラウザ（失敗ではないので警告も出さない）
 * - `permission`  … 許可が切れている（`prompt` / `denied`）。設定で取り直せば直る
 * - `failed`      … 書き込みが失敗した（フォルダが消えた・容量・名前が不正）
 * - `saved`       … 書けた
 */
export async function mirrorToFolder(
  deps: MirrorDeps,
  filename: string,
  blob: Blob,
): Promise<SinkOutcome> {
  let loaded: Awaited<ReturnType<MirrorDeps['load']>>;
  try {
    loaded = await deps.load();
  } catch {
    // handle の保管先 (IndexedDB) が読めない。フォルダ連携があるかどうかも
    // 分からないので、「設定していない」ではなく失敗として扱う。
    return 'failed';
  }
  if (loaded === null) return 'off';
  if (loaded.permission === 'prompt' || loaded.permission === 'denied') return 'permission';
  try {
    await deps.write(loaded.handle, filename, blob);
    return 'saved';
  } catch {
    return 'failed';
  }
}

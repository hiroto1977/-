// 生成物 —— src/renderer/fs/fsa.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * File System Access API wrapper.
 *
 * Chrome / Edge 86+ で対応。ユーザーが 1 回フォルダを許可すると、handle を IndexedDB に永続化し、以降のエクスポートは Library に加えて
 * その実フォルダにも書き込む。Safari / Firefox / file:// など非対応環境では `isFsaSupported()` = false。
 *
 * ## ファイル名の検査は `shared/safeFilename.ts` に 1 つだけ置いた
 *
 * 2026-08-22 まで、ここと `library/library.ts` に**別々の規則で**書かれていた —— library 側は `.` / `..` と `\` を通していた。
 * 危ないのは `web-shim.ts` の `saveToLibrary` が **1 つの filename を両方へ渡している**ことで、入口 (library) が出口 (ここ) より緩い状態は
 * 「新しい書き出し経路が再検査を忘れた瞬間」に穴になる。厳しい側へ寄せて統合した。
 *
 * ## 「利用者入力ではない」は偽である (2026-08-23 実測 · 2026-09-21 パス 362 でここにも反映)
 *
 * ここには長らく「渡ってくる名前はアプリが組み立てたもの (`service-hub-YYYYMMDD-HHMM.txt` など) で利用者入力ではないため、これは多層防御」と
 * 書いてあった。**2026-08-23 にその主張は偽と測られ、`shared/safeFilename.ts` では撤回されている** —— ところが**同じ文の写しがここに残り、
 * パス 362 まで誰も直さなかった**。撤回が 2 部のうち 1 部にしか届いていなかった。
 *
 * 実物の経路 (実測):
 *
 * ```
 *   teamradar の export-svg → filenameFromTitle(p.title, …)   ← p.title は画面で利用者が打つ
 *     → saveToLibrary('teamradar', filename, …)
 *       → mirrorToFolder(REAL_MIRROR, filename, blob)
 *         → REAL_MIRROR.write === writeBlobToFolder            ← 実ディスクへ書く
 * ```
 *
 * **今日この関門は破れない** —— `filenameFromTitle` が `[^\w.-]+` を `-` へ畳み、時刻の接尾辞が付くので `.` / `..` にもならず、
 * `writeBlobToFolder` はそれでも `isSafeFilename` を先に通す。危ないのは**説明のほう**である: 「入力は安全だからここは飾り」と読んだ次の人が、
 * この関門を緩める判断を**既に偽と分かっている前提**から下すことになる (`safeFilename.ts` がその危険を名指ししている)。
 *
 * 利用者の入力がここへ届くことは `folderMirrorUserInput.test.ts` が振る舞いで留める (綴りではなく経路を測るので、この文が再び古びても鳴る)。
 *
 * ## Mamori で書いてある (2026-11-10 · MG-063)
 *
 * 元は TypeScript。`window` (フォルダ選択の口) と `indexedDB` (handle の保管) は、判断を持たない小さな `fsaHost.ts` から読む ——
 * `window` は `extern pure global` にできず (T-249)、`indexedDB` は Mamori で宣言できない名前である。ここ (Mamori) に残るのは判断:
 * 対応しているか・**どの名前なら実フォルダへ書いてよいか** (`isSafeFilename`)・権限が無ければ断る・「選んでいない」(`null`) と
 * 「開けなかった」(投げる) を分ける・権限が分からなければ `'unknown'` のままにする。どの DB のどの鍵へ置くかもここが決めて host へ渡す。
 * 型の戻し (`as`) と `!` は消えた —— 口は `typeof … === 'function'` で絞り、権限の状態は DOM の型 (`PermissionState`) のまま受ける。
 */

import { isSafeFilename } from '../../shared/safeFilename';
import { hostDirectoryPicker, hostOpenDb, hostDeleteDb, hostPut, hostGetHandle, hostDelete } from './fsaHost';

const DB_NAME = 'business-hub-preferences';

const DB_VERSION = 1;

const STORE = 'kv';

const HANDLE_KEY = 'fsa-directory-handle';

export function isFsaSupported(): boolean {
  return typeof hostDirectoryPicker() === 'function';
}

/**
 * この保管層の DB を丸ごと消す (ハードリセット · 2026-09-09 · パス 136)。`vault.wipeAndReset` と同じ約束 ——
 * **必ず解決し、何が起きたかを返す**。他のタブが接続を掴んでいれば `blocked` (消えていない)。
 * 画面は保管庫の内部を触らない (`lint:forbidden`) ので、消すのもここ。呼ぶのは `security/eraseAll.ts`。
 */
export function deletePreferencesDatabase(): Promise<'deleted' | 'blocked' | 'failed'> {
  return hostDeleteDb(DB_NAME);
}

/** ユーザーにフォルダ選択ダイアログを出し、選ばれた handle を永続化する。 */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  const picker = hostDirectoryPicker();
  // Stryker disable next-line ConditionalExpression,StringLiteral: この番人を外しても picker が undefined で
  // 呼び出しが throw し、下の catch が null を返すため結果は同じ (等価変異)。
  if (typeof picker !== 'function') return null;
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await picker({ mode: 'readwrite' });
  } catch {
    // ユーザーがキャンセル
    return null;
  }
  const db = await hostOpenDb(DB_NAME, DB_VERSION, STORE);
  await hostPut(db, STORE, HANDLE_KEY, handle);
  db.close();
  return handle;
}

/**
 * 保管済み handle を取得 (再起動後)。permission の状態を併せて返す。
 *
 * **開けなければ投げる。**`null` は「フォルダを選んでいない」だけを意味する。
 *
 * 2026-09-06 まではここで `catch { return null; }` していた (「保存無しとして扱う」)。その `null` は上まで通り、`fs/folderMirror.ts` が
 * **「『設定していない』ではなく失敗として扱う」と決めて書いた分岐を素通り**して `off` になっていた —— `off` は警告を出さない側なので、
 * フォルダ連携をしている端末で書き込みが 1 バイトも行われないまま「書き出しました」と出る。区別を消したのは 1 つ下の層で、
 * 上の層はその差を見ることができなかった。設定画面も同じ `null` を見て「フォルダ未設定」の札を出していた。
 */
export async function loadFolderHandle(): Promise<{ handle: FileSystemDirectoryHandle; permission: 'granted' | 'prompt' | 'denied' | 'unknown' } | null> {
  if (!isFsaSupported()) return null;
  const db = await hostOpenDb(DB_NAME, DB_VERSION, STORE);
  const handle = await hostGetHandle(db, STORE, HANDLE_KEY);
  db.close();
  if (!handle) return null;
  let permission: 'granted' | 'prompt' | 'denied' | 'unknown' = 'unknown';
  // Stryker disable next-line ConditionalExpression: 番人を外しても `handle.queryPermission(...)` が
  // TypeError を投げ、下の catch が 'unknown' に落とすため結果は同じ (等価変異)。
  if (typeof handle.queryPermission === 'function') {
    try {
      permission = await handle.queryPermission({ mode: 'readwrite' });
    } catch {
      // 代入は要らない —— `permission` は 'unknown' で初期化してあるので、失敗したらそのままにするのが「分からない」の表現になる。
      // (代入を残すと同じ値を二重に書くことになり、変異検査でも差が出ない。)
    }
  }
  return { handle, permission };
}

/** permission が prompt の場合に再要求する。返値は 'granted' なら使用可。 */
export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<'granted' | 'denied'> {
  if (typeof handle.queryPermission === 'function') {
    const cur = await handle.queryPermission({ mode: 'readwrite' });
    if (cur === 'granted') return 'granted';
  }
  if (typeof handle.requestPermission === 'function') {
    const res = await handle.requestPermission({ mode: 'readwrite' });
    return res === 'granted' ? 'granted' : 'denied';
  }
  return 'denied';
}

/** 保管済み handle を削除 (連携解除)。 */
export async function clearFolderHandle(): Promise<void> {
  const db = await hostOpenDb(DB_NAME, DB_VERSION, STORE);
  await hostDelete(db, STORE, HANDLE_KEY);
  db.close();
}

/** handle 配下に blob を書き出す。permission チェック + atomic close は内部で実行。 */
export async function writeBlobToFolder(handle: FileSystemDirectoryHandle, filename: string, blob: Blob): Promise<void> {
  if (!isSafeFilename(filename)) {
    throw new Error('filename が不正です');
  }
  const perm = await ensurePermission(handle);
  if (perm !== 'granted') {
    throw new Error('フォルダへの書き込み権限が拒否されています');
  }
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

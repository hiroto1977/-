/**
 * File System Access API wrapper.
 *
 * Chrome / Edge 86+ で対応。ユーザーが 1 回フォルダを許可すると、handle を
 * IndexedDB に永続化し、以降のエクスポートは Library に加えてその実フォルダ
 * にも書き込む。
 *
 * Safari / Firefox / file:// など非対応環境では isSupported() = false。
 */

// IDB infra + filename validation + permission API. 16 unit tests cover
// the public contract (feature detection / cancel / permission state /
// write happy-path / 5 filename rejections / denied permission).
// IndexedDB persistence happy-path is excluded from unit tests because
// fake-indexeddb cannot structured-clone vitest function mocks; covered
// by the standalone HTML smoke test instead.
const DB_NAME = 'business-hub-preferences';
const DB_VERSION = 1;
const STORE = 'kv';
const HANDLE_KEY = 'fsa-directory-handle';

import { isSafeFilename } from '../../shared/safeFilename';

interface FsaWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

declare global {
  interface FileSystemDirectoryHandle {
    queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  }
}

export function isFsaSupported(): boolean {
  // Stryker disable next-line ConditionalExpression,StringLiteral: テストは jsdom で走るため
  // window は必ず存在し、無い側 (Node からの import) を再現できない。
  return typeof window !== 'undefined' && typeof (window as FsaWindow).showDirectoryPicker === 'function';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Stryker disable next-line ConditionalExpression: DB_VERSION が上がらない限り
      // onupgradeneeded は新規作成時にしか走らず contains は常に false (等価変異)。
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    req.onerror = () => reject(req.error ?? new Error('preferences open failed'));
  });
}

/** ユーザーにフォルダ選択ダイアログを出し、選ばれた handle を永続化する。 */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  // Stryker disable next-line ConditionalExpression: この番人を外しても picker が undefined で
  // 呼び出しが throw し、下の catch が null を返すため結果は同じ (等価変異)。
  if (!isFsaSupported()) return null;
  const picker = (window as FsaWindow).showDirectoryPicker!;
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await picker({ mode: 'readwrite' });
  } catch {
    return null; // ユーザーがキャンセル
  }
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(handle, HANDLE_KEY);
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    tx.onerror = () => rej(tx.error ?? new Error('store failed'));
  });
  db.close();
  return handle;
}

/**
 * 保管済み handle を取得 (再起動後)。permission の状態を併せて返す。
 *
 * **開けなければ投げる。**`null` は「フォルダを選んでいない」だけを意味する。
 *
 * 2026-09-06 まではここで `catch { return null; }` していた (「保存無しとして
 * 扱う」)。その `null` は上まで通り、`fs/folderMirror.ts` が
 * **「『設定していない』ではなく失敗として扱う」と決めて書いた分岐を素通り**して
 * `off` になっていた —— `off` は警告を出さない側なので、フォルダ連携をしている
 * 端末で書き込みが 1 バイトも行われないまま「書き出しました」と出る。
 * 区別を消したのは 1 つ下の層で、上の層はその差を見ることができなかった。
 * 設定画面も同じ `null` を見て「フォルダ未設定」の札を出していた。
 */
export async function loadFolderHandle(): Promise<{
  handle: FileSystemDirectoryHandle;
  permission: 'granted' | 'prompt' | 'denied' | 'unknown';
} | null> {
  if (!isFsaSupported()) return null;
  const db = await openDb();
  const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(HANDLE_KEY);
    req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    req.onerror = () => reject(req.error ?? new Error('get failed'));
  });
  db.close();
  if (!handle) return null;
  let permission: 'granted' | 'prompt' | 'denied' | 'unknown' = 'unknown';
  // Stryker disable next-line ConditionalExpression: 番人を外しても `handle.queryPermission(...)` が
  // TypeError を投げ、下の catch が 'unknown' に落とすため結果は同じ (等価変異)。
  if (typeof handle.queryPermission === 'function') {
    try {
      permission = (await handle.queryPermission({ mode: 'readwrite' })) as 'granted' | 'prompt' | 'denied';
    } catch {
      // 代入は要らない — `permission` は 'unknown' で初期化してあるので、
      // 失敗したらそのままにするのが「分からない」の表現になる。
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
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(HANDLE_KEY);
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    tx.onerror = () => rej(tx.error ?? new Error('delete failed'));
  });
  db.close();
}

/*
 * ファイル名の検査は `shared/safeFilename.ts` に 1 つだけ置いた。
 *
 * 2026-08-22 まで、ここと `library/library.ts` に**別々の規則で**書かれて
 * いた —— library 側は `.` / `..` と `\` を通していた。危ないのは
 * `web-shim.ts` の `saveToLibrary` が **1 つの filename を両方へ渡している**
 * ことで、入口 (library) が出口 (ここ) より緩い状態は「新しい書き出し経路が
 * 再検査を忘れた瞬間」に穴になる。厳しい側へ寄せて統合した。
 *
 * (渡ってくる名前はアプリが組み立てたもの (`service-hub-YYYYMMDD-HHMM.txt`
 *  など) で利用者入力ではないため、これは多層防御。)
 */


/** handle 配下に blob を書き出す。permission チェック + atomic close は内部で実行。 */
export async function writeBlobToFolder(
  handle: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob,
): Promise<void> {
  if (!isSafeFilename(filename)) throw new Error('filename が不正です');
  const perm = await ensurePermission(handle);
  if (perm !== 'granted') throw new Error('フォルダへの書き込み権限が拒否されています');
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

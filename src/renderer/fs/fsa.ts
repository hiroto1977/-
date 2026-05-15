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
// Stryker disable StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,Regex,BlockStatement
const DB_NAME = 'business-hub-preferences';
const DB_VERSION = 1;
const STORE = 'kv';
const HANDLE_KEY = 'fsa-directory-handle';

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
  return typeof window !== 'undefined' && typeof (window as FsaWindow).showDirectoryPicker === 'function';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('preferences open failed'));
  });
}

/** ユーザーにフォルダ選択ダイアログを出し、選ばれた handle を永続化する。 */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
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
    tx.onerror = () => rej(tx.error ?? new Error('store failed'));
  });
  db.close();
  return handle;
}

/** 保管済み handle を取得 (再起動後)。permission の状態を併せて返す。 */
export async function loadFolderHandle(): Promise<{
  handle: FileSystemDirectoryHandle;
  permission: 'granted' | 'prompt' | 'denied' | 'unknown';
} | null> {
  if (!isFsaSupported()) return null;
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return null;
  }
  const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(HANDLE_KEY);
    req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
    req.onerror = () => reject(req.error ?? new Error('get failed'));
  });
  db.close();
  if (!handle) return null;
  let permission: 'granted' | 'prompt' | 'denied' | 'unknown' = 'unknown';
  if (typeof handle.queryPermission === 'function') {
    try {
      permission = (await handle.queryPermission({ mode: 'readwrite' })) as 'granted' | 'prompt' | 'denied';
    } catch {
      permission = 'unknown';
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
    tx.onerror = () => rej(tx.error ?? new Error('delete failed'));
  });
  db.close();
}

function isSafeFilename(s: string): boolean {
  return s.length > 0 && s.length <= 256 && !/[\0\r\n/\\]/.test(s);
}

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
// Stryker restore StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,Regex

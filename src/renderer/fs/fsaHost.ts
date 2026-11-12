/**
 * File System Access の書き出し口 (fsa.mamori) が使う host の口。`extern pure { … } from "./fsaHost"` で読む。
 *
 * 判断は持たない —— 「対応しているか」「どの名前なら書いてよいか」「権限が無ければ断る」は fsa.mamori にある。
 * ここに置くのは Mamori に書けない据え付けだけ:
 * - `window` は網・記憶・移動・DOM の口をメンバに持つので、Mamori では `extern pure global` にできない (T-249)。
 *   フォルダ選択の口 (`showDirectoryPicker`) を**取り出して返す**だけで、呼ぶのは fsa.mamori である。
 * - `indexedDB` は記憶の口で、Mamori では宣言できない名前である。開く・消す・1 件置く / 読む / 消すの 5 つを、
 *   DB の名前・版・ストア・鍵を**引数で受けて**行う (どの DB のどの鍵かは fsa.mamori が決める)。
 * - 型の戻し (`as`) と、DOM の型に無い欄 (`queryPermission` / `requestPermission`) の宣言もここに閉じ込める。
 *
 * IndexedDB への保存の成功経路は単体検査の外にある (fake-indexeddb は vitest の関数 mock を structured clone できない)。
 * 配布する単一 HTML の smoke 検査が持つ。
 */

/** フォルダ選択ダイアログの口。 */
export type DirectoryPicker = (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;

interface FsaWindow extends Window {
  showDirectoryPicker?: DirectoryPicker;
}

declare global {
  interface FileSystemDirectoryHandle {
    queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  }
}

/** フォルダ選択の口を取り出す (非ブラウザ・非対応なら undefined)。呼ばない —— 呼ぶのは fsa.mamori。 */
export function hostDirectoryPicker(): DirectoryPicker | undefined {
  // 非ブラウザ (Node からの import) では `window` が無い。無い側は fsaHost.test.ts が `vi.stubGlobal` で作って測る。
  if (typeof window === 'undefined') return undefined;
  return (window as FsaWindow).showDirectoryPicker;
}

/** DB を開く。無ければストアを 1 つ作る。 */
export function hostOpenDb(name: string, version: number, store: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Stryker disable next-line ConditionalExpression: 版が上がらない限り
      // onupgradeneeded は新規作成時にしか走らず contains は常に false (等価変異)。
      if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    };
    req.onsuccess = () => resolve(req.result);
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    req.onerror = () => reject(req.error ?? new Error('preferences open failed'));
  });
}

/** DB を丸ごと消す。**必ず解決し、何が起きたかを返す** —— 他のタブが接続を掴んでいれば `blocked` (消えていない)。 */
export function hostDeleteDb(name: string): Promise<'deleted' | 'blocked' | 'failed'> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve('deleted');
    req.onerror = () => resolve('failed');
    req.onblocked = () => resolve('blocked');
  });
}

/** 1 件置く。取引が終わるまで待つ。 */
export function hostPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
  return new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    tx.onerror = () => rej(tx.error ?? new Error('store failed'));
  });
}

/** 保管したフォルダの handle を読む (無ければ undefined)。型の戻しはここだけ —— 置くのは `hostPut` に渡した handle だけである。 */
export function hostGetHandle(db: IDBDatabase, store: string, key: string): Promise<FileSystemDirectoryHandle | undefined> {
  return new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    req.onerror = () => reject(req.error ?? new Error('get failed'));
  });
}

/** 1 件消す。取引が終わるまで待つ。 */
export function hostDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    tx.onerror = () => rej(tx.error ?? new Error('delete failed'));
  });
}

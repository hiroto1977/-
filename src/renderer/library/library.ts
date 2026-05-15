/**
 * In-app Library — IndexedDB-backed storage for export artifacts.
 *
 * BROWSER_REDESIGN.md §3.2 の実装。「保存先フォルダを開く」を完全に
 * 廃止し、エクスポート結果をアプリ内ライブラリで管理する。
 *
 * 保存上限: 50 MB / 100 件超過時に古いものから自動削除。
 */

const DB_NAME = 'business-hub-library';
const DB_VERSION = 1;
const STORE = 'items';
const MAX_ITEMS = 100;
const MAX_BYTES = 50 * 1024 * 1024;

export interface LibraryItem {
  readonly id: string;
  readonly filename: string;
  readonly mime: string;
  readonly serviceId: string;
  readonly createdAt: number;
  readonly size: number;
  readonly blob: Blob;
}

export interface LibraryItemMeta {
  readonly id: string;
  readonly filename: string;
  readonly mime: string;
  readonly serviceId: string;
  readonly createdAt: number;
  readonly size: number;
}

export interface Library {
  put(serviceId: string, filename: string, mime: string, blob: Blob): Promise<LibraryItemMeta>;
  list(): Promise<readonly LibraryItemMeta[]>;
  get(id: string): Promise<LibraryItem | null>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  totalBytes(): Promise<number>;
}

// --- IndexedDB helpers ------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('library open failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('library tx failed'));
    tx.onabort = () => reject(tx.error ?? new Error('library tx aborted'));
  });
}

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  // RFC 4122 v4-ish — Uint8Array indices are always defined for known length.
  const b6 = b[6] ?? 0;
  const b8 = b[8] ?? 0;
  b[6] = (b6 & 0x0f) | 0x40;
  b[8] = (b8 & 0x3f) | 0x80;
  const hex = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isSafeFilename(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0 && s.length <= 256 && !/[\0\r\n/]/.test(s);
}
function isSafeMime(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0 && s.length <= 128 && !/[\0\r\n]/.test(s);
}
function isSafeServiceId(s: unknown): s is string {
  return typeof s === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(s);
}

class IndexedDBLibrary implements Library {
  async put(serviceId: string, filename: string, mime: string, blob: Blob): Promise<LibraryItemMeta> {
    if (!isSafeServiceId(serviceId)) throw new Error('serviceId が不正です');
    if (!isSafeFilename(filename)) throw new Error('filename が不正です');
    if (!isSafeMime(mime)) throw new Error('mime が不正です');
    if (!(blob instanceof Blob)) throw new Error('blob が不正です');
    if (blob.size === 0) throw new Error('空のファイルは保存できません');
    if (blob.size > MAX_BYTES) throw new Error('ファイルが大きすぎます (50 MB 超)');

    const item: LibraryItem = {
      id: uuid(),
      filename,
      mime,
      serviceId,
      createdAt: Date.now(),
      size: blob.size,
      blob,
    };
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(item);
    await txDone(tx);
    db.close();
    await this.enforceLimits();
    return {
      id: item.id,
      filename: item.filename,
      mime: item.mime,
      serviceId: item.serviceId,
      createdAt: item.createdAt,
      size: item.size,
    };
  }

  async list(): Promise<readonly LibraryItemMeta[]> {
    const db = await openDb();
    const out: LibraryItemMeta[] = [];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index('createdAt').openCursor(null, 'prev');
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          const v = cur.value as LibraryItem;
          out.push({
            id: v.id,
            filename: v.filename,
            mime: v.mime,
            serviceId: v.serviceId,
            createdAt: v.createdAt,
            size: v.size,
          });
          cur.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error ?? new Error('cursor failed'));
    });
    db.close();
    return out;
  }

  async get(id: string): Promise<LibraryItem | null> {
    if (typeof id !== 'string' || id.length === 0) return null;
    const db = await openDb();
    const item = await new Promise<LibraryItem | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as LibraryItem | undefined);
      req.onerror = () => reject(req.error ?? new Error('get failed'));
    });
    db.close();
    return item ?? null;
  }

  async remove(id: string): Promise<void> {
    if (typeof id !== 'string' || id.length === 0) return;
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
    db.close();
  }

  async clear(): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await txDone(tx);
    db.close();
  }

  async totalBytes(): Promise<number> {
    const items = await this.list();
    return items.reduce((acc, it) => acc + it.size, 0);
  }

  /** 上限超過時に古いものから削除。put() の後で呼ぶ。 */
  private async enforceLimits(): Promise<void> {
    const all = await this.list(); // sorted newest-first
    let total = all.reduce((acc, it) => acc + it.size, 0);
    let count = all.length;
    // Iterate from oldest (end of array) and remove until under both limits.
    for (let i = all.length - 1; i >= 0 && (count > MAX_ITEMS || total > MAX_BYTES); i--) {
      const it = all[i]!;
      await this.remove(it.id);
      total -= it.size;
      count -= 1;
    }
  }
}

let singleton: Library | null = null;
export function getLibrary(): Library {
  if (!singleton) singleton = new IndexedDBLibrary();
  return singleton;
}

export function _resetLibraryForTests(): void {
  singleton = null;
}

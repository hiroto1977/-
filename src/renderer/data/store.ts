/**
 * Local record store — IndexedDB-backed persistence for structured business
 * data (sales entries, customers, tasks, …). This is the foundation layer
 * the dashboard reads from instead of static snapshots.
 *
 * Design:
 *   - One IndexedDB object store keyed by a synthetic `id`.
 *   - Every record carries a `collection` discriminator + `createdAt` /
 *     `updatedAt`, so many logical tables live in one physical store and an
 *     index on `collection` keeps per-collection scans cheap.
 *   - Values are plain JSON (structured-clonable); no Blobs here — binary
 *     artifacts belong in `library/library.ts`.
 *
 * Mirrors the conventions of `library/library.ts` (singleton accessor,
 * `_resetForTests`, monotonic timestamps, Stryker-disabled boilerplate) so
 * the two persistence modules stay consistent.
 */

import { IDENTITY_CIPHER, type RecordCipher } from './recordCipher';

const DB_NAME = 'business-hub-data';
const DB_VERSION = 1;
// Stryker disable next-line StringLiteral: 定義と参照が同じ定数を通るため、値を変えても create↔access が往復して観測差が出ない（等価変異）。
const STORE = 'records';
// Stryker disable next-line StringLiteral: 同上。索引名は作成時と参照時の両方がこの定数を通る。
const COLLECTION_INDEX = 'collection';

/** A stored record. `T` is the caller's payload shape. */
export interface StoredRecord<T = Record<string, unknown>> {
  readonly id: string;
  readonly collection: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly data: T;
}

export interface RecordStore {
  /** Insert a new record into `collection`; returns the stored record. */
  insert<T extends Record<string, unknown>>(collection: string, data: T): Promise<StoredRecord<T>>;
  /** Insert many records into `collection` in a **single transaction** —
   *  all rows commit together or none do (atomic bulk import; no partial
   *  writes on failure). Validates every row up front. */
  insertMany<T extends Record<string, unknown>>(
    collection: string,
    rows: readonly T[],
  ): Promise<readonly StoredRecord<T>[]>;
  /** Shallow-merge `patch` into an existing record's `data`. Returns the
   *  updated record, or null if `id` doesn't exist. */
  update<T extends Record<string, unknown>>(
    id: string,
    patch: Partial<T>,
  ): Promise<StoredRecord<T> | null>;
  get<T extends Record<string, unknown>>(id: string): Promise<StoredRecord<T> | null>;
  /** All records in a collection, newest-first. */
  list<T extends Record<string, unknown>>(collection: string): Promise<readonly StoredRecord<T>[]>;
  remove(id: string): Promise<void>;
  /** Delete every record in a collection; returns how many were removed. */
  clearCollection(collection: string): Promise<number>;
  count(collection: string): Promise<number>;
  /** Dump every record across all collections (newest-first). For backup.
   *  Returns records **as stored** (encrypted payloads stay encrypted). */
  exportAll(): Promise<readonly StoredRecord[]>;
  /** Restore records from a backup. `replace` clears the store first; the
   *  default merges (existing ids are overwritten). Returns the count
   *  imported. */
  importAll(records: readonly StoredRecord[], opts?: { replace?: boolean }): Promise<number>;
  /** Install a save-time encryption layer for record `data`. Default is the
   *  identity cipher (plaintext). After switching to an encrypting cipher,
   *  call `reencryptAll()` to convert existing plaintext records. */
  configureCipher(cipher: RecordCipher): void;
  /** Re-write every record so its payload is sealed under the **current**
   *  cipher. `from` is the cipher used to read existing payloads (defaults to
   *  the current cipher); pass the old cipher when switching keys or turning
   *  encryption off (decrypt with `from`, re-store under the current cipher).
   *  Returns the count migrated. */
  reencryptAll(from?: RecordCipher): Promise<number>;
}

// --- validation ----------------------------------------------------------

function isSafeCollection(s: unknown): s is string {
  return typeof s === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(s);
}

/** Reject anything that won't survive IndexedDB's structured clone, and
 *  guard against accidental class instances / functions sneaking in. */
function isPlainJsonObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

// --- IndexedDB helpers ----------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Stryker disable next-line ConditionalExpression: DB_VERSION が 1 のあいだ onupgradeneeded は新規作成時にしか走らず contains は常に false。将来のバージョン上げに備えた防御なので残す（等価変異）。
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        // Stryker disable next-line ObjectLiteral: unique の既定値が false なので `{}` との差が無い（等価変異）。明示のため書いている。
        store.createIndex(COLLECTION_INDEX, 'collection', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では読み出し要求を失敗させられず、`?? new Error(...)` は req.error が必ず入るため到達しない防御。文言も観測されない。
    req.onerror = () => reject(req.error ?? new Error('data store open failed'));
  });
}

/**
 * 接続を開き、処理が失敗しても**必ず閉じる**。
 *
 * 元は各メソッドが `const db = await openDb(); ... await txDone(tx); db.close();`
 * と書いており、`txDone` が reject すると `db.close()` に到達しなかった。
 * 書き込みが失敗するたびに IndexedDB の接続が残り、溜まると以後の
 * バージョン変更や削除が blocked になる。11 箇所すべて同じ形だったので、
 * 覚えておく規約ではなく構造で閉じる。
 */
async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: onerror と onabort は中断時に両方発火するため、片方だけを潰しても他方が reject して観測差が出ない。用途は異なる（明示 abort では onabort のみ）ので両方要る。
    tx.onerror = () => reject(tx.error ?? new Error('data store tx failed'));
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: 同上（onerror と対）。
    tx.onabort = () => reject(tx.error ?? new Error('data store tx aborted'));
  });
}

let _lastTs = 0;
function monotonicNow(): number {
  const now = Date.now();
  _lastTs = Math.max(_lastTs + 1, now);
  return _lastTs;
}

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // フォールバック (randomUUID の無い古い WebView)。version/variant のビットは
  // 走査中に立てる — 添字で取り出すと `noUncheckedIndexedAccess` のために
  // 到達しない `?? 0` が要り、それが測れない分岐として残るため。
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n, i) => {
    const v = i === 6 ? (n & 0x0f) | 0x40 : i === 8 ? (n & 0x3f) | 0x80 : n;
    return v.toString(16).padStart(2, '0');
  }).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

class IndexedDBRecordStore implements RecordStore {
  /** Save-time encryption layer. Default = plaintext (identity). */
  private cipher: RecordCipher = IDENTITY_CIPHER;

  configureCipher(cipher: RecordCipher): void {
    this.cipher = cipher;
  }

  async insert<T extends Record<string, unknown>>(collection: string, data: T): Promise<StoredRecord<T>> {
    if (!isSafeCollection(collection)) throw new Error('collection が不正です');
    if (!isPlainJsonObject(data)) throw new Error('data はプレーンなオブジェクトである必要があります');

    const ts = monotonicNow();
    const id = uuid();
    // Store the (possibly encrypted) payload; return the plaintext to the caller.
    const storedData = await this.cipher.encrypt(data);
    await withDb(async (db) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add({ id, collection, createdAt: ts, updatedAt: ts, data: storedData });
      await txDone(tx);
    });
    return { id, collection, createdAt: ts, updatedAt: ts, data };
  }

  async insertMany<T extends Record<string, unknown>>(
    collection: string,
    rows: readonly T[],
  ): Promise<readonly StoredRecord<T>[]> {
    if (!isSafeCollection(collection)) throw new Error('collection が不正です');
    // Validate ALL rows before touching the DB — reject the whole batch on a
    // single bad row rather than importing a partial set.
    for (const r of rows) {
      if (!isPlainJsonObject(r)) throw new Error('data はプレーンなオブジェクトである必要があります');
    }
    if (rows.length === 0) return [];

    // Build + encrypt every record before opening the transaction (IndexedDB
    // transactions auto-close across awaits, so all async work happens first).
    const built = await Promise.all(
      rows.map(async (data) => {
        const ts = monotonicNow();
        const id = uuid();
        const stored = { id, collection, createdAt: ts, updatedAt: ts, data: await this.cipher.encrypt(data) };
        const plain: StoredRecord<T> = { id, collection, createdAt: ts, updatedAt: ts, data };
        return { stored, plain };
      }),
    );

    await withDb(async (db) => {
      const tx = db.transaction(STORE, 'readwrite');
      const objStore = tx.objectStore(STORE);
      for (const b of built) objStore.add(b.stored);
      // One transaction: if any add fails the tx aborts and txDone rejects —
      // nothing is committed (all-or-nothing).
      await txDone(tx);
    });
    return built.map((b) => b.plain);
  }

  async update<T extends Record<string, unknown>>(
    id: string,
    patch: Partial<T>,
  ): Promise<StoredRecord<T> | null> {
    // Stryker disable next-line ConditionalExpression: この先の get() が同じガードを持つため、外しても戻り値は null のままで観測差が出ない（等価変異）。get() の内部実装に依存しないための防御として残す。
    if (typeof id !== 'string' || id.length === 0) return null;
    if (!isPlainJsonObject(patch)) throw new Error('patch はプレーンなオブジェクトである必要があります');

    const existing = await this.get<T>(id); // get() decrypts
    if (!existing) return null;

    const mergedData = { ...existing.data, ...patch };
    const updatedAt = monotonicNow();
    const storedData = await this.cipher.encrypt(mergedData);
    await withDb(async (db) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ id, collection: existing.collection, createdAt: existing.createdAt, updatedAt, data: storedData });
      await txDone(tx);
    });
    return { ...existing, updatedAt, data: mergedData };
  }

  async get<T extends Record<string, unknown>>(id: string): Promise<StoredRecord<T> | null> {
    if (typeof id !== 'string' || id.length === 0) return null;
    const rec = await withDb((db) => new Promise<StoredRecord<T> | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as StoredRecord<T> | undefined);
      // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では読み出し要求を失敗させられず、`?? new Error(...)` は req.error が必ず入るため到達しない防御。文言も観測されない。
      req.onerror = () => reject(req.error ?? new Error('get failed'));
    }));
    if (!rec) return null;
    const data = (await this.cipher.decrypt(rec.data)) as T;
    return { ...rec, data };
  }

  async list<T extends Record<string, unknown>>(collection: string): Promise<readonly StoredRecord<T>[]> {
    if (!isSafeCollection(collection)) throw new Error('collection が不正です');
    const out: StoredRecord<T>[] = [];
    await withDb((db) => new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const range = IDBKeyRange.only(collection);
      const req = tx.objectStore(STORE).index(COLLECTION_INDEX).openCursor(range);
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          out.push(cur.value as StoredRecord<T>);
          cur.continue();
        } else {
          resolve();
        }
      };
      // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では読み出し要求を失敗させられず、`?? new Error(...)` は req.error が必ず入るため到達しない防御。文言も観測されない。
      req.onerror = () => reject(req.error ?? new Error('cursor failed'));
    }));
    // Newest-first. The collection index isn't ordered by time, so sort here.
    out.sort((a, b) => b.createdAt - a.createdAt);
    // Decrypt each payload through the active cipher.
    for (const rec of out) {
      (rec as { data: unknown }).data = await this.cipher.decrypt(rec.data);
    }
    return out;
  }

  async remove(id: string): Promise<void> {
    if (typeof id !== 'string' || id.length === 0) return;
    await withDb(async (db) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      await txDone(tx);
    });
  }

  async clearCollection(collection: string): Promise<number> {
    const all = await this.list(collection);
    await withDb(async (db) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const rec of all) store.delete(rec.id);
      await txDone(tx);
    });
    return all.length;
  }

  async count(collection: string): Promise<number> {
    if (!isSafeCollection(collection)) throw new Error('collection が不正です');
    return withDb((db) => new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index(COLLECTION_INDEX).count(IDBKeyRange.only(collection));
      req.onsuccess = () => resolve(req.result);
      // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では読み出し要求を失敗させられず、`?? new Error(...)` は req.error が必ず入るため到達しない防御。文言も観測されない。
      req.onerror = () => reject(req.error ?? new Error('count failed'));
    }));
  }

  async exportAll(): Promise<readonly StoredRecord[]> {
    const all = await withDb((db) => new Promise<StoredRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      // Stryker disable next-line ArrayDeclaration: getAll() の result は仕様上必ず配列を返すため `?? []` は到達不能な防御フォールバック。`["..."]` への変異は観測できない（等価変異）。
      req.onsuccess = () => resolve((req.result as StoredRecord[]) ?? []);
      // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では読み出し要求を失敗させられず、`?? new Error(...)` は req.error が必ず入るため到達しない防御。文言も観測されない。
      req.onerror = () => reject(req.error ?? new Error('exportAll failed'));
    }));
    all.sort((a, b) => b.createdAt - a.createdAt);
    return all;
  }

  async importAll(records: readonly StoredRecord[], opts?: { replace?: boolean }): Promise<number> {
    const valid = records.filter(isValidStoredRecord);
    await withDb(async (db) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      if (opts?.replace) store.clear();
      for (const rec of valid) store.put(rec); // put = upsert by id
      await txDone(tx);
    });
    return valid.length;
  }

  async reencryptAll(from?: RecordCipher): Promise<number> {
    // Read every record through `from` (defaults to the current cipher), then
    // re-write its payload sealed under the current cipher. A distinct `from`
    // lets callers switch keys or turn encryption off (decrypt with the old
    // cipher, store under the new one).
    const reader = from ?? this.cipher;
    const raw = await withDb((db) => new Promise<StoredRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      // Stryker disable next-line ArrayDeclaration: getAll() の result は仕様上必ず配列を返すため `?? []` は到達不能な防御フォールバック。`["..."]` への変異は観測できない（等価変異）。
      req.onsuccess = () => resolve((req.result as StoredRecord[]) ?? []);
      // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では読み出し要求を失敗させられず、`?? new Error(...)` は req.error が必ず入るため到達しない防御。文言も観測されない。
      req.onerror = () => reject(req.error ?? new Error('reencryptAll read failed'));
    }));

    let migrated = 0;
    for (const rec of raw) {
      const plain = await reader.decrypt(rec.data);
      const sealed = await this.cipher.encrypt(plain);
      await withDb(async (db2) => {
        const tx = db2.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ ...rec, data: sealed });
        await txDone(tx);
      });
      migrated++;
    }
    return migrated;
  }
}

/** Validate a record coming from an untrusted backup file before it's
 *  written back into IndexedDB. Drops anything malformed rather than throwing
 *  so a partly-corrupt backup still restores its good records. */
function isValidStoredRecord(v: unknown): v is StoredRecord {
  if (!isPlainJsonObject(v)) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    isSafeCollection(r.collection) &&
    typeof r.createdAt === 'number' &&
    typeof r.updatedAt === 'number' &&
    isPlainJsonObject(r.data)
  );
}

let singleton: RecordStore | null = null;
export function getRecordStore(): RecordStore {
  if (!singleton) singleton = new IndexedDBRecordStore();
  return singleton;
}

export function _resetRecordStoreForTests(): void {
  singleton = null;
}

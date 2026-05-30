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

// Stryker disable StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,Regex,ArithmeticOperator,AssignmentOperator,BlockStatement,UpdateOperator
const DB_NAME = 'business-hub-data';
const DB_VERSION = 1;
const STORE = 'records';
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
  /** Re-write every record through the current cipher (plaintext → encrypted,
   *  or vice-versa). Returns the count migrated. */
  reencryptAll(): Promise<number>;
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
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex(COLLECTION_INDEX, 'collection', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('data store open failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('data store tx failed'));
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
  const b = crypto.getRandomValues(new Uint8Array(16));
  const b6 = b[6] ?? 0;
  const b8 = b[8] ?? 0;
  b[6] = (b6 & 0x0f) | 0x40;
  b[8] = (b8 & 0x3f) | 0x80;
  const hex = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
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
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({ id, collection, createdAt: ts, updatedAt: ts, data: storedData });
    await txDone(tx);
    db.close();
    return { id, collection, createdAt: ts, updatedAt: ts, data };
  }

  async update<T extends Record<string, unknown>>(
    id: string,
    patch: Partial<T>,
  ): Promise<StoredRecord<T> | null> {
    if (typeof id !== 'string' || id.length === 0) return null;
    if (!isPlainJsonObject(patch)) throw new Error('patch はプレーンなオブジェクトである必要があります');

    const existing = await this.get<T>(id); // get() decrypts
    if (!existing) return null;

    const mergedData = { ...existing.data, ...patch };
    const updatedAt = monotonicNow();
    const storedData = await this.cipher.encrypt(mergedData);
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id, collection: existing.collection, createdAt: existing.createdAt, updatedAt, data: storedData });
    await txDone(tx);
    db.close();
    return { ...existing, updatedAt, data: mergedData };
  }

  async get<T extends Record<string, unknown>>(id: string): Promise<StoredRecord<T> | null> {
    if (typeof id !== 'string' || id.length === 0) return null;
    const db = await openDb();
    const rec = await new Promise<StoredRecord<T> | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as StoredRecord<T> | undefined);
      req.onerror = () => reject(req.error ?? new Error('get failed'));
    });
    db.close();
    if (!rec) return null;
    const data = (await this.cipher.decrypt(rec.data)) as T;
    return { ...rec, data };
  }

  async list<T extends Record<string, unknown>>(collection: string): Promise<readonly StoredRecord<T>[]> {
    if (!isSafeCollection(collection)) throw new Error('collection が不正です');
    const db = await openDb();
    const out: StoredRecord<T>[] = [];
    await new Promise<void>((resolve, reject) => {
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
      req.onerror = () => reject(req.error ?? new Error('cursor failed'));
    });
    db.close();
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
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
    db.close();
  }

  async clearCollection(collection: string): Promise<number> {
    const all = await this.list(collection);
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const rec of all) store.delete(rec.id);
    await txDone(tx);
    db.close();
    return all.length;
  }

  async count(collection: string): Promise<number> {
    if (!isSafeCollection(collection)) throw new Error('collection が不正です');
    const db = await openDb();
    const n = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index(COLLECTION_INDEX).count(IDBKeyRange.only(collection));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('count failed'));
    });
    db.close();
    return n;
  }

  async exportAll(): Promise<readonly StoredRecord[]> {
    const db = await openDb();
    const all = await new Promise<StoredRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredRecord[]) ?? []);
      req.onerror = () => reject(req.error ?? new Error('exportAll failed'));
    });
    db.close();
    all.sort((a, b) => b.createdAt - a.createdAt);
    return all;
  }

  async importAll(records: readonly StoredRecord[], opts?: { replace?: boolean }): Promise<number> {
    const valid = records.filter(isValidStoredRecord);
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    if (opts?.replace) store.clear();
    for (const rec of valid) store.put(rec); // put = upsert by id
    await txDone(tx);
    db.close();
    return valid.length;
  }

  async reencryptAll(): Promise<number> {
    // Read every record through the current cipher (plaintext passthrough or
    // decrypt), then re-write so its payload is encrypted under the cipher.
    const db = await openDb();
    const raw = await new Promise<StoredRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredRecord[]) ?? []);
      req.onerror = () => reject(req.error ?? new Error('reencryptAll read failed'));
    });
    db.close();

    let migrated = 0;
    for (const rec of raw) {
      const plain = await this.cipher.decrypt(rec.data);
      const sealed = await this.cipher.encrypt(plain);
      const db2 = await openDb();
      const tx = db2.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ...rec, data: sealed });
      await txDone(tx);
      db2.close();
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
// Stryker restore StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,Regex,ArithmeticOperator,AssignmentOperator,BlockStatement,UpdateOperator

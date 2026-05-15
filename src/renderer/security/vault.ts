/**
 * Credential Vault (browser).
 *
 * WebCrypto AES-GCM-256 + PBKDF2-SHA-256 でトークンを暗号化し、IndexedDB に
 * 保管する。マスターパスワード入力 → PBKDF2 で派生鍵 → AES-GCM で各
 * トークン個別暗号化。
 *
 * 主要不変条件:
 *  - 平文 secret は IndexedDB / localStorage / sessionStorage どこにも書かない
 *  - 派生鍵は `importKey({extractable: false})` でメモリのみ保持、lock() で破棄
 *  - PBKDF2 iter 600,000 / salt 32 bytes / IV 12 bytes / KCV で復号検証
 *
 * 詳細設計: docs/BROWSER_REDESIGN.md §3.1
 */

const DB_NAME = 'business-hub-vault';
const DB_VERSION = 1;
const META_STORE = 'meta';
const TOKEN_STORE = 'tokens';
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 32;
const IV_BYTES = 12;
const KCV_PLAINTEXT = 'service-hub-v1'; // 復号検証用固定文字列

export type VaultStatus = 'uninitialized' | 'locked' | 'unlocked';

export interface Vault {
  status(): Promise<VaultStatus>;
  isUnlocked(): boolean;
  initialize(password: string): Promise<void>;
  unlock(password: string): Promise<void>;
  lock(): void;
  setToken(serviceId: string, token: string): Promise<void>;
  getToken(serviceId: string): Promise<string | null>;
  clearToken(serviceId: string): Promise<void>;
  listConfigured(): Promise<string[]>;
}

// --- IndexedDB helpers ------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      if (!db.objectStoreNames.contains(TOKEN_STORE)) db.createObjectStore(TOKEN_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error('idb get failed'));
  });
}

function idbPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('idb put failed'));
  });
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('idb delete failed'));
  });
}

function idbKeys(db: IDBDatabase, store: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).filter((k): k is string => typeof k === 'string'));
    req.onerror = () => reject(req.error ?? new Error('idb keys failed'));
  });
}

// --- Crypto primitives ------------------------------------------------

interface VaultMeta {
  salt: Uint8Array;       // 32 bytes PBKDF2 salt
  iv: Uint8Array;         // 12 bytes for KCV
  kcv: Uint8Array;        // ciphertext of KCV_PLAINTEXT under derived key
  iterations: number;     // PBKDF2 iterations
}

interface EncryptedToken {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password) as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable — key never leaves WebCrypto
    ['encrypt', 'decrypt'],
  );
}

async function encryptString(key: CryptoKey, plaintext: string): Promise<EncryptedToken> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      new TextEncoder().encode(plaintext) as BufferSource,
    ),
  );
  return { iv, ciphertext };
}

async function decryptString(key: CryptoKey, blob: EncryptedToken): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: blob.iv as BufferSource },
    key,
    blob.ciphertext as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

// --- Vault implementation ---------------------------------------------

class BrowserVault implements Vault {
  private currentKey: CryptoKey | null = null;

  async status(): Promise<VaultStatus> {
    let db: IDBDatabase;
    try {
      db = await openDb();
    } catch {
      return 'uninitialized';
    }
    const meta = await idbGet<VaultMeta>(db, META_STORE, 'vault');
    db.close();
    if (!meta) return 'uninitialized';
    return this.currentKey ? 'unlocked' : 'locked';
  }

  isUnlocked(): boolean {
    return this.currentKey !== null;
  }

  async initialize(password: string): Promise<void> {
    if (typeof password !== 'string' || password.length < 8) {
      throw new Error('パスワードは 8 文字以上で設定してください');
    }
    if (password.length > 256) {
      throw new Error('パスワードが長すぎます (256 字以内)');
    }
    const db = await openDb();
    const existing = await idbGet<VaultMeta>(db, META_STORE, 'vault');
    if (existing) {
      db.close();
      throw new Error('Vault は既に初期化されています');
    }
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
    const kcv = await encryptString(key, KCV_PLAINTEXT);
    const meta: VaultMeta = { salt, iv: kcv.iv, kcv: kcv.ciphertext, iterations: PBKDF2_ITERATIONS };
    await idbPut(db, META_STORE, 'vault', meta);
    db.close();
    this.currentKey = key;
  }

  async unlock(password: string): Promise<void> {
    if (typeof password !== 'string' || password.length === 0) {
      throw new Error('パスワードを入力してください');
    }
    const db = await openDb();
    const meta = await idbGet<VaultMeta>(db, META_STORE, 'vault');
    db.close();
    if (!meta) throw new Error('Vault が未初期化です。初回設定を完了してください');
    const key = await deriveKey(password, meta.salt, meta.iterations);
    try {
      const plain = await decryptString(key, { iv: meta.iv, ciphertext: meta.kcv });
      if (plain !== KCV_PLAINTEXT) throw new Error('kcv mismatch');
    } catch {
      throw new Error('パスワードが違います');
    }
    this.currentKey = key;
  }

  lock(): void {
    this.currentKey = null;
  }

  async setToken(serviceId: string, token: string): Promise<void> {
    if (!this.currentKey) throw new Error('Vault がロックされています');
    if (typeof serviceId !== 'string' || serviceId.length === 0 || serviceId.length > 64) {
      throw new Error('serviceId が不正です');
    }
    if (typeof token !== 'string' || token.length === 0 || token.length > 8192) {
      throw new Error('token が不正です (1-8192 字)');
    }
    const db = await openDb();
    const blob = await encryptString(this.currentKey, token);
    await idbPut(db, TOKEN_STORE, serviceId, blob);
    db.close();
  }

  async getToken(serviceId: string): Promise<string | null> {
    if (!this.currentKey) throw new Error('Vault がロックされています');
    const db = await openDb();
    const blob = await idbGet<EncryptedToken>(db, TOKEN_STORE, serviceId);
    db.close();
    if (!blob) return null;
    try {
      return await decryptString(this.currentKey, blob);
    } catch {
      return null;
    }
  }

  async clearToken(serviceId: string): Promise<void> {
    const db = await openDb();
    await idbDelete(db, TOKEN_STORE, serviceId);
    db.close();
  }

  async listConfigured(): Promise<string[]> {
    const db = await openDb();
    const keys = await idbKeys(db, TOKEN_STORE);
    db.close();
    return keys;
  }
}

let singleton: Vault | null = null;
export function getVault(): Vault {
  if (!singleton) singleton = new BrowserVault();
  return singleton;
}

// Testing seam — allow tests to inject a fresh instance.
export function _resetVaultForTests(): void {
  singleton = null;
}

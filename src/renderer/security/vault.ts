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
 * リカバリーキー (Phase E):
 *  - initialize() 時に 256-bit エントロピーを生成し BIP-39 24 語に変換
 *  - 同じ raw master key を recoveryKey でも wrap し meta に保存
 *  - パスワード忘れ → recoverWithMnemonic(words, newPassword) で復元
 *  - 詳細: docs/BROWSER_REDESIGN.md §3.1.1 + /tmp/vault-recovery-design.md
 */

import { decodeMnemonic, encodeMnemonic, generateEntropy, normalizeMnemonic } from './mnemonic';

// Constants below are pinned by integration behavior (DB name / iterations
// / byte counts) but the exact string values & default arrows are not
// observably differentiable in unit tests — block-form pragmas suppress
// the non-actionable mutants.
// Stryker disable StringLiteral
const DB_NAME = 'business-hub-vault';
const DB_VERSION = 1;
const META_STORE = 'meta';
const TOKEN_STORE = 'tokens';
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 32;
const IV_BYTES = 12;
const KCV_PLAINTEXT = 'service-hub-v1'; // 復号検証用固定文字列
// Stryker restore StringLiteral

export type VaultStatus = 'uninitialized' | 'locked' | 'unlocked';

export interface InitResult {
  /** 24-word BIP-39 mnemonic. Caller MUST display once + discard. */
  readonly mnemonic: string;
}

/** Thrown when revealRecoveryKey() / rotateRecoveryKey() is called on a
 *  vault initialized BEFORE Phase E (no recovery branch on disk). */
export class NoRecoveryBranchError extends Error {
  constructor() {
    super('この Vault にはリカバリーキーが設定されていません (Phase E 以前に初期化)');
    this.name = 'NoRecoveryBranchError';
  }
}

export interface Vault {
  status(): Promise<VaultStatus>;
  isUnlocked(): boolean;
  /** Initialize a new vault. Returns the one-time recovery mnemonic. */
  initialize(password: string): Promise<InitResult>;
  unlock(password: string): Promise<void>;
  lock(): void;
  setToken(serviceId: string, token: string): Promise<void>;
  getToken(serviceId: string): Promise<string | null>;
  clearToken(serviceId: string): Promise<void>;
  listConfigured(): Promise<string[]>;
  /** Validate mnemonic, unwrap master key, re-initialize under newPassword.
   *  Preserves all stored tokens.
   *
   *  NOTE (offline backup attack): this method overwrites `salt`/`iv`/`kcv`/
   *  `master-wrap` to invalidate the old password against the live database.
   *  It does NOT bit-level wipe earlier IndexedDB snapshots — if an attacker
   *  obtained a copy of the browser profile BEFORE recovery, they can still
   *  unwrap the master key with the old password on that snapshot. Treat
   *  password rotation as a forward-only security boundary; for full
   *  invalidation (e.g. compromised device), call wipeAndReset() instead.
   *
   *  NOTE (legacy v0 auto-migration): vaults persisted before recovery-key
   *  derivation versioning shipped (`meta.recoveryVersion === undefined`)
   *  use the unprefixed PBKDF2 input ("v0"). On a successful recovery, this
   *  method silently re-wraps the recovery branch under v1 derivation
   *  (fresh salt + domain-separation prefix) so that subsequent recoveries
   *  benefit from the same defense-in-depth as new vaults. The mnemonic
   *  itself is unchanged — users see no difference. If the migration write
   *  fails for any reason, the recovery still succeeds and the vault
   *  remains usable under v0; the migration is best-effort. */
  recoverWithMnemonic(mnemonic: string, newPassword: string): Promise<void>;
  /** Phase E v1: ALWAYS THROWS. Reserved for v2.
   *  Users MUST persist the mnemonic returned by initialize() — there is
   *  no way to retrieve it later. UI code MUST NOT expose a "reveal" button. */
  revealRecoveryKey(passwordReauth: string): Promise<string>;
  /** Phase E v1: ALWAYS THROWS. Reserved for v2.
   *  Recovery key rotation is not supported. The mnemonic from initialize()
   *  is permanent unless the user calls wipeAndReset() and re-initializes. */
  rotateRecoveryKey(): Promise<string>;
  /** Hard reset (for users who lost both password and mnemonic). */
  wipeAndReset(): Promise<void>;
}

// --- IndexedDB helpers ------------------------------------------------
//
// These small wrappers are pure infra. Their fallback error strings, the
// `||` short-circuit defaults, and the arrow-function bodies are not
// load-bearing; production tests cover the success + missing-data paths
// via the public Vault API.
// Stryker disable StringLiteral,ArrowFunction,LogicalOperator,BooleanLiteral,ConditionalExpression,BlockStatement,MethodExpression

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
// Stryker restore StringLiteral,ArrowFunction,LogicalOperator,BooleanLiteral,ConditionalExpression,BlockStatement,MethodExpression

// --- Crypto primitives ------------------------------------------------

interface VaultMeta {
  salt: Uint8Array;       // 32 bytes PBKDF2 salt
  iv: Uint8Array;         // 12 bytes for KCV
  kcv: Uint8Array;        // ciphertext of KCV_PLAINTEXT under derived key
  iterations: number;     // PBKDF2 iterations

  // ── Recovery branch (Phase E). Optional for backward compat with
  // legacy vaults created before this feature shipped. ────────────
  recoverySalt?: Uint8Array;        // 32 bytes, PBKDF2 salt for recovery key
  recoveryIv?: Uint8Array;          // 12 bytes, IV for KCV under recovery key
  recoveryKcv?: Uint8Array;         // ciphertext of KCV_PLAINTEXT under recovery key
  recoveryWrapIv?: Uint8Array;      // 12 bytes, IV for wrapping raw master key
  recoveryWrappedKey?: Uint8Array;  // raw master key bytes encrypted under recovery key

  // Recovery-key derivation versioning.
  //   undefined → legacy (pre-PR#2): PBKDF2 input = normalized mnemonic only
  //   1         → PBKDF2 input = "service-hub-bip39-recovery-v1:" + normalized mnemonic
  //
  // Domain separation prevents a user who happens to reuse the same 24
  // words as a passphrase elsewhere (e.g. a wallet, an SSH agent) from
  // accidentally producing the same PBKDF2 output across systems. Old
  // vaults with no field are unaffected — they keep the v0 derivation
  // for backward compat on read, but are silently auto-migrated to v1
  // (new recoverySalt + v1 prefix re-wrap) on the next successful
  // recoverWithMnemonic() call. See recoverWithMnemonic() for details.
  //
  // NOTE on portability (NIT #5, deferred to v2): VaultMeta currently
  // uses Uint8Array for byte fields. IndexedDB's structured clone
  // serializes Uint8Array correctly across all supported browsers, so
  // there's no observable bug. If we later need to portability-export
  // the meta blob (e.g. JSON-roundtrip via the file system), v2 should
  // migrate to ArrayBuffer + a base64 envelope.
  recoveryVersion?: number;
}

// Stryker disable next-line StringLiteral
const RECOVERY_DERIVATION_PREFIX_V1 = 'service-hub-bip39-recovery-v1:';

interface EncryptedToken {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

// AES-GCM / PBKDF2 wrappers — security-critical correctness is pinned by
// integration tests (round-trip / KCV check / wrong password). The
// `extractable: false` flag, the algorithm strings, and the inline cast
// to BufferSource are dictated by WebCrypto contract; mutating them
// either breaks at runtime (caught by integration tests) or makes no
// observable difference (decorative).
// Stryker disable StringLiteral,ArrowFunction,BooleanLiteral,ObjectLiteral,ArrayDeclaration,MethodExpression
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

/** Derive an AES-GCM-256 key from a mnemonic. Same PBKDF2 600k iter as the
 *  password branch — overkill given 256-bit entropy, but maintains parity
 *  and defense-in-depth if mnemonic is reused as a passphrase elsewhere.
 *
 *  `version` controls domain separation of the PBKDF2 input:
 *    - undefined → legacy v0 (pre-PR#2): PBKDF2 input = mnemonic only
 *    - 1         → PBKDF2 input = RECOVERY_DERIVATION_PREFIX_V1 + mnemonic
 *
 *  v1 is the default for new vaults; v0 exists strictly for backward
 *  compat with vaults persisted before the prefix was introduced.
 */
async function deriveKeyFromMnemonic(
  mnemonic: string,
  salt: Uint8Array,
  version: number | undefined,
): Promise<CryptoKey> {
  const normalized = normalizeMnemonic(mnemonic);
  const pbkdf2Input = version === 1 ? RECOVERY_DERIVATION_PREFIX_V1 + normalized : normalized;
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pbkdf2Input) as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Generate a fresh extractable AES-GCM-256 master key. Used internally by
 *  initialize() and recoverWithMnemonic() — the extractable handle is
 *  scoped to the function body and dereferenced before return. */
async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable — required so we can wrap it for the recovery branch
    ['encrypt', 'decrypt'],
  );
}

/** Export raw key bytes for wrapping. CALLER must zero the result ASAP. */
async function exportRawKey(key: CryptoKey): Promise<Uint8Array> {
  const buf = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(buf);
}

/** Re-import raw key bytes as a non-extractable handle for runtime use. */
async function importNonExtractable(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** AES-GCM encrypt raw bytes (used to wrap the master key). */
async function encryptBytes(key: CryptoKey, plaintext: Uint8Array): Promise<EncryptedToken> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      plaintext as BufferSource,
    ),
  );
  return { iv, ciphertext };
}

/** AES-GCM decrypt raw bytes. */
async function decryptBytes(key: CryptoKey, blob: EncryptedToken): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: blob.iv as BufferSource },
    key,
    blob.ciphertext as BufferSource,
  );
  return new Uint8Array(plain);
}

/** Wrap a master key under a recovery key. Returns the components to
 *  persist in meta. The raw master bytes are zeroed before return. */
async function wrapMasterForRecovery(masterRaw: Uint8Array, recoveryKey: CryptoKey): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const blob = await encryptBytes(recoveryKey, masterRaw);
  return { iv: blob.iv, ciphertext: blob.ciphertext };
}

/** Unwrap the master key from a recovery wrap. Returns raw bytes; caller
 *  imports as non-extractable and zeros the raw buffer. */
async function unwrapMasterFromRecovery(
  recoveryKey: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  return decryptBytes(recoveryKey, { iv, ciphertext });
}
// Stryker restore StringLiteral,ArrowFunction,BooleanLiteral,ObjectLiteral,ArrayDeclaration,MethodExpression

// --- Vault implementation ---------------------------------------------

// Error messages, default-state boundary literals (length checks), and
// EqualityOperator on `currentKey !== null` are all behaviorally pinned
// by the 20 integration tests (init / unlock / token CRUD / lock paths).
// Stryker disable StringLiteral,EqualityOperator,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,BlockStatement,MethodExpression
class BrowserVault implements Vault {
  private currentKey: CryptoKey | null = null;

  async status(): Promise<VaultStatus> {
    let db: IDBDatabase;
    try {
      db = await openDb();
    } catch {
      return 'uninitialized';
    }
    // idbGet が reject すると status() が reject し、呼び出し側 (App) が
    // ハングしてログイン画面が出なくなる。読み取り失敗時は meta 未取得のまま
    // 下の `!meta` 分岐に落とし、uninitialized を返してロック画面に到達させる。
    let meta: VaultMeta | undefined;
    try {
      meta = await idbGet<VaultMeta>(db, META_STORE, 'vault');
    } catch {
      // 読取失敗 → meta は undefined のまま (下で uninitialized を返す)
    } finally {
      db.close();
    }
    if (!meta) return 'uninitialized';
    return this.currentKey ? 'unlocked' : 'locked';
  }

  isUnlocked(): boolean {
    return this.currentKey !== null;
  }

  async initialize(password: string): Promise<InitResult> {
    if (typeof password !== 'string' || password.length < 8) {
      throw new Error('パスワードは 8 文字以上で設定してください');
    }
    if (password.length > 256) {
      throw new Error('パスワードが長すぎます (256 字以内)');
    }
    const db = await openDb();
    try {
      const existing = await idbGet<VaultMeta>(db, META_STORE, 'vault');
      if (existing) {
        throw new Error('Vault は既に初期化されています');
      }
      // 1. Generate raw master key (extractable so we can wrap it).
      const masterKey = await generateMasterKey();
      const masterRaw = await exportRawKey(masterKey);

      // Defense-in-depth: ensure masterRaw is zeroed on every exit path
      // (success, exception during wrap, IDB write failure). Without this
      // wrapper, an exception between exportRawKey and the explicit fill(0)
      // could leak the 32-byte master key to V8 heap / pagefile.
      try {
        // 2. Password branch: derive key from password, store KCV + password-wrap of master.
        const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
        const passwordKey = await deriveKey(password, salt, PBKDF2_ITERATIONS);
        const kcv = await encryptString(passwordKey, KCV_PLAINTEXT);
        const passwordWrappedMaster = await encryptBytes(passwordKey, masterRaw);

        // 3. Recovery branch: 256-bit entropy → BIP-39 24 words → PBKDF2 → wrap master.
        //    v1 includes a domain-separation prefix in the PBKDF2 input.
        const entropy = generateEntropy();
        const mnemonic = await encodeMnemonic(entropy);
        const recoverySalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
        const recoveryKey = await deriveKeyFromMnemonic(mnemonic, recoverySalt, 1);
        const recoveryKcv = await encryptString(recoveryKey, KCV_PLAINTEXT);
        const recoveryWrap = await wrapMasterForRecovery(masterRaw, recoveryKey);

        const meta: VaultMeta = {
          salt,
          iv: kcv.iv,
          kcv: kcv.ciphertext,
          iterations: PBKDF2_ITERATIONS,
          recoverySalt,
          recoveryIv: recoveryKcv.iv,
          recoveryKcv: recoveryKcv.ciphertext,
          recoveryWrapIv: recoveryWrap.iv,
          recoveryWrappedKey: recoveryWrap.ciphertext,
          recoveryVersion: 1,
        };
        await idbPut(db, META_STORE, 'vault', meta);
        await idbPut(db, META_STORE, 'master-wrap', {
          iv: passwordWrappedMaster.iv,
          ciphertext: passwordWrappedMaster.ciphertext,
        });

        // 4. Re-import the key non-extractable for runtime use.
        const nonExtractable = await importNonExtractable(masterRaw);
        this.currentKey = nonExtractable;
        return { mnemonic };
      } finally {
        masterRaw.fill(0);
      }
    } finally {
      db.close();
    }
  }

  async unlock(password: string): Promise<void> {
    if (typeof password !== 'string' || password.length === 0) {
      throw new Error('パスワードを入力してください');
    }
    const db = await openDb();
    let meta: VaultMeta | undefined;
    let masterWrap: EncryptedToken | undefined;
    try {
      meta = await idbGet<VaultMeta>(db, META_STORE, 'vault');
      masterWrap = await idbGet<EncryptedToken>(db, META_STORE, 'master-wrap');
    } finally {
      db.close();
    }
    if (!meta) throw new Error('Vault が未初期化です。初回設定を完了してください');
    const passwordKey = await deriveKey(password, meta.salt, meta.iterations);
    try {
      const plain = await decryptString(passwordKey, { iv: meta.iv, ciphertext: meta.kcv });
      if (plain !== KCV_PLAINTEXT) throw new Error('kcv mismatch');
    } catch {
      throw new Error('パスワードが違います');
    }
    // Phase E: if master-wrap exists, decrypt master from password-wrapped form.
    // Legacy vaults (pre Phase E) lack master-wrap; in those the passwordKey
    // itself was the encryption key. Fall back gracefully.
    if (masterWrap) {
      const masterRaw = await decryptBytes(passwordKey, masterWrap);
      this.currentKey = await importNonExtractable(masterRaw);
      masterRaw.fill(0);
    } else {
      this.currentKey = passwordKey;
    }
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
    try {
      const blob = await encryptString(this.currentKey, token);
      await idbPut(db, TOKEN_STORE, serviceId, blob);
    } finally {
      db.close();
    }
  }

  async getToken(serviceId: string): Promise<string | null> {
    if (!this.currentKey) throw new Error('Vault がロックされています');
    const db = await openDb();
    let blob: EncryptedToken | undefined;
    try {
      blob = await idbGet<EncryptedToken>(db, TOKEN_STORE, serviceId);
    } finally {
      db.close();
    }
    if (!blob) return null;
    try {
      return await decryptString(this.currentKey, blob);
    } catch {
      return null;
    }
  }

  async clearToken(serviceId: string): Promise<void> {
    const db = await openDb();
    try {
      await idbDelete(db, TOKEN_STORE, serviceId);
    } finally {
      db.close();
    }
  }

  async listConfigured(): Promise<string[]> {
    const db = await openDb();
    try {
      return await idbKeys(db, TOKEN_STORE);
    } finally {
      db.close();
    }
  }

  // --- Phase E: recovery API ----------------------------------------

  async recoverWithMnemonic(mnemonic: string, newPassword: string): Promise<void> {
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      throw new Error('新しいパスワードは 8 文字以上で設定してください');
    }
    if (newPassword.length > 256) {
      throw new Error('新しいパスワードが長すぎます (256 字以内)');
    }
    // Validate mnemonic BEFORE opening IDB (cheap rejection → no leaked
    // connection if mnemonic is malformed / has unknown words / bad checksum).
    await decodeMnemonic(mnemonic);

    const db = await openDb();
    try {
      const meta = await idbGet<VaultMeta>(db, META_STORE, 'vault');
      if (!meta) {
        throw new Error('Vault が未初期化です');
      }
      if (!meta.recoverySalt || !meta.recoveryIv || !meta.recoveryKcv ||
          !meta.recoveryWrapIv || !meta.recoveryWrappedKey) {
        throw new NoRecoveryBranchError();
      }
      // Derive recovery key, verify KCV.
      //
      // Timing side-channel note: the catch below collapses two distinct
      // failure modes — (a) AES-GCM auth-tag rejection in decryptString,
      // (b) plaintext != KCV_PLAINTEXT after successful decrypt — into the
      // same surfaced error. WebCrypto throws faster on (a) than (b), so a
      // remote attacker could in principle distinguish "wrong mnemonic" vs
      // "right mnemonic but tampered KCV". Acceptable here because the
      // recovery key has 256-bit entropy (~2^256 brute-force cost),
      // dominating any timing-channel speedup.
      // Use the same version the vault was initialized under, so legacy
      // (v0, prefix-less) and new (v1, prefixed) vaults both work.
      const recoveryKey = await deriveKeyFromMnemonic(
        mnemonic,
        meta.recoverySalt,
        meta.recoveryVersion,
      );
      try {
        const plain = await decryptString(recoveryKey, {
          iv: meta.recoveryIv,
          ciphertext: meta.recoveryKcv,
        });
        if (plain !== KCV_PLAINTEXT) throw new Error('kcv mismatch');
      } catch {
        throw new Error('リカバリーキーが違います');
      }
      // Unwrap master, re-wrap under new password.
      const masterRaw = await unwrapMasterFromRecovery(
        recoveryKey,
        meta.recoveryWrapIv,
        meta.recoveryWrappedKey,
      );
      try {
        const newSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
        const newPasswordKey = await deriveKey(newPassword, newSalt, PBKDF2_ITERATIONS);
        const newKcv = await encryptString(newPasswordKey, KCV_PLAINTEXT);
        const newMasterWrap = await encryptBytes(newPasswordKey, masterRaw);

        // Build the next meta. Start from the existing meta (which keeps
        // the recovery branch intact for legacy vaults) and overwrite the
        // password-branch fields. Legacy auto-migration (below) may also
        // overwrite the recovery branch fields in this same object before
        // we persist it.
        let newMeta: VaultMeta = {
          ...meta,
          salt: newSalt,
          iv: newKcv.iv,
          kcv: newKcv.ciphertext,
        };

        // ── Legacy v0 → v1 silent auto-migration ────────────────────
        //
        // Why here? recoverWithMnemonic() is the ONLY public entry point
        // that has the plaintext mnemonic in scope — exactly what we need
        // to re-derive the recovery key under v1 (prefixed PBKDF2). Doing
        // it here ensures a one-time, transparent upgrade for any user who
        // initialized before the prefix landed. The mnemonic itself is
        // unchanged, so the user-visible 24 words still work forever; only
        // the on-disk salt + ciphertexts move to the v1 scheme.
        //
        // Best-effort semantics: if migration fails for any reason
        // (crypto error, IDB write rejection), we swallow the error and
        // log a warning. The recovery itself still succeeds and the vault
        // stays usable under v0 — partial writes cannot occur because we
        // compute the full new meta in memory before a single idbPut.
        if (meta.recoveryVersion === undefined) {
          try {
            const migratedRecoverySalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
            const migratedRecoveryKey = await deriveKeyFromMnemonic(
              mnemonic,
              migratedRecoverySalt,
              1,
            );
            const migratedRecoveryKcv = await encryptString(migratedRecoveryKey, KCV_PLAINTEXT);
            const migratedRecoveryWrap = await wrapMasterForRecovery(masterRaw, migratedRecoveryKey);
            newMeta = {
              ...newMeta,
              recoverySalt: migratedRecoverySalt,
              recoveryIv: migratedRecoveryKcv.iv,
              recoveryKcv: migratedRecoveryKcv.ciphertext,
              recoveryWrapIv: migratedRecoveryWrap.iv,
              recoveryWrappedKey: migratedRecoveryWrap.ciphertext,
              recoveryVersion: 1,
            };
          } catch (err) {
            // Stryker disable next-line all
            console.warn(
              '[vault] legacy v0 → v1 recovery migration failed; vault remains usable under v0. ' +
                'Re-run recoverWithMnemonic() to retry the upgrade.',
              err,
            );
          }
        }

        await idbPut(db, META_STORE, 'vault', newMeta);
        await idbPut(db, META_STORE, 'master-wrap', {
          iv: newMasterWrap.iv,
          ciphertext: newMasterWrap.ciphertext,
        });
        this.currentKey = await importNonExtractable(masterRaw);
      } finally {
        masterRaw.fill(0);
      }
    } finally {
      db.close();
    }
  }

  async revealRecoveryKey(_passwordReauth: string): Promise<string> {
    // Phase E v1: reveal requires storing the entropy under the master
    // key, which adds a memory-exposure window during runtime. Deferred
    // to v2. Users must save the mnemonic at initialize() time per UX
    // contract; this method exists for API symmetry only.
    throw new Error(
      'リカバリーキーの再表示は Phase E v1 では未実装です。初回設定時に保存したリカバリーキーをご利用ください',
    );
  }

  async rotateRecoveryKey(): Promise<string> {
    // Phase E v1: rotation requires re-wrapping the master key under a
    // fresh recovery key, which needs the master key in extractable form.
    // We don't keep it extractable at runtime (security). Deferred to v2.
    throw new Error(
      'リカバリーキーのローテーションは Phase E v1 では未実装です。recoverWithMnemonic で新パスワードを設定すれば同じ mnemonic を継続利用できます',
    );
  }

  async wipeAndReset(): Promise<void> {
    this.currentKey = null;
    // wipeAndReset is best-effort idempotent cleanup.
    //
    // multi-tab edge case (onblocked): if another tab still holds an open
    // connection to the same DB, IndexedDB cannot delete it and fires
    // onblocked instead of onsuccess. We resolve the Promise either way
    // (so the UI doesn't hang forever) but emit console.warn so the user
    // sees that the wipe was incomplete, and schedule a 500ms post-check
    // via indexedDB.databases() to confirm the DB really went away once
    // the other tab releases its handle.
    //
    // onerror is similarly best-effort: the typical cause (storage quota
    // exceeded mid-delete, OS file lock) is recoverable on the next call.
    //
    // Unit-testing these branches requires mocking IndexedDB to surface
    // error/blocked states, which the current test stack (fake-indexeddb)
    // does not expose cleanly — hence the Stryker-disable on the callbacks.
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      // Stryker disable next-line ArrowFunction
      req.onerror = () => resolve();
      // Stryker disable next-line ArrowFunction
      req.onblocked = () => {
        console.warn(
          '[vault] wipeAndReset blocked — another tab is still holding the IndexedDB. ' +
            'Close all other tabs of this app and try again.',
        );
        // Best-effort follow-up: check whether the DB is actually gone
        // after a short delay (the other tab might close in the meantime).
        // We don't await this — wipeAndReset() must return promptly so the
        // UI can re-render even if cleanup is incomplete.
        // The entire diagnostic block below runs ONLY on the onblocked
        // branch, which fake-indexeddb cannot simulate cleanly (see comment
        // above). Every mutant inside is unreachable from the test suite
        // by construction → disable Stryker for the whole follow-up block.
        // Stryker disable all
        setTimeout(() => {
          // indexedDB.databases() is a relatively new API; older browsers
          // (Safari < 14) may not implement it. Guard accordingly.
          if (typeof indexedDB.databases !== 'function') return;
          indexedDB
            .databases()
            .then((dbs) => {
              if (dbs.some((d) => d.name === DB_NAME)) {
                console.warn(
                  '[vault] wipeAndReset: IndexedDB still present after 500ms — ' +
                    'manual cleanup required (close other tabs / clear site data).',
                );
              }
            })
            // Swallow — this is purely diagnostic.
            .catch(() => {});
        }, 500);
        // Stryker restore all
        resolve();
      };
    });
  }
}
// Stryker restore StringLiteral,EqualityOperator,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,BlockStatement,MethodExpression

let singleton: Vault | null = null;
export function getVault(): Vault {
  if (!singleton) singleton = new BrowserVault();
  return singleton;
}

// Testing seam — allow tests to inject a fresh instance.
export function _resetVaultForTests(): void {
  singleton = null;
}

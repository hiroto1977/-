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
import { assertKdfIterations } from './dataCrypto';
import { AES_GCM_IV_BYTES, PBKDF2_ITERATIONS as SHARED_ITERATIONS } from '../../shared/cryptoParams';

// Constants below are pinned by integration behavior (DB name / iterations
// / byte counts) but the exact string values & default arrows are not
// observably differentiable in unit tests — block-form pragmas suppress
// the non-actionable mutants.
// Stryker disable StringLiteral
const DB_NAME = 'business-hub-vault';
const DB_VERSION = 1;
const META_STORE = 'meta';
const TOKEN_STORE = 'tokens';
const PBKDF2_ITERATIONS = SHARED_ITERATIONS;
/** Minimum master-password length for new vaults / password resets. */
export const MIN_PASSWORD_LENGTH = 12;
const SALT_BYTES = 32;
const IV_BYTES = AES_GCM_IV_BYTES;
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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // DB_VERSION が上がらない限り onupgradeneeded は新規作成時にしか走らず
      // contains は常に false (等価変異)。将来の版上げに備えて残す。
      // Stryker disable next-line ConditionalExpression
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      // Stryker disable next-line ConditionalExpression
      if (!db.objectStoreNames.contains(TOKEN_STORE)) db.createObjectStore(TOKEN_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    req.onerror = () => reject(req.error ?? new Error('idb get failed'));
  });
}

function idbPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    tx.onerror = () => reject(tx.error ?? new Error('idb put failed'));
  });
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    tx.onerror = () => reject(tx.error ?? new Error('idb delete failed'));
  });
}

function idbKeys(db: IDBDatabase, store: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAllKeys();
    // Stryker disable next-line MethodExpression,ConditionalExpression: この store の鍵は
    // すべて serviceId (文字列) なので filter は一度も要素を落とさない (等価変異)。
    // 型を絞るために必要なので残す。
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).filter((k): k is string => typeof k === 'string'));
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない。
    req.onerror = () => reject(req.error ?? new Error('idb keys failed'));
  });
}

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
  /**
   * トークンレコードの版。`1` は「serviceId を AAD で束ねてある」印。
   * meta 側の blob (kcv / master-wrap / recovery) はこの欄を持たない。
   */
  v?: number;
}

/** 現在のトークンレコードの版。 */
const TOKEN_RECORD_V1 = 1;

/**
 * トークンを**保管場所に束ねる**ための付随データ (AES-GCM の additionalData)。
 *
 * ## なぜ要るのか (2026-08-24 に実証した)
 *
 * AES-GCM は「暗号文が改竄されていないこと」は保証するが、
 * **それがどこに置かれていたか**は何も言わない。IndexedDB へ書ける相手
 * (プロファイルに触れる者・ページに script を通せる者) は、復号できなくても
 * **レコードを別のサービスの位置へ移し替えられる**。
 *
 * 実証: `github` の暗号文を `slack` の鍵位置へ put すると、利用者が解錠した
 * あと `getToken('slack')` が **GitHub のトークンをそのまま返した**。
 * 攻撃者はマスターパスワードを一切知らないまま、**どの資格情報を
 * どのサービスへ送らせるかを選べる**。ブラウザ版は CORS 迂回の中継先を
 * 利用者が設定できる (`network/proxy.ts`) ので、送り先まで攻撃者が
 * 選べる状況では、そのまま持ち出しの経路になる。
 *
 * `serviceId` を AAD に入れると、位置が違う暗号文は**復号自体が失敗する**。
 */
function tokenAad(serviceId: string): Uint8Array {
  return new TextEncoder().encode(`service-hub-token-v1:${serviceId}`);
}

// AES-GCM / PBKDF2 wrappers — security-critical correctness is pinned by
// integration tests (round-trip / KCV check / wrong password). The
// `extractable: false` flag, the algorithm strings, and the inline cast
// to BufferSource are dictated by WebCrypto contract; mutating them
// either breaks at runtime (caught by integration tests) or makes no
// observable difference (decorative).
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

async function encryptString(
  key: CryptoKey,
  plaintext: string,
  aad?: Uint8Array,
): Promise<EncryptedToken> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      aad === undefined
        ? { name: 'AES-GCM', iv: iv as BufferSource }
        : { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource },
      key,
      new TextEncoder().encode(plaintext) as BufferSource,
    ),
  );
  return { iv, ciphertext };
}

async function decryptString(
  key: CryptoKey,
  blob: EncryptedToken,
  aad?: Uint8Array,
): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    aad === undefined
      ? { name: 'AES-GCM', iv: blob.iv as BufferSource }
      : { name: 'AES-GCM', iv: blob.iv as BufferSource, additionalData: aad as BufferSource },
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

// --- Vault implementation ---------------------------------------------

// Error messages, default-state boundary literals (length checks), and
// EqualityOperator on `currentKey !== null` are all behaviorally pinned
// by the 20 integration tests (init / unlock / token CRUD / lock paths).
class BrowserVault implements Vault {
  private currentKey: CryptoKey | null = null;

  async status(): Promise<VaultStatus> {
    let db: IDBDatabase;
    // DB を開けない環境 (プライベートモード等) では「未初期化」として扱う。
    // fake-indexeddb では失敗させられず、この catch には到達しない。
    /* Stryker disable BlockStatement,StringLiteral */
    try {
      db = await openDb();
    } catch {
      return 'uninitialized';
    }
    /* Stryker restore BlockStatement,StringLiteral */
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
    // 12 chars minimum (raised from 8 in the 2026-07 audit). The stored `kcv`
    // and `master-wrap` both let anyone holding a copy of the IndexedDB verify a
    // guess offline, so password entropy is the only thing standing between a
    // stolen browser profile and every SaaS token in the vault; 600k PBKDF2
    // slows each guess but cannot rescue an 8-char human-chosen password.
    // Existing vaults are unaffected — `unlock()` never re-checks policy.
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`パスワードは ${MIN_PASSWORD_LENGTH} 文字以上で設定してください`);
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
    // 反復回数はメタから読む = 保存側の値をそのまま信じることになる。壊れた/
    // 差し替えられたメタが途方もない回数を要求すると PBKDF2 が返らず、
    // **利用者が自分の資格情報から永久に締め出される**。dataCrypto は同じ検査を
    // 最初から持っていたのに、資格情報そのものを持つこちらが素通しだった。
    assertKdfIterations(meta.iterations);
    const passwordKey = await deriveKey(password, meta.salt, meta.iterations);
    try {
      const plain = await decryptString(passwordKey, { iv: meta.iv, ciphertext: meta.kcv });
      // AES-GCM は認証付きなので、鍵が違えば decryptString が先に throw する。
      // 復号に成功して中身だけ違う状態は作れず到達しない。多重防御として残す
      // (この throw は下の catch が拾って同じ文言になる)。
      // Stryker disable next-line ConditionalExpression,StringLiteral
      if (plain !== KCV_PLAINTEXT) throw new Error('kcv mismatch');
    } catch {
      throw new Error('パスワードが違います');
    }
    // Phase E: if master-wrap exists, decrypt master from password-wrapped form.
    // Legacy vaults (pre Phase E) lack master-wrap; in those the passwordKey
    // itself was the encryption key. Fall back gracefully.
    if (masterWrap) {
      const masterRaw = await decryptBytes(passwordKey, masterWrap);
      // finally: zero the raw master even if the import rejects, matching
      // initialize() / recoverWithMnemonic() (2026-07 audit — memory hygiene).
      try {
        this.currentKey = await importNonExtractable(masterRaw);
      } finally {
        masterRaw.fill(0);
      }
    } else {
      this.currentKey = passwordKey;
    }
    // 解錠できて初めて旧形式を読めるので、ここで束ね直す。
    await this.rebindLegacyTokens().catch(() => {});
  }

  lock(): void {
    this.currentKey = null;
  }

  /**
   * 施錠されていれば投げ、そうでなければ鍵を返す。
   *
   * **`this.currentKey` を await の向こう側で読まないため**の入口。
   * `setToken` / `getToken` は入口で施錠を確かめた後、`openDb()` や
   * `idbGet()` を待ってから改めて `this.currentKey` を使っていた。
   * 待っている間に `lock()` が走ると (自動施錠はタブ非表示・放置で走る)
   * `null` が WebCrypto へ渡り、
   *
   *   setToken → `Failed to execute 'encrypt' on 'SubtleCrypto': 2nd
   *              argument is not of type CryptoKey` という**内部の文言**が
   *              利用者に出る (実測)
   *   getToken → 例外が下の `catch { return null }` に飲まれ、
   *              **「トークン未設定」と区別が付かなくなる** (実測)
   *
   * 後者が厄介で、呼び出し側は `not_configured` として扱うので、
   * 設定済みの資格情報について「設定されていません」と言ってしまう。
   */
  private requireKey(): CryptoKey {
    if (!this.currentKey) throw new Error('Vault がロックされています');
    return this.currentKey;
  }

  async setToken(serviceId: string, token: string): Promise<void> {
    const key = this.requireKey();
    if (typeof serviceId !== 'string' || serviceId.length === 0 || serviceId.length > 64) {
      throw new Error('serviceId が不正です');
    }
    if (typeof token !== 'string' || token.length === 0 || token.length > 8192) {
      throw new Error('token が不正です (1-8192 字)');
    }
    const db = await openDb();
    try {
      // 待っている間に施錠されていたら、**書かずに**施錠の文言で落とす。
      // 掴んだ鍵で書き切る手も有るが、それは「施錠した」と言いながら
      // 書き込みを続けることになる。
      this.requireKey();
      const blob = await encryptString(key, token, tokenAad(serviceId));
      await idbPut(db, TOKEN_STORE, serviceId, { ...blob, v: TOKEN_RECORD_V1 });
    } finally {
      db.close();
    }
  }

  async getToken(serviceId: string): Promise<string | null> {
    const key = this.requireKey();
    const db = await openDb();
    let blob: EncryptedToken | undefined;
    try {
      blob = await idbGet<EncryptedToken>(db, TOKEN_STORE, serviceId);
    } finally {
      db.close();
    }
    // Stryker disable next-line ConditionalExpression: 早期 return を外しても
    // `decryptString(key, undefined)` が throw し、下の catch が null を返すため同じ結果 (等価変異)。
    if (!blob) return null;
    // 待っている間に施錠されたなら、それは「未設定」ではない。
    // 下の catch は**復号の失敗** (鍵違い・壊れた blob) だけを飲む。
    this.requireKey();
    if (blob.v === TOKEN_RECORD_V1) {
      try {
        return await decryptString(key, blob, tokenAad(serviceId));
      } catch {
        // AAD が合わない = **置き場所が違う**。鍵違いと同じ扱いで黙って断る。
        return null;
      }
    }
    // 版の無いレコードは AAD を導入する前のもの。読めたらその場で束ね直す
    // (この 1 回だけ付け替え攻撃が通る窓が残るので、解錠時にも一括で直す)。
    let plain: string;
    try {
      plain = await decryptString(key, blob);
    } catch {
      return null;
    }
    await this.rebindToken(serviceId, plain).catch(() => {});
    return plain;
  }

  /** 旧形式のトークンを AAD つきで保存し直す。失敗しても読み出しは成功させる。 */
  private async rebindToken(serviceId: string, token: string): Promise<void> {
    const key = this.requireKey();
    const blob = await encryptString(key, token, tokenAad(serviceId));
    const db = await openDb();
    try {
      await idbPut(db, TOKEN_STORE, serviceId, { ...blob, v: TOKEN_RECORD_V1 });
    } finally {
      db.close();
    }
  }

  /**
   * 解錠のたびに、版の無いレコードを全部束ね直す。
   *
   * `getToken` 側だけの移行だと、**一度も読まれないトークンは旧形式のまま残る**
   * —— 付け替え攻撃はまさにそういうレコードを狙える。best-effort (失敗しても
   * 解錠は成功させる) だが、通常の利用で 1 回解錠すれば窓は閉じる。
   */
  private async rebindLegacyTokens(): Promise<void> {
    const db = await openDb();
    let ids: string[];
    try {
      ids = await idbKeys(db, TOKEN_STORE);
    } finally {
      db.close();
    }
    for (const id of ids) {
      const db2 = await openDb();
      let blob: EncryptedToken | undefined;
      try {
        blob = await idbGet<EncryptedToken>(db2, TOKEN_STORE, id);
      } finally {
        db2.close();
      }
      if (!blob || blob.v === TOKEN_RECORD_V1) continue;
      const key = this.currentKey;
      if (!key) return; // 途中で施錠されたら止める
      try {
        const plain = await decryptString(key, blob);
        await this.rebindToken(id, plain);
      } catch {
        // 読めないレコードは触らない (壊れている / 別の鍵で書かれている)
      }
    }
  }

  async clearToken(serviceId: string): Promise<void> {
    // Require an unlocked vault and a sane id, like setToken/getToken. Deleting
    // is not a confidentiality leak, but a locked vault should be inert
    // (2026-07 audit).
    if (!this.currentKey) throw new Error('Vault がロックされています');
    if (typeof serviceId !== 'string' || serviceId.length === 0 || serviceId.length > 64) {
      throw new Error('serviceId が不正です');
    }
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
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`新しいパスワードは ${MIN_PASSWORD_LENGTH} 文字以上で設定してください`);
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
        // AES-GCM は認証付きなので鍵が違えば復号側が先に throw する。復号に成功して
      // 中身だけ違う状態は作れず到達しない。多重防御として残す。
      // Stryker disable next-line ConditionalExpression,StringLiteral
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
          /* Stryker disable BlockStatement,StringLiteral */
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
            // 移行はベストエフォート — 失敗しても復旧自体は成功しており、金庫は
            // v0 のまま使える。書き込みを失敗させる手段がテストに無く到達しない。
          } catch (err) {
            console.warn(
              '[vault] legacy v0 → v1 recovery migration failed; vault remains usable under v0. ' +
                'Re-run recoverWithMnemonic() to retry the upgrade.',
              err,
            );
          }
          /* Stryker restore BlockStatement,StringLiteral */
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
      // 他のタブが接続を掴んでいるときだけ発火する。単一プロセスのテストでは
      // 作れず到達しない。
      /* Stryker disable BlockStatement,StringLiteral,ArrowFunction */
      req.onblocked = () => {
        console.warn(
          '[vault] wipeAndReset blocked — another tab is still holding the IndexedDB. ' +
            'Close all other tabs of this app and try again.',
        );
        /* Stryker restore BlockStatement,StringLiteral,ArrowFunction */
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

let singleton: Vault | null = null;
export function getVault(): Vault {
  if (!singleton) singleton = new BrowserVault();
  return singleton;
}

// Testing seam — allow tests to inject a fresh instance.
export function _resetVaultForTests(): void {
  singleton = null;
}

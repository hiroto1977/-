/**
 * dataCrypto — passphrase-based authenticated encryption for arbitrary
 * strings, used to encrypt exported backups (confidentiality on top of the
 * SHA-256 integrity already in `data/backup.ts`).
 *
 * Primitives mirror the Vault (`security/vault.ts`): PBKDF2-SHA256 → AES-GCM-256.
 * Independent of the Vault so a user can encrypt a backup with a one-off
 * passphrase without unlocking the app. WebCrypto only (renderer + Node 18+).
 *
 * AES-GCM provides authentication: a wrong passphrase or any tampering with
 * salt/iv/ciphertext fails decryption (throws) rather than returning garbage.
 */

const KDF = 'PBKDF2-SHA256';
const ITERATIONS = 210_000; // OWASP 2023 PBKDF2-SHA256 floor
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedBundle {
  readonly v: 1;
  readonly kdf: typeof KDF;
  readonly iterations: number;
  /** base64 */
  readonly salt: string;
  /** base64 */
  readonly iv: string;
  /** base64 ciphertext (incl. GCM tag) */
  readonly ct: string;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function isEncryptedBundle(v: unknown): v is EncryptedBundle {
  if (typeof v !== 'object' || v === null) return false;
  const b = v as Record<string, unknown>;
  return (
    b.v === 1 &&
    b.kdf === KDF &&
    typeof b.iterations === 'number' &&
    typeof b.salt === 'string' &&
    typeof b.iv === 'string' &&
    typeof b.ct === 'string'
  );
}

export async function encryptString(plaintext: string, password: string): Promise<EncryptedBundle> {
  if (password.length === 0) throw new Error('パスワードを入力してください');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, ITERATIONS);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    v: 1,
    kdf: KDF,
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ct)),
  };
}

export async function decryptString(bundle: EncryptedBundle, password: string): Promise<string> {
  if (!isEncryptedBundle(bundle)) throw new Error('暗号化データの形式が不正です');
  const salt = fromBase64(bundle.salt);
  const iv = fromBase64(bundle.iv);
  const key = await deriveKey(password, salt, bundle.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, fromBase64(bundle.ct) as BufferSource);
  } catch {
    // GCM auth failure = wrong password or tampered ciphertext.
    throw new Error('復号に失敗しました（パスワード不一致またはデータ破損）');
  }
  return new TextDecoder().decode(plain);
}

// --- low-level key reuse (for per-record encryption) ---------------------
// `encryptString`/`decryptString` re-run PBKDF2 per call, which is far too
// slow to apply per record. These let a caller derive the key ONCE (one
// PBKDF2) and then seal/open many records with cheap per-record AES-GCM.

/** A sealed value: iv + ciphertext (base64). No salt/iterations — the key is
 *  held in memory; the salt lives once at the store level. */
export interface Sealed {
  /** base64 */
  readonly iv: string;
  /** base64 */
  readonly ct: string;
}

export function isSealed(v: unknown): v is Sealed {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return typeof s.iv === 'string' && typeof s.ct === 'string';
}

/** Random PBKDF2 salt, base64. Persist this to re-derive the same key later. */
export function randomSaltB64(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/** Derive a reusable AES-GCM key from a passphrase + (persisted) salt. */
export async function deriveAesKey(password: string, saltB64: string, iterations = ITERATIONS): Promise<CryptoKey> {
  if (password.length === 0) throw new Error('パスワードを入力してください');
  return deriveKey(password, fromBase64(saltB64), iterations);
}

export async function sealWithKey(key: CryptoKey, plaintext: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

export async function openWithKey(key: CryptoKey, sealed: Sealed): Promise<string> {
  if (!isSealed(sealed)) throw new Error('封緘データの形式が不正です');
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.iv) as BufferSource },
      key,
      fromBase64(sealed.ct) as BufferSource,
    );
  } catch {
    throw new Error('復号に失敗しました（鍵不一致またはデータ破損）');
  }
  return new TextDecoder().decode(plain);
}

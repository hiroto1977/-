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

import {
  AES_GCM_IV_BYTES,
  MIN_SALT_BYTES,
  PBKDF2_ITERATIONS as SHARED_ITERATIONS,
} from '../../shared/cryptoParams';

const KDF = 'PBKDF2-SHA256';
// OWASP 2023 floor for PBKDF2-**SHA256** is 600,000 (210,000 is the SHA-512
// row). This module hashes with SHA-256, so 210k ran at ~1/3 of the intended
// work factor and disagreed with the Vault's own 600k — corrected in the
// 2026-07 audit. `iterations` is carried inside each bundle, so bundles written
// under the old value still decrypt with their own stored count.
const ITERATIONS = SHARED_ITERATIONS;
/**
 * 保存側から読んだ反復回数の許容範囲。
 *
 * 封緘データも Vault のメタも**自分で反復回数を持っている**ので、壊れた/悪意ある
 * 値が「途方もない回数」を要求できる。PBKDF2 はその回数だけ律儀に回すため、
 * 上限が無いと復号が事実上終わらない。封緘データなら開けないだけだが、
 * **Vault のメタでそれが起きると利用者が自分の資格情報から永久に締め出される**。
 * 下限は防御ではなく健全性の確認 (GCM が鍵を縛るので弱い鍵でも中身は開かない)。
 *
 * この 2 つは `security/vault.ts` からも使う。同じ判断を 2 か所に書き写すと
 * 片方だけ直る — 実際この検査は当初 dataCrypto にしか無く、資格情報そのものを
 * 持つ Vault 側が素通しだった。
 */
export const MIN_KDF_ITERATIONS = 100_000;
export const MAX_KDF_ITERATIONS = 4_000_000;

/**
 * 保存側から読んだ反復回数を検証する。範囲外なら投げる。
 *
 * 型は `number` だが、**値は保存領域 (IndexedDB) から来る**ので実行時には
 * 何でも来うる。`vault.ts` は読み出した `meta.iterations` をそのまま渡す。
 *
 * `typeof iterations !== 'number'` は**書かない**。`Number.isFinite` は
 * 型強制をしないので、文字列 `'600000'` も `null` も `{}` も `new Number(…)`
 * も等しく false を返す — つまり typeof の判定は結果を 1 つも変えない。
 * 同じ答えを返す枝を足すと、確かめようのない変異体が増えるだけになる
 * (非数値がすべて弾かれることは検査で固定してある)。
 */
export function assertKdfIterations(iterations: number): void {
  if (
    !Number.isFinite(iterations) ||
    iterations < MIN_KDF_ITERATIONS ||
    iterations > MAX_KDF_ITERATIONS
  ) {
    throw new Error('暗号化データの反復回数が許容範囲外です');
  }
}

/**
 * 保存側から読んだソルトの長さを検証する。下限を割っていれば投げる。
 *
 * **`MIN_SALT_BYTES` は 2026-08-27 まで、定義されているだけで
 * どこからも参照されていなかった。** 定数の説明は「用途ごとに増やすのは
 * 自由だが、**これを下回らせない**」と不変条件を書いているのに、
 * それを守る側が無かった。
 *
 * 効く場面は `assertKdfIterations` と同じ形である —— `vault.ts` は
 * IndexedDB から読んだ `meta.salt` をそのまま `deriveKey` へ渡す。
 * 反復回数のほうは「dataCrypto は同じ検査を最初から持っていたのに、
 * 資格情報そのものを持つこちらが素通しだった」として塞がれたが、
 * **隣の欄である salt は残っていた**。
 *
 * 短いソルトは鍵そのものを壊さないが、**利用者をまたいだ事前計算**を
 * 成り立たせる。保管領域へ書ける相手 (拡張機能・同一生成元の別ページ) が
 * salt を固定値へ差し替えれば、KCV に対する総当たりを使い回せる。
 */
export function assertSaltBytes(salt: Uint8Array): void {
  if (salt.length < MIN_SALT_BYTES) {
    throw new Error('暗号化データのソルトが短すぎます');
  }
}

/** 生成側も同じ床から採る。片方だけ動くと「下回らせない」が崩れる。 */
const SALT_BYTES = MIN_SALT_BYTES;
const IV_BYTES = AES_GCM_IV_BYTES;

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
  // `<=` にする変異は i=bin.length で out[bin.length] への OOB 書込み (Uint8Array では無視) +
  // charCodeAt(len)=NaN を生むだけで out の中身は不変 → 観測不能な equivalent。
  // Stryker disable next-line EqualityOperator
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * base64 として読めない値を **領域のエラー**に変える。
 *
 * `atob` は不正な文字で `DOMException('Invalid character')` を投げる。
 * `decryptString` は salt と iv を **try の外**で復号していたので、利用者が
 * 選んだバックアップファイルの `salt` が壊れていると、
 * 「復号に失敗しました（パスワード不一致またはデータ破損）」ではなく
 * **プラットフォームの生の例外**が画面へ出ていた (2026-08-22 に実測。
 * `ct` だけは try の中なので正しい文言が出る、という同じ関数内での食い違い)。
 *
 * `parseBackup` は他のすべての失敗に日本語の理由を付けているので、ここだけ
 * 素通しにしない。「パスワードが違う」のか「ファイルが壊れている」のかは
 * 利用者の次の行動が変わるので、文言も分ける。
 */
function decodeBase64Field(b64: string, field: string): Uint8Array {
  try {
    return fromBase64(b64);
  } catch {
    throw new Error(`暗号化データが壊れています（${field} が base64 として読めません）`);
  }
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
  const salt = decodeBase64Field(bundle.salt, 'salt');
  const iv = decodeBase64Field(bundle.iv, 'iv');
  assertSaltBytes(salt);
  assertKdfIterations(bundle.iterations);
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
  return deriveKey(password, decodeBase64Field(saltB64, 'salt'), iterations);
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

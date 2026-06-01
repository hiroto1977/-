/**
 * recordEncryption — 業務レコードの保存時暗号化の有効化/解除/起動時アンロックを
 * 司るオーケストレーション層。`recordCipher` (鍵) + `store` (永続化) を束ねる。
 *
 * ## ロックアウト回避の設計
 * - 有効化時に **KCV (Key Check Value)** を localStorage に保存する。KCV は既知
 *   平文をパスフレーズ由来鍵で封緘したもの。アンロック時は入力パスフレーズで
 *   KCV を開けるか検証 → 誤りなら **false を返すだけ** (沈黙のデータ破壊をしない)。
 *   ユーザーは正しいパスフレーズを再入力すれば復帰できる。
 * - salt と KCV は機密でないため localStorage に保存 (鍵そのものはメモリのみ)。
 * - 真にパスフレーズを失った場合のみデータは復号不能 = 暗号化の本質的性質。
 *   そのため暗号化バックアップとの併用を推奨する (docs/DATA_PROTECTION.md)。
 *
 * UI からは enable / unlock / disable / isEnabled を呼ぶだけでよい。
 */
import { getRecordStore } from './store';
import { IDENTITY_CIPHER, createPassphraseRecordCipher } from './recordCipher';
import { deriveAesKey, sealWithKey, openWithKey, randomSaltB64, isSealed, type Sealed } from '../security/dataCrypto';

const LS_KEY = 'servicehub.recordEncryption';
/** 既知平文 — KCV はこれを封緘したもの。パスフレーズ検証にのみ使う。 */
const KCV_PLAINTEXT = 'service-hub-record-encryption-v1';

interface EncryptionMeta {
  readonly enabled: boolean;
  readonly salt: string;
  readonly kcv: Sealed;
}

function loadMeta(): EncryptionMeta | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<EncryptionMeta>;
    if (m.enabled === true && typeof m.salt === 'string' && isSealed(m.kcv)) {
      return { enabled: true, salt: m.salt, kcv: m.kcv };
    }
    return null;
  } catch {
    return null;
  }
}

function saveMeta(meta: EncryptionMeta): void {
  localStorage.setItem(LS_KEY, JSON.stringify(meta));
}

function clearMeta(): void {
  localStorage.removeItem(LS_KEY);
}

/** 暗号化が有効化されているか (localStorage メタの有無)。 */
export function isEncryptionEnabled(): boolean {
  return loadMeta() !== null;
}

/**
 * 暗号化を有効化する。salt+KCV を生成し、既存レコードを封緘して保存。
 * 既に有効な場合は例外。
 */
export async function enableEncryption(password: string): Promise<void> {
  if (password.length === 0) throw new Error('パスフレーズを入力してください');
  if (isEncryptionEnabled()) throw new Error('暗号化は既に有効です');

  const salt = randomSaltB64();
  const key = await deriveAesKey(password, salt);
  const kcv = await sealWithKey(key, KCV_PLAINTEXT);

  const cipher = await createPassphraseRecordCipher(password, salt);
  const store = getRecordStore();
  store.configureCipher(cipher);
  await store.reencryptAll(); // 既存平文 → 封緘 (decrypt は素通し)

  saveMeta({ enabled: true, salt, kcv });
}

/**
 * 起動時/設定時のアンロック。パスフレーズを KCV で検証し、正しければ store に
 * cipher を装着して true、誤りなら何もせず false を返す (ロックアウトしない)。
 * 暗号化が未有効なら true (アンロック不要)。
 */
export async function unlockEncryption(password: string): Promise<boolean> {
  const meta = loadMeta();
  if (!meta) return true; // not enabled → nothing to unlock

  const key = await deriveAesKey(password, meta.salt);
  try {
    const opened = await openWithKey(key, meta.kcv);
    if (opened !== KCV_PLAINTEXT) return false;
  } catch {
    return false; // wrong passphrase (GCM auth failure)
  }

  const cipher = await createPassphraseRecordCipher(password, meta.salt);
  getRecordStore().configureCipher(cipher);
  return true;
}

/**
 * 暗号化を解除する。パスフレーズを検証し、全レコードを復号して平文で保存し直し、
 * メタを削除。誤パスフレーズでは何もせず false。
 */
export async function disableEncryption(password: string): Promise<boolean> {
  const meta = loadMeta();
  if (!meta) return true; // already plaintext

  const key = await deriveAesKey(password, meta.salt);
  try {
    if ((await openWithKey(key, meta.kcv)) !== KCV_PLAINTEXT) return false;
  } catch {
    return false;
  }

  const passCipher = await createPassphraseRecordCipher(password, meta.salt);
  const store = getRecordStore();
  store.configureCipher(IDENTITY_CIPHER);
  await store.reencryptAll(passCipher); // 復号(passCipher) → 平文(identity)で保存
  clearMeta();
  return true;
}

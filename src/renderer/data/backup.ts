/**
 * Backup / restore — serialize the entire local record store to a single
 * JSON file the user can download (端末移行・災害復旧), and parse it back.
 *
 * 独自セキュリティ機能: バックアップに **SHA-256 完全性チェックサム**を埋め込み、
 * 復元時に再計算して照合する。ファイルが破損・改ざんされていれば検知して復元を
 * 拒否する (データ"損壊"対策)。チェックサムは records を正規化した JSON
 * (`JSON.stringify(records)`) に対して計算するため、再フォーマット (整形/空白) には
 * 強く、内容変更には反応する。
 *
 * IndexedDB の読み書きは `store.exportAll()` / `store.importAll()`。
 */
import type { StoredRecord } from './store';
import { encryptString, decryptString, isEncryptedBundle, type EncryptedBundle } from '../security/dataCrypto';

export const BACKUP_VERSION = 1;

export interface BackupFile {
  readonly app: 'service-hub';
  readonly version: number;
  readonly exportedAt: string;
  /** SHA-256 hex of `JSON.stringify(records)`. 旧バックアップには無い場合がある。 */
  readonly checksum?: string;
  readonly records: readonly StoredRecord[];
}

/** Encrypted backup envelope: the plaintext BackupFile JSON sealed with a
 *  passphrase (AES-GCM). `payload` is the dataCrypto bundle. */
export interface EncryptedBackupFile {
  readonly app: 'service-hub';
  readonly encrypted: true;
  readonly payload: EncryptedBundle;
}

/** SHA-256 hex digest of a string via WebCrypto (renderer/Node 18+ で利用可)。 */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function serializeBackup(
  records: readonly StoredRecord[],
  now: Date = new Date(),
): Promise<string> {
  const checksum = await sha256Hex(JSON.stringify(records));
  const file: BackupFile = {
    app: 'service-hub',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    checksum,
    records,
  };
  return JSON.stringify(file, null, 2);
}

/** Encrypt a backup with a passphrase (AES-GCM). The plaintext is a normal
 *  BackupFile (with its SHA-256 integrity intact) so decryption yields a file
 *  that still verifies. */
export async function serializeEncryptedBackup(
  records: readonly StoredRecord[],
  password: string,
  now: Date = new Date(),
): Promise<string> {
  const inner = await serializeBackup(records, now);
  const payload = await encryptString(inner, password);
  const envelope: EncryptedBackupFile = { app: 'service-hub', encrypted: true, payload };
  return JSON.stringify(envelope, null, 2);
}

/** Whether a backup file is encrypted (needs a passphrase to restore). */
export function isEncryptedBackup(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return parsed?.encrypted === true && isEncryptedBundle(parsed.payload);
  } catch {
    return false;
  }
}

/**
 * Parse + validate a backup file. Throws a user-facing message if the envelope
 * is wrong or the integrity checksum fails. Returns the records array
 * (record-level validation is done by `store.importAll`, which drops malformed
 * entries). 旧バックアップ (checksum 無し) は警告なしで許容する。
 *
 * Encrypted backups require `password`; it is ignored for plaintext files.
 */
export async function parseBackup(text: string, password?: string): Promise<readonly StoredRecord[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('バックアップファイルが JSON として読めません');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('バックアップ形式が不正です');
  }

  // Encrypted envelope → decrypt to the inner plaintext, then re-parse.
  const maybeEnc = parsed as Partial<EncryptedBackupFile>;
  if (maybeEnc.encrypted === true) {
    if (!password) throw new Error('暗号化バックアップの復元にはパスワードが必要です');
    if (!isEncryptedBundle(maybeEnc.payload)) throw new Error('暗号化バックアップの形式が不正です');
    const inner = await decryptString(maybeEnc.payload, password);
    return parseBackup(inner);
  }

  const file = parsed as Partial<BackupFile>;
  if (file.app !== 'service-hub') throw new Error('このアプリのバックアップファイルではありません');
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) {
    throw new Error('対応していないバックアップ版数です');
  }
  if (!Array.isArray(file.records)) throw new Error('records 配列がありません');

  // 完全性チェック: checksum があれば records と照合し、破損/改ざんを検知。
  if (typeof file.checksum === 'string') {
    const actual = await sha256Hex(JSON.stringify(file.records));
    if (actual !== file.checksum) {
      throw new Error('バックアップが破損または改ざんされています (チェックサム不一致)');
    }
  }

  return file.records as StoredRecord[];
}

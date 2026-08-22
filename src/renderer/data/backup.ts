/**
 * Backup / restore — serialize the entire local record store to a single
 * JSON file the user can download (端末移行・災害復旧), and parse it back.
 *
 * バックアップに **SHA-256 チェックサム**を埋め込み、復元時に再計算して照合する。
 * チェックサムは records を正規化した JSON (`JSON.stringify(records)`) に対して
 * 計算するため、再フォーマット (整形/空白) には強く、内容の変化には反応する。
 *
 * ## これが検知するのは「破損」であって「改ざん」ではない
 *
 * 2026-08-22 まで、ここにも画面にも `docs/DATA_PROTECTION.md` にも
 * 「**改ざん検知**」と書いてあった。**鍵の無いハッシュを同じファイルの中に
 * 置いても、改ざんは検知できない** —— 中身を書き換える人は、続けて
 * checksum を計算し直すだけでよい。実測した (`backup.test.ts` の
 * 「平文バックアップの SHA-256 が守るもの・守らないもの」):
 *
 *     records を書き換え → checksum を計算し直す → **復元は通る**
 *     records を書き換え → checksum はそのまま     → 落ちる (破損検知は効く)
 *
 * 守れるのは、転送中の切り詰め・ディスクのビット反転・編集ミスといった
 * **意図しない壊れ方**である。これは価値のある保証なので checksum は残すし、
 * 省略も許さない (下記) —— が、「改ざんされていないことを確かめた」と
 * 利用者に思わせてはいけない。
 *
 * **改ざんに耐えるのは暗号化バックアップのほう。** AES-GCM の認証タグは
 * パスフレーズを知らない改変を復号の時点で落とす。改ざんを心配する用途では
 * パスワードを設定して書き出すのが正しい答えで、平文側に鍵の無い MAC を
 * 足しても意味は増えない (鍵の置き場が無い)。
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
  /**
   * SHA-256 hex of `JSON.stringify(records)`。**必須**。
   *
   * かつては省略可にしてあり、無ければ照合を飛ばしていた。それは
   * 「checksum の行を消すだけで照合を無効化できる」という意味で、
   * `alg: none` と同じ形をしていた。
   *
   * ただし**必須にしても得られるのは破損検知だけ**である (モジュール冒頭)。
   * 鍵が無いので、書き換えた側が計算し直せば通る。
   * 省略を許した理由は「旧バックアップ互換」だったが、git を辿ると
   * このファイルの最初のコミットから常に checksum を書いており、
   * **checksum の無いバックアップをこのアプリが作ったことは一度も無い**。
   * 守る対象が存在しない互換のために検知を捨てていた。
   */
  readonly checksum: string;
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
    // parsed が null (JSON.parse('null')) のとき `?.` を外すと parsed.encrypted で
    // 例外になるが、その場合も下の catch で false を返すため、`?.`↔`.` は equivalent。
    // Stryker disable next-line OptionalChaining
    return parsed?.encrypted === true && isEncryptedBundle(parsed.payload);
  } catch {
    return false;
  }
}

/**
 * Parse + validate a backup file. Throws a user-facing message if the envelope
 * is wrong or the integrity checksum fails. Returns the records array
 * (record-level validation is done by `store.importAll`, which drops malformed
 * entries). checksum が無いファイルは**拒否する** (理由は BackupFile.checksum)。
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

  // 破損検知: records と照合する。**改ざん検知ではない** (モジュール冒頭)。
  // **checksum が無いファイルは受け付けない。** 省略を許すと、
  // checksum の行を消すだけで照合ごと飛ばせる。
  if (typeof file.checksum !== 'string') {
    throw new Error('完全性チェックサムがありません (このアプリが作ったバックアップではありません)');
  }
  const actual = await sha256Hex(JSON.stringify(file.records));
  if (actual !== file.checksum) {
    throw new Error('バックアップファイルが破損しています (チェックサム不一致)');
  }

  return file.records as StoredRecord[];
}

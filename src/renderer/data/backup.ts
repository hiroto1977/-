/**
 * Backup / restore — serialize the entire local record store to a single
 * JSON file the user can download (端末移行・災害復旧), and parse it back.
 * Pure serialization here; the IndexedDB read/write is `store.exportAll()` /
 * `store.importAll()`.
 */
import type { StoredRecord } from './store';

export const BACKUP_VERSION = 1;

export interface BackupFile {
  readonly app: 'service-hub';
  readonly version: number;
  readonly exportedAt: string;
  readonly records: readonly StoredRecord[];
}

export function serializeBackup(records: readonly StoredRecord[], now: Date = new Date()): string {
  const file: BackupFile = {
    app: 'service-hub',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    records,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Parse + shallow-validate a backup file. Throws a user-facing message if the
 * envelope is wrong; returns the records array (record-level validation is
 * done by `store.importAll`, which drops malformed entries).
 */
export function parseBackup(text: string): readonly StoredRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('バックアップファイルが JSON として読めません');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('バックアップ形式が不正です');
  }
  const file = parsed as Partial<BackupFile>;
  if (file.app !== 'service-hub') throw new Error('このアプリのバックアップファイルではありません');
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) {
    throw new Error('対応していないバックアップ版数です');
  }
  if (!Array.isArray(file.records)) throw new Error('records 配列がありません');
  return file.records as StoredRecord[];
}

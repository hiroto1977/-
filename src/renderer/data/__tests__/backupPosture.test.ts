import { describe, expect, it } from 'vitest';
import { cloudBackupToPostureInputs, latestBackupMtime, MS_PER_DAY } from '../backupPosture';
import type { BackupManifest, BackupEntry } from '../cloudBackup';

const NOW = 1_000 * MS_PER_DAY; // 任意の固定 now

function entry(mtime: number): BackupEntry {
  return { path: 'p', size: 1, sha256: 'x', version: 1, chunkRefs: [], encryptedSize: 1, mtime };
}
function manifest(mtimes: number[]): BackupManifest {
  return { version: 1, entries: mtimes.map(entry), treeHash: 'h' };
}

describe('latestBackupMtime', () => {
  it('returns null for a null manifest', () => {
    expect(latestBackupMtime(null)).toBeNull();
  });
  it('returns null for an empty manifest', () => {
    expect(latestBackupMtime(manifest([]))).toBeNull();
  });
  it('returns the maximum mtime across entries', () => {
    expect(latestBackupMtime(manifest([100, 500, 300]))).toBe(500);
  });
});

describe('cloudBackupToPostureInputs', () => {
  it('reports never-backed-up (null age) when there is no manifest', () => {
    const r = cloudBackupToPostureInputs(null, ['drive'], true, NOW);
    expect(r).toEqual({ configuredSinks: ['drive'], lastBackupAgeDays: null, encryptedBackup: false });
  });

  it('reports never-backed-up for an empty manifest', () => {
    const r = cloudBackupToPostureInputs(manifest([]), ['drive'], true, NOW);
    expect(r.lastBackupAgeDays).toBeNull();
    expect(r.encryptedBackup).toBe(false); // バックアップが無ければ暗号化扱いしない
  });

  it('computes age in whole days from the latest mtime', () => {
    const r = cloudBackupToPostureInputs(manifest([NOW - 3 * MS_PER_DAY]), ['dropbox'], false, NOW);
    expect(r.lastBackupAgeDays).toBe(3);
    expect(r.configuredSinks).toEqual(['dropbox']);
  });

  it('floors a partial day', () => {
    const r = cloudBackupToPostureInputs(manifest([NOW - (2 * MS_PER_DAY + MS_PER_DAY / 2)]), [], false, NOW);
    expect(r.lastBackupAgeDays).toBe(2); // 2.5日 → 2
  });

  it('clamps a future-dated backup to 0 days', () => {
    const r = cloudBackupToPostureInputs(manifest([NOW + 5 * MS_PER_DAY]), [], false, NOW);
    expect(r.lastBackupAgeDays).toBe(0);
  });

  it('marks encryptedBackup true only when a backup exists and is encrypted', () => {
    expect(cloudBackupToPostureInputs(manifest([NOW]), [], true, NOW).encryptedBackup).toBe(true);
    expect(cloudBackupToPostureInputs(manifest([NOW]), [], false, NOW).encryptedBackup).toBe(false);
  });

  it('is deterministic', () => {
    const m = manifest([NOW - MS_PER_DAY]);
    expect(cloudBackupToPostureInputs(m, ['drive'], true, NOW)).toEqual(
      cloudBackupToPostureInputs(m, ['drive'], true, NOW),
    );
  });
});

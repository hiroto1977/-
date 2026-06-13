import { describe, expect, it } from 'vitest';
import {
  buildDbSecurityReport,
  gradeForScore,
  MAX_BACKUP_AGE_DAYS,
  GRADE_A_MIN,
  GRADE_B_MIN,
  GRADE_C_MIN,
  type DbSecurityInputs,
} from '../dbSecurityPosture';

const allOn: DbSecurityInputs = {
  encryptionEnabled: true,
  masterPasswordSet: true,
  integrityVerified: true,
  autoLockEnabled: true,
  cloudBackup: {
    configuredSinks: ['drive', 'dropbox'],
    lastBackupAgeDays: 1,
    encryptedBackup: true,
  },
};

const allOff: DbSecurityInputs = {
  encryptionEnabled: false,
  masterPasswordSet: false,
  integrityVerified: false,
  autoLockEnabled: false,
  cloudBackup: { configuredSinks: [], lastBackupAgeDays: null, encryptedBackup: false },
};

describe('gradeForScore', () => {
  it('maps score to grade at the boundaries', () => {
    expect(gradeForScore(100)).toBe('A');
    expect(gradeForScore(GRADE_A_MIN)).toBe('A'); // 90
    expect(gradeForScore(GRADE_A_MIN - 1)).toBe('B'); // 89
    expect(gradeForScore(GRADE_B_MIN)).toBe('B'); // 70
    expect(gradeForScore(GRADE_B_MIN - 1)).toBe('C'); // 69
    expect(gradeForScore(GRADE_C_MIN)).toBe('C'); // 50
    expect(gradeForScore(GRADE_C_MIN - 1)).toBe('D'); // 49
    expect(gradeForScore(0)).toBe('D');
  });
});

describe('buildDbSecurityReport', () => {
  it('scores a fully hardened DB at 100 / grade A with no findings', () => {
    const r = buildDbSecurityReport(allOn);
    expect(r.score).toBe(100);
    expect(r.grade).toBe('A');
    expect(r.findings).toEqual([]);
    expect(r.checks).toHaveLength(7);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });

  it('scores a fully unprotected DB at 0 / grade D with all checks as findings', () => {
    const r = buildDbSecurityReport(allOff);
    expect(r.score).toBe(0);
    expect(r.grade).toBe('D');
    expect(r.findings).toHaveLength(7);
  });

  it('sums only the weights of passing checks', () => {
    // 暗号化(30) + マスターPW(15) のみ ON → 45。
    const r = buildDbSecurityReport({
      ...allOff,
      encryptionEnabled: true,
      masterPasswordSet: true,
    });
    expect(r.score).toBe(45);
    expect(r.grade).toBe('D'); // 45 < 50
  });

  it('reorders findings to weight-descending when checks are not pre-sorted (ascending input)', () => {
    // checks 配列順では auto-lock(10) が integrity(15) より前。findings は重み降順へ並べ替える。
    const r = buildDbSecurityReport({ ...allOn, autoLockEnabled: false, integrityVerified: false });
    expect(r.findings.map((f) => f.id)).toEqual(['integrity', 'auto-lock']);
    expect(r.findings[0]!.weight).toBeGreaterThan(r.findings[1]!.weight);
  });

  it('keeps weight-descending order when checks order already is descending', () => {
    // encryption(30) が auto-lock(10) より前 = 既に降順。並べ替えても順序は不変。
    const r = buildDbSecurityReport({ ...allOn, encryptionEnabled: false, autoLockEnabled: false });
    expect(r.findings.map((f) => f.id)).toEqual(['encryption', 'auto-lock']);
    expect(r.score).toBe(60);
  });

  it('treats a never-backed-up DB (null age) as stale', () => {
    const r = buildDbSecurityReport({
      ...allOn,
      cloudBackup: { ...allOn.cloudBackup, lastBackupAgeDays: null },
    });
    expect(r.findings.map((f) => f.id)).toContain('backup-fresh');
  });

  it('treats a backup exactly at the freshness threshold as fresh (<= boundary)', () => {
    const r = buildDbSecurityReport({
      ...allOn,
      cloudBackup: { ...allOn.cloudBackup, lastBackupAgeDays: MAX_BACKUP_AGE_DAYS },
    });
    expect(r.findings.map((f) => f.id)).not.toContain('backup-fresh');
  });

  it('treats a backup older than the threshold as stale', () => {
    const r = buildDbSecurityReport({
      ...allOn,
      cloudBackup: { ...allOn.cloudBackup, lastBackupAgeDays: MAX_BACKUP_AGE_DAYS + 1 },
    });
    expect(r.findings.map((f) => f.id)).toContain('backup-fresh');
  });

  it('flags backup-configured only when no sink is configured', () => {
    expect(
      buildDbSecurityReport({ ...allOn, cloudBackup: { ...allOn.cloudBackup, configuredSinks: [] } })
        .findings.map((f) => f.id),
    ).toContain('backup-configured');
    expect(
      buildDbSecurityReport({ ...allOn, cloudBackup: { ...allOn.cloudBackup, configuredSinks: ['drive'] } })
        .findings.map((f) => f.id),
    ).not.toContain('backup-configured');
  });

  it('is deterministic', () => {
    expect(buildDbSecurityReport(allOn)).toEqual(buildDbSecurityReport(allOn));
  });
});

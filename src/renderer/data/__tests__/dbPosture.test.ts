/** @vitest-environment jsdom */
/**
 * 診断入力が **実測から**組み立てられること (2026-08 監査の回帰)。
 *
 * 監査前は `SecurityPage` が画面の中で入力を作り、`autoLockEnabled` を `false`
 * 固定で渡していた。検出器 (`isAutoLockActive`) にテストがあっても、画面が
 * それを呼んでいるかは誰も見ていなかった — 定数へ戻してもテストは緑のままだった。
 * 組み立てを `data/dbPosture.ts` へ出したので、ここが「実測 → 入力」を固定する。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentDbSecurityInputs } from '../dbPosture';
import { _resetAutoLockActiveForTests, startAutoLock, type AutoLockHandle } from '../../security/autoLock';
import { buildDbSecurityReport } from '../../../shared/dbSecurityPosture';

function stubDeps() {
  return {
    now: () => 1_000_000,
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  };
}

let handles: AutoLockHandle[] = [];
beforeEach(() => {
  _resetAutoLockActiveForTests();
  handles = [];
  localStorage.clear();
});
afterEach(() => {
  for (const h of handles) h.dispose();
  _resetAutoLockActiveForTests();
});

describe('currentDbSecurityInputs — 自動ロック', () => {
  it('動いていなければ false', () => {
    expect(currentDbSecurityInputs().autoLockEnabled).toBe(false);
  });

  it('動いていれば true (定数固定に戻したらここが落ちる)', () => {
    handles.push(startAutoLock({ onLock: () => undefined }, stubDeps()));
    expect(currentDbSecurityInputs().autoLockEnabled).toBe(true);
  });

  it('診断レポートの「自動ロック」が改善候補から外れる', () => {
    handles.push(startAutoLock({ onLock: () => undefined }, stubDeps()));
    const report = buildDbSecurityReport(currentDbSecurityInputs());
    expect(report.findings.map((f) => f.id)).not.toContain('auto-lock');
    expect(report.checks.find((c) => c.id === 'auto-lock')?.ok).toBe(true);
  });

  it('動いていなければ改善候補に挙がる (診断が甘くなっていない)', () => {
    const report = buildDbSecurityReport(currentDbSecurityInputs());
    expect(report.findings.map((f) => f.id)).toContain('auto-lock');
  });
});

describe('currentDbSecurityInputs — 観測していない項目', () => {
  it('整合性の常時検証は未配線なので false のまま', () => {
    expect(currentDbSecurityInputs().integrityVerified).toBe(false);
  });

  it('クラウド同期は永続化されないので構成シンクは実際に 0 件', () => {
    const { cloudBackup } = currentDbSecurityInputs();
    expect(cloudBackup.configuredSinks).toEqual([]);
    expect(cloudBackup.lastBackupAgeDays).toBeNull();
    expect(cloudBackup.encryptedBackup).toBe(false);
  });

  it('暗号化とマスターパスワードは同じ観測から導く', () => {
    const i = currentDbSecurityInputs();
    expect(i.masterPasswordSet).toBe(i.encryptionEnabled);
  });
});

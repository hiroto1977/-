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
// 保管庫を実際に初期化して観測するため (jsdom には IndexedDB も subtle も無い)。
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
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

/*
 * 2026-08-25 の続き —— 同じ形が **2 つ**残っていた。
 *
 * 冒頭が書いているのは「実測すべき欄を定数で渡していた」話だが、
 * `masterPasswordSet` は `encrypted` から**導出**されていた。
 * 片側の含意 (暗号化が有効 ⇒ マスターパスワードは設定済み) としては
 * 正しいが、等号として使うと逆が言えない。レコード暗号化は配線されて
 * おらず `encrypted` は常に false なので、**この欄は常に false** だった。
 *
 * ブラウザ版はマスターパスワードを設定しないと保管庫が作れず、
 * 診断画面にも到達できない。**必ず設定している利用者に「未設定 (high)」と
 * 告げていた** —— 冒頭の `autoLockEnabled` と同じ形である。
 */
describe('マスターパスワードは導出せず観測する', () => {
  // fake-indexeddb は同一プロセスで保持されるので、毎回まっさらにする
  // (singleton を戻すだけだと「既に初期化されています」で落ちる)。
  const freshVault = async () => {
    const mod = await import('../../security/vault');
    mod._resetVaultForTests();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('business-hub-vault');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    return mod;
  };

  it('保管庫が解錠されていれば設定済みと見なす', async () => {
    const { getVault } = await freshVault();
    expect(currentDbSecurityInputs().masterPasswordSet).toBe(false);
    await getVault().initialize('correct horse battery staple');
    expect(getVault().isUnlocked()).toBe(true);
    expect(currentDbSecurityInputs().masterPasswordSet).toBe(true);
  });

  /*
   * **点数に効いていることまで見る。** 欄が true になっても、診断が
   * それを使っていなければ利用者の画面は変わらない。
   */
  it('設定済みなら master-password の項目が ✓ になり点が入る', async () => {
    const { getVault } = await freshVault();
    const before = buildDbSecurityReport(currentDbSecurityInputs());
    await getVault().initialize('correct horse battery staple');
    const after = buildDbSecurityReport(currentDbSecurityInputs());
    const mp = (r: typeof before) => r.checks.find((c) => c.id === 'master-password');
    expect(mp(before)?.ok).toBe(false);
    expect(mp(after)?.ok).toBe(true);
    expect(after.score).toBeGreaterThan(before.score);
  });
});

/*
 * 「読む関数」を用意しただけでは、**読む時刻**は誰も保証しない。
 * 診断画面は `useMemo(..., [])` で**初回描画中**に読んでおり、これは
 * あらゆる `useEffect` より前 —— 自動ロックが始まる前だった。
 * 変化を伝える口を置いたので、それが本当に鳴ることを固定する。
 */
describe('自動ロックの変化が購読者へ伝わる', () => {
  it('開始と終了で通知が来る', async () => {
    const { subscribeAutoLockActive, isAutoLockActive } = await import('../../security/autoLock');
    const seen: boolean[] = [];
    const unsubscribe = subscribeAutoLockActive(() => seen.push(isAutoLockActive()));
    const h = startAutoLock({ onLock: () => undefined }, stubDeps());
    handles.push(h);
    expect(seen).toEqual([true]);
    h.dispose();
    expect(seen).toEqual([true, false]);
    unsubscribe();
    startAutoLock({ onLock: () => undefined }, stubDeps()).dispose();
    expect(seen).toEqual([true, false]);
  });
});

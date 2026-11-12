/**
 * **`verifyPassword` は状態を変えずに答える** (2026-10-29 · パス 554 · threat: T-219)。
 * 送り先を変える前の持ち主の確認に使う —— `unlock()` を流用すると鍵を据え直し世代を進める。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { _resetVaultForTests, getVault } from '../vault';

const PW = 'correct-horse-battery-9';

async function freshVault(): Promise<void> {
  _resetVaultForTests();
  // IndexedDB は fake-indexeddb のプロセス内の物 —— 前の検査の保管庫を消す。
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-vault');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  _resetVaultForTests();
}

describe('vault.verifyPassword (threat: T-219)', () => {
  beforeEach(freshVault);

  it('★ 合えば true、違えば false —— どちらも鍵を据えず施錠の状態を変えない (threat: T-219)', async () => {
    const v = getVault();
    await v.initialize(PW);
    v.lock();
    expect(v.isUnlocked()).toBe(false);
    expect(await v.verifyPassword(PW)).toBe(true);
    expect(await v.verifyPassword('wrong-horse-battery-9')).toBe(false);
    expect(v.isUnlocked(), '照合で解錠されてはいけない').toBe(false);
  });

  it('解錠中に照合しても解錠は保たれ、違うパスワードでも施錠されない', async () => {
    const v = getVault();
    await v.initialize(PW);
    expect(v.isUnlocked()).toBe(true);
    expect(await v.verifyPassword('wrong-horse-battery-9')).toBe(false);
    expect(v.isUnlocked()).toBe(true);
    await v.setToken('github', 'ghp_x');
    expect(await v.getToken('github')).toBe('ghp_x');
  });

  it('空文字と非文字列は照合せず false (PBKDF2 を回さない)', async () => {
    const v = getVault();
    await v.initialize(PW);
    const t0 = Date.now();
    expect(await v.verifyPassword('')).toBe(false);
    expect(await v.verifyPassword(undefined as unknown as string)).toBe(false);
    expect(Date.now() - t0).toBeLessThan(50);
  });

  it('★ 未初期化なら「違う」ではなく投げる (無いと違うを混ぜない)', async () => {
    await expect(getVault().verifyPassword(PW)).rejects.toThrow(new Error('Vault が未初期化です。初回設定を完了してください'));
  });

  it('パスワードを変えた後は新しい方だけが合う', async () => {
    const v = getVault();
    await v.initialize(PW);
    await v.changePassword(PW, 'next-horse-battery-10');
    expect(await v.verifyPassword(PW)).toBe(false);
    expect(await v.verifyPassword('next-horse-battery-10')).toBe(true);
  });
});

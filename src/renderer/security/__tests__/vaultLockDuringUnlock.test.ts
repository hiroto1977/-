/**
 * 解錠の途中で届いた施錠を、解錠の完了が上書きしない (2026-10-15 · パス 522 ·
 * threat: T-049)。
 *
 * `unlock()` は PBKDF2 (600k 回) を待つあいだ制御を手放す。その窓に
 * `lock()` (自動施錠・別のタブからの中継・「今すぐロック」) が届くと、
 * 直す前は解錠の解決が `currentKey` を据え直し、**利用者が施錠したつもりの
 * 保管庫が解錠されたまま**になっていた (実測: `lock()` の直後は locked、
 * `unlock()` の解決後は unlocked)。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetVaultForTests, getVault } from '../vault';

const PW = 'correct-horse-battery-staple';

function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-vault');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  _resetVaultForTests();
  await clearIdb();
});

describe('Vault — lock() during unlock() (threat: T-049)', () => {
  it('★ 導出中に lock() が届けば、unlock() は鍵を据えずに断り、施錠のまま (threat: T-049)', async () => {
    const v = getVault();
    await v.initialize(PW);
    v.lock();
    expect(v.isUnlocked()).toBe(false);
    const p = v.unlock(PW); // PBKDF2 が走っている
    v.lock(); // ここで施錠が届く
    await expect(p).rejects.toThrow(/解錠の途中で施錠されました/);
    expect(v.isUnlocked()).toBe(false);
  });

  it('★ 対照: 施錠が届かなければ unlock() は今までどおり解錠する', async () => {
    const v = getVault();
    await v.initialize(PW);
    v.lock();
    await v.unlock(PW);
    expect(v.isUnlocked()).toBe(true);
  });

  it('★ 断られた後にもう一度 unlock() すれば解錠できる (世代は進むだけで閉め出さない)', async () => {
    const v = getVault();
    await v.initialize(PW);
    v.lock();
    const p = v.unlock(PW);
    v.lock();
    await expect(p).rejects.toThrow();
    await v.unlock(PW);
    expect(v.isUnlocked()).toBe(true);
    await v.setToken('github', 'ghp_x');
    expect(await v.getToken('github')).toBe('ghp_x');
  });
});

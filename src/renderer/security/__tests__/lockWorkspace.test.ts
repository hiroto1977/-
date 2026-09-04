/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { _resetVaultForTests, getVault } from '../vault';
import { lockWorkspace } from '../lockWorkspace';

// jsdom doesn't provide crypto.subtle. Pull it in from Node's webcrypto.
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

/*
 * **施錠の値打ちは鍵を落とすことで、画面を隠すことではない。**
 *
 * 直す前は `App.tsx` の `onLock` に `getVault().lock()` と
 * `setVaultUnlocked(false)` が並べて書いてあり、実測で**前者だけ消しても
 * 10,381 件の検査が全部緑のまま通った** (型検査も通る)。
 * 「画面は施錠、鍵は生きたまま」は施錠の演出で、施錠後に `getToken` を
 * 呼べば資格情報は全部読める。
 *
 * ここでは `lockWorkspace` の**振る舞い**を留める —— 鍵が実際に使えなく
 * なること、画面への通知より**先に**落ちること、通知が投げても落ちること。
 */
function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-vault');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('lockWorkspace', () => {
  const PASSWORD = 'correct-horse-battery-staple';

  beforeEach(async () => {
    _resetVaultForTests();
    await clearIdb();
    localStorage.clear();
  });

  async function unlockedVault() {
    const vault = getVault();
    await vault.initialize(PASSWORD);
    await vault.setToken('github', 'ghp_secret_token');
    expect(await vault.getToken('github')).toBe('ghp_secret_token');
    return vault;
  }

  it('鍵を落とす — 施錠後はトークンを読めない', async () => {
    const vault = await unlockedVault();
    lockWorkspace();
    // ★ ここが本体。画面状態ではなく、鍵が使えないことを見る。
    expect(await vault.status()).toBe('locked');
    await expect(vault.getToken('github')).rejects.toThrow();
  });

  it('画面へ知らせる前に鍵を落とす', async () => {
    const vault = await unlockedVault();
    let unlockedWhenNotified: boolean | null = null;
    lockWorkspace(() => {
      // 通知の時点で既に施錠済みでなければならない。逆順だと、画面更新が
      // 投げた場合に「施錠表示なのに鍵は生きている」状態が残る。
      unlockedWhenNotified = vault.isUnlocked();
    });
    expect(unlockedWhenNotified).toBe(false);
    expect(await vault.status()).toBe('locked');
  });

  it('画面への通知が投げても鍵は落ちている', async () => {
    const vault = await unlockedVault();
    expect(() =>
      lockWorkspace(() => {
        throw new Error('画面更新に失敗');
      }),
    ).toThrow('画面更新に失敗');
    // 通知の失敗で鍵が残る方が危ない。
    expect(await vault.status()).toBe('locked');
    await expect(vault.getToken('github')).rejects.toThrow();
  });
});

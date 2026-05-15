/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
// `indexedDB.deleteDatabase` for cleanup between tests
import { _resetVaultForTests, getVault } from '../vault';

// jsdom doesn't provide crypto.subtle. Pull it in from Node's webcrypto.
import { webcrypto } from 'node:crypto';
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

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

describe('Vault — initialization', () => {
  it('starts uninitialized', async () => {
    const vault = getVault();
    expect(await vault.status()).toBe('uninitialized');
    expect(vault.isUnlocked()).toBe(false);
  });

  it('initialize() with a strong password unlocks the vault', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');
    expect(vault.isUnlocked()).toBe(true);
    expect(await vault.status()).toBe('unlocked');
  });

  it('rejects passwords shorter than 8 chars', async () => {
    const vault = getVault();
    await expect(vault.initialize('short')).rejects.toThrow(/8 文字以上/);
  });

  it('rejects oversized passwords (> 256 chars)', async () => {
    const vault = getVault();
    await expect(vault.initialize('x'.repeat(257))).rejects.toThrow(/256 字以内/);
  });

  it('rejects re-initialization when vault already exists', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');
    _resetVaultForTests();
    const v2 = getVault();
    await expect(v2.initialize('another-strong-password')).rejects.toThrow(/既に初期化/);
  });
});

describe('Vault — unlock', () => {
  it('reports locked status after restart (singleton reset)', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');
    _resetVaultForTests();
    const v2 = getVault();
    expect(await v2.status()).toBe('locked');
    expect(v2.isUnlocked()).toBe(false);
  });

  it('unlocks with the correct password', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');
    _resetVaultForTests();
    const v2 = getVault();
    await v2.unlock('correct-horse-battery-staple');
    expect(v2.isUnlocked()).toBe(true);
  });

  it('rejects unlock with a wrong password (KCV check)', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');
    _resetVaultForTests();
    const v2 = getVault();
    await expect(v2.unlock('wrong-password-attempt')).rejects.toThrow(/パスワードが違います/);
    expect(v2.isUnlocked()).toBe(false);
  });

  it('rejects unlock when vault is uninitialized', async () => {
    const vault = getVault();
    await expect(vault.unlock('anything')).rejects.toThrow(/未初期化/);
  });

  it('rejects unlock with empty password', async () => {
    const vault = getVault();
    await expect(vault.unlock('')).rejects.toThrow(/入力してください/);
  });
});

describe('Vault — token operations', () => {
  it('setToken + getToken round-trips the secret', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');
    await vault.setToken('github', 'ghp_secret_token_xyz');
    expect(await vault.getToken('github')).toBe('ghp_secret_token_xyz');
  });

  it('setToken throws when vault is locked', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');
    vault.lock();
    await expect(vault.setToken('github', 'x')).rejects.toThrow(/ロック/);
  });

  it('getToken returns null for unknown serviceId', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');
    expect(await vault.getToken('never-set')).toBeNull();
  });

  it('getToken returns null when wrong key (decrypt fails)', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');
    await vault.setToken('github', 'ghp_xyz');
    _resetVaultForTests();
    // Re-initialize with a different password — would normally fail at unlock,
    // but the underlying IndexedDB still holds the old ciphertext. Simulate
    // by directly calling getToken after re-init (which deletes meta first).
    // For the public-API test: re-create vault, initialize fresh, ciphertext
    // from old salt is unreadable. The getToken path returns null safely.
    const v2 = getVault();
    // Need to clear and re-init since initialize() refuses if vault exists.
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('business-hub-vault', 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').delete('vault');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
    await v2.initialize('different-password-12345');
    // The token store still has the old ciphertext under a now-wrong key.
    expect(await v2.getToken('github')).toBeNull();
  });

  it('clearToken removes the entry', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');
    await vault.setToken('slack', 'xoxp-abc');
    await vault.clearToken('slack');
    expect(await vault.getToken('slack')).toBeNull();
  });

  it('listConfigured returns all stored service ids', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');
    await vault.setToken('github', 'a');
    await vault.setToken('slack', 'b');
    await vault.setToken('notion', 'c');
    const list = await vault.listConfigured();
    expect(new Set(list)).toEqual(new Set(['github', 'slack', 'notion']));
  });

  it('rejects oversized token (> 8192 chars)', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');
    await expect(vault.setToken('github', 'x'.repeat(8193))).rejects.toThrow(/1-8192/);
  });

  it('rejects empty serviceId / oversize serviceId', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');
    await expect(vault.setToken('', 'token')).rejects.toThrow(/serviceId/);
    await expect(vault.setToken('x'.repeat(65), 'token')).rejects.toThrow(/serviceId/);
  });

  it('lock() prevents further token reads', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');
    await vault.setToken('github', 'ghp_xyz');
    vault.lock();
    expect(vault.isUnlocked()).toBe(false);
    await expect(vault.getToken('github')).rejects.toThrow(/ロック/);
  });
});

describe('Vault — singleton', () => {
  it('getVault() returns the same instance', () => {
    const a = getVault();
    const b = getVault();
    expect(a).toBe(b);
  });
});

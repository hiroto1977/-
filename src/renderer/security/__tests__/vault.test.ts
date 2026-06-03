/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
// `indexedDB.deleteDatabase` for cleanup between tests
import { _resetVaultForTests, getVault, NoRecoveryBranchError } from '../vault';
import { decodeMnemonic, encodeMnemonic, looksLikeValidMnemonic } from '../mnemonic';

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

// === Phase E: recovery key tests ============================================

describe('Vault — initialize returns recovery mnemonic', () => {
  it('returns a 24-word BIP-39 mnemonic on initialization', async () => {
    const v = getVault();
    const result = await v.initialize('correct-horse-battery-staple');
    expect(typeof result.mnemonic).toBe('string');
    const words = result.mnemonic.split(' ');
    expect(words).toHaveLength(24);
    expect(looksLikeValidMnemonic(result.mnemonic)).toBe(true);
  });

  it('produces a different mnemonic each initialization (cryptographically random)', async () => {
    const v = getVault();
    const a = await v.initialize('correct-horse-battery-staple');
    _resetVaultForTests();
    await clearIdb();
    const v2 = getVault();
    const b = await v2.initialize('different-password-xyz');
    expect(a.mnemonic).not.toBe(b.mnemonic);
  });

  it('mnemonic decodes to valid 32-byte entropy', async () => {
    const v = getVault();
    const { mnemonic } = await v.initialize('correct-horse-battery-staple');
    const entropy = await decodeMnemonic(mnemonic);
    expect(entropy).toHaveLength(32);
  });
});

describe('Vault — recoverWithMnemonic', () => {
  it('restores tokens after password loss using the recovery mnemonic', async () => {
    const v = getVault();
    const { mnemonic } = await v.initialize('original-password-12345');
    await v.setToken('github', 'ghp_secret_xyz');
    await v.setToken('slack', 'xoxp-abc');

    // Simulate restart + password lost
    _resetVaultForTests();
    const v2 = getVault();

    // Wrong password fails as before
    await expect(v2.unlock('forgot-this-password')).rejects.toThrow(/パスワードが違います/);

    // Recover with mnemonic + set new password
    await v2.recoverWithMnemonic(mnemonic, 'brand-new-password-2026');

    // All tokens preserved
    expect(await v2.getToken('github')).toBe('ghp_secret_xyz');
    expect(await v2.getToken('slack')).toBe('xoxp-abc');

    // New password works for future unlocks
    _resetVaultForTests();
    const v3 = getVault();
    await v3.unlock('brand-new-password-2026');
    expect(await v3.getToken('github')).toBe('ghp_secret_xyz');
  });

  it('rejects wrong mnemonic (different 24 valid words → checksum still passes → KCV fails)', async () => {
    const v = getVault();
    const { mnemonic } = await v.initialize('original-password-12345');
    _resetVaultForTests();
    const v2 = getVault();

    // Different but VALID mnemonic. Derive dynamically from a fixed
    // entropy (0xff..ff) so this test is not pinned to a hard-coded
    // BIP-39 wordlist row — if the underlying wordlist or checksum
    // algorithm ever changes, the test still constructs a valid foreign
    // mnemonic instead of silently using a now-invalid one.
    const otherMnemonic = await encodeMnemonic(new Uint8Array(32).fill(0xff));
    // Collision guard: an astronomically unlikely overlap between the
    // randomly generated initialize() mnemonic and our fixed 0xff one
    // would mask this test (recoverWithMnemonic would succeed). Assert
    // they differ before exercising the error path.
    expect(otherMnemonic).not.toBe(mnemonic);
    await expect(v2.recoverWithMnemonic(otherMnemonic, 'new-password-1234')).rejects.toThrow(
      /リカバリーキーが違います/,
    );
  });

  it('rejects mnemonic with bad checksum (typo)', async () => {
    const v = getVault();
    const { mnemonic } = await v.initialize('original-password-12345');
    _resetVaultForTests();
    const v2 = getVault();

    const words = mnemonic.split(' ');
    words[10] = words[10] === 'ability' ? 'zoo' : 'ability'; // swap
    await expect(v2.recoverWithMnemonic(words.join(' '), 'new-password-1234')).rejects.toThrow(
      /checksum invalid/,
    );
  });

  it('rejects mnemonic with unknown word', async () => {
    const v = getVault();
    await v.initialize('original-password-12345');
    _resetVaultForTests();
    const v2 = getVault();
    await expect(
      v2.recoverWithMnemonic('notaword '.repeat(24).trim(), 'new-password-1234'),
    ).rejects.toThrow(/unknown word/);
  });

  it('rejects too-short new password', async () => {
    const v = getVault();
    const { mnemonic } = await v.initialize('original-password-12345');
    _resetVaultForTests();
    const v2 = getVault();
    await expect(v2.recoverWithMnemonic(mnemonic, 'short')).rejects.toThrow(/8 文字以上/);
  });

  it('rejects oversize new password', async () => {
    const v = getVault();
    const { mnemonic } = await v.initialize('original-password-12345');
    _resetVaultForTests();
    const v2 = getVault();
    await expect(v2.recoverWithMnemonic(mnemonic, 'x'.repeat(257))).rejects.toThrow(/256 字以内/);
  });

  it('throws when vault is uninitialized', async () => {
    const v = getVault();
    await expect(v.recoverWithMnemonic('abandon '.repeat(23) + 'art', 'new-password-1234'))
      .rejects.toThrow(/未初期化/);
  });

  it('original password STOPS working after recovery (replaced by new password)', async () => {
    const v = getVault();
    const { mnemonic } = await v.initialize('original-password-12345');
    _resetVaultForTests();
    const v2 = getVault();
    await v2.recoverWithMnemonic(mnemonic, 'brand-new-password-2026');
    _resetVaultForTests();
    const v3 = getVault();
    await expect(v3.unlock('original-password-12345')).rejects.toThrow(/パスワードが違います/);
  });
});

describe('Vault — revealRecoveryKey + rotateRecoveryKey (Phase E v1 stubs)', () => {
  it('revealRecoveryKey throws "not implemented" in v1', async () => {
    const v = getVault();
    await v.initialize('original-password-12345');
    await expect(v.revealRecoveryKey('original-password-12345')).rejects.toThrow(/未実装/);
  });

  it('rotateRecoveryKey throws "not implemented" in v1', async () => {
    const v = getVault();
    await v.initialize('original-password-12345');
    await expect(v.rotateRecoveryKey()).rejects.toThrow(/未実装/);
  });

  it('NoRecoveryBranchError is exported', () => {
    expect(typeof NoRecoveryBranchError).toBe('function');
    const e = new NoRecoveryBranchError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('NoRecoveryBranchError');
    // Message must carry actionable context — pin via substring match so
    // mutation testing catches an accidental empty-string replacement.
    expect(e.message).toMatch(/リカバリーキー/);
    expect(e.message).toMatch(/Phase E/);
  });
});

describe('Vault — recovery key derivation versioning (v1 domain separation)', () => {
  it('new vault stores recoveryVersion = 1 in meta', async () => {
    const v = getVault();
    await v.initialize('original-password-12345');
    // Read the persisted meta directly to confirm the version flag.
    const meta = await new Promise<Record<string, unknown> | undefined>((resolve) => {
      const req = indexedDB.open('business-hub-vault', 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('meta', 'readonly');
        const getReq = tx.objectStore('meta').get('vault');
        getReq.onsuccess = () => {
          db.close();
          resolve(getReq.result as Record<string, unknown> | undefined);
        };
      };
    });
    expect(meta).toBeDefined();
    expect(meta!.recoveryVersion).toBe(1);
  });

  // Helper: tear down the current vault meta to the v0 (legacy) layout —
  // strip `recoveryVersion` and re-wrap the recovery branch under the
  // unprefixed PBKDF2 input. Used by the auto-migration tests below.
  async function downgradeToLegacyV0(mnemonic: string): Promise<{
    originalRecoverySalt: Uint8Array;
  }> {
    const { normalizeMnemonic } = await import('../mnemonic');
    const normalized = normalizeMnemonic(mnemonic);

    type LegacyMeta = {
      recoverySalt: Uint8Array;
      recoveryIv: Uint8Array;
      recoveryKcv: Uint8Array;
      recoveryWrapIv: Uint8Array;
      recoveryWrappedKey: Uint8Array;
      recoveryVersion?: number;
      [k: string]: unknown;
    };
    const meta = await new Promise<LegacyMeta>((resolve, reject) => {
      const req = indexedDB.open('business-hub-vault', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('meta', 'readonly');
        const getReq = tx.objectStore('meta').get('vault');
        getReq.onsuccess = () => {
          db.close();
          resolve(getReq.result as LegacyMeta);
        };
        getReq.onerror = () => {
          db.close();
          reject(getReq.error);
        };
      };
    });

    // Unwrap master with v1 (current) derivation.
    const v1BaseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('service-hub-bip39-recovery-v1:' + normalized),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );
    const v1Key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: meta.recoverySalt as BufferSource, iterations: 600_000, hash: 'SHA-256' },
      v1BaseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const masterRaw = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: meta.recoveryWrapIv as BufferSource },
        v1Key,
        meta.recoveryWrappedKey as BufferSource,
      ),
    );

    // Re-wrap under v0 (no prefix) derivation.
    const v0BaseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(normalized),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );
    const v0Key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: meta.recoverySalt as BufferSource, iterations: 600_000, hash: 'SHA-256' },
      v0BaseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );

    const newKcvIv = crypto.getRandomValues(new Uint8Array(12));
    const newKcvCt = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: newKcvIv },
        v0Key,
        new TextEncoder().encode('service-hub-v1'),
      ),
    );
    const newWrapIv = crypto.getRandomValues(new Uint8Array(12));
    const newWrapCt = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: newWrapIv }, v0Key, masterRaw),
    );
    masterRaw.fill(0);

    const migrated: LegacyMeta = { ...meta };
    migrated.recoveryIv = newKcvIv;
    migrated.recoveryKcv = newKcvCt;
    migrated.recoveryWrapIv = newWrapIv;
    migrated.recoveryWrappedKey = newWrapCt;
    delete migrated.recoveryVersion;

    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('business-hub-vault', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').put(migrated, 'vault');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
    return { originalRecoverySalt: meta.recoverySalt };
  }

  // Helper: read the persisted vault meta from IndexedDB (read-only).
  async function readPersistedMeta(): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('business-hub-vault', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('meta', 'readonly');
        const getReq = tx.objectStore('meta').get('vault');
        getReq.onsuccess = () => {
          db.close();
          resolve(getReq.result as Record<string, unknown>);
        };
        getReq.onerror = () => {
          db.close();
          reject(getReq.error);
        };
      };
    });
  }

  it('legacy vault (recoveryVersion = undefined) still recovers via v0 derivation', async () => {
    // Initialize normally, then downgrade to the v0 (legacy) layout. This
    // simulates a vault created before PR#2 landed.
    const v = getVault();
    const { mnemonic } = await v.initialize('original-password-12345');
    await v.setToken('github', 'ghp_legacy_secret');
    await downgradeToLegacyV0(mnemonic);

    // Now simulate fresh start + recover via the legacy (v0) derivation.
    _resetVaultForTests();
    const v2 = getVault();
    await v2.recoverWithMnemonic(mnemonic, 'brand-new-password-2026');
    expect(await v2.getToken('github')).toBe('ghp_legacy_secret');
  });

  it('legacy v0 vault auto-upgrades to v1 after successful recovery', async () => {
    // S-5: vaults created before recoveryVersion shipped are silently
    // re-wrapped under v1 derivation (fresh salt + domain-separation
    // prefix) on the next successful recoverWithMnemonic call.
    const v = getVault();
    const { mnemonic } = await v.initialize('original-password-12345');
    const { originalRecoverySalt } = await downgradeToLegacyV0(mnemonic);

    // Sanity: meta is currently v0 (no recoveryVersion).
    const preMeta = await readPersistedMeta();
    expect(preMeta.recoveryVersion).toBeUndefined();

    _resetVaultForTests();
    const v2 = getVault();
    await v2.recoverWithMnemonic(mnemonic, 'brand-new-password-2026');

    // Meta is upgraded in-place: recoveryVersion === 1 and the
    // recoverySalt is a fresh value distinct from the v0 salt.
    const postMeta = await readPersistedMeta();
    expect(postMeta.recoveryVersion).toBe(1);
    // Cross-realm note: fake-indexeddb's structured-clone implementation
    // yields Uint8Array instances whose constructor lives in a different
    // realm, so `instanceof Uint8Array` is false. We work with byte
    // length + Array.from(...) directly — both behave identically across
    // realms.
    const newSalt = postMeta.recoverySalt as Uint8Array;
    expect(newSalt.length).toBe(32);
    expect(Array.from(newSalt)).not.toEqual(Array.from(originalRecoverySalt));

    // The same mnemonic still works for a follow-up recovery — proves the
    // v1 path is now operational and the rewrap is internally consistent.
    _resetVaultForTests();
    const v3 = getVault();
    await v3.recoverWithMnemonic(mnemonic, 'yet-another-password-9876');
    expect(v3.isUnlocked()).toBe(true);
  });

  it('auto-upgraded v1 mnemonic cannot recover via v0 anymore', async () => {
    // After auto-migration, the on-disk recovery branch is wrapped under
    // v1 derivation. A manual v0 (no-prefix) PBKDF2 must NOT unwrap it,
    // proving the migration committed to v1 cleanly (not a dual-path).
    const v = getVault();
    const { mnemonic } = await v.initialize('original-password-12345');
    await downgradeToLegacyV0(mnemonic);

    _resetVaultForTests();
    const v2 = getVault();
    await v2.recoverWithMnemonic(mnemonic, 'brand-new-password-2026');

    // Attempt to decrypt the recovery KCV under v0 derivation. Must fail.
    const { normalizeMnemonic } = await import('../mnemonic');
    const normalized = normalizeMnemonic(mnemonic);
    const postMeta = await readPersistedMeta();
    const v0BaseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(normalized),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );
    const v0Key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: postMeta.recoverySalt as BufferSource,
        iterations: 600_000,
        hash: 'SHA-256',
      },
      v0BaseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    await expect(
      crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: postMeta.recoveryIv as BufferSource },
        v0Key,
        postMeta.recoveryKcv as BufferSource,
      ),
    ).rejects.toThrow();
  });

  it('auto-upgrade preserves all stored tokens', async () => {
    // The migration only rewrites the recovery branch; the password
    // branch (and therefore the master key and all encrypted tokens)
    // must be untouched.
    const v = getVault();
    const { mnemonic } = await v.initialize('original-password-12345');
    await v.setToken('github', 'ghp_legacy_secret');
    await v.setToken('slack', 'xoxp-legacy-abc');
    await v.setToken('notion', 'secret_legacy_notion');
    await downgradeToLegacyV0(mnemonic);

    _resetVaultForTests();
    const v2 = getVault();
    await v2.recoverWithMnemonic(mnemonic, 'brand-new-password-2026');

    expect(await v2.getToken('github')).toBe('ghp_legacy_secret');
    expect(await v2.getToken('slack')).toBe('xoxp-legacy-abc');
    expect(await v2.getToken('notion')).toBe('secret_legacy_notion');

    // Token retention also survives a full restart under the new password.
    _resetVaultForTests();
    const v3 = getVault();
    await v3.unlock('brand-new-password-2026');
    expect(await v3.getToken('github')).toBe('ghp_legacy_secret');
    expect(await v3.getToken('slack')).toBe('xoxp-legacy-abc');
    expect(await v3.getToken('notion')).toBe('secret_legacy_notion');
  });

  it('already-v1 vault stays v1 after recovery (no spurious migration)', async () => {
    // Migration must trigger ONLY when recoveryVersion is undefined.
    // A v1 vault going through recoverWithMnemonic keeps its existing
    // recoverySalt + ciphertexts (the recovery branch is intentionally
    // not rotated by recoverWithMnemonic — that's rotateRecoveryKey's
    // job, deferred to v2).
    const v = getVault();
    const { mnemonic } = await v.initialize('original-password-12345');
    const preMeta = await readPersistedMeta();
    const preSalt = preMeta.recoverySalt as Uint8Array;
    const preWrappedKey = preMeta.recoveryWrappedKey as Uint8Array;

    _resetVaultForTests();
    const v2 = getVault();
    await v2.recoverWithMnemonic(mnemonic, 'brand-new-password-2026');

    const postMeta = await readPersistedMeta();
    expect(postMeta.recoveryVersion).toBe(1);
    // Recovery branch must be byte-for-byte identical — we only rewrap
    // when migrating from v0; v1 → v1 is a no-op.
    expect(Array.from(postMeta.recoverySalt as Uint8Array)).toEqual(Array.from(preSalt));
    expect(Array.from(postMeta.recoveryWrappedKey as Uint8Array)).toEqual(
      Array.from(preWrappedKey),
    );
  });

  // NOTE on atomicity: the v0 → v1 migration computes the entire next
  // meta in memory BEFORE the single `idbPut(META_STORE, 'vault', ...)`
  // call, so a partial write is structurally impossible: either the new
  // meta lands intact (v1) or the old meta remains (v0). Failure during
  // crypto (deriveKey / encrypt) is caught and logged inside vault.ts;
  // the recovery itself succeeds and the next call retries the upgrade.
  // We do not unit-test the IDB-write-failure branch because
  // fake-indexeddb does not expose a clean knob to inject mid-transaction
  // errors; the property is enforced by the structure of the code, not
  // by branch coverage.
});

describe('Vault — wipeAndReset', () => {
  it('clears all state and transitions back to uninitialized', async () => {
    const v = getVault();
    await v.initialize('original-password-12345');
    await v.setToken('github', 'ghp_xyz');
    await v.wipeAndReset();
    expect(v.isUnlocked()).toBe(false);
    expect(await v.status()).toBe('uninitialized');
  });

  it('is idempotent (no-op on already-empty vault)', async () => {
    const v = getVault();
    await v.wipeAndReset();
    expect(await v.status()).toBe('uninitialized');
    await v.wipeAndReset();
    expect(await v.status()).toBe('uninitialized');
  });
});

describe('Vault — status() 堅牢化 (IndexedDB 読取失敗)', () => {
  it('idbGet が throw しても reject せず uninitialized を返す (ログイン画面に到達)', async () => {
    const v = getVault();
    // 先に初期化して meta を書き込んでおく (本来は locked が返る状態)。
    await v.initialize('robustness-pw-123456');
    _resetVaultForTests(); // currentKey を捨てて再起動相当 (= locked のはず)
    const v2 = getVault();

    // idbGet 内の db.transaction を一時的に throw させ、読取失敗を再現する。
    const proto = (globalThis as unknown as { IDBDatabase: { prototype: { transaction: unknown } } }).IDBDatabase
      .prototype;
    const orig = proto.transaction;
    proto.transaction = () => {
      throw new Error('synthetic idb failure');
    };
    try {
      // reject せず uninitialized に縮退すること (App はこれでロック画面を表示)。
      await expect(v2.status()).resolves.toBe('uninitialized');
    } finally {
      proto.transaction = orig;
    }
  });
});

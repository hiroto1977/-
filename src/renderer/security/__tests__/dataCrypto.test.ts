import { describe, expect, it } from 'vitest';
import { encryptString, decryptString, isEncryptedBundle } from '../dataCrypto';

describe('dataCrypto', () => {
  it('round-trips encrypt → decrypt with the right password', async () => {
    const bundle = await encryptString('機密データ {"a":1}', 'correct horse');
    expect(isEncryptedBundle(bundle)).toBe(true);
    expect(await decryptString(bundle, 'correct horse')).toBe('機密データ {"a":1}');
  });

  it('fails decryption with the wrong password (GCM auth)', async () => {
    const bundle = await encryptString('secret', 'right-pw');
    await expect(decryptString(bundle, 'wrong-pw')).rejects.toThrow(/復号に失敗/);
  });

  it('fails decryption when the ciphertext is tampered', async () => {
    const bundle = await encryptString('secret', 'pw');
    // flip a base64 char in the ciphertext
    const ct = bundle.ct.slice(0, -2) + (bundle.ct.endsWith('A') ? 'B' : 'A') + bundle.ct.slice(-1);
    await expect(decryptString({ ...bundle, ct }, 'pw')).rejects.toThrow(/復号に失敗/);
  });

  it('uses a fresh salt + iv per call (no deterministic ciphertext)', async () => {
    const a = await encryptString('same', 'pw');
    const b = await encryptString('same', 'pw');
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('rejects an empty password on encrypt', async () => {
    await expect(encryptString('x', '')).rejects.toThrow(/パスワード/);
  });

  it('isEncryptedBundle guards malformed input', () => {
    expect(isEncryptedBundle(null)).toBe(false);
    expect(isEncryptedBundle({ v: 1 })).toBe(false);
    expect(isEncryptedBundle({ v: 2, kdf: 'PBKDF2-SHA256', iterations: 1, salt: 'a', iv: 'b', ct: 'c' })).toBe(false);
  });
});

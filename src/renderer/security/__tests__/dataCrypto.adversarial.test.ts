import { describe, expect, it } from 'vitest';
import { encryptString, decryptString, isEncryptedBundle } from '../dataCrypto';

/**
 * 敵対的シナリオによるデータ暗号化のセキュリティ検証。
 * 通常の round-trip は dataCrypto.test.ts でカバー。ここでは「改ざん耐性・
 * 鍵分離・形式検証」を攻撃者視点で確かめる。
 */
describe('dataCrypto — adversarial / tamper resistance', () => {
  it('rejects a flipped IV (GCM nonce tamper)', async () => {
    const bundle = await encryptString('機密', 'pw-strong');
    const iv = bundle.iv.slice(0, -2) + (bundle.iv.endsWith('A') ? 'B' : 'A') + bundle.iv.slice(-1);
    await expect(decryptString({ ...bundle, iv }, 'pw-strong')).rejects.toThrow(/復号に失敗/);
  });

  it('rejects a swapped salt (key no longer derives)', async () => {
    const a = await encryptString('secret-A', 'pw');
    const b = await encryptString('secret-B', 'pw');
    // Use a's ciphertext/iv but b's salt → derived key differs → auth fails.
    await expect(decryptString({ ...a, salt: b.salt }, 'pw')).rejects.toThrow(/復号に失敗/);
  });

  it('does not leak plaintext across distinct passwords (key separation)', async () => {
    const bundle = await encryptString('社外秘の数値 12345', 'password-one');
    await expect(decryptString(bundle, 'password-two')).rejects.toThrow(/復号に失敗/);
    await expect(decryptString(bundle, 'Password-one')).rejects.toThrow(/復号に失敗/); // case-sensitive
    expect(await decryptString(bundle, 'password-one')).toBe('社外秘の数値 12345');
  });

  it('round-trips long unicode and JSON payloads intact', async () => {
    const payload = JSON.stringify({ 会社: '株式会社テスト', 売上: 12_345_678, 連: '😀'.repeat(100), nested: { a: [1, 2, 3] } });
    const bundle = await encryptString(payload, 'pw');
    expect(await decryptString(bundle, 'pw')).toBe(payload);
  });

  it('rejects a downgraded iteration count in the bundle (auth still binds the key)', async () => {
    const bundle = await encryptString('x', 'pw');
    // In-range but different → the derived key differs, so GCM auth fails.
    await expect(decryptString({ ...bundle, iterations: 150_000 }, 'pw')).rejects.toThrow(/復号に失敗/);
  });

  it('rejects out-of-range iteration counts before running PBKDF2 (CPU-DoS guard)', async () => {
    const bundle = await encryptString('x', 'pw');
    // A hostile bundle asking for 1e10 iterations would freeze the tab; and a
    // count of 1 is not a work factor we ever wrote. Both fail closed, early,
    // without touching the KDF (2026-07 audit).
    await expect(decryptString({ ...bundle, iterations: 1 }, 'pw')).rejects.toThrow(/反復回数/);
    await expect(decryptString({ ...bundle, iterations: 10_000_000_000 }, 'pw')).rejects.toThrow(/反復回数/);
  });

  it('writes new bundles at the OWASP SHA-256 floor (600k)', async () => {
    const bundle = await encryptString('x', 'pw');
    expect(bundle.iterations).toBe(600_000);
  });

  it('rejects structurally invalid bundles before attempting crypto', async () => {
    await expect(decryptString({ v: 1, kdf: 'PBKDF2-SHA256', iterations: 1, salt: 'a', iv: 'b' } as never, 'pw')).rejects.toThrow(/形式が不正/);
    expect(isEncryptedBundle({ v: 1, kdf: 'PBKDF2-SHA256', iterations: 600000, salt: 'a', iv: 'b', ct: 'c' })).toBe(true);
    expect(isEncryptedBundle({ v: 2, kdf: 'PBKDF2-SHA256', iterations: 1, salt: 'a', iv: 'b', ct: 'c' })).toBe(false);
  });

  it('produces ciphertext that does not contain the plaintext', async () => {
    const secret = 'TOPSECRET_TOKEN_ABC123';
    const bundle = await encryptString(secret, 'pw');
    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('TOPSECRET');
  });
});

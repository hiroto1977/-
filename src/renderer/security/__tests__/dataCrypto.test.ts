import { describe, expect, it } from 'vitest';
import {
  encryptString,
  decryptString,
  isEncryptedBundle,
  isSealed,
  randomSaltB64,
  deriveAesKey,
  sealWithKey,
  openWithKey,
} from '../dataCrypto';

const VALID_BUNDLE = { v: 1, kdf: 'PBKDF2-SHA256', iterations: 210_000, salt: 'a', iv: 'b', ct: 'c' };

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

  it('isEncryptedBundle returns false for null / non-object (type guard)', () => {
    // ガード `typeof v !== 'object' || v === null` を false 固定する mutant は null.v 参照で
    // 例外になるため、null で false を期待して撃墜。
    expect(isEncryptedBundle(null)).toBe(false);
    expect(isEncryptedBundle(undefined)).toBe(false);
    expect(isEncryptedBundle(42)).toBe(false);
  });

  it('isEncryptedBundle accepts a fully-valid bundle and rejects each single-field defect', () => {
    expect(isEncryptedBundle(VALID_BUNDLE)).toBe(true);
    // null / 非オブジェクト (typeof !== 'object' || v === null ガード)。
    expect(isEncryptedBundle(null)).toBe(false);
    expect(isEncryptedBundle('nope')).toBe(false);
    // 各フィールドを 1 つずつ壊すと false (各 &&-項の ConditionalExpression を撃墜)。
    expect(isEncryptedBundle({ ...VALID_BUNDLE, v: 2 })).toBe(false);
    expect(isEncryptedBundle({ ...VALID_BUNDLE, kdf: 'OTHER' })).toBe(false);
    expect(isEncryptedBundle({ ...VALID_BUNDLE, iterations: '1' })).toBe(false);
    expect(isEncryptedBundle({ ...VALID_BUNDLE, salt: 1 })).toBe(false);
    expect(isEncryptedBundle({ ...VALID_BUNDLE, iv: 1 })).toBe(false);
    expect(isEncryptedBundle({ ...VALID_BUNDLE, ct: 1 })).toBe(false);
  });
});

describe('low-level key reuse (deriveAesKey / sealWithKey / openWithKey)', () => {
  it('round-trips seal → open with a reused key', async () => {
    const salt = randomSaltB64();
    const key = await deriveAesKey('pw', salt);
    const sealed = await sealWithKey(key, '封緘テキスト');
    expect(isSealed(sealed)).toBe(true);
    expect(await openWithKey(key, sealed)).toBe('封緘テキスト');
  });

  it('derives a non-extractable AES key (cannot be exported)', async () => {
    // deriveKey の extractable=false を true にする mutant を exportKey 失敗で撃墜。
    const key = await deriveAesKey('pw', randomSaltB64());
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toBeTruthy();
  });

  it('rejects an empty password on deriveAesKey', async () => {
    await expect(deriveAesKey('', randomSaltB64())).rejects.toThrow(/パスワード/);
  });

  it('fails openWithKey on a wrong key or non-sealed input', async () => {
    const sealed = await sealWithKey(await deriveAesKey('pw', randomSaltB64()), 'x');
    // 別の鍵では GCM 認証失敗 → 復号に失敗。
    await expect(openWithKey(await deriveAesKey('other', randomSaltB64()), sealed)).rejects.toThrow(/復号に失敗/);
    // 非封緘入力は形式エラー (isSealed ガード + メッセージ StringLiteral を撃墜)。
    const key = await deriveAesKey('pw', randomSaltB64());
    await expect(openWithKey(key, { iv: 'a' } as never)).rejects.toThrow(/封緘データの形式/);
  });

  it('isSealed accepts {iv,ct} and rejects defects', () => {
    expect(isSealed({ iv: 'a', ct: 'b' })).toBe(true);
    expect(isSealed(null)).toBe(false);
    expect(isSealed('nope')).toBe(false);
    expect(isSealed({ iv: 'a' })).toBe(false); // ct 欠落
    expect(isSealed({ ct: 'b' })).toBe(false); // iv 欠落
    expect(isSealed({ iv: 1, ct: 'b' })).toBe(false); // iv 非文字列
  });
});

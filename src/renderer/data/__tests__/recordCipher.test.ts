import { describe, expect, it } from 'vitest';
import {
  IDENTITY_CIPHER,
  isSealedData,
  createPassphraseRecordCipher,
} from '../recordCipher';
import { randomSaltB64 } from '../../security/dataCrypto';

describe('IDENTITY_CIPHER', () => {
  it('passes plaintext through unchanged', async () => {
    const data = { amount: 100, note: 'x' };
    expect(await IDENTITY_CIPHER.encrypt(data)).toBe(data);
    expect(await IDENTITY_CIPHER.decrypt(data)).toBe(data);
  });

  it('refuses to read a sealed payload (needs the passphrase cipher)', async () => {
    await expect(IDENTITY_CIPHER.decrypt({ __enc: { iv: 'a', ct: 'b' } })).rejects.toThrow(/暗号化/);
  });
});

describe('passphrase RecordCipher', () => {
  it('seals data so the plaintext is not present, then opens it', async () => {
    const salt = randomSaltB64();
    const cipher = await createPassphraseRecordCipher('pw', salt);
    const data = { amount: 12345, memo: '機密メモ' };

    const sealed = await cipher.encrypt(data);
    expect(isSealedData(sealed)).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain('機密メモ');
    expect(JSON.stringify(sealed)).not.toContain('12345');

    expect(await cipher.decrypt(sealed)).toEqual(data);
  });

  it('passes plaintext (pre-encryption) records through on decrypt', async () => {
    const cipher = await createPassphraseRecordCipher('pw', randomSaltB64());
    const legacy = { amount: 1 };
    expect(await cipher.decrypt(legacy)).toEqual(legacy);
  });

  it('a wrong passphrase cannot open data sealed by another', async () => {
    const salt = randomSaltB64();
    const a = await createPassphraseRecordCipher('right', salt);
    const b = await createPassphraseRecordCipher('wrong', salt);
    const sealed = await a.encrypt({ secret: 1 });
    await expect(b.decrypt(sealed)).rejects.toThrow(/復号に失敗/);
  });

  it('same passphrase + same salt re-derives a working key (next session)', async () => {
    const salt = randomSaltB64();
    const session1 = await createPassphraseRecordCipher('pw', salt);
    const sealed = await session1.encrypt({ v: 42 });
    const session2 = await createPassphraseRecordCipher('pw', salt);
    expect(await session2.decrypt(sealed)).toEqual({ v: 42 });
  });
});

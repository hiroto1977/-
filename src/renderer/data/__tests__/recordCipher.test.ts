import { describe, expect, it } from 'vitest';
import {
  IDENTITY_CIPHER,
  isSealedData,
  createPassphraseRecordCipher,
  bindRecordPayload,
  unbindRecordPayload,
  RecordTamperedError,
  RECORD_SEAL_VERSION,
} from '../recordCipher';
import { randomSaltB64, sealWithKey, deriveAesKey } from '../../security/dataCrypto';

const AT = { collection: 'sales-entries', id: 'r1' } as const;
const OTHER = { collection: 'sales-entries', id: 'r2' } as const;

describe('IDENTITY_CIPHER', () => {
  it('passes plaintext through unchanged', async () => {
    const data = { amount: 100, note: 'x' };
    expect(await IDENTITY_CIPHER.encrypt(data, AT)).toBe(data);
    expect(await IDENTITY_CIPHER.decrypt(data, AT)).toBe(data);
  });

  it('refuses to read a sealed payload (needs the passphrase cipher)', async () => {
    await expect(IDENTITY_CIPHER.decrypt({ __enc: { iv: 'a', ct: 'b' } }, AT)).rejects.toThrow(/暗号化/);
  });
});

describe('passphrase RecordCipher', () => {
  it('seals data so the plaintext is not present, then opens it', async () => {
    const salt = randomSaltB64();
    const cipher = await createPassphraseRecordCipher('pw', salt);
    const data = { amount: 12345, memo: '機密メモ' };

    const sealed = await cipher.encrypt(data, AT);
    expect(isSealedData(sealed)).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain('機密メモ');
    expect(JSON.stringify(sealed)).not.toContain('12345');

    expect(await cipher.decrypt(sealed, AT)).toEqual(data);
  });

  it('isSealedData rejects null, plain objects and primitives', () => {
    // null は typeof 'object' なので v!==null ガードが必要 (外すと .__enc で TypeError)。
    // 封緘印の無いオブジェクトは false (&& を || にする mutant を kill)。
    expect(isSealedData(null)).toBe(false);
    expect(isSealedData(undefined)).toBe(false); // typeof→true 固定で undefined.__enc が TypeError
    expect(isSealedData({})).toBe(false);
    expect(isSealedData({ foo: 1 })).toBe(false);
    expect(isSealedData('x')).toBe(false);
  });

  it('passes plaintext (pre-encryption) records through on decrypt', async () => {
    const cipher = await createPassphraseRecordCipher('pw', randomSaltB64());
    const legacy = { amount: 1 };
    expect(await cipher.decrypt(legacy, AT)).toEqual(legacy);
  });

  it('a wrong passphrase cannot open data sealed by another', async () => {
    const salt = randomSaltB64();
    const a = await createPassphraseRecordCipher('right', salt);
    const b = await createPassphraseRecordCipher('wrong', salt);
    const sealed = await a.encrypt({ secret: 1 }, AT);
    await expect(b.decrypt(sealed, AT)).rejects.toThrow(RecordTamperedError);
    await expect(b.decrypt(sealed, AT)).rejects.toThrow(/封緘を開けません/);
  });

  it('same passphrase + same salt re-derives a working key (next session)', async () => {
    const salt = randomSaltB64();
    const session1 = await createPassphraseRecordCipher('pw', salt);
    const sealed = await session1.encrypt({ v: 42 }, AT);
    const session2 = await createPassphraseRecordCipher('pw', salt);
    expect(await session2.decrypt(sealed, AT)).toEqual({ v: 42 });
  });
});

describe('★ 封緘はその記録に結び付く (レコード単位の改ざん検知)', () => {
  it('★ 別の記録へ写した封緘は開かない (移し替えの検知)', async () => {
    const cipher = await createPassphraseRecordCipher('pw', randomSaltB64());
    const sealed = await cipher.encrypt({ amount: 1_000_000 }, AT);
    await expect(cipher.decrypt(sealed, OTHER)).rejects.toThrow(/別の記録の中身です/);
    await expect(cipher.decrypt(sealed, { collection: 'kpi-actuals', id: 'r1' })).rejects.toThrow(/別の記録の中身です/);
    // 対照: 元の記録では開く
    expect(await cipher.decrypt(sealed, AT)).toEqual({ amount: 1_000_000 });
  });

  it('★ 封緘の暗号文を 1 文字書き換えると開かない (書き換えの検知)', async () => {
    const cipher = await createPassphraseRecordCipher('pw', randomSaltB64());
    const sealed = (await cipher.encrypt({ amount: 1 }, AT)) as { __enc: { iv: string; ct: string } };
    const ct = sealed.__enc.ct;
    const flipped = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
    await expect(cipher.decrypt({ __enc: { iv: sealed.__enc.iv, ct: flipped } }, AT)).rejects.toThrow(RecordTamperedError);
  });

  it('★ 結び付けを持たない封緘 (同じ鍵で中身だけを封緘した物) は開かない', async () => {
    const salt = randomSaltB64();
    const cipher = await createPassphraseRecordCipher('pw', salt);
    const key = await deriveAesKey('pw', salt);
    const bare = { __enc: await sealWithKey(key, JSON.stringify({ amount: 1 })) };
    await expect(cipher.decrypt(bare, AT)).rejects.toThrow(/結び付けがありません/);
  });

  it('封緘する平文は記録の名前と中身を持つ', () => {
    expect(JSON.parse(bindRecordPayload({ a: 1 }, AT))).toEqual({ v: RECORD_SEAL_VERSION, c: 'sales-entries', i: 'r1', d: { a: 1 } });
  });

  it('開いた平文の検め: 形の違う物はどれも理由つきで断る', () => {
    const ok = bindRecordPayload({ a: 1 }, AT);
    expect(unbindRecordPayload(ok, AT)).toEqual({ a: 1 });
    expect(() => unbindRecordPayload('{', AT)).toThrow(/中身を読めません/);
    expect(() => unbindRecordPayload('null', AT)).toThrow(/中身の形が違います/);
    expect(() => unbindRecordPayload('[1]', AT)).toThrow(/中身の形が違います/);
    expect(() => unbindRecordPayload('7', AT)).toThrow(/中身の形が違います/);
    expect(() => unbindRecordPayload(JSON.stringify({ v: 1, c: AT.collection, i: AT.id, d: {} }), AT)).toThrow(/結び付けがありません/);
    expect(() => unbindRecordPayload(JSON.stringify({ v: 2, c: 'x', i: AT.id, d: {} }), AT)).toThrow(/別の記録の中身です/);
    expect(() => unbindRecordPayload(JSON.stringify({ v: 2, c: AT.collection, i: 'x', d: {} }), AT)).toThrow(/別の記録の中身です/);
    for (const d of [null, [1], 'x', 3]) {
      expect(() => unbindRecordPayload(JSON.stringify({ v: 2, c: AT.collection, i: AT.id, d }), AT)).toThrow(/中身の形が違います/);
    }
  });

  it('断りの文は記録の名前を述べ、中身は述べない', async () => {
    const cipher = await createPassphraseRecordCipher('pw', randomSaltB64());
    const sealed = await cipher.encrypt({ memo: '機密メモ' }, AT);
    const err = await cipher.decrypt(sealed, OTHER).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(RecordTamperedError);
    expect((err as Error).name).toBe('RecordTamperedError');
    expect((err as Error).message).toContain('sales-entries / r2');
    expect((err as Error).message).not.toContain('機密メモ');
  });
});

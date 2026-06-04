/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { getRecordStore, _resetRecordStoreForTests } from '../store';
import { IDENTITY_CIPHER, isSealedData } from '../recordCipher';
import { deriveAesKey, sealWithKey } from '../../security/dataCrypto';
import {
  isEncryptionEnabled,
  enableEncryption,
  unlockEncryption,
  disableEncryption,
} from '../recordEncryption';

const LS_KEY = 'servicehub.recordEncryption';

function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  getRecordStore().configureCipher(IDENTITY_CIPHER); // reset cipher between tests
  localStorage.clear();
  await clearIdb();
});

describe('recordEncryption lifecycle', () => {
  it('starts disabled', () => {
    expect(isEncryptionEnabled()).toBe(false);
  });

  it('enableEncryption seals existing records and persists meta', async () => {
    const store = getRecordStore();
    const rec = await store.insert('sales', { amount: 100 });

    await enableEncryption('pw-123');
    expect(isEncryptionEnabled()).toBe(true);

    // at-rest payload is now sealed; plaintext no longer present
    const raw = await store.exportAll();
    expect(isSealedData(raw[0]!.data)).toBe(true);
    // but reads (cipher is configured) still return plaintext
    expect((await store.get<{ amount: number }>(rec.id))!.data).toEqual({ amount: 100 });
  });

  it('rejects enabling twice', async () => {
    await enableEncryption('pw');
    await expect(enableEncryption('pw')).rejects.toThrow(/既に有効/);
  });

  it('unlock with the correct passphrase reattaches the cipher (new session)', async () => {
    const store = getRecordStore();
    const rec = await store.insert('sales', { amount: 7 });
    await enableEncryption('pw-123');

    // simulate a fresh session: store forgot the key
    _resetRecordStoreForTests();
    const fresh = getRecordStore();
    // without unlock, sealed data can't be read
    await expect(fresh.get(rec.id)).rejects.toThrow(/暗号化/);

    expect(await unlockEncryption('pw-123')).toBe(true);
    expect((await getRecordStore().get<{ amount: number }>(rec.id))!.data).toEqual({ amount: 7 });
  });

  it('unlock with the wrong passphrase returns false (no lockout, no corruption)', async () => {
    await getRecordStore().insert('sales', { amount: 1 });
    await enableEncryption('right');
    _resetRecordStoreForTests();

    expect(await unlockEncryption('wrong')).toBe(false);
    // correct one still works afterwards
    expect(await unlockEncryption('right')).toBe(true);
  });

  it('unlock is a no-op (true) when encryption is not enabled', async () => {
    expect(await unlockEncryption('anything')).toBe(true);
  });

  it('disable decrypts everything back to plaintext and clears meta', async () => {
    const store = getRecordStore();
    const rec = await store.insert('sales', { amount: 42 });
    await enableEncryption('pw');

    expect(await disableEncryption('pw')).toBe(true);
    expect(isEncryptionEnabled()).toBe(false);

    // payload is plaintext again, readable with the identity cipher
    const raw = await store.exportAll();
    expect(isSealedData(raw[0]!.data)).toBe(false);
    expect((await store.get<{ amount: number }>(rec.id))!.data).toEqual({ amount: 42 });
  });

  it('disable with a wrong passphrase returns false and keeps data encrypted', async () => {
    const store = getRecordStore();
    await store.insert('sales', { amount: 1 });
    await enableEncryption('right');

    expect(await disableEncryption('wrong')).toBe(false);
    expect(isEncryptionEnabled()).toBe(true);
    const raw = await store.exportAll();
    expect(isSealedData(raw[0]!.data)).toBe(true);
  });

  it('rejects enabling with an empty passphrase', async () => {
    await expect(enableEncryption('')).rejects.toThrow('パスフレーズを入力してください');
  });

  it('disable is a no-op (true) when encryption is not enabled', async () => {
    // meta が無い → 早期 return true。`!meta` を false 固定する mutant は null.salt で例外。
    expect(await disableEncryption('anything')).toBe(true);
  });

  it('treats tampered meta (bad enabled / salt / kcv) as disabled', async () => {
    await enableEncryption('pw');
    const valid = JSON.parse(localStorage.getItem(LS_KEY)!);
    // enabled !== true
    localStorage.setItem(LS_KEY, JSON.stringify({ ...valid, enabled: false }));
    expect(isEncryptionEnabled()).toBe(false);
    // salt が文字列でない
    localStorage.setItem(LS_KEY, JSON.stringify({ ...valid, salt: 123 }));
    expect(isEncryptionEnabled()).toBe(false);
    // kcv が封緘形でない
    localStorage.setItem(LS_KEY, JSON.stringify({ ...valid, kcv: { nope: 1 } }));
    expect(isEncryptionEnabled()).toBe(false);
    // 壊れた JSON → catch 経路で null (catch を空にする mutant は undefined を返し true 化)。
    localStorage.setItem(LS_KEY, 'not-json{');
    expect(isEncryptionEnabled()).toBe(false);
  });

  it('rejects a passphrase whose KCV decrypts to the wrong plaintext (content check)', async () => {
    await enableEncryption('pw');
    const valid = JSON.parse(localStorage.getItem(LS_KEY)!);
    // 同じ鍵で別平文を封緘し kcv を差し替える → 復号は成功するが内容が KCV と不一致。
    const key = await deriveAesKey('pw', valid.salt);
    const wrongKcv = await sealWithKey(key, 'NOT-THE-KCV');
    localStorage.setItem(LS_KEY, JSON.stringify({ ...valid, kcv: wrongKcv }));
    _resetRecordStoreForTests();
    // unlock / disable とも内容不一致を検知して false (catch ではなく `!== KCV` 経路)。
    expect(await unlockEncryption('pw')).toBe(false);
    expect(await disableEncryption('pw')).toBe(false);
  });
});

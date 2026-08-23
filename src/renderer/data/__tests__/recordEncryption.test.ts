/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { getRecordStore, _resetRecordStoreForTests } from '../store';
import { IDENTITY_CIPHER, isSealedData, type RecordCipher } from '../recordCipher';
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


/*
 * **移行が途中で落ちても salt を失わない。**
 *
 * `enableEncryption` は 2026-08-23 まで `reencryptAll()` の**後**に
 * meta (salt + KCV) を保存していた。`reencryptAll` はレコード 1 件ずつ
 * 別のトランザクションで書くので途中で落ちうる (容量超過・タブを閉じた・
 * IndexedDB のエラー)。落ちると **封緘済みレコードは出来ているのに
 * salt が無い** —— `IDENTITY_CIPHER.decrypt` が明示的に投げるので黙って
 * 壊れはしないが、**正しいパスフレーズを知っていても鍵を作れない**。
 *
 * 解除側 (`disableEncryption`) は最初から正しい順序 (復号を全部終えてから
 * `clearMeta()`) だった。有効化側だけが逆だった。
 *
 * ここで留めるのは**順序**そのもの —— 移行が始まる時点で meta が既に
 * 保存されていること。
 */
describe('有効化の順序 — meta は移行より先に保存される', () => {
  it('reencryptAll が呼ばれる時点で meta が既に在る', async () => {
    const store = getRecordStore();
    await store.insert('sales', { amount: 1 });

    let metaAtMigration: string | null = 'not-called';
    const real = store.reencryptAll.bind(store);
    const spy = vi
      .spyOn(store, 'reencryptAll')
      .mockImplementation(async (from?: RecordCipher) => {
        metaAtMigration = localStorage.getItem(LS_KEY);
        return real(from);
      });
    try {
      await enableEncryption('correct-horse');
    } finally {
      spy.mockRestore();
    }

    expect(metaAtMigration, 'reencryptAll が呼ばれていない — 検査が的を外している')
      .not.toBe('not-called');
    expect(metaAtMigration, '移行の時点で meta が保存されていない (salt を失う順序)')
      .not.toBeNull();
    expect(JSON.parse(metaAtMigration as string)).toMatchObject({ enabled: true });
  });

  it('移行が落ちても salt は残り、パスフレーズで読み直せる', async () => {
    const store = getRecordStore();
    await store.insert('sales', { amount: 1 });

    const spy = vi.spyOn(store, 'reencryptAll').mockRejectedValue(new Error('quota exceeded'));
    try {
      await expect(enableEncryption('correct-horse')).rejects.toThrow('quota exceeded');
    } finally {
      spy.mockRestore();
    }

    // salt が残っているので、アンロックして読み直せる。
    expect(isEncryptionEnabled(), 'meta が消えている — salt を失っている').toBe(true);
    expect(await unlockEncryption('correct-horse')).toBe(true);
    expect((await getRecordStore().list('sales')).length).toBe(1);
  });
});

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

  /*
   * **ロックアウトしないこと。**
   *
   * このモジュールの設計節は「誤りなら false を返すだけ (沈黙のデータ破壊を
   * しない)。ユーザーは正しいパスフレーズを再入力すれば復帰できる」と書いている。
   * ところが鍵の導出 (`deriveAesKey`) が try の**外**に在り、2 通りで throw して
   * いた (2026-08-22 実測):
   *
   *   - 空パスフレーズ            → 'パスワードを入力してください'
   *   - `meta.salt` が base64 で読めない → '暗号化データが壊れています…'
   *     (`loadMeta` は `typeof salt === 'string'` しか見ていない)
   *
   * しかも `disableEncryption` が同じ形なので、**解錠も解除もできない** ——
   * 避けると宣言しているロックアウトそのものに落ちていた。
   *
   * 壊れた salt は誤パスフレーズと同じ false になるので理由は区別できないが、
   * 利用者がやり直せる状態に留まる方を採っている。
   */
  it.each([
    ['salt が base64 として読めない', '###'],
    ['salt が記号だけ', '@@@@'],
  ])('%s でも throw せず false (解錠も解除も呼べる)', async (_label, badSalt) => {
    await enableEncryption('pw');
    const valid = JSON.parse(localStorage.getItem(LS_KEY)!);
    localStorage.setItem(LS_KEY, JSON.stringify({ ...valid, salt: badSalt }));
    _resetRecordStoreForTests();
    await expect(unlockEncryption('pw')).resolves.toBe(false);
    await expect(disableEncryption('pw')).resolves.toBe(false);
  });

  it('空パスフレーズでも throw せず false', async () => {
    await enableEncryption('pw');
    _resetRecordStoreForTests();
    await expect(unlockEncryption('')).resolves.toBe(false);
    await expect(disableEncryption('')).resolves.toBe(false);
  });
});

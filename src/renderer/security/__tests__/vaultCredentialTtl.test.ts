import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { _resetVaultForTests, getVault } from '../vault';
import { CREDENTIAL_TTL_MS, expiredStoredCredentialMessage } from '../../../shared/credentialTtl';

/**
 * **保存した資格情報の有効時間 —— ブラウザ版の保管庫** (2026-10-28 · threat: T-213)。
 * 記録は `storedAt` (平文の付随データ) を持ち、期限切れは**復号せずに**消す。
 * 日付の無い記録 (この規則より前の物) には最初に見た時刻が付く。
 */
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
const PW = 'correct-horse-battery-staple';
const T0 = 1_800_000_000_000;
let now = T0;

function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-vault');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
type Rec = { iv: Uint8Array; ciphertext: Uint8Array; v?: number; storedAt?: number };
function rawIdb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('business-hub-vault', 1);
    req.onsuccess = () => {
      fn(req.result).then(
        (v) => { req.result.close(); resolve(v); },
        (e) => { req.result.close(); reject(e); },
      );
    };
    req.onerror = () => reject(req.error);
  });
}
const idbGetRaw = (db: IDBDatabase, key: string) =>
  new Promise<Rec | undefined>((res, rej) => {
    const r = db.transaction('tokens', 'readonly').objectStore('tokens').get(key);
    r.onsuccess = () => res(r.result as Rec | undefined);
    r.onerror = () => rej(r.error);
  });
const idbPutRaw = (db: IDBDatabase, key: string, val: unknown) =>
  new Promise<void>((res, rej) => {
    const r = db.transaction('tokens', 'readwrite').objectStore('tokens').put(val, key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
const rawRecord = (key: string) => rawIdb((db) => idbGetRaw(db, key));

beforeEach(async () => {
  _resetVaultForTests();
  await clearIdb();
  now = T0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

describe('vault — 保存した資格情報の有効時間 (threat: T-213)', () => {
  it('★ 記録は保存した時刻を平文で持ち、有効時間の中は読める (境界ちょうども)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'tok-github');
    expect((await rawRecord('github'))?.storedAt).toBe(T0);
    now = T0 + CREDENTIAL_TTL_MS;
    expect(await vault.getToken('github')).toBe('tok-github');
    expect(await vault.listConfigured()).toEqual(['github']);
  });

  it('★ 有効時間を過ぎた記録は復号せずに消し、理由を 1 度だけ言う (使い捨て)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'tok-github');
    await vault.setToken('slack', 'tok-slack');
    now = T0 + CREDENTIAL_TTL_MS + 1;
    expect(await vault.getToken('github')).toBeNull();
    expect(await rawRecord('github')).toBeUndefined();
    expect(await rawRecord('slack')).toBeDefined(); // 隣は触らない (同じ時刻なので一覧では消える)
    expect(vault.takeExpiredNotice('github')).toBe(expiredStoredCredentialMessage('github'));
    expect(vault.takeExpiredNotice('github')).toBeNull(); // 1 度だけ
  });

  it('★ 一覧は期限切れを出さず、その場で消す (鍵が無くても)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'tok-github');
    now = T0 + 60_000;
    await vault.setToken('slack', 'tok-slack');
    now = T0 + CREDENTIAL_TTL_MS + 1;
    vault.lock();
    expect(await vault.listConfigured()).toEqual(['slack']);
    expect(await rawRecord('github')).toBeUndefined();
  });

  it('★ 解錠のたびに期限切れを掃く (一度も読まれない記録も残らない)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'tok-github');
    vault.lock();
    now = T0 + CREDENTIAL_TTL_MS + 1;
    await vault.unlock(PW);
    expect(await rawRecord('github')).toBeUndefined();
    expect(vault.takeExpiredNotice('github')).toBe(expiredStoredCredentialMessage('github'));
  });

  it('★ 未来の時刻 (書き換えられた記録) は期限切れ', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'tok-github');
    const rec = (await rawRecord('github'))!;
    await rawIdb((db) => idbPutRaw(db, 'github', { ...rec, storedAt: T0 + 24 * 60 * 60 * 1000 }));
    expect(await vault.getToken('github')).toBeNull();
    expect(await rawRecord('github')).toBeUndefined();
  });

  it('★ 日付の無い記録 (この規則より前の物) は、最初に見た時刻が付き、そこから有効時間が始まる', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'tok-github');
    const rec = (await rawRecord('github'))!;
    const { storedAt: _dropped, ...undated } = rec;
    await rawIdb((db) => idbPutRaw(db, 'github', undated));
    now = T0 + 5_000;
    expect(await vault.getToken('github')).toBe('tok-github');
    expect((await rawRecord('github'))?.storedAt).toBe(T0 + 5_000);
    now = T0 + 5_000 + CREDENTIAL_TTL_MS + 1;
    expect(await vault.getToken('github')).toBeNull();
  });

  it('★ パスワードの変更は保存した時刻を引き継ぐ (変えた瞬間に全部消えない)', async () => {
    // Phase E の保管庫はマスター鍵を包み直すだけで記録に触れない。記録を全部読み替えるのは
    // **Phase E 以前の保管庫** (master-wrap が無い) の枝なので、その形を作って当てる。
    const metaDelete = (key: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('business-hub-vault');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('meta', 'readwrite');
          tx.objectStore('meta').delete(key);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
        req.onerror = () => reject(req.error);
      });
    const vault = getVault();
    await vault.initialize(PW);
    await metaDelete('master-wrap');
    vault.lock();
    await vault.unlock(PW);
    await vault.setToken('github', 'tok-github');
    now = T0 + 60_000;
    await vault.changePassword(PW, 'another-correct-horse-battery');
    expect((await rawRecord('github'))?.storedAt).toBe(T0);
    expect(await vault.getToken('github')).toBe('tok-github');
    now = T0 + CREDENTIAL_TTL_MS + 1; // 元の時刻から数えて期限切れ (変更の時刻からではない)
    expect(await vault.getToken('github')).toBeNull();
  });
});

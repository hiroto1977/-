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

/**
 * AAD を導入する**前**の形のレコードを作る (版なし・storedAt なし)。
 * v2 は storedAt を AAD に束ねるので、「v2 から storedAt だけ外した物」は復号できない
 * (それは改竄であって、規則より前の記録ではない)。規則より前の記録を正直に再現するには、
 * AAD を一切使わず暗号化した本物の旧形式が要る (`vaultRecordBinding.test.ts` と同じ手順)。
 */
async function writeLegacyToken(serviceId: string, token: string): Promise<void> {
  const meta = await rawIdb(
    (db) =>
      new Promise<{ salt: Uint8Array; iterations: number }>((res, rej) => {
        const r = db.transaction('meta', 'readonly').objectStore('meta').get('vault');
        r.onsuccess = () => res(r.result as { salt: Uint8Array; iterations: number });
        r.onerror = () => rej(r.error);
      }),
  );
  const wrap = await rawIdb(
    (db) =>
      new Promise<Rec>((res, rej) => {
        const r = db.transaction('meta', 'readonly').objectStore('meta').get('master-wrap');
        r.onsuccess = () => res(r.result as Rec);
        r.onerror = () => rej(r.error);
      }),
  );
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(PW) as BufferSource, { name: 'PBKDF2' }, false, ['deriveKey'],
  );
  const passwordKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: meta.salt as BufferSource, iterations: meta.iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
  const masterRaw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: wrap.iv as BufferSource }, passwordKey, wrap.ciphertext as BufferSource,
  );
  const masterKey = await crypto.subtle.importKey('raw', masterRaw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    // ★ additionalData を渡さない = 旧形式
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource }, masterKey, new TextEncoder().encode(token) as BufferSource,
    ),
  );
  await rawIdb((db) => idbPutRaw(db, serviceId, { iv, ciphertext })); // v も storedAt も付けない
}

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
    // 規則より前の記録 = AAD 導入前の本物の旧形式 (版なし・storedAt なし)。v2 は storedAt を
    // AAD に束ねるので「v2 から storedAt を外した物」は復号できない —— 本物の旧形式で測る。
    const vault = getVault();
    await vault.initialize(PW);
    await writeLegacyToken('github', 'tok-github');
    expect((await rawRecord('github'))?.storedAt).toBeUndefined();
    now = T0 + 5_000;
    expect(await vault.getToken('github')).toBe('tok-github');
    expect((await rawRecord('github'))?.storedAt).toBe(T0 + 5_000);
    // 読み出しで storedAt まで束ねた v2 へ上がる。
    expect((await rawRecord('github'))?.v).toBe(2);
    now = T0 + 5_000 + CREDENTIAL_TTL_MS + 1;
    expect(await vault.getToken('github')).toBeNull();
  });

  it('★ storedAt を前へ (まだ now 以下) 書き換えても v2 記録は復号できない —— 若返り攻撃 (threat: T-230)', async () => {
    // T-213 の残り穴。storedAt は**平文で認証されない**ので、IndexedDB へ書ける攻撃者は
    // 鍵を知らなくても保存時刻を前倒しできる。本来 8 時間で期限切れになる記録を「今」へ
    // 若返らせると、持ち出された保管庫の写しが期限を越えて使える。旧版の docblock は
    // 「未来へ書き換えた物は規則が消すから信用を延ばす向きには働かない」と書いていたが**偽**
    // だった —— 未来ではなく「古いが now 以下」へ戻せば若返る。
    //
    // 直し: storedAt を AAD に束ねる (v2)。事前判定 (復号前) は「今 = storedAt」で新鮮に
    // 見えるが、AAD が元の時刻で封緘されているので**復号自体が失敗する**。
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'tok-github'); // v2 · storedAt=T0 · AAD に T0 を束ねる
    now = T0 + CREDENTIAL_TTL_MS + 60_000; // 既に期限切れ
    const rec = (await rawRecord('github'))!;
    await rawIdb((db) => idbPutRaw(db, 'github', { ...rec, storedAt: now })); // 「今」へ若返らせる
    // 事前判定は通る (now - now = 0 < 有効時間) が、AAD が合わず復号が失敗して null。
    expect(await vault.getToken('github')).toBeNull();
  });

  it('★ storedAt を少しでも書き換えると v2 記録は復号できない (保存時刻は認証されている)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'tok-github');
    const rec = (await rawRecord('github'))!;
    // 有効時間の中で 1 ms ずらすだけ (事前判定は通る)。AAD が合わないので復号は失敗する。
    await rawIdb((db) => idbPutRaw(db, 'github', { ...rec, storedAt: T0 + 1 }));
    expect(await vault.getToken('github')).toBeNull();
    // 書き換えていない記録はそのまま読める (対照)。
    await rawIdb((db) => idbPutRaw(db, 'github', rec));
    expect(await vault.getToken('github')).toBe('tok-github');
  });

  it('★ 新しく書いた記録は storedAt を AAD に束ねた v2 である', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'tok-github');
    const rec = (await rawRecord('github'))!;
    expect(rec.v).toBe(2);
    expect(rec.storedAt).toBe(T0);
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

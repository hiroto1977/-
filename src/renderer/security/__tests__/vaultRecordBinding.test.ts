/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { _resetVaultForTests, getVault } from '../vault';
import { webcrypto } from 'node:crypto';

// jsdom は crypto.subtle を持たないので Node の webcrypto を借りる
// (他の vault 検査と同じ形)。
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const PW = 'correct-horse-battery-staple';

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

/**
 * IndexedDB を直接触る = **ブラウザプロファイルに触れる攻撃者**の立場。
 * 復号はできないが、レコードの中身の差し替えと置き場所の移動はできる。
 */
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
type Rec = { iv: Uint8Array; ciphertext: Uint8Array; v?: number };
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

/**
 * AAD を導入する**前**の形のレコードを作る。
 * vault と同じ手順でマスター鍵を取り出し、AAD 無しで暗号化して版を付けない。
 */
async function writeLegacyToken(serviceId: string, token: string): Promise<void> {
  const meta = await new Promise<{ salt: Uint8Array; iterations: number }>((res, rej) => {
    const open = indexedDB.open('business-hub-vault', 1);
    open.onsuccess = () => {
      const r = open.result.transaction('meta', 'readonly').objectStore('meta').get('vault');
      r.onsuccess = () => { open.result.close(); res(r.result); };
      r.onerror = () => { open.result.close(); rej(r.error); };
    };
    open.onerror = () => rej(open.error);
  });
  const wrap = await new Promise<Rec>((res, rej) => {
    const open = indexedDB.open('business-hub-vault', 1);
    open.onsuccess = () => {
      const r = open.result.transaction('meta', 'readonly').objectStore('meta').get('master-wrap');
      r.onsuccess = () => { open.result.close(); res(r.result as Rec); };
      r.onerror = () => { open.result.close(); rej(r.error); };
    };
    open.onerror = () => rej(open.error);
  });

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
  const masterKey = await crypto.subtle.importKey(
    'raw', masterRaw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    // ★ additionalData を渡さない = 旧形式
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      masterKey,
      new TextEncoder().encode(token) as BufferSource,
    ),
  );
  await rawIdb((db) => idbPutRaw(db, serviceId, { iv, ciphertext })); // v を付けない
}

describe('Vault — 暗号文は保管場所に束ねる', () => {
  it('通常の読み書きは変わらない', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'ghp_TOKEN');
    expect(await vault.getToken('github')).toBe('ghp_TOKEN');
    vault.lock();
    await vault.unlock(PW);
    expect(await vault.getToken('github')).toBe('ghp_TOKEN');
  }, 60_000);

  it('★ 別サービスの位置へ移された暗号文は復号できない', async () => {
    // 2026-08-24 に実証した攻撃の再現。AAD を外すとここが通ってしまう。
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'ghp_REAL_GITHUB_TOKEN');
    await vault.setToken('slack', 'xoxb-real-slack-token');

    await rawIdb(async (db) => {
      const gh = await idbGetRaw(db, 'github');
      await idbPutRaw(db, 'slack', gh);
    });

    vault.lock();
    await vault.unlock(PW);
    expect(await vault.getToken('slack')).toBeNull();
    // 元の位置は無事 (巻き添えで壊していない)
    expect(await vault.getToken('github')).toBe('ghp_REAL_GITHUB_TOKEN');
  }, 60_000);

  it('★ 版の印を剥がしても旧形式として読めるようにはならない', async () => {
    // `v` を消せば旧経路 (AAD 無し) へ落ちるが、暗号文は AAD つきで
    // 作られているので復号は失敗する。移行の抜け道にならないこと。
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'ghp_TOKEN');
    await rawIdb(async (db) => {
      const rec = await idbGetRaw(db, 'github');
      await idbPutRaw(db, 'github', { iv: rec!.iv, ciphertext: rec!.ciphertext });
    });
    expect(await vault.getToken('github')).toBeNull();
  }, 60_000);

  it('新しく書いたレコードには版が付く', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'ghp_TOKEN');
    const rec = await rawIdb((db) => idbGetRaw(db, 'github'));
    expect(rec?.v).toBe(1);
  }, 60_000);

  it('AAD 導入前のレコードは読めて、その場で束ね直される', async () => {
    // **本物の旧形式を作る。** マスター鍵を vault と同じ手順で取り出し
    // (salt+iterations で PBKDF2 → master-wrap を復号)、AAD 無しで暗号化して
    // 版の印を付けずに置く。ここを「版を剥がすだけ」で済ませると、
    // 暗号文は AAD つきのままなので**旧経路を一度も通らない空撃ち**になる。
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'ghp_TOKEN'); // meta を確定させる
    await writeLegacyToken('notion', 'legacy-notion-token');

    // 読み出しで移行されること
    expect(await vault.getToken('notion')).toBe('legacy-notion-token');
    expect((await rawIdb((db) => idbGetRaw(db, 'notion')))?.v).toBe(1);
  }, 60_000);

  it('一度も読まれない旧レコードも、解錠時に束ね直される', async () => {
    // getToken 側だけの移行だと、読まれないトークンは旧形式のまま残り、
    // 付け替え攻撃はまさにそれを狙える。
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'ghp_TOKEN');
    await writeLegacyToken('notion', 'legacy-notion-token');
    expect((await rawIdb((db) => idbGetRaw(db, 'notion')))?.v).toBeUndefined();

    vault.lock();
    await vault.unlock(PW); // ← 読まずに解錠するだけ

    expect((await rawIdb((db) => idbGetRaw(db, 'notion')))?.v).toBe(1);
    expect(await vault.getToken('notion')).toBe('legacy-notion-token');
  }, 60_000);

  it('★ 旧レコードは移行前なら付け替えが通る — 移行後は通らない', async () => {
    // 移行の窓を正直に測る。「直したつもりで窓が残っている」を防ぐため、
    // **通ってしまう側も**留めておく。
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'ghp_TOKEN');
    await writeLegacyToken('notion', 'legacy-notion-token');
    await rawIdb(async (db) => {
      const n = await idbGetRaw(db, 'notion');
      await idbPutRaw(db, 'linear', n); // 旧形式を別の位置へ
    });
    // 移行前: 旧形式には束縛が無いので通る (これが直す前の世界)
    expect(await vault.getToken('linear')).toBe('legacy-notion-token');

    // その読み出しで linear は v1 になった。もう一度付け替えると通らない
    await rawIdb(async (db) => {
      const l = await idbGetRaw(db, 'linear');
      expect(l?.v).toBe(1);
      await idbPutRaw(db, 'asana', l);
    });
    expect(await vault.getToken('asana')).toBeNull();
  }, 60_000);

  it('サービスごとに別の暗号文になる (同じ平文でも)', async () => {
    const vault = getVault();
    await vault.initialize(PW);
    await vault.setToken('github', 'same-token');
    await vault.setToken('slack', 'same-token');
    const [a, b] = await rawIdb(async (db) => [
      await idbGetRaw(db, 'github'),
      await idbGetRaw(db, 'slack'),
    ]);
    expect(Buffer.from(a!.ciphertext)).not.toEqual(Buffer.from(b!.ciphertext));
    expect(Buffer.from(a!.iv)).not.toEqual(Buffer.from(b!.iv)); // IV は毎回新しい
  }, 60_000);
});

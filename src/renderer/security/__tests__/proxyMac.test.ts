/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { _resetVaultForTests, getVault } from '../vault';
import {
  getProxyConfig,
  inspectStoredProxyConfig,
  setProxyConfig,
} from '../../network/proxy';
import { reviewStoredProxyConfig } from '../../../shared/proxyEndpoint';

// jsdom は crypto.subtle を持たないので Node の webcrypto を借りる (他の vault 検査と同じ形)。
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const PW = 'correct-horse-battery-staple';
const PREF_DB = 'business-hub-preferences';
const VAULT_DB = 'business-hub-vault';

function clearDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  _resetVaultForTests();
  await clearDb(PREF_DB);
  await clearDb(VAULT_DB);
});

/**
 * 検証を通さずに preferences DB へ直に書く = **ブラウザプロファイルに触れる攻撃者**の立場。
 * `setProxyConfig` を迂回するので、認証タグ (mac) の付かない / 差し替えられたレコードを作れる。
 */
function putRawProxyRecord(value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(PREF_DB, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, 'proxy');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error ?? new Error('put failed')); };
    };
    open.onerror = () => reject(open.error ?? new Error('open failed'));
  });
}

function getRawProxyRecord(): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(PREF_DB, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    open.onsuccess = () => {
      const db = open.result;
      const r = db.transaction('kv', 'readonly').objectStore('kv').get('proxy');
      r.onsuccess = () => { db.close(); resolve(r.result as Record<string, unknown> | undefined); };
      r.onerror = () => { db.close(); reject(r.error ?? new Error('get failed')); };
    };
    open.onerror = () => reject(open.error ?? new Error('open failed'));
  });
}

async function unlockedVault() {
  const v = getVault();
  await v.initialize(PW);
  return v;
}

const GOOD = 'https://my-worker.example.com/proxy';

// --- 保存時 MAC (566-B · threat: T-230 の隣) -----------------------------------
describe('BYO プロキシ設定の保存時 MAC', () => {
  it('解錠中に保存した設定は、署名が付いて読み出し時に検証を通る', async () => {
    await unlockedVault();
    await setProxyConfig({ url: GOOD, sharedSecret: 'shh' });

    // 平文の隣に認証タグが載っている。
    const raw = await getRawProxyRecord();
    expect(raw?.url).toBe(GOOD);
    expect(raw?.mac).toBeDefined();

    const got = await getProxyConfig();
    expect(got?.url).toBe(GOOD);
    expect(got?.sharedSecret).toBe('shh');
    const seen = await inspectStoredProxyConfig();
    expect(seen.unverified).toBeNull();
    expect(seen.config?.url).toBe(GOOD);
  });

  it('解錠中・署名の無い生書き込み (レガシー / 剥がし) は使わない (threat: T-231)', async () => {
    await unlockedVault();
    await putRawProxyRecord({ url: GOOD }); // mac 無し
    expect(await getProxyConfig()).toBeNull();
    const seen = await inspectStoredProxyConfig();
    expect(seen.config).toBeNull();
    expect(seen.unverified).toBe('unstamped');
    expect(seen.rejected).toBeNull(); // 形は正しい —— 落ちたのは MAC の軸
  });

  it('解錠中・送り先 URL を差し替えた改竄 (古い mac を残す) は使わない (threat: T-231)', async () => {
    await unlockedVault();
    await setProxyConfig({ url: GOOD });
    // プロファイルに触れる攻撃者: URL だけ自分の Worker へ差し替え、署名はそのまま。
    const rec = await getRawProxyRecord();
    expect(rec?.mac).toBeDefined();
    await putRawProxyRecord({ ...rec, url: 'https://evil.example.com/proxy' });

    expect(await getProxyConfig()).toBeNull();
    const seen = await inspectStoredProxyConfig();
    expect(seen.config).toBeNull();
    expect(seen.unverified).toBe('tampered');
  });

  it('解錠中・共有秘密を差し替えた改竄も使わない', async () => {
    await unlockedVault();
    await setProxyConfig({ url: GOOD, sharedSecret: 'real' });
    const rec = await getRawProxyRecord();
    await putRawProxyRecord({ ...rec, sharedSecret: 'attacker' });
    const seen = await inspectStoredProxyConfig();
    expect(seen.config).toBeNull();
    expect(seen.unverified).toBe('tampered');
  });

  it('対照: MAC 検証の下の層 (shared の reviewStoredProxyConfig) は差し替えた URL を受ける', async () => {
    // MAC の層が load-bearing であることの対照 —— 形だけ見る shared の検証は改竄を通す。
    await unlockedVault();
    await setProxyConfig({ url: GOOD });
    const rec = await getRawProxyRecord();
    await putRawProxyRecord({ ...rec, url: 'https://evil.example.com/proxy' });

    const bare = reviewStoredProxyConfig(await getRawProxyRecord());
    expect(bare.config?.url).toBe('https://evil.example.com/proxy'); // ← 下の層は通す
    expect((await inspectStoredProxyConfig()).config).toBeNull();     // ← MAC の層が止める
  });

  it('ロック中は検証を保留し、素の設定を返す (資格情報が乗る読みは必ず解錠後)', async () => {
    // 保管庫を初期化すらしない = ロック状態。生書き込み (mac 無し) を素で返す (旧挙動)。
    await putRawProxyRecord({ url: 'http://127.0.0.1:8787/' });
    expect(getVault().isUnlocked()).toBe(false);
    expect((await getProxyConfig())?.url).toBe('http://127.0.0.1:8787/');
    expect((await inspectStoredProxyConfig()).unverified).toBeNull();
  });

  it('ロック中の保存は署名を付けないが、その後の解錠中の読みで未署名として断られる', async () => {
    // ロック中でも setProxyConfig(非 null) は書けてしまう (本番では設定画面が解錠必須なので起きない)。
    // その記録は解錠後に unstamped として弾かれる —— 検証されない設定が送り先にならない。
    await setProxyConfig({ url: GOOD });
    expect((await getRawProxyRecord())?.mac).toBeUndefined();
    await unlockedVault();
    expect((await inspectStoredProxyConfig()).unverified).toBe('unstamped');
  });

  it('形が不正なレコードは MAC 以前に rejected で断る (軸が別)', async () => {
    await unlockedVault();
    await putRawProxyRecord({ url: 'https://u:p@evil.example.com/', mac: { iv: new Uint8Array(12), ciphertext: new Uint8Array(1) } });
    const seen = await inspectStoredProxyConfig();
    expect(seen.config).toBeNull();
    expect(seen.rejected).toBe('has-userinfo');
    expect(seen.unverified).toBeNull(); // 形で落ちたので MAC まで行かない
  });

  it('設定を消したら署名ごと消える (削除は mac を残さない)', async () => {
    await unlockedVault();
    await setProxyConfig({ url: GOOD });
    await setProxyConfig(null);
    expect(await getRawProxyRecord()).toBeUndefined();
    expect(await getProxyConfig()).toBeNull();
  });
});

// --- vault の汎用認証タグ (authTag / verifyAuthTag) ----------------------------
describe('vault.authTag / verifyAuthTag', () => {
  it('付けたタグは同じ data / domain で検証を通り、改竄・別 data は false', async () => {
    const v = await unlockedVault();
    const tag = await v.authTag('proxy-config', 'hello');
    expect(await v.verifyAuthTag('proxy-config', 'hello', tag)).toBe(true);
    expect(await v.verifyAuthTag('proxy-config', 'hell0', tag)).toBe(false);
  });

  it('domain が違うタグは検証を通らない (用途の分離が load-bearing)', async () => {
    const v = await unlockedVault();
    const tag = await v.authTag('other-use', 'hello');
    expect(await v.verifyAuthTag('proxy-config', 'hello', tag)).toBe(false);
    expect(await v.verifyAuthTag('other-use', 'hello', tag)).toBe(true); // 正しい domain なら通る (対照)
  });

  it('ロック中: authTag は投げ、verifyAuthTag は false', async () => {
    const v = await unlockedVault();
    const tag = await v.authTag('proxy-config', 'hello');
    v.lock();
    await expect(v.authTag('proxy-config', 'hello')).rejects.toThrow(/ロック/);
    expect(await v.verifyAuthTag('proxy-config', 'hello', tag)).toBe(false);
  });

  it('タグの形が壊れていても false (例外を投げない)', async () => {
    const v = await unlockedVault();
    expect(await v.verifyAuthTag('proxy-config', 'hello', null)).toBe(false);
    expect(await v.verifyAuthTag('proxy-config', 'hello', undefined)).toBe(false);
    expect(await v.verifyAuthTag('proxy-config', 'hello', { iv: new Uint8Array(12), ciphertext: new Uint8Array(1) })).toBe(false);
  });
});

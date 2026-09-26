/** @vitest-environment jsdom */
/**
 * **「消えうる領域か」を名乗る関数が、1 度も実行されていなかった** (2026-09-20 · パス 351)。
 *
 * ## 何が在ったか
 *
 * 2026-09-20 の変異検査で、ブラウザ版 shim の未到達 84 のうち **15** が
 * `requestAndReadDurability` の 6 行に集まっていた —— **関数まるごと、
 * どの検査も通っていなかった**。
 *
 * この関数が返す値は飾りではない。`storageProtection().durability` が
 * `best-effort` のとき、設定画面は `EvictionNotice` を出す:
 *
 * > ⚠️ この保管庫は「消えうる」領域にあります …
 * > **控えた 24 語では戻せません** —— 消えたときは暗号化されたトークンごと失われます
 *
 * つまり **`persistent` と答えるかどうかで、利用者がその警告を見るか見ないかが決まる**。
 * 誤って `persistent` と答えれば、**立ち退きで API キーを失う利用者が、
 * その可能性を知らないまま使い続ける**ことになる。
 *
 * ## ここで留めるもの (関数の docblock が述べている主張そのもの)
 *
 * 1. **要求の成否ではなく状態を返す** —— `persist()` が `true` を返しても、
 *    そのあと `persisted()` が `false` なら `best-effort` と名乗る。
 * 2. **既に永続なら `persist()` を呼ばない** —— 要らない許可要求を出さない。
 * 3. **API が無い環境では嘘をつかず `best-effort` に倒す** (2 段: `storage` 自体が
 *    無い / `persisted` が関数でない)。
 * 4. **投げたら `best-effort`** —— 分からないときは安全側 (警告を出す側) へ。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isEvictableStorage } from '../../shared/storageDurability';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => null,
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({
  getLibrary: () => ({ put: async () => {}, list: async () => [] }),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Protection = { durability: 'file' | 'persistent' | 'best-effort'; mechanism: string };
type Hub = { storageProtection: () => Promise<Protection> };

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

/** `navigator.storage` を差し替える。`undefined` を渡すと生えていない状態にする。 */
function setStorage(value: unknown): void {
  Object.defineProperty(navigator, 'storage', {
    value,
    configurable: true,
    writable: true,
  });
}

const originalStorage = Object.getOwnPropertyDescriptor(Navigator.prototype, 'storage');

afterEach(() => {
  if (originalStorage) Object.defineProperty(Navigator.prototype, 'storage', originalStorage);
  delete (navigator as unknown as { storage?: unknown }).storage;
});

let persistCalls = 0;
beforeEach(() => {
  persistCalls = 0;
  localStorage.clear();
});

/** `persisted()` が呼ばれるたびに `answers` を順に返す小さな模型。 */
function storageStub(answers: (boolean | Error)[], persistGrants: boolean | Error | null) {
  let at = 0;
  return {
    persisted: async () => {
      const a = answers[Math.min(at++, answers.length - 1)]!;
      if (a instanceof Error) throw a;
      return a;
    },
    ...(persistGrants === null
      ? {}
      : {
          persist: async () => {
            persistCalls += 1;
            if (persistGrants instanceof Error) throw persistGrants;
            return persistGrants;
          },
        }),
  };
}

describe('ブラウザ版 storageProtection().durability (パス 351)', () => {
  it('★ 要求が通れば persistent —— 許可された端末では警告を出さない', async () => {
    setStorage(storageStub([false, true], true));
    const hub = await loadHub();
    const p = await hub.storageProtection();
    expect(p.durability).toBe('persistent');
    expect(persistCalls).toBe(1);
    expect(isEvictableStorage(p.durability)).toBe(false);
  });

  it('★ 要求が通っても、そのあとの状態が false なら best-effort (成否ではなく状態を返す)', async () => {
    // `persist()` は true を返すが `persisted()` は false のまま —— 名乗るのは後者。
    setStorage(storageStub([false, false], true));
    const hub = await loadHub();
    const p = await hub.storageProtection();
    expect(p.durability).toBe('best-effort');
    expect(persistCalls).toBe(1);
    expect(isEvictableStorage(p.durability)).toBe(true);
  });

  it('★ 既に永続なら persist() を呼ばない (要らない許可要求を出さない)', async () => {
    setStorage(storageStub([true, true], true));
    const hub = await loadHub();
    const p = await hub.storageProtection();
    expect(p.durability).toBe('persistent');
    expect(persistCalls).toBe(0);
  });

  it('★ 要求が断られたら best-effort (実測 2026-08-25 の既定の姿)', async () => {
    setStorage(storageStub([false, false], false));
    const hub = await loadHub();
    const p = await hub.storageProtection();
    expect(p.durability).toBe('best-effort');
    expect(persistCalls).toBe(1);
  });

  it('★ navigator.storage が無い環境は best-effort (嘘をつかない)', async () => {
    setStorage(undefined);
    const hub = await loadHub();
    expect((await hub.storageProtection()).durability).toBe('best-effort');
  });

  it('★ persisted が関数でない環境も best-effort', async () => {
    setStorage({ persisted: 'not a function', persist: async () => true });
    const hub = await loadHub();
    const p = await hub.storageProtection();
    expect(p.durability).toBe('best-effort');
    expect(persistCalls).toBe(0);
  });

  it('★ persist が無くても persisted だけで名乗れる', async () => {
    setStorage(storageStub([true], null));
    const hub = await loadHub();
    expect((await hub.storageProtection()).durability).toBe('persistent');
  });

  it('★ 問い合わせが投げたら best-effort (分からないときは警告を出す側へ倒す)', async () => {
    setStorage(storageStub([new Error('SecurityError')], false));
    const hub = await loadHub();
    expect((await hub.storageProtection()).durability).toBe('best-effort');
  });

  it('durability 以外の名乗りは変わらない (ブラウザ版は常に WebCrypto Vault)', async () => {
    setStorage(storageStub([true, true], true));
    const hub = await loadHub();
    const p = (await hub.storageProtection()) as Protection & {
      encrypted: boolean;
      plainCount: number;
    };
    expect(p.mechanism).toBe('webcrypto-vault');
    expect(p.encrypted).toBe(true);
    expect(p.plainCount).toBe(0);
  });
});

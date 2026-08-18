/** @vitest-environment jsdom */
/**
 * Vault の入力ガードと施錠状態の契約テスト。
 *
 * 背景 — `vault.ts` は 3 つの範囲 (計 610 行 / 全 788 行) を `Stryker disable`
 * しており、AES-GCM の金庫本体はほぼ測られていなかった。無効化を外して実測すると
 * **357 変異体・78.71%・生存 51 / 未到達 25**。
 *
 * 生存していたのは「実装されているのに何も証明していないガード」だった:
 *
 * - パスワード長の下限 (12 字) / 上限 (256 字) — 境界が固定されていない
 * - `serviceId` / `token` の長さ制限 — 上限を外しても誰も気付かない
 * - **施錠中は何もできない** — `if (!this.currentKey) throw` が未到達だった
 * - 復旧ブランチの完全性チェック
 *
 * 施錠中のガードは金庫の意味そのものである。ロックしたのに読み書きできるなら
 * 施錠は飾りになる。
 */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { _resetVaultForTests, getVault, MIN_PASSWORD_LENGTH, NoRecoveryBranchError } from '../vault';
import { webcrypto } from 'node:crypto';
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

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

const OK_PASSWORD = 'correct-horse-battery-staple';

// ===== パスワード長の境界 ================================================

describe('パスワード長 — initialize の境界', () => {
  it(`${MIN_PASSWORD_LENGTH} 文字ちょうどは通す (下限)`, async () => {
    await getVault().initialize('a'.repeat(MIN_PASSWORD_LENGTH));
    expect(getVault().isUnlocked()).toBe(true);
  });

  it(`${MIN_PASSWORD_LENGTH - 1} 文字は断る (下限の外)`, async () => {
    await expect(getVault().initialize('a'.repeat(MIN_PASSWORD_LENGTH - 1)))
      .rejects.toThrow(`${MIN_PASSWORD_LENGTH} 文字以上`);
  });

  it('256 文字ちょうどは通す (上限)', async () => {
    await getVault().initialize('a'.repeat(256));
    expect(getVault().isUnlocked()).toBe(true);
  });

  it('257 文字は断る (上限の外)', async () => {
    await expect(getVault().initialize('a'.repeat(257))).rejects.toThrow('長すぎます');
  });

  it('文字列でないパスワードは断る', async () => {
    await expect(getVault().initialize(null as unknown as string))
      .rejects.toThrow(`${MIN_PASSWORD_LENGTH} 文字以上`);
  });

  it('断ったときは初期化されていない', async () => {
    await getVault().initialize('short').catch(() => null);
    expect(await getVault().status()).toBe('uninitialized');
  });
});

describe('パスワード長 — unlock は空だけ断る (既存の金庫は締め出さない)', () => {
  it('空文字は断る', async () => {
    await getVault().initialize(OK_PASSWORD);
    getVault().lock();
    await expect(getVault().unlock('')).rejects.toThrow('パスワードを入力してください');
  });

  it('文字列でない値は断る', async () => {
    await getVault().initialize(OK_PASSWORD);
    getVault().lock();
    await expect(getVault().unlock(undefined as unknown as string)).rejects.toThrow('パスワードを入力してください');
  });

  // 方針の固定: 下限を上げても**既存の金庫**は開けなくならない。
  // unlock 側で長さ方針を再検査すると、方針変更のたびに利用者が自分の
  // 資格情報から締め出される。
  it('下限より短い既存パスワードでも開けられる', async () => {
    const vault = getVault();
    await vault.initialize('a'.repeat(MIN_PASSWORD_LENGTH));
    vault.lock();
    await vault.unlock('a'.repeat(MIN_PASSWORD_LENGTH));
    expect(vault.isUnlocked()).toBe(true);
  });

  it('違うパスワードでは開かない', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    vault.lock();
    await expect(vault.unlock('wrong-password-entirely')).rejects.toThrow('パスワードが違います');
    expect(vault.isUnlocked()).toBe(false);
  });
});

// ===== 施錠中は何もできない =============================================
//
// 金庫の意味そのもの。ロックしたのに読み書きできるなら施錠は飾りになる。

describe('施錠中の金庫は不活性', () => {
  it('setToken は施錠中に断る', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    vault.lock();
    await expect(vault.setToken('github', 'ghp_x')).rejects.toThrow('ロックされています');
  });

  it('getToken は施錠中に断る', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    vault.lock();
    await expect(vault.getToken('github')).rejects.toThrow('ロックされています');
  });

  it('clearToken は施錠中に断る', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    vault.lock();
    await expect(vault.clearToken('github')).rejects.toThrow('ロックされています');
  });

  it('施錠しても保存済みのトークンは消えない (開け直せば読める)', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await vault.setToken('github', 'ghp_secret');
    vault.lock();
    await vault.unlock(OK_PASSWORD);
    expect(await vault.getToken('github')).toBe('ghp_secret');
  });
});

// ===== serviceId / token の形 ===========================================

describe('serviceId の長さ', () => {
  it('64 文字ちょうどは通す (上限)', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await vault.setToken('s'.repeat(64), 'tok');
    expect(await vault.getToken('s'.repeat(64))).toBe('tok');
  });

  it('65 文字は断る (上限の外)', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await expect(vault.setToken('s'.repeat(65), 'tok')).rejects.toThrow('serviceId が不正です');
  });

  it('空の serviceId は断る', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await expect(vault.setToken('', 'tok')).rejects.toThrow('serviceId が不正です');
  });

  it('文字列でない serviceId は断る', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await expect(vault.setToken(7 as unknown as string, 'tok')).rejects.toThrow('serviceId が不正です');
  });

  it('clearToken も同じ規則で断る', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await expect(vault.clearToken('s'.repeat(65))).rejects.toThrow('serviceId が不正です');
  });
});

describe('token の長さ', () => {
  it('8192 文字ちょうどは通す (上限)', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await vault.setToken('svc', 't'.repeat(8192));
    expect((await vault.getToken('svc'))?.length).toBe(8192);
  });

  it('8193 文字は断る (上限の外)', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await expect(vault.setToken('svc', 't'.repeat(8193))).rejects.toThrow('token が不正です');
  });

  it('空の token は断る', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await expect(vault.setToken('svc', '')).rejects.toThrow('token が不正です');
  });

  it('文字列でない token は断る', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await expect(vault.setToken('svc', 1 as unknown as string)).rejects.toThrow('token が不正です');
  });
});

describe('保存していない serviceId', () => {
  it('null を返す (例外にしない)', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    expect(await vault.getToken('never-saved')).toBeNull();
  });
});

// ===== 復旧の入口 ========================================================

describe('復旧 — 新パスワードの長さ', () => {
  it(`${MIN_PASSWORD_LENGTH - 1} 文字は断る`, async () => {
    await expect(getVault().recoverWithMnemonic('x', 'a'.repeat(MIN_PASSWORD_LENGTH - 1)))
      .rejects.toThrow(`${MIN_PASSWORD_LENGTH} 文字以上`);
  });

  it('257 文字は断る', async () => {
    await expect(getVault().recoverWithMnemonic('x', 'a'.repeat(257)))
      .rejects.toThrow('長すぎます');
  });

  // 長さを通った後は復旧語の検証へ進む = 長さ検査で止まっていないことの対照。
  it('長さが通れば復旧語の検証へ進む', async () => {
    await expect(getVault().recoverWithMnemonic('not a real mnemonic', OK_PASSWORD))
      .rejects.not.toThrow(`${MIN_PASSWORD_LENGTH} 文字以上`);
  });
});

// ===== 鍵が WebCrypto の外へ出られないこと ================================
//
// CLAUDE.md と vault.ts が明言している中心の性質: マスター鍵は
// `extractable: false` で作られ、鍵そのものはメモリの外へ出ない。
//
// ところが `false` を `true` に変える変異体はどのテストでも落ちなかった。
// **金庫の一番大事な性質に証拠が無かった**。
//
// 鍵オブジェクトは外へ公開されていない (公開すれば、それ自体が新しい経路に
// なる)。そこで WebCrypto 側を覗いて、**渡している引数**を直接見る。
describe('マスター鍵は取り出せない形で作る', () => {
  interface KeyCall { algorithm: string; extractable: boolean }

  function spyOnSubtle(): { calls: KeyCall[]; restore: () => void } {
    const subtle = globalThis.crypto.subtle;
    const origDerive = subtle.deriveKey.bind(subtle);
    const origImport = subtle.importKey.bind(subtle);
    const calls: KeyCall[] = [];
    const nameOf = (a: unknown): string =>
      typeof a === 'string' ? a : String((a as { name?: string })?.name ?? '');

    (subtle as unknown as { deriveKey: unknown }).deriveKey = ((
      algo: AlgorithmIdentifier, base: CryptoKey, derived: AlgorithmIdentifier,
      extractable: boolean, usages: KeyUsage[],
    ) => {
      calls.push({ algorithm: nameOf(derived), extractable });
      return origDerive(algo as Algorithm, base, derived as AesDerivedKeyParams, extractable, usages);
    }) as typeof subtle.deriveKey;

    (subtle as unknown as { importKey: unknown }).importKey = ((
      format: string, keyData: BufferSource, algo: AlgorithmIdentifier,
      extractable: boolean, usages: KeyUsage[],
    ) => {
      calls.push({ algorithm: nameOf(algo), extractable });
      return origImport(format as 'raw', keyData, algo as AlgorithmIdentifier, extractable, usages);
    }) as typeof subtle.importKey;

    return {
      calls,
      restore: () => {
        (subtle as unknown as { deriveKey: unknown }).deriveKey = origDerive;
        (subtle as unknown as { importKey: unknown }).importKey = origImport;
      },
    };
  }

  it('initialize で作る AES-GCM 鍵はすべて extractable: false', async () => {
    const spy = spyOnSubtle();
    try {
      await getVault().initialize(OK_PASSWORD);
      const aes = spy.calls.filter((c) => c.algorithm === 'AES-GCM');
      expect(aes.length).toBeGreaterThan(0); // 覗けていることの対照
      expect(aes.every((c) => c.extractable === false)).toBe(true);
    } finally { spy.restore(); }
  });

  it('unlock で作る AES-GCM 鍵はすべて extractable: false', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    vault.lock();
    const spy = spyOnSubtle();
    try {
      await vault.unlock(OK_PASSWORD);
      const aes = spy.calls.filter((c) => c.algorithm === 'AES-GCM');
      expect(aes.length).toBeGreaterThan(0);
      expect(aes.every((c) => c.extractable === false)).toBe(true);
    } finally { spy.restore(); }
  });

  it('PBKDF2 の素材鍵も extractable: false', async () => {
    const spy = spyOnSubtle();
    try {
      await getVault().initialize(OK_PASSWORD);
      const pbkdf2 = spy.calls.filter((c) => c.algorithm === 'PBKDF2');
      expect(pbkdf2.length).toBeGreaterThan(0);
      expect(pbkdf2.every((c) => c.extractable === false)).toBe(true);
    } finally { spy.restore(); }
  });

  it('extractable: true で作られた鍵は 1 つも無い (全体の対照)', async () => {
    const spy = spyOnSubtle();
    try {
      const vault = getVault();
      await vault.initialize(OK_PASSWORD);
      await vault.setToken('svc', 'tok');
      vault.lock();
      await vault.unlock(OK_PASSWORD);
      expect(spy.calls.filter((c) => c.extractable)).toEqual([]);
    } finally { spy.restore(); }
  });
});

// ===== 復旧パスワードの境界 (下限・上限ちょうど) ==========================

describe('復旧 — 新パスワード長の境界ちょうど', () => {
  it(`${MIN_PASSWORD_LENGTH} 文字ちょうどは長さ検査を通る`, async () => {
    await expect(getVault().recoverWithMnemonic('x', 'a'.repeat(MIN_PASSWORD_LENGTH)))
      .rejects.not.toThrow('文字以上');
  });

  it('256 文字ちょうどは長さ検査を通る', async () => {
    await expect(getVault().recoverWithMnemonic('x', 'a'.repeat(256)))
      .rejects.not.toThrow('長すぎます');
  });

  it('文字列でない新パスワードは断る', async () => {
    await expect(getVault().recoverWithMnemonic('x', null as unknown as string))
      .rejects.toThrow(`${MIN_PASSWORD_LENGTH} 文字以上`);
  });
});

// ===== clearToken の serviceId 検査 ======================================

describe('clearToken の serviceId', () => {
  it('空文字は断る', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await expect(vault.clearToken('')).rejects.toThrow('serviceId が不正です');
  });

  it('文字列でない値は断る', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await expect(vault.clearToken(9 as unknown as string)).rejects.toThrow('serviceId が不正です');
  });

  it('64 文字ちょうどは通す (上限)', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await vault.setToken('s'.repeat(64), 'tok');
    await vault.clearToken('s'.repeat(64));
    expect(await vault.getToken('s'.repeat(64))).toBeNull();
  });
});

// ===== 旧世代の金庫 / 復旧ブランチの欠落 ==================================
//
// どちらも「保存されているものが揃っていない」状態からの経路で、通常の
// API 操作では作れない。IndexedDB を直接いじって作る。

const DB_NAME = 'business-hub-vault';
const META_STORE = 'meta';

function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => {
      const db = req.result;
      fn(db).then((v) => { db.close(); resolve(v); }, (e: unknown) => { db.close(); reject(e); });
    };
    req.onerror = () => reject(req.error);
  });
}

function metaDelete(key: string): Promise<void> {
  return withDb((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function metaPatch(key: string, patch: (v: Record<string, unknown>) => void): Promise<void> {
  return withDb((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    const store = tx.objectStore(META_STORE);
    const get = store.get(key);
    get.onsuccess = () => {
      const v = get.result as Record<string, unknown>;
      patch(v);
      store.put(v, key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

describe('旧世代の金庫 (master-wrap を持たない)', () => {
  it('master-wrap が無くても開けられる (パスワード鍵をそのまま使う)', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await vault.setToken('svc', 'tok');
    // Phase E 以前の形にする: master-wrap を消す。
    await metaDelete('master-wrap');
    vault.lock();
    await vault.unlock(OK_PASSWORD);
    expect(vault.isUnlocked()).toBe(true);
  });

  it('旧世代でも違うパスワードでは開かない', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await metaDelete('master-wrap');
    vault.lock();
    await expect(vault.unlock('wrong-password-entirely')).rejects.toThrow('パスワードが違います');
  });
});

describe('復旧ブランチを持たない金庫', () => {
  it('復旧しようとすると NoRecoveryBranchError', async () => {
    const vault = getVault();
    const { mnemonic } = await vault.initialize(OK_PASSWORD);
    await metaPatch('vault', (v) => {
      delete v.recoverySalt;
      delete v.recoveryIv;
      delete v.recoveryKcv;
      delete v.recoveryWrapIv;
      delete v.recoveryWrappedKey;
    });
    await expect(vault.recoverWithMnemonic(mnemonic, OK_PASSWORD))
      .rejects.toThrow(NoRecoveryBranchError);
  });

  // 5 つのうち **どれか 1 つ**でも欠ければ復旧に進まない。1 つでも見落とすと、
  // 途中で復号に失敗して「壊れた金庫」になる。全項目を個別に確かめる。
  for (const field of ['recoverySalt', 'recoveryIv', 'recoveryKcv', 'recoveryWrapIv', 'recoveryWrappedKey']) {
    it(`${field} だけ欠けても復旧しない`, async () => {
      const vault = getVault();
      const { mnemonic } = await vault.initialize(OK_PASSWORD);
      await metaPatch('vault', (v) => { delete v[field]; });
      await expect(vault.recoverWithMnemonic(mnemonic, OK_PASSWORD))
        .rejects.toThrow(NoRecoveryBranchError);
    });
  }

  it('そろっていれば復旧できる (対照)', async () => {
    const vault = getVault();
    const { mnemonic } = await vault.initialize(OK_PASSWORD);
    await vault.setToken('svc', 'tok');
    vault.lock();
    await vault.recoverWithMnemonic(mnemonic, 'brand-new-password-here');
    expect(vault.isUnlocked()).toBe(true);
    expect(await vault.getToken('svc')).toBe('tok');
  });
});

// ===== 使い終えた鍵バイト列を 0 で潰す ==================================
//
// 生のマスター鍵は WebCrypto へ取り込んだあと、`finally { raw.fill(0) }` で
// 必ず潰される。これは変異検査で `finally` の中身を空にしても誰も気付かない
// 状態だった (外から観測する手段が無いため)。
//
// pragma で黙らせるのではなく、**`fill(0)` が実際に呼ばれること**を見る。
// メモリ衛生は「やっているつもり」で落ちやすい種類の防御なので、証拠を残す。
describe('生の鍵バイト列を 0 で潰す', () => {
  function countZeroFills(): { count: () => number; restore: () => void } {
    const orig = Uint8Array.prototype.fill;
    let n = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Uint8Array.prototype as any).fill = function patched(this: Uint8Array, value: number, ...rest: number[]) {
      if (value === 0) n++;
      return (orig as (this: Uint8Array, v: number, ...r: number[]) => Uint8Array).call(this, value, ...rest);
    };
    return { count: () => n, restore: () => { Uint8Array.prototype.fill = orig; } };
  }

  it('initialize は生の鍵を 0 で潰す', async () => {
    const spy = countZeroFills();
    try {
      await getVault().initialize(OK_PASSWORD);
      expect(spy.count()).toBeGreaterThan(0);
    } finally { spy.restore(); }
  });

  it('unlock は生の鍵を 0 で潰す', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    vault.lock();
    const spy = countZeroFills();
    try {
      await vault.unlock(OK_PASSWORD);
      expect(spy.count()).toBeGreaterThan(0);
    } finally { spy.restore(); }
  });

  it('recoverWithMnemonic は生の鍵を 0 で潰す', async () => {
    const vault = getVault();
    const { mnemonic } = await vault.initialize(OK_PASSWORD);
    vault.lock();
    const spy = countZeroFills();
    try {
      await vault.recoverWithMnemonic(mnemonic, 'another-long-password-x');
      expect(spy.count()).toBeGreaterThan(0);
    } finally { spy.restore(); }
  });
});

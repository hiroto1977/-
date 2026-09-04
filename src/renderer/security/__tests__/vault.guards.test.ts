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
import {
  _resetVaultForTests,
  getVault,
  meetsPasswordPolicy,
  MIN_PASSWORD_LENGTH,
  NoRecoveryBranchError,
} from '../vault';
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

  /*
   * **`changePassword` だけ、この検査が無かった** (実測 2026-08-31: 中間鍵を
   * 潰す `finally` を空にしても全検査が通った)。鍵素材を消す作法は 4 か所に
   * 書いてあるのに、確かめていたのは 3 か所だった —— 「書いてある」と
   * 「効いている」は別である。
   */
  it('changePassword は生の鍵を 0 で潰す', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    const spy = countZeroFills();
    try {
      const before = spy.count();
      await vault.changePassword(OK_PASSWORD, 'another-long-password-x');
      expect(spy.count()).toBeGreaterThan(before);
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

/*
 * **下限そのものを、保管庫を作らずに問う。**
 *
 * 判定は `unlock` の中に埋まっていて、`false` になる枝へ検査から到達する
 * 手段が無かった —— 短いパスワードの保管庫は `initialize` /
 * `changePassword` / `recoverWithMnemonic` がどれも下限を強制するので、
 * 現在の API では作れない。その結果、**下限を撃ち抜く変異が 2 件生き残って
 * いた** (`>=` → `>` と、式ごと `true`。実測 2026-08-31)。
 *
 * 式を `meetsPasswordPolicy` として外へ出したので、ここで直接問える。
 * 境界の 3 点 (11 / 12 / 13) を取る —— `>=` を `>` にすると 12 が落ち、
 * 式を `true` にすると 11 が落ちる。**片方だけでは両方の変異を捕まえられない。**
 */
describe('パスワード下限の判定 (meetsPasswordPolicy)', () => {
  it('下限ちょうど (12 字) は満たす —— >= を > にすると鳴る', () => {
    expect('a'.repeat(MIN_PASSWORD_LENGTH)).toHaveLength(12);
    expect(meetsPasswordPolicy('a'.repeat(MIN_PASSWORD_LENGTH))).toBe(true);
  });

  it('下限 −1 (11 字) は満たさない —— 判定を true 固定にすると鳴る', () => {
    expect(meetsPasswordPolicy('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(false);
  });

  it('下限 +1 (13 字) は満たす', () => {
    expect(meetsPasswordPolicy('a'.repeat(MIN_PASSWORD_LENGTH + 1))).toBe(true);
  });

  it('空文字は満たさない', () => {
    expect(meetsPasswordPolicy('')).toBe(false);
  });

  /*
   * **長さの上限 (256 字) はここには無い。** あちらは「強制する」側の規則で、
   * `unlock` は通さない —— 混ぜると既存の保管庫を閉め出す。
   * 258 字が `true` を返すことで、混ざっていないことを留める。
   */
  it('上限の判定を混ぜていない (258 字も「下限は満たす」)', () => {
    expect(meetsPasswordPolicy('a'.repeat(258))).toBe(true);
  });

  it('強制する側は同じ判定を使っている (下限 −1 は initialize が断る)', async () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(meetsPasswordPolicy(short)).toBe(false);
    await expect(getVault().initialize(short)).rejects.toThrow(
      `パスワードは ${MIN_PASSWORD_LENGTH} 文字以上で設定してください`,
    );
  });
});

/*
 * **「短い」状態が解消したことを、両方の枝で報せる。**
 *
 * `changePassword` は保管庫の形で 2 つの枝に分かれる —— `master-wrap` を
 * 持つ通常路と、Phase E 以前の旧世代路である。`this.policyOk = true` は
 * 2026-08-28 まで**旧世代路にしか無かった**ので通常路へ足されたが、
 * 今度は**旧世代路のほうが誰にも確かめられていなかった** (実測: その 1 行を
 * `false` にしても全検査が通る)。案内どおりに直したのに診断が同じ指摘を
 * 出し続ける、という同じ不具合が枝を替えて残っていたことになる。
 */
describe('パスワードを変えたら「短い」状態は解消する', () => {
  const LONG_NEW = 'another-long-password-x';

  it('通常路 (master-wrap あり) —— 変更後は下限を満たす', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await vault.changePassword(OK_PASSWORD, LONG_NEW);
    expect(vault.passwordMeetsPolicy()).toBe(true);
  });

  /*
   * 旧世代の保管庫では、パスワード鍵が**そのまま**トークンの鍵である
   * (`master-wrap` が無いので中間鍵が挟まらない)。だから **master-wrap を
   * 消してから解錠し、その状態でトークンを書く** —— 先に書くと中間鍵で
   * 封緘されたトークンが残り、旧世代路の復号 (パスワード鍵) では開けない。
   * 最初そう書いて `OperationError: Cipher job failed` で落ちた。
   * **替え玉の保管庫は、形だけでなく中身も辻褄が合っていないといけない。**
   */
  it('★ 旧世代路 (master-wrap なし) —— 変更後は下限を満たす', async () => {
    const vault = getVault();
    await vault.initialize(OK_PASSWORD);
    await metaDelete('master-wrap'); // Phase E 以前の形
    vault.lock();
    await vault.unlock(OK_PASSWORD);
    await vault.setToken('github', 'ghp_x');
    await vault.changePassword(OK_PASSWORD, LONG_NEW);
    expect(vault.passwordMeetsPolicy()).toBe(true);
    // 経路が生きていることの確認 (中身も一緒に運ばれ、新しい鍵で開く)。
    expect(await vault.getToken('github')).toBe('ghp_x');
    vault.lock();
    await vault.unlock(LONG_NEW);
    expect(await vault.getToken('github')).toBe('ghp_x');
  });

  it('★ 復旧フレーズで開け直したときも下限を満たす', async () => {
    const vault = getVault();
    const { mnemonic } = await vault.initialize(OK_PASSWORD);
    await vault.setToken('github', 'ghp_y');
    vault.lock();
    expect(vault.passwordMeetsPolicy(), '施錠で「分からない」に戻る').toBeNull();
    await vault.recoverWithMnemonic(mnemonic, LONG_NEW);
    expect(vault.passwordMeetsPolicy()).toBe(true);
    expect(await vault.getToken('github')).toBe('ghp_y');
  });
});

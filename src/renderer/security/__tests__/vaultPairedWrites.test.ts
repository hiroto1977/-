/** @vitest-environment jsdom */
/**
 * **meta と master-wrap は 1 トランザクションで入れ替える** (2026-09-21 · パス 361)。
 *
 * `vault.ts` の `idbPutAll` は自分の docblock で危険を名指ししている:
 *
 * > `idbPut` を 2 回呼ぶと**トランザクションが 2 つ**になる。パスワード周りでは
 * > これが効く —— meta (`salt`/`kcv`) を書いた後に `master-wrap` の書き込みが
 * > 失敗すると、**新旧どちらのパスワードでも開けない保管庫**が残る。
 *
 * その当のことを **`initialize` だけがやっていた** —— `changePassword` と
 * `recoverWithMnemonic` は最初から `idbPutAll` を通っており、初期化だけが
 * `idbPut` を 2 回呼んでいた。
 *
 * ## 実測 (2026-09-21 · 直す前)
 *
 * meta だけ書けて master-wrap が書けなかった金庫を作って測ると、docblock が
 * 警告する「どちらでも開けない」より**静かで悪い**結末になる:
 *
 * ```
 *   unlock(password)      → UNLOCK SUCCEEDED
 *   setToken / getToken   → ok (往復する)
 *   recoverWithMnemonic   → TOKEN LOST (null)
 * ```
 *
 * `unlock` は master-wrap の無い金庫を **Phase E 以前の旧形式**と見なして
 * `currentKey = passwordKey` へ倒す (前方互換として正しい)。つまり利用者は
 * **動く金庫を見るので設定をやり直さない** —— しかも `initialize` は meta が在れば
 * 「既に初期化されています」と断るので**やり直せない**。その間のトークンは
 * passwordKey で包まれるが、meta の `recoveryWrappedKey` が包むのは**本物の
 * master 鍵**なので、大事に控えた 24 語で復旧した瞬間に実効鍵が入れ替わり、
 * **それまでのトークンが全部読めなくなる**。
 *
 * ## 断る側には倒さない (測って決めた)
 *
 * 「meta が Phase E を名乗るのに master-wrap が無ければ unlock を断る」は
 * **既にこの状態に居る利用者にとって改悪**である —— 今読めているトークンがその場で
 * 読めなくなり、復旧しても失われる結末は変わらない。master-wrap は master 鍵が
 * 無いと作れず、master 鍵は復旧枝からしか出てこないので解錠時に直すこともできない。
 * だから塞ぐのは**作る側**だけにする。
 *
 * ## ここで見るもの
 *
 * 1. `initialize` が meta と master-wrap を **1 つの readwrite トランザクション**で
 *    書く (振る舞い —— `db.transaction` を数える)。
 * 2. この組を書く関数の母集団が**全部 `idbPutAll` を通る** —— 両方向の台帳。
 * 3. 旧形式の前方互換 (master-wrap が無い金庫を passwordKey で開ける) は**残っている**
 *    —— 直しは「作る側を原子的にする」であって、前方互換を消すことではない。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { join } from 'node:path';
import { _resetVaultForTests, getVault } from '../vault';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { webcrypto } from 'node:crypto';
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const PW = 'correct-horse-battery-staple';
const VAULT_SRC = readOriginalSource(join(__dirname, '../vault.ts'));

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

/** `meta` ストアへの readwrite トランザクションで書かれた鍵を、開始ごとにまとめて記録する。 */
function recordMetaWrites(): { batches: string[][]; restore: () => void } {
  const batches: string[][] = [];
  const realTransaction = IDBDatabase.prototype.transaction;
  const spy = vi
    .spyOn(IDBDatabase.prototype, 'transaction')
    .mockImplementation(function (this: IDBDatabase, names: string | Iterable<string>, mode?: IDBTransactionMode) {
      const tx = realTransaction.call(this, names as string, mode);
      if (mode !== 'readwrite') return tx;
      const list = typeof names === 'string' ? [names] : [...names];
      if (!list.includes('meta')) return tx;
      const keys: string[] = [];
      batches.push(keys);
      const realObjectStore = tx.objectStore.bind(tx);
      // **ストアごとに 1 度だけ包む。** `idbPutAll` は entry ごとに
      // `tx.objectStore(...)` を呼び、fake-indexeddb は同じインスタンスを返すので、
      // 素朴に包むと 2 度目に**自分の包みを包んで** 1 回の put が 2 回記録される
      // (最初の実行でそう出た —— 製品ではなく観測器の側の誤りだった)。
      const wrapped = new Map<string, IDBObjectStore>();
      Object.defineProperty(tx, 'objectStore', {
        value: (storeName: string) => {
          const cached = wrapped.get(storeName);
          if (cached !== undefined) return cached;
          const store = realObjectStore(storeName);
          const realPut = store.put.bind(store);
          Object.defineProperty(store, 'put', {
            value: (value: unknown, key?: IDBValidKey) => {
              if (storeName === 'meta' && typeof key === 'string') keys.push(key);
              return realPut(value, key as IDBValidKey);
            },
            configurable: true,
          });
          wrapped.set(storeName, store);
          return store;
        },
        configurable: true,
      });
      return tx;
    });
  return { batches, restore: () => spy.mockRestore() };
}

describe('meta と master-wrap の対の書き込み (パス 361)', () => {
  it('★ initialize は 2 つを 1 トランザクションで書く', async () => {
    const { batches, restore } = recordMetaWrites();
    try {
      await getVault().initialize(PW);
    } finally {
      restore();
    }
    const paired = batches.filter((b) => b.includes('vault') || b.includes('master-wrap'));
    // **1 つの batch に両方**入っていること (2 つに割れていたら 2 行になる)。
    expect(paired).toEqual([['vault', 'master-wrap']]);
  }, 120_000);

  it('★ この組を書く関数は全部 `idbPutAll` を通る (両方向の台帳)', () => {
    // 母集団 = `master-wrap` を **put する** 関数。`idbPut(` で書いている物が
    // 1 つでも残っていたら落ちる (綴りではなく助けの選択を見る)。
    const singlePutMasterWrap = /idbPut\(\s*db,\s*META_STORE,\s*'master-wrap'/g;
    expect(VAULT_SRC.match(singlePutMasterWrap)).toBeNull();
    // 針が当たることの標本 —— 旧い綴りは実際にこの針に掛かる。
    expect("        await idbPut(db, META_STORE, 'master-wrap', {").toMatch(
      /idbPut\(\s*db,\s*META_STORE,\s*'master-wrap'/,
    );
    // 逆向き: `master-wrap` を書く所は 3 つで、どれも `idbPutAll` の配列の中に在る。
    const inPutAll = [...VAULT_SRC.matchAll(/key: 'master-wrap'/g)].length;
    expect(inPutAll).toBe(3);
    // その 3 つが `initialize` / `changePassword` / `recoverWithMnemonic` に在ること。
    for (const fn of ['async initialize(', 'async changePassword(', 'async recoverWithMnemonic(']) {
      const start = VAULT_SRC.indexOf(fn);
      expect(start, `${fn} が見つかりません`).toBeGreaterThan(0);
      // 次のメソッド宣言までを本体とする (固定幅で切ると長いメソッドの末尾が落ちる ——
      // `recoverWithMnemonic` は v0 移行のぶんだけ長い)。
      const rest = VAULT_SRC.slice(start + fn.length);
      const nextMethod = rest.search(/\n {2}(?:async )?[A-Za-z_][\w]*\(/);
      const body = nextMethod === -1 ? rest : rest.slice(0, nextMethod);
      expect(body, `${fn} が master-wrap を idbPutAll で書いていません`).toContain("key: 'master-wrap'");
    }
  });

  it('★ 旧形式の前方互換は残っている (master-wrap の無い金庫は passwordKey で開く)', async () => {
    // 直しは「作る側を原子的にする」であって前方互換を消すことではない ——
    // 消すと Phase E 以前の金庫を持つ利用者が締め出される。
    await getVault().initialize(PW);
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('business-hub-vault');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').delete('master-wrap');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
      open.onerror = () => reject(open.error);
    });
    _resetVaultForTests();
    const v = getVault();
    await v.unlock(PW);
    expect(v.isUnlocked()).toBe(true);
  }, 120_000);
});

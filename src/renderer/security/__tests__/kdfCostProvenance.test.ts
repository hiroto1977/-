/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import {
  LEGACY_KDF_ITERATIONS,
  MIN_SALT_BYTES,
  MIN_STORED_SALT_BYTES,
  PBKDF2_ITERATIONS,
} from '../../../shared/cryptoParams';
import { assertSaltBytes, saltBytesOk, encryptString, decryptString } from '../dataCrypto';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { join } from 'node:path';
import { _resetVaultForTests, getVault } from '../vault';
import { getRecordStore, _resetRecordStoreForTests } from '../../data/store';
import {
  enableEncryption,
  unlockEncryption,
  disableEncryption,
} from '../../data/recordEncryption';

if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

/*
 * **封緘した物は、自分を作った反復回数を覚えていなければならない。**
 *
 * `PBKDF2_ITERATIONS` は動く定数である。実際に一度動いた
 * (`dataCrypto.ts` の注記: OWASP の SHA-256 の床に合わせて 210,000 → 600,000。
 *  2026-07 の監査) し、`MAX_KDF_ITERATIONS = 4_000_000` という天井は
 * 「これからも上げる」という前提そのものである。床が上がるのは良いことだが、
 * **上げた瞬間に、古い定数で作られた鍵が導出できなくなる**。
 *
 * だから保存する側が回数を書き残す。バックアップの `EncryptedBundle` は
 * そうしている (`iterations` を持ち、復号は `bundle.iterations` を読む) ——
 * モジュールの注記が「古い値で書かれた封緘も自分の回数で開く」と明言している。
 *
 * 4 つある PBKDF2 の導出のうち、その約束を守っていたのは 1.5 個だった:
 *
 *   ① バックアップ (dataCrypto)          … 保存し、読む            ✅
 *   ② 保管庫のパスワード (vault unlock)  … 保存し、読む            ✅
 *   ③ 保管庫のリカバリーキー             … **定数で導出**          ❌ (パス 239)
 *   ④ 業務レコードの封緘                 … **回数を保存しない**    ❌ (パス 239)
 *
 * そして ② が正しいことが、③ の穴を**致命傷に変えていた** ——
 * `recoverWithMnemonic` は新しいパスワードを**定数**で導出するのに、
 * `meta.iterations` を**書き換えていなかった** (`changePassword` は書き換える)。
 * 保管値と定数が違う金庫で復旧すると、**今設定したばかりのパスワードが
 * 二度と通らない**。しかもリカバリーキーは使い切っている。
 *
 * ここはその 3 つを機械で留める。
 */

const clearVaultIdb = (): Promise<void> =>
  new Promise((r) => {
    const q = indexedDB.deleteDatabase('business-hub-vault');
    q.onsuccess = () => r();
    q.onerror = () => r();
    q.onblocked = () => r();
  });

const clearDataIdb = (): Promise<void> =>
  new Promise((r) => {
    const q = indexedDB.deleteDatabase('business-hub-data');
    q.onsuccess = () => r();
    q.onerror = () => r();
    q.onblocked = () => r();
  });

/** meta を生で読む (保管庫の外から、保存された値そのものを見る)。 */
function readMeta(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('business-hub-vault');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction('meta', 'readonly').objectStore('meta').get('vault');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        db.close();
        resolve(req.result as Record<string, unknown>);
      };
    };
  });
}

/** meta の欄を書き換える (保存領域へ書ける相手／過去の定数で作られた金庫を再現)。 */
function patchMeta(patch: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('business-hub-vault');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const store = db.transaction('meta', 'readwrite').objectStore('meta');
      const get = store.get('vault');
      get.onerror = () => reject(get.error);
      get.onsuccess = () => {
        const put = store.put({ ...(get.result as object), ...patch }, 'vault');
        put.onerror = () => reject(put.error);
        put.onsuccess = () => {
          db.close();
          resolve();
        };
      };
    };
  });
}

const PW = 'initial-password-1234';
const NEW_PW = 'recovered-password-5678';
/** 定数とは違う、しかも `assertKdfIterations` の範囲内の回数 (= 昔の定数に相当)。 */
const OTHER_COUNT = 150_000;

describe('KDF の反復回数の出どころ (パス 239)', () => {
  beforeEach(async () => {
    _resetVaultForTests();
    await clearVaultIdb();
  });

  it('★ recoverWithMnemonic は、実際に使った反復回数を meta に書き残す', async () => {
    const v = getVault();
    const { mnemonic } = await v.initialize(PW);

    // 「定数が上がった後」の金庫を再現する —— 保存された回数が今の定数と違う。
    // パスワード枝は 600,000 で作られているので旧パスワードは通らなくなるが、
    // 復旧はリカバリーキーを使うので関係しない (まさに忘れたときの経路)。
    await patchMeta({ iterations: OTHER_COUNT });
    _resetVaultForTests();

    const v2 = getVault();
    await v2.recoverWithMnemonic(mnemonic, NEW_PW);

    // 復旧が書いた meta の回数は、復旧が新パスワードを導出した回数と一致すること。
    const meta = await readMeta();
    expect(meta.iterations).toBe(PBKDF2_ITERATIONS);

    // 一致していなければここが落ちる —— **今設定したばかりのパスワードが通らない**。
    v2.lock();
    _resetVaultForTests();
    const v3 = getVault();
    await expect(v3.unlock(NEW_PW)).resolves.toBeUndefined();
  });

  it('★ リカバリー枝は保存された回数で導出する (定数を読まない)', async () => {
    const v = getVault();
    const { mnemonic } = await v.initialize(PW);

    // 初期化は自分が使った回数を書き残していること。
    const meta = await readMeta();
    expect(meta.recoveryIterations).toBe(PBKDF2_ITERATIONS);

    // 回数だけを differing な値へ書き換える (包み直しはしない) → 別の鍵になるので
    // 復旧は失敗しなければならない。**素通り = 保存値を読んでいない証拠**。
    await patchMeta({ recoveryIterations: OTHER_COUNT });
    _resetVaultForTests();
    const v2 = getVault();
    await expect(v2.recoverWithMnemonic(mnemonic, NEW_PW)).rejects.toThrow(/リカバリーキー/);
  });

  it('★ recoveryIterations が無い古い meta も、そのまま復旧できる', async () => {
    const v = getVault();
    const { mnemonic } = await v.initialize(PW);

    // 欄が出来る前に書かれた meta を再現する。
    const meta = await readMeta();
    delete meta.recoveryIterations;
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('business-hub-vault');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const put = db.transaction('meta', 'readwrite').objectStore('meta').put(meta, 'vault');
        put.onerror = () => reject(put.error);
        put.onsuccess = () => {
          db.close();
          resolve();
        };
      };
    });
    _resetVaultForTests();

    const v2 = getVault();
    await expect(v2.recoverWithMnemonic(mnemonic, NEW_PW)).resolves.toBeUndefined();
  });
});

describe('業務レコードの封緘も反復回数を覚える (パス 239)', () => {
  const LS_KEY = 'servicehub.recordEncryption';

  beforeEach(async () => {
    _resetRecordStoreForTests();
    localStorage.clear();
    await clearDataIdb();
  });

  it('★ enableEncryption は使った反復回数を meta に書き残す', async () => {
    await enableEncryption('record-passphrase-1234');
    const meta = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as { iterations?: number };
    expect(meta.iterations).toBe(PBKDF2_ITERATIONS);
  });

  it('★ unlockEncryption は保存された回数で導出する (定数を読まない)', async () => {
    await enableEncryption('record-passphrase-1234');
    const meta = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Record<string, unknown>;
    // 回数だけを別の値へ → 別の鍵 → KCV が開かない → false。
    // true が返るなら保存値を読んでいない。
    localStorage.setItem(LS_KEY, JSON.stringify({ ...meta, iterations: OTHER_COUNT }));
    await expect(unlockEncryption('record-passphrase-1234')).resolves.toBe(false);
  });

  it('★ iterations が無い古い meta も、そのまま解錠・解除できる', async () => {
    await enableEncryption('record-passphrase-1234');
    const store = getRecordStore();
    await store.insert('sales', { amount: 1 });

    const meta = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Record<string, unknown>;
    delete meta.iterations;
    localStorage.setItem(LS_KEY, JSON.stringify(meta));

    _resetRecordStoreForTests();
    await expect(unlockEncryption('record-passphrase-1234')).resolves.toBe(true);
    await expect(disableEncryption('record-passphrase-1234')).resolves.toBe(true);
  });
});

describe('凍結値は凍結されていること (パス 239)', () => {
  /*
   * `LEGACY_KDF_ITERATIONS` が `PBKDF2_ITERATIONS` の別名になると、この仕組みは
   * **黙って無力になる** —— 値が等しいので実行時には見分けられず、定数を上げた
   * 日に古い保存値が一斉に開かなくなる。だから原文を見る。
   *
   * (値が等しいことを検査に使えないのはこの検査の弱点そのものなので、
   *  ここでは「数値リテラルで宣言されていること」を留める。)
   */
  it('★ LEGACY_KDF_ITERATIONS は数値リテラルで宣言されている (別名ではない)', () => {
    const src = readOriginalSource(join(process.cwd(), 'src/shared/cryptoParams.ts'));
    const decl = /export const LEGACY_KDF_ITERATIONS = ([^;]+);/.exec(src);
    expect(decl).not.toBeNull();
    const rhs = (decl?.[1] ?? '').trim();
    // 標本: 規則が実際にこの形へ当たることを、同じ検査の中で確かめる。
    expect(/^[0-9_]+$/.test(rhs)).toBe(true);
    expect(/^[0-9_]+$/.test('PBKDF2_ITERATIONS')).toBe(false);
    expect(/^[0-9_]+$/.test('600_000')).toBe(true);
    expect(Number(rhs.replace(/_/g, ''))).toBe(LEGACY_KDF_ITERATIONS);
  });

  it('★ 今日の定数と凍結値は一致している (歴史的事実の記録)', () => {
    // 一致しているのは「まだ上げていない」からで、**上げたあとも一致し続けて
    // はならない**。この検査は上げた日に落ちる —— そのとき落とすべきなのは
    // この行であって、凍結値ではない。
    expect(LEGACY_KDF_ITERATIONS).toBe(PBKDF2_ITERATIONS);
  });
});

describe('ソルトの床も、保存物と生成物で別 (パス 240)', () => {
  /*
   * 反復回数と同じ形が隣の欄に在った。`MIN_SALT_BYTES` は
   *   - 新しいソルトの**長さ** (`randomSaltB64` / `encryptString` が採る)
   *   - 保存済みソルトを受け入れる**床** (`assertSaltBytes` / `saltBytesOk`)
   * の両方を兼ねており、**1 バイト上げるだけで既存のバックアップと
   * レコード封緘が全部開かなくなった**。
   *
   * 危険は `deriveAesKey` の注記に書かれていたが、**上げる編集をするのは
   * `shared/cryptoParams.ts` の宣言行**で、そこには「増やすのは自由」と
   * しか書いていなかった。注記は動かす側に置き、床は凍結した。
   */
  it('★ 検証の床は凍結値で、生成の長さとは別の宣言である', () => {
    const src = readOriginalSource(join(process.cwd(), 'src/shared/cryptoParams.ts'));
    const frozen = /export const MIN_STORED_SALT_BYTES = ([^;]+);/.exec(src);
    const gen = /export const MIN_SALT_BYTES = ([^;]+);/.exec(src);
    expect(frozen).not.toBeNull();
    expect(gen).not.toBeNull();
    // どちらも数値リテラル (片方が他方の別名になると仕組みごと無力になる)。
    expect(/^[0-9_]+$/.test((frozen?.[1] ?? '').trim())).toBe(true);
    expect(/^[0-9_]+$/.test((gen?.[1] ?? '').trim())).toBe(true);
    // 標本: 規則が実際に別名を落とすこと。
    expect(/^[0-9_]+$/.test('MIN_SALT_BYTES')).toBe(false);
  });

  it('★ 検証する関数は、生成側の定数を読まない', () => {
    const src = readOriginalSource(join(process.cwd(), 'src/renderer/security/dataCrypto.ts'));
    // 比較の行そのものを取り出して、凍結値を見ていることを確かめる。
    const assertBody = /export function assertSaltBytes[\s\S]{0,400}?\n\}/.exec(src)?.[0] ?? '';
    expect(assertBody).toContain('MIN_STORED_SALT_BYTES');
    expect(assertBody).not.toMatch(/salt\.length < MIN_SALT_BYTES/);
    // 標本: この正規表現が本当に welded な書き方へ当たること。
    expect('  if (salt.length < MIN_SALT_BYTES) {').toMatch(/salt\.length < MIN_SALT_BYTES/);
    // 生成側は動かしてよい定数のままであること (凍結値に張り替えてしまうと、
    // 床を上げても新しいソルトが伸びない = 上げた意味が無くなる)。
    expect(src).toContain('const SALT_BYTES = MIN_SALT_BYTES;');
  });

  it('★ 凍結値ちょうどの長さのソルトは、投げる道も真偽の道も受け入れる', () => {
    const atFloor = new Uint8Array(MIN_STORED_SALT_BYTES);
    expect(() => assertSaltBytes(atFloor)).not.toThrow();
    expect(saltBytesOk(btoa(String.fromCharCode(...atFloor)))).toBe(true);
    // 1 バイト足りなければ、両方の道が断る (床が生きている証拠)。
    const below = new Uint8Array(MIN_STORED_SALT_BYTES - 1);
    expect(() => assertSaltBytes(below)).toThrow(/ソルト/);
    expect(saltBytesOk(btoa(String.fromCharCode(...below)))).toBe(false);
    // 空も断る。
    expect(() => assertSaltBytes(new Uint8Array(0))).toThrow(/ソルト/);
  });

  it('★ 今日は生成 == 凍結値。生成側だけを上げても読めなくならない関係', () => {
    // 一致しているのは「まだ上げていない」からで、**上げたあとも一致し続けて
    // はならない**。凍結値が生成側を超えることも在ってはならない (超えると
    // 生成したばかりのソルトが自分の床を割る)。
    expect(MIN_STORED_SALT_BYTES).toBe(MIN_SALT_BYTES);
    expect(MIN_STORED_SALT_BYTES).toBeLessThanOrEqual(MIN_SALT_BYTES);
  });

  it('★ 凍結値の長さで封緘したバックアップは、そのまま開く', async () => {
    const bundle = await encryptString('秘密の中身', 'passphrase-1234');
    // 出荷の封緘が凍結値を割っていないこと (割っていれば自分で書いた物を開けない)。
    expect(atob(bundle.salt).length).toBeGreaterThanOrEqual(MIN_STORED_SALT_BYTES);
    await expect(decryptString(bundle, 'passphrase-1234')).resolves.toBe('秘密の中身');
  });
});

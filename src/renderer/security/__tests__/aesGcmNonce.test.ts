/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { deriveAesKey, randomSaltB64, sealWithKey } from '../dataCrypto';
import { _resetVaultForTests, getVault } from '../vault';

// jsdom は crypto.subtle を持たない (vault.test.ts と同じ差し込み)。
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

/*
 * **AES-GCM で同じ鍵に同じ IV を二度使うと、暗号は壊れる。**
 *
 * 2 つの平文の XOR が復元でき、さらに GHASH の認証鍵が求まるので**任意の
 * 偽造**ができる。鍵が違えば無害なので、危ないのは「1 つの鍵を使い回す」側である。
 *
 * ## 2026-08-25 に数えて分かったこと
 *
 * このリポジトリで `crypto.subtle.encrypt` を呼ぶのは 4 か所。IV はどれも
 * `crypto.getRandomValues` から採っており**実装は正しい**。だが**対照は
 * 1 か所にしか無かった** —— `dataCrypto.test.ts` の
 * 「uses a fresh salt + iv per call」で、これが見ているのは
 * `encryptString(plain, password)` である。
 *
 * ところがこの関数は**呼ぶたびに salt を作り直して鍵を derive する**ので、
 * かりに IV が定数になっても鍵が毎回違い、破局には至らない。
 *
 * 対照が無かったのは:
 *
 *   - `sealWithKey(key, text)` —— 鍵は**呼び出し側が使い回す**。
 *     `recordCipher.ts` は業務レコードを、`cloudProviderAdapter.ts` は
 *     クラウドへ上げる本体を、**1 つの鍵で何度も**封緘する。
 *   - `vault.ts` の内部 `encryptString` / `encryptBytes` —— こちらは
 *     **マスター鍵**で全サービスのトークンを暗号化する。
 *
 * **対照が付いていたのは、いちばん危なくない関数だった。**
 * (掃討はファイル単位、危険は関数単位。)
 */

const SECURITY_DIR = join(__dirname, '..');

function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-vault');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('鍵を使い回す封緘 — sealWithKey の IV は毎回変わる', () => {
  it('★ 同じ鍵・同じ平文を 32 回封緘して、IV が 32 通りある', async () => {
    const key = await deriveAesKey('pw-for-nonce-test', randomSaltB64());
    const seals = [];
    for (let i = 0; i < 32; i++) seals.push(await sealWithKey(key, 'まったく同じ平文'));
    const ivs = new Set(seals.map((s) => s.iv));
    expect(ivs.size, 'IV が重複した —— 同じ鍵で nonce を再利用している').toBe(32);
    // 暗号文も全部違う (IV が効いていることの、別の側からの確認)。
    expect(new Set(seals.map((s) => s.ct)).size).toBe(32);
  });

  it('IV は 12 バイト (切り詰めると衝突が早まる)', async () => {
    const key = await deriveAesKey('pw-for-nonce-test', randomSaltB64());
    const { iv } = await sealWithKey(key, 'x');
    expect(Uint8Array.from(atob(iv), (c) => c.charCodeAt(0))).toHaveLength(12);
  });
});

describe('マスター鍵で暗号化するトークン — 同じ値でも暗号文が変わる', () => {
  beforeEach(async () => {
    _resetVaultForTests();
    await clearIdb();
  });

  it('★ 同じトークンを 2 度保存すると、保存された暗号文が違う', async () => {
    const vault = getVault();
    await vault.initialize('correct-horse-battery-staple');

    const read = (): Promise<{ iv: unknown; ciphertext: unknown }> =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('business-hub-vault');
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('tokens', 'readonly').objectStore('tokens').get('github');
          req.onsuccess = () => {
            const v = req.result as { iv: unknown; ciphertext: unknown };
            db.close(); // 閉じないと次の deleteDatabase が blocked で止まる
            resolve(v);
          };
          req.onerror = () => {
            db.close();
            reject(req.error);
          };
        };
        open.onerror = () => reject(open.error);
      });

    await vault.setToken('github', 'ghp_the_same_token_value');
    const first = await read();
    await vault.setToken('github', 'ghp_the_same_token_value');
    const second = await read();

    const b64 = (v: unknown): string => btoa(String.fromCharCode(...new Uint8Array(v as ArrayBufferLike)));
    expect(first, '走査が空振り —— tokens に何も無い').toBeDefined();
    expect(b64(first.iv), 'マスター鍵は使い回されるので、IV が同じなら nonce 再利用').not.toBe(b64(second.iv));
    expect(b64(first.ciphertext)).not.toBe(b64(second.ciphertext));
    // 中身は変わっていない (対照が「壊れているから違う」ではないこと)。
    expect(await vault.getToken('github')).toBe('ghp_the_same_token_value');
  });
});

/*
 * **名指しの規則は、名指しした綴りしか止められない。**
 * 上の 2 つは今ある 2 つの経路を behavior で留めるが、
 * **5 か所目**が足されたときには何も言わない。集合のほうも留める。
 */
describe('AES-GCM で暗号化する場所は、すべて毎回 IV を作り直す', () => {
  const files: { rel: string; text: string }[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '__tests__') continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full, `${prefix}${e.name}/`);
      else if (/\.tsx?$/.test(e.name)) files.push({ rel: prefix + e.name, text: readFileSync(full, 'utf8') });
    }
  };
  walk(join(SECURITY_DIR, '..'), '');

  /** `crypto.subtle.encrypt(` を含む関数の本体を粗く切り出す。 */
  const sites = files.flatMap(({ rel, text }) =>
    [...text.matchAll(/crypto\.subtle\.encrypt\(/g)].map((m) => {
      // 直前の `function` / `=> {` から呼び出しまでを「同じ関数」とみなす。
      const before = text.slice(0, m.index);
      const start = Math.max(before.lastIndexOf('async function'), before.lastIndexOf('function '));
      return { rel, body: text.slice(start < 0 ? 0 : start, m.index) };
    }),
  );

  it('走査が生きている (暗号化箇所が 1 つ以上見つかる)', () => {
    expect(sites.length).toBeGreaterThan(0);
  });

  it('★ 暗号化するどの関数も、同じ関数の中で getRandomValues から IV を採る', () => {
    const bad = sites.filter((s) => !/getRandomValues\(\s*new Uint8Array\(/.test(s.body));
    expect(
      bad.map((s) => s.rel),
      '同じ関数の中で IV を作っていない —— 定数 IV か、外から渡された IV を使い回している疑い',
    ).toEqual([]);
  });

  /*
   * 箇所数そのものも留める。増えたら**この検査を読み直す**ため
   * (数を上げるだけの更新をするなら、上の規則が新しい箇所に当たるかを見ること)。
   */
  it('暗号化箇所は 4 つ (増減したら nonce の扱いを見直す)', () => {
    expect(sites.map((s) => s.rel).sort()).toEqual([
      'security/dataCrypto.ts',
      'security/dataCrypto.ts',
      'security/vault.ts',
      'security/vault.ts',
    ]);
  });
});

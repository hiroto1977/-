/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { MIN_PASSWORD_LENGTH, _resetVaultForTests, getVault } from '../vault';
import { webcrypto } from 'node:crypto';
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

/*
 * パスワード変更 — **控えた 24 語が生き続けること**と**失窓が無いこと**。
 *
 * 2026-08-24 に発見した形: 画面側が「全トークンを平文で読む →
 * `indexedDB.deleteDatabase` で保管庫ごと消す → `initialize()` → 書き戻す」を
 * 組み立てていた。結果は 2 つ。
 *
 *  1. 消してから書き戻すまでが**失窓**。中断すれば資格情報は永久に失われる
 *  2. `initialize()` は**新しい 24 語**を生成して返すのに戻り値が捨てられて
 *     いた → 控えたフレーズは通らず、通るフレーズは存在しない
 *
 * 2 のほうが重い。静かで、永久で、パスワードを忘れたときの唯一の綱を切る。
 */

const clearIdb = (): Promise<void> =>
  new Promise((r) => {
    const q = indexedDB.deleteDatabase('business-hub-vault');
    q.onsuccess = () => r();
    q.onerror = () => r();
    q.onblocked = () => r();
  });

const OLD_PW = 'old-password-1234';
const NEW_PW = 'new-password-5678';

beforeEach(async () => {
  _resetVaultForTests();
  await clearIdb();
});

async function seed() {
  const v = getVault();
  const { mnemonic } = await v.initialize(OLD_PW);
  for (const id of ['github', 'slack', 'notion']) await v.setToken(id, `tok-${id}`);
  return { v, mnemonic };
}

describe('vault.changePassword', () => {
  it('★ 控えた 24 語は変更後も通る (リカバリー枝に触らない)', async () => {
    const { v, mnemonic } = await seed();
    await v.changePassword(OLD_PW, NEW_PW);

    v.lock();
    _resetVaultForTests();
    const v2 = getVault();
    // 利用者が紙に控えたフレーズで復旧できる。
    await v2.recoverWithMnemonic(mnemonic, 'recovered-pw-9999');
    expect(await v2.getToken('github')).toBe('tok-github');
  });

  it('★ トークンは 1 件も失われない', async () => {
    const { v } = await seed();
    await v.changePassword(OLD_PW, NEW_PW);
    expect((await v.listConfigured()).sort()).toEqual(['github', 'notion', 'slack']);
    for (const id of ['github', 'slack', 'notion']) {
      expect(await v.getToken(id)).toBe(`tok-${id}`);
    }
  });

  it('新パスワードで解錠でき、旧パスワードでは解錠できない', async () => {
    const { v } = await seed();
    await v.changePassword(OLD_PW, NEW_PW);
    v.lock();
    await expect(v.unlock(OLD_PW)).rejects.toThrow(/パスワードが違います/);
    await v.unlock(NEW_PW);
    expect(await v.getToken('slack')).toBe('tok-slack');
  });

  it('★ 現在のパスワードが違えば、何も変えずに落ちる', async () => {
    const { v } = await seed();
    await expect(v.changePassword('wrong-password-x', NEW_PW)).rejects.toThrow(
      /現在のパスワードが違います/,
    );
    // 旧パスワードはそのまま通り、トークンも無事。
    v.lock();
    await v.unlock(OLD_PW);
    expect((await v.listConfigured()).sort()).toEqual(['github', 'notion', 'slack']);
  });

  it('新パスワードの長さは保管庫の規則で弾く (画面の数字と二重に持たない)', async () => {
    const { v } = await seed();
    await expect(v.changePassword(OLD_PW, 'short')).rejects.toThrow(/文字以上/);
    // 弾かれた後も旧パスワードで開ける。
    v.lock();
    await v.unlock(OLD_PW);
    expect(await v.getToken('github')).toBe('tok-github');
  });

  it('現在のパスワードが空なら弾く', async () => {
    const { v } = await seed();
    await expect(v.changePassword('', NEW_PW)).rejects.toThrow(/現在のパスワード/);
  });

  it('未初期化の保管庫では落ちる', async () => {
    const v = getVault();
    await expect(v.changePassword(OLD_PW, NEW_PW)).rejects.toThrow(/未初期化/);
  });

  it('★ 続けて 2 回変更しても、最初に控えた 24 語で復旧できる', async () => {
    const { v, mnemonic } = await seed();
    await v.changePassword(OLD_PW, NEW_PW);
    await v.changePassword(NEW_PW, 'third-password-abcd');
    v.lock();
    _resetVaultForTests();
    const v2 = getVault();
    await v2.recoverWithMnemonic(mnemonic, 'recovered-pw-9999');
    expect(await v2.getToken('notion')).toBe('tok-notion');
  });

  it('対照 — 以前の手順 (消してから作り直す) では控えたフレーズが通らなくなる', async () => {
    // これが直した形。**回帰したらここで気付く。**
    const { v, mnemonic } = await seed();
    await v.unlock(OLD_PW);
    const toks: Record<string, string> = {};
    for (const id of await v.listConfigured()) toks[id] = (await v.getToken(id))!;
    v.lock();
    await clearIdb();
    _resetVaultForTests();
    const v2 = getVault();
    await v2.initialize(NEW_PW); // ← 新しい 24 語を返すが、以前の画面は捨てていた
    for (const [id, t] of Object.entries(toks)) await v2.setToken(id, t);
    v2.lock();
    _resetVaultForTests();

    const v3 = getVault();
    await expect(v3.recoverWithMnemonic(mnemonic, 'recovered-pw-9999')).rejects.toThrow();
  });
});

describe('idbPutAll の境界 (changePassword / recoverWithMnemonic が共有する)', () => {
  it('★ 書くものが無くても例外にならない', async () => {
    // `db.transaction([], …)` は仕様上 InvalidAccessError を投げる (実測済み)。
    // 「書くものが無い」を例外で返すヘルパは後から使う人が踏むので no-op に倒した。
    // 公開 API 越しに確かめる —— レガシー保管庫でトークンが 0 件のとき、
    // 書き込みは meta 1 件だけになり、空配列には落ちないが、
    // ここでは「トークン 0 件でもパスワード変更が通る」ことを固定する。
    const v = getVault();
    await v.initialize(OLD_PW);           // トークンを 1 件も入れない
    await v.changePassword(OLD_PW, NEW_PW);
    v.lock();
    await v.unlock(NEW_PW);
    expect(await v.listConfigured()).toEqual([]);
  });
});

describe('Phase E 以前の保管庫 (master-wrap が無い)', () => {
  /*
   * マスター鍵が無く、トークンは**パスワード鍵そのもの**で暗号化されている。
   * 包み直しでは済まないので全部を読み替える必要があり、書き込みは meta と
   * 全トークンを 1 トランザクションにまとめてある。
   *
   * ここを最初「無条件に AAD つきで復号する」と書いて、**レガシー利用者が
   * パスワードを一切変更できない**状態にしていた (2026-08-24 に自分で発見)。
   * `getToken` は版の有無で分けているので、同じ判定に揃えた。
   */
  const metaDelete = (key: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open('business-hub-vault');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').delete(key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
      req.onerror = () => reject(req.error);
    });

  it('★ レガシー保管庫でもパスワードを変更でき、トークンが残る', async () => {
    const v = getVault();
    await v.initialize(OLD_PW);
    await metaDelete('master-wrap');       // ← Phase E 以前の形にする
    v.lock();
    await v.unlock(OLD_PW);                // currentKey = パスワード鍵
    await v.setToken('github', 'tok-github');
    await v.setToken('slack', 'tok-slack');

    await v.changePassword(OLD_PW, NEW_PW);

    v.lock();
    await expect(v.unlock(OLD_PW)).rejects.toThrow(/パスワードが違います/);
    await v.unlock(NEW_PW);
    expect((await v.listConfigured()).sort()).toEqual(['github', 'slack']);
    expect(await v.getToken('github')).toBe('tok-github');
    expect(await v.getToken('slack')).toBe('tok-slack');
  });

  /** Phase E 以前 かつ AAD 導入前の記録を作る: パスワード鍵で直接・AAD なし・版なし。 */
  async function writePreAadLegacyToken(password: string, serviceId: string, token: string) {
    const meta = await new Promise<{ salt: Uint8Array; iterations: number }>((resolve, reject) => {
      const req = indexedDB.open('business-hub-vault');
      req.onsuccess = () => {
        const db = req.result;
        const r = db.transaction('meta', 'readonly').objectStore('meta').get('vault');
        r.onsuccess = () => {
          db.close();
          resolve(r.result as { salt: Uint8Array; iterations: number });
        };
        r.onerror = () => {
          db.close();
          reject(r.error);
        };
      };
      req.onerror = () => reject(req.error);
    });
    const base = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password) as BufferSource, { name: 'PBKDF2' }, false, ['deriveKey'],
    );
    const passwordKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: meta.salt as BufferSource, iterations: meta.iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    // ★ additionalData を渡さない = AAD 導入前の形
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        passwordKey,
        new TextEncoder().encode(token) as BufferSource,
      ),
    );
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('business-hub-vault');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('tokens', 'readwrite');
        tx.objectStore('tokens').put({ iv, ciphertext }, serviceId); // v を付けない
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      req.onerror = () => reject(req.error);
    });
  }

  it('★ AAD 導入前の記録でも変更でき、その場で AAD へ束ね直される', async () => {
    // **この検査が当の修正を試す。** 最初は無条件に AAD つきで復号すると
    // 書いており、その形だとここが落ちる (レガシー利用者はパスワードを
    // 一切変更できない)。
    const v = getVault();
    await v.initialize(OLD_PW);
    await metaDelete('master-wrap');
    v.lock();
    await v.unlock(OLD_PW);
    await writePreAadLegacyToken(OLD_PW, 'github', 'tok-github');
    // **ここで getToken を呼んではいけない。** `getToken` は版の無い記録を
    // その場で AAD へ束ね直すので、旧形式が消えて検査が意味を失う
    // (最初そう書いて、対照が鳴らないことで気付いた)。

    await v.changePassword(OLD_PW, NEW_PW);

    v.lock();
    await v.unlock(NEW_PW);
    expect(await v.getToken('github')).toBe('tok-github');
  });

  it('レガシーでトークンが 0 件でも通る', async () => {
    const v = getVault();
    await v.initialize(OLD_PW);
    await metaDelete('master-wrap');
    v.lock();
    await v.unlock(OLD_PW);
    await v.changePassword(OLD_PW, NEW_PW);
    v.lock();
    await v.unlock(NEW_PW);
    expect(await v.listConfigured()).toEqual([]);
  });
});

/**
 * **パスワードの受け入れ条件。**
 *
 * `changePassword` の入口には 3 つの門がある (現在のパスワードが空でない /
 * 新しいパスワードが `MIN_PASSWORD_LENGTH` 以上 / 256 字以内)。
 * 上の検査は**正しい入力での往復**と**間違った現在パスワード**を見ていて、
 * そこは十分だった。しかし**門そのものは 1 つも当てられていなかった** ——
 * 変異検査で 9 件が生存した (2026-08-30 実測)。
 *
 * ```
 *   L808  typeof oldPassword !== 'string' || oldPassword.length === 0
 *   L811  typeof newPassword !== 'string' || newPassword.length < MIN_…
 *   L814  newPassword.length > 256
 * ```
 *
 * この門は**保管庫そのものの強度**である。下限が消えれば 1 文字の
 * パスワードで全資格情報が守られることになり、しかも**画面は成功として
 * 何事もなく進む**。鍵の導出 (600k 回の PBKDF2) は弱いパスワードを
 * 補ってくれない。
 *
 * 上限 (256) の側も要る —— PBKDF2 は入力長に比例して時間がかかるので、
 * 長大な入力は解錠のたびに画面を止める。
 */
describe('vault.changePassword — 受け入れ条件', () => {
  /*
   * **文言は「入口の門」のものを名指しする。**
   *
   * 最初は `toThrow('現在のパスワード')` と書いた。**効かなかった** ——
   * 門を外しても、奥の復号が `現在のパスワードが違います` で落ちるので
   * **同じ部分文字列に当たってしまう**。門の有無で答えが変わらない検査は、
   * 何も守っていない (対照で実測: 門を `if (false)` にしても 19 件全部通った)。
   *
   * 入口でしか出ない文面を丸ごと当てる。
   */
  it('★ 現在のパスワードが空なら、入口で断る', async () => {
    const { v } = await seed();
    await expect(v.changePassword('', NEW_PW)).rejects.toThrow(
      /現在のパスワードを入力してください/,
    );
  });

  it('★ 新しいパスワードが下限を割れば断る', async () => {
    const { v } = await seed();
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    await expect(v.changePassword(OLD_PW, short)).rejects.toThrow(String(MIN_PASSWORD_LENGTH));
  });

  /*
   * **対照。** 上の 2 本は「断ること」しか見ないので、実装が何でも断るように
   * なっても気付けない。下限**ちょうど**が通ることを見る。
   */
  it('★ 下限ちょうどは通す (対照)', async () => {
    const { v } = await seed();
    const exact = 'a'.repeat(MIN_PASSWORD_LENGTH);
    await expect(v.changePassword(OLD_PW, exact)).resolves.toBeUndefined();
  });

  it('★ 256 字を超えたら断る', async () => {
    const { v } = await seed();
    await expect(v.changePassword(OLD_PW, 'a'.repeat(257))).rejects.toThrow('長すぎます');
  });

  it('★ 256 字ちょうどは通す (対照)', async () => {
    const { v } = await seed();
    await expect(v.changePassword(OLD_PW, 'a'.repeat(256))).resolves.toBeUndefined();
  });

  /*
   * 保管領域から来る値は型が保証されない (IndexedDB / 画面の入力欄)。
   * `typeof` の枝が消えると、文字列でない値が下の `length` へ落ちる。
   */
  it('★ 文字列でない入力は断る', async () => {
    const { v } = await seed();
    const bad = v as unknown as { changePassword(a: unknown, b: unknown): Promise<void> };
    // **入口の文面を名指しする。** 素の `toThrow()` だと、門を外して奥で
    // `TypeError: Cannot read properties of null` になっても通ってしまう。
    await expect(bad.changePassword(null, NEW_PW)).rejects.toThrow(
      /現在のパスワードを入力してください/,
    );
    await expect(bad.changePassword(OLD_PW, null)).rejects.toThrow(
      /新しいパスワードは .* 文字以上/,
    );
    await expect(bad.changePassword(OLD_PW, 42)).rejects.toThrow(
      /新しいパスワードは .* 文字以上/,
    );
  });
});

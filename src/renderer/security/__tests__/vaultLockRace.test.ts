/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { _resetVaultForTests, getVault } from '../vault';
import { webcrypto } from 'node:crypto';

// jsdom doesn't provide crypto.subtle. Pull it in from Node's webcrypto.
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

/*
 * **施錠は、保管庫の操作が待っている最中に走る。**
 *
 * `autoLock` はタブ非表示・放置で `lock()` を呼ぶ。`setToken` / `getToken` は
 * 入口で施錠を確かめた後、`openDb()` や `idbGet()` を**待ってから**改めて
 * `this.currentKey` を使っていたので、待っている間に施錠されると `null` が
 * WebCrypto へ渡っていた。直す前の実測:
 *
 *   setToken → Failed to execute 'encrypt' on 'SubtleCrypto': 2nd argument
 *              is not of type CryptoKey     ← 内部の文言が利用者に出る
 *   getToken → 例外が `catch { return null }` に飲まれ、
 *              **「トークン未設定」と区別が付かない**
 *
 * 後者が厄介で、`web-shim` の各経路は `getToken()` が null なら
 * `not_configured` として扱う。つまり**設定済みの資格情報について
 * 「設定されていません」と言う**。
 */

const PASS = 'correct horse battery staple';

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
  localStorage.clear();
});

describe('操作の途中で施錠されても、保管庫は自分の言葉で断る', () => {
  it('setToken: 施錠の文言で落ちる (内部の暗号 API の文言を出さない)', async () => {
    const v = getVault();
    await v.initialize(PASS);
    const saving = v.setToken('github', 'ghp_secret_value');
    v.lock();
    const err = await saving.then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(err, '施錠中の保存が成功している').not.toBeNull();
    expect(err?.message, '内部の暗号 API の文言が漏れている').toContain('ロックされています');
    expect(err?.message).not.toMatch(/SubtleCrypto|CryptoKey/);
  });

  it('setToken: 断ったなら書いていない', async () => {
    const v = getVault();
    await v.initialize(PASS);
    const saving = v.setToken('github', 'ghp_secret_value');
    v.lock();
    await saving.catch(() => {});
    await v.unlock(PASS);
    expect(await v.getToken('github'), '断ったのに書かれている').toBeNull();
    expect(await v.listConfigured()).not.toContain('github');
  });

  it('getToken: 施錠を「未設定」と取り違えない', async () => {
    const v = getVault();
    await v.initialize(PASS);
    await v.setToken('slack', 'xoxb-real-token');
    const reading = v.getToken('slack');
    v.lock();
    const outcome = await reading.then(
      (val) => ({ kind: 'value' as const, val }),
      (e: unknown) => ({ kind: 'error' as const, val: (e as Error).message }),
    );
    // **null を返してはいけない。** 呼び出し側はそれを not_configured と読む。
    expect(outcome.kind, '施錠中の読み出しが null を返した (未設定と区別できない)').toBe('error');
    expect(outcome.val).toContain('ロックされています');
  });

  it('施錠していなければ、普通に読み書きできる (締めすぎていない)', async () => {
    const v = getVault();
    await v.initialize(PASS);
    await v.setToken('notion', 'secret_abc');
    expect(await v.getToken('notion')).toBe('secret_abc');
    expect(await v.listConfigured()).toContain('notion');
  });

  it('本当に未設定なら null のまま (施錠の判定に巻き込まれない)', async () => {
    const v = getVault();
    await v.initialize(PASS);
    expect(await v.getToken('never-saved')).toBeNull();
  });
});

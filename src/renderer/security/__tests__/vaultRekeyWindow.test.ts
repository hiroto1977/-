/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { _resetVaultForTests, getVault } from '../vault';
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

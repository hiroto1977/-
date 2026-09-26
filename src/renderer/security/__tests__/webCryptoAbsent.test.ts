/** @vitest-environment jsdom */
/**
 * **WebCrypto が無い端末で、保管庫とバックアップが何と言うか** (2026-09-12 · パス 171)。
 *
 * ## パス 169 の積み残しを閉じる
 *
 * パス 169 は Google OAuth の節について、`crypto.subtle` が無いと
 * **押しても何も出ない**ことを直し、文面を `security/webCrypto.ts` に 1 つ置いた。
 * そのとき残した宿題がこれである ——
 *
 * > `LockScreen` にも同じ文面を配線する。あちらも `crypto.subtle` が無ければ素の
 * > `TypeError` を見せるが、**完全性チェーンの保護対象**なので台帳の採掘が要る。
 *
 * 「3 か所のうち 1 か所を残す」を自分でやらないために閉じる。
 *
 * ## 直した場所は画面ではなく**鍵導出の入口**
 *
 * `LockScreen` を直すのではなく、`vault.ts` と `dataCrypto.ts` の `deriveKey`
 * (それぞれの **最初に `crypto.subtle` を触る所**) で断るようにした。こうすると
 * 解錠・初期化・パスワード変更・バックアップの暗号化・レコードの封緘・クラウド退避の
 * **すべて**が同じ 1 文を得る —— 画面ごとに配線すると、また「1 か所だけ直す」になる。
 *
 * ## 直す前に出ていた文
 *
 * ```
 * TypeError: Cannot read properties of undefined (reading 'importKey')
 * ```
 *
 * `LockScreen` は `catch (e)` で `e.message` をそのまま出すので、これが利用者の
 * 目に入っていた。内部 API の名前しか言わず、打てる手が無い。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getVault, _resetVaultForTests } from '../vault';
import { encryptString } from '../dataCrypto';
import { webCryptoUnavailableReason } from '../webCrypto';
import { LockScreen } from '../LockScreen';
import { settleUntil } from '../../__tests__/jsdomWait';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** `crypto.subtle` だけを取り上げる (乱数は残す —— 鍵導出の前に呼ばれる)。 */
function removeSubtle(): void {
  const real = crypto.getRandomValues.bind(crypto);
  vi.stubGlobal('crypto', { getRandomValues: real });
}

/** 素の文 (直す前に出ていた形)。この語が画面に出たら直っていない。 */
const RAW_TYPE_ERROR = 'Cannot read properties';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  _resetVaultForTests();
  /*
   * **保管庫の IndexedDB も消す。** `_resetVaultForTests()` は singleton を
   * 捨てるだけなので、前の `it()` が作った保管庫が残り「既に初期化されています」で
   * 返る (パス 170 で record store について測ったのと同じ形。DB が別なだけ)。
   *
   * 実測 (2026-09-12): `_resetVaultForTests` を呼ぶ検査 12 ファイルのうち
   * **11 はこの 6 行を自分で書いている**。共有 helper へ寄せるのは
   * record store の 49 ファイルと同じ機械的な後片付けなので、別パスに記録した。
   */
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-vault');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
  vi.unstubAllGlobals();
});

describe('保管庫 — WebCrypto が無いときの断り (パス 171)', () => {
  it('★ 標本: この harness には本物の WebCrypto が在る (規則が空振りしていない)', () => {
    expect(typeof crypto.subtle.digest).toBe('function');
    expect(webCryptoUnavailableReason()).toBeNull();
  });

  it('★ 初期化は、内部 API の名前ではなく打てる手を言って断る', async () => {
    removeSubtle();
    const err = await getVault()
      .initialize('correct horse battery staple')
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err, '暗号が無いのに初期化が通った').toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toContain('WebCrypto');
    expect(msg).toContain('https://');
    expect(msg, '素の TypeError の文面が残っている').not.toContain(RAW_TYPE_ERROR);
  });

  it('★ 解錠も同じ 1 文で断る (経路ごとに違う文を出さない)', async () => {
    // **本物の暗号で 1 度作ってから取り上げる** —— https で用意した保管庫を、
    // 後から平文の http:// で開いた人の状況。未初期化のまま解錠を呼ぶと
    // 「未初期化です」で返るので、鍵導出まで届かない (最初の版はそれを測っていた)。
    await getVault().initialize('correct horse battery staple');
    getVault().lock();
    removeSubtle();
    const err = await getVault()
      .unlock('correct horse battery staple')
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err, '暗号が無いのに解錠が通った').toBeInstanceOf(Error);
    expect((err as Error).message).toBe(webCryptoUnavailableReason());
  });

  it('★ バックアップの暗号化も同じ 1 文で断る (dataCrypto 側の入口)', async () => {
    removeSubtle();
    const err = await encryptString('中身', 'passphrase-long-enough')
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err, '暗号が無いのに暗号化が通った').toBeInstanceOf(Error);
    expect((err as Error).message).toBe(webCryptoUnavailableReason());
  });
});

describe('ロック画面 — その 1 文が実際に画面へ出る', () => {
  it('★ 解錠を押すと、打てる手を含む断りが画面に出る (素の TypeError ではない)', async () => {
    // **保管庫は mock しない。** 本物の `vault.ts` を通してこそ
    // 「画面まで届くか」が測れる (mock に文面を書くと自分の期待を写すだけになる)。
    // 保管庫を本物の暗号で用意し、施錠してから暗号を取り上げる (上と同じ状況)。
    await getVault().initialize('correct horse battery staple');
    getVault().lock();
    removeSubtle();
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(LockScreen, { onUnlocked: () => {} }));
    });
    await settleUntil(
      () => container.querySelectorAll('input[type="password"]').length > 0,
      'パスワードの欄',
    );
    const pw = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter!.call(pw, 'correct horse battery staple');
      pw.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const go = [...container.querySelectorAll('button')].find((b) =>
      /ロック解除/.test(b.textContent ?? ''),
    );
    expect(go, '進むボタンが無い').toBeDefined();
    await act(async () => {
      go!.click();
    });
    await settleUntil(() => (container.textContent ?? '').includes('WebCrypto'), '暗号の断りが画面に出る');
    const shown = container.textContent ?? '';
    for (const hint of ['https://', 'localhost', 'standalone.html']) {
      expect(shown, `打てる手 ${hint} が出ていない`).toContain(hint);
    }
    expect(shown, '素の TypeError が画面に出ている').not.toContain(RAW_TYPE_ERROR);
  });
});

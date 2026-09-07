/** @vitest-environment jsdom */
/**
 * **施錠したらロック画面が出る。押したタブでも、他のタブから頼まれた時でも。**
 * (2026-09-06)
 *
 * 直す前の設定ページの「Vault を今すぐロック」は
 *
 *   1. `getVault().lock()` を直に呼び (施錠の門 `lockWorkspace` を迂回)
 *   2. 見た目は**そのページの局所状態**を立てるだけ
 *
 * だった。`App` の `vaultUnlocked` は**マウント時に 1 度だけ**読むので、
 * **ロック画面は出ない**。サイドバーで他のページへ移れば見た目は解錠のまま、
 * 資格情報の読み出しだけが落ちる (`getToken` は例外を飲むので
 * 「トークン未設定」と区別が付かない)。画面が言う
 * 「再度使うにはマスターパスワード入力が必要です」は**誰も要求しない**。
 *
 * さらに鍵は JS 文脈ごとなので、同じ保管庫を開いた**他のタブは生きた鍵を
 * 持ったまま**残った —— 文面は「席を離れる前に押すと…即座に遮断します」。
 *
 * ここは `App` を丸ごと動かして 3 つを留める:
 *
 *   - 施錠すると**ロック画面へ差し替わる** (見た目が実際に変わる)
 *   - **他のタブからの要求**でも施錠される (BroadcastChannel の中継)
 *   - 施錠後、鍵は本当に落ちている (画面だけの施錠ではない)
 *
 * 対照は「施錠しなければロック画面は出ない」を同じ場面で見る ——
 * 初期状態でロック画面なら、上の 3 つは何も証明しない。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { webcrypto } from 'node:crypto';
import { App } from '../App';
import { _resetVaultForTests, getVault } from '../security/vault';
import {
  LOCK_CHANNEL,
  LOCK_MESSAGE,
  _resetLockSubscribersForTests,
  lockEverywhere,
} from '../security/lockWorkspace';

if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const PASSWORD = 'correct-horse-battery-staple';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'), // ブラウザ扱い → ロック画面を使う版
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

function clearIdb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;
const opened: BroadcastChannel[] = [];

const text = (): string => container.textContent ?? '';

/** ロック画面が出ているか (解錠ボタンの文言で見る)。 */
const showsLockScreen = (): boolean => /ロック解除|はじめてのご利用/.test(text());

beforeEach(async () => {
  localStorage.clear();
  _resetVaultForTests();
  _resetLockSubscribersForTests();
  await clearIdb('business-hub-vault');
  await clearIdb('business-hub-data');

  // 解錠済みの保管庫を用意してから App をマウントする (= 利用者が既に開いた状態)。
  await getVault().initialize(PASSWORD);
  await getVault().setToken('github', 'ghp_secret_token');

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(App));
  });
  await settle();
});

afterEach(async () => {
  for (const c of opened.splice(0)) c.close();
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
  _resetLockSubscribersForTests();
});

describe('App — 施錠はロック画面まで届く', () => {
  it('対照: 施錠していなければロック画面は出ていない (以降の検査が意味を持つ前提)', () => {
    expect(showsLockScreen()).toBe(false);
    expect(getVault().isUnlocked()).toBe(true);
  });

  it('★ 明示的な施錠でロック画面へ差し替わる — 局所の文言で済ませない', async () => {
    await act(async () => {
      lockEverywhere();
    });
    await settle();
    expect(showsLockScreen()).toBe(true);
    // 画面だけの施錠ではないこと。
    expect(getVault().isUnlocked()).toBe(false);
    await expect(getVault().getToken('github')).rejects.toThrow();
  });

  it('★ 他のタブからの施錠要求でもロック画面へ差し替わる', async () => {
    const other = new BroadcastChannel(LOCK_CHANNEL);
    opened.push(other);
    await act(async () => {
      other.postMessage(LOCK_MESSAGE);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(showsLockScreen()).toBe(true);
    expect(getVault().isUnlocked()).toBe(false);
  });

  it('関係のない合図では施錠しない (中継が何でも受けていない)', async () => {
    const other = new BroadcastChannel(LOCK_CHANNEL);
    opened.push(other);
    await act(async () => {
      other.postMessage('こんにちは');
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(showsLockScreen()).toBe(false);

    // 標本: 正しい合図なら同じ道で施錠される。
    await act(async () => {
      other.postMessage(LOCK_MESSAGE);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    expect(showsLockScreen()).toBe(true);
  });
});

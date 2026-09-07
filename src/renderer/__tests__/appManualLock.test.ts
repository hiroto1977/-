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
import { navigateTo } from '../navigate';

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
    // 設定画面はこれを呼ぶ。無いと画面が `PageErrorBoundary` の枠になり、
    // Vault 管理の札まで描かれない (実際それで 1 度落ちた)。
    storageProtection: () => Promise.resolve({ mechanism: 'os-keychain' }),
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

/**
 * ロック画面が出るまで待つ (上限つき)。
 *
 * **決まった回数の tick で待たない。** BroadcastChannel の配達は
 * 「いつか来るタスク」で、1 プロセスに検査を詰めると遅れる —— 実際
 * Stryker の dry run で同種の検査が空振りした。事象そのもので待つ。
 */
async function settleUntilLocked(ms = 2000): Promise<void> {
  const started = Date.now();
  while (!showsLockScreen() && Date.now() - started < ms) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
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
    });
    await settleUntilLocked();
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
    });
    await settleUntilLocked();
    expect(showsLockScreen()).toBe(true);
  });
});

/*
 * **ハードリセットが消せなかった理由は、App が動いていても画面に残るか。**
 * (2026-09-07)
 *
 * ここは**自分の取り違えを留めるための検査**である。最初はハードリセットの
 * 前に `lockEverywhere()` を流していた —— 他のタブに書き込みを止めさせる意図は
 * 正しいが、`App` の購読が**このタブを即座にロック画面へ差し替える**ので、
 * 設定ページが unmount して「消せませんでした」を出す相手が居なくなる。
 * 消せなかった時の文言が、まさにそれが要る場面で誰にも届かない。
 *
 * `VaultControls` だけを描く検査では `App` が居ないので**見えなかった**。
 * だから App を丸ごと動かして留める (検査の harness が実物より狭いと、
 * 直したつもりの穴がそのまま残る —— 2026-09-06 に学んだのと同じ形)。
 */
describe('App — ハードリセットが消せなかった理由は画面に残る', () => {
  /** `deleteDatabase` を「他のタブが掴んでいる」状態にする。 */
  function blockDeletes(): () => void {
    const real = globalThis.indexedDB;
    const stub = {
      ...real,
      open: real.open.bind(real),
      deleteDatabase: (): IDBOpenDBRequest => {
        const req = {} as IDBOpenDBRequest;
        setTimeout(() => req.onblocked?.(new Event('blocked') as IDBVersionChangeEvent), 0);
        return req;
      },
    };
    Object.defineProperty(globalThis, 'indexedDB', { value: stub, configurable: true, writable: true });
    return () => {
      Object.defineProperty(globalThis, 'indexedDB', { value: real, configurable: true, writable: true });
    };
  }

  function buttonSaying(label: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(label),
    );
  }

  async function click(el: Element | undefined): Promise<void> {
    await act(async () => {
      el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }

  it('★ 消せなかったら、理由が出てロック画面には行かない', async () => {
    const restore = blockDeletes();
    try {
      await act(async () => {
        navigateTo('settings');
      });
      await settle();
      await click(buttonSaying('すべてのデータを削除…'));
      // 設定画面には text 入力が複数あるので、確認欄は placeholder で選ぶ
      // (`.at(-1)` は別の欄を掴んで「HTMLInputElement ではない」で落ちた)。
      const box = container.querySelector<HTMLInputElement>('input[placeholder="DELETE"]');
      expect(box).not.toBeNull();
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(box, 'DELETE');
        box!.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await click(buttonSaying('確定して削除'));
      await settle();

      // 理由が画面に在る。
      expect(text()).toContain('他のタブをすべて閉じて');
      // **ロック画面へ行っていない** (行くと上の文言ごと消える)。
      expect(showsLockScreen()).toBe(false);
      // 何も消えていないので鍵も生きている (半分だけ適用しない)。
      expect(getVault().isUnlocked()).toBe(true);
    } finally {
      restore();
    }
  });
});

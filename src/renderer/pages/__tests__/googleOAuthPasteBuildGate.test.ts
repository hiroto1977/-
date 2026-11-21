/** @vitest-environment jsdom */
/**
 * **この端末が読まない保管庫へ、資格情報を書かない** (2026-09-25 · パス 454)。
 *
 * ## 実測した欠陥 (直す前)
 *
 * 設定画面の Google OAuth (貼り付け式 PKCE) は取得した access token を
 * `getVault().setToken(...)` で **4 本**書く (`drive` / `calendar` / `gmail` /
 * `google-access`)。保管庫のトークンを**読む**出荷コードは `renderer/web-shim.ts`
 * の 11 か所だけで、その shim は
 * `if (typeof window !== 'undefined' && !window.serviceHub)` ——
 * **ブラウザ版だけ**据え付く。デスクトップ版は preload の橋が先に在るので、
 * 保管庫を読む物が **1 つも無い**。
 *
 * デスクトップ版でその 4 本に起きること (2026-09-25 · 走査で実測):
 *
 * | 問い | 実測 |
 * | --- | --- |
 * | 読む物が在るか | **0 件** |
 * | 「API キーとトークン」の 9 スロットに出るか | **出ない** (固定鍵 anthropic / github / notion / slack / wordpress / atlassian / canva / cloudflare / security に無い) |
 * | 「使われていない資格情報」に出るか | **出ない** (橋 = main の保管ファイルを読む) |
 * | `StatusBar` の「削除」で消えるか | **消えない** (橋を叩くので保管庫に届かない) |
 * | 画面が何と言うか | **「Google 連携を有効化しました (Drive / Calendar / Gmail)」** |
 *
 * **生きた Google の access token が、誰も読まず誰も消せない場所へ入り、画面は
 * 成功したと言う。** 法則 `escape-hatch-stays-open` の、逃げ口が*最初から無い*
 * 形 (パス 453 は「保存した直後に出ない」だった)。しかも同じファイルの
 * `VaultControls` は 2026-09-09 (パス 137) から `isBrowserBuild()` で
 * 「デスクトップ版には保管庫が無い」と判定しており、**保管庫へ書く 2 つの節だけが
 * その判定を持っていなかった** —— 前提はファイル自身が述べていた。
 *
 * ## 直した形 (ここで押す)
 *
 * `useBuildKind()` で問い、デスクトップ版と**分かったときだけ** `start()` が断り、
 * 断りは働く道 (`GoogleConnectCard` の「Google でサインイン」・3 画面に在る) を
 * 名指しする。ブラウザ版の答えは 1 文字も変えない。
 *
 * ★ **`complete()` 側の門は床であって、今日の働く門ではない (正直に書く)。**
 * 2 段目は `authUrl` 状態でしか描かれず、`authUrl` は `start()` しか立てない ——
 * つまり `start()` が断つと **2 段目へ届く道が無い**。だからこの検査は
 * 「2 段目が出ないこと」を主張し、`complete()` の門そのものに当たる対照は
 * **鳴らない**。床を残すのは、2 段目を「保存したセッションから再開する」形に
 * 変えた日 (自然な改善) に書き込みの道が再び開くからである。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GoogleOAuthSection } from '../SettingsPage';
import { pasteOAuthUnreadNote } from '../../../shared/buildDestinations';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

let opened: string[];
let fetches: number;
let container: HTMLDivElement;
let root: Root | null = null;

/**
 * 橋の代役。**`getVersion` が実行形態を決める** (`runtimeMode.ts` は
 * `getVersion() === '0.1.0-web'` をブラウザ版とする)。`version` を渡さないと
 * `getVersion` そのものを持たない橋になり、`isBrowserBuild()` の `catch` が
 * `false` = デスクトップ版へ倒す —— **2026-09-25 までの 6 本の検査がその形**だった。
 */
function stubHub(version: string | null, opts: { readonly hang?: boolean } = {}): void {
  const hub: Record<string, unknown> = {
    openExternal: (url: string) => {
      opened.push(url);
      return Promise.resolve();
    },
  };
  if (opts.hang === true) {
    // 実行形態が**まだ分からない**状態 (橋が答えを返さない)。
    hub.getVersion = () => new Promise<string>(() => {});
  } else if (version !== null) {
    hub.getVersion = () => Promise.resolve(version);
  }
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = hub;
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(GoogleOAuthSection));
  });
}

function text(): string {
  return container.textContent ?? '';
}

function buttonByLabel(label: string): HTMLButtonElement | null {
  return (
    (Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]).find(
      (b) => (b.textContent ?? '').trim() === label,
    ) ?? null
  );
}

async function press(label: string): Promise<void> {
  const b = await waitForElement<HTMLButtonElement>(() => buttonByLabel(label), `ボタン「${label}」`);
  await act(async () => {
    b.click();
  });
}

/** 実際の入力として流す (素の代入は React に届かない)。 */
async function type(el: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  opened = [];
  fetches = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  // **網を数える。** 「交換より前に断る」を主張するので、要求が 1 度でも出たら分かるように。
  vi.stubGlobal('fetch', () => {
    fetches += 1;
    return Promise.reject(new Error('この検査は網へ出ない'));
  });
});

afterEach(async () => {
  if (root) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
    root = null;
  }
  container.remove();
  vi.unstubAllGlobals();
  delete (globalThis as unknown as { serviceHub?: unknown }).serviceHub;
  window.sessionStorage.clear();
});

describe('Google OAuth の貼り付け節は、この端末が読まない保管庫へ書かない', () => {
  it('★ デスクトップ版は、押す前に断りを出す', async () => {
    stubHub('0.1.0');
    await mount();
    const note = await waitForElement<HTMLElement>(
      () => container.querySelector<HTMLElement>('[data-vault-unread]'),
      'デスクトップ版の断り',
    );
    expect(note.getAttribute('role')).toBe('alert');
    expect(note.textContent ?? '').toContain(pasteOAuthUnreadNote('desktop') as string);
  });

  it('★ デスクトップ版は認可ページを開かず、2 段目へも進まない (書き込みへ届く道が無い)', async () => {
    stubHub('0.1.0');
    await mount();
    await waitForElement<HTMLElement>(() => container.querySelector<HTMLElement>('[data-vault-unread]'), '断り');
    const cid = container.querySelector('input') as HTMLInputElement;
    await type(cid, 'x.apps.googleusercontent.com');
    await press('認可ページを開く');
    await settleUntil(() => text().includes('デスクトップ版はここで保存した'), '断りが本文に出る');
    // 認可ページを開かない = 単回使用の code を使い切らせない。
    expect(opened).toEqual([]);
    // 2 段目 (貼り付け欄と「完了」) が出ない = `complete()` の書き込みへ届く道が無い。
    expect(container.querySelector('[data-google-auth-url]')).toBeNull();
    expect(buttonByLabel('完了')).toBeNull();
    // 交換の要求も出ない。
    expect(fetches).toBe(0);
  });

  it('★ 断りが名指しする操作子は実在する', async () => {
    const note = pasteOAuthUnreadNote('desktop') as string;
    expect(note).toContain('「Google でサインイン」ボタン');
    // 名乗られる側 —— 3 画面が載せる `GoogleConnectCard` のボタンの綴り。
    const card = readOriginalSource('src/renderer/components/GoogleConnectCard.tsx');
    expect(card).toContain('Google でサインイン');
    for (const page of ['DrivePage', 'CalendarPage', 'GmailPage']) {
      expect(readOriginalSource(`src/renderer/pages/${page}.tsx`)).toContain('<GoogleConnectCard');
    }
  });

  it('★ ブラウザ版の答えは 1 文字も変わらない (断らず、認可ページを開く)', async () => {
    stubHub('0.1.0-web');
    await mount();
    await settleUntil(
      () => container.querySelector('[data-vault-unread]') === null && container.querySelector('input') !== null, 'ブラウザ版では断りが出ない',
    );
    const cid = container.querySelector('input') as HTMLInputElement;
    await type(cid, 'x.apps.googleusercontent.com');
    await press('認可ページを開く');
    await settleUntil(() => opened.length > 0, '認可ページが開く');
    expect(opened[0]).toContain('accounts.google.com');
    expect(text()).not.toContain('デスクトップ版はここで保存した');
  });

  it('★ 実行形態が分からないあいだは断らない (間違って断るほうが害が大きい)', async () => {
    stubHub(null, { hang: true });
    await mount();
    await settleUntil(() => container.querySelector('input') !== null, '欄が出る');
    expect(container.querySelector('[data-vault-unread]')).toBeNull();
  });

  it('★ 断りはブラウザ版には出ない (判定そのもの)', () => {
    expect(pasteOAuthUnreadNote('browser')).toBeNull();
    expect(pasteOAuthUnreadNote('desktop')).not.toBeNull();
  });
});

/** @vitest-environment jsdom */
/**
 * **設定画面の札が「未設定」と言い切らない (実物を描いて確かめる)。**
 *
 * `network/proxy.ts` と `fs/fsa.ts` は保管先 (IndexedDB) が開けないときに
 * `null` を返していた。その `null` を受けた札は「未設定」/「フォルダ未設定」で、
 * **設定した本人に登録し直させる**案内になっていた (2026-09-06 実測)。
 *
 * ここは 2 枚の札を jsdom に描いて、
 *
 *   読めない端末 … 「確認できません」+ 理由と打ち手 (「未設定」は出さない)
 *   読める端末   … これまでどおり「未設定」(理由は出さない)
 *
 * を対照つきで留める。検査のために `ProxySection` / `FsaSection` を公開した
 * (パス 16 で `CredentialRow` / `UnusedCredentialSection` を公開したのと同じ理由)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FsaSection, ProxySection } from '../SettingsPage';
import { settleUntil } from '../../__tests__/jsdomWait';

const realIndexedDb = globalThis.indexedDB;

function breakIndexedDb(): void {
  const err = new Error('store unavailable');
  err.name = 'QuotaExceededError';
  vi.stubGlobal('indexedDB', {
    open: () => {
      const req: Record<string, unknown> = { error: err };
      setTimeout(() => {
        (req.onerror as (() => void) | undefined)?.();
      }, 0);
      return req;
    },
  });
}

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    listConfigured: () => Promise.resolve([]),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve({ ok: true }),
    clearToken: () => Promise.resolve({ ok: true }),
    openExternal: () => Promise.resolve(),
    storageProtection: () => Promise.resolve({ mechanism: 'os-keychain' }),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

/**
 * 札が出るまで**条件で**待って描く (2026-09-21 · パス 378)。
 *
 * ここは 2026-09-21 まで固定 6 周の `settle()` だった —— 周回数を 0 にすると
 * `[data-proxy-unreadable]` も `[data-fsa-unreadable]` も掴めずに落ちる
 * (`npm run audit:tick-sensitivity` の実測)。札の後ろには IndexedDB の
 * 往復が在るので、**空いている機械では間に合い、全件実行の負荷の下では
 * 間に合わないことがある**。
 *
 * 錠は「その `it` が真に見たい物」にする —— ★ の 2 本は「確認できません」の札、
 * 対照の 2 本は**その裏である「未設定」の札**。対照を「札が無いこと」で
 * 待つことはできない (最初から無いので、描き終える前に通ってしまう)。
 */
async function mount(
  node: Parameters<Root['render']>[0],
  ready: () => boolean,
  label: string,
): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });
  await settleUntil(ready, label);
}

/** 札は `<span>` で出る。本文の一致だと説明文の「未設定」まで拾う。 */
const badges = (): (string | null)[] => [...container.querySelectorAll('span')].map((el) => el.textContent);
const unsetBadge = (): boolean => badges().includes('未設定');
const shows = (selector: string) => (): boolean => container.querySelector(selector) !== null;

beforeEach(() => {
  vi.stubGlobal('indexedDB', realIndexedDb);
  Object.defineProperty(window, 'showDirectoryPicker', {
    value: () => Promise.reject(new Error('not used')),
    configurable: true,
    writable: true,
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
  vi.unstubAllGlobals();
});

describe('プロキシの札', () => {
  it('★ 読めない端末では「確認できません」と理由が出て、「未設定」は出ない', async () => {
    breakIndexedDb();
    await mount(createElement(ProxySection), shows('[data-proxy-unreadable]'), 'プロキシの「確認できません」の札が出る');
    expect(container.querySelector('[data-proxy-unreadable]')).not.toBeNull();
    const reason = container.querySelector('[data-proxy-unreadable-reason]');
    expect(reason?.getAttribute('role')).toBe('alert');
    expect(reason?.textContent).toContain('この端末に保存した設定を読めませんでした');
    expect(reason?.textContent).toContain('「未設定」と出ていても、設定が消えたとは限りません');
    expect(container.textContent).not.toContain('未設定</span>');
    expect(container.querySelector('[data-proxy-unreadable]')?.textContent).toBe('確認できません');
  });

  it('対照: 読める端末では「未設定」が出て、理由は出ない', async () => {
    await mount(createElement(ProxySection), unsetBadge, 'プロキシの「未設定」の札が出る');
    expect(container.querySelector('[data-proxy-unreadable]')).toBeNull();
    expect(container.querySelector('[data-proxy-unreadable-reason]')).toBeNull();
  });
});

describe('フォルダ連携の札', () => {
  it('★ 読めない端末では「確認できません」と理由が出て、「未設定」は出ない', async () => {
    breakIndexedDb();
    await mount(createElement(FsaSection), shows('[data-fsa-unreadable]'), 'フォルダ連携の「確認できません」の札が出る');
    expect(container.querySelector('[data-fsa-unreadable]')?.textContent).toBe('確認できません');
    const reason = container.querySelector('[data-fsa-unreadable-reason]');
    expect(reason?.getAttribute('role')).toBe('alert');
    expect(reason?.textContent).toContain('この端末に保存した設定を読めませんでした');
    // 「未設定」の札は出ていない (この 2 つは同時に出ない)。
    expect(badges()).not.toContain('未設定');
  });

  it('対照: 読める端末で選んでいなければ「未設定」が出て、理由は出ない', async () => {
    await mount(createElement(FsaSection), unsetBadge, 'フォルダ連携の「未設定」の札が出る');
    expect(container.querySelector('[data-fsa-unreadable]')).toBeNull();
    expect(container.querySelector('[data-fsa-unreadable-reason]')).toBeNull();
    expect(badges()).toContain('未設定');
  });
});

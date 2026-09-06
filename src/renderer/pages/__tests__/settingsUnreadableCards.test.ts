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

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
}

async function mount(node: Parameters<Root['render']>[0]): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });
  await settle();
}

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
    await mount(createElement(ProxySection));
    expect(container.querySelector('[data-proxy-unreadable]')).not.toBeNull();
    const reason = container.querySelector('[data-proxy-unreadable-reason]');
    expect(reason?.getAttribute('role')).toBe('alert');
    expect(reason?.textContent).toContain('この端末に保存した設定を読めませんでした');
    expect(reason?.textContent).toContain('「未設定」と出ていても、設定が消えたとは限りません');
    expect(container.textContent).not.toContain('未設定</span>');
    expect(container.querySelector('[data-proxy-unreadable]')?.textContent).toBe('確認できません');
  });

  it('対照: 読める端末では「未設定」が出て、理由は出ない', async () => {
    await mount(createElement(ProxySection));
    expect(container.querySelector('[data-proxy-unreadable]')).toBeNull();
    expect(container.querySelector('[data-proxy-unreadable-reason]')).toBeNull();
    expect(container.textContent).toContain('未設定');
  });
});

describe('フォルダ連携の札', () => {
  it('★ 読めない端末では「確認できません」と理由が出て、「未設定」は出ない', async () => {
    breakIndexedDb();
    await mount(createElement(FsaSection));
    expect(container.querySelector('[data-fsa-unreadable]')?.textContent).toBe('確認できません');
    const reason = container.querySelector('[data-fsa-unreadable-reason]');
    expect(reason?.getAttribute('role')).toBe('alert');
    expect(reason?.textContent).toContain('この端末に保存した設定を読めませんでした');
    // 「未設定」の札は出ていない (この 2 つは同時に出ない)。
    const badges = [...container.querySelectorAll('span')].map((el) => el.textContent);
    expect(badges).not.toContain('未設定');
  });

  it('対照: 読める端末で選んでいなければ「未設定」が出て、理由は出ない', async () => {
    await mount(createElement(FsaSection));
    expect(container.querySelector('[data-fsa-unreadable]')).toBeNull();
    expect(container.querySelector('[data-fsa-unreadable-reason]')).toBeNull();
    const badges = [...container.querySelectorAll('span')].map((el) => el.textContent);
    expect(badges).toContain('未設定');
  });
});

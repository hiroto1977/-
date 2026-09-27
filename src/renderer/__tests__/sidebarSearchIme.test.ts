/** @vitest-environment jsdom */
/**
 * **サイドバー検索は、変換の確定・取り消しで動かない** (2026-09-27 · パス 493i)。
 *
 * サイドバーの検索欄は Enter で「先頭ヒットへ移る」、Escape で「検索語を消す」。
 * 窓全体の Escape は「ドロワーを閉じる」。どれも `e.key` だけを見ていたので、
 * 日本語で「ぜいりし」と打って変換を確定する Enter で**打ちかけの語の先頭ヒットへ移り**、
 * 変換を取り消す Escape で**検索語ごと消え、スマホではドロワーまで閉じた**。
 * 実 chromium (141) は変換中の keydown を `key` のまま `isComposing: true` で届ける
 * (2026-09-27 実測)。判定は `renderer/keyIntent.ts` の 1 つ。
 *
 * 実物の App を描いて押す (部品の外の窓の keydown も同じ出来事を受けるので、App ごとでないと測れない)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../App';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';
import { resetRecordStore } from './recordStoreHarness';
import { settleUntil, waitForElement } from './jsdomWait';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'), // Electron 扱い (ロック画面を出さない)
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined }),
      configurable: true,
    });
  }
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, { value: () => undefined, configurable: true, writable: true });
    }
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  location.hash = '';
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
});

/** 実物の App を描き、検索欄に語を打つ。 */
async function mountAndType(query: string): Promise<HTMLInputElement> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(App));
  });
  const search = await waitForElement(
    () => container.querySelector<HTMLInputElement>('input[aria-label="サービスを検索"]'),
    'サイドバーの検索欄',
  );
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, query);
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settleUntil(() => search.value === query, '検索欄に語が入る');
  return search;
}

async function key(el: HTMLElement, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  });
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

const activeTitle = (): string => container.querySelector('h1')?.textContent ?? '';

describe('サイドバー検索の Enter / Escape と、窓全体の Escape', () => {
  it('★ 変換中の Enter では先頭ヒットへ移らない (対照: 確定の後の Enter は移る)', async () => {
    const search = await mountAndType('税理士');
    const before = activeTitle();
    await key(search, { key: 'Enter', isComposing: true });
    expect(activeTitle(), '変換の確定で画面が移った').toBe(before);
    await key(search, { key: 'Enter', keyCode: 229 });
    expect(activeTitle(), 'Safari の確定後の 229 で画面が移った').toBe(before);
    // 対照: 変換していない Enter は先頭ヒット (税理士) へ移る —— 針が的に当たる。
    await key(search, { key: 'Enter' });
    await settleUntil(() => activeTitle() !== before, '確定の後の Enter で画面が移る');
    expect(activeTitle()).toContain('税理士');
  });

  it('★ 変換中の Escape では検索語を消さない (対照: 確定の後の Escape は消す)', async () => {
    const search = await mountAndType('ぜいりし');
    await key(search, { key: 'Escape', isComposing: true });
    expect(search.value, '変換の取り消しで検索語が消えた').toBe('ぜいりし');
    await key(search, { key: 'Escape' });
    await settleUntil(() => search.value === '', '確定の後の Escape で検索語が消える');
  });

  it('★ 変換中の Escape ではドロワーを閉じない (対照: 確定の後の Escape は閉じる)', async () => {
    const search = await mountAndType('ぜいりし');
    const toggle = await waitForElement(
      () => container.querySelector<HTMLButtonElement>('button[aria-label="メニューを開く"]'),
      'ドロワーを開くボタン',
    );
    await act(async () => {
      toggle.click();
    });
    await settleUntil(() => toggle.getAttribute('aria-expanded') === 'true', 'ドロワーが開く');
    await key(search, { key: 'Escape', isComposing: true });
    expect(toggle.getAttribute('aria-expanded'), '変換の取り消しでドロワーが閉じた').toBe('true');
    await key(search, { key: 'Escape' });
    await settleUntil(() => toggle.getAttribute('aria-expanded') === 'false', '確定の後の Escape でドロワーが閉じる');
  });
});

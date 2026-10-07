/** @vitest-environment jsdom */
/**
 * **スマホのドロワーのキーボードの道** (2026-10-07 · パス 506)。
 *
 * 実機 (Chromium 390×844) で測った直す前の形:
 * - 閉じている間、画面の外へ滑らせただけのサイドバーは**まだ焦点を取れた** (☰ から Shift+Tab で見えない 74 項目へ入る —— 測定器の
 *   焦点の一覧にも `button.sidebar-item` が並んでいた)。
 * - 開いている間、暗幕の後ろの本文へ Tab で逃げられた (☰ の次の Tab が本文の ♡ に当たる)。
 * - 開いても焦点は ☰ に残り、Esc で閉じても ☰ のまま (こちらは偶然正しかった)。
 *
 * 直し: ドロワーの幅 (`DRAWER_QUERY` = CSS の `@media (max-width: 768px)`) では、閉じている間はサイドバーを・開いている間は本文を
 * `inert` にし、開いたら ✕ へ焦点を運び、閉じたら ☰ へ戻す。デスクトップの幅では何も付けない。
 * jsdom は `inert` の振る舞い (焦点を取れない) を持たないので、ここで見るのは**属性と焦点の行き先**。実機の振る舞いは
 * e2e の `opened` suite が見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { join } from 'node:path';

import { App, DRAWER_QUERY } from '../App';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';
import { resetRecordStore } from './recordStoreHarness';
import { settleUntil, waitForElement } from './jsdomWait';
import { rules } from './themeCss';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';

/** ドロワーの幅か (matchMedia の答え)。検査ごとに切り替える。 */
let drawerWidth = false;

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
  Object.defineProperty(window, 'matchMedia', {
    value: (q: string) => ({
      matches: q === DRAWER_QUERY ? drawerWidth : false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
    configurable: true,
  });
  if (typeof (Element.prototype as unknown as Record<string, unknown>).scrollIntoView !== 'function') {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => undefined, configurable: true, writable: true });
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

let container: HTMLDivElement;
let root: Root | null = null;
const q = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel);

async function mountApp(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(App));
  });
  await waitForElement(() => q('.menu-btn'), '☰');
}

async function click(el: Element | null | undefined, what: string): Promise<void> {
  expect(el, `${what} が無い`).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

async function escape(target: EventTarget): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
}

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  location.hash = '';
  drawerWidth = false;
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
});

describe('ドロワーのキーボードの道 (パス 506)', () => {
  it('★ ドロワーの幅: 閉じている間はサイドバーが inert・開いたら本文が inert になり焦点は ✕ へ・Esc で閉じると焦点は ☰ へ戻る', async () => {
    drawerWidth = true;
    await mountApp();
    const sidebar = q('.sidebar')!;
    const main = q('.main')!;
    await settleUntil(() => sidebar.hasAttribute('inert'), '閉じたドロワーが inert になる');
    expect(main.hasAttribute('inert'), '閉じている間、本文は inert ではない').toBe(false);

    await click(q('.menu-btn'), '☰');
    await settleUntil(() => main.hasAttribute('inert'), '開いたドロワーの後ろの本文が inert になる');
    expect(sidebar.hasAttribute('inert'), '開いたドロワーは inert ではない').toBe(false);
    expect(document.activeElement, '開いたら焦点は ✕').toBe(q('.drawer-close'));

    await escape(window);
    await settleUntil(() => sidebar.hasAttribute('inert'), 'Esc で閉じるとサイドバーが inert に戻る');
    expect(q('.app')!.className).not.toContain('nav-open');
    expect(main.hasAttribute('inert')).toBe(false);
    expect(document.activeElement, '閉じたら焦点は ☰').toBe(q('.menu-btn'));
  });

  it('★ 項目を選んで閉じたときも、本文の inert は外れ、焦点は ☰ へ戻る (本文へ Tab で入れる)', async () => {
    drawerWidth = true;
    await mountApp();
    const main = q('.main')!;
    await click(q('.menu-btn'), '☰');
    await settleUntil(() => main.hasAttribute('inert'), '本文が inert');
    await click(q('button.sidebar-item[data-service-id="business"]'), 'business');
    await settleUntil(() => !main.hasAttribute('inert'), '本文の inert が外れる');
    expect(q('.app')!.className).not.toContain('nav-open');
    expect(document.activeElement).toBe(q('.menu-btn'));
  });

  it('対照: デスクトップの幅では inert を 1 つも付けず、焦点も動かさない', async () => {
    drawerWidth = false;
    await mountApp();
    const sidebar = q('.sidebar')!;
    const main = q('.main')!;
    expect(sidebar.hasAttribute('inert')).toBe(false);
    expect(main.hasAttribute('inert')).toBe(false);
    const before = document.activeElement;
    await click(q('.menu-btn'), '☰');
    await settleUntil(() => q('.app')!.className.includes('nav-open'), 'nav-open');
    expect(sidebar.hasAttribute('inert')).toBe(false);
    expect(main.hasAttribute('inert')).toBe(false);
    expect(document.activeElement, 'デスクトップでは焦点を運ばない').toBe(before === document.body ? document.body : q('.menu-btn'));
    await escape(window);
    await settleUntil(() => !q('.app')!.className.includes('nav-open'), 'nav-open が外れる');
    expect(sidebar.hasAttribute('inert')).toBe(false);
  });

  it('★ DRAWER_QUERY は styles.css がサイドバーを fixed のドロワーにする media 規則と同じ数', () => {
    const drawerRules = rules().filter((r) => r.selector === '.sidebar' && r.context.includes('@media') && r.decls.some(([k, v]) => k === 'position' && v === 'fixed'));
    expect(drawerRules.length, 'ドロワーの規則が 1 つ在る').toBe(1);
    expect(drawerRules[0]!.context).toBe(`@media ${DRAWER_QUERY}`);
    // 標本: 同じ数を書き写した所が無い (App.tsx のコードは定数 1 つで持つ —— 注記は落として数える)
    const app = stripComments(readOriginalSource(join(__dirname, '..', 'App.tsx')));
    expect(app.split('768px').length - 1, 'App.tsx のコードに 768px は定数の 1 か所だけ').toBe(1);
  });
});

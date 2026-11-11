/** @vitest-environment jsdom */
/**
 * 村の殻 (村リビルド P1): 既定は**村と会話だけ**。サイドバーも各サービスの画面も出ない。
 * 残すのは役場 (設定) だけ —— ロック・データの書き出しと削除・API キーの逃げ口。
 *
 * 旧画面は `?ui=legacy` の内部の入口でだけ出る (実機の検査と開発のため)。
 * 器は `appShell.test.ts` と同じ (App を丸ごと描く)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { App } from '../App';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests, navigateTo } from '../navigate';
import { resetRecordStore } from './recordStoreHarness';
import { waitForElement } from './jsdomWait';

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
    storageProtection: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
  };
  Object.defineProperty(window, 'matchMedia', {
    value: () => ({
      matches: false,
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

beforeEach(async () => {
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  await resetRecordStore();
  window.localStorage.clear();
});

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = null;
  // setup が付ける内部の入口へ戻す (他の検査が旧画面前提のため)。
  window.history.replaceState(null, '', '/?ui=legacy');
});

async function mount(search: string): Promise<void> {
  window.history.replaceState(null, '', `/${search}#village`);
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(App));
  });
}

describe('村の殻 (?ui=village)', () => {
  it('★ ?ui=village: 村と会話の欄だけが出る。サイドバーも各サービスの項目も無い', async () => {
    await mount('?ui=village');
    await waitForElement(() => container.querySelector('[data-village-shell]'), '村の殻');
    expect(container.querySelector('.sidebar')).toBeNull();
    expect(container.querySelectorAll('[data-service-id]').length).toBe(0);
    expect(container.querySelector('[data-village-chat]')).not.toBeNull();
    expect(container.querySelector('[data-village-hall-open]')).not.toBeNull();
  });

  it('★ 対照: 既定 (?ui=village なし) では旧画面 (サイドバー) が出て、村の殻は出ない', async () => {
    await mount('');
    await waitForElement(() => container.querySelector('.sidebar'), '旧画面のサイドバー');
    expect(container.querySelector('[data-village-shell]')).toBeNull();
  });

  it('★ 役場: 開くと設定の画面が窓で出て、Esc で閉じ、焦点は役場のボタンへ戻る', async () => {
    await mount('?ui=village');
    const open = await waitForElement(() => container.querySelector<HTMLButtonElement>('[data-village-hall-open]'), '役場のボタン');
    open.focus();
    await act(async () => { open.click(); });
    const hall = await waitForElement(() => container.querySelector<HTMLElement>('[role="dialog"][data-village-hall]'), '役場の窓');
    expect(hall.getAttribute('aria-label')).toBe('役場');
    // 設定の画面そのもの (ロック・データ・鍵の逃げ口) が中に在る。
    await waitForElement(() => hall.querySelector('h2, h3, section, [data-setting], button'), '設定の中身');
    await act(async () => {
      hall.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('[data-village-hall]')).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it('★ 窓の「閉じる」でも閉じる (キーボードに依らない逃げ道)', async () => {
    await mount('?ui=village');
    const open = await waitForElement(() => container.querySelector<HTMLButtonElement>('[data-village-hall-open]'), '役場のボタン');
    await act(async () => { open.click(); });
    const close = await waitForElement(
      () => container.querySelector<HTMLButtonElement>('[data-village-hall] [data-dialog-initial]'),
      '閉じるボタン',
    );
    await act(async () => { close.click(); });
    expect(container.querySelector('[data-village-hall]')).toBeNull();
  });

  // --- P3: 会話の「〇〇を開いて」(servicehub:navigate) を殻が聞く ---------------------------------
  it('★ 会話の「開いて」: navigate で該当サービスの画面が窓に開く (聞き手が無いと無反応になる)', async () => {
    await mount('?ui=village');
    await waitForElement(() => container.querySelector('[data-village-shell]'), '村の殻');
    expect(container.querySelector('[data-village-hall]')).toBeNull();
    await act(async () => { navigateTo('tax-accountant'); });
    const win = await waitForElement(() => container.querySelector<HTMLElement>('[role="dialog"][data-village-hall]'), 'サービスの窓');
    expect(win.getAttribute('data-village-window')).toBe('tax-accountant');
    expect(win.getAttribute('aria-label')).toBe('税理士');
    // 窓は設定ではなく、そのサービスの画面。
    expect(win.getAttribute('data-village-window')).not.toBe('settings');
    // 「閉じる」の逃げ道は同じ。
    const close = win.querySelector<HTMLButtonElement>('[data-dialog-initial]')!;
    await act(async () => { close.click(); });
    expect(container.querySelector('[data-village-hall]')).toBeNull();
  });

  it('★ settings への navigate は役場 (見出しは「役場」)・village への navigate は窓を閉じる', async () => {
    await mount('?ui=village');
    await waitForElement(() => container.querySelector('[data-village-shell]'), '村の殻');
    await act(async () => { navigateTo('settings'); });
    const win = await waitForElement(() => container.querySelector<HTMLElement>('[data-village-hall]'), '役場の窓');
    expect(win.getAttribute('aria-label')).toBe('役場');
    await act(async () => { navigateTo('village'); });
    expect(container.querySelector('[data-village-hall]')).toBeNull();
  });

  it('★ 知らない行き先・サイドバーに居ないサービスは無視する (窓は開かない)', async () => {
    await mount('?ui=village');
    await waitForElement(() => container.querySelector('[data-village-shell]'), '村の殻');
    await act(async () => { window.dispatchEvent(new CustomEvent('servicehub:navigate', { detail: 'no-such-page' })); });
    expect(container.querySelector('[data-village-hall]')).toBeNull();
    await act(async () => { navigateTo('uber-eats'); });
    expect(container.querySelector('[data-village-hall]')).toBeNull();
  });
});

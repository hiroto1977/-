/** @vitest-environment jsdom */
/**
 * 村の殻: 解錠の後に出るのは**村と会話だけ** (旧画面のサイドバーは 2026-11-04 に廃止)。
 * 各サービスの画面は会話の「開いて」か URL ハッシュで役場と同じ窓に開く。
 * 残すのは役場 (設定) —— ロック・データの書き出しと削除・API キーの逃げ口。
 * 器は App を丸ごと描く。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { App } from '../App';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests, navigateTo } from '../navigate';
import { resetRecordStore } from './recordStoreHarness';
import { settleUntil, waitForElement, waitForText } from './jsdomWait';

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
});

async function mount(search: string, hash = '#village'): Promise<void> {
  window.history.replaceState(null, '', `/${search}${hash}`);
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(App));
  });
}

describe('村の殻 (既定)', () => {
  it('★ 既定: 村と会話の欄だけが出る。サイドバーも各サービスの項目も無い', async () => {
    await mount('');
    await waitForElement(() => container.querySelector('[data-village-shell]'), '村の殻');
    expect(container.querySelector('.sidebar')).toBeNull();
    expect(container.querySelectorAll('[data-service-id]').length).toBe(0);
    expect(container.querySelector('[data-village-chat]')).not.toBeNull();
    expect(container.querySelector('[data-village-hall-open]')).not.toBeNull();
  });

  it('★ 役場: 開くと設定の画面が窓で出て、Esc で閉じ、焦点は役場のボタンへ戻る', async () => {
    await mount('');
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
    await mount('');
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
    await mount('');
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
    await mount('');
    await waitForElement(() => container.querySelector('[data-village-shell]'), '村の殻');
    await act(async () => { navigateTo('settings'); });
    const win = await waitForElement(() => container.querySelector<HTMLElement>('[data-village-hall]'), '役場の窓');
    expect(win.getAttribute('aria-label')).toBe('役場');
    await act(async () => { navigateTo('village'); });
    expect(container.querySelector('[data-village-hall]')).toBeNull();
  });

  it('★ 知らない行き先・サイドバーに居ないサービスは無視する (窓は開かない)', async () => {
    await mount('');
    await waitForElement(() => container.querySelector('[data-village-shell]'), '村の殻');
    await act(async () => { window.dispatchEvent(new CustomEvent('servicehub:navigate', { detail: 'no-such-page' })); });
    expect(container.querySelector('[data-village-hall]')).toBeNull();
    await act(async () => { navigateTo('uber-eats'); });
    expect(container.querySelector('[data-village-hall]')).toBeNull();
  });

  // --- 旧画面の廃止後: 直リンク (URL ハッシュ) と窓の中の手入力欄 ---------------------------------
  it('★ URL ハッシュ #tax-accountant で開くと、そのサービスの窓が最初から開いている (直リンク・共有)', async () => {
    await mount('', '#tax-accountant');
    const win = await waitForElement(() => container.querySelector<HTMLElement>('[data-village-hall]'), 'サービスの窓');
    expect(win.getAttribute('data-village-window')).toBe('tax-accountant');
  });

  it('★ 窓を開く・閉じるとハッシュが追随し、ハッシュを替えると窓が追随する (戻る/進む)', async () => {
    await mount('');
    await waitForElement(() => container.querySelector('[data-village-shell]'), '村の殻');
    await act(async () => { navigateTo('stocks'); });
    await waitForElement(() => container.querySelector('[data-village-window="stocks"]'), '窓が開く');
    expect(window.location.hash).toBe('#stocks');
    await act(async () => {
      window.location.hash = '#business';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitForElement(() => container.querySelector('[data-village-window="business"]'), 'ハッシュで窓が替わる');
    await act(async () => { navigateTo('village'); });
    expect(container.querySelector('[data-village-hall]')).toBeNull();
    expect(window.location.hash).toBe('#village');
  });

  it('★ 窓の中に手入力欄が在る (旧画面の「画面ごとの手入力欄」を失っていない)', async () => {
    await mount('', '#kpi');
    const win = await waitForElement(() => container.querySelector<HTMLElement>('[data-village-hall]'), 'KPI の窓');
    await waitForElement(() => win.querySelector('[data-manual-data]'), '窓の中の手入力欄');
  });

  it('★ 会話の列で話せる (打って送ると、列の中に自分の発言と返事が並ぶ)', async () => {
    await mount('');
    const column = await waitForElement(() => container.querySelector<HTMLElement>('[data-village-chat]'), '会話の列');
    const input = await waitForElement(
      () => column.querySelector<HTMLInputElement>('input[aria-label="チャット入力"]'),
      'チャット入力',
    );
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, '何ができる？');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const send = column.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await settleUntil(() => !send.disabled, '送信ボタンが押せる');
    await act(async () => { send.click(); });
    await waitForText(() => column.querySelector('[data-concierge-role="user"]')?.textContent ?? '', '何ができる？');
    await waitForElement(() => column.querySelector('[data-concierge-role="bot"]'), '返事');
  });

  it('★ 列の送信ボタンの読み上げ名は「送信」を含まない (画面の「送信」と名前で区別できる)', async () => {
    await mount('');
    const column = await waitForElement(() => container.querySelector<HTMLElement>('[data-village-chat]'), '会話の列');
    const send = await waitForElement(() => column.querySelector<HTMLButtonElement>('button[type="submit"]'), '送信ボタン');
    const name = send.getAttribute('aria-label') ?? send.textContent ?? '';
    expect(name).toBe('コンシェルジュへ送る');
    expect(name.includes('送信')).toBe(false);
    expect(send.textContent).toBe('送信');
  });
});

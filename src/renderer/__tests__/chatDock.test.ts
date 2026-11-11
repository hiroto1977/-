/** @vitest-environment jsdom */
/**
 * AI チャットの置き場 (2026-09-26): 「すっきり」× 広い画面ではサイドバーと画面の間の**列**、
 * それ以外は右下の 🤖 から開く**浮いた窓**。判定は `chatDock.ts` の 1 か所 (CSS は組の有無だけを見る)。
 *
 * 見るのは**配線** —— App を丸ごと描き、`matchMedia` の代役で画面の幅を、`<html data-design>` で
 * デザインを動かして、次を確かめる:
 *   ① 列のときは列が 1 つだけ在り、右下の 🤖 は無い (会話の入口を 2 つにしない)
 *   ② 上部バーの「💬 チャット」と列の「«」で畳める・戻せる。畳んでも浮いた窓は出さない
 *   ③ 狭い画面・かわいいでは浮いた窓 (今までどおり)
 *   ④ 幅とデザインの変化に追随する (描き直す)
 *   ⑤ DOM の順は見た目の順 (サイドバー → チャット → 画面) —— Tab で辿る順が揃う
 *   ⑥ 列の送信ボタンの読み上げ名は「送信」を含まない (画面の「送信」と名前で区別できる)
 *
 * 見た目 (幅・色) は `themeTokens.test.ts` と e2e の shell suite が見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { App } from '../App';
import { CHAT_DOCK_MIN_WIDTH, CHAT_DOCK_QUERY, mediaMatches, shouldDockChat } from '../chatDock';
import { selectDesign } from '../theme';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';
import { resetRecordStore } from './recordStoreHarness';
import { waitForElement, waitForText, settleUntil } from './jsdomWait';

type Listener = (e: MediaQueryListEvent) => void;

/** 画面の幅の代役。`wide` を替えて `fireWidth()` で change を配る。 */
let wide = true;
const widthListeners = new Set<Listener>();
function fireWidth(next: boolean): void {
  wide = next;
  for (const l of [...widthListeners]) l({ matches: next } as MediaQueryListEvent);
}

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
      get matches() {
        return q === CHAT_DOCK_QUERY ? wide : false;
      },
      media: q,
      addEventListener: (_t: string, l: Listener) => {
        if (q === CHAT_DOCK_QUERY) widthListeners.add(l);
      },
      removeEventListener: (_t: string, l: Listener) => {
        widthListeners.delete(l);
      },
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

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(App));
  });
  await waitForElement(() => q('.sidebar'), 'サイドバー');
}

async function click(el: Element | null, what: string): Promise<void> {
  expect(el, `${what} が無い`).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  location.hash = '';
  wide = true;
  widthListeners.clear();
  document.documentElement.setAttribute('data-design', 'clean');
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  document.documentElement.removeAttribute('data-design');
});

describe('チャットの置き場: 判定 (純関数)', () => {
  it('★ 列にするのは「すっきり」× 広い画面だけ', () => {
    expect(shouldDockChat('clean', true)).toBe(true);
    expect(shouldDockChat('clean', false)).toBe(false);
    expect(shouldDockChat('cute', true)).toBe(false);
    expect(shouldDockChat('cute', false)).toBe(false);
  });

  it('幅の問いは 1 つの数から組む (CSS に同じ幅を書かない —— 判定は JS の 1 か所)', () => {
    expect(CHAT_DOCK_QUERY).toBe(`(min-width: ${CHAT_DOCK_MIN_WIDTH}px)`);
  });

  it('★ matchMedia が無い・投げる環境は「狭い」に倒す (浮いた窓はどの幅でも崩れない)', () => {
    expect(mediaMatches(CHAT_DOCK_QUERY, {})).toBe(false);
    const throwing = {
      matchMedia: () => {
        throw new Error('no');
      },
    } as unknown as { matchMedia: (q: string) => MediaQueryList };
    expect(mediaMatches(CHAT_DOCK_QUERY, throwing)).toBe(false);
    const yes = { matchMedia: () => ({ matches: true }) as MediaQueryList };
    expect(mediaMatches(CHAT_DOCK_QUERY, yes)).toBe(true);
  });
});

describe('チャットの置き場: App の配線', () => {
  it('★ すっきり × 広い画面: 列が 1 つだけ在り、右下の 🤖 は無い', async () => {
    await mount();
    const column = await waitForElement(() => q('aside.chat-column'), 'チャットの列');
    expect(column.getAttribute('aria-label')).toBe('AI コンシェルジュ');
    expect(q('.app')?.classList.contains('chat-docked')).toBe(true);
    expect(column.querySelector('[data-concierge="docked"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-concierge]').length).toBe(1);
    expect(q('.concierge-fab'), '列のときに浮いたボタンは無い (入口を 2 つにしない)').toBeNull();
    expect(q('[role="dialog"][aria-label="AI コンシェルジュ"]'), '列は dialog ではない').toBeNull();
    const toggle = q<HTMLButtonElement>('.chat-toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-label')).toBe('AI コンシェルジュを隠す');
  });

  it('★ DOM の順は見た目の順 (サイドバー → チャット → 画面)', async () => {
    await mount();
    await waitForElement(() => q('aside.chat-column'), 'チャットの列');
    const children = Array.from(q('.app')!.children).map((el) => el.className.split(' ')[0]);
    const order = ['sidebar', 'chat-column', 'main'].map((c) => children.indexOf(c));
    expect(order.every((i) => i >= 0), JSON.stringify(children)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('★ 上部バーの「💬 チャット」で畳む・戻す —— 畳んでも浮いた窓は出さない', async () => {
    await mount();
    await waitForElement(() => q('aside.chat-column'), 'チャットの列');
    await click(q('.chat-toggle'), '💬 チャット');
    await settleUntil(() => q('aside.chat-column') === null, '列が畳まれる');
    expect(q('.app')?.classList.contains('chat-docked')).toBe(false);
    expect(q('.chat-toggle')?.getAttribute('aria-expanded')).toBe('false');
    expect(q('.chat-toggle')?.getAttribute('aria-label')).toBe('AI コンシェルジュを表示');
    expect(q('.concierge-fab'), '畳んだら右下の 🤖 が出る —— では入口が 2 つになる').toBeNull();
    await click(q('.chat-toggle'), '💬 チャット');
    await waitForElement(() => q('aside.chat-column'), '列が戻る');
    expect(q('.app')?.classList.contains('chat-docked')).toBe(true);
  });

  it('★ 列の見出しの「«」でも畳める', async () => {
    await mount();
    const column = await waitForElement(() => q('aside.chat-column'), 'チャットの列');
    await click(column.querySelector('button[aria-label="チャット欄を畳む"]'), '«');
    await settleUntil(() => q('aside.chat-column') === null, '列が畳まれる');
    expect(q('.chat-toggle')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('★ 狭い画面は浮いた窓 (列も「💬 チャット」も無い)', async () => {
    wide = false;
    await mount();
    await waitForElement(() => q('.concierge-fab'), '右下の 🤖');
    expect(q('aside.chat-column')).toBeNull();
    expect(q('.chat-toggle')).toBeNull();
    expect(q('.app')?.classList.contains('chat-docked')).toBe(false);
  });

  it('★ かわいいは広い画面でも浮いた窓 (パス 322 の見た目のまま)', async () => {
    document.documentElement.setAttribute('data-design', 'cute');
    await mount();
    await waitForElement(() => q('.concierge-fab'), '右下の 🤖');
    expect(q('aside.chat-column')).toBeNull();
    expect(q('.chat-toggle')).toBeNull();
  });

  it('★ 画面の幅の変化に追随する (広い → 狭い → 広い)', async () => {
    await mount();
    await waitForElement(() => q('aside.chat-column'), 'チャットの列');
    await act(async () => {
      fireWidth(false);
    });
    await waitForElement(() => q('.concierge-fab'), '狭くなったら右下の 🤖');
    expect(q('aside.chat-column')).toBeNull();
    await act(async () => {
      fireWidth(true);
    });
    await waitForElement(() => q('aside.chat-column'), '広くなったら列');
    expect(q('.concierge-fab')).toBeNull();
  });

  it('★ 設定画面でデザインを選び直すと追随する (再読込なしで列 ⇄ 浮いた窓)', async () => {
    await mount();
    await waitForElement(() => q('aside.chat-column'), 'チャットの列');
    await act(async () => {
      selectDesign('cute');
    });
    await waitForElement(() => q('.concierge-fab'), 'かわいいでは右下の 🤖');
    expect(q('aside.chat-column')).toBeNull();
    await act(async () => {
      selectDesign('clean');
    });
    await waitForElement(() => q('aside.chat-column'), 'すっきりへ戻すと列');
  });

  it('★ 列でも会話できる (打って送ると、列の中に自分の発言と返事が並ぶ)', async () => {
    await mount();
    const column = await waitForElement(() => q('aside.chat-column'), 'チャットの列');
    const input = column.querySelector<HTMLInputElement>('input[aria-label="チャット入力"]')!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, '何ができる？');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const send = column.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await settleUntil(() => !send.disabled, '送信ボタンが押せる');
    await click(send, '送信');
    await waitForText(() => column.querySelector('[data-concierge-role="user"]')?.textContent ?? '', '何ができる？');
    await waitForElement(() => column.querySelector('[data-concierge-role="bot"]'), '返事');
  });

  it('★ 列の送信ボタンの読み上げ名は「送信」を含まない (画面の「送信」と名前で区別できる)', async () => {
    await mount();
    const column = await waitForElement(() => q('aside.chat-column'), 'チャットの列');
    const send = column.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const name = send.getAttribute('aria-label') ?? send.textContent ?? '';
    expect(name).toBe('コンシェルジュへ送る');
    // 名前を部分一致で探す道具 (Playwright の getByRole の既定) で、画面の「送信」と取り違えない。
    expect(name.includes('送信')).toBe(false);
    // 見える字は「送信」のまま (標本: 字と読み上げ名が別であることを確かめる)。
    expect(send.textContent).toBe('送信');
  });
});

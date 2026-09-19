/** @vitest-environment jsdom */
/**
 * シェルの操作性 (2026-09-19 · パス 322): サイドバーの検索 (✕ · 件数 · Enter) / 分類の開閉 /
 * トップバーの ♡ とサイドバーの ♥ とホームのジャンプ列が **1 つの並びを映す** / 「先頭へ戻る」 /
 * 画面を切り替えたら先頭から / ドロワーは ✕ と Esc で閉じる / 文脈の外のホームは空の並び。
 *
 * 見た目 (色・影・アニメーション) はここでは見ない —— `themeTokens.test.ts` がトークンの表を、
 * `scripts/e2e/core.cjs` の `shellSuite` が実ブラウザでの可視性とスクロール量を見る。
 * ここで見るのは**配線**: 押した物が状態を変え、その状態を 3 つの場所が同じに描くこと。
 *
 * 器は `appPageErrorBoundary.test.ts` と同じ (App を丸ごと描く)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { App } from '../App';
import { HomePage } from '../pages/HomePage';
import { EMPTY_SHELL, useShell } from '../shellContext';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests } from '../navigate';
import { resetRecordStore } from './recordStoreHarness';

/** OS の「動きを減らす」設定。検査ごとに切り替える。 */
let reducedMotion = false;

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
      matches: q.includes('prefers-reduced-motion') ? reducedMotion : false,
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

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

const q = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel);
const qa = (sel: string) => Array.from(container.querySelectorAll<HTMLElement>(sel));

async function click(el: Element | null | undefined, what = 'element'): Promise<void> {
  expect(el, `${what} missing`).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

/** React の制御された入力欄に値を入れる (native setter + input event)。 */
async function type(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

async function key(target: EventTarget, k: string): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
  await settle();
}

/**
 * jsdom はレイアウトを持たないので `scrollTop` は常に 0。本文の要素だけ、書ける `scrollTop` と
 * それを動かす `scrollTo` を持たせて**ブラウザの振る舞いを模す** —— `scrollTo` は呼ばれた
 * `top` を `scrollTop` に写す (実ブラウザと同じ向き)。
 */
function fakeScrollable(el: HTMLElement): { calls: ScrollToOptions[] } {
  const calls: ScrollToOptions[] = [];
  let top = 0;
  Object.defineProperty(el, 'scrollTop', { get: () => top, set: (v: number) => { top = v; }, configurable: true });
  Object.defineProperty(el, 'scrollTo', {
    value: (opts: ScrollToOptions) => {
      calls.push(opts);
      top = opts.top ?? 0;
    },
    configurable: true,
    writable: true,
  });
  return { calls };
}

async function scrollContentTo(el: HTMLElement, top: number): Promise<void> {
  await act(async () => {
    el.scrollTop = top;
    el.dispatchEvent(new Event('scroll'));
  });
  await settle();
}

async function mount(element: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });
  await settle();
}

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  location.hash = '';
  reducedMotion = false;
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

const sidebarItem = (id: string) => q<HTMLButtonElement>(`button.sidebar-item[data-service-id="${id}"]`);

describe('シェル: 検索 (パス 322)', () => {
  it('★ 打つと ✕ と件数が出て、✕ で消えると札 (ショートカット) に戻り、フォーカスは欄に残る', async () => {
    await mount(createElement(App));
    const input = q<HTMLInputElement>('.sidebar-search-input')!;
    expect(q('.sidebar-search-kbd'), '空のときは札').toBeTruthy();
    expect(q('.sidebar-search-clear'), '空のときに ✕ は無い').toBeNull();

    await type(input, 'GitHub');
    expect(q('.sidebar-search-clear'), '打ったら ✕').toBeTruthy();
    expect(q('.sidebar-search-kbd'), '打ったら札は消える').toBeNull();
    const status = q('.sidebar-nav [role="status"]')!;
    expect(status.textContent).toMatch(/検索結果 \d+ 件/);
    const n = Number(/検索結果 (\d+) 件/.exec(status.textContent!)![1]);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(qa('.sidebar-nav .sidebar-item').length, '件数 = 並ぶ項目').toBe(n);
    expect(sidebarItem('github'), 'GitHub が候補に居る').toBeTruthy();

    await click(q('.sidebar-search-clear'), '✕');
    expect(input.value).toBe('');
    expect(q('.sidebar-search-kbd')).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });

  it('Enter は先頭の候補を開き、Esc は検索を消す', async () => {
    await mount(createElement(App));
    const input = q<HTMLInputElement>('.sidebar-search-input')!;
    await type(input, 'GitHub');
    const first = qa('.sidebar-nav .sidebar-item')[0]!.getAttribute('data-service-id');
    await key(input, 'Enter');
    expect(q('.sidebar-item.active')?.getAttribute('data-service-id')).toBe(first);
    await type(input, 'Slack');
    await key(input, 'Escape');
    expect(input.value).toBe('');
  });

  it('一致しなければ「一致するサービスはありません」', async () => {
    await mount(createElement(App));
    await type(q<HTMLInputElement>('.sidebar-search-input')!, 'zzzz-no-such-service');
    expect(q('.sidebar-empty')?.textContent).toContain('一致するサービスはありません');
    expect(qa('.sidebar-nav .sidebar-item').length).toBe(0);
  });
});

describe('シェル: 分類の開閉 (パス 322)', () => {
  it('★ 見出しの aria-expanded と項目の有無が一致し、押すたびに反転する', async () => {
    await mount(createElement(App));
    const head = q('.sidebar-group[data-category="tools"] .sidebar-group-head')!;
    expect(head.getAttribute('aria-expanded'), '分析・ツールは既定で畳む').toBe('false');
    expect(qa('.sidebar-group[data-category="tools"] .sidebar-item').length).toBe(0);
    expect(head.querySelector('.group-count')?.textContent).toMatch(/^\d+$/);

    await click(head, '見出し');
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(qa('.sidebar-group[data-category="tools"] .sidebar-item').length).toBe(
      Number(head.querySelector('.group-count')!.textContent),
    );

    await click(head, '見出し');
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(qa('.sidebar-group[data-category="tools"] .sidebar-item').length).toBe(0);
  });

  it('おすすめは既定で開いていて、選んだ画面には aria-current=page が付く', async () => {
    await mount(createElement(App));
    expect(q('.sidebar-group[data-category="featured"] .sidebar-group-head')?.getAttribute('aria-expanded')).toBe('true');
    await click(sidebarItem('business'), 'business');
    expect(sidebarItem('business')?.getAttribute('aria-current')).toBe('page');
    expect(sidebarItem('home')?.getAttribute('aria-current')).toBeNull();
  });
});

describe('シェル: お気に入りは 1 つの並びを 3 か所が映す (パス 322)', () => {
  it('★ トップバーの ♡ → サイドバーの節と項目の ♥ とホームの列 → 項目の ♥ で外すとすべて戻る', async () => {
    await mount(createElement(App));
    expect(q('.sidebar-item.active')?.getAttribute('data-service-id')).toBe('home');
    expect(q('[data-home-favorites]')?.textContent).toContain('ここに並びます');
    expect(q('[data-section="favorites"]')).toBeNull();

    const topFav = q<HTMLButtonElement>('.topbar-fav')!;
    expect(topFav.getAttribute('aria-pressed')).toBe('false');
    await click(topFav, 'topbar ♡');

    expect(q('.topbar-fav')?.getAttribute('aria-pressed')).toBe('true');
    expect(q('.topbar-fav')?.className).toContain('on');
    expect(q('.topbar-fav')?.getAttribute('aria-label')).toBe('お気に入りから外す');
    expect(q('[data-section="favorites"] .sidebar-item[data-service-id="home"]'), 'サイドバーの節').toBeTruthy();
    expect(q('[data-section="favorites"] .sidebar-item[data-service-id="home"] .fav-toggle')?.className).toContain('on');
    expect(q('[data-home-favorites] button.chip[data-jump-to="home"]'), 'ホームの列').toBeTruthy();
    expect(JSON.parse(localStorage.getItem('servicehub.favorites')!)).toEqual(['home']);

    // 節の中の ♥ で外す (押し場所が違っても状態は 1 つ)
    await click(q('[data-section="favorites"] .sidebar-item[data-service-id="home"] .fav-toggle'), '節の ♥');
    expect(q('.topbar-fav')?.getAttribute('aria-pressed')).toBe('false');
    expect(q('[data-section="favorites"]')).toBeNull();
    expect(q('[data-home-favorites] button.chip')).toBeNull();
    expect(q('[data-home-favorites]')?.textContent).toContain('ここに並びます');
    expect(JSON.parse(localStorage.getItem('servicehub.favorites')!)).toEqual([]);
  });

  it('★ 最近使った列は新しい順・自分 (ホーム) を出さず、押すとそこへ移る', async () => {
    await mount(createElement(App));
    expect(q('[data-home-recents]')?.textContent).toContain('ここへ並びます');
    await click(sidebarItem('business'), 'business');
    await click(sidebarItem('templates'), 'templates');
    await click(sidebarItem('home'), 'home');
    const chips = qa('[data-home-recents] button.chip').map((b) => b.getAttribute('data-jump-to'));
    expect(chips).toEqual(['templates', 'business']);
    expect(chips).not.toContain('home');

    await click(q('[data-home-recents] button.chip[data-jump-to="business"]'), '最近使った chip');
    expect(q('.sidebar-item.active')?.getAttribute('data-service-id')).toBe('business');
    expect(q('.topbar h1')?.textContent).toBe(sidebarItem('business')!.querySelector('span:nth-child(2)')!.textContent);
  });

  it('文脈の外 (画面だけを描く) のホームは空の並びで、toggleFavorite は no-op', () => {
    expect(EMPTY_SHELL.favorites).toEqual([]);
    expect(EMPTY_SHELL.recents).toEqual([]);
    expect(() => EMPTY_SHELL.toggleFavorite('home')).not.toThrow();
    let seen: ReturnType<typeof useShell> | undefined;
    function Probe() {
      seen = useShell();
      return null;
    }
    const div = document.createElement('div');
    const r = createRoot(div);
    act(() => {
      r.render(createElement(Probe));
    });
    expect(seen).toBe(EMPTY_SHELL);
    act(() => {
      r.unmount();
    });
  });

  it('文脈の外のホームは案内文だけで chip を出さない (対照: 文脈が要ることの証明)', async () => {
    await mount(createElement(HomePage));
    expect(q('[data-home-favorites]')?.textContent).toContain('ここに並びます');
    expect(q('[data-home-recents]')?.textContent).toContain('ここへ並びます');
    expect(q('[data-home-favorites] button.chip')).toBeNull();
    expect(q('.home-date')?.hasAttribute('data-live-clock'), '日付は壁時計の印を持つ').toBe(true);
    expect(qa('.home-card').length, '8 つの近道は残る').toBe(8);
  });
});

describe('シェル: 先頭へ戻る (パス 322)', () => {
  it('★ 閾値を越えて送ると現れ、押すと先頭へ (smooth) 戻り、隠れる', async () => {
    await mount(createElement(App));
    const content = q('.content')!;
    const { calls } = fakeScrollable(content);
    const fab = q<HTMLButtonElement>('.scroll-top')!;
    expect(fab.className).not.toContain('show');
    expect(fab.getAttribute('aria-hidden')).toBe('true');
    expect(fab.tabIndex).toBe(-1);

    await scrollContentTo(content, 100);
    expect(fab.className, '閾値 (320) 未満では出ない').not.toContain('show');
    await scrollContentTo(content, 500);
    expect(fab.className).toContain('show');
    expect(fab.getAttribute('aria-hidden')).toBe('false');
    expect(fab.tabIndex).toBe(0);

    await click(fab, '先頭へ戻る');
    expect(calls.at(-1)).toEqual({ top: 0, behavior: 'smooth' });
    expect(content.scrollTop).toBe(0);
    await scrollContentTo(content, 0);
    expect(fab.className).not.toContain('show');
  });

  it('OS が「動きを減らす」なら滑らかにしない (auto)', async () => {
    reducedMotion = true;
    await mount(createElement(App));
    const content = q('.content')!;
    const { calls } = fakeScrollable(content);
    await scrollContentTo(content, 500);
    await click(q('.scroll-top'), '先頭へ戻る');
    expect(calls.at(-1)).toEqual({ top: 0, behavior: 'auto' });
  });

  it('★ 画面を切り替えると先頭から (前の画面のスクロール位置を引き継がない)', async () => {
    await mount(createElement(App));
    const content = q('.content')!;
    const { calls } = fakeScrollable(content);
    await scrollContentTo(content, 900);
    expect(q('.scroll-top')?.className).toContain('show');
    await click(sidebarItem('business'), 'business');
    expect(calls.at(-1)).toEqual({ top: 0, behavior: 'auto' });
    expect(content.scrollTop).toBe(0);
    expect(q('.scroll-top')?.className).not.toContain('show');
  });

  it('scrollTo を持たない環境では scrollTop へ倒す (jsdom の素の要素)', async () => {
    await mount(createElement(App));
    const content = q('.content')!;
    let top = 700;
    Object.defineProperty(content, 'scrollTop', { get: () => top, set: (v: number) => { top = v; }, configurable: true });
    Object.defineProperty(content, 'scrollTo', { value: undefined, configurable: true, writable: true });
    await scrollContentTo(content, 700);
    await click(q('.scroll-top'), '先頭へ戻る');
    expect(top).toBe(0);
  });
});

describe('シェル: ドロワー (パス 322)', () => {
  it('★ ☰ で開き、✕ で閉じ、Esc でも閉じ、項目を選んでも閉じる', async () => {
    await mount(createElement(App));
    const app = q('.app')!;
    expect(app.className).not.toContain('nav-open');
    await click(q('.menu-btn'), '☰');
    expect(app.className).toContain('nav-open');
    expect(q('.menu-btn')?.getAttribute('aria-expanded')).toBe('true');
    expect(q('.sidebar-backdrop')).toBeTruthy();

    await click(q('.drawer-close'), '✕');
    expect(app.className).not.toContain('nav-open');
    expect(q('.sidebar-backdrop')).toBeNull();

    await click(q('.menu-btn'), '☰');
    expect(app.className).toContain('nav-open');
    await key(window, 'Escape');
    expect(app.className).not.toContain('nav-open');

    await click(q('.menu-btn'), '☰');
    await click(sidebarItem('business'), 'business');
    expect(app.className).not.toContain('nav-open');
    expect(q('.sidebar-item.active')?.getAttribute('data-service-id')).toBe('business');
  });

  it('トップバーは画面の記号・分類・説明を出す', async () => {
    await mount(createElement(App));
    await click(sidebarItem('business'), 'business');
    expect(q('.topbar-icon')?.textContent).toBe(sidebarItem('business')!.querySelector('.icon')!.textContent);
    expect(q('.topbar .crumb')?.textContent).toContain('おすすめ');
    expect(q('.topbar .description')?.textContent?.length).toBeGreaterThan(0);
  });
});

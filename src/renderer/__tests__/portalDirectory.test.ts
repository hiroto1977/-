/** @vitest-environment jsdom */
/**
 * ポータルの入口 (2026-11-11): 社内 / パートナー / カスタマーの 3 つの一覧を開く。
 * 入口は 2 つの殻の両方に在る —— 既定のサイドバーの画面 (サイドバーの「🚪 ポータル」→ 画面の場所に一覧) と、
 * 村の殻 (`?ui=village` · 上部の「🚪 ポータル」→ 窓に一覧)。一覧の部品は同じ `PortalDirectory`。
 *
 * - 社内: アプリのすべての画面 (サイドバーに在った物) が並ぶ。
 * - パートナー / カスタマー: 台帳 `shared/portal.mamori` に名指しした画面**だけ**が並ぶ (社内の画面は 1 つも出ない)。
 * - 一覧から開いた画面を閉じると、村ではなく一覧へ戻る。
 * - `#portal/<id>` の直リンクで開く。知らないポータルは開かない。
 *
 * 器は `villageShell.test.ts` / `appShell.test.ts` と同じ (App を丸ごと描く)。待ちは条件で取る (固定回数で待たない)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { App } from '../App';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests, navigateTo } from '../navigate';
import { SERVICES } from '../services';
import { CUSTOMER_SCREENS, PARTNER_SCREENS } from '../../shared/portal';
import { CUSTOMER_CONTENT, PARTNER_CONTENT } from '../portal/portalContent';
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

async function mountAt(search: string, hash: string, ready: string, label: string): Promise<void> {
  window.history.replaceState(null, '', `/${search}${hash}`);
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(App));
  });
  await waitForElement(() => container.querySelector(ready), label);
}

/** 村の殻で開く。 */
const mount = (hash: string): Promise<void> => mountAt('?ui=village', hash, '[data-village-shell]', '村の殻');
/** 既定のサイドバーの画面で開く。 */
const mountLegacy = (hash: string): Promise<void> => mountAt('', hash, '.sidebar', 'サイドバー');

const win = (): HTMLElement | null => container.querySelector<HTMLElement>('[role="dialog"][data-village-hall]');
const screenIds = (): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-portal-directory] [data-portal-screen]')).map(
    (b) => b.getAttribute('data-portal-screen') ?? '',
  );

async function click(el: HTMLElement): Promise<void> {
  await act(async () => { el.click(); });
}

async function openDirectory(): Promise<HTMLButtonElement> {
  const btn = await waitForElement(() => container.querySelector<HTMLButtonElement>('[data-village-portal-open]'), 'ポータルのボタン');
  btn.focus();
  await click(btn);
  await waitForElement(() => container.querySelector('[data-portal-directory]'), 'ポータルの一覧');
  return btn;
}

async function selectPortal(id: 'internal' | 'partner' | 'customer'): Promise<void> {
  const tab = await waitForElement(() => container.querySelector<HTMLButtonElement>(`[data-portal-tab="${id}"]`), `${id} の切り替え`);
  await click(tab);
  await waitForElement(() => container.querySelector(`[data-portal-directory="${id}"]`), `${id} の一覧`);
}

describe('ポータルの入口 (村の殻)', () => {
  it('★ 「ポータル」を押すと社内ポータルの一覧が窓に開き、アプリの全画面が並ぶ', async () => {
    await mount('#village');
    expect(win()).toBeNull();
    await openDirectory();
    const w = win()!;
    expect(w.getAttribute('data-village-window')).toBe('portal');
    expect(w.getAttribute('aria-label')).toBe('社内ポータル');
    expect(container.querySelector('[data-portal-directory]')!.getAttribute('data-portal-directory')).toBe('internal');
    // 3 つの切り替えが在り、社内が選ばれている。
    const tabs = Array.from(container.querySelectorAll<HTMLElement>('[data-portal-tab]'));
    expect(tabs.map((t) => t.getAttribute('data-portal-tab'))).toEqual(['internal', 'partner', 'customer']);
    expect(tabs.map((t) => t.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    // サイドバーに在った画面が、過不足なく並ぶ。
    expect(screenIds().slice().sort()).toEqual(SERVICES.map((s) => s.id).sort());
    expect(location.hash).toBe('#portal/internal');
  });

  it('★ パートナーポータル: 台帳に名指しした画面だけが並ぶ (社内の画面は 1 つも出ない)', async () => {
    await mount('#village');
    await openDirectory();
    await selectPortal('partner');
    expect(win()!.getAttribute('aria-label')).toBe('パートナーポータル');
    expect(screenIds()).toEqual(PARTNER_SCREENS.map((s) => s.id));
    // 標本: 社内の画面が出ていない (針が的に当たること = 社内の一覧では出ていた、は上の it が見ている)。
    for (const id of ['settings', 'assistant', 'github', 'team']) expect(screenIds()).not.toContain(id);
    expect(location.hash).toBe('#portal/partner');
  });

  it('★ カスタマーポータル: 載せる頁だけが並び、押すと一覧の中に開く (見本の札つき)', async () => {
    await mount('#village');
    await openDirectory();
    await selectPortal('customer');
    expect(win()!.getAttribute('aria-label')).toBe('カスタマーポータル');
    expect(screenIds()).toEqual(CUSTOMER_SCREENS.map((s) => s.id));
    expect(container.querySelector('[data-portal-preview]')).toBeNull();

    await click(container.querySelector<HTMLButtonElement>('[data-portal-screen="faq"]')!);
    const faq = await waitForElement(() => container.querySelector<HTMLElement>('[data-portal-preview] [data-portal-published="faq"]'), 'よくある質問の頁');
    expect(faq.querySelectorAll('[data-portal-faq]').length).toBe(CUSTOMER_CONTENT.faq.length);
    expect(faq.textContent).toContain(CUSTOMER_CONTENT.faq[0]!.question);
    expect(faq.querySelector('[data-portal-sample]')).not.toBeNull();
    // 窓は一覧のまま (アプリの画面へは移っていない)。
    expect(win()!.getAttribute('data-village-window')).toBe('portal');

    await click(container.querySelector<HTMLButtonElement>('[data-portal-screen="contact"]')!);
    const contact = await waitForElement(() => container.querySelector<HTMLElement>('[data-portal-preview] [data-portal-published="contact"]'), 'お問い合わせの頁');
    expect(contact.textContent).toContain(CUSTOMER_CONTENT.contact.email);
    // 問い合わせは送らない: 入力欄も送信のボタンも無い。
    expect(contact.querySelectorAll('input, textarea, form, button').length).toBe(0);
    expect(contact.textContent).toContain('このポータルから問い合わせを送ることはできません');
  });

  it('★ パートナーの「お知らせ・取引ガイドライン」は見本の内容をそのまま出す', async () => {
    await mount('#village');
    await openDirectory();
    await selectPortal('partner');
    await click(container.querySelector<HTMLButtonElement>('[data-portal-screen="guidelines"]')!);
    const page = await waitForElement(() => container.querySelector<HTMLElement>('[data-portal-preview] [data-portal-published="guidelines"]'), 'ガイドラインの頁');
    expect(page.querySelectorAll('[data-portal-notice]').length).toBe(PARTNER_CONTENT.notices.length);
    expect(page.querySelectorAll('[data-portal-guideline]').length).toBe(PARTNER_CONTENT.guidelines.length);
    expect(page.textContent).toContain(PARTNER_CONTENT.guidelines[0]!.points[0]!);
    expect(page.textContent).toContain(PARTNER_CONTENT.contact.email);
  });

  it('★ 一覧から開いたアプリの画面を閉じると、村ではなく一覧へ戻る', async () => {
    await mount('#village');
    await openDirectory();
    await selectPortal('partner');
    await click(container.querySelector<HTMLButtonElement>('[data-portal-screen="compliance"]')!);
    await settleUntil(() => win()?.getAttribute('data-village-window') === 'compliance', 'コンプライアンスの窓');
    expect(container.querySelector('[data-portal-directory]')).toBeNull();
    const back = win()!.querySelector<HTMLButtonElement>('[data-dialog-initial]')!;
    expect(back.textContent).toBe('← ポータルへ戻る');
    await click(back);
    await waitForElement(() => container.querySelector('[data-portal-directory="partner"]'), 'パートナーの一覧へ戻る');
    expect(win()!.getAttribute('data-village-window')).toBe('portal');
    // 一覧の「閉じる」は村へ戻す。
    const close = win()!.querySelector<HTMLButtonElement>('[data-dialog-initial]')!;
    expect(close.textContent).toBe('閉じる ✕');
    await click(close);
    expect(win()).toBeNull();
  });

  it('★ 社内の一覧から開いた画面も、閉じると一覧へ戻る', async () => {
    await mount('#village');
    await openDirectory();
    await click(container.querySelector<HTMLButtonElement>('[data-portal-screen="settings"]')!);
    await settleUntil(() => win()?.getAttribute('data-village-window') === 'settings', '役場の窓');
    expect(win()!.getAttribute('aria-label')).toBe('役場');
    await click(win()!.querySelector<HTMLButtonElement>('[data-dialog-initial]')!);
    await waitForElement(() => container.querySelector('[data-portal-directory="internal"]'), '社内の一覧へ戻る');
  });

  it('★ Esc で一覧が閉じ、焦点はポータルのボタンへ戻る', async () => {
    await mount('#village');
    const btn = await openDirectory();
    await act(async () => {
      win()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(win()).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  it('★ 役場のボタンは今までどおり (ポータルを経由しないので「閉じる」で村へ戻る)', async () => {
    await mount('#village');
    const hall = await waitForElement(() => container.querySelector<HTMLButtonElement>('[data-village-hall-open]'), '役場のボタン');
    await click(hall);
    await settleUntil(() => win()?.getAttribute('data-village-window') === 'settings', '役場の窓');
    const close = win()!.querySelector<HTMLButtonElement>('[data-dialog-initial]')!;
    expect(close.textContent).toBe('閉じる ✕');
    await click(close);
    expect(win()).toBeNull();
  });
});

describe('ポータルの直リンク (#portal/<id>)', () => {
  it('★ #portal/customer で開くと、カスタマーポータルの一覧が出る', async () => {
    await mount('#portal/customer');
    await waitForElement(() => container.querySelector('[data-portal-directory="customer"]'), 'カスタマーの一覧');
    expect(win()!.getAttribute('aria-label')).toBe('カスタマーポータル');
    expect(screenIds()).toEqual(CUSTOMER_SCREENS.map((s) => s.id));
  });

  it('★ 知らないポータル (#portal/admin) は開かない', async () => {
    await mount('#portal/admin');
    expect(win()).toBeNull();
    expect(container.querySelector('[data-portal-directory]')).toBeNull();
  });

  it('★ hashchange で切り替わる (戻る / 進む)', async () => {
    await mount('#village');
    await act(async () => {
      window.location.hash = '#portal/partner';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitForElement(() => container.querySelector('[data-portal-directory="partner"]'), 'パートナーの一覧');
    await act(async () => {
      window.location.hash = '#village';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await settleUntil(() => win() === null, '村へ戻る');
  });
});

describe('ポータルの入口 (既定のサイドバーの画面)', () => {
  const h1 = (): string => container.querySelector('.topbar h1')?.textContent ?? '';
  const activeItem = (): string | null => container.querySelector('.sidebar-nav .sidebar-item.active')?.getAttribute('data-service-id') ?? null;

  async function openLegacyDirectory(): Promise<HTMLButtonElement> {
    const btn = await waitForElement(() => container.querySelector<HTMLButtonElement>('.sidebar [data-portal-open]'), 'サイドバーのポータル');
    await click(btn);
    await waitForElement(() => container.querySelector('.content [data-portal-directory]'), 'ポータルの一覧');
    return btn;
  }

  it('★ サイドバーの「ポータル」を押すと、画面の場所に社内ポータルの一覧が出る (サイドバーは残る)', async () => {
    await mountLegacy('#home');
    expect(container.querySelector('[data-village-shell]')).toBeNull();
    expect(h1()).toBe('ホーム');
    const btn = await openLegacyDirectory();
    expect(h1()).toBe('社内ポータル');
    expect(btn.getAttribute('aria-current')).toBe('page');
    expect(container.querySelector('.content [data-portal-directory]')!.getAttribute('data-portal-directory')).toBe('internal');
    expect(screenIds().slice().sort()).toEqual(SERVICES.map((s) => s.id).sort());
    // サイドバーのサービスの一覧は消えない。
    expect(container.querySelectorAll('.sidebar-nav .sidebar-item').length).toBeGreaterThan(10);
    // お気に入りの ♡ は画面に付く物なので、一覧のあいだは出さない。
    expect(container.querySelector('.topbar .topbar-fav')).toBeNull();
    expect(location.hash).toBe('#portal/internal');
  });

  it('★ パートナー / カスタマーへ切り替えると、台帳の画面だけが並ぶ', async () => {
    await mountLegacy('#home');
    await openLegacyDirectory();
    await selectPortal('partner');
    expect(h1()).toBe('パートナーポータル');
    expect(screenIds()).toEqual(PARTNER_SCREENS.map((s) => s.id));
    expect(location.hash).toBe('#portal/partner');
    await selectPortal('customer');
    expect(h1()).toBe('カスタマーポータル');
    expect(screenIds()).toEqual(CUSTOMER_SCREENS.map((s) => s.id));
    await click(container.querySelector<HTMLButtonElement>('[data-portal-screen="notices"]')!);
    const page = await waitForElement(() => container.querySelector<HTMLElement>('[data-portal-preview] [data-portal-published="notices"]'), 'お知らせの頁');
    expect(page.querySelectorAll('[data-portal-notice]').length).toBe(CUSTOMER_CONTENT.notices.length);
  });

  it('★ 一覧から画面を選ぶと、一覧を閉じてその画面へ移る (サイドバーもその画面を指す)', async () => {
    await mountLegacy('#home');
    const btn = await openLegacyDirectory();
    await selectPortal('partner');
    await click(container.querySelector<HTMLButtonElement>('[data-portal-screen="compliance"]')!);
    await settleUntil(() => container.querySelector('.content [data-portal-directory]') === null, '一覧が閉じる');
    expect(h1()).toBe(SERVICES.find((s) => s.id === 'compliance')!.label);
    expect(activeItem()).toBe('compliance');
    expect(btn.getAttribute('aria-current')).toBeNull();
    expect(location.hash).toBe('#compliance');
    expect(container.querySelector('.topbar .topbar-fav')).not.toBeNull();
  });

  it('★ 一覧を開いたままサイドバーの画面 (いま開いている画面も) を押すと、一覧が閉じる', async () => {
    await mountLegacy('#home');
    await openLegacyDirectory();
    await click(container.querySelector<HTMLButtonElement>('.sidebar-nav .sidebar-item[data-service-id="home"]')!);
    await settleUntil(() => container.querySelector('.content [data-portal-directory]') === null, '一覧が閉じる');
    expect(h1()).toBe('ホーム');
    expect(location.hash).toBe('#home');
  });

  it('★ #portal/partner の直リンクで一覧から始まり、知らないポータルでは始まらない', async () => {
    await mountLegacy('#portal/partner');
    await waitForElement(() => container.querySelector('.content [data-portal-directory="partner"]'), 'パートナーの一覧');
    expect(h1()).toBe('パートナーポータル');
    await act(async () => { root!.unmount(); });
    container.remove();
    root = null;
    await mountLegacy('#portal/admin');
    expect(container.querySelector('[data-portal-directory]')).toBeNull();
    expect(h1()).toBe('ホーム');
  });

  it('★ 画面を選んだ直後の「開いて」は消えない: 遅れて届いた自分の書き込みの反響は、状態を動かさない', async () => {
    await mountLegacy('#compliance');
    await click(await waitForElement(() => container.querySelector<HTMLButtonElement>('.sidebar-nav .sidebar-item[data-service-id="home"]'), 'サイドバーの項目'));
    await settleUntil(() => location.hash === '#home', 'ハッシュが画面を指す');
    // 反響 (#home の hashchange) が届く前に、会話の「開いて」が来る。
    await act(async () => {
      navigateTo('docstudio');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await settleUntil(() => activeItem() === 'docstudio', '書類スタジオへ移る');
    expect(h1()).toBe(SERVICES.find((s) => s.id === 'docstudio')!.label);
    expect(location.hash).toBe('#docstudio');
  });

  it('★ hashchange: ポータル → 画面 → ポータル (戻る / 進む)', async () => {
    await mountLegacy('#home');
    await act(async () => {
      window.location.hash = '#portal/customer';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitForElement(() => container.querySelector('.content [data-portal-directory="customer"]'), 'カスタマーの一覧');
    await act(async () => {
      window.location.hash = '#home';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await settleUntil(() => container.querySelector('.content [data-portal-directory]') === null, '画面へ戻る');
    expect(h1()).toBe('ホーム');
  });
});

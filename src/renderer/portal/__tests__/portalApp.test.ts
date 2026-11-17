/** @vitest-environment jsdom */
/**
 * 社外向けポータルの殻 (`portal/PortalApp.tsx`) と、入力を消す口 (`portal/PortalEraseHatch.tsx`) · 2026-11-11。
 *
 * - 並ぶのは台帳 `shared/portal.mamori` に名指しした画面**だけ** (社内の画面は 1 つも出ない)。
 * - 画面を開く道は関門を通る —— 上の並びも URL のハッシュも。社内の画面の id を打っても今の画面のまま。
 * - 表 (`pages`) に無い画面は「入っていません」と述べる。
 * - 消す口はこのポータルの鍵だけを消し、やめれば何も消さず、消せなければそう言う。
 *
 * 待ちは条件で取る (固定回数で待たない)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import path from 'node:path';

import { CUSTOMER_SCREENS, PARTNER_SCREENS } from '../../../shared/portal';
import { SERVICE_IDS } from '../../../shared/serviceId';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';
import { PortalApp } from '../PortalApp';
import { CUSTOMER_CONTENT, PARTNER_CONTENT } from '../portalContent';
import { erasePortalDrafts, PORTAL_ERASE_CONFIRM, PORTAL_ERASE_FAILED, PortalEraseHatch } from '../PortalEraseHatch';
import type { PortalPageRegistry } from '../PortalScreenView';
import type { ExternalPortalId } from '../portalShim';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = null;
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  window.history.replaceState(null, '', '/?ui=legacy');
});

function Stub(name: string) {
  return function StubPage() {
    return createElement('div', { 'data-stub-page': name }, `${name} の画面`);
  };
}

const PARTNER_PAGES: PortalPageRegistry = { docstudio: Stub('docstudio'), compliance: Stub('compliance') };

async function mount(portal: ExternalPortalId, pages: PortalPageRegistry, hash = '', footer?: ReactNode): Promise<void> {
  window.history.replaceState(null, '', '/' + hash);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(PortalApp, { portal, pages, footer })); });
  await waitForElement(() => container.querySelector(`[data-portal-app="${portal}"]`), 'ポータルの殻');
}

const navIds = (): string[] =>
  [...container.querySelectorAll('[data-portal-nav]')].map((b) => b.getAttribute('data-portal-nav') ?? '');
const currentNav = (): string | null =>
  container.querySelector('[data-portal-nav][aria-current="page"]')?.getAttribute('data-portal-nav') ?? null;

async function clickNav(id: string): Promise<void> {
  const b = container.querySelector<HTMLButtonElement>(`[data-portal-nav="${id}"]`);
  if (!b) throw new Error(`nav が無い: ${id}`);
  await act(async () => { b.click(); });
}

async function goHash(hash: string): Promise<void> {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('パートナーポータルの殻', () => {
  it('★ 並ぶのは台帳の画面ちょうど —— 社内の画面は 1 つも並ばない', async () => {
    await mount('partner', PARTNER_PAGES);
    expect(navIds()).toEqual(PARTNER_SCREENS.map((s) => s.id));
    const ledger = new Set(PARTNER_SCREENS.map((s) => s.id));
    const internalOnly = SERVICE_IDS.filter((id) => !ledger.has(id));
    expect(internalOnly.length).toBeGreaterThan(70);
    for (const id of internalOnly) expect(container.querySelector(`[data-portal-nav="${id}"]`), id).toBeNull();
  });

  it('見出しはポータルの名前と会社の名前、題は「名前 — 会社」', async () => {
    await mount('partner', PARTNER_PAGES);
    expect(container.querySelector('h1')?.textContent).toBe('パートナーポータル');
    expect(container.querySelector('[data-portal-company]')?.textContent).toBe(PARTNER_CONTENT.company);
    await settleUntil(() => document.title === 'パートナーポータル — ' + PARTNER_CONTENT.company, '題');
  });

  it('最初に開くのは台帳の先頭 (お知らせ・取引ガイドライン)。見本の札が出る', async () => {
    await mount('partner', PARTNER_PAGES);
    expect(currentNav()).toBe('guidelines');
    expect(container.querySelector('[data-portal-published="guidelines"]')).not.toBeNull();
    expect(container.querySelector('[data-portal-sample]')?.textContent).toContain('見本');
    expect(container.querySelector('[data-portal-screen-title]')?.textContent).toBe('お知らせ・取引ガイドライン');
    await settleUntil(() => window.location.hash === '#guidelines', 'ハッシュ');
  });

  it('並びを押すと、その画面 (表の部品) が開き、ハッシュが付いていく', async () => {
    await mount('partner', PARTNER_PAGES);
    await clickNav('docstudio');
    await waitForElement(() => container.querySelector('[data-stub-page="docstudio"]'), '書類スタジオ');
    expect(currentNav()).toBe('docstudio');
    await settleUntil(() => window.location.hash === '#docstudio', 'ハッシュ');
    await clickNav('compliance');
    await waitForElement(() => container.querySelector('[data-stub-page="compliance"]'), 'コンプライアンス');
    expect(container.querySelector('[data-stub-page="docstudio"]')).toBeNull();
  });

  it('直リンク (#compliance / #/compliance) で開く', async () => {
    await mount('partner', PARTNER_PAGES, '#compliance');
    expect(currentNav()).toBe('compliance');
    expect(container.querySelector('[data-stub-page="compliance"]')).not.toBeNull();
    await goHash('#/docstudio');
    await waitForElement(() => container.querySelector('[data-stub-page="docstudio"]'), '書類スタジオ');
  });

  it('★ 社内の画面の id をハッシュに打っても開かない (今の画面のまま) —— 総当たり', async () => {
    await mount('partner', PARTNER_PAGES, '#docstudio');
    const ledger = new Set(PARTNER_SCREENS.map((s) => s.id));
    for (const id of SERVICE_IDS.filter((s) => !ledger.has(s))) {
      await goHash('#' + id);
      expect(currentNav(), id).toBe('docstudio');
      expect(container.querySelector('[data-stub-page="docstudio"]'), id).not.toBeNull();
    }
    // 別のポータルの画面・知らない綴り・ポータルの一覧の直リンクも同じ
    for (const h of ['#faq', '#contact', '#portal/internal', '#settings', '#../docstudio', '#DOCSTUDIO', '#']) {
      await goHash(h);
      expect(currentNav(), h).toBe('docstudio');
    }
    // 対照: 台帳の画面は開く (ハッシュの道そのものは生きている)
    await goHash('#compliance');
    await waitForElement(() => container.querySelector('[data-stub-page="compliance"]'), 'コンプライアンス');
  });

  it('★ 最初のハッシュが社内の画面なら、台帳の先頭を開く', async () => {
    await mount('partner', PARTNER_PAGES, '#settings');
    expect(currentNav()).toBe('guidelines');
    await mountAgain('#tax');
    expect(currentNav()).toBe('guidelines');
  });

  it('表に無い画面は「入っていません」と述べる (関門が通しても、入っていない物は開けない)', async () => {
    await mount('partner', { compliance: Stub('compliance') }, '#docstudio');
    expect(container.querySelector('[data-portal-missing="docstudio"]')?.textContent).toBe(
      'この画面はこのポータルに入っていません。',
    );
  });

  it('下の但し書きは「端末の中だけで動く・自動で送らない」を会社の名前つきで言い、footer を描く', async () => {
    await mount('partner', PARTNER_PAGES, '', createElement('span', { 'data-footer-probe': '' }, 'x'));
    const note = container.querySelector('[data-portal-footnote]')?.textContent ?? '';
    expect(note).toContain('お使いの端末の中だけで動きます');
    expect(note).toContain(PARTNER_CONTENT.company + ' へ自動で送られることはありません');
    expect(container.querySelector('[data-footer-probe]')).not.toBeNull();
  });
});

async function mountAgain(hash: string): Promise<void> {
  await act(async () => { root!.unmount(); });
  container.remove();
  await mount('partner', PARTNER_PAGES, hash);
}

describe('カスタマーポータルの殻', () => {
  it('★ 並ぶのは台帳の 4 頁ちょうどで、どれも掲載情報の頁 (アプリの画面は無い)', async () => {
    await mount('customer', {});
    expect(navIds()).toEqual(CUSTOMER_SCREENS.map((s) => s.id));
    expect(container.querySelector('h1')?.textContent).toBe('カスタマーポータル');
    expect(container.querySelector('[data-portal-company]')?.textContent).toBe(CUSTOMER_CONTENT.company);
    for (const s of CUSTOMER_SCREENS) {
      await clickNav(s.id);
      await waitForElement(() => container.querySelector(`[data-portal-published="${s.id}"]`), s.label);
      expect(container.querySelector('[data-portal-missing]')).toBeNull();
    }
  });

  it('入力欄・フォーム・ボタン以外の操作子を持たない (問い合わせは送らない)', async () => {
    await mount('customer', {}, '#contact');
    expect(container.querySelectorAll('input, textarea, select, form').length).toBe(0);
    expect(container.textContent).toContain('このポータルから問い合わせを送ることはできません');
    expect(container.textContent).toContain(CUSTOMER_CONTENT.contact.email);
  });

  it('★ パートナーの画面・社内の画面のハッシュは開かない', async () => {
    await mount('customer', {}, '#faq');
    for (const h of ['#docstudio', '#compliance', '#guidelines', '#settings', '#overview']) {
      await goHash(h);
      expect(currentNav(), h).toBe('faq');
    }
  });

  it('資料のリンクは http / https だけが押せる形になり、置き場所の無い資料は「窓口へ」と述べる', async () => {
    await mount('customer', {}, '#manuals');
    const links = [...container.querySelectorAll('[data-portal-manual] a')];
    expect(links.length).toBe(CUSTOMER_CONTENT.manuals.filter((m) => m.url !== null).length);
    for (const a of links) expect(a.getAttribute('href') ?? '').toMatch(/^https:\/\//);
    expect(container.textContent).toContain('この資料は窓口へご請求ください');
  });
});

describe('この端末に残した入力を消す口', () => {
  const KEY = 'servicehub.docstudio.v1';

  async function mountHatch(reload: () => void): Promise<HTMLButtonElement> {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root!.render(createElement(PortalEraseHatch, { reload })); });
    return waitForElement(() => container.querySelector<HTMLButtonElement>('[data-portal-erase] button'), '消す口');
  }

  it('★ 鍵の綴りは、書類スタジオが書く鍵と同じ (食い違うと、消したつもりで残る)', () => {
    const page = readOriginalSource(path.join(REPO, 'src/renderer/pages/DocstudioPage.tsx'));
    const hatch = readOriginalSource(path.join(REPO, 'src/renderer/portal/PortalEraseHatch.tsx'));
    expect(page).toContain(`const LS_KEY = '${KEY}';`);
    expect(hatch).toContain(`const DOCSTUDIO_DRAFT_KEY = '${KEY}';`);
  });

  it('★ 押して確かめると、その鍵だけが消え、頁を読み直す (他の鍵には触らない)', async () => {
    window.localStorage.setItem(KEY, '{"docs":{}}');
    window.localStorage.setItem('servicehub.theme', 'dark');
    window.localStorage.setItem('unrelated', 'keep');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const reload = vi.fn();
    const button = await mountHatch(reload);
    await act(async () => { button.click(); });
    expect(confirm).toHaveBeenCalledWith(PORTAL_ERASE_CONFIRM);
    expect(PORTAL_ERASE_CONFIRM).toContain('元に戻せません');
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(window.localStorage.getItem('servicehub.theme')).toBe('dark');
    expect(window.localStorage.getItem('unrelated')).toBe('keep');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('やめたら何も消さず、読み直しもしない', async () => {
    window.localStorage.setItem(KEY, '{"docs":{}}');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const reload = vi.fn();
    const button = await mountHatch(reload);
    await act(async () => { button.click(); });
    expect(window.localStorage.getItem(KEY)).toBe('{"docs":{}}');
    expect(reload).not.toHaveBeenCalled();
  });

  it('★ 消せなければ「消せませんでした」と言い、読み直さない (消えたふりをしない)', async () => {
    window.localStorage.setItem(KEY, '{"docs":{}}');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const reload = vi.fn();
    const button = await mountHatch(reload);
    await act(async () => { button.click(); });
    await waitForElement(() => container.querySelector('[role="alert"]'), '断り');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(PORTAL_ERASE_FAILED);
    expect(reload).not.toHaveBeenCalled();
    expect(erasePortalDrafts()).toBe(false);
  });

  it('★ 消したと答えるのは、読み直して無いと確かめたときだけ (removeItem が黙って効かない端末)', () => {
    window.localStorage.setItem(KEY, '{"docs":{}}');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => undefined);
    expect(erasePortalDrafts()).toBe(false);
    vi.restoreAllMocks();
    expect(erasePortalDrafts()).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});

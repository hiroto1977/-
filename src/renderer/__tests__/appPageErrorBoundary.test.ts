/** @vitest-environment jsdom */
/**
 * App の配線: 画面の描画エラーはその画面の枠に閉じ、村 (殻) は生きたまま別の画面へ移れる (2026-09-05 · 村の殻へ 2026-11-04)。
 * 境界が無いと React はツリー全体を外す —— 保存値や API 応答の形違いで 1 回投げれば真っ白になっていた。
 * 「テンプレート」の画面を「必ず投げる画面」に差し替えて、会話が出す「開いて」(`servicehub:navigate`) で
 * 役場の窓に開き、App を丸ごと動かす。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../services', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services')>();
  const Boom = (): never => {
    throw new Error('この画面は必ず落ちる (検査用)');
  };
  return { ...mod, SERVICES: mod.SERVICES.map((s) => (s.id === 'templates' ? { ...s, page: Boom } : s)) };
});

import { App } from '../App';
import type { ServiceId } from '../../shared/serviceId';
import { SERVICES } from '../services';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetNavigationIntentForTests, navigateTo } from '../navigate';
import { resetRecordStore } from './recordStoreHarness';
import { waitForElement } from './jsdomWait';

const BROKEN = SERVICES.find((s) => s.id === 'templates')!;
const OTHER = SERVICES.find((s) => s.id === 'business')!;

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

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function open(id: ServiceId): Promise<void> {
  await act(async () => {
    navigateTo(id);
  });
  await settle();
}

const hall = () => container.querySelector('[data-village-hall]');

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  location.hash = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(App));
  });
  await settle();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
});

describe('App — 画面の描画エラーは枠に閉じる', () => {
  it('★ 落ちる画面を開くと、その窓の枠だけが文面になり、村は残り、別の画面へ移れる', async () => {
    expect(container.querySelector('[data-village-shell]'), '村の殻が出ていない').toBeTruthy();
    await open(BROKEN.id);
    const alert = await waitForElement(
      () => container.querySelector('[role="alert"][data-page-error]'),
      '画面の境界が出す報せ',
    );
    expect(alert?.getAttribute('data-page-error')).toBe(BROKEN.label);
    expect(alert?.textContent).toContain('この画面は必ず落ちる');
    expect(hall()?.contains(alert!), '報せは役場の窓の中に閉じる').toBe(true);
    expect(container.querySelector('[data-village-shell]'), '落ちた後も村は残る').toBeTruthy();
    // 別の画面へ移れば境界が張り直され、alert は消える
    await open(OTHER.id);
    expect(container.querySelector('[role="alert"][data-page-error]')).toBeNull();
    expect(hall()?.getAttribute('data-village-window')).toBe(OTHER.id);
  });

  it('対照: 普通の画面には alert が無い (この検査が本当に画面を見ている)', async () => {
    await open(OTHER.id);
    expect(container.querySelector('[role="alert"][data-page-error]')).toBeNull();
    expect(hall()?.getAttribute('data-village-window')).toBe(OTHER.id);
  });
});

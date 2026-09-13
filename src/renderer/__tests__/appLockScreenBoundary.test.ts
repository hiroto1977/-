/** @vitest-environment jsdom */
/**
 * ロック画面 (ブラウザ版の唯一の入口) の描画エラーも枠に閉じる (2026-09-05)。
 * 画面の境界 (`PageErrorBoundary`) は選んだ画面だけを包んでいたので、ロック画面が投げると
 * 真っ白のまま何もできなかった。ロック画面を必ず投げる物に差し替えて App を丸ごと動かす。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../security/LockScreen', () => ({
  LockScreen: (): never => {
    throw new Error('ロック画面が壊れている (検査用)');
  },
}));

import { App } from '../App';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'), // ブラウザ扱い → ロック画面へ
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  localStorage.clear();
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

describe('App — ロック画面の描画エラーも枠に閉じる', () => {
  it('★ ロック画面が投げても真っ白にならず、文面と「もう一度開く」が出る (ホームへ戻るは無い)', async () => {
    const alert = container.querySelector('[role="alert"][data-page-error]');
    expect(alert?.getAttribute('data-page-error')).toBe('ロック画面');
    expect(alert?.textContent).toContain('ロック画面が壊れている');
    const buttons = Array.from(alert!.querySelectorAll('button')).map((b) => b.textContent);
    expect(buttons).toEqual(['もう一度開く']);
  });
});

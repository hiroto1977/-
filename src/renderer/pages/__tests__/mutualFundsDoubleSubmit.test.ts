/** @vitest-environment jsdom */
/**
 * **ダブルクリックで同じ銘柄を 2 件保存しない。** (2026-09-09 · パス 124)
 *
 * 追加ボタンの handler は `await addHolding(parsed)` の後でしかフォームを空にしない。
 * `RecordStore.insert` は暗号化と IndexedDB を await し、毎回新しい id を振るので、
 * その間にもう 1 度押すと**同じ入力から 2 件**が保存され、評価額の合計に 2 度入る。
 * `useSubmitGuard` が 2 度目を落とし、押している間はボタンを disabled にする。
 *
 * ここは実物の画面で、同じ tick に 2 度クリックして**保存された件数**を数える。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MutualFundsPage } from '../MutualFundsPage';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { HOLDINGS_COLLECTION } from '../../data/investments';

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(MutualFundsPage));
  });
  await settle();
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function byPlaceholder(placeholder: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
  if (!el) throw new Error(`input placeholder="${placeholder}" not found`);
  return el;
}

function addButton(): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('＋ 銘柄を追加'));
  if (!button) throw new Error('add button not found');
  return button;
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  container = document.createElement('div');
  document.body.appendChild(container);
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

describe('投資信託 — 追加ボタンの二重送信', () => {
  it('★ 同じ tick に 2 度押しても、保存される銘柄は 1 件', async () => {
    await mount();
    await act(async () => {
      changeInput(byPlaceholder('例: ニッセイ外国株式'), '二度押しファンド');
      changeInput(byPlaceholder('空欄=自動計算'), '300000');
    });
    await act(async () => {
      const b = addButton();
      b.click();
      b.click();
    });
    await settle();
    const rows = await getRecordStore().list(HOLDINGS_COLLECTION);
    expect(rows.length).toBe(1);
    expect((container.textContent ?? '').match(/二度押しファンド/g)?.length ?? 0).toBe(1);
  });

  it('対照: 間を置いて 2 度足せば 2 件 (関門は同時だけを止める)', async () => {
    await mount();
    for (const name of ['一件目', '二件目']) {
      await act(async () => {
        changeInput(byPlaceholder('例: ニッセイ外国株式'), name);
        changeInput(byPlaceholder('空欄=自動計算'), '300000');
      });
      await act(async () => {
        addButton().click();
      });
      await settle();
    }
    expect((await getRecordStore().list(HOLDINGS_COLLECTION)).length).toBe(2);
  });
});

/** @vitest-environment jsdom */
/**
 * **同じ注文名の Shopify 注文を 2 度記録しない。** (2026-09-09 · パス 126)
 *
 * Shopify の画面は注文名と金額から売上集計へ 1 件を書くが、同じ注文名を 2 度記録しても断らず、
 * 売上高と受注件数に 2 度数えられていた (書面 §2 まで届く)。注文名は 1 注文に 1 つなので、
 * 既に在れば断り、訂正の道 (売上集計の × で消してから) を言う。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ShopifyPage } from '../ShopifyPage';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { SALES_COLLECTION, type SalesEntry } from '../../data/sales';
import { settleUntil, settleUntilAsync, waitForText } from '../../__tests__/jsdomWait';

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

let container: HTMLDivElement;
let root: Root | null = null;

/**
 * 記録の欄が出るまで**条件で**待って描く (2026-09-21 · パス 380)。
 *
 * ここは 2026-09-21 まで固定 8 周の `settle()` だった —— 周回数を 0 にすると
 * 対照 (4 件記録する側) が落ちる (`npm run audit:tick-sensitivity` の実測)。
 */
async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ShopifyPage));
  });
  await settleUntil(
    () => container.querySelector('input[placeholder="注文名 (#1001)"]') !== null,
    '注文名の欄が出る',
  );
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

async function record(name: string, total: string): Promise<void> {
  await act(async () => {
    changeInput(byPlaceholder('注文名 (#1001)'), name);
    changeInput(byPlaceholder('金額 (¥12,000)'), total);
  });
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '売上集計に記録');
  if (!button) throw new Error('record button not found');
  await act(async () => {
    button.click();
  });
}

/**
 * 売上集計が `n` 件になるまで待つ。
 *
 * **増える向きにだけ使う** —— 断られる側 (件数が変わらない) は、これではなく
 * 断りの文を待ってから件数を聞く 2 段にする (`settleUntilAsync` の docblock)。
 */
async function waitForSales(n: number): Promise<void> {
  await settleUntilAsync(async () => (await sales()).length === n, `売上集計が ${n} 件になる`);
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

async function sales(): Promise<SalesEntry[]> {
  return (await getRecordStore().list<SalesEntry>(SALES_COLLECTION)).map((r) => r.data);
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

describe('Shopify — 同じ注文名を 2 度記録しない', () => {
  it('★ 同じ注文名の 2 度目は断られ、売上集計は 1 件のまま (訂正の案内つき)', async () => {
    await mount();
    await record('#1001', '¥12,000');
    await waitForText(text, '売上集計に記録しました');
    await waitForSales(1);
    expect(await sales()).toHaveLength(1);
    await record(' #1001 ', '¥15,000');
    // **断りが出たことを先に待つ。** 「件数が増えていない」は押した直後なら
    // 何も起きていなくても当たる (パス 377〜379 と同じ 2 段)。
    await waitForText(text, 'Shopify #1001 は既に売上集計に記録されています');
    await waitForText(text, '売上集計の一覧の × で消してから記録し直してください');
    expect(await sales()).toHaveLength(1);
  });

  it('対照: 別の注文名なら通り、注文名の無い記録は判定しない', async () => {
    await mount();
    await record('#1001', '¥12,000');
    await waitForSales(1);
    await record('#1002', '¥12,000');
    await waitForSales(2);
    expect(await sales()).toHaveLength(2);
    await record('', '¥3,000');
    await waitForSales(3);
    await record('', '¥3,000');
    await waitForSales(4);
    expect(await sales()).toHaveLength(4);
    expect(text()).not.toContain('既に売上集計に記録されています');
  });
});

/** @vitest-environment jsdom */
/**
 * **Shopify の画面 —— 注文を記録する欄に名前が在り、何を記録したかを言う。** (2026-11-20)
 *
 * 売上集計・KPI / BEP・チームと同じ直し方。直す前:
 *   - 欄の名前は欄の中の薄い字だけ (打つと消える)。日付は「YYYY-MM-DD (任意)」と書かれた文字の欄
 *   - 記録した知らせは金額だけを言い、どの日付で入ったか (空なら今日) は言わなかった
 *
 * 直した後:
 *   - 欄ごとに名前 (欄の上)。注文日は日付を選ぶ欄・金額は数字のキーボード
 *   - 記録すると、入った日付・注文名・金額を 1 行で言う
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ShopifyPage } from '../ShopifyPage';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { SALES_COLLECTION, type SalesEntry } from '../../data/sales';
import { localIsoDate } from '../../../shared/localDate';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';

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

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

const sales = async (): Promise<SalesEntry[]> =>
  (await getRecordStore().list<SalesEntry>(SALES_COLLECTION)).map((r) => r.data);

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ShopifyPage));
  });
  await waitForElement(() => container.querySelector('[data-shopify-form]'), '注文を記録する欄');
}

const form = (): Element => {
  const el = container.querySelector('[data-shopify-form]');
  if (!el) throw new Error('注文を記録する欄が無い');
  return el;
};

const labels = (): string[] =>
  Array.from(form().querySelectorAll('label')).map((l) => (l.querySelector('span')?.textContent ?? '').trim());

function field(label: string): HTMLInputElement {
  const hit = Array.from(form().querySelectorAll('label')).find(
    (l) => (l.querySelector('span')?.textContent ?? '').trim() === label,
  );
  const control = hit?.querySelector('input');
  if (!control) throw new Error(`名前「${label}」の欄が無い (在るのは ${labels().join(' / ')})`);
  return control;
}

function typeInto(el: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function pressRecord(): Promise<void> {
  const b = Array.from(container.querySelectorAll('button')).find((x) => (x.textContent ?? '').trim() === '売上集計に記録');
  if (!b) throw new Error('「売上集計に記録」が無い');
  await act(async () => {
    b.click();
  });
}

const notice = (): string => (container.querySelector('[data-shopify-notice]')?.textContent ?? '').trim();

describe('Shopify — 注文を記録する欄の名前と形', () => {
  it('★ 欄は 3 つとも名前を持つ (欄の上に出る)', async () => {
    await mount();
    expect(labels()).toEqual(['注文日 (空なら今日)', '注文名', '金額 (円)']);
  });

  it('★ 注文日は日付を選ぶ欄・金額は数字のキーボードを出す', async () => {
    await mount();
    expect(field('注文日 (空なら今日)').type).toBe('date');
    expect(field('金額 (円)').getAttribute('inputmode')).toBe('numeric');
    expect(field('注文名').type).toBe('text');
  });
});

describe('Shopify — 記録した知らせ', () => {
  it('★ 記録すると、入った日付・注文名・金額を 1 行で言う (日付が空なら今日)', async () => {
    await mount();
    typeInto(field('注文名'), '#1001');
    typeInto(field('金額 (円)'), '12000');
    await pressRecord();
    await settleUntil(() => notice() !== '', '記録した知らせ');
    expect(notice()).toBe(`売上集計に記録しました: ${localIsoDate()} · Shopify #1001 · 12,000 円。KPI にも反映されます。`);
    expect(await sales()).toHaveLength(1);
    // 注文名と金額の欄は空に戻る (次の注文を打てる)。
    expect(field('注文名').value).toBe('');
    expect(field('金額 (円)').value).toBe('');
  });

  it('★ 日付を選んだら、その日付で入り、知らせもその日付を言う', async () => {
    await mount();
    typeInto(field('注文日 (空なら今日)'), '2026-08-01');
    typeInto(field('注文名'), '#1002');
    typeInto(field('金額 (円)'), '¥3,000');
    await pressRecord();
    await settleUntil(() => notice() !== '', '記録した知らせ');
    expect(notice()).toBe('売上集計に記録しました: 2026-08-01 · Shopify #1002 · 3,000 円。KPI にも反映されます。');
    expect((await sales())[0]?.date).toBe('2026-08-01');
  });

  it('★ 断られたとき (金額が読めない) は「記録しました」と言わない', async () => {
    await mount();
    typeInto(field('注文名'), '#1003');
    typeInto(field('金額 (円)'), 'abc');
    await pressRecord();
    await waitForText(text, '金額を正しく入力してください');
    expect(notice()).toBe('');
    expect(await sales()).toEqual([]);
  });
});

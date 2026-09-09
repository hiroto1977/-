/** @vitest-environment jsdom */
/**
 * **同じ CSV を 2 度読まない・同じ注文名の重複を言う。** (2026-09-09 · パス 126)
 *
 * 売上集計の CSV 取り込みは既存の記録と照合せず `addMany` していたので、同じファイルを 2 度読むと
 * 売上高と受注件数が 2 倍になり、金融機関等提出用の書面 §2「売上高（販売記録）」まで届いた。
 * 行の内容は「断る鍵」にはならない (同じ日に同じ額の別の注文はありうる) ので、**全行が既存と同じ**
 * ときだけ「同じファイルを 2 度読んだ」として断り、一部が同じなら取り込んで件数を言う。
 *
 * ここは実物の画面で 3 面を読む: 全行同じ CSV は断られ件数が増えない・一部同じ CSV は取り込まれ
 * 件数を言う・同じ注文名の記録が既に在れば一覧の上に警告が出る (対照: 無ければ出ない)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SalesPage } from '../SalesPage';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { SALES_COLLECTION, type SalesEntry } from '../../data/sales';
import { salesToCsv } from '../../data/salesCsv';

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
    root!.render(createElement(SalesPage));
  });
  await settle();
}

/** 本物の `File` を選んだことにする (`importSizeGuard.test.ts` と同じ形)。 */
async function pickCsv(content: string): Promise<void> {
  const file = new File([content], 'sales.csv');
  Object.defineProperty(file, 'text', { value: vi.fn(async () => content) });
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error('file input not found');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

const ROWS: SalesEntry[] = [
  { date: '2026-05-01', channel: 'amazon', amount: 200, orders: 2, note: 'セール' },
  { date: '2026-05-02', channel: 'shopify', amount: 300, orders: 1 },
];

async function countSales(): Promise<number> {
  return (await getRecordStore().list(SALES_COLLECTION)).length;
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

describe('売上集計 — 同じ CSV を 2 度読まない', () => {
  it('★ 全行が既存の記録と同じ内容の CSV は断られ、件数は増えない (手で足す道を言う)', async () => {
    for (const r of ROWS) await getRecordStore().insert(SALES_COLLECTION, r);
    await mount();
    expect(await countSales()).toBe(2);
    await pickCsv(salesToCsv(ROWS));
    expect(await countSales()).toBe(2);
    expect(text()).toContain('この CSV の 2 行はすべて既に取り込まれている記録と同じ内容');
    expect(text()).toContain('同じファイルを 2 度読んだと判断し、取り込みませんでした');
    expect(text()).not.toContain('件を取り込みました');
  });

  it('一部だけ同じ CSV は取り込まれ、同じ内容の件数を言う (同じ内容の別の売上はありうる)', async () => {
    for (const r of ROWS) await getRecordStore().insert(SALES_COLLECTION, r);
    await mount();
    await pickCsv(salesToCsv([ROWS[0]!, { date: '2026-05-03', channel: 'rakuten', amount: 400, orders: 1 }]));
    expect(await countSales()).toBe(4);
    expect(text()).toContain('2 件を取り込みました');
    expect(text()).toContain('うち 1 件は既存の記録と同じ内容です');
  });

  it('対照: 既存と重ならない CSV は従来どおり (件数の断りは無い)', async () => {
    for (const r of ROWS) await getRecordStore().insert(SALES_COLLECTION, r);
    await mount();
    await pickCsv(salesToCsv([{ date: '2026-05-03', channel: 'rakuten', amount: 400, orders: 1 }]));
    expect(await countSales()).toBe(3);
    expect(text()).toContain('1 件を取り込みました');
    expect(text()).not.toContain('既存の記録と同じ内容');
  });
});

describe('売上集計 — 同じ注文名の重複の警告', () => {
  it('★ 同じ注文名 (Shopify #1001) の記録が 2 件あれば、一覧の上で「2 度数えられている」と警告する', async () => {
    await getRecordStore().insert(SALES_COLLECTION, { date: '2026-05-01', channel: 'shopify', amount: 12000, orders: 1, note: 'Shopify #1001' });
    await getRecordStore().insert(SALES_COLLECTION, { date: '2026-05-02', channel: 'shopify', amount: 12000, orders: 1, note: 'Shopify #1001' });
    await mount();
    const alert = Array.from(container.querySelectorAll('[role="alert"]')).find((el) => (el.textContent ?? '').includes('重複'));
    expect(alert, 'role="alert" に重複の警告が無い').toBeDefined();
    const t = (alert!.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).toContain('同じ注文名の記録が 1 組重複しており、売上高と受注件数に 2 度数えられています');
    expect(t).toContain('Shopify #1001 ×2');
  });

  it('対照: 注文名が違えば警告は出ない (同じ日・同じ額でも)', async () => {
    await getRecordStore().insert(SALES_COLLECTION, { date: '2026-05-01', channel: 'shopify', amount: 12000, orders: 1, note: 'Shopify #1001' });
    await getRecordStore().insert(SALES_COLLECTION, { date: '2026-05-01', channel: 'shopify', amount: 12000, orders: 1, note: 'Shopify #1002' });
    await mount();
    expect(text()).not.toContain('重複');
  });
});

/** @vitest-environment jsdom */
/**
 * 取り込むファイルは**読む前に**大きさで断る —— 3 つの入口 (売上 CSV / KPI 実績 CSV /
 * バックアップの復元) の配線。実物の record store (fake-indexeddb) で画面を描き、
 * ファイル入力に「大きすぎる File」を渡す。`File` は本物だが `size` だけ偽装する
 * (数十 MB を実際には作らない)。**断ったなら `text()` は呼ばれていない**ことまで見る ——
 * 落ちるのは読む瞬間なので、読んでから断る配線は合格にならない。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SalesPage } from '../SalesPage';
import { KpiPage } from '../KpiPage';
import { BackupPanel } from '../../components/BackupPanel';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { SALES_COLLECTION } from '../../data/sales';
import { KPI_ACTUALS_COLLECTION } from '../../data/kpiActuals';
import { serializeBackup } from '../../data/backup';
import { MAX_BACKUP_IMPORT_BYTES, MAX_CSV_IMPORT_BYTES } from '../../data/importFile';

const MiB = 1024 * 1024;

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

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(component: ComponentType): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(component));
  });
  await settle();
}

async function unmount(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  // fake-indexeddb はテストをまたいで残る — 前のテストが入れたレコードを消す (overviewBankSheet と同じ)。
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
  await unmount();
  container.remove();
});

/** 本物の File。`size` だけ偽装でき、`text` は監視する (断ったなら呼ばれない)。 */
function fakeFile(content: string, name: string, size?: number): { file: File; text: ReturnType<typeof vi.fn> } {
  const file = new File([content], name);
  const text = vi.fn(async () => content);
  Object.defineProperty(file, 'text', { value: text });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return { file, text };
}

async function chooseFile(file: File): Promise<void> {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('file input missing');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

const SALES_CSV = 'date,channel,amount,orders,note\r\n2026-04-01,amazon,1000,1,x\r\n';
const KPI_CSV = 'period,unit,revenue,cogs,advertising,sga,depreciation\r\n2026-04,全社,1000,100,10,50,5\r\n';

describe('売上 CSV の取り込み', () => {
  it('★ 大きすぎる CSV は読まずに断り、何も取り込まない', async () => {
    await mount(SalesPage);
    const { file, text } = fakeFile(SALES_CSV, 'big.csv', 64 * MiB);
    await chooseFile(file);
    expect(container.textContent).toContain('CSV ファイルが大きすぎます (64.0 MB。上限 20.0 MB)');
    expect(text).not.toHaveBeenCalled();
    expect(await getRecordStore().count(SALES_COLLECTION)).toBe(0);
  });

  it('対照: 上限以下の CSV は読んで取り込む', async () => {
    await mount(SalesPage);
    const { file, text } = fakeFile(SALES_CSV, 'small.csv');
    await chooseFile(file);
    expect(text).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('1 件を取り込みました');
    expect(await getRecordStore().count(SALES_COLLECTION)).toBe(1);
  });
});

describe('KPI 実績 CSV の取り込み', () => {
  it('★ 大きすぎる CSV は読まずに断り、何も取り込まない', async () => {
    await mount(KpiPage);
    const { file, text } = fakeFile(KPI_CSV, 'big.csv', MAX_CSV_IMPORT_BYTES + 1);
    await chooseFile(file);
    expect(container.textContent).toContain('CSV ファイルが大きすぎます');
    expect(text).not.toHaveBeenCalled();
    expect(await getRecordStore().count(KPI_ACTUALS_COLLECTION)).toBe(0);
  });

  it('対照: 上限以下の CSV は読んで取り込む', async () => {
    await mount(KpiPage);
    const { file, text } = fakeFile(KPI_CSV, 'small.csv');
    await chooseFile(file);
    expect(text).toHaveBeenCalledTimes(1);
    expect(await getRecordStore().count(KPI_ACTUALS_COLLECTION)).toBe(1);
  });
});

describe('バックアップの復元', () => {
  it('★ 大きすぎるバックアップは読まずに断り、何も復元しない', async () => {
    await mount(BackupPanel);
    const { file, text } = fakeFile('{}', 'big.json', MAX_BACKUP_IMPORT_BYTES + 1);
    await chooseFile(file);
    expect(container.textContent).toContain('バックアップファイルが大きすぎます');
    expect(text).not.toHaveBeenCalled();
    expect(await getRecordStore().count(SALES_COLLECTION)).toBe(0);
  });

  it('対照: 上限以下のバックアップは読んで復元する', async () => {
    const backup = await serializeBackup([
      { id: 'r1', collection: SALES_COLLECTION, createdAt: 1, updatedAt: 1, data: { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1, note: '' } },
    ]);
    await mount(BackupPanel);
    const { file, text } = fakeFile(backup, 'backup.json');
    await chooseFile(file);
    expect(text).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('1 件のレコードを復元しました');
    expect(await getRecordStore().count(SALES_COLLECTION)).toBe(1);
  });
});

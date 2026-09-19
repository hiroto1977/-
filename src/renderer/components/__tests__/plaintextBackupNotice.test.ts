/** @vitest-environment jsdom */
/**
 * **平文バックアップは、個人情報の件数を言ってから書く。** (2026-09-09 · パス 130)
 *
 * 合言葉が空の書き出しは平文で、士業の連絡先の電話番号やメンバーのメールアドレスがそのまま入る。
 * 2026-09-09 まで画面は「（任意）」の欄を空のまま押せば黙って書いた。ここは実物の設定パネルで:
 * 個人情報の記録が在れば確認が件数を言い (★)、やめれば書かず、OK なら「平文」と言って書き、
 * 個人情報の記録が無ければ確認しない (対照)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BackupPanel } from '../BackupPanel';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { SALES_COLLECTION } from '../../data/sales';
import { SHIGYO_CONTACTS_COLLECTION } from '../../data/shigyoDirectory';

const originalConfirm = window.confirm;
let anchorClicks = 0;

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
  // jsdom には Blob URL が無い。書き出しは `a.click()` まで行くので、その手前を差し替える。
  const url = globalThis.URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
  url.createObjectURL = vi.fn(() => 'blob:service-hub-test');
  url.revokeObjectURL = vi.fn();
});

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(BackupPanel));
  });
  await settle();
}

/** 合言葉の欄には触らず (空のまま) 書き出す。 */
async function exportPlain(): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'バックアップを書き出す');
  if (!button) throw new Error('export button not found');
  await act(async () => {
    button.click();
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

const CONTACT = { serviceId: 'tax-accountant', name: 'テスト税理士', phone: '090-0000-0000' };
const SALE = { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1, note: '' };

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
  anchorClicks = 0;
  // jsdom は <a download> の click で航行しようとして警告を出す (中身は無い)。回数だけ数える。
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    anchorClicks += 1;
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  window.confirm = originalConfirm;
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
});

describe('バックアップ — 平文の書き出しは個人情報の件数を言ってから確認する', () => {
  it('★ 個人情報の記録が在れば、確認が件数と内訳を言い、やめれば書かない', async () => {
    await getRecordStore().insert(SHIGYO_CONTACTS_COLLECTION, CONTACT);
    await getRecordStore().insert(SALES_COLLECTION, SALE);
    const confirm = vi.fn((_message?: string) => false);
    window.confirm = confirm;
    await mount();
    await exportPlain();
    expect(confirm).toHaveBeenCalledTimes(1);
    const message = String(confirm.mock.calls[0]?.[0]);
    expect(message).toContain('平文 (暗号化なし) で書き出します');
    expect(message).toContain('個人情報を含む記録が 1 件入ります: 士業の連絡先 (電話番号・メールアドレス) 1 件。');
    expect(message).toContain('合言葉 (12 文字以上) を入れて暗号化してください');
    expect(text()).toContain('書き出しをやめました');
    expect(text()).not.toContain('件のレコードをバックアップしました');
    expect(anchorClicks).toBe(0);
  });

  it('対照: 確認で OK すれば平文で書き、結果の文が「平文」と言う', async () => {
    await getRecordStore().insert(SHIGYO_CONTACTS_COLLECTION, CONTACT);
    window.confirm = vi.fn((_message?: string) => true);
    await mount();
    await exportPlain();
    expect(text()).toContain('1 件のレコードをバックアップしました（平文）');
    expect(anchorClicks).toBe(1);
  });

  it('対照: 個人情報の記録が無ければ確認せず、そのまま平文で書く (売上だけの控えに合言葉を強いない)', async () => {
    await getRecordStore().insert(SALES_COLLECTION, SALE);
    const confirm = vi.fn((_message?: string) => false);
    window.confirm = confirm;
    await mount();
    await exportPlain();
    expect(confirm).not.toHaveBeenCalled();
    expect(text()).toContain('1 件のレコードをバックアップしました（平文）');
    expect(anchorClicks).toBe(1);
  });
});

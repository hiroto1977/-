/** @vitest-environment jsdom */
/**
 * 設定画面の「形式の合わないレコードの点検」—— 実物の record store で描き、調べる → 内訳 → 確認 → 削除 の配線。
 * 確認で「いいえ」なら何も消えない (対照)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RecordShapeAuditPanel } from '../RecordShapeAuditPanel';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { SALES_COLLECTION } from '../../data/sales';

const GOOD = { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1, note: '' };
const BAD = { date: '2026-04-02', channel: 'amazon', amount: 'abc', orders: 1, note: '' };

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  _resetRecordStoreForTests();
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
  container.remove();
  vi.restoreAllMocks();
});

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(RecordShapeAuditPanel));
  });
  await settle();
}

async function click(selector: string): Promise<void> {
  const el = container.querySelector(selector);
  if (!(el instanceof HTMLButtonElement)) throw new Error(`${selector} missing`);
  await act(async () => {
    el.click();
  });
  await settle();
}

describe('RecordShapeAuditPanel', () => {
  it('★ 調べる → 件数と内訳 → 確認して削除 → 合うレコードだけ残り、再点検は 0 件', async () => {
    const store = getRecordStore();
    await store.insert(SALES_COLLECTION, GOOD);
    await store.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount();
    expect(container.querySelector('[data-shape-audit-delete]')).toBeNull();
    await click('[data-shape-audit-scan]');
    expect(container.textContent).toContain('調べた 2 件のうち 1 件の形式が合いません (sales-entries 1 件)');
    await click('[data-shape-audit-delete]');
    expect(confirm).toHaveBeenCalledWith('形式の合わないレコード 1 件を削除します。元に戻せません。よろしいですか？');
    expect(container.textContent).toContain('1 件を削除しました');
    expect(container.textContent).toContain('調べた 1 件に形式の合わないレコードはありません');
    expect(container.querySelector('[data-shape-audit-delete]')).toBeNull();
    expect(await store.count(SALES_COLLECTION)).toBe(1);
  });

  it('対照: 確認で「いいえ」なら何も消えない', async () => {
    const store = getRecordStore();
    await store.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await mount();
    await click('[data-shape-audit-scan]');
    await click('[data-shape-audit-delete]');
    expect(container.textContent).not.toContain('削除しました');
    expect(container.textContent).toContain('1 件の形式が合いません');
    expect(await store.count(SALES_COLLECTION)).toBe(1);
  });

  it('対照: 合うレコードだけなら「ありません」で、削除ボタンは出ない', async () => {
    await getRecordStore().insert(SALES_COLLECTION, GOOD);
    await mount();
    await click('[data-shape-audit-scan]');
    expect(container.textContent).toContain('調べた 1 件に形式の合わないレコードはありません');
    expect(container.querySelector('[data-shape-audit-delete]')).toBeNull();
  });
});

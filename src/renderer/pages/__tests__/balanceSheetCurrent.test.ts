/** @vitest-environment jsdom */
/**
 * **貸借対照表の「現在」は基準日で決まり、画面はどの控えを使っているかを言う。** (2026-09-09 · パス 127)
 *
 * それまでは最後に入力した 1 件を「最新の BS」として、経営サマリー・書面 §4・計算書類の取り込みに
 * 渡していた。新しい基準日の控えを先に入れ、比較のために古い基準日の控えを後から入れると、古い方が
 * 「現在」になった —— 画面はどの控えを使っているかを言わず、消せるのは最後に入力した 1 件だけ。
 *
 * ここは実物の KPI 画面 (貸借対照表の節) で 3 面を読む: 指標は基準日の新しい控えから・一覧に「使用中」
 * が付く・後から古い基準日を入れると注記が出る (対照: 基準日の順に入れれば出ない)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { BALANCE_SHEET_COLLECTION, type BalanceSheet } from '../../data/balanceSheet';

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
  const def = SERVICES.find((s) => s.id === 'kpi');
  if (!def) throw new Error('kpi service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/** 純資産 = 流動資産 + 固定資産 − 流動負債 − 固定負債。自己資本比率 = 純資産 ÷ 総資産。 */
const NEW_BS: BalanceSheet = { asOf: '2026-03-31', currentAssets: 1_000_000, fixedAssets: 500_000, currentLiabilities: 300_000, fixedLiabilities: 200_000, netIncome: 0 }; // 純資産 1,000,000 / 総資産 1,500,000 → 66.7%
const OLD_BS: BalanceSheet = { asOf: '2025-03-31', currentAssets: 800_000, fixedAssets: 400_000, currentLiabilities: 500_000, fixedLiabilities: 400_000, netIncome: 0 }; // 純資産 300,000 / 総資産 1,200,000 → 25%

/** createdAt が同じ ms にならないように、挿入の間に 1 tick 置く。 */
async function insertInOrder(rows: readonly BalanceSheet[]): Promise<void> {
  for (const r of rows) {
    await getRecordStore().insert(BALANCE_SHEET_COLLECTION, r);
    await new Promise<void>((resolve) => setTimeout(resolve, 3));
  }
}

function rowFor(asOf: string): HTMLTableRowElement {
  const row = Array.from(container.querySelectorAll<HTMLTableRowElement>('tr[data-bs-row]')).find((tr) => tr.textContent?.includes(asOf));
  if (!row) throw new Error(`BS row ${asOf} not found`);
  return row;
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

describe('貸借対照表 — 「現在」は基準日で決まる', () => {
  it('★ 新しい基準日を先に入れ、古い基準日を後から入れても、指標と「使用中」は新しい基準日の控え・注記が出る', async () => {
    await insertInOrder([NEW_BS, OLD_BS]);
    await mount();
    expect(rowFor('2026-03-31').getAttribute('data-bs-row')).toBe('current');
    expect(rowFor('2026-03-31').textContent).toContain('使用中');
    expect(rowFor('2025-03-31').getAttribute('data-bs-row')).toBe('other');
    expect(rowFor('2025-03-31').textContent).not.toContain('使用中');
    // 自己資本比率は新しい控え (66.7%)、古い控え (25%) ではない
    expect(text()).toContain('66.7%');
    expect(text()).not.toContain('25%');
    const alert = Array.from(container.querySelectorAll('[role="alert"]')).find((el) => (el.textContent ?? '').includes('より新しい基準日の控え'));
    expect(alert, 'role="alert" に控えの選び方の注記が無い').toBeDefined();
    expect((alert!.textContent ?? '').replace(/\s+/g, ' ')).toContain('最後に入力した貸借対照表（基準日 2025-03-31）より新しい基準日の控え（基準日 2026-03-31）');
  });

  it('対照: 基準日の順に入れれば、最後に入力した控えが「現在」で、注記は出ない', async () => {
    await insertInOrder([OLD_BS, NEW_BS]);
    await mount();
    expect(rowFor('2026-03-31').getAttribute('data-bs-row')).toBe('current');
    expect(text()).toContain('66.7%');
    expect(text()).not.toContain('より新しい基準日の控え');
  });

  it('基準日なしの控えは最下位 (基準日つきが在ればそちらが「現在」)、一覧の × でどの控えでも消せる', async () => {
    await insertInOrder([OLD_BS, { ...NEW_BS, asOf: '' }]);
    await mount();
    expect(rowFor('2025-03-31').getAttribute('data-bs-row')).toBe('current');
    expect(rowFor('基準日なし').getAttribute('data-bs-row')).toBe('other');
    // 「現在」でない方 (基準日なし) を消す —— 以前は最後に入力した 1 件しか消せなかった
    const button = rowFor('基準日なし').querySelector('button[aria-label="削除"]');
    if (!button) throw new Error('delete button not found');
    await act(async () => {
      (button as HTMLButtonElement).click();
    });
    await settle();
    expect((await getRecordStore().list(BALANCE_SHEET_COLLECTION)).length).toBe(1);
    expect(container.querySelectorAll('tr[data-bs-row]').length).toBe(1);
  });
});

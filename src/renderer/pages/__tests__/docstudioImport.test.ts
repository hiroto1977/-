/** @vitest-environment jsdom */
/**
 * 書類スタジオ ⇄ 経営サマリー ⇄ 士業 の連携を、実物の record store (fake-indexeddb) と
 * localStorage を通して確かめる: 遷移の指示で書類が開く / 経営サマリーの数値が計算書類へ
 * 写る (押すまで書かない) / 事業仕分けから士業のページへ飛べる。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../../data/kpiActuals';
import { BALANCE_SHEET_COLLECTION, type BalanceSheet } from '../../data/balanceSheet';
import { BANK_SUBMISSION_COLLECTION, type BankSubmissionSettings } from '../../data/bankSubmission';
import { BANK_FORMAT_DEFAULT } from '../../../shared/bankFormat';
import { _resetNavigationIntentForTests, navigateTo, onNavigate, takeNavigationIntent } from '../../navigate';

const LS_KEY = 'servicehub.docstudio.v1';

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

const KPI: KpiActual = {
  period: '2026-01', unit: '全社', revenue: 12_345_678, cogs: 5_000_000, advertising: 1_000_000, sga: 3_000_000, depreciation: 200_000, laborCost: 1_000_000,
};
const BS: BalanceSheet = {
  asOf: '2026-03-31', currentAssets: 8_000_000, cash: 3_000_000, inventory: 1_000_000, accountsReceivable: 2_000_000,
  fixedAssets: 4_000_000, currentLiabilities: 5_000_000, accountsPayable: 1_500_000, fixedLiabilities: 3_000_000, netIncome: 600_000,
};
const SETTINGS: BankSubmissionSettings = {
  profile: { companyName: '株式会社テスト', representative: '', address: '', fiscalYearEnd: '2026-03' },
  format: BANK_FORMAT_DEFAULT,
};

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(id: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`${id} service missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
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

const q = {
  button: (text: string) => {
    const b = Array.from(container.querySelectorAll('button')).find((el) => el.textContent === text);
    if (!b) throw new Error(`button "${text}" not found`);
    return b;
  },
  buttonStartsWith: (text: string) => Array.from(container.querySelectorAll('button')).find((el) => (el.textContent ?? '').startsWith(text)),
  importTable: () => container.querySelector<HTMLTableElement>('table[data-kessan-import]'),
  importRow: (label: string): string | null => {
    for (const tr of Array.from(container.querySelectorAll('table[data-kessan-import] tbody tr'))) {
      const tds = tr.querySelectorAll('td');
      if (tds[0]?.textContent === label) return tds[1]?.textContent ?? null;
    }
    return null;
  },
  store: (): { kessan?: Record<string, string>; recent?: string[] } => JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as { kessan?: Record<string, string>; recent?: string[] },
};

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
  });
  await settle();
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
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
  document.body.removeChild(container);
});

describe('書類スタジオ — 経営サマリーから計算書類を取り込む', () => {
  it('遷移の指示で計算書類が開き、取り込む内容が並ぶ。押すまで localStorage には書かない', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, KPI);
    await getRecordStore().insert(BALANCE_SHEET_COLLECTION, BS);
    await getRecordStore().insert(BANK_SUBMISSION_COLLECTION, SETTINGS);
    navigateTo('docstudio', { doc: 'kessan', action: 'import-overview' });
    await mount('docstudio');
    expect(q.buttonStartsWith('📊 計算書類')?.className).toBe('primary');
    expect(q.importTable()).not.toBeNull();
    expect(q.importRow('会社名')).toBe('株式会社テスト');
    expect(q.importRow('事業年度（至）')).toBe('2026年3月31日');
    expect(q.importRow('売上高')).toBe('12,345,678');
    expect(q.importRow('現金及び預金')).toBe('3,000,000');
    expect(q.importRow('繰越利益剰余金（期首残高）')).not.toBeNull();
    expect(q.store().kessan).toBeUndefined();

    await click(q.button('この内容で取り込む'));
    const kessan = q.store().kessan!;
    expect(kessan.company).toBe('株式会社テスト');
    expect(kessan.sales).toBe('12345678');
    expect(kessan.purchases).toBe('5000000');
    expect(kessan.cash).toBe('3000000');
    expect(kessan.otherFixedAsset).toBe('4000000');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('件を取り込みました');
    // 貸借の検算パネルに差額の警告が出ない (逆算した期首残高で合っている)
    expect(container.textContent).not.toContain('貸借が合っていません');
  });

  it('何も入力していなければ取り込めない物が並び、ボタンは押せない', async () => {
    navigateTo('docstudio', { doc: 'kessan' });
    await mount('docstudio');
    expect(q.importTable()).toBeNull();
    expect(container.textContent).toContain('取り込めない: 損益');
    expect(container.textContent).toContain('取り込めない: 資産・負債');
    expect(q.button('この内容で取り込む').disabled).toBe(true);
  });

  it('遷移の指示なしで開くと経営書類のタブのまま (古い指示は発火しない)', async () => {
    await mount('docstudio');
    expect(q.buttonStartsWith('📊 計算書類')?.className).toBe('');
    expect(q.importTable()).toBeNull();
  });

  it('書式 id の指示はその書式を開き、定款の指示は会社形態も切り替える', async () => {
    navigateTo('docstudio', { doc: 'shikin-guri' });
    await mount('docstudio');
    expect(q.store().recent?.[0]).toBe('shikin-guri');
    expect(container.textContent).toContain('月ごとの入出金');
    await unmount();
    navigateTo('docstudio', { doc: 'teikan-gk' });
    await mount('docstudio');
    expect(container.querySelector<HTMLButtonElement>('button[data-doc-id="teikan-gk"]')?.className).toBe('primary');
    await unmount();
    navigateTo('docstudio', { doc: 'no-such-doc' });
    await mount('docstudio');
    expect(q.buttonStartsWith('🗂 経営書類')?.className).toBe('primary');
  });

  it('事業仕分けから士業のページへ飛べる', async () => {
    navigateTo('docstudio', { doc: 'kessan' });
    await mount('docstudio');
    const seen: string[] = [];
    const off = onNavigate((id) => seen.push(id));
    await click(q.button('税理士のページへ →'));
    await click(q.button('公認会計士のページへ →'));
    off();
    expect(seen).toEqual(['tax-accountant', 'cpa']);
    expect(takeNavigationIntent('tax-accountant')).toBeNull();
  });

  it('「経営サマリーを開く」は経営サマリーへ遷移する', async () => {
    navigateTo('docstudio', { doc: 'kessan' });
    await mount('docstudio');
    const seen: string[] = [];
    const off = onNavigate((id) => seen.push(id));
    await click(q.button('経営サマリーを開く →'));
    off();
    expect(seen).toEqual(['overview']);
  });
});

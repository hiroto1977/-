/** @vitest-environment jsdom */
/**
 * **同じ期・同じ事業の KPI 実績を 2 件にしない。** (2026-09-09 · パス 124)
 *
 * 実績は (期間, 事業) が 1 件の単位だが、KPI の画面は同じ組を 2 度入れても断らず、
 * `summarizeFundamentals` / `groupRevenueByPeriod` は**合算**する。実績には「編集」が無く
 * 訂正は入れ直しなので、2026-04 の売上を訂正した利用者は **旧 + 新の合計**を
 * 経営サマリー・経営スコアカード・着地見込み・金融機関等提出用の書面 §1 に見ることになる。
 *
 * ここは実物の画面で 3 面を読む: 同じ組の追加は断られ件数が増えない (訂正の案内つき)・
 * 既に重複が在れば一覧の上に警告が出る・別の事業なら通る (対照)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../../data/kpiActuals';

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
  const def = SERVICES.find((s) => s.id === 'kpi');
  if (!def) throw new Error('kpi service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
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

/** 文字がちょうど一致するボタン (「予算を追加」を「追加」と取り違えない)。 */
async function clickButtonExact(label: string): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  if (!button) throw new Error(`button "${label}" not found`);
  await act(async () => {
    button.click();
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

async function fillActual(period: string, unit: string, revenue: string): Promise<void> {
  await act(async () => {
    changeInput(byPlaceholder('YYYY-MM'), period);
    changeInput(byPlaceholder('事業名'), unit);
    changeInput(byPlaceholder('売上高'), revenue);
    changeInput(byPlaceholder('売上原価'), '0');
    changeInput(byPlaceholder('広告費'), '0');
    changeInput(byPlaceholder('販管費'), '0');
    changeInput(byPlaceholder('減価償却費'), '0');
  });
}

const ROW: KpiActual = { period: '2026-04', unit: '全社', revenue: 1_000_000, cogs: 0, advertising: 0, sga: 0, depreciation: 0 };

async function countActuals(): Promise<number> {
  return (await getRecordStore().list(KPI_ACTUALS_COLLECTION)).length;
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

describe('KPI 実績 — 同じ期・事業を 2 件にしない', () => {
  it('★ 同じ (期間, 事業) の追加は断られ、件数は増えず、訂正の案内が出る', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ROW);
    await mount();
    expect(await countActuals()).toBe(1);
    await fillActual('2026-04', '全社', '2000000');
    await clickButtonExact('追加');
    expect(await countActuals()).toBe(1);
    expect(text()).toContain('2026-04 の「全社」の実績は既に入力されています');
    expect(text()).toContain('一覧の × で消してから入れ直してください');
    // 合算されなかった (実績合計は 1 件分のまま。¥ は環境で全角/半角が揺れる)
    expect(text()).toMatch(/[¥￥]1,000,000/);
    expect(text()).not.toMatch(/[¥￥]3,000,000/);
  });

  it('対照: 別の事業なら同じ期でも通る (複数事業は正当)', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ROW);
    await mount();
    await fillActual('2026-04', 'EC', '500000');
    await clickButtonExact('追加');
    expect(await countActuals()).toBe(2);
    expect(text()).not.toContain('既に入力されています');
  });

  it('★ 既に重複が在れば、一覧の上で「合算されている」と警告する', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ROW);
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, { ...ROW, revenue: 1_200_000 });
    await mount();
    const alert = Array.from(container.querySelectorAll('[role="alert"]')).find((el) => (el.textContent ?? '').includes('合算'));
    expect(alert, 'role="alert" に合算の警告が無い').toBeDefined();
    const t = (alert!.textContent ?? '').replace(/\s+/g, ' ');
    expect(t).toContain('同じ期・事業の実績が 1 組重複しており、合算されています');
    expect(t).toContain('2026-04 全社 ×2');
  });

  it('対照: 重複が無ければ警告は出ない', async () => {
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, ROW);
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, { ...ROW, period: '2026-05' });
    await mount();
    expect(text()).not.toContain('合算されています');
  });
});

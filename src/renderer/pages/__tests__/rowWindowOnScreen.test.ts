/** @vitest-environment jsdom */
/**
 * **保管した行を描く一覧は、件数に天井を持つ** (2026-10-19 · パス 538 · R-3)。
 *
 * 実測 (実 Chromium・実際の CSV 取り込み・売上集計): 5,000 行で一覧が出るまで 3.0 秒・2 万行で 14 秒
 * (最大の長いタスク 7.7 秒・DOM 16 万ノード)・10 万行で 95 秒 (43 秒・80 万ノード)。CSV の取り込みは
 * 20 万行まで正当に通るので、これは異常な入力ではない。直した後は 2 万行・10 万行とも一覧は 210 行・
 * 1,909 ノード・最大の長いタスク 0.26 秒 / 1.7 秒・操作 1 回 33〜41ms。
 *
 * 窓は切り捨てではない —— 「さらに表示」で全件に届き、**隠れていた行も × で消せる** (法則
 * `escape-hatch-stays-open`)。背骨は振る舞い (実物の保管層へ入れて実物の画面を描く)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SalesPage } from '../SalesPage';
import { KpiPage } from '../KpiPage';
import { SALES_COLLECTION } from '../../data/sales';
import { KPI_ACTUALS_COLLECTION } from '../../data/kpiActuals';
import { ROW_WINDOW_STEP } from '../../data/rowWindow';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { waitForElement } from '../../__tests__/jsdomWait';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: vi.fn(() => Promise.resolve({ ok: false, code: 'x', message: 'x' })),
    openExternal: () => Promise.resolve(),
    storageProtection: () => Promise.resolve({ mechanism: 'none', counts: {} }),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    checkUpdate: () => Promise.resolve({ ok: true }),
    revealInFolder: () => Promise.resolve({ ok: true }),
    openPath: () => Promise.resolve({ ok: true }),
    setColorScheme: () => Promise.resolve(),
    eraseAll: () => Promise.resolve({ ok: true }),
    authorize: () => Promise.resolve({ ok: false }),
  };
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined }),
      configurable: true,
    });
  }
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, { value: () => undefined, configurable: true, writable: true });
    }
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  if (root) {
    const r = root;
    root = null;
    act(() => r.unmount());
  }
  container.remove();
  vi.restoreAllMocks();
});

const N = ROW_WINDOW_STEP * 2 + 50; // 窓を 2 回超える

async function seedSales(n: number): Promise<void> {
  const rows = Array.from({ length: n }, (_, i) => ({
    date: `2026-04-${String((i % 28) + 1).padStart(2, '0')}`,
    channel: 'amazon',
    amount: 1000 + i,
    orders: 1,
    note: `R${i}`,
  }));
  await getRecordStore().insertMany(SALES_COLLECTION, rows);
}

async function seedKpi(n: number): Promise<void> {
  const rows = Array.from({ length: n }, (_, i) => ({
    period: `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
    unit: '全社',
    revenue: 1_000_000,
    cogs: 300_000,
    advertising: 50_000,
    sga: 200_000,
    depreciation: 10_000,
  }));
  await getRecordStore().insertMany(KPI_ACTUALS_COLLECTION, rows);
}

async function mount(Page: ComponentType): Promise<void> {
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(Page));
  });
  await waitForElement(() => container.querySelector('tbody tr'), '一覧の行');
}

/** 画面でいちばん行の多い表の行数 (KPI 画面は月次などの小さな表も持つので、一覧の表を件数で選ぶ)。 */
const bodyRows = (): number => Math.max(0, ...[...container.querySelectorAll('tbody')].map((b) => b.querySelectorAll(':scope > tr').length));
const more = (): HTMLButtonElement | null => container.querySelector<HTMLButtonElement>('[data-row-window-more]');
const note = (): string => container.querySelector('[data-row-window]')?.textContent ?? '';

async function clickMore(): Promise<void> {
  const b = more();
  if (b === null) throw new Error('「さらに表示」が出ていません');
  await act(async () => {
    b.click();
  });
}

describe.each([
  ['売上集計 (明細)', SalesPage as ComponentType, seedSales],
  ['KPI 実績 (一覧)', KpiPage as ComponentType, seedKpi],
] as const)('%s の一覧は件数に天井を持つ (パス 538)', (_label, Page, seed) => {
  it('★ 窓を 2 回超える行数を入れても最初に描くのは窓の行数だけで、残りの件数を言う (threat: T-127)', async () => {
    await seed(N);
    await mount(Page);
    // 一覧の行 (他の表 —— 月次の集計など —— も tbody を持つので、窓の印の在る側で数える)
    expect(note()).toContain(`全 ${N.toLocaleString('ja-JP')} 件`);
    expect(note()).toContain(`残り ${(N - ROW_WINDOW_STEP).toLocaleString('ja-JP')} 件`);
    expect(bodyRows()).toBe(ROW_WINDOW_STEP); // 全行は描かない・窓の件数ちょうど
  });

  it('★ 「さらに表示」を押すたびに窓が広がり、最後は全件に届いて印が消える (切り捨てではない)', async () => {
    await seed(N);
    await mount(Page);
    expect(bodyRows()).toBe(ROW_WINDOW_STEP);
    await clickMore();
    expect(bodyRows()).toBe(ROW_WINDOW_STEP * 2);
    // 残りは 50 件だけ —— 最後のボタンは残りぶんを名乗る
    expect(more()?.textContent).toContain('50');
    await clickMore();
    expect(more()).toBeNull();
    expect(container.querySelector('[data-row-window]')).toBeNull();
    expect(bodyRows()).toBe(N); // 最後は全件に届く
  });

  it('★ 窓以下の件数なら印もボタンも出ない (少ない利用者の画面は 1 字も変わらない)', async () => {
    await seed(5);
    await mount(Page);
    expect(container.querySelector('[data-row-window]')).toBeNull();
    expect(more()).toBeNull();
    expect(bodyRows()).toBe(5);
  });
});

describe('窓は逃げ口を閉じない / 配線 (パス 538)', () => {
  it('★ 売上: 窓の外に在った行も「さらに表示」の後なら × で消せる', async () => {
    await seedSales(ROW_WINDOW_STEP + 5);
    await mount(SalesPage as ComponentType);
    const deletables = (): number => container.querySelectorAll('button[aria-label="削除"]').length;
    const before = deletables();
    expect(before).toBeLessThanOrEqual(ROW_WINDOW_STEP + 5);
    await clickMore();
    expect(deletables()).toBe(before + 5); // 隠れていた 5 行の × が出る
    expect(container.textContent).toContain('R0'); // 先頭 (新しい側) は最初から見える
  });

  it('★ 2 画面とも、全行を描く素の records.map を持たない (窓を通す)', () => {
    for (const f of ['SalesPage.tsx', 'KpiPage.tsx']) {
      const src = readOriginalSource(path.resolve(__dirname, '..', f));
      expect(src, f).toContain('useRowWindow(records)');
      expect(src, f).toContain('<RowWindowMore');
      expect(src, f).toMatch(/\.visible\.map\(/);
    }
  });
});

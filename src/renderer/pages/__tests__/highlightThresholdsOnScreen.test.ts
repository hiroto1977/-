/** @vitest-environment jsdom */
/**
 * **経営ハイライトのしきい値は、画面から設定して判定まで届く** (2026-09-27 · パス 493c)。
 *
 * 予算未達の 90 は `buildManagementHighlights` の中の生の literal で、同じ所見の群の
 * 兄弟 4 つ (連続下落 2 つ・労働分配率・単一チャネル依存) だけが「ハイライトのしきい値設定」
 * から調整できた (2026-09-07 に記録して残した観察)。しかも画面は 4 つの欄を手で並べていたので、
 * しきい値を足しても画面からは設定できない形だった。
 *
 * ここでは実物の経営サマリーを描き、
 * - 欄はしきい値の鍵と同じ集合で描かれる (`data-threshold` —— 母集団は既定のしきい値から導く)
 * - 予算未達の欄に 95 を入れて保存すると、達成率 92% に「予算未達」が出る (対照: 既定では出ない)
 * - 業種プリセットは 5 つ目の欄も既定へ戻す
 * を見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../../data/kpiActuals';
import { KPI_BUDGETS_COLLECTION } from '../../data/budgetVariance';
import { DEFAULT_HIGHLIGHT_THRESHOLDS } from '../../data/managementHighlights';
import { _resetNavigationIntentForTests } from '../../navigate';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

/** 実績 92 万 / 予算 100 万 = 達成率 92% (既定 90 では黙り、95 では未達)。 */
const ACTUAL: KpiActual = {
  period: '2026-04', unit: '全社', revenue: 920_000, cogs: 300_000, advertising: 50_000, sga: 200_000, depreciation: 10_000,
};
const BUDGET: KpiActual = { ...ACTUAL, revenue: 1_000_000 };
const SHORTFALL_MESSAGE = '売上が予算未達です (達成率 92%)。';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

async function mountWithBudget(): Promise<void> {
  const store = getRecordStore();
  await store.insert(KPI_ACTUALS_COLLECTION, ACTUAL);
  await store.insert(KPI_BUDGETS_COLLECTION, BUDGET);
  const def = SERVICES.find((s) => s.id === 'overview');
  if (!def) throw new Error('overview service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  // 設定の欄は実績が届いてから描かれる (hasData)。欄そのもので待つ。
  await waitForElement(
    () => container.querySelector('input[data-threshold="budgetShortfallWarnPct"]'),
    '予算未達のしきい値の欄',
  );
}

const text = (): string => container.textContent ?? '';

const thresholdInput = (key: string): HTMLInputElement => {
  const el = container.querySelector<HTMLInputElement>(`input[data-threshold="${key}"]`);
  if (!el) throw new Error(`threshold input ${key} not found`);
  return el;
};

async function type(el: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function clickButton(text: string): Promise<void> {
  const b = Array.from(container.querySelectorAll('button')).find((el) => el.textContent === text);
  if (!b) throw new Error(`button "${text}" not found`);
  await act(async () => {
    b.click();
  });
}

describe('経営ハイライトのしきい値 —— 画面から判定まで', () => {
  it('★ 欄はしきい値の鍵と同じ集合で描かれる (設定できない鍵も、判定の読まない欄も作らない)', async () => {
    await mountWithBudget();
    const keys = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-threshold]')).map(
      (el) => el.dataset.threshold,
    );
    expect([...keys].sort()).toEqual(Object.keys(DEFAULT_HIGHLIGHT_THRESHOLDS).sort());
    // 欄は既定値を持って描かれる。
    for (const [k, v] of Object.entries(DEFAULT_HIGHLIGHT_THRESHOLDS)) expect(thresholdInput(k).value).toBe(String(v));
  });

  it('★ 予算未達を 95 にして保存すると、達成率 92% に「予算未達」が出る (対照: 既定では出ない)', async () => {
    await mountWithBudget();
    // 対照: 既定 (90) では 92% は黙る —— 所見の一覧が描かれてから見る。
    await waitForText(text, '経営ハイライト');
    expect(container.textContent).not.toContain(SHORTFALL_MESSAGE);
    await type(thresholdInput('budgetShortfallWarnPct'), '95');
    await clickButton('保存');
    await waitForText(text, SHORTFALL_MESSAGE);
    // 保存されたのは 5 欄そろった 1 件 (既定の 4 欄は既定のまま)。
    const saved = await getRecordStore().list('highlight-settings');
    expect(saved).toHaveLength(1);
    expect(saved[0]!.data).toEqual({ ...DEFAULT_HIGHLIGHT_THRESHOLDS, budgetShortfallWarnPct: 95 });
  });

  it('天井 (100) を越える値は保存せず、欄の名前で断る', async () => {
    await mountWithBudget();
    await type(thresholdInput('budgetShortfallWarnPct'), '120');
    await clickButton('保存');
    await waitForText(text, '予算未達の警告しきい値は 0〜100 の数値で入力してください');
    expect(await getRecordStore().list('highlight-settings')).toHaveLength(0);
  });

  it('業種プリセットは 5 つ目の欄も既定へ戻す (手で並べた 4 欄だけを戻す形にしない)', async () => {
    await mountWithBudget();
    const input = thresholdInput('budgetShortfallWarnPct');
    await type(input, '95');
    await settleUntil(() => input.value === '95', '欄に 95 が入る');
    await clickButton('小売・EC');
    await settleUntil(
      () => thresholdInput('budgetShortfallWarnPct').value === String(DEFAULT_HIGHLIGHT_THRESHOLDS.budgetShortfallWarnPct),
      'プリセットが予算未達の欄を既定へ戻す',
    );
    // プリセット固有の欄も入る (対照: プリセットが効いていることの印)。
    expect(thresholdInput('declineWarnStreak').value).toBe('3');
  });
});

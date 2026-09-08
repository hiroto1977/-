/** @vitest-environment jsdom */
/**
 * **手で置いた数値が在ることは、画面だけでなく書面とレポートにも travel する。**
 *
 * 経営サマリーの数値は `applyManualOverrides` で手入力に置き換えられる。
 * **置き換えは表示だけで、派生値は再計算しない** —— これは意図した設計である
 * (「どの派生値をどう直したいかは利用者にしか決められない」`overviewOverrides.ts`)。
 * その結果、**印刷した比率が同じ表に並ぶ金額どおりにならない**:
 *
 * | 行 | 刷った値 | 同じ表の金額から計算すると |
 * | --- | ---: | ---: |
 * | 売上総利益率 | 75.0% | 9,000 ÷ 50,000 = **18.0%** |
 * | 営業利益率 | 37.5% | 4,500 ÷ 50,000 = **9.0%** |
 *
 * 画面は 2026-09-08 まで**画面だけ**で「自動値のままの指標」を警告しており、
 * 金融機関等提出用の書面 (「上記のとおり相違ありません。」で代表者名つき) と
 * 経営レポート (「役員会・銀行・税理士への共有に」) には手入力の断りが
 * **1 文も無かった**。ここは**実物の record store** を通して 3 つの面を見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../../data/kpiActuals';
import { MANUAL_OVERRIDES_COLLECTION, type ManualOverrideEntry } from '../../data/manualData';

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

/** 実績 3 か月 = 売上 1,200 万・営業利益 450 万。 */
const actual = (period: string): KpiActual => ({
  period, unit: '全社', revenue: 4_000_000, cogs: 1_000_000, advertising: 0, sga: 1_500_000, depreciation: 0,
});
/** 締め前の速報値を手で置く。 */
const OVERRIDE: ManualOverrideEntry = { scope: 'overview', path: 'kpi.revenue', value: 50_000_000 };

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountOverview(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'overview');
  if (!def) throw new Error('overview service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

async function seed(overrides: readonly ManualOverrideEntry[]): Promise<void> {
  const store = getRecordStore();
  for (const m of ['2026-04', '2026-05', '2026-06']) await store.insert(KPI_ACTUALS_COLLECTION, actual(m));
  for (const o of overrides) await store.insert(MANUAL_OVERRIDES_COLLECTION, o);
}

/** 画面の文字 (改行・連続空白を畳んだもの)。 */
const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

async function click(label: string): Promise<void> {
  const b = Array.from(container.querySelectorAll('button')).find((el) => el.textContent === label);
  if (!b) throw new Error(`button "${label}" not found`);
  await act(async () => {
    b.click();
  });
  await settle();
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
  container.remove();
});

describe('手入力の上書き — 断りが 3 つの面に出る', () => {
  it('★ 画面: 手入力が効き、自動値のままの指標を警告する', async () => {
    await seed([OVERRIDE]);
    await mountOverview();
    const t = text();
    expect(t).toContain('50,000,000'); // 手で置いた売上高
    expect(t).toContain('自動値のままの指標');
    expect(t).toContain('手で置いた数値から計算される指標が、自動値のままです');
  });

  it('★ 書面: 注記が手入力を述べ、「実績の累計」と断言しない', async () => {
    await seed([OVERRIDE]);
    await mountOverview();
    await click('金融機関等提出用の書式で表示');
    const t = text();
    expect(t).toContain('下記の手入力を重ねたもの');
    expect(t).toContain('売上高は手で置いた数値です');
    expect(t).toContain('は自動計算のままで');
    expect(t).toContain('同じ表に並ぶ金額どおりの値にならないことがあります');
  });

  it('★ 対照: 上書きが無ければ書面に手入力の断りは出ず、「累計。」で言い切る', async () => {
    await seed([]);
    await mountOverview();
    await click('金融機関等提出用の書式で表示');
    const t = text();
    expect(t).toContain('の累計。');
    expect(t).not.toContain('手で置いた数値');
    expect(t).not.toContain('自動計算のままで');
    expect(t).not.toContain('手入力を重ねたもの');
  });

  it('★ レポート: コピーした Markdown に手入力の節が入る', async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t: string) => { copied.push(t); return Promise.resolve(); } },
    });
    await seed([OVERRIDE]);
    await mountOverview();
    await click('経営レポートをコピー (Markdown)');
    expect(copied).toHaveLength(1);
    expect(copied[0]).toContain('## 手入力の上書き');
    expect(copied[0]).toContain('売上高は手で置いた数値です');
    expect(copied[0]).toContain('は自動計算のままで');
  });

  it('★ 対照: 上書きが無ければコピーした Markdown に節が無い', async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t: string) => { copied.push(t); return Promise.resolve(); } },
    });
    await seed([]);
    await mountOverview();
    await click('経営レポートをコピー (Markdown)');
    expect(copied).toHaveLength(1);
    expect(copied[0]).not.toContain('## 手入力の上書き');
    expect(copied[0]).not.toContain('手で置いた数値');
  });

  it('★ 対照: 上書きが無ければ画面にも「自動値のままの指標」は出ない', async () => {
    await seed([]);
    await mountOverview();
    expect(text()).not.toContain('自動値のままの指標');
  });
});

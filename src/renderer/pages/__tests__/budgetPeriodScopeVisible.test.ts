/** @vitest-environment jsdom */
/**
 * 予算実績差異 (BVA) の**突合した期**が画面に出ること。
 *
 * 2026-09-07 まで、達成率は予算の全行と実績の全行を合算して割っていた —— 通期予算
 * (12 か月) と実績 3 か月で 25%、予算 1 か月と実績 12 か月で 1200%、期が 1 つも
 * 重ならない控えでも 125%「予算達成」が出ていた。画面の断り書きは
 * 「同じ期間粒度で入力してください」という**お願い**だけで、食い違いを測る者は居なかった。
 *
 * ここでは**実物の record store** (fake-indexeddb) に予算と実績を入れ、
 * 経営サマリーと KPI ページが「何か月分の比較か」「重ならないなら算定できない」を
 * 画面に出すことを確かめる。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../../data/kpiActuals';
import { KPI_BUDGETS_COLLECTION } from '../../data/budgetVariance';

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

const at = (period: string, revenue: number): KpiActual => ({
  period, unit: '全社', revenue, cogs: 0, advertising: 0, sga: 0, depreciation: 0,
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

async function mount(serviceId: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === serviceId);
  if (!def) throw new Error(`service ${serviceId} missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

async function seed(budgets: readonly KpiActual[], actuals: readonly KpiActual[]): Promise<void> {
  const store = getRecordStore();
  for (const b of budgets) await store.insert(KPI_BUDGETS_COLLECTION, b);
  for (const a of actuals) await store.insert(KPI_ACTUALS_COLLECTION, a);
}

/** 画面の文字 (改行・連続空白を畳んだもの)。 */
const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  // fake-indexeddb は同じプロセスに残るので、**DB そのものを消す** ——
  // 消さないと前の検査の予算・実績が積み上がり、月数の主張が別の検査に汚される。
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

describe('経営サマリー — 予算実績差異の突合した期', () => {
  it('★ 通期予算に対して実績が一部なら、月数と「通年ではない」を画面が出す', async () => {
    const budgets = ['2026-04', '2026-05', '2026-06', '2026-07'].map((m) => at(m, 4_000_000));
    await seed(budgets, ['2026-04', '2026-05'].map((m) => at(m, 4_000_000)));
    await mount('overview');
    const t = text();
    expect(t).toContain('突き合わせたのは');
    expect(t).toContain('2026-04〜2026-05・2 か月分です');
    expect(t).toContain('予算と実績の両方が在る 2 か月分の比較です (予算のみ 2 か月は対象外)。通年の比較ではありません。');
    // 突合できた 2 か月では 100% (直す前は 4 か月の予算で割って 50%)
    expect(t).toContain('100%');
  });

  it('★ 対照: 全期が突合できていれば「通年の比較ではありません」は出ない', async () => {
    await seed([at('2026-04', 4_000_000)], [at('2026-04', 4_000_000)]);
    await mount('overview');
    const t = text();
    expect(t).toContain('突き合わせたのは');
    // **不在の主張は狭い綴りで。** 最初は `は対象外` で見ていたが、同じ画面の消費税
    // パネルに「課税売上高￥10,000,000超は対象外」が在って常に鳴った (2026-09-07 実測)。
    // 上の ★ が「これらの綴りが食い違うときには出る」ことを標本として示している。
    expect(t).not.toContain('通年の比較ではありません');
    expect(t).not.toContain('予算のみ');
    expect(t).not.toContain('実績のみ');
  });

  it('★ 期が 1 つも重ならなければ「算定できない」と理由を画面が出す (達成率を出さない)', async () => {
    await seed([at('2025-04', 4_000_000)], [at('2026-04', 5_000_000)]);
    await mount('overview');
    const alert = Array.from(container.querySelectorAll('[role="alert"]'))
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' '))
      .find((s) => s.includes('重なっていない'));
    expect(alert).toBeDefined();
    expect(alert).toContain('予算 1 か月・実績 1 か月');
    // 直す前は 125% を刷っていた
    expect(text()).not.toContain('125%');
  });
});

describe('KPI ページ — 予算パネルの突合した期', () => {
  it('★ 対象の期と対象外の月数をパネルが出す', async () => {
    const budgets = ['2026-04', '2026-05', '2026-06'].map((m) => at(m, 1_000_000));
    await seed(budgets, [at('2026-04', 1_000_000)]);
    await mount('kpi');
    const t = text();
    expect(t).toContain('対象: 2026-04〜2026-04・1 か月（予算と実績の両方が在る期）。予算のみ 2 か月は対象外です');
  });

  it('★ 期が重ならなければパネルが理由を出す', async () => {
    await seed([at('2025-04', 1_000_000)], [at('2026-04', 1_000_000)]);
    await mount('kpi');
    const alert = Array.from(container.querySelectorAll('[role="alert"]'))
      .map((el) => (el.textContent ?? '').replace(/\s+/g, ' '))
      .find((s) => s.includes('重なっていない'));
    expect(alert).toBeDefined();
    expect(alert).toContain('達成率を算定できません');
  });
});

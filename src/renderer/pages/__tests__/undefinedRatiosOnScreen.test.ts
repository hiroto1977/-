/** @vitest-environment jsdom */
/**
 * **割れない比率を画面が 0.0% と刷らないこと。**
 *
 * 売上高を分母にする比率は売上 0 では定まらず、一人当たりの額は従業員 0 名では
 * 定まらない。2026-09-08 まで `overview.ts` の `pctOfRevenue` / `perCapita` が
 * それを **0 に倒して**いたので、経営サマリーの画面には
 *
 *     営業利益  ¥-3,000,000   営業利益率 0.0%
 *
 * が並んでいた —— **同じタイルの 2 つの数字が両立しない。**
 * (書面 §1 と経営レポートも同じ数字を刷っていた。経緯は `overview.ts` の
 * `pctOfRevenue` 脇の実測表)
 *
 * 画面側には**枠の条件が 2 つ在った** (`revenue > 0` でコスト構造、`members > 0` で
 * 生産性)。つまり規則を知っていたのは枠だけで、値と書面は知らなかった。今は
 * 値が持ち、枠は値を見る。ここは**その枠と、枠の外に在る損益タイル**を実物の
 * record store 越しに確かめる。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../../data/kpiActuals';
import { MEMBERS_COLLECTION, type Member } from '../../data/members';

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

/** 売上 0・販管費だけ在る期 (創業直後の控え)。 */
const preRevenue = (period: string): KpiActual => ({
  period, unit: '全社', revenue: 0, cogs: 0, advertising: 0, sga: 1_500_000, depreciation: 0,
});
/** 売上も費用も在る期 (対照)。 */
const earning = (period: string): KpiActual => ({
  period, unit: '全社', revenue: 4_000_000, cogs: 1_000_000, advertising: 100_000, sga: 1_500_000, depreciation: 0,
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

async function mountOverview(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'overview');
  if (!def) throw new Error('overview service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

async function seed(actuals: readonly KpiActual[], members: readonly Member[] = []): Promise<void> {
  const store = getRecordStore();
  for (const a of actuals) await store.insert(KPI_ACTUALS_COLLECTION, a);
  for (const m of members) await store.insert(MEMBERS_COLLECTION, m);
}

/** 画面の文字 (改行・連続空白を畳んだもの)。 */
const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(async () => {
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  // fake-indexeddb は同じプロセスに残るので DB そのものを消す (前の検査の実績を持ち込まない)。
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

describe('経営サマリー — 売上 0 の控え', () => {
  it('★ 損益タイルの比率が「—」になり、0.0% を刷らない', async () => {
    await seed([preRevenue('2026-04'), preRevenue('2026-05')]);
    await mountOverview();
    const t = text();
    // 額は出る (期間の合計は測れている)
    expect(t).toContain('-3,000,000');
    // 比率は出ない。**綴りを絞る** —— 「0.0%」は画面のどこにでも在り得るので、
    // タイルの副題ごと当てる (この文面が実際に在ることは下の対照が示す)。
    expect(t).toContain('営業利益率 —');
    expect(t).toContain('粗利率 —');
    expect(t).toContain('償却前営業利益・マージン —');
    expect(t).not.toContain('営業利益率 0.0%');
    expect(t).not.toContain('粗利率 0.0%');
  });

  it('★ コスト構造の枠は出ない (原価率 0.0% を並べない)', async () => {
    await seed([preRevenue('2026-04'), preRevenue('2026-05')]);
    await mountOverview();
    expect(text()).not.toContain('コスト構造 (対売上)');
  });

  it('★ 対照: 売上が在れば同じ副題が数で出て、コスト構造の枠も出る', async () => {
    await seed([earning('2026-04'), earning('2026-05')]);
    await mountOverview();
    const t = text();
    // 営業利益 = 4,000,000×2 − (1,000,000+100,000+1,500,000)×2 = 2,800,000 → 35.0%
    expect(t).toContain('営業利益率 35.0%');
    expect(t).toContain('コスト構造 (対売上)');
    expect(t).not.toContain('営業利益率 —');
  });
});

describe('経営サマリー — 従業員 0 名の控え', () => {
  it('★ 生産性の枠は出ない (一人当たり ¥0 を並べない)', async () => {
    await seed([earning('2026-04')]);
    await mountOverview();
    const t = text();
    expect(t).not.toContain('生産性 (一人当たり)');
    expect(t).not.toContain('一人当たり売上');
  });

  it('★ 対照: メンバーが 1 名居れば一人当たりが出る', async () => {
    await seed([earning('2026-04')], [{ name: '山田 太郎', role: 'owner', email: 'a@example.com' } as Member]);
    await mountOverview();
    const t = text();
    expect(t).toContain('生産性 (一人当たり)');
    expect(t).toContain('一人当たり売上');
    // 売上 4,000,000 ÷ 1 名
    expect(t).toContain('4,000,000');
  });
});

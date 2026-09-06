/** @vitest-environment jsdom */
/**
 * **「形は正しい」控えで画面が壊れないこと。**
 *
 * 復元の形の検査 (`src/renderer/data/collectionShapes.ts`) は
 * `mutualfund-holdings` の `code` / `valuationMode` / `acquisitionCost` /
 * `ytdReturnPct` を**任意**にしている —— 前方互換のために意図してそうしてあり、
 * `valuationMode` の注記も「過去データに無い場合は auto 扱い」と書いている。
 * ところが型 `HoldingEntry` はこの 4 つを**必須**と言うので、欄の無いレコードが
 * 復元を通ると型が嘘になる。2026-09-06 の実測で画面は 2 通りに壊れていた:
 *
 *   `ytdReturnPct` が無い … 一覧の `h.ytdReturnPct.toFixed(1)` が TypeError。
 *     投資信託の画面が `PageErrorBoundary` の枠になり、**その画面が保有銘柄の
 *     一覧なので利用者はそのレコードを消せない**。形は正しいので設定の
 *     「形式の合わないレコード」点検にも出てこない。
 *   `acquisitionCost` が無い … 取得原価の合計が NaN になり「¥NaN」が出る。
 *
 * ここは**実物の record store (fake-indexeddb) に欠けた控えを入れて画面を描く**。
 * 対照は「揃った控え」で、そちらは実際の数字が出る (欠けた側だけが既定に倒れる)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MutualFundsPage } from '../MutualFundsPage';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { HOLDINGS_COLLECTION } from '../../data/investments';

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
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(MutualFundsPage));
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

const text = () => container.textContent ?? '';

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
  await unmount();
  document.body.removeChild(container);
});

/** 中核の欄だけを持つ控え (形の検査は通る)。 */
const CORE_ONLY = { name: '古い版で保存した投信', units: 1_000_000, navPerUnit: 20_000, valuation: 2_000_000 };

describe('保有銘柄 — 任意の欄が無い控えでも画面が出る', () => {
  it('★ 年初来・取得額・評価モード・コードが無くても描け、NaN を出さない', async () => {
    await getRecordStore().insert(HOLDINGS_COLLECTION, CORE_ONLY);
    await mount();
    // 画面が枠 (PageErrorBoundary) に落ちていない = 銘柄名が出ている。
    expect(text()).toContain('古い版で保存した投信');
    expect(text()).toContain('+0.0%'); // 年初来は既定 0
    expect(text()).not.toContain('NaN');
    expect(text()).not.toContain('問題が起きました'); // 境界の文面
  });

  it('★ 取得額が無い控えは損益 0 として扱う (¥NaN を出さない)', async () => {
    await getRecordStore().insert(HOLDINGS_COLLECTION, CORE_ONLY);
    await mount();
    // 取得原価は評価額と同額に倒れるので、含み損益の欄に NaN も ∞ も出ない。
    expect(text()).not.toMatch(/NaN|Infinity|∞/);
  });

  it('対照: 揃った控えは自分の数字で出る (既定に倒れていない)', async () => {
    await getRecordStore().insert(HOLDINGS_COLLECTION, {
      ...CORE_ONLY, name: '揃っている投信', code: 'ABC123',
      valuationMode: 'manual', acquisitionCost: 1_500_000, ytdReturnPct: 12.5,
    });
    await mount();
    expect(text()).toContain('揃っている投信');
    expect(text()).toContain('ABC123');
    expect(text()).toContain('+12.5%');
    expect(text()).not.toContain('+0.0%');
  });
});

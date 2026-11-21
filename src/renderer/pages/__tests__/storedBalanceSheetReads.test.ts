/** @vitest-environment jsdom */
/**
 * **貸借対照表の欄が数として読めないとき、経営サマリーの画面がそう言う。** (2026-09-24 · パス 444)
 *
 * 背骨は**振る舞い** —— 実物の保管層へ入れて実物の画面を描く。
 *
 * ★ `normalizeBalanceSheet` は型から読むので**投げない** (だから
 *   `npm run audit:malformed-fields` には映らない)。代わりに**倒す** ——
 *   必須の欄は 0 円、任意の欄は「未入力」。実測 (直す前) では健全な控えが
 *   画面に「自己資本比率 △100.0%」「⚠ 純資産がマイナス（債務超過）です。」を
 *   理由 1 文も無しで出していた。
 * ★ 任意の欄は**原因を取り違えた断り**になっていた —— 打ち込んだ値が読めない
 *   だけの人に「未入力のため」と言う (パス 388)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OverviewPage } from '../OverviewPage';
import { BALANCE_SHEET_COLLECTION } from '../../data/balanceSheet';
import { KPI_ACTUALS_COLLECTION } from '../../data/kpiActuals';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { installPageRenderGlobals } from '../../__tests__/pageRenderHarness';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { waitForText } from '../../__tests__/jsdomWait';

/** 形が拒む 5 形 —— どれも `structuredClone` が通すので保管値として実在しうる。 */
const NON_NUMBERS: readonly [string, unknown][] = [
  ['10進の文字列', '9000000'],
  ['物', { z: 1 }],
  ['配列', [1]],
  ['真偽', true],
  ['null', null],
];

/** 健全な控え —— 自己資本比率 33.3% / 流動比率 160.0%。 */
const GOOD_BS: Readonly<Record<string, unknown>> = {
  asOf: '2026-03-31',
  currentAssets: 8_000_000,
  cash: 3_000_000,
  inventory: 2_000_000,
  accountsReceivable: 1_500_000,
  fixedAssets: 4_000_000,
  currentLiabilities: 5_000_000,
  accountsPayable: 1_000_000,
  fixedLiabilities: 3_000_000,
  interestBearingDebt: 2_000_000,
  netIncome: 600_000,
};

const ACTUAL = {
  period: '2026-03',
  unit: '全社',
  revenue: 12_000_000,
  cogs: 6_000_000,
  advertising: 0,
  sga: 3_000_000,
  depreciation: 0,
};

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  installPageRenderGlobals((name) => {
    vi.spyOn(console, name).mockImplementation(() => undefined);
  });
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) {
    const r = root;
    root = null;
    act(() => {
      r.unmount();
    });
  }
  container.remove();
  vi.restoreAllMocks();
});

async function seed(bs: Record<string, unknown>): Promise<void> {
  const store = getRecordStore();
  await store.insert(KPI_ACTUALS_COLLECTION, ACTUAL);
  await store.insert(BALANCE_SHEET_COLLECTION, bs);
}

/**
 * 素で描く (境界で包まない)。
 *
 * 錠は**貸借対照表が届いた印** —— 節の見出しは器が null でも出ないが、
 * 「財政状態 (貸借対照表ベース)」は貸借対照表が在るときだけ描かれるので錠になる。
 */
async function mount(Page: ComponentType, waitFor: string): Promise<string> {
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(Page));
  });
  await waitForText(() => container.textContent ?? '', waitFor);
  return container.textContent ?? '';
}

const bs = (over: Record<string, unknown>): Record<string, unknown> => ({ ...GOOD_BS, ...over });

describe('経営サマリーの画面 — 貸借対照表の欄が読めない (パス 444)', () => {
  it('★ 正しい控えなら断りは 1 文も出ない (答えも変わらない)', async () => {
    await seed(GOOD_BS);
    const t = await mount(OverviewPage, '財政状態 (貸借対照表ベース)');
    // 画面は `pct` を `digits` 無しで呼ぶので丸めない (`160.0%` ではなく `160%`)。
    expect(t).toContain('33.3%');
    expect(t).toContain('160%');
    expect(t).not.toContain('数として読めない');
    expect(container.querySelector('[data-bs-unreadable]')).toBeNull();
  });

  it.each(NON_NUMBERS)('★ 流動資産が %s なら、倒したことを画面が言う', async (_label, bad) => {
    await seed(bs({ currentAssets: bad }));
    const t = await mount(OverviewPage, '財政状態 (貸借対照表ベース)');
    // ① 値は変えていない —— 倒したことを述べるだけ (書面の `△` と違い画面は `-`)。
    expect(t).toContain('-100%');
    // ② 断りが在り、欄を名指しし、逃げ口を名乗る。
    const note = container.querySelector('[data-bs-unreadable]');
    expect(note).not.toBeNull();
    expect(note?.textContent ?? '').toContain('流動資産');
    expect(note?.textContent ?? '').toContain('0 円として計算しています');
    expect(note?.textContent ?? '').toContain('形式の合わないレコード');
    // ③ 嘘を刷らない。
    expect(t).not.toContain('[object Object]');
  });

  it('★ 「債務超過です」の隣に理由が在る (断りが先に読める位置)', async () => {
    await seed(bs({ currentAssets: '9000000' }));
    const t = await mount(OverviewPage, '財政状態 (貸借対照表ベース)');
    expect(t).toContain('純資産がマイナス（債務超過）です');
    const note = container.querySelector('[data-bs-unreadable]');
    expect(note).not.toBeNull();
    // 断りは `role="alert"` —— 読み上げにも届く。
    expect(note?.getAttribute('role')).toBe('alert');
  });

  it('★ 任意の欄は「未入力」ではなく「読めない」と言う (原因を取り違えない)', async () => {
    await seed(bs({ inventory: '500' }));
    const t = await mount(OverviewPage, '財政状態 (貸借対照表ベース)');
    expect(t).toContain('棚卸資産が数として読めないため');
    expect(t).not.toContain('棚卸資産が未入力のため');
  });

});

describe('経営サマリーの画面 — 未入力と読めないが混ざる (パス 444)', () => {
  it('★ 2 つの原因が 2 つの文に分かれる', async () => {
    const mixed = { ...GOOD_BS, inventory: '500' } as Record<string, unknown>;
    delete mixed.accountsReceivable;
    await seed(mixed);
    const t = await mount(OverviewPage, '財政状態 (貸借対照表ベース)');
    expect(t).toContain('売上債権が未入力のため');
    expect(t).toContain('棚卸資産が数として読めないため');
  });
});

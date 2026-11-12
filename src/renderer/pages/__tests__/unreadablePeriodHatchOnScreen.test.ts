/** @vitest-environment jsdom */
/**
 * **名指しした逃げ口に、その行が本当に在るか** (2026-09-23 · パス 425)。
 *
 * 走査 (`namedEscapeHatchReachable.test.ts`) は「文が何を名指しするか」と
 * 「形の表がその標本をどう答えるか」を突き合わせるが、**一覧にその行が出ているか**は
 * 画面を描かないと分からない。ここが `list-x` の側の背骨である。
 *
 * ## 直す前の実測 (2026-09-23 · 同じ保管層に良い行 1 + `period: 'bad'` 1)
 *
 * | 面 | 実測 |
 * | --- | --- |
 * | KPI の警告 | 「…（**設定の「形式の合わない記録」から消せます**）。」 |
 * | **同じ画面の一覧** | `bad A ￥1,000,000 ￥1,000,000 ×` —— **消す口は目の前に在った** |
 * | **名指しされた点検パネル** | 「調べた 2 件に**形式の合わないレコードはありません**。」 |
 *
 * 利用者は文のとおりに設定へ行き、そこで「問題はありません」と**否定される**。
 * 2 つの画面が、問題が在るかどうかについて互いに矛盾していた。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { KPI_ACTUALS_COLLECTION } from '../../data/kpiActuals';
import { RecordShapeAuditPanel } from '../../components/RecordShapeAuditPanel';
import { settleUntil, waitForText } from '../../__tests__/jsdomWait';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';

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

const BASE = { unit: 'A', revenue: 1_000_000, cogs: 0, advertising: 0, sga: 0, depreciation: 0 };

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container.remove();
});

/** 実績一覧の行 (見出しが「期間 / 事業 / 売上高」の表) —— 予算の表と取り違えない。 */
function actualRows(): HTMLTableRowElement[] {
  for (const table of Array.from(container.querySelectorAll('table'))) {
    const heads = Array.from(table.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
    if (heads[0] !== '期間' || heads[1] !== '事業' || heads[2] !== '売上高') continue;
    return Array.from(table.querySelectorAll('tbody tr'));
  }
  return [];
}

async function seed(): Promise<void> {
  const store = getRecordStore();
  await store.insert(KPI_ACTUALS_COLLECTION, { period: '2026-04', ...BASE });
  await store.insert(KPI_ACTUALS_COLLECTION, { period: 'bad', ...BASE });
}

/** KPI の画面を描き、**一覧が 2 行になるまで条件で待つ** (法則 `wait-for-condition-not-ticks`)。 */
async function mountKpi(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'kpi');
  if (!def) throw new Error('kpi service missing');
  root = createRoot(container);
  await act(async () => { root!.render(createElement(def.page)); });
  await settleUntil(() => actualRows().length === 2, '実績の一覧が 2 行になる');
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

describe('期が読めない実績 —— 逃げ口は一覧の × である (パス 425)', () => {
  it('★ 警告は出て、しかも設定の点検パネルを名指ししない', async () => {
    await seed();
    await mountKpi();
    expect(text()).toContain('期 (YYYY-MM) が読めない');
    expect(text(), '点検パネルはこの行を見つけられない (行った先が「ありません」と答える)')
      .not.toContain('形式の合わない');
    expect(text()).toContain('一覧の ×');
  });

  it('★ その行は一覧に出ていて、削除ボタンが付いている (名指しした逃げ口が実在する)', async () => {
    await seed();
    await mountKpi();
    const bad = actualRows().find((tr) => (tr.textContent ?? '').includes('bad'));
    expect(bad, '期が読めない行が一覧から消えている (選別してしまっている)').toBeDefined();
    expect(bad!.querySelector('button[aria-label="削除"]'), 'その行に × が無い').not.toBeNull();
  });

  it('★ 対照: 名指しされていた点検パネルは、同じ保管層でこの行を見つけない', async () => {
    await seed();
    root = createRoot(container);
    await act(async () => { root!.render(createElement(RecordShapeAuditPanel)); });
    const scan = container.querySelector<HTMLButtonElement>('[data-shape-audit-scan]');
    expect(scan).not.toBeNull();
    await act(async () => { scan!.click(); });
    await waitForText(() => container.textContent ?? '', '調べた', { timeoutMs: 10_000 });
    expect(
      (container.querySelector('[data-shape-audit-result]')?.textContent ?? '').replace(/\s+/g, ' '),
      'パネルがこの行を見つけるなら、KPI の文はパネルを名指ししてよい (今日は見つけない)',
    ).toContain('形式の合わないレコードはありません');
  }, 20_000);
});

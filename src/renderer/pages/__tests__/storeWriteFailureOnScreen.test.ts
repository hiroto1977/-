/** @vitest-environment jsdom */
/**
 * **保存が断られたら、押した所で受け止めて画面上端へ報せる —— 宙に浮かせない。** (2026-09-27 · パス 493o)
 *
 * 構文木の census (`renderer/__tests__/storeWriteRejectionCensus.test.ts`) は、書き込みの拒否が
 * どこで受け取られるかを**辿る**。ここは**実物の画面で実際に断らせて**、辿った答えが
 * 振る舞いとして成り立つことを見る (直す前は 10 か所が未処理の拒否になっていた)。
 *
 * どの `it` も 3 つを見る:
 *
 * 1. **未処理の拒否が 0 件** —— `process` の `unhandledRejection` を数える (直す前はここで鳴る)
 * 2. **画面上端の知らせへ届いた** —— 操作 (`delete` / `save`) と collection で
 * 3. **一覧はそのまま** (削除) / **取り込みの欄が今の状態を言う** (取り込み)
 *
 * 保管層の失敗は `vi.spyOn(getRecordStore(), 'remove' | 'update' | 'insertMany')` で起こす。
 * 例外は `QuotaExceededError` の名前を持たせる (ブラウザが実際に投げる形 —— 知らせの文面が
 * 「保存領域が一杯です」になることも同時に見える)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type FunctionComponent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import {
  _resetDeviceStoreFailureForTests,
  subscribeDeviceStoreFailure,
  type DeviceStoreFailure,
} from '../../data/deviceStoreFailure';
import { importSaveFailedNote } from '../../data/importFile';
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';
import { SalesPage } from '../SalesPage';
import { SALES_COLLECTION } from '../../data/sales';
import { salesToCsv } from '../../data/salesCsv';
import { KpiPage } from '../KpiPage';
import { KPI_ACTUALS_COLLECTION } from '../../data/kpiActuals';
import { KPI_BUDGETS_COLLECTION } from '../../data/budgetVariance';
import { BALANCE_SHEET_COLLECTION } from '../../data/balanceSheet';
import { kpiActualsToCsv } from '../../data/kpiActualsCsv';
import { TeamPage } from '../TeamPage';
import { MEMBERS_COLLECTION } from '../../data/members';
import { MutualFundsPage } from '../MutualFundsPage';
import { HOLDINGS_COLLECTION, PROPERTIES_COLLECTION } from '../../data/investments';
import { RealEstatePage } from '../RealEstatePage';

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
let unhandled: unknown[] = [];
let failures: DeviceStoreFailure[] = [];
let unsubscribe: (() => void) | null = null;
const onUnhandled = (reason: unknown): void => {
  unhandled.push(reason);
};

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetDeviceStoreFailureForTests();
  unhandled = [];
  failures = [];
  process.on('unhandledRejection', onUnhandled);
  unsubscribe = subscribeDeviceStoreFailure((f) => {
    if (f) failures.push(f);
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
  process.off('unhandledRejection', onUnhandled);
  unsubscribe?.();
  vi.restoreAllMocks();
  container.remove();
});

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

async function mount(Page: FunctionComponent, waitFor: string): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Page));
  });
  await waitForText(text, waitFor);
}

/** ブラウザが容量超過で投げる形の例外。 */
function quota(): Error {
  const e = new Error('The quota has been exceeded. (検査)');
  e.name = 'QuotaExceededError';
  return e;
}

/** 保管層の 1 つの操作を、次から断らせる。 */
function failStore(method: 'remove' | 'update' | 'insertMany' | 'insert' | 'list'): void {
  vi.spyOn(getRecordStore(), method).mockRejectedValue(quota());
}

/** 知らせが届き、未処理の拒否が 1 件も無いまま落ち着くまで待つ。 */
async function expectReported(op: DeviceStoreFailure['op'], where: string): Promise<void> {
  await settleUntil(
    () => failures.some((f) => f.op === op && f.where === where),
    `知らせ (${op} / ${where}) が届く`,
  );
  // 未処理の拒否は、拒否のあと 1 巡してから報される —— 1 巡待ってから数える。
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
  expect(unhandled, '未処理の拒否 (受け取られない書き込みの失敗)').toEqual([]);
  expect(failures.find((f) => f.op === op && f.where === where)?.message).toContain('保存領域が一杯です');
}

/** その文字を含む表の行の「削除」を押す。 */
async function clickDeleteInRow(rowText: string, label = '削除'): Promise<void> {
  const button = await waitForElement(
    () =>
      Array.from(container.querySelectorAll('tr'))
        .find((tr) => tr.textContent?.includes(rowText))
        ?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"], button`) ?? null,
    `「${rowText}」の行の${label}`,
  );
  const target =
    Array.from(button.closest('tr')!.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
    ) ?? button;
  await act(async () => {
    target.click();
  });
}

/** 本物の `File` を選んだことにする。欄の値への書き込みを記録して返す (ファイルの欄を空にしたか)。 */
async function pickCsv(content: string): Promise<string[]> {
  const file = new File([content], 'import.csv');
  Object.defineProperty(file, 'text', { value: vi.fn(async () => content) });
  const input = await waitForElement(
    () => container.querySelector<HTMLInputElement>('input[type="file"]'),
    'CSV の file input',
  );
  const writes: string[] = [];
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  Object.defineProperty(input, 'value', {
    configurable: true,
    get: () => '',
    set: (v: string) => {
      writes.push(v);
    },
  });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  return writes;
}

describe('売上集計 — 保存が断られても宙に浮かせない', () => {
  it('★ 削除が断られたら知らせへ届け、行はそのまま (直す前は未処理の拒否)', async () => {
    await getRecordStore().insert(SALES_COLLECTION, { date: '2026-05-01', channel: 'amazon', amount: 1200, orders: 1, note: '削除の検査' });
    await mount(SalesPage, '削除の検査');
    failStore('remove');
    await clickDeleteInRow('削除の検査');
    await expectReported('delete', SALES_COLLECTION);
    expect(text()).toContain('削除の検査');
  });

  it('★ 取り込みの保存が断られたら、取り込みの欄が「1 件も入っていない」と言い、ファイルの欄を空にする (選び直せる)', async () => {
    await mount(SalesPage, 'CSV インポート');
    failStore('insertMany');
    const rows = [
      { date: '2026-05-01', channel: 'amazon' as const, amount: 200, orders: 2, note: '取り込み一' },
      { date: '2026-05-02', channel: 'shopify' as const, amount: 300, orders: 1, note: '取り込み二' },
    ];
    const writes = await pickCsv(salesToCsv(rows));
    await waitForText(text, importSaveFailedNote(2));
    await expectReported('save', SALES_COLLECTION);
    // 直す前は失敗した瞬間に関数を抜け、欄は空にならなかった (同じファイルを選び直しても何も走らない)
    expect(writes).toContain('');
    expect(text()).not.toContain('件を取り込みました');
    expect((await getRecordStore().list(SALES_COLLECTION)).length).toBe(0);
  });

  it('対照: 断られなければ同じ手順で取り込まれ、失敗の文は出ない', async () => {
    await mount(SalesPage, 'CSV インポート');
    await pickCsv(salesToCsv([{ date: '2026-05-01', channel: 'amazon', amount: 200, orders: 2, note: '対照の取り込み' }]));
    await waitForText(text, '1 件を取り込みました');
    expect(text()).not.toContain('1 件も取り込んでいません');
    expect(failures).toEqual([]);
  });
});

describe('KPI / BEP — 3 つの一覧の × と取り込み', () => {
  async function seedKpi(): Promise<void> {
    const base = { revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 300_000, depreciation: 0 };
    await getRecordStore().insert(KPI_ACTUALS_COLLECTION, { period: '2026-08', unit: '実績の検査事業', ...base });
    await getRecordStore().insert(KPI_BUDGETS_COLLECTION, { period: '2026-09', unit: '予算の検査事業', ...base });
    await getRecordStore().insert(BALANCE_SHEET_COLLECTION, {
      asOf: '2026-08-31',
      currentAssets: 600, inventory: 100, accountsReceivable: 100,
      fixedAssets: 400, currentLiabilities: 200, accountsPayable: 100,
      fixedLiabilities: 200, netIncome: 50,
    });
  }

  it('★ 実績の × が断られても宙に浮かせない', async () => {
    await seedKpi();
    await mount(KpiPage, '実績の検査事業');
    failStore('remove');
    await clickDeleteInRow('実績の検査事業');
    await expectReported('delete', KPI_ACTUALS_COLLECTION);
    expect(text()).toContain('実績の検査事業');
  });

  it('★ 予算の × が断られても宙に浮かせない', async () => {
    await seedKpi();
    await mount(KpiPage, '予算の検査事業');
    failStore('remove');
    await clickDeleteInRow('予算の検査事業');
    await expectReported('delete', KPI_BUDGETS_COLLECTION);
  });

  it('★ 貸借対照表の × が断られても宙に浮かせない', async () => {
    await seedKpi();
    await mount(KpiPage, '2026-08-31');
    failStore('remove');
    await clickDeleteInRow('2026-08-31');
    await expectReported('delete', BALANCE_SHEET_COLLECTION);
  });

  it('★ 実績の取り込みの保存が断られたら、取り込みの欄が言う', async () => {
    await mount(KpiPage, 'CSV インポート');
    failStore('insertMany');
    await pickCsv(
      kpiActualsToCsv([
        { period: '2026-07', unit: '取り込みの検査', revenue: 1_000, cogs: 100, advertising: 0, sga: 100, depreciation: 0 },
      ]),
    );
    await waitForText(text, importSaveFailedNote(1));
    await expectReported('save', KPI_ACTUALS_COLLECTION);
  });
});

describe('メンバー — 役割の変更と削除', () => {
  async function seedMembers(): Promise<void> {
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '一人目', email: 'a@example.com', role: 'owner' });
    await getRecordStore().insert(MEMBERS_COLLECTION, { name: '二人目', email: 'b@example.com', role: 'member' });
  }

  it('★ 役割の変更が断られても宙に浮かせない', async () => {
    await seedMembers();
    await mount(TeamPage, '二人目');
    failStore('update');
    const select = await waitForElement(
      () => Array.from(container.querySelectorAll('tr')).find((tr) => tr.textContent?.includes('二人目'))?.querySelector('select') ?? null,
      '「二人目」の役割の select',
    );
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
    await act(async () => {
      setter!.call(select, 'admin');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expectReported('save', MEMBERS_COLLECTION);
  });

  it('★ 削除が断られても宙に浮かせない', async () => {
    await seedMembers();
    await mount(TeamPage, '二人目');
    failStore('remove');
    await clickDeleteInRow('二人目');
    await expectReported('delete', MEMBERS_COLLECTION);
    expect(text()).toContain('二人目');
  });
});

describe('投資信託・不動産 — 自分の行の削除', () => {
  it('★ 保有銘柄の削除が断られても宙に浮かせない', async () => {
    await getRecordStore().insert(HOLDINGS_COLLECTION, {
      code: '', name: '削除の検査ファンド', units: 300_000, navPerUnit: 10_000,
      valuation: 300_000, valuationMode: 'auto', acquisitionCost: 300_000, ytdReturnPct: 1,
    });
    await mount(MutualFundsPage, '削除の検査ファンド');
    failStore('remove');
    await clickDeleteInRow('削除の検査ファンド');
    await expectReported('delete', HOLDINGS_COLLECTION);
    expect(text()).toContain('削除の検査ファンド');
  });

  it('★ 物件の削除が断られても宙に浮かせない', async () => {
    await getRecordStore().insert(PROPERTIES_COLLECTION, {
      name: '削除の検査物件', type: '区分', purchasePrice: 20_000_000, monthlyRent: 90_000, occupied: true,
    });
    await mount(RealEstatePage, '削除の検査物件');
    failStore('remove');
    await clickDeleteInRow('削除の検査物件');
    await expectReported('delete', PROPERTIES_COLLECTION);
    expect(text()).toContain('削除の検査物件');
  });
});

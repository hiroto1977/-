/** @vitest-environment jsdom */
/**
 * **自販機と無人販売店舗の欄は、見本ではなく利用者が記録した物だけを集計する** (2026-11-24)。
 *
 * PR #795 (2026-10-06) は同じ欄を同梱の見本 (自販機 6 台・店舗 2 店) で描いていた。
 * ここは実物の欄を実物の保管層 (fake-indexeddb) の上で描いて押す:
 * 記録する → 集計に出る → 稼働・補充を切り替える → 消す、と、
 * 読めない行は集計から外して件数を言い一覧には出すこと。
 *
 * 待ちは回数ではなく条件で取る (法則 `wait-for-condition-not-ticks`)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { VendingBusinessPanel } from '../VendingBusinessPanel';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import {
  UNMANNED_STORES_COLLECTION,
  VENDING_EMPTY_NOTE,
  VENDING_MACHINES_COLLECTION,
  type UnmannedStoreEntry,
  type VendingMachineEntry,
} from '../../data/vendingBusiness';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntilAsync, waitForElement, waitForText } from '../../__tests__/jsdomWait';

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
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
});

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const q = <T extends Element>(sel: string): T | null => container.querySelector<T>(sel);
const field = (label: string): HTMLInputElement => {
  const el = q<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`入力欄「${label}」が無い`);
  return el;
};
const tile = (name: string): string => (q(`[data-vending-tile="${name}"]`)?.textContent ?? '').replace(/\s+/g, ' ');

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(VendingBusinessPanel));
  });
  await waitForElement(() => q('input[aria-label="自販機の名前"]'), '自販機の入力欄');
}

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof window.HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

async function press(label: string): Promise<void> {
  const button = await waitForElement(
    () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label)) ?? null,
    `ボタン「${label}」`,
  );
  await act(async () => {
    button.click();
  });
}

async function addMachine(name: string, placement: string, revenue: string): Promise<void> {
  await act(async () => {
    setValue(field('自販機の名前'), name);
    setValue(q<HTMLSelectElement>('select[aria-label="自販機の設置場所"]')!, placement);
    setValue(field('自販機の月の売上'), revenue);
  });
  await press('＋ 自販機を記録');
}

async function addStore(name: string, revenue: string, customers: string, loss: string): Promise<void> {
  await act(async () => {
    setValue(field('無人店舗の名前'), name);
    setValue(field('無人店舗の月の売上'), revenue);
    setValue(field('無人店舗の月の客数'), customers);
    setValue(field('無人店舗のロス率'), loss);
  });
  await press('＋ 無人店舗を記録');
}

const machines = async (): Promise<VendingMachineEntry[]> =>
  (await getRecordStore().list<VendingMachineEntry>(VENDING_MACHINES_COLLECTION)).map((r) => r.data);

describe('自販機・無人店舗 —— 記録が無いとき', () => {
  it('見本を 1 件も出さず、案内を出す (集計のタイルも無い)', async () => {
    await mount();
    await waitForElement(() => q('[data-vending-empty]'), '記録が無いときの案内');
    expect(q('[data-vending-empty]')?.textContent).toBe(VENDING_EMPTY_NOTE);
    expect(q('[data-vending-tile]')).toBeNull();
    expect(q('[data-vending-machine]')).toBeNull();
    // PR #795 の同梱見本の名前は出ない (標本: 直す前の欄はこの名前を並べていた)。
    const OLD_SAMPLES = ['オフィスA 1F', '東口駅前', '無人販売店舗A (住宅街)'];
    for (const s of OLD_SAMPLES) expect(text()).not.toContain(s);
  });
});

describe('自販機・無人店舗 —— 記録する・切り替える・消す', () => {
  it('★ 記録した自販機と店がそのまま集計になる', async () => {
    await mount();
    await addMachine('本社1階', 'office', '100,000');
    await waitForElement(() => q('[data-vending-machine]'), '自販機の行');
    await addMachine('駅のホーム', 'station', '300000');
    await settleUntilAsync(async () => (await machines()).length === 2, '自販機 2 台');
    await addStore('駅前 無人店', '400000', '500', '2');
    await waitForElement(() => q('[data-vending-store]'), '店の行');

    await waitForText(() => tile('combined'), '¥800,000');
    expect(tile('combined')).toBe('両事業の月の売上¥800,000自販機 2 台・無人店舗 1 店');
    expect(tile('operating')).toBe('自販機の稼働率100.0%2 / 2 台が稼働');
    expect(tile('average')).toBe('自販機 1 台あたりの月の売上¥200,000合計 ¥400,000');
    expect(tile('spend')).toBe('無人店舗の客単価¥800客数 500 人');
    expect(tile('loss')).toBe('無人店舗のロス率 (売上で重み付け)2.0%売上 ¥400,000');
    expect(q('[data-vending-placement="station"]')?.textContent).toBe('駅1¥300,000');
    expect(q('[data-vending-empty]')).toBeNull();
    // 記録した後、名前と売上の欄は空に戻り、設置場所は残る。
    expect(field('自販機の名前').value).toBe('');
    expect(q<HTMLSelectElement>('select[aria-label="自販機の設置場所"]')?.value).toBe('station');
  });

  it('★ 稼働・補充を切り替えると、稼働率と一覧が動き保管層へ届く', async () => {
    await mount();
    await addMachine('倉庫前', 'factory', '50000');
    await waitForText(() => tile('operating'), '100.0%');

    const operating = q<HTMLInputElement>('input[aria-label="自販機「倉庫前」は稼働中"]')!;
    await act(async () => {
      operating.click();
    });
    await waitForText(() => tile('operating'), '0.0%');
    await waitForElement(() => q('[data-vending-stopped]'), '止まっている台の断り');
    expect(q('[data-vending-stopped]')?.textContent).toBe('止まっている自販機 1 台: 倉庫前');

    const restock = q<HTMLInputElement>('input[aria-label="自販機「倉庫前」は補充が要る"]')!;
    await act(async () => {
      restock.click();
    });
    await waitForElement(() => q('[data-vending-restock]'), '補充が要る台の断り');
    expect(q('[data-vending-restock]')?.textContent).toBe('補充が要る自販機 1 台: 倉庫前');
    expect(await machines()).toEqual([{ name: '倉庫前', placement: 'factory', monthlyRevenue: 50_000, operational: false, needsRestock: true }]);
  });

  it('× で消すと一覧からも保管層からも消え、案内に戻る', async () => {
    await mount();
    await addMachine('消す台', 'other', '1');
    await waitForElement(() => q('button[aria-label="自販機「消す台」を削除"]'), '削除ボタン');
    await act(async () => {
      q<HTMLButtonElement>('button[aria-label="自販機「消す台」を削除"]')!.click();
    });
    await waitForElement(() => q('[data-vending-empty]'), '記録が無いときの案内');
    expect(await machines()).toEqual([]);
  });

  it('入力の誤りは保存せずに理由を言い、入力を残す', async () => {
    await mount();
    await addStore('客数を入れ忘れた店', '1000', '', '0');
    await waitForElement(() => q('[data-vending-store-error]'), '入力の断り');
    expect(q('[data-vending-store-error]')?.textContent).toBe('月の客数が未入力です（0 なら 0 と入力してください）');
    expect(field('無人店舗の名前').value).toBe('客数を入れ忘れた店');
    expect(await getRecordStore().list(UNMANNED_STORES_COLLECTION)).toEqual([]);
  });
});

describe('自販機・無人店舗 —— 保管層に読めない行が在るとき', () => {
  it('★ 集計から外して件数を言い、一覧には出して × で消せる', async () => {
    const st = getRecordStore();
    await st.insert(VENDING_MACHINES_COLLECTION, { name: '正しい台', placement: 'office', monthlyRevenue: 100_000, operational: true, needsRestock: false });
    await st.insert(VENDING_MACHINES_COLLECTION, { name: '壊れた台', placement: 'rooftop', monthlyRevenue: 9_999_999, operational: true, needsRestock: false });
    await st.insert(UNMANNED_STORES_COLLECTION, { name: '壊れた店', monthlyRevenue: 1, monthlyCustomers: 1, lossRatePct: 500 } satisfies Record<keyof UnmannedStoreEntry, unknown>);
    await mount();
    await waitForElement(() => q('[data-vending-unreadable]'), '読めない行の断り');
    expect(q('[data-vending-unreadable]')?.textContent).toContain('自販機 1 台・無人店舗 1 店');
    expect(tile('combined')).toBe('両事業の月の売上¥100,000自販機 1 台・無人店舗 0 店');
    // 読めない行も一覧に出ていて、× で消せる。
    expect(text()).toContain('壊れた台');
    expect(text()).toContain('設置場所が読めません');
    expect(text()).toContain('ロス —');
    await act(async () => {
      q<HTMLButtonElement>('button[aria-label="自販機「壊れた台」を削除"]')!.click();
    });
    await settleUntilAsync(async () => (await machines()).length === 1, '壊れた台が消える');
  });
});

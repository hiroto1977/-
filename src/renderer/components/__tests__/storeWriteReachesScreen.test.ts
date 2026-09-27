/** @vitest-environment jsdom */
/**
 * **背骨 —— 同じ画面の隣の欄が、復元に追いつくか** (2026-09-24 · パス 448)。
 *
 * 設定画面は `BackupPanel` (SettingsPage:1125) と `ParametersPanel` (:1132) を
 * 並べて描く。2026-09-24 まで、復元は `getRecordStore().importAll(...)` を直接
 * 叩いており、知らせる仕組みは `useCollection` の中に在った —— **隣の欄は
 * 復元する前の値のまま**だった。実測 (直す前・消費税率の上書き 5% を 25% の控えで置換):
 *
 * ```
 * 復元の前: 有効値=0.05
 * 復元の後: 有効値=0.05   ← 画面と、そこから計算する税額
 * 保管層:   [{"values":{"tax.consumptionStandardRate":0.25}}]
 * ```
 *
 * 画面は「復元しました」と言い、**その隣で復元前の率が税額を作り続ける**。
 * ここは実物の 2 つのパネルを 1 つの root に並べ、実物の File を渡して押す。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { join } from 'node:path';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { BackupPanel } from '../BackupPanel';
import { ParametersPanel } from '../ParametersPanel';
import { getRecordStore, type StoredRecord } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { PARAMETER_OVERRIDES_COLLECTION } from '../../data/parameterOverrides';
import { serializeBackup } from '../../data/backup';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil, waitForText } from '../../__tests__/jsdomWait';

/** 消費税率 (標準) —— 台帳の値で、税の画面が読む。 */
const PID = 'tax.consumptionStandardRate';

let container: HTMLDivElement;
let root: Root | null = null;
const originalConfirm = window.confirm;

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

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => { r.unmount(); });
  }
  container.remove();
  window.confirm = originalConfirm;
});

/** 設定画面と同じ並び (復元の上に控え、その下にパラメータ)。 */
async function mountBoth(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Fragment, null, createElement(BackupPanel), createElement(ParametersPanel)));
  });
  await settleUntil(
    () => container.querySelector('input[type="file"]') !== null,
    '復元のファイル欄が出る',
  );
}

/** パラメータ欄が今出している値 (画面が読み、計算が使う側)。 */
function shownValue(): string | null {
  const row = container.querySelector(`[data-parameter="${PID}"]`);
  const input = row?.querySelector('input');
  return input instanceof HTMLInputElement ? input.value : null;
}

/** 検索で 1 件に絞る (全件を描くと目的の欄が畳まれている)。 */
async function focusParameter(): Promise<void> {
  const search = container.querySelector<HTMLInputElement>('input[aria-label="パラメータを検索"]');
  if (!search) throw new Error('検索欄が無い');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(search, '消費税率');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settleUntil(() => shownValue() !== null, 'パラメータ欄が出る');
}

async function chooseFile(content: string, name: string): Promise<void> {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('file input missing');
  Object.defineProperty(input, 'files', { value: [new File([content], name)], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function checkReplace(): Promise<void> {
  const box = container.querySelector<HTMLInputElement>('input[type="checkbox"][data-backup-replace]');
  if (!box) throw new Error('replace checkbox missing');
  await act(async () => { box.click(); });
  expect(box.checked).toBe(true);
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

/** 控えの中の上書き 1 件。 */
function overrideRecord(value: number): StoredRecord {
  return {
    id: 'restored-parameters',
    collection: PARAMETER_OVERRIDES_COLLECTION,
    createdAt: 1,
    updatedAt: 1,
    data: { values: { [PID]: value } },
  };
}

describe('復元は、同じ画面の隣の欄に届く', () => {
  it('★ 置換復元のあと、パラメータ欄は控えの値に変わる', async () => {
    await getRecordStore().insert(PARAMETER_OVERRIDES_COLLECTION, { values: { [PID]: 0.05 } });
    await mountBoth();
    await focusParameter();
    expect(shownValue()).toBe('5');

    window.confirm = vi.fn(() => true);
    const backup = await serializeBackup([overrideRecord(0.25)], new Date('2026-06-01T12:00:00Z'));
    await checkReplace();
    await chooseFile(backup, 'params.json');
    await waitForText(text, 'レコードを復元しました');

    await settleUntil(() => shownValue() === '25', 'パラメータ欄が 25 になる');
    expect(shownValue()).toBe('25');
  });

  it('★ マージ復元でも届く (置換だけの直しにしない)', async () => {
    const local = await getRecordStore().insert(PARAMETER_OVERRIDES_COLLECTION, { values: { [PID]: 0.05 } });
    await mountBoth();
    await focusParameter();
    expect(shownValue()).toBe('5');

    const backup = await serializeBackup(
      [{ ...overrideRecord(0.18), id: local.id, updatedAt: local.updatedAt + 60_000, createdAt: local.createdAt }],
      new Date('2026-06-01T12:00:00Z'),
    );
    await chooseFile(backup, 'params-merge.json');
    await waitForText(text, 'レコードを復元しました');

    await settleUntil(() => shownValue() === '18', 'パラメータ欄が 18 になる');
    expect(shownValue()).toBe('18');
  });

  it('対照: 復元していなければ、欄は利用者が置いた値のまま', async () => {
    await getRecordStore().insert(PARAMETER_OVERRIDES_COLLECTION, { values: { [PID]: 0.05 } });
    await mountBoth();
    await focusParameter();
    expect(shownValue()).toBe('5');
  });
});

describe('2 つのパネルは同じ画面に在る', () => {
  it('設定画面が復元とパラメータの両方を描く (この検査の前提)', () => {
    const src = readOriginalSource(join(process.cwd(), 'src/renderer/pages/SettingsPage.tsx'));
    expect(src).toContain('<BackupPanel />');
    expect(src).toContain('<ParametersPanel />');
  });
});

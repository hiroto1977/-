/** @vitest-environment jsdom */
/**
 * **ロットを消した後の status 文も、保管した id には天井を通す。** (2026-10-31 · パス 570)
 *
 * パス 419 / 420 は水耕栽培の表・一覧の描画を `batchIdText` で天井済みにした。
 * ところが `removeBatch` の status 文 3 つ (控えが見つかりません / 削除できませんでした /
 * 削除しました) は保管した id (`b.id`) を**素で**文へ入れていた。復元・手編集 JSON・旧版は
 * 入口 (`parseBatch` は 40 字で断る) を通らないので、200,000 字の id を持つロットの
 * 「削除」を押すと status 文が 200,000 字に膨れた (view-time ではなく action-triggered)。
 *
 * 直しは「表示だけ天井」(パス 420 の規律): 文に入れる名前を `batchIdText` にし、探す・消すのは
 * 全文の id のまま (同一性の鍵は切らない)。正当な id (≤ 40) は 1 字も変わらない。
 *
 * 背骨は振る舞い —— 実物の保管層へ入れて実物の画面を描き、実際に「削除」を押す。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HydroponicsPage } from '../HydroponicsPage';
import { getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { MAX_BATCH_ID_CHARS } from '../../../shared/hydroponicsControl';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';

const BIG = 'x'.repeat(200_000);
const SHORT = 'lot-001';

const batch = (id: string) => ({
  id,
  cropId: 'lettuce',
  sowDate: '2026-01-01',
  panels: 1,
  state: 'nursery',
  transplantedDate: null,
  harvestedDate: null,
  solutionChangedDate: null,
  note: 'メモ',
});

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: vi.fn(() => Promise.resolve({ ok: false, code: 'x', message: 'x' })),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    storageProtection: () => Promise.resolve({ mechanism: 'none', counts: {} }),
    checkUpdate: () => Promise.resolve({ ok: true }),
    revealInFolder: () => Promise.resolve({ ok: true }),
    openPath: () => Promise.resolve({ ok: true }),
    setColorScheme: () => Promise.resolve(),
    eraseAll: () => Promise.resolve({ ok: true }),
    authorize: () => Promise.resolve({ ok: false }),
  };
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined }),
      configurable: true,
    });
  }
  for (const n of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[n] !== 'function') {
      Object.defineProperty(Element.prototype, n, { value: () => undefined, configurable: true, writable: true });
    }
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(window, 'confirm').mockImplementation(() => true);
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) { const r = root; root = null; act(() => { r.unmount(); }); }
  container.remove();
  vi.restoreAllMocks();
});

/** 画面を描き、ロット `id` の行が出るのを待って「削除」を押す。 */
async function mountAndRemove(id: string): Promise<string> {
  root = createRoot(container);
  const r = root;
  await act(async () => { r.render(createElement(HydroponicsPage)); });
  const btn = await waitForElement(
    () => container.querySelector<HTMLButtonElement>('button[data-hydroponics-remove-batch]'),
    'ロットの「削除」ボタン',
  );
  expect(btn.getAttribute('data-hydroponics-remove-batch')).toBe(id);
  await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  return container.textContent ?? '';
}

describe('ロット削除後の status 文の天井 (パス 570)', () => {
  it('★ 成功: 200,000 字の id でも文は天井で切り、切ったことを述べる', async () => {
    await getRecordStore().insert('hydroponics-batches', batch(BIG));
    await mountAndRemove(BIG);
    await waitForText(() => container.textContent ?? '', 'を削除しました');
    const t = container.textContent ?? '';
    expect(t.length, `画面が ${t.length} 字 (直す前は ~200,000)`).toBeLessThan(20_000);
    expect(t).toContain(`ロット "${'x'.repeat(MAX_BATCH_ID_CHARS)}…" を削除しました`);
    // 探す・消すのは全文の id のまま —— 行が実際に消えている。
    const left = await getRecordStore().list('hydroponics-batches');
    expect(left.length).toBe(0);
  }, 30_000);

  it('★ 失敗: 端末が断っても文は天井で切る', async () => {
    await getRecordStore().insert('hydroponics-batches', batch(BIG));
    vi.spyOn(getRecordStore(), 'remove').mockRejectedValue(new Error('quota'));
    await mountAndRemove(BIG);
    await waitForText(() => container.textContent ?? '', 'を削除できませんでした');
    const t = container.textContent ?? '';
    expect(t.length, `画面が ${t.length} 字`).toBeLessThan(20_000);
    expect(t).toContain(`ロット "${'x'.repeat(MAX_BATCH_ID_CHARS)}…" を削除できませんでした`);
  }, 30_000);

  it('正当な id (≤ 40) は 1 字も変わらない', async () => {
    await getRecordStore().insert('hydroponics-batches', batch(SHORT));
    await mountAndRemove(SHORT);
    await waitForText(() => container.textContent ?? '', 'を削除しました');
    const t = container.textContent ?? '';
    expect(t).toContain(`ロット "${SHORT}" を削除しました`);
    expect(t).not.toContain(`${SHORT}…`);
  }, 30_000);
});

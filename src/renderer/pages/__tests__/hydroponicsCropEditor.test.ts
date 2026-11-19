/** @vitest-environment jsdom */
/**
 * **水耕栽培の運転管理の画面で、品目を増やす・減らすができる。** (2026-11-19)
 *
 * 品目を増減する欄は経営サマリーの試算の中にだけ在った。ロットを足そうとして品目の一覧を
 * 開いた人は、足したい品目が無いと別の画面へ探しに行くことになっていた (利用者の依頼:
 * 「品目をこの画面で増減出来る様にして」)。同じ欄 (`CropListEditor`) をロットの所にも置く。
 *
 * 背骨は振る舞い —— 実物の保管層と実物の画面で、実際に打って押す:
 * - 足した品目はロットの品目の選択肢に出て、そのまま選ばれる (保管層にも入る)
 * - 消した品目は選択肢から消える (保管層からも)
 * - 消した品目を使うロットが在れば、消した所でそう言う (ロットは消さない)
 * - 最後の 1 品目は消せない
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
import { settleUntil, waitForElement, waitForText } from '../../__tests__/jsdomWait';
import { HYDROPONIC_CROPS_COLLECTION, cropListFromRecords, type HydroponicCropListRecord } from '../../data/hydroponicsSetup';
import { CROP_FIELD_LABELS, DEFAULT_CROP_LIST, removedCropLotsNote } from '../../../shared/hydroponicCrops';

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

const text = (): string => container.textContent ?? '';

/** 画面を描き、品目を増減する欄が出るのを待つ (一覧が保管層から届いた印)。 */
async function mount(): Promise<HTMLElement> {
  root = createRoot(container);
  const r = root;
  await act(async () => { r.render(createElement(HydroponicsPage)); });
  return waitForElement(
    () => container.querySelector<HTMLElement>('[data-crop-list-editor]'),
    '品目を増やす・減らす欄',
  );
}

/** 実際の入力として流す (素の代入では React に届かない)。 */
async function typeInto(el: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter が無い');
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settleUntil(() => el.value === value, '欄に値が入る');
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function buttonByText(scope: HTMLElement, label: string): HTMLButtonElement {
  const b = [...scope.querySelectorAll('button')].find((x) => x.textContent?.trim() === label);
  if (b === undefined) throw new Error(`「${label}」のボタンが無い`);
  return b;
}

/** ロットの品目の選択肢 (この画面で利用者が見る一覧)。 */
function lotCropSelect(): HTMLSelectElement {
  const s = container.querySelector<HTMLSelectElement>('select[data-hydroponics-input="batch-crop"]');
  if (s === null) throw new Error('ロットの品目の select が無い');
  return s;
}
const lotCropLabels = (): string[] => [...lotCropSelect().options].map((o) => o.textContent ?? '');

/** 保管層の今の品目の一覧。 */
async function storedCrops(): Promise<readonly { id: string; label: string }[]> {
  const records = await getRecordStore().list<HydroponicCropListRecord>(HYDROPONIC_CROPS_COLLECTION);
  return cropListFromRecords(records);
}

const BASIL = DEFAULT_CROP_LIST.find((c) => c.id === 'basil')!;

describe('水耕栽培の画面で品目を増やす・減らす', () => {
  it('欄はロットの品目の選択より前に在り、今の品目の数を言う', async () => {
    const editor = await mount();
    expect(editor.querySelector('summary')?.textContent).toContain(`品目を増やす・減らす（現在 ${DEFAULT_CROP_LIST.length} 品目）`);
    // DOM の順 = 読む順。選ぶ欄より前に「増やせる」ことが分かる。
    const pos = editor.compareDocumentPosition(lotCropSelect());
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  }, 30_000);

  it('★ 足した品目は、ロットの品目の選択肢に出て選ばれ、保管層にも入る', async () => {
    const editor = await mount();
    expect(lotCropLabels()).not.toContain('ミズナ');
    await typeInto(editor.querySelector<HTMLInputElement>('input[aria-label="品目名"]')!, 'ミズナ');
    await click(buttonByText(editor, 'この品目を足す'));
    await waitForText(text, '「ミズナ」を足して、下のロットの品目に選びました。');

    expect(lotCropLabels()).toContain('ミズナ');
    const select = lotCropSelect();
    expect(select.options[select.selectedIndex]?.textContent).toBe('ミズナ');
    const stored = await storedCrops();
    expect(stored.map((c) => c.label)).toContain('ミズナ');
    expect(stored).toHaveLength(DEFAULT_CROP_LIST.length + 1);
    expect(editor.querySelector('summary')?.textContent).toContain(`現在 ${DEFAULT_CROP_LIST.length + 1} 品目`);
  }, 30_000);

  it('★ 消した品目は、ロットの品目の選択肢からも保管層からも消える', async () => {
    // **別の品目**のロットを置く —— 数えるのは消した品目のロットだけ (全ロットではない)。
    await getRecordStore().insert('hydroponics-batches', {
      id: 'lot-other', cropId: 'leaf-lettuce', sowDate: '2026-01-01', panels: 1, state: 'nursery',
      transplantedDate: null, harvestedDate: null, solutionChangedDate: null, note: '',
    });
    const editor = await mount();
    await waitForElement(() => container.querySelector('[data-hydroponics-batch="lot-other"]'), '別の品目のロットの行');
    expect(lotCropLabels()).toContain(BASIL.label);
    await click(editor.querySelector<HTMLButtonElement>(`button[aria-label="${BASIL.label} を消す"]`)!);
    await waitForText(text, `「${BASIL.label}」を消しました。`);

    expect(lotCropLabels()).not.toContain(BASIL.label);
    expect((await storedCrops()).map((c) => c.id)).not.toContain('basil');
    // その品目のロットは無いので、ロットの文は添えない。
    expect(text()).not.toContain('この品目のロットが');
    // 針が当たること: ロットが在るときの文は、この綴りを持つ。
    expect(removedCropLotsNote(1)).toContain('この品目のロットが');
  }, 30_000);

  it('★ 消した品目を使うロットが在れば、消した所でそう言い、ロットは消さない', async () => {
    await getRecordStore().insert('hydroponics-batches', {
      id: 'lot-basil', cropId: 'basil', sowDate: '2026-01-01', panels: 1, state: 'nursery',
      transplantedDate: null, harvestedDate: null, solutionChangedDate: null, note: '',
    });
    const editor = await mount();
    await waitForElement(() => container.querySelector('[data-hydroponics-batch="lot-basil"]'), 'ロットの行');
    await click(editor.querySelector<HTMLButtonElement>(`button[aria-label="${BASIL.label} を消す"]`)!);
    await waitForText(text, `「${BASIL.label}」を消しました。${removedCropLotsNote(1)!}`);

    expect(await getRecordStore().list('hydroponics-batches')).toHaveLength(1);
    expect(container.querySelector('[data-hydroponics-batch="lot-basil"]')?.textContent).toContain('見つかりません');
  }, 30_000);

  it('入力が誤っていれば足さず、理由を言う (品目名が空)', async () => {
    const editor = await mount();
    await click(buttonByText(editor, 'この品目を足す'));
    await settleUntil(() => editor.querySelector('[role="status"]') !== null, '断りの文が出る');
    expect(editor.querySelector('[role="status"]')?.textContent).not.toContain('を足して');
    expect(await storedCrops()).toHaveLength(DEFAULT_CROP_LIST.length);
  }, 30_000);

  it('★ 足す欄の初期値は、保管層から届いた自分の品目から写す (届く前の参考値からではない)', async () => {
    // 自分の一覧は 1 品目だけで、育苗日数が参考値のどれとも違う。
    const mine = { ...BASIL, id: 'custom-1', label: '自分の品目', nurseryDays: 33 };
    expect(DEFAULT_CROP_LIST.map((c) => c.nurseryDays)).not.toContain(33);
    await getRecordStore().insert(HYDROPONIC_CROPS_COLLECTION, { crops: [mine] });
    const editor = await mount();
    const nursery = editor.querySelector<HTMLInputElement>(`input[aria-label="${CROP_FIELD_LABELS.nurseryDays}"]`)!;
    expect(nursery.value).toBe('33');
  }, 30_000);

  it('最後の 1 品目は消せない (ボタンが押せない)', async () => {
    await getRecordStore().insert(HYDROPONIC_CROPS_COLLECTION, { crops: [BASIL] });
    const editor = await mount();
    await settleUntil(() => lotCropLabels().length === 1, '品目が 1 つの一覧が届く');
    const remove = editor.querySelector<HTMLButtonElement>(`button[aria-label="${BASIL.label} を消す"]`)!;
    expect(remove.disabled).toBe(true);
  }, 30_000);
});

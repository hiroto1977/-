/** @vitest-environment jsdom */
/**
 * 経営サマリーの水耕栽培パネル — 品目の増減と入力欄の番人を**実物の record
 * store** (fake-indexeddb) を通して確かめる。純粋関数の検査
 * (`hydroponicCrops.test.ts`) は一覧の増減の規則を、ここは「押したら保存され、
 * 読み直しても残り、select に出る」を見る。
 *
 * 最新の 1 件を採用する読み方 (`latestRecord`) もここで実機同様に通る:
 * 2 回目の保存が画面に出なければ落ちる (旧い読み方は末尾 = 最古を「最新」と
 * していたので、2 回目から画面が動かなかった)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import {
  HYDROPONICS_COLLECTION,
  HYDROPONIC_CROPS_COLLECTION,
  type HydroponicCropListRecord,
  type HydroponicsSetup,
} from '../../data/hydroponicsSetup';
import { latestRecord } from '../../data/latestRecord';

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

/** React の onChange を発火させる (native setter を通さないと React が拾わない)。 */
function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('HTMLInputElement value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** IndexedDB の応答 (setTimeout 経由) と React の再描画を落ち着かせる。 */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mountOverview(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'overview');
  if (!def) throw new Error('overview service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

async function unmountOverview(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
}

const q = {
  labelInput: () => container.querySelector<HTMLInputElement>('input[aria-label="品目名"]')!,
  numInput: (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!,
  select: () => container.querySelector<HTMLSelectElement>('select[aria-label="品目"]')!,
  options: () => Array.from(q.select().options).map((o) => ({ value: o.value, label: o.textContent })),
  button: (text: string) => {
    const b = Array.from(container.querySelectorAll('button')).find((el) => el.textContent === text);
    if (!b) throw new Error(`button "${text}" not found`);
    return b;
  },
  removeButton: (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label} を消す"]`)!,
  status: () => container.querySelector('[role="status"]')?.textContent ?? '',
};

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
  });
  await settle();
}

async function savedCropLists(): Promise<readonly HydroponicCropListRecord[]> {
  const list = await getRecordStore().list<HydroponicCropListRecord>(HYDROPONIC_CROPS_COLLECTION);
  return list.map((r) => r.data);
}

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
  await unmountOverview();
  document.body.removeChild(container);
});

describe('経営サマリー — 水耕栽培の品目の増減', () => {
  it('初期表示は参考値の 5 品目で、どれも消せる (5 > 1)', async () => {
    await mountOverview();
    expect(q.options().map((o) => o.value)).toEqual(['leaf-lettuce', 'frill-lettuce', 'romaine', 'baby-leaf', 'basil']);
    expect(container.textContent).toContain('品目を増やす・減らす（現在 5 品目）');
    expect(q.removeButton('リーフレタス').disabled).toBe(false);
    expect(await savedCropLists()).toEqual([]);
  });

  it('品目名を入れて足すと保存され、select に出て、選択も切り替わる', async () => {
    await mountOverview();
    // 数値の欄は選んでいる品目 (リーフレタス) の値が写っている
    expect(q.numInput('定植後日数 (日)').value).toBe('10');
    await act(async () => { changeInput(q.labelInput(), 'ミズナ'); });
    await act(async () => { changeInput(q.numInput('定植後日数 (日)'), '20'); });
    await click(q.button('この品目を足す'));

    const saved = await savedCropLists();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.crops).toHaveLength(6);
    expect(saved[0]!.crops[5]).toMatchObject({ id: 'custom-1', label: 'ミズナ', growOutDays: 20, nurseryDays: 24 });
    expect(q.options().map((o) => o.label)).toContain('ミズナ');
    expect(q.select().value).toBe('custom-1');
    expect(q.status()).toContain('「ミズナ」を足して品目に選びました');
    expect(container.textContent).toContain('現在 6 品目');
  });

  it('形が通らなければ保存せず、欄ごとの指摘を出す', async () => {
    await mountOverview();
    await act(async () => { changeInput(q.numInput('定植後日数 (日)'), '0'); });
    await click(q.button('この品目を足す'));
    expect(await savedCropLists()).toEqual([]);
    expect(q.status()).toContain('品目名を入力してください');
    expect(q.status()).toContain('定植後日数 (日) は 1〜365 の整数で入力してください');
    expect(q.options()).toHaveLength(5);
  });

  it('2 回目の保存が画面に出る (最新 = createdAt 最大。末尾を最新と読むと 1 回目で止まる)', async () => {
    await mountOverview();
    await act(async () => { changeInput(q.labelInput(), 'ミズナ'); });
    await click(q.button('この品目を足す'));
    await act(async () => { changeInput(q.labelInput(), 'ホウレンソウ'); });
    await click(q.button('この品目を足す'));

    const saved = await getRecordStore().list<HydroponicCropListRecord>(HYDROPONIC_CROPS_COLLECTION);
    expect(saved).toHaveLength(2);
    expect(latestRecord(saved)!.data.crops.map((c) => c.label)).toContain('ホウレンソウ');
    expect(q.options().map((o) => o.label)).toEqual([
      'リーフレタス', 'フリルレタス', 'ロメインレタス', 'ベビーリーフ', 'バジル', 'ミズナ', 'ホウレンソウ',
    ]);
  });

  it('消すと保存され、select から消える。読み直しても残る', async () => {
    await mountOverview();
    await click(q.removeButton('ロメインレタス'));
    expect(q.status()).toContain('「ロメインレタス」を消しました');
    expect(q.options().map((o) => o.value)).toEqual(['leaf-lettuce', 'frill-lettuce', 'baby-leaf', 'basil']);
    expect(container.textContent).toContain('参考値の品目を戻す（ロメインレタス）');

    await unmountOverview();
    await mountOverview();
    expect(q.options().map((o) => o.value)).toEqual(['leaf-lettuce', 'frill-lettuce', 'baby-leaf', 'basil']);
  });

  it('参考値の品目を戻せる', async () => {
    await mountOverview();
    await click(q.removeButton('バジル'));
    await click(q.removeButton('ベビーリーフ'));
    await click(q.button('参考値の品目を戻す（ベビーリーフ・バジル）'));
    expect(q.options().map((o) => o.value)).toEqual(['leaf-lettuce', 'frill-lettuce', 'romaine', 'baby-leaf', 'basil']);
    expect(q.status()).toContain('参考値の品目を戻しました');
  });

  it('最後の 1 品目は消せない (ボタンが無効になり、一覧は空にならない)', async () => {
    await mountOverview();
    for (const label of ['リーフレタス', 'フリルレタス', 'ロメインレタス', 'ベビーリーフ']) {
      await click(q.removeButton(label));
    }
    expect(q.options().map((o) => o.value)).toEqual(['basil']);
    const last = q.removeButton('バジル');
    expect(last.disabled).toBe(true);
    await click(last);
    expect(q.options().map((o) => o.value)).toEqual(['basil']);
    const saved = await getRecordStore().list<HydroponicCropListRecord>(HYDROPONIC_CROPS_COLLECTION);
    expect(latestRecord(saved)!.data.crops).toHaveLength(1);
    expect(saved.every((r) => r.data.crops.length >= 1)).toBe(true);
  });

  it('足した品目を選んで設定を保存すると、設定レコードにその id が乗る', async () => {
    await mountOverview();
    await act(async () => { changeInput(q.labelInput(), 'ミズナ'); });
    await click(q.button('この品目を足す'));
    await click(q.button('保存して経営サマリーへ反映'));
    const setups = await getRecordStore().list<HydroponicsSetup>(HYDROPONICS_COLLECTION);
    expect(setups).toHaveLength(1);
    expect(setups[0]!.data.cropId).toBe('custom-1');
    expect(container.textContent).toContain('保存しました。経営サマリーに反映されています。');
  });

  it('保存した設定の品目を消すと、先頭で試算している旨を出す', async () => {
    await mountOverview();
    await act(async () => { changeInput(q.labelInput(), 'ミズナ'); });
    await click(q.button('この品目を足す'));
    await click(q.button('保存して経営サマリーへ反映'));
    await click(q.removeButton('ミズナ'));
    expect(container.textContent).toContain('保存した設定の品目「custom-1」は一覧にありません。先頭の品目（リーフレタス）で試算しています。');
  });
});

describe('経営サマリー — 水耕栽培の設備入力の番人 (黙って 0 にしない)', () => {
  const guardMessage = (label: string): string => {
    const input = q.numInput(label);
    return input.parentElement?.textContent ?? '';
  };

  /** 実測値の欄は「低カリウム栽培として扱う」を入れたときだけ出る。 */
  const enableLowK = async (): Promise<void> => {
    const label = Array.from(container.querySelectorAll('label')).find((el) => el.textContent?.includes('低カリウム栽培として扱う'));
    const box = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!box) throw new Error('low-K checkbox not found');
    await click(box);
  };

  it('読めない値は fatal の文言を出し、aria-invalid が立つ (保存すると 0 で入る)', async () => {
    await mountOverview();
    await act(async () => { changeInput(q.numInput('床面積 (m²)'), '百'); });
    expect(q.numInput('床面積 (m²)').getAttribute('aria-invalid')).toBe('true');
    expect(guardMessage('床面積 (m²)')).toContain('「百」を数値として読み取れません。0 ㎡ として計算されています。');
    await click(q.button('保存して経営サマリーへ反映'));
    const setups = await getRecordStore().list<HydroponicsSetup>(HYDROPONICS_COLLECTION);
    expect(setups[0]!.data.floorAreaSqm).toBe(0);
  });

  it('単位語つき (10万) は単位を外すよう促す', async () => {
    await mountOverview();
    await act(async () => { changeInput(q.numInput('人件費 (円/月)'), '10万'); });
    expect(guardMessage('人件費 (円/月)')).toContain('単位付きのため読み取れません');
  });

  it('全角の数字は読める (以前は Number() が NaN にして 0 で計算していた)', async () => {
    await mountOverview();
    await act(async () => { changeInput(q.numInput('床面積 (m²)'), '１００'); });
    expect(q.numInput('床面積 (m²)').getAttribute('aria-invalid')).toBeNull();
    await click(q.button('保存して経営サマリーへ反映'));
    const setups = await getRecordStore().list<HydroponicsSetup>(HYDROPONICS_COLLECTION);
    expect(setups[0]!.data.floorAreaSqm).toBe(100);
  });

  it('試算が意味を失う欄は 0 を断り、費用の 0 は通す', async () => {
    await mountOverview();
    await act(async () => { changeInput(q.numInput('販売単価 (円/株)'), '0'); });
    expect(guardMessage('販売単価 (円/株)')).toContain('0 円 では計算できません。');
    await act(async () => { changeInput(q.numInput('地代家賃 (円/月)'), '0'); });
    expect(q.numInput('地代家賃 (円/月)').getAttribute('data-guard')).toBe('ok');
  });

  it('実測値は 0 も未入力も黙って通す (0 = 未測定 が仕様)', async () => {
    await mountOverview();
    await enableLowK();
    await act(async () => { changeInput(q.numInput('実測カリウム (mg/100g)'), ''); });
    expect(q.numInput('実測カリウム (mg/100g)').getAttribute('data-guard')).toBe('ok');
    await act(async () => { changeInput(q.numInput('実測カリウム (mg/100g)'), '0'); });
    expect(q.numInput('実測カリウム (mg/100g)').getAttribute('data-guard')).toBe('ok');
  });

  it('切替日数は日の単位で言う (kWh/kg や mg/L を借りない)', async () => {
    await mountOverview();
    await act(async () => { changeInput(q.numInput('電力原単位 (kWh/kg)'), 'abc'); });
    expect(guardMessage('電力原単位 (kWh/kg)')).toContain('0 kWh/kg として計算されています。');
    await enableLowK();
    await act(async () => { changeInput(q.numInput('切替 (収穫前・日)'), '7.5'); });
    expect(guardMessage('切替 (収穫前・日)')).toContain('整数で入力してください（現在 7.5）');
  });
});

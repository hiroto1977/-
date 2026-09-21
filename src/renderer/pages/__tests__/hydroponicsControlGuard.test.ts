/** @vitest-environment jsdom */
/**
 * **運転設定の入力に天井が効いていることを、画面で確かめる** (2026-09-21 · パス 373)。
 *
 * 純関数の検査 (`hydroponicsControlSpecs.test.ts`) は幅の台帳と読み側を見る。
 * ここが見るのは**配達の側** —— 桁違いを打ったときに
 * ① ⛔ の文が出て ② **保存されない** こと。
 * 保存はやり直せない種類の失敗である: 判定は出し直せるが、
 * **保存した値は残り、以後すべての調製の指示がそれを読む** (パス 214 と同じ理由)。
 *
 * 待ちは**条件で**行う (`jsdomWait`) —— 固定回数は負荷の下で嘘をつく (パス 369)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests, getRecordStore } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { HYDROPONICS_CONTROL_COLLECTION } from '../../data/hydroponicsLog';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';

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

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('HTMLInputElement value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'hydroponics');
  if (!def) throw new Error('hydroponics service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
}

const text = (): string => container.textContent ?? '';
const q = <T extends Element>(sel: string): T | null => container.querySelector<T>(sel);

async function savedCount(): Promise<number> {
  return (await getRecordStore().list(HYDROPONICS_CONTROL_COLLECTION)).length;
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
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
});

describe('運転設定の入力は桁違いを断る (パス 373)', () => {
  it('★ 欄は日本語のラベルで出る (生の鍵名ではない)', async () => {
    await mount();
    const edit = await waitForElement(() => q<HTMLButtonElement>('[data-hydroponics-edit-control]'), '設定を編集');
    await act(async () => {
      edit.click();
    });
    await waitForText(text, '養液タンクの容量');
    expect(text(), '生の鍵名がそのまま出ている').not.toContain('waterTempLowC');
  });

  it('★ 桁違いのタンク容量は ⛔ になり、保存されない', async () => {
    await mount();
    const edit = await waitForElement(() => q<HTMLButtonElement>('[data-hydroponics-edit-control]'), '設定を編集');
    await act(async () => {
      edit.click();
    });
    const tank = await waitForElement(
      () => q<HTMLInputElement>('[data-hydroponics-control-field="tankLiters"] input'),
      'タンク容量の欄',
    );
    await act(async () => {
      changeInput(tank, '1000000000000');
    });
    const save = await waitForElement(() => q<HTMLButtonElement>('[data-hydroponics-save="control"]'), '保存ボタン');
    await act(async () => {
      save.click();
    });
    await waitForText(text, '養液タンクの容量');
    const err = await waitForElement(() => q('[data-hydroponics-error="control"]'), '断りの文');
    expect(err.textContent ?? '', '欄を名指ししていない').toContain('養液タンクの容量');
    expect(await savedCount(), '⛔ のまま保存されている').toBe(0);
  });

  it('★ 対照: 幅の内なら保存される (門が広すぎ / 狭すぎでない)', async () => {
    await mount();
    const edit = await waitForElement(() => q<HTMLButtonElement>('[data-hydroponics-edit-control]'), '設定を編集');
    await act(async () => {
      edit.click();
    });
    const tank = await waitForElement(
      () => q<HTMLInputElement>('[data-hydroponics-control-field="tankLiters"] input'),
      'タンク容量の欄',
    );
    await act(async () => {
      changeInput(tank, '1000');
    });
    const save = await waitForElement(() => q<HTMLButtonElement>('[data-hydroponics-save="control"]'), '保存ボタン');
    await act(async () => {
      save.click();
    });
    await waitForText(text, '運転の設定を保存しました');
    expect(await savedCount(), '正当な値が保存されていない').toBe(1);
  });

  it('★ 既に保存されている桁違いは、既定へ倒したことを画面が言う', async () => {
    await getRecordStore().insert(HYDROPONICS_CONTROL_COLLECTION, {
      waterTempLowC: 18,
      waterTempHighC: 22,
      airTempLowC: 18,
      airTempHighC: 25,
      humidityLowPct: 60,
      humidityHighPct: 80,
      co2LowPpm: 400,
      co2HighPpm: 1500,
      dissolvedOxygenLowMgL: 5,
      waterLevelLowPct: 60,
      tankLiters: 1e12,
      stockEcRisePerMlPerL: null,
      alkalinityMgCaCO3PerL: null,
      acidNormality: null,
      residualAlkalinityMgCaCO3PerL: 30,
      solutionChangeIntervalDays: 14,
      readingStaleDays: 3,
      harvestNoticeDays: 3,
    });
    await mount();
    const note = await waitForElement(() => q('[data-hydroponics-control-out-of-range]'), '倒したことの断り');
    expect(note.textContent ?? '', '欄を名指ししていない').toContain('養液タンクの容量');
    expect(note.getAttribute('role'), '読み上げに乗らない').toBe('alert');
  });
});

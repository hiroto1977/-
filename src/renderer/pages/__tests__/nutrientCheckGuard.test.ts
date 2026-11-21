/** @vitest-environment jsdom */
/**
 * **経営サマリーの養液の点検は、読めない値について判定を言わない** (2026-09-27 · パス 493q)。
 *
 * ## 見つけた物 (実測・直す前)
 *
 * 養液 EC / pH の 2 欄は素の `<input>` で、`readNumberOr0` が読めない値を**黙って 0** にし、
 * 2 欄とも空でなければ判定を出していた。EC に小数の区切りをカンマで打つ (`1,2`) か単位を付ける
 * (`1.0mS`) と、EC 0 として判定し:
 *
 * ```
 *   範囲外です — EC は 0.8〜1.2 mS/cm が目安。EC が高すぎるとレタス類は苦味が出ます。
 * ```
 *
 * —— **打っていない値について、利用者の養液が範囲外だと言っていた**。
 *
 * ## 直し
 *
 * 2 欄を関門 (`GuardedNumber`) にし、読めない値・妥当範囲 (`READING_FIELD_SPECS` —— 水耕栽培の
 * 記録の画面と同じ幅) の外は判定を断る (`refusedBy: 'judgement'`)。断りの文 (`[data-refused-fields]`)
 * が欄を名指しする。空欄は今までどおり判定しない (2 つとも入れたときだけ判定する)。
 *
 * ここは実物の経営サマリーを描いて、実際に打つ。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { readNumberOr0 } from '../../data/inputGuards';
import { HYDROPONIC_CROPS, checkNutrientSolution } from '../../../shared/hydroponics';
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

let container: HTMLDivElement;
let root: Root | null = null;

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
  const def = SERVICES.find((s) => s.id === 'overview');
  if (!def) throw new Error('overview service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await waitForElement(() => ecField(), '養液 EC の欄');
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

const EC = '養液 EC (mS/cm)';
const PH = '養液 pH';
const ecField = (): HTMLInputElement | null => container.querySelector<HTMLInputElement>(`input[aria-label="${EC}"]`);
const phField = (): HTMLInputElement | null => container.querySelector<HTMLInputElement>(`input[aria-label="${PH}"]`);
const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');
const refusedNote = (): string =>
  Array.from(container.querySelectorAll('[data-refused-fields]'))
    .map((n) => n.textContent ?? '')
    .join(' / ');

async function type(input: HTMLInputElement | null, value: string): Promise<void> {
  if (!input) throw new Error('欄が無い');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('HTMLInputElement value setter not found');
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** 既定の品目 (`HYDROPONICS_DEFAULTS.cropId`) —— 範囲は品目の表から読む (数を写さない)。 */
const crop = HYDROPONIC_CROPS['leaf-lettuce'];
const midEc = String((crop.ecLow + crop.ecHigh) / 2);
const midPh = String((crop.phLow + crop.phHigh) / 2);

describe('経営サマリーの養液の点検 — 読めない値について判定を言わない (パス 493q)', () => {
  it('標本: 直す前の読み方では「1,2」は EC 0 になり、判定は「範囲外」になる', () => {
    expect(readNumberOr0('1,2')).toBe(0);
    expect(readNumberOr0('1.0mS')).toBe(0);
    expect(checkNutrientSolution(crop, readNumberOr0('1,2'), Number(midPh)).ok).toBe(false);
  });

  it('★ EC に「1,2」(小数の区切りがカンマ) —— 判定を断り、欄を名指しする。「範囲外です」とは言わない', async () => {
    await type(ecField(), '1,2');
    await type(phField(), midPh);
    await waitForText(refusedNote, '養液 EC');
    expect(text()).not.toContain('範囲外です');
    expect(text()).not.toContain('適正範囲内です');
    expect(ecField()!.getAttribute('data-guard-outcome')).toBe('refused');
  });

  it('★ 単位つき (1.0mS) も同じ', async () => {
    await type(ecField(), '1.0mS');
    await type(phField(), midPh);
    await waitForText(refusedNote, '養液 EC');
    expect(text()).not.toContain('範囲外です');
  });

  it('測定の妥当範囲の外 (EC 12 / pH -1) も断る —— 桁の打ち間違いを「範囲外」の判定にしない', async () => {
    await type(ecField(), '12');
    await type(phField(), '-1');
    await waitForText(refusedNote, '養液 pH');
    expect(refusedNote()).toContain('養液 EC');
    expect(text()).not.toContain('範囲外です');
  });

  it('★ 対照: 読める値は判定する —— 品目の範囲の内なら「適正範囲内です」、外なら「範囲外です」', async () => {
    await type(ecField(), midEc);
    await type(phField(), midPh);
    await waitForText(text, '適正範囲内です');
    expect(refusedNote()).toBe('');
    // 読める値で範囲の外 (品目の上限の 2 倍) —— 判定そのものは今までどおり言う
    await type(ecField(), String(crop.ecHigh * 2));
    await waitForText(text, '範囲外です');
    expect(refusedNote()).toBe('');
  });

  it('空欄は判定しないし、断りもしない (2 つとも入れたときだけ判定する —— 今までどおり)', async () => {
    await type(ecField(), midEc);
    // pH は空のまま
    expect(text()).not.toContain('適正範囲内です');
    expect(text()).not.toContain('範囲外です');
    expect(refusedNote()).toBe('');
  });
});

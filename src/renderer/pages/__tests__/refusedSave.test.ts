/** @vitest-environment jsdom */
/**
 * **⛔ の欄が在るまま「書く」操作を通さない** (パス 214)。
 *
 * パス 206〜213 が閉じたのは「⛔ の値から**判定**を作る」道。もう一つの道が
 * **保存**で、こちらは性質が違う —— 判定は入力を直せば出し直せるが、
 * **保存した値は残り、以後すべての集計・書面がそれを読む。**
 *
 * 実測 (2026-09-13・パス 214 の probe):
 *
 * | 段 | 起きていたこと |
 * | --- | --- |
 * | 経営サマリー › 水耕栽培の設備・費用 | `床面積 (m²) = −9999` は ⛔ (「マイナスの値（-9999）は指定できません」) と表示されるのに、「保存して経営サマリーへ反映」は**押せて**、画面は「**保存しました。経営サマリーに反映されています。**」と述べ、そのあと `営業利益 −￥6,000,000` を出した |
 *
 * この節の値は**金融機関等提出用の書面**と経営レポートまで届く (画面自身が
 * 「保存すると経営サマリーに載せます」と述べている)。
 *
 * **母集団 (probe で実測)**: ⛔ のまま押せる「書く」ボタンが同じ画面に在る欄は
 * **67** (real-estate 54 / mutual-funds 22 の行・overview 14)。これは**分母**で、
 * ボタンがその欄を読むとは限らない (画面全体のボタンを数えている)。ここで閉じたのは
 * overview の 14 欄。残りは `docs/REMAINING_WORK.md` のパス 214 に記録した。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { _resetNavigationIntentForTests } from '../../navigate';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { getRecordStore } from '../../data/store';
import { HYDROPONICS_COLLECTION } from '../../data/hydroponicsSetup';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    storageProtection: () => Promise.resolve({ available: false, plaintextCount: 0 }),
    eraseAll: () => Promise.resolve({ ok: true, erased: [], failed: [] }),
  };
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      }),
      configurable: true,
    });
  }
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, { value: () => undefined, configurable: true, writable: true });
    }
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
  }
}

function setVal(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

function field(label: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`field not found: ${label}`);
  return el;
}

async function type(label: string, value: string): Promise<HTMLInputElement> {
  const input = field(label);
  await act(async () => { setVal(input, value); });
  await settle();
  return input;
}

function saveButton(): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button'))
    .find((x) => (x.textContent ?? '').includes('保存して経営サマリーへ反映'));
  if (!b) throw new Error('save button not found');
  return b as HTMLButtonElement;
}

async function clickSave(): Promise<void> {
  await act(async () => { saveButton().click(); });
  await settle();
}

/**
 * **保存された設備の控え。** 画面の文言ではなく**記録そのもの**を見る ——
 * 対照 G1 (断りを外す) を回して分かったこと: 緑の一文の側にも門が在るので、
 * 文言だけを見ていると**書けてしまっているのに検査が通る** (2 つの門が互いを
 * 隠す)。書いたかどうかは記録に訊く。
 */
async function storedSetups(): Promise<readonly { readonly floorAreaSqm: number }[]> {
  const rows = await getRecordStore().list<{ floorAreaSqm: number }>(HYDROPONICS_COLLECTION);
  return rows.map((r) => r.data);
}

/** 巨大な本文を `toContain` に渡すと、落ちたとき画面全部が印字される。真偽で聞く。 */
const says = (s: string): boolean => text().includes(s);
const SAVED_LINE = '保存しました。経営サマリーに反映されています。';

const refusals = (): readonly string[] =>
  Array.from(container.querySelectorAll('[data-refused-fields]')).map((el) =>
    (el.textContent ?? '').replace(/\s+/g, ' '),
  );

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  _resetNavigationIntentForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const def = SERVICES.find((s) => s.id === 'overview');
  if (!def) throw new Error('overview page missing');
  await act(async () => { root!.render(createElement(def.page)); });
  await settle();
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => { r.unmount(); });
  }
  container.remove();
});

describe('水耕栽培の設備・費用 — ⛔ の欄が在るまま保存しない (パス 214)', () => {
  it('★ 対照: 既定値のままなら保存でき、「保存しました」が出る', async () => {
    // **標本つきの対照** —— まず通ることを確かめてから、下で「通らないこと」を見る。
    expect(refusals()).toEqual([]);
    expect(saveButton().disabled).toBe(false);
    await clickSave();
    expect(says(SAVED_LINE)).toBe(true);
    expect((await storedSetups()).length).toBe(1);
  });

  it('★ 床面積がマイナスなら、記録を 1 件も書かない', async () => {
    const input = await type('床面積 (m²)', '-9999');
    expect(input.getAttribute('data-guard')).toBe('fatal');
    await clickSave();
    // **ここが本体の主張** —— 画面の文言ではなく記録を見る。
    expect(await storedSetups()).toEqual([]);
    // **画面が赤で断っている値を、保存が受け取ってはいけない。**
    expect(says(SAVED_LINE)).toBe(false);
    expect(refusals().join(' | ')).toContain('床面積 (m²)が入力できる範囲の外なので、保存していません');
    // ⛔ から作られていた経営サマリーの数字が出ていない。
    expect(says('-￥6,000,000')).toBe(false);
  });

  it('★ 断りの文面は「判定」ではなく「保存」について述べる', async () => {
    await type('販売単価 (円/株)', '-1');
    await clickSave();
    const note = refusals().join(' | ');
    expect(note).toContain('保存していません');
    expect(note).toContain('赤い欄を範囲内に直すと保存できます');
    // 判定用の文面 (パス 209) を流用していない —— 保存は出し直せない。
    expect(note).not.toContain('この判定は算定していません');
  });

  it('★ 直せば保存できる (断りは行き止まりではない)', async () => {
    await type('棚の段数', '-3');
    await clickSave();
    expect(says(SAVED_LINE)).toBe(false);
    await type('棚の段数', '4');
    expect(refusals()).toEqual([]);
    await clickSave();
    expect(says(SAVED_LINE)).toBe(true);
  });

  it('★ 保存に成功した後で欄を壊すと、緑の「保存しました」が残らない', async () => {
    // **順序の穴**: 先に保存が通って印が立ったあと欄を ⛔ にすると、緑の一文だけが
    // 残って「この値で保存されている」と読める。実際に保存されているのは前の値で、
    // 画面の欄はもう別の (範囲外の) 値を表示している —— 2 つが食い違う。
    await clickSave();
    expect(says(SAVED_LINE)).toBe(true);
    const stored = await storedSetups();
    await type('床面積 (m²)', '-9999');
    expect(says(SAVED_LINE)).toBe(false);
    expect(refusals().join(' | ')).toContain('床面積 (m²)');
    // 保存されているのは**前の値**のまま (画面の欄は範囲外の値を表示している)。
    expect(await storedSetups()).toEqual(stored);
    expect(stored[0]?.floorAreaSqm).toBeGreaterThan(0);
  });

  it('★ 母集団は宣言から採る — 費用の欄も断る (床面積だけを見ていない)', async () => {
    // `HYDRO_SPECS` 全 17 欄が母集団。**手で並べた一覧ではない**ので、
    // 欄が増えても自動で覆われる (パス 210/211 の教訓)。
    for (const label of ['電力単価 (円/kWh)', '人件費 (円/月)', '地代家賃 (円/月)']) {
      await type(label, '-1');
      await clickSave();
      expect(refusals().join(' | '), `${label} が断られない`).toContain(label);
      expect(says(SAVED_LINE)).toBe(false);
      expect(await storedSetups(), `${label} が ⛔ なのに書かれた`).toEqual([]);
      await type(label, '100');
    }
  });
});

/** @vitest-environment jsdom */
/**
 * **実物の画面で「—」のタイルに色が付いていない。** (2026-09-08 · パス 91)
 *
 * 単体側 (`components/__tests__/statUndetermined.test.ts`) は部品と helper を
 * 留める。ここは**並んだタイルを実際に読む** —— パス 61・84・90 と同じで、
 * 矛盾していたのは常に**画面**だった。
 *
 * 到達する経路 (投資信託): 保有年数の欄は `allowZero: true` なので **0 は正規の入力**。
 * `calcTotalReturn` は `years <= 0` で `cagrPct` を **null** にする。
 * 直す前は「年率換算 (CAGR) —」が**緑**で出ていた。
 *
 * 検査は個別のタイルを名指しせず、**「—」を刷っている全タイル**に当てる
 * (これから増える欄も覆う)。空振りしないよう、**色の付いたタイルが少なくとも
 * 1 枚在ること**も同じテストで確かめる —— 色が読めていない検査は
 * 「どのページでも通る」形になる。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';

const UNDETERMINED = '—';

let container: HTMLDivElement;
let root: Root | null = null;

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

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(serviceId: string): Promise<void> {
  const def = SERVICES.find((s) => s.id === serviceId);
  if (!def) throw new Error(`${serviceId} service missing`);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter not found');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function numInput(label: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`input "${label}" not found`);
  return el;
}

/**
 * `Stat` タイルの値の div を集める。`Stat` は
 * `<div>{label}</div><div style=…>{value}</div>` の 2 枚組なので、
 * 「子を持たない div が 2 枚並ぶ親」を数える。
 */
function tiles(): { label: string; value: string; color: string }[] {
  const out: { label: string; value: string; color: string }[] = [];
  for (const box of Array.from(container.querySelectorAll('div'))) {
    const kids = Array.from(box.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
    if (kids.length !== 2) continue;
    const [head, body] = kids as [HTMLElement, HTMLElement];
    if (head.children.length !== 0 || body.children.length !== 0) continue;
    // ラベルが小さい文字・値が太字なのが Stat の形。色の有無だけを見るので
    // 厳しく絞らず、値の div の style.color を読む。
    out.push({
      label: head.textContent ?? '',
      value: body.textContent ?? '',
      color: body.style.color,
    });
  }
  return out;
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
  document.body.removeChild(container);
});

describe('投資信託 — 「—」のタイルに色を付けない', () => {
  it('★ 保有年数 0 年で CAGR が「—」になり、色が付かない', async () => {
    await mount('mutual-funds');
    await act(async () => {
      changeInput(numInput('保有年数'), '0');
    });
    await settle();

    const cagr = tiles().find((t) => t.label === '年率換算 (CAGR)');
    expect(cagr, 'CAGR タイルが見つからない').toBeDefined();
    expect(cagr!.value).toContain(UNDETERMINED);
    // 直す前はここが rgb(34, 197, 94) = 緑だった。
    expect(cagr!.color).toBe('');
  });

  it('★ 「—」を刷っているタイルは 1 枚残らず無色 (色の付いたタイルも在ることを同時に確かめる)', async () => {
    await mount('mutual-funds');
    await act(async () => {
      changeInput(numInput('保有年数'), '0');
    });
    await settle();

    const all = tiles();
    const dashed = all.filter((t) => t.value.includes(UNDETERMINED));
    const coloured = all.filter((t) => t.color !== '');
    // 空振り防止: 「—」のタイルが実際に在り、色を読めてもいること。
    expect(dashed.length).toBeGreaterThan(0);
    expect(coloured.length).toBeGreaterThan(0);
    expect(dashed.filter((t) => t.color !== '').map((t) => `${t.label}=${t.value}`)).toEqual([]);
  });

  it('★ 対照: 保有年数を入れれば CAGR は % で出て、色が戻る', async () => {
    await mount('mutual-funds');
    await act(async () => {
      changeInput(numInput('保有年数'), '5');
    });
    await settle();

    const cagr = tiles().find((t) => t.label === '年率換算 (CAGR)');
    expect(cagr!.value).not.toContain(UNDETERMINED);
    expect(cagr!.value).toMatch(/-?\d+(\.\d+)?%/);
    expect(cagr!.color).not.toBe('');
  });
});

describe('不動産投資 — 「—」のタイルに色を付けない', () => {
  /**
   * **既定から 1 か所だけ変えて作れる。** 売却ネット手取りを 0 にすると
   * (残債で消える・値が付かない) CF が全期間マイナスで揃い、符号変化が無くなって
   * `calcIrr` は **null** を返す。既定の返済後CF は **−¥84,000/年** なので、
   * これは「毎年出ていくだけで、売っても何も戻らない」物件である。
   *
   * 直す前、3 枚のタイルはこう並んでいた:
   *   返済後CF −¥84,000 (赤) / NPV −¥10,681,315 (赤) / **IRR 「—」(緑)**
   * 損を 2 枚が赤で言っている隣で、IRR だけが緑だった。
   */
  async function bleedingProperty(): Promise<void> {
    await mount('real-estate');
    await act(async () => {
      changeInput(numInput('売却ネット手取り'), '0');
    });
    await settle();
  }

  it('★ 売却手取り 0 の赤字物件で IRR が「—」になり、色が付かない', async () => {
    await bleedingProperty();

    const irr = tiles().find((t) => t.label === 'IRR (年率概算)');
    expect(irr, 'IRR タイルが見つからない').toBeDefined();
    expect(irr!.value).toContain(UNDETERMINED);
    // 直す前はここが rgb(34, 197, 94) = 緑だった。
    expect(irr!.color).toBe('');
  });

  it('★ 隣のタイルは損失を赤で言っている (同じ物件について 2 枚が逆を言わない)', async () => {
    await bleedingProperty();
    const all = tiles();
    const npv = all.find((t) => t.label.startsWith('NPV'));
    const cf = all.find((t) => t.label === '返済後CF (年)');
    expect(npv!.value).toContain('-');
    expect(npv!.color).toBe('rgb(239, 68, 68)');
    expect(cf!.color).toBe('rgb(239, 68, 68)');
  });

  it('★ 「—」を刷っているタイルは 1 枚残らず無色 (標本が空でないことも確かめる)', async () => {
    await bleedingProperty();

    const all = tiles();
    const dashed = all.filter((t) => t.value.includes(UNDETERMINED));
    const coloured = all.filter((t) => t.color !== '');
    // **空振り防止。** 既定の入力では「—」のタイルが 0 枚で、この検査は
    // どのページでも通ってしまう —— 実際に作ってから当てる。
    expect(dashed.length).toBeGreaterThan(0);
    expect(coloured.length).toBeGreaterThan(0);
    expect(dashed.filter((t) => t.color !== '').map((t) => `${t.label}=${t.value}`)).toEqual([]);
  });

  it('★ 対照: 既定の入力なら IRR は % で出て、色が付く', async () => {
    await mount('real-estate');
    const irr = tiles().find((t) => t.label === 'IRR (年率概算)');
    expect(irr!.value).not.toContain(UNDETERMINED);
    expect(irr!.value).toMatch(/-?\d+(\.\d+)?%/);
    expect(irr!.color).not.toBe('');
  });
});

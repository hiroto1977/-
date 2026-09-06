/** @vitest-environment jsdom */
/**
 * **App の配線: 端末が保存を断ったら、画面がそう言う。**
 *
 * 実測 (2026-09-06): どの画面にも出る手入力欄 (`ManualDataSection`) の
 * 「事業を追加」は `onClick={() => void add()}` で、拒否された Promise を
 * 誰も受け取っていなかった。容量超過・プライベートモード・別タブの
 * versionchange で保存が断られると、**行は増えず、文言も出ない** ——
 * 打ち込んだ値だけが残るので「ボタンを押せていない」ように見える。
 *
 * ここは**入口から画面まで**を 1 本で通す: 断る保存層で App を丸ごと動かし、
 * 実際に事業名を打って押し、報せが出ることと、**報せが名乗るとおりに
 * 打ち込んだ内容が残っている**ことを見る (文面と画面が食い違わないこと)。
 *
 * 対照は同じ操作を書ける保存層で回す —— 行が増え、報せは出ない。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const h = vi.hoisted(() => ({ refuseWrites: false }));

vi.mock('../data/store', () => {
  type Row = { id: string; collection: string; createdAt: number; updatedAt: number; data: Record<string, unknown> };
  let rows: Row[] = [];
  let seq = 0;
  function refuse(): never {
    const e = new Error('device refused the write');
    e.name = 'QuotaExceededError';
    throw e;
  }
  const store = {
    async list(collection: string) {
      return rows.filter((r) => r.collection === collection);
    },
    async insert(collection: string, data: Record<string, unknown>) {
      if (h.refuseWrites) refuse();
      seq += 1;
      const row = { id: `r${seq}`, collection, createdAt: seq, updatedAt: seq, data };
      rows.push(row);
      return row;
    },
    async insertMany(collection: string, incoming: readonly Record<string, unknown>[]) {
      if (h.refuseWrites) refuse();
      return incoming.map((data) => {
        seq += 1;
        const row = { id: `r${seq}`, collection, createdAt: seq, updatedAt: seq, data };
        rows.push(row);
        return row;
      });
    },
    async update(id: string, patch: Record<string, unknown>) {
      if (h.refuseWrites) refuse();
      const row = rows.find((r) => r.id === id);
      if (row === undefined) return null;
      Object.assign(row.data, patch);
      return row;
    },
    async remove(id: string) {
      if (h.refuseWrites) refuse();
      rows = rows.filter((r) => r.id !== id);
    },
    async get(id: string) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async count(collection: string) {
      return rows.filter((r) => r.collection === collection).length;
    },
    async clearCollection(collection: string) {
      const n = rows.filter((r) => r.collection === collection).length;
      rows = rows.filter((r) => r.collection !== collection);
      return n;
    },
    async exportAll() {
      return rows;
    },
    async importAll() {
      return 0;
    },
    configureCipher() {},
    async reencryptAll() {
      return 0;
    },
  };
  return {
    getRecordStore: () => store,
    _resetRecordStoreForTests: () => {
      rows = [];
      seq = 0;
    },
  };
});

import { App } from '../App';
import { _resetRecordStoreForTests } from '../data/store';
import { _resetCollectionSubscribersForTests } from '../data/useCollection';
import { _resetRecordStoreFailureForTests } from '../data/recordStoreFailure';
import { _resetNavigationIntentForTests } from '../navigate';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'), // Electron 扱い (ロック画面を出さない)
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined }),
      configurable: true,
    });
  }
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, { value: () => undefined, configurable: true, writable: true });
    }
  }
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el, 'button missing').toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

function type(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter missing');
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const byLabel = (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
const buttonWith = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text);
const banner = () => container.querySelector('[data-record-store-failure]');

/** 手入力欄を開いて「事業名」を打ち、「事業を追加」を押す。 */
async function addBusinessUnit(name: string): Promise<void> {
  const panel = container.querySelector('[data-manual-data]');
  expect(panel, '手入力欄が無い').toBeTruthy();
  await click(panel!.querySelector('button'));
  const input = byLabel('事業名');
  expect(input, '事業名の欄が無い').toBeTruthy();
  await act(async () => {
    type(input!, name);
  });
  await click(buttonWith('事業を追加'));
}

beforeEach(async () => {
  h.refuseWrites = false;
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  _resetRecordStoreFailureForTests();
  _resetNavigationIntentForTests();
  localStorage.clear();
  location.hash = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(App));
  });
  await settle();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
  _resetRecordStoreFailureForTests();
});

describe('端末が保存を断ったとき、App が報せる', () => {
  it('★ 手入力欄の「事業を追加」が断られたら、報せが出る', async () => {
    h.refuseWrites = true;
    await addBusinessUnit('断られる事業');
    const el = banner();
    expect(el, '報せが出ていない').toBeTruthy();
    expect(el?.getAttribute('data-record-store-failure')).toBe('save');
    expect(el?.textContent).toContain('この端末に保存できませんでした');
    expect(el?.textContent).toContain('この端末の保存領域が一杯です');
  });

  it('★ 報せが名乗るとおり、打ち込んだ内容は画面に残っている', async () => {
    h.refuseWrites = true;
    await addBusinessUnit('断られる事業');
    expect(banner()?.textContent).toContain('打ち込んだ内容は画面に残っています');
    // 文面と画面が食い違っていないこと (消していたら嘘になる)。
    expect(byLabel('事業名')?.value).toBe('断られる事業');
    // 行は増えていない (保存できていないので増えては困る)。
    expect(container.querySelectorAll('[data-business-unit]')).toHaveLength(0);
  });

  it('★ 報せは閉じられる (直った後も残らない)', async () => {
    h.refuseWrites = true;
    await addBusinessUnit('断られる事業');
    await click(buttonWith('閉じる'));
    expect(banner()).toBeNull();
  });

  it('対照: 書ける端末では行が増え、報せは出ない', async () => {
    await addBusinessUnit('通る事業');
    expect(banner()).toBeNull();
    const rows = [...container.querySelectorAll('[data-business-unit]')];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('通る事業');
    // 通ったときは欄が空に戻る。
    expect(byLabel('事業名')?.value).toBe('');
  });
});

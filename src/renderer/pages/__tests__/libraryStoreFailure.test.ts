/** @vitest-environment jsdom */
/**
 * **ライブラリ (書き出したファイルの実体) が読めないとき、「0 件」と言わない。**
 *
 * 業務レコード側は入口 (`useCollection`) で報せるようにした (2026-09-06)。
 * **同じ端末の同じ容量を分け合っている blob ストアは、まだ同じ形のまま**だった:
 *
 *   `refresh()`  … `useEffect(() => { refresh(); }, [])` で投げっぱなし。読めなければ
 *                  `items` は `[]` のままで、見出しは「ライブラリ · 0 件 / 0 B」——
 *                  **書き出した書類が 1 つも無いのと区別が付かない**
 *   `remove` / `clear` … 断られても文言が出ない (「削除しました」は出ないが理由も出ない)
 *   `get`        … 拒否が宙に浮く。押しても何も起きない
 *
 * ここで留めるのは「どの操作が、どの主語で報せるか」と、
 * **「消えている」と「読めない」を混ぜないこと** (打ち手が違う)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const h = vi.hoisted(() => ({
  /** 失敗させる操作名。テストごとに入れ替える。 */
  failOn: new Set<string>(),
  items: [] as { id: string; serviceId: string; filename: string; mime: string; size: number; createdAt: number }[],
}));

vi.mock('../../library/library', () => {
  function boom(op: string): void {
    if (!h.failOn.has(op)) return;
    const e = new Error('device refused');
    e.name = 'QuotaExceededError';
    throw e;
  }
  const lib = {
    async list() {
      boom('list');
      return h.items;
    },
    async get(id: string) {
      boom('get');
      const meta = h.items.find((i) => i.id === id);
      if (meta === undefined) return null;
      return { ...meta, blob: new Blob(['x'], { type: meta.mime }) };
    },
    async remove(id: string) {
      boom('remove');
      h.items = h.items.filter((i) => i.id !== id);
    },
    async clear() {
      boom('clear');
      h.items = [];
    },
    async put() {
      boom('put');
      return h.items[0];
    },
    async totalBytes() {
      return h.items.reduce((a, i) => a + i.size, 0);
    },
  };
  return { getLibrary: () => lib };
});

import { LibraryPage } from '../LibraryPage';
import {
  _resetDeviceStoreFailureForTests,
  currentDeviceStoreFailure,
} from '../../data/deviceStoreFailure';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    openExternal: () => Promise.resolve(),
    listConfigured: () => Promise.resolve([]),
  };
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => 'blob:x';
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
  // 削除は confirm を通る。
  vi.stubGlobal('confirm', () => true);
});

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
}

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(LibraryPage));
  });
  await settle();
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el, 'button missing').toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

const buttonWith = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text);

beforeEach(() => {
  h.failOn.clear();
  h.items = [
    { id: 'f1', serviceId: 'templates', filename: '提案書.svg', mime: 'image/svg+xml', size: 1024, createdAt: 1 },
  ];
  _resetDeviceStoreFailureForTests();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
  _resetDeviceStoreFailureForTests();
});

describe('ライブラリが読めないとき', () => {
  it('★ 一覧が読めなければ files / read として報せる (0 件と言い切らない)', async () => {
    h.failOn.add('list');
    await mount();
    const f = currentDeviceStoreFailure();
    expect(f?.store).toBe('files');
    expect(f?.op).toBe('read');
    expect(f?.where).toBe('library');
    expect(f?.message).toContain('この端末に保存したファイルを読めませんでした');
    expect(f?.message).toContain('一覧が 0 件でも、ファイルが消えたとは限りません');
  });

  it('★ 読めなかった回は、前に読めた一覧を空に置き換えない', async () => {
    await mount();
    expect(container.textContent).toContain('提案書.svg');
    h.failOn.add('list');
    await click(buttonWith('更新'));
    // 出ているのは前回読めた一覧。報せは別に出る。
    expect(container.textContent).toContain('提案書.svg');
    expect(currentDeviceStoreFailure()?.op).toBe('read');
  });

  it('★ 1 件が読めないのを「見つかりません」と混ぜない (打ち手が違う)', async () => {
    await mount();
    h.failOn.add('get');
    await click(buttonWith('開く'));
    expect(currentDeviceStoreFailure()?.op).toBe('read');
    expect(container.textContent).not.toContain('ファイルが見つかりません');
  });

  it('対照: 消えている 1 件は「見つかりません」と言い、報せは出さない', async () => {
    await mount();
    h.items = []; // 別のタブで消された
    await click(buttonWith('開く'));
    expect(container.textContent).toContain('ファイルが見つかりません');
    expect(currentDeviceStoreFailure()).toBeNull();
  });
});

describe('ライブラリから消せないとき', () => {
  it('★ 1 件の削除が断られたら files / delete として報せ、「削除しました」と言わない', async () => {
    await mount();
    h.failOn.add('remove');
    await click(buttonWith('削除'));
    const f = currentDeviceStoreFailure();
    expect(f?.store).toBe('files');
    expect(f?.op).toBe('delete');
    expect(f?.message).toContain('この端末からファイルを削除できませんでした');
    expect(f?.message).toContain('一覧はそのままです');
    expect(container.textContent).not.toContain('削除しました');
    // 消えていないので行は残る。
    expect(container.textContent).toContain('提案書.svg');
  });

  it('★ 全件削除が断られても同じ (files / delete)', async () => {
    await mount();
    h.failOn.add('clear');
    await click(buttonWith('全て削除'));
    expect(currentDeviceStoreFailure()?.op).toBe('delete');
    expect(container.textContent).not.toContain('全て削除しました');
  });

  it('対照: 消せる端末では「削除しました」が出て行が消え、報せは出ない', async () => {
    await mount();
    await click(buttonWith('削除'));
    expect(container.textContent).toContain('削除しました');
    expect(container.textContent).not.toContain('提案書.svg');
    expect(currentDeviceStoreFailure()).toBeNull();
  });
});

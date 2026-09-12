/** @vitest-environment jsdom */
/**
 * **読めない値を、ライブラリの画面が「読めない」と言う** (2026-09-12 · パス 188)。
 *
 * 直す前の実測 (同じ入力を素の書式化関数へ通したもの):
 *
 * | 保存値 | 直す前の表示 | 直した後 |
 * | --- | --- | --- |
 * | `createdAt: NaN` | `NaN/NaN/NaN NaN:NaN` | 時刻不明 |
 * | `size: NaN` | `NaN MB` | サイズ不明 |
 * | 見出しの合計 (1 件でも NaN) | `NaN MB` | 読める分の合計 + 除いた件数 |
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetLibraryForTests } from '../../library/library';

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
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    (Element.prototype as unknown as Record<string, () => void>)[name] = () => undefined;
  }
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

/** 素の IndexedDB へ控えを直接書く (put() を通らない経路 = 壊れた控えの再現)。 */
async function writeRaw(records: readonly Record<string, unknown>[]): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('business-hub-library', 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('items', { keyPath: 'id' });
      store.createIndex('createdAt', 'createdAt', { unique: false });
      store.createIndex('serviceId', 'serviceId', { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('items', 'readwrite');
    for (const r of records) tx.objectStore('items').put(r);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function mountLibrary(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'library');
  if (!def) throw new Error('library service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

const text = (): string => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(async () => {
  _resetLibraryForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-library');
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

const base = { filename: 'a.svg', mime: 'image/svg+xml', serviceId: 'templates' };

describe('ライブラリ — 読めない値を「読めない」と言う', () => {
  it('★ 読めない保存時刻は「時刻不明」(NaN/NaN/NaN ではない)', async () => {
    await writeRaw([{ ...base, id: 'bad', filename: '時刻の壊れた書類.svg', createdAt: Number.NaN, size: 100 }]);
    await mountLibrary();
    const t = text();
    expect(t).toContain('時刻の壊れた書類.svg');
    expect(t).toContain('時刻不明');
    expect(t).not.toContain('NaN');
  });

  it('★ 読めないサイズは「サイズ不明」で、合計にも見出しにも NaN を出さない', async () => {
    await writeRaw([
      { ...base, id: 'ok', createdAt: 1_700_000_000_000, size: 2048 },
      { ...base, id: 'bad', filename: 'サイズの壊れた書類.svg', createdAt: 1_700_000_000_001, size: Number.NaN },
    ]);
    await mountLibrary();
    const t = text();
    expect(t).toContain('サイズ不明');
    expect(t).toContain('2.0 KB'); // 読める分の合計 (見出しと行)
    expect(t).not.toContain('NaN');
    expect(t).toContain('サイズが読めない 1 件は合計に含めていません');
  });

  it('★ 読めなかった欄の断りが出る (件数つき)', async () => {
    await writeRaw([
      { ...base, id: 'a', createdAt: Number.NaN, size: Number.NaN },
      { ...base, id: 'b', createdAt: 1_700_000_000_002, size: Number.NaN },
    ]);
    await mountLibrary();
    const note = container.querySelector('[data-library-unreadable]');
    expect(note).not.toBeNull();
    const n = (note!.textContent ?? '').replace(/\s+/g, ' ');
    expect(n).toContain('サイズが読めない 2 件');
    expect(n).toContain('保存時刻が読めない 1 件');
    // 消せることを画面が言う (壊れた控えの出口)。
    expect(n).toContain('削除');
  });

  it('★ 対照: そろった控えだけなら断りは出ない (常に出る文ではない)', async () => {
    await writeRaw([{ ...base, id: 'ok', createdAt: 1_700_000_000_000, size: 2048 }]);
    await mountLibrary();
    expect(container.querySelector('[data-library-unreadable]')).toBeNull();
    expect(text()).not.toContain('サイズ不明');
    expect(text()).not.toContain('時刻不明');
    // 対照が空でないこと: 行そのものは出ている。
    expect(text()).toContain('a.svg');
  });
});

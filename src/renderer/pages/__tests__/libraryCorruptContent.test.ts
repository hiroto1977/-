/** @vitest-environment jsdom */
/**
 * **控えは在るが中身が取り出せないとき、画面が言う** (2026-09-13 · パス 193)。
 *
 * ## 直す前に測った形
 *
 * `library.get()` は `req.result as LibraryItem` と**無検査でキャスト**していた
 * (`list()` は 2026-09-12 · パス 188 で直したのに、双子の `get()` は残っていた
 * —— パス 66 の家系「3 か所のうち 1 か所しか直していない」)。だから中身が
 * Blob でない控えは「読めた」として返り:
 *
 * ```
 *   [1] 一覧にその行は普通に並ぶ (名前・大きさ・時刻はメタから読める)
 *   [2] 「ダウンロード」を押す → URL.createObjectURL(非Blob) が TypeError
 *   [3] onClick は async なので拒否は未処理のまま消える
 *       → ★ 画面は何も変わらない。押しても押しても無反応。
 * ```
 *
 * 隣の「開く」は同じ危険を `.catch(() => null)` で受けて
 * 「プレビューを生成できませんでした」と言えていた —— **同じ画面の双子で、
 * 片方だけが守られていた。**
 *
 * ## ここで確かめること
 *
 * 「無い」と「壊れている」は打ち手が違う (前者は諦める・後者は**その行を削除する**)。
 * だから `get()` は 3 択 (`found` / `missing` / `corrupt`) を返し、画面は
 * 壊れている控えに**名前を挙げて削除を促す**。
 *
 * **控えを壊す手口**: `put()` を通らず素の IndexedDB へ書く (手で直された控え・
 * 移行に失敗した控えの形)。なお `fake-indexeddb` は Blob 自体を保てないので、
 * 普通に `put()` した控えもこの層では「壊れている」になる —— それは代役の限界で、
 * `library.test.ts` の引き線が留めている。
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

/** 素の IndexedDB へ控えを直接書く (`put()` を通らない経路 = 壊れた控えの再現)。 */
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

async function clickAttr(attr: string, id: string): Promise<void> {
  const b = container.querySelector(`[${attr}="${id}"]`);
  if (!(b instanceof HTMLElement)) throw new Error(`ボタンが無い: ${attr}=${id}`);
  await act(async () => {
    b.click();
  });
  await settle();
}

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

/** メタはそろっているが、中身 (`blob`) が Blob ではない控え。 */
const BROKEN = {
  id: 'broken',
  filename: '中身の壊れた書類.svg',
  mime: 'image/svg+xml',
  serviceId: 'templates',
  createdAt: 1_757_000_000_000,
  size: 1234,
  blob: { not: 'a blob' },
};

describe('ライブラリ — 中身が取り出せない控え', () => {
  it('走査の的が在る (行とボタン 2 つ)', async () => {
    await writeRaw([BROKEN]);
    await mountLibrary();
    expect(text(), '壊れた控えの行が出ていない').toContain('中身の壊れた書類.svg');
    expect(container.querySelector('[data-library-download="broken"]')).not.toBeNull();
    expect(container.querySelector('[data-library-open="broken"]')).not.toBeNull();
  });

  it('★ ダウンロードを押すと「中身が取り出せません」と出る (無反応ではない)', async () => {
    await writeRaw([BROKEN]);
    await mountLibrary();
    expect(text(), '押す前から文が出ている (対照が成り立たない)').not.toContain('中身が取り出せません');

    await clickAttr('data-library-download', 'broken');
    const t = text();
    expect(t, '★ 押しても画面が何も変わりませんでした').toContain('中身が取り出せません');
    // 名前を挙げる —— どの行を消せばよいか分かる (パス 136: 保存した物は消せる道が要る)。
    expect(t).toContain('中身の壊れた書類.svg');
    expect(t, '打ち手 (削除) を言っていない').toContain('削除');
  });

  it('★ 開くを押しても同じ 1 文が出る (双子で文面が割れない)', async () => {
    await writeRaw([BROKEN]);
    await mountLibrary();
    await clickAttr('data-library-open', 'broken');
    const t = text();
    expect(t).toContain('中身が取り出せません');
    expect(t).toContain('中身の壊れた書類.svg');
    // 「プレビューを生成できませんでした」ではない —— 壊れているのは控えであって、
    // 描き出しに失敗したのではない。理由が違うなら文も違う。
    expect(t, '壊れた控えを「プレビュー生成の失敗」と言っています').not.toContain(
      'プレビューを生成できませんでした',
    );
  });

  it('★ 壊れた控えは削除できる (出口が在る)', async () => {
    await writeRaw([BROKEN]);
    await mountLibrary();
    const del = container.querySelector('[data-library-delete="broken"]');
    expect(del, '削除ボタンが無い (消す道が無い)').not.toBeNull();
  });

  it('対照: 「無い」は「壊れている」と別の文になる', async () => {
    // 行を描いてから、画面の裏で控えを消す。ボタンは残っているので
    // 「削除済みの可能性」の枝に入る。
    await writeRaw([BROKEN]);
    await mountLibrary();
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('business-hub-library', 1);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('items', 'readwrite');
        tx.objectStore('items').delete('broken');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
    await clickAttr('data-library-download', 'broken');
    const t = text();
    expect(t).toContain('ファイルが見つかりません');
    expect(t, '消えている控えを「壊れている」と言っています').not.toContain('中身が取り出せません');
  });
});

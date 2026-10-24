/** @vitest-environment jsdom */
/**
 * **ライブラリの `list()` と `get()` の枝を、値ごとに留める。** (パス 502)
 *
 * 1. `list()` は保存されている行のうち **`id` が読めない行を飛ばす** (何も操作できないため・
 *    `metaFromStored` が `null` を返す)。飛ばす判定が外れると、`null` が一覧に混ざり、
 *    画面の `row.filename` が TypeError で落ちる。`list()` の走査は 2 段 (索引 → 本体) なので、
 *    **どちらの段にも**読めない行を置いて確かめる。
 * 2. `get()` は中身まで読める控えを `{ kind: 'found', item }` で返す。ところが
 *    **`fake-indexeddb` は格納した `Blob` を `Blob` として戻さない** (`library.test.ts` の
 *    「代役の限界」が留めている) ので、この層では found の道を**通せなかった**。
 *    ここでは IndexedDB の `get` だけを差し替え、**本物の (jsdom の) `Blob` を含む行**を
 *    返させて found の道を通す (`openDb` も `transaction` も本物のまま)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { _resetLibraryForTests, getLibrary } from '../library';

function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-library');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  _resetLibraryForTests();
  await clearIdb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 素の IndexedDB へ、行を直接書く (`put()` は通らない経路を再現する)。 */
async function writeRaw(record: Record<string, unknown>): Promise<void> {
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
    tx.objectStore('items').put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

const good = {
  id: 'ok1',
  filename: 'a.svg',
  mime: 'image/svg+xml',
  serviceId: 'templates',
  createdAt: 1_700_000_000_000,
  size: 100,
};

describe('Library.list — id が読めない行は飛ばす (パス 502)', () => {
  it('★ 数値の id の行は、索引に載る行も載らない行も一覧に出ない (null を混ぜない)', async () => {
    // id が文字列でない行は、キーとしては有効なので書ける (keyPath は数値も受ける)。
    await writeRaw({ ...good, id: 7 }); // 索引に載る (保存時刻は有効) —— 索引の走査で出会う
    await writeRaw({ ...good, id: 8, createdAt: Number.NaN }); // 索引に載らない —— 本体の走査で出会う
    await writeRaw({ ...good, id: 'ok1' }); // 読める行
    const list = await getLibrary().list();
    // 読める 1 件だけ。読めない 2 件が `null` や欠けた行として混ざらない。
    expect(list).toEqual([good]);
    expect(list.every((m) => m !== null)).toBe(true);
  });

  it('★ 空の id の行も飛ばす (読める行は残る)', async () => {
    await writeRaw({ ...good, id: '', createdAt: 1_700_000_000_001 });
    await writeRaw({ ...good, id: 'ok1' });
    expect((await getLibrary().list()).map((m) => m.id)).toEqual(['ok1']);
  });

  it('★ 対照: 読める行は索引に載る行も載らない行も 1 度ずつ出る (全部を飛ばす形になっていない)', async () => {
    await writeRaw({ ...good, id: 'indexed', createdAt: 1_700_000_000_500 });
    await writeRaw({ ...good, id: 'noindex', createdAt: Number.NaN });
    const list = await getLibrary().list();
    expect(list.map((m) => m.id)).toEqual(['indexed', 'noindex']);
  });
});

/** `IDBObjectStore.get` の代役。`onsuccess` が代入されたら、与えた行を `result` に載せて発火する。 */
function stubStoredRow(row: unknown): void {
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
    let handler: (() => void) | null = null;
    const req = {
      result: row,
      error: null,
      onerror: null as (() => void) | null,
      get onsuccess(): (() => void) | null {
        return handler;
      },
      set onsuccess(fn: (() => void) | null) {
        handler = fn;
        if (fn !== null) queueMicrotask(() => handler?.());
      },
    };
    return req as unknown as IDBRequest;
  });
}

describe('Library.get — 中身まで読める控えは found で返す (パス 502)', () => {
  it('★ 本物の Blob を持つ控えは { kind: "found", item } で返り、大きさは申告ではなく blob のもの', async () => {
    // jsdom の本物の Blob (6 バイト)。控えの `size` (申告) は 999 と食い違わせておく。
    const blob = new Blob(['<svg/>'], { type: 'image/svg+xml' });
    stubStoredRow({ ...good, id: 'found1', size: 999, blob });
    const r = await getLibrary().get('found1');
    expect(r.kind).toBe('found');
    if (r.kind !== 'found') throw new Error('found ではない');
    expect(r.item.id).toBe('found1');
    expect(r.item.filename).toBe('a.svg');
    expect(r.item.mime).toBe('image/svg+xml');
    expect(r.item.serviceId).toBe('templates');
    expect(r.item.createdAt).toBe(1_700_000_000_000);
    // 大きさは blob.size (6) を採る。控えの申告 (999) ではない。
    expect(r.item.size).toBe(6);
    expect(r.item.blob).toBe(blob);
    // 返す物の形は { kind, item } の 2 つだけ。
    expect(Object.keys(r).sort()).toEqual(['item', 'kind']);
  });

  it('★ 対照: 中身が Blob でない控えは found ではなく corrupt (行は名指せる)', async () => {
    stubStoredRow({ ...good, id: 'broken1', blob: { not: 'a blob' } });
    const r = await getLibrary().get('broken1');
    expect(r.kind).toBe('corrupt');
    if (r.kind !== 'corrupt') throw new Error('corrupt ではない');
    expect(r.meta.id).toBe('broken1');
  });

  it('★ 対照: id が読めない行は missing (名指しもできない)', async () => {
    stubStoredRow({ ...good, id: 42, blob: new Blob(['x']) });
    expect((await getLibrary().get('whatever')).kind).toBe('missing');
  });
});

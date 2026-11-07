/** @vitest-environment jsdom */
/**
 * **保存された控えの数値が読めないとき** (2026-09-12 · パス 188)。
 *
 * `list()` は `cur.value as LibraryItem` と**無検査でキャスト**していたので、
 * 壊れた・手で直された・古い版が書いた控えの `NaN` がそのまま出ていた。実測:
 *
 * | 欄 | 直す前 | 直した後 |
 * | --- | --- | --- |
 * | `createdAt: NaN` | 画面が `NaN/NaN/NaN NaN:NaN` を刷る | `null` → 「時刻不明」 |
 * | `size: NaN` | 見出しの合計が `NaN MB` | `null` → 合計から外し件数を言う |
 * | **`size: NaN` と上限** | **`total` が `NaN` になり `NaN > MAX_BYTES` は必ず false = 50 MB の上限が丸ごと効かない** | 0 として数え、上限は測れた分について効く |
 *
 * 最後の行がこのパスで一番重い —— **表示の崩れではなく、保存容量の門が
 * 黙って開く**。件数の上限 (`MAX_ITEMS`) だけが残っていた。
 */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { MAX_BYTES, getLibrary, metaFromStored, _resetLibraryForTests } from '../library';

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

/** 素の IndexedDB へ、壊れた控えを直接書く (put() は通らない経路を再現する)。 */
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

const good = { id: 'ok1', filename: 'a.svg', mime: 'image/svg+xml', serviceId: 'templates', createdAt: 1_700_000_000_000, size: 100 };

describe('metaFromStored — 読めない欄を null にする', () => {
  it('そろった控えはそのまま通る', () => {
    expect(metaFromStored(good)).toEqual(good);
  });

  it('★ 読めない createdAt は null (NaN / 1e20 / Infinity / 文字列 / 欠落)', () => {
    for (const bad of [Number.NaN, 1e20, -1e20, Infinity, '2026-01-01', undefined, null]) {
      expect(metaFromStored({ ...good, createdAt: bad })?.createdAt, String(bad)).toBeNull();
    }
    // 境界: ECMA-262 の time clip ちょうどは有効・1 超えると無効。
    expect(metaFromStored({ ...good, createdAt: 8_640_000_000_000_000 })?.createdAt).toBe(8_640_000_000_000_000);
    expect(metaFromStored({ ...good, createdAt: 8_640_000_000_000_001 })?.createdAt).toBeNull();
  });

  it('★ 読めない size は null (NaN / Infinity / 負 / 文字列 / 欠落)', () => {
    for (const bad of [Number.NaN, Infinity, -1, '100', undefined, null, {}]) {
      expect(metaFromStored({ ...good, size: bad })?.size, String(bad)).toBeNull();
    }
    expect(metaFromStored({ ...good, size: 0 })?.size).toBe(0);
  });

  it('★ 行そのものは落とさない (id が在れば消せる・取り出せる)', () => {
    const m = metaFromStored({ id: 'x', createdAt: Number.NaN, size: Number.NaN });
    expect(m).not.toBeNull();
    expect(m!.id).toBe('x');
    // 文字列の欄も読めなければ埋める (画面が undefined を刷らないように)。
    expect(m!.filename).toBe('(名前が読めません)');
    expect(m!.serviceId).toBe('unknown');
  });

  it('★ id が読めない控えだけは飛ばす (何も操作できない)', () => {
    expect(metaFromStored({ ...good, id: '' })).toBeNull();
    expect(metaFromStored({ ...good, id: 42 })).toBeNull();
    expect(metaFromStored(null)).toBeNull();
    expect(metaFromStored('x')).toBeNull();
  });
});

describe('Library — 読めない控えが混ざっても崩れない', () => {
  it('★ list() は読めない欄を null にして返す (無検査キャストをやめた)', async () => {
    await writeRaw({ ...good, id: 'broken', createdAt: Number.NaN, size: Number.NaN });
    const list = await getLibrary().list();
    expect(list).toHaveLength(1);
    expect(list[0]!.createdAt).toBeNull();
    expect(list[0]!.size).toBeNull();
  });

  /**
   * **索引に載らない控えは、直す前は一生見えなかった。** `NaN` は IndexedDB の
   * 有効なキーではないので `index('createdAt')` の走査に現れない ——
   * 一覧に出ず・「削除」も押せず・容量の集計にも入らないのに場所は占める。
   * 「保存した物は必ず消せる」(パス 136) の側の欠陥である。
   */
  it('★ 保存時刻が読めない控えも一覧に出て、消せる', async () => {
    await writeRaw({ ...good, id: 'noindex', createdAt: Number.NaN });
    await writeRaw({ ...good, id: 'normal', createdAt: 1_700_000_000_500 });
    const lib = getLibrary();
    const list = await lib.list();
    expect(list.map((m) => m.id).sort()).toEqual(['noindex', 'normal']);
    // 索引に載る控えが先・載らない控えは後ろ (順序は決めてある)。
    expect(list[0]!.id).toBe('normal');
    expect(list[1]!.createdAt).toBeNull();
    // ★ 消せる (これが確かめたい出口)。
    await lib.remove('noindex');
    expect((await lib.list()).map((m) => m.id)).toEqual(['normal']);
  });

  it('★ totalBytes() は読める分だけを足す (NaN を返さない)', async () => {
    await writeRaw({ ...good, id: 'a', size: 1024 });
    await writeRaw({ ...good, id: 'b', size: Number.NaN, createdAt: 1_700_000_000_001 });
    await writeRaw({ ...good, id: 'c', size: 2048, createdAt: 1_700_000_000_002 });
    expect(await getLibrary().totalBytes()).toBe(3072);
  });

  it('★ 上限の判定が NaN で無効化されない (このパスの主眼)', async () => {
    // 直す前は `total` が NaN になり `NaN > MAX_BYTES` が必ず false だった。
    await writeRaw({ ...good, id: 'huge', size: MAX_BYTES, createdAt: 1 });
    await writeRaw({ ...good, id: 'broken', size: Number.NaN, createdAt: 2 });
    const lib = getLibrary();
    // ここで put() が enforceLimits() を呼ぶ。合計は「測れた分」で判定される。
    await lib.put('templates', 'new.svg', 'image/svg+xml', new Blob(['<svg/>'], { type: 'image/svg+xml' }));
    const after = await lib.list();
    // 合計は数値である (NaN ではない) —— これが確かめたい性質。
    const total = after.reduce((a, it) => a + (it.size ?? 0), 0);
    expect(Number.isFinite(total)).toBe(true);
    expect(total).toBeLessThanOrEqual(MAX_BYTES);
    // 一番古い巨大な控えが消え、新しい控えは残る。
    expect(after.some((it) => it.id === 'huge')).toBe(false);
    expect(after.some((it) => it.filename === 'new.svg')).toBe(true);
  });
});

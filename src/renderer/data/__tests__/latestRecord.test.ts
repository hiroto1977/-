/**
 * 「最新の 1 件」の取り出し。
 *
 * 純粋な部分は並び順に依らず createdAt で選ぶことを、実物の record store
 * (fake-indexeddb) を通す部分は **list が新しい順で、末尾が最古**であることを
 * 標本として残す —— `records[records.length - 1]` を「最新」と読む書き方が
 * 4 か所にあり、2 回目の保存から数字が動かなくなっていた。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { latestRecord } from '../latestRecord';
import { _resetRecordStoreForTests, getRecordStore } from '../store';

const rec = (createdAt: number, n: number) => ({ id: `r${n}`, createdAt, data: { n } });

describe('latestRecord — 純粋', () => {
  it('空なら null', () => {
    expect(latestRecord([])).toBeNull();
  });

  it('1 件ならそれ', () => {
    const only = rec(5, 1);
    expect(latestRecord([only])).toBe(only);
  });

  it('並び順に依らず createdAt が最大のもの', () => {
    const [a, b, c] = [rec(1, 1), rec(3, 2), rec(2, 3)];
    expect(latestRecord([a, b, c])).toBe(b);
    expect(latestRecord([c, b, a])).toBe(b);
    expect(latestRecord([b, a, c])).toBe(b);
  });

  it('同時刻なら先に並んでいる方 (list の順序 = 新しい順 を尊重)', () => {
    const [x, y] = [rec(7, 1), rec(7, 2)];
    expect(latestRecord([x, y])).toBe(x);
    expect(latestRecord([y, x])).toBe(y);
  });

  it('入力の配列を変えない', () => {
    const list = [rec(1, 1), rec(2, 2)];
    latestRecord(list);
    expect(list.map((r) => r.id)).toEqual(['r1', 'r2']);
  });
});

describe('latestRecord — 実物の record store を通す', () => {
  beforeEach(async () => {
    _resetRecordStoreForTests();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('business-hub-data');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });

  it('3 回保存すると list は新しい順 — 末尾は最古で、latestRecord は 3 回目を返す', async () => {
    const store = getRecordStore();
    await store.insert('latest-probe', { n: 1 });
    await store.insert('latest-probe', { n: 2 });
    await store.insert('latest-probe', { n: 3 });
    const list = await store.list<{ n: number }>('latest-probe');
    expect(list.map((r) => r.data.n)).toEqual([3, 2, 1]);
    // 旧い読み方 `records[records.length - 1]` はこれを「最新」としていた。
    expect(list[list.length - 1]!.data.n).toBe(1);
    expect(latestRecord(list)!.data.n).toBe(3);
  });
});

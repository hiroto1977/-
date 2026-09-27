/** @vitest-environment node */
/**
 * **`readCollectionNow` の契約** (2026-09-21 · パス 384)。
 *
 * ★ **`null` は「読めなかった」で、「0 件」ではない。** この 2 つを畳むと、
 * 呼び手が「既に在る行は無い」と結論して二重に書き込む (パス 313 / 352 と同じ規則)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRecordStore } from '../store';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { readCollectionNow, unreadableForJudgementNote } from '../readCollectionNow';

const COLLECTION = 'sales-entries';

// **隔離は共有の harness で行う** —— `_resetRecordStoreForTests()` は singleton を
// 捨てるだけで IndexedDB は残るので、前の `it()` の行が次に見える (パス 170)。
beforeEach(async () => {
  await resetRecordStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readCollectionNow', () => {
  it('★ 保管層の行を data だけにして返す', async () => {
    await getRecordStore().insert(COLLECTION, { date: '2026-05-01', channel: 'amazon', amount: 200, orders: 2 });
    const rows = await readCollectionNow<{ amount: number }>(COLLECTION);
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.amount)).toEqual([200]);
  });

  it('空のコレクションは空の配列 (null ではない —— 読めている)', async () => {
    expect(await readCollectionNow('empty-collection-for-test')).toEqual([]);
  });

  it('★ 読めなければ null (「0 件」と混ぜない)', async () => {
    vi.spyOn(getRecordStore(), 'list').mockRejectedValue(new Error('read failed'));
    expect(await readCollectionNow(COLLECTION)).toBeNull();
  });

  it('断りは「何を確かめられないか」を名指しする', () => {
    const note = unreadableForJudgementNote('売上の一覧');
    expect(note).toContain('売上の一覧を読めなかった');
    expect(note).toContain('既に同じ記録が在るかを確かめられません');
    expect(note).toContain('中止しました');
  });
});

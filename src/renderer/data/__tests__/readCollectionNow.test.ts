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
import { readCollectionNow, readRecordsNow, unreadableForJudgementNote } from '../readCollectionNow';

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

  it('★ 重複の判定でない所は、確かめられない物を言い換える (原因を取り違えない —— パス 497)', () => {
    const note = unreadableForJudgementNote('メンバーの一覧', 'オーナーが何人いるか');
    expect(note).toBe(
      'メンバーの一覧を読めなかったため、処理を中止しました（オーナーが何人いるかを確かめられません）。画面を開き直してから、もう一度お試しください。',
    );
    // 既定の文 (重複の判定) を名乗らない。
    expect(note).not.toContain('既に同じ記録が在るか');
  });
});

describe('readRecordsNow (パス 497)', () => {
  it('★ 行ごと (id・createdAt つき) に、保管層の並び (新しい順) のまま返す', async () => {
    const a = await getRecordStore().insert(COLLECTION, { date: '2026-05-01', channel: 'amazon', amount: 1, orders: 1 });
    const b = await getRecordStore().insert(COLLECTION, { date: '2026-05-02', channel: 'amazon', amount: 2, orders: 1 });
    const rows = await readRecordsNow<{ amount: number }>(COLLECTION);
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(rows!.map((r) => r.data.amount)).toEqual([2, 1]);
    expect(rows!.every((r) => typeof r.createdAt === 'number')).toBe(true);
  });

  it('空のコレクションは空の配列 (null ではない)', async () => {
    expect(await readRecordsNow('empty-collection-for-test')).toEqual([]);
  });

  it('★ 読めなければ null (「0 件」と混ぜない) —— readCollectionNow も同じ口を通る', async () => {
    const spy = vi.spyOn(getRecordStore(), 'list').mockRejectedValue(new Error('read failed'));
    expect(await readRecordsNow(COLLECTION)).toBeNull();
    expect(await readCollectionNow(COLLECTION)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

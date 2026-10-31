/**
 * **復元は 1 つの取引で、途中で投げたら「書いていない」を保つ** (2026-10-14 · パス 521 ·
 * threat: T-044)。
 *
 * ## 見つけた物 (実測 · 2026-10-14 · 直す前)
 *
 * `importAll({ replace: true })` は `clear()` と `put()` を同じ取引に並べていたが、
 * `put()` の structured clone は**同期で**投げる (深さ約 1 万の入れ子で `RangeError` ——
 * 実機の chromium と fake-indexeddb の両方で実測)。投げると `for` を抜けて `txDone` に
 * 届かず、IndexedDB は取引を**自動 commit** する —— `clear()` だけが commit され、
 * **利用者の記録は全部消えて控えからは 1 件も入らない**。しかも復元の計画
 * (`planRestore`) は深さを見ないので、その記録を「入る」と数えて確認文を組んでいた
 * (計画と実行が割れる —— パス 432 の形)。
 *
 * 届く道: バックアップは JSON ファイルで、知らない collection の中身は形の表が見ない。
 * 配られた「テンプレートのバックアップ」1 つで起きる (T-007 と同じ入口)。
 *
 * ## 直し (2 層)
 *
 * 1. **門**: `isValidStoredRecord` が `data` の深さを `MAX_RECORD_DEPTH` (32) で切る。
 *    明示の stack で歩くので、門そのものが深さで投げない。計画も同じ門を読む。
 * 2. **取引**: `put()` が投げたら `tx.abort()` してから投げ直す —— 置換の `clear()` も
 *    巻き戻る。門と取引は別の層なので、門が別の理由で通した値で投げても記録は残る。
 *
 * ## ここで見るもの
 *
 * - 深さ 20,000 の記録は門が落とし、`importAll` は 0 件・計画も `dropped` に数える。
 * - 門は深さで投げない (再帰なら呼び出しの深さで落ちる形の標本)。
 * - 境界: 32 段は通り、33 段は落ちる。実物の形の最深 (3 段) は十分に内側。
 * - ★ 取引: `IDBObjectStore.prototype.put` を**毒の id で投げる**形に差し替え、
 *   置換復元が途中で投げても既存の記録が 1 件も消えないこと・良い行も入らないこと
 *   (= 取引ごと中断) を見る。門を迂回して取引の層だけに当てる唯一の方法である。
 * - 対照: 毒の無い同じ復元は普通に通る (差し替えが復元そのものを壊していない)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRecordStore, MAX_RECORD_DEPTH, withinRecordDepth, type StoredRecord } from '../store';
import { planRestore } from '../backup';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { SALES_COLLECTION } from '../sales';

const rec = (id: string, collection: string, data: Record<string, unknown>): StoredRecord => ({
  id,
  collection,
  createdAt: 1,
  updatedAt: 1,
  data,
});
const GOOD = { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1, note: '' };

/** `{a:{a:{…}}}` を `depth` 段 (器の数) 重ねた物。再帰で組まない (深さ 2 万で組む側が落ちる)。 */
function nested(depth: number): Record<string, unknown> {
  let v: Record<string, unknown> = {};
  for (let i = 1; i < depth; i += 1) v = { a: v };
  return v;
}

beforeEach(resetRecordStore);

describe('復元の深さの門 (パス 521 · T-044)', () => {
  it('★ 深さ 20,000 の記録は門が落とし、importAll は 0 件・計画も dropped に数える (threat: T-044)', async () => {
    const deep = rec('deep', 'some-future-collection', nested(20_000));
    const store = getRecordStore();
    expect(await store.importAll([deep], { replace: true })).toBe(0);
    expect(await store.count('some-future-collection')).toBe(0);
    const plan = planRestore([], [deep], 'replace', null, false);
    expect(plan.dropped).toBe(1);
    expect(plan.toImport).toEqual([]);
  });

  it('門は深さで投げない (明示の stack で歩く)', () => {
    expect(() => withinRecordDepth(nested(200_000))).not.toThrow();
    expect(withinRecordDepth(nested(200_000))).toBe(false);
  });

  it('境界: MAX_RECORD_DEPTH 段は通り、+1 段は落ちる。配列の入れ子も同じ', () => {
    expect(MAX_RECORD_DEPTH).toBe(32);
    expect(withinRecordDepth(nested(MAX_RECORD_DEPTH))).toBe(true);
    expect(withinRecordDepth(nested(MAX_RECORD_DEPTH + 1))).toBe(false);
    let arr: unknown[] = [];
    for (let i = 1; i < MAX_RECORD_DEPTH + 1; i += 1) arr = [arr];
    expect(withinRecordDepth({ arr })).toBe(false);
    expect(withinRecordDepth({ crops: [{ k: { v: 1 } }] })).toBe(true); // 実物の最深 (3 段) より内側
    expect(withinRecordDepth({ s: 'x', n: 1, b: null })).toBe(true);
  });

  it('器でない物は段を数えない (文字列・null・数は深さ 0 として通る)', () => {
    // 文字列を器として歩くと `Object.values('x')` は ['x'] で、1 字の文字列が自分を
    // 含む形になり深さが尽きるまで歩く —— 器の判定が緩むとここが false になる。
    expect(withinRecordDepth('x')).toBe(true);
    expect(withinRecordDepth('x'.repeat(100))).toBe(true);
    expect(withinRecordDepth(null)).toBe(true);
    expect(withinRecordDepth(42)).toBe(true);
    expect(withinRecordDepth(undefined)).toBe(true);
    // 欄の値として在る文字列・null も器ではない (`Object.values(null)` は投げる)。
    expect(withinRecordDepth({ s: 'x'.repeat(100), b: null, arr: ['y', null, 1] })).toBe(true);
    expect(withinRecordDepth({ s: 'x', nested: nested(MAX_RECORD_DEPTH - 1) })).toBe(true);
    expect(withinRecordDepth({ s: 'x', nested: nested(MAX_RECORD_DEPTH) })).toBe(false);
  });
});

describe('復元の取引は途中で投げたら巻き戻る (パス 521 · T-044)', () => {
  const originalPut = IDBObjectStore.prototype.put;
  afterEach(() => {
    IDBObjectStore.prototype.put = originalPut;
  });

  it('★ put が途中で投げても、置換復元は既存の記録を 1 件も消さず、良い行も入れない (threat: T-044)', async () => {
    const store = getRecordStore();
    await store.insert(SALES_COLLECTION, GOOD);
    await store.insert(SALES_COLLECTION, { ...GOOD, amount: 2000 });
    expect(await store.count(SALES_COLLECTION)).toBe(2);

    // 門を通る (形も深さも正しい) 記録のうち、id が毒の物だけ put を投げさせる ——
    // 門を迂回して取引の層だけに当てる。
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if ((value as { id?: unknown })?.id === 'poison') throw new RangeError('Maximum call stack size exceeded');
      return originalPut.call(this, value, key);
    };
    const incoming = [rec('ok-1', SALES_COLLECTION, GOOD), rec('poison', SALES_COLLECTION, GOOD), rec('ok-2', SALES_COLLECTION, GOOD)];
    await expect(store.importAll(incoming, { replace: true })).rejects.toThrow(RangeError);

    const after = await store.list<Record<string, unknown>>(SALES_COLLECTION);
    expect(after.length, '置換の clear() だけが commit されて記録が消えた').toBe(2);
    expect(after.map((r) => r.id).sort()).not.toContain('ok-1');
    expect(after.map((r) => r.data.amount).sort()).toEqual([1000, 2000]);
  });

  it('★ マージでも put が途中で投げたら取引ごと中断し、先に書いた良い行も入らない (threat: T-044)', async () => {
    const store = getRecordStore();
    await store.insert(SALES_COLLECTION, GOOD);
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if ((value as { id?: unknown })?.id === 'poison') throw new RangeError('Maximum call stack size exceeded');
      return originalPut.call(this, value, key);
    };
    const incoming = [rec('ok-1', SALES_COLLECTION, GOOD), rec('poison', SALES_COLLECTION, GOOD), rec('ok-2', SALES_COLLECTION, GOOD)];
    // マージは `get` → `put` を連ねるので、投げるのは `onsuccess` の中 —— そこでも同じ `abort()`。
    await expect(store.importAll(incoming)).rejects.toThrow(RangeError);
    const after = await store.list<Record<string, unknown>>(SALES_COLLECTION);
    expect(after.map((r) => r.id)).not.toContain('ok-1');
    expect(after.map((r) => r.id)).not.toContain('ok-2');
    expect(after).toHaveLength(1);
  });

  it('★ マージの読み (get) が同期で投げても取引ごと中断し、先に書いた良い行も入らない (threat: T-044)', async () => {
    const store = getRecordStore();
    await store.insert(SALES_COLLECTION, GOOD);
    // `put` ではなく `get` が投げる形 —— `onsuccess` の外 (要求を並べる for の中) で投げるので、
    // 受けるのは外側の catch。そこが abort しなければ取引は自動 commit され、ok-1 が入る。
    const originalGet = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
      if (key === 'poison') throw new RangeError('get exploded');
      return originalGet.call(this, key);
    };
    try {
      const incoming = [rec('ok-1', SALES_COLLECTION, GOOD), rec('poison', SALES_COLLECTION, GOOD)];
      await expect(store.importAll(incoming)).rejects.toThrow(RangeError);
    } finally {
      IDBObjectStore.prototype.get = originalGet;
    }
    const after = await store.list<Record<string, unknown>>(SALES_COLLECTION);
    expect(after.map((r) => r.id)).not.toContain('ok-1');
    expect(after).toHaveLength(1);
  });

  it('対照: 毒が無ければ同じ置換復元が通る (差し替えが復元を壊していない)', async () => {
    const store = getRecordStore();
    await store.insert(SALES_COLLECTION, GOOD);
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if ((value as { id?: unknown })?.id === 'poison') throw new RangeError('x');
      return originalPut.call(this, value, key);
    };
    expect(await store.importAll([rec('ok-1', SALES_COLLECTION, GOOD)], { replace: true })).toBe(1);
    const after = await store.list<Record<string, unknown>>(SALES_COLLECTION);
    expect(after.map((r) => r.id)).toEqual(['ok-1']);
  });
});

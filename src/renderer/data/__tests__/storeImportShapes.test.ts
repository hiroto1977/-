/**
 * `importAll` は封筒だけでなく**中身の形**も見る (`collectionShapes.ts`)。
 * 封緘済み (`__enc`) の中身は見られないので封筒だけで通す —— ここを落とすと
 * 暗号化バックアップが丸ごと復元できなくなる。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getRecordStore, _resetRecordStoreForTests, type StoredRecord } from '../store';
import { createPassphraseRecordCipher } from '../recordCipher';
import { randomSaltB64 } from '../../security/dataCrypto';
import { SALES_COLLECTION } from '../sales';

async function resetDb(): Promise<void> {
  _resetRecordStoreForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

const rec = (id: string, collection: string, data: Record<string, unknown>): StoredRecord => ({
  id,
  collection,
  createdAt: 1,
  updatedAt: 1,
  data,
});
const GOOD = { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1, note: '' };
const BAD = { date: '2026-04-01', channel: 'amazon', amount: 'abc', orders: 1, note: '' };

beforeEach(resetDb);

describe('importAll — 中身の形', () => {
  it('★ 形の違うレコードは捨て、合うレコードと知らない collection は入れる', async () => {
    const store = getRecordStore();
    const n = await store.importAll([
      rec('good', SALES_COLLECTION, GOOD),
      rec('bad', SALES_COLLECTION, BAD),
      rec('future', 'some-future-collection', { anything: 1 }),
    ]);
    expect(n).toBe(2);
    const sales = await store.list<Record<string, unknown>>(SALES_COLLECTION);
    expect(sales.map((r) => r.id)).toEqual(['good']);
    expect(await store.count('some-future-collection')).toBe(1);
  });

  it('★ 封緘済みの中身は見られないので封筒だけで通す (暗号化バックアップを落とさない)', async () => {
    const cipher = await createPassphraseRecordCipher('pw', randomSaltB64());
    const sealedBad = await cipher.encrypt(BAD); // 中身は形違いだが封緘済み
    const store = getRecordStore();
    store.configureCipher(cipher);
    expect(await store.importAll([rec('sealed', SALES_COLLECTION, sealedBad as unknown as Record<string, unknown>)])).toBe(1);
    expect(await store.count(SALES_COLLECTION)).toBe(1);
  });

  it('対照: 同じ形違いを平文で入れると捨てる (封緘の有無だけが違う)', async () => {
    const store = getRecordStore();
    expect(await store.importAll([rec('plain', SALES_COLLECTION, BAD)])).toBe(0);
    expect(await store.count(SALES_COLLECTION)).toBe(0);
  });
});

/**
 * **封筒の時刻も「時刻として読める数」だけを受ける** (2026-09-27 · パス 493)。パス 98 は非有限
 * (`1e999`) を落としたが、`1e20` は有限なので通っていた —— `Date` の範囲の外で、表示の側
 * (`parseTimestamp`) は読めないと断る値である。境界は `isTimestampMs` の 1 つ。
 */
describe('importAll — 封筒の時刻', () => {
  const at = (id: string, createdAt: number, updatedAt: number): StoredRecord => ({ ...rec(id, SALES_COLLECTION, GOOD), createdAt, updatedAt });

  it('★ 有限でも時刻でない createdAt / updatedAt の記録は捨て、境界ちょうどは入れる', async () => {
    const store = getRecordStore();
    const n = await store.importAll([
      at('far-created', 1e20, 1),
      at('far-updated', 1, -1e20),
      at('edge', 8_640_000_000_000_000, 8_640_000_000_000_000),
      at('normal', 1_757_000_000_000, 1_757_000_000_000),
    ]);
    expect(n).toBe(2);
    const ids = (await store.list<Record<string, unknown>>(SALES_COLLECTION)).map((r) => r.id).sort();
    expect(ids).toEqual(['edge', 'normal']);
  });

  it('対照: 非有限 (パス 98 の形) も今までどおり捨てる', async () => {
    const store = getRecordStore();
    expect(await store.importAll([at('inf', Number.POSITIVE_INFINITY, 1)])).toBe(0);
  });
});

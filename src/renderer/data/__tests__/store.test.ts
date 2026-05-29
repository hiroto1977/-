/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { getRecordStore, _resetRecordStoreForTests } from '../store';

function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  await clearIdb();
});

describe('RecordStore — insert + get + list', () => {
  it('starts empty', async () => {
    const store = getRecordStore();
    expect(await store.list('sales')).toHaveLength(0);
    expect(await store.count('sales')).toBe(0);
  });

  it('inserts and reads back a record with timestamps', async () => {
    const store = getRecordStore();
    const rec = await store.insert('sales', { amount: 1000, memo: '初売上' });
    expect(rec.id).toMatch(/[0-9a-f-]{36}/);
    expect(rec.collection).toBe('sales');
    expect(rec.data).toEqual({ amount: 1000, memo: '初売上' });
    expect(rec.createdAt).toBe(rec.updatedAt);

    const got = await store.get(rec.id);
    expect(got?.data).toEqual({ amount: 1000, memo: '初売上' });
  });

  it('lists newest-first within a collection', async () => {
    const store = getRecordStore();
    await store.insert('sales', { amount: 1 });
    await store.insert('sales', { amount: 2 });
    await store.insert('sales', { amount: 3 });
    const list = await store.list<{ amount: number }>('sales');
    expect(list.map((r) => r.data.amount)).toEqual([3, 2, 1]);
  });

  it('keeps collections isolated', async () => {
    const store = getRecordStore();
    await store.insert('sales', { amount: 1 });
    await store.insert('customers', { name: 'A社' });
    await store.insert('customers', { name: 'B社' });
    expect(await store.count('sales')).toBe(1);
    expect(await store.count('customers')).toBe(2);
    expect(await store.list('sales')).toHaveLength(1);
  });
});

describe('RecordStore — update', () => {
  it('shallow-merges a patch and bumps updatedAt', async () => {
    const store = getRecordStore();
    const rec = await store.insert('customers', { name: 'A社', tier: 'free' });
    const updated = await store.update<{ name: string; tier: string }>(rec.id, { tier: 'pro' });
    expect(updated?.data).toEqual({ name: 'A社', tier: 'pro' });
    expect(updated!.updatedAt).toBeGreaterThan(rec.updatedAt);
    expect(updated!.createdAt).toBe(rec.createdAt);
  });

  it('returns null when updating a missing id', async () => {
    const store = getRecordStore();
    expect(await store.update('does-not-exist', { x: 1 })).toBeNull();
  });
});

describe('RecordStore — remove + clearCollection', () => {
  it('removes a single record', async () => {
    const store = getRecordStore();
    const rec = await store.insert('sales', { amount: 1 });
    await store.remove(rec.id);
    expect(await store.get(rec.id)).toBeNull();
    expect(await store.count('sales')).toBe(0);
  });

  it('clearCollection deletes only that collection and reports the count', async () => {
    const store = getRecordStore();
    await store.insert('sales', { amount: 1 });
    await store.insert('sales', { amount: 2 });
    await store.insert('customers', { name: 'A社' });
    const removed = await store.clearCollection('sales');
    expect(removed).toBe(2);
    expect(await store.count('sales')).toBe(0);
    expect(await store.count('customers')).toBe(1);
  });
});

describe('RecordStore — validation', () => {
  it('rejects an unsafe collection name', async () => {
    const store = getRecordStore();
    await expect(store.insert('Bad Name', { x: 1 })).rejects.toThrow(/collection/);
    await expect(store.list('')).rejects.toThrow(/collection/);
  });

  it('rejects non-plain data', async () => {
    const store = getRecordStore();
    // arrays / class instances aren't plain JSON objects
    await expect(store.insert('sales', [] as unknown as Record<string, unknown>)).rejects.toThrow(
      /プレーン/,
    );
    await expect(
      store.insert('sales', new Date() as unknown as Record<string, unknown>),
    ).rejects.toThrow(/プレーン/);
  });

  it('get returns null for an empty id', async () => {
    const store = getRecordStore();
    expect(await store.get('')).toBeNull();
  });
});

describe('RecordStore — exportAll + importAll (backup/restore)', () => {
  it('exports every record across collections, newest-first', async () => {
    const store = getRecordStore();
    await store.insert('sales', { amount: 1 });
    await store.insert('kpi-actuals', { revenue: 2 });
    const all = await store.exportAll();
    expect(all).toHaveLength(2);
    // newest-first by createdAt
    expect(all[0]!.createdAt).toBeGreaterThanOrEqual(all[1]!.createdAt);
    expect(new Set(all.map((r) => r.collection))).toEqual(new Set(['sales', 'kpi-actuals']));
  });

  it('merges by default (upsert by id) and can replace', async () => {
    const store = getRecordStore();
    const a = await store.insert('sales', { amount: 1 });
    // merge: a new record + an edit to the existing one
    const imported = await store.importAll([
      { id: a.id, collection: 'sales', createdAt: a.createdAt, updatedAt: 99, data: { amount: 999 } },
      { id: 'new1', collection: 'sales', createdAt: 5, updatedAt: 5, data: { amount: 2 } },
    ]);
    expect(imported).toBe(2);
    expect((await store.get<{ amount: number }>(a.id))!.data.amount).toBe(999);
    expect(await store.count('sales')).toBe(2);

    // replace: wipes everything first
    await store.importAll([{ id: 'only', collection: 'sales', createdAt: 1, updatedAt: 1, data: { amount: 7 } }], {
      replace: true,
    });
    expect(await store.count('sales')).toBe(1);
    expect((await store.get<{ amount: number }>('only'))!.data.amount).toBe(7);
  });

  it('drops malformed records from an untrusted backup', async () => {
    const store = getRecordStore();
    const imported = await store.importAll([
      { id: 'ok', collection: 'sales', createdAt: 1, updatedAt: 1, data: { amount: 1 } },
      { id: '', collection: 'sales', createdAt: 1, updatedAt: 1, data: {} } as never, // empty id
      { id: 'x', collection: 'Bad Name', createdAt: 1, updatedAt: 1, data: {} } as never, // bad collection
      { id: 'y', collection: 'sales', createdAt: 1, updatedAt: 1, data: null } as never, // bad data
    ]);
    expect(imported).toBe(1);
    expect(await store.count('sales')).toBe(1);
  });
});

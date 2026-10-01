/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { getRecordStore, _resetRecordStoreForTests } from '../store';
import { IDENTITY_CIPHER, createPassphraseRecordCipher, isSealedData } from '../recordCipher';
import { randomSaltB64 } from '../../security/dataCrypto';

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

describe('RecordStore — insertMany (atomic bulk import)', () => {
  it('inserts every row in one batch and returns them', async () => {
    const store = getRecordStore();
    const out = await store.insertMany('sales', [{ amount: 1 }, { amount: 2 }, { amount: 3 }]);
    expect(out).toHaveLength(3);
    expect(await store.count('sales')).toBe(3);
    // each got a distinct id
    expect(new Set(out.map((r) => r.id)).size).toBe(3);
  });

  it('returns [] for an empty batch without writing', async () => {
    const store = getRecordStore();
    expect(await store.insertMany('sales', [])).toEqual([]);
    expect(await store.count('sales')).toBe(0);
  });

  it('rejects the WHOLE batch (no partial import) when any row is invalid', async () => {
    const store = getRecordStore();
    await expect(
      store.insertMany('sales', [{ amount: 1 }, [] as unknown as Record<string, unknown>, { amount: 3 }]),
    ).rejects.toThrow(/プレーン/);
    // nothing committed
    expect(await store.count('sales')).toBe(0);
  });

  it('rejects an unsafe collection without writing', async () => {
    const store = getRecordStore();
    await expect(store.insertMany('Bad Name', [{ a: 1 }])).rejects.toThrow(/collection/);
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

  /*
   * `isPlainJsonObject` が**原型を見ている**理由を、実物で留める。
   *
   * 2026-08-26 に測った: `JSON.parse('{"__proto__":{…}}')` は `__proto__` を
   * **自前の列挙可能プロパティ**として作るので、そこから浅くコピーすると
   * **コピー先の原型が差し替わる** (`Object.prototype` は汚れない ——
   * 汚れるのは再帰マージのときで、この repo に再帰マージは無い)。
   * 原型の差し替わった record が保存されると、以後その record への
   * `hasOwnProperty` 等の呼び出しが攻撃者の値を通る。
   *
   * 守りは在ったが**証人が居なかった** —— 上の「malformed」検査は
   * 空 id / 不正なコレクション名 / `data: null` しか見ていない。
   * `isPlainJsonObject` の原型検査を消しても、この 1 件しか鳴らない。
   */
  it('原型を差し替えられた record を落とす (__proto__ 入りのバックアップ)', async () => {
    const store = getRecordStore();
    // 敵対的なバックアップ本文をそのまま解析する (手で書くと原型は差し替わらない)。
    const hostile = JSON.parse('{"__proto__":{"polluted":"yes"},"amount":1}') as Record<string, unknown>;
    const reparented: Record<string, unknown> = {};
    for (const k of Object.keys(hostile)) reparented[k] = hostile[k];

    // 前提の確認: この形は本当に原型が差し替わっている (でなければ検査は空撃ち)。
    expect(Object.getPrototypeOf(reparented)).not.toBe(Object.prototype);
    expect((reparented as { polluted?: string }).polluted).toBe('yes');
    // Object.prototype 自体は汚れていない (汚染の器は再帰マージであってここではない)。
    expect(({} as { polluted?: string }).polluted).toBeUndefined();

    const imported = await store.importAll([
      { id: 'ok', collection: 'sales', createdAt: 1, updatedAt: 1, data: { amount: 1 } },
      { id: 'bad-data', collection: 'sales', createdAt: 1, updatedAt: 1, data: reparented } as never,
    ]);
    expect(imported).toBe(1);
    expect(await store.count('sales')).toBe(1);
  });

  /*
   * **通してよい側も書く。** 最初にここを「落とすはず」と書いて落ちた ——
   * 実装ではなく**期待のほうが誤っていた**。
   *
   * スプレッドは新しい平オブジェクトを作る (原型は `Object.prototype`) ので、
   * 原型が差し替わった物を撒き直しても結果は素直な record である。
   * `__proto__` という**名前の自前キー**が残るが、それはただのデータで、
   * 読み出しても原型は辿らない。ここで落とすと、正当なバックアップの
   * 「`__proto__` という列名」まで消える (`csv.test.ts` が同じ線を引いている)。
   */
  it('__proto__ という名前の自前キーは、ただのデータとして通す', async () => {
    const store = getRecordStore();
    const hostile = JSON.parse('{"__proto__":{"polluted":"yes"},"amount":1}') as Record<string, unknown>;
    const spread = { ...hostile };
    expect(Object.getPrototypeOf(spread)).toBe(Object.prototype); // 撒き直しで素直に戻る

    const imported = await store.importAll([
      { id: 'plain', collection: 'sales', createdAt: 1, updatedAt: 1, data: spread } as never,
    ]);
    expect(imported).toBe(1);

    const [back] = await store.list('sales');
    expect(back?.data.amount).toBe(1);
    expect(Object.getPrototypeOf(back?.data as object)).toBe(Object.prototype);
    expect(({} as { polluted?: string }).polluted).toBeUndefined();
  });
});

describe('RecordStore — save-time encryption (RecordCipher)', () => {
  it('encrypts data at rest but returns plaintext through the API', async () => {
    const store = getRecordStore();
    store.configureCipher(await createPassphraseRecordCipher('pw', randomSaltB64()));

    const rec = await store.insert('sales', { amount: 50000, memo: '機密' });
    expect(rec.data).toEqual({ amount: 50000, memo: '機密' }); // caller sees plaintext

    // raw at-rest payload is sealed (no plaintext leaks into IndexedDB)
    const raw = await store.exportAll();
    expect(isSealedData(raw[0]!.data)).toBe(true);
    expect(JSON.stringify(raw)).not.toContain('機密');

    // reads decrypt transparently
    expect((await store.get<{ amount: number }>(rec.id))!.data).toEqual({ amount: 50000, memo: '機密' });
    expect((await store.list('sales'))[0]!.data).toEqual({ amount: 50000, memo: '機密' });
  });

  it('update round-trips through encryption', async () => {
    const store = getRecordStore();
    store.configureCipher(await createPassphraseRecordCipher('pw', randomSaltB64()));
    const rec = await store.insert('customers', { name: 'A', tier: 'free' });
    const up = await store.update<{ name: string; tier: string }>(rec.id, { tier: 'pro' });
    expect(up!.data).toEqual({ name: 'A', tier: 'pro' });
    const raw = await store.exportAll();
    expect(isSealedData(raw[0]!.data)).toBe(true);
  });

  it('reencryptAll migrates existing plaintext records', async () => {
    const store = getRecordStore();
    // write plaintext first (identity cipher)
    const rec = await store.insert('sales', { amount: 1 });
    let raw = await store.exportAll();
    expect(isSealedData(raw[0]!.data)).toBe(false);

    // enable encryption + migrate
    store.configureCipher(await createPassphraseRecordCipher('pw', randomSaltB64()));
    const migrated = await store.reencryptAll();
    expect(migrated).toBe(1);
    raw = await store.exportAll();
    expect(isSealedData(raw[0]!.data)).toBe(true);
    // still readable
    expect((await store.get<{ amount: number }>(rec.id))!.data).toEqual({ amount: 1 });
  });

  it('identity cipher refuses to read records sealed by a passphrase cipher', async () => {
    const store = getRecordStore();
    const salt = randomSaltB64();
    store.configureCipher(await createPassphraseRecordCipher('pw', salt));
    const rec = await store.insert('sales', { amount: 1 });

    // simulate a fresh session without the key
    store.configureCipher(IDENTITY_CIPHER);
    await expect(store.get(rec.id)).rejects.toThrow(/暗号化/);
  });
});

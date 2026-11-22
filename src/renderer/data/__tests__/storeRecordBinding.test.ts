/** @vitest-environment jsdom */
/*
 * レコード単位の改ざん検知を、保管層 (`store.ts`) を通して確かめる (2026-11-21)。
 *
 * 封緘の結び付け (`recordCipher.ts`) が単体で正しくても、保管層が**読んでいる行の名前**を
 * 渡していなければ守りは無い。ここは本物の IndexedDB (fake-indexeddb) に暗号化した記録を書き、
 * 保管層の外から行の中身を入れ替え・書き換えて、読みが断ることを見る。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { getRecordStore } from '../store';
import { createPassphraseRecordCipher, isSealedData, RecordTamperedError } from '../recordCipher';
import { randomSaltB64 } from '../../security/dataCrypto';
import { resetRecordStore, RECORD_DB_NAME } from '../../__tests__/recordStoreHarness';

type Row = { id: string; collection: string; createdAt: number; updatedAt: number; data: Record<string, unknown> };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(RECORD_DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function rawRows(): Promise<Row[]> {
  const db = await openDb();
  const name = db.objectStoreNames[0]!;
  const rows = await new Promise<Row[]>((resolve, reject) => {
    const req = db.transaction(name, 'readonly').objectStore(name).getAll();
    req.onsuccess = () => resolve(req.result as Row[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows;
}

async function putRaw(row: Row): Promise<void> {
  const db = await openDb();
  const name = db.objectStoreNames[0]!;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    tx.objectStore(name).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

beforeEach(async () => {
  await resetRecordStore();
});

async function encryptedStore() {
  const store = getRecordStore();
  store.configureCipher(await createPassphraseRecordCipher('pw', randomSaltB64()));
  const a = await store.insert('sales-entries', { amount: 1_000_000, note: 'A 社' });
  const b = await store.insert('sales-entries', { amount: 10, note: 'B 社' });
  return { store, a, b };
}

describe('★ 保管層を通したレコード単位の改ざん検知', () => {
  it('★ 2 つの記録の暗号化された中身を入れ替えると、読みが断る', async () => {
    const { store, a, b } = await encryptedStore();
    const rows = await rawRows();
    const ra = rows.find((r) => r.id === a.id)!;
    const rb = rows.find((r) => r.id === b.id)!;
    expect(isSealedData(ra.data)).toBe(true);
    await putRaw({ ...ra, data: rb.data });
    await expect(store.get(a.id)).rejects.toThrow(RecordTamperedError);
    await expect(store.list('sales-entries')).rejects.toThrow(/別の記録の中身です/);
    // 入れ替えていない B は今までどおり読める
    expect((await store.get(b.id))?.data).toEqual({ amount: 10, note: 'B 社' });
  });

  it('★ 暗号文を書き換えると、読みが断る', async () => {
    const { store, a } = await encryptedStore();
    const ra = (await rawRows()).find((r) => r.id === a.id)!;
    const enc = (ra.data as { __enc: { iv: string; ct: string } }).__enc;
    const ct = (enc.ct[0] === 'A' ? 'B' : 'A') + enc.ct.slice(1);
    await putRaw({ ...ra, data: { __enc: { iv: enc.iv, ct } } });
    await expect(store.get(a.id)).rejects.toThrow(/封緘を開けません/);
  });

  it('★ 別の collection へ写しても断る', async () => {
    const { store, a } = await encryptedStore();
    const ra = (await rawRows()).find((r) => r.id === a.id)!;
    await putRaw({ ...ra, id: 'moved', collection: 'kpi-actuals' });
    await expect(store.get('moved')).rejects.toThrow(/別の記録の中身です/);
  });

  it('対照: 書き換えていない記録は、書く・読む・直す・一括で入れる のどの道でも読める', async () => {
    const { store, a } = await encryptedStore();
    expect((await store.get(a.id))?.data).toEqual({ amount: 1_000_000, note: 'A 社' });
    await store.update(a.id, { note: 'A 社 (直した)' });
    expect((await store.get(a.id))?.data).toEqual({ amount: 1_000_000, note: 'A 社 (直した)' });
    const many = await store.insertMany('kpi-actuals', [{ revenue: 1 }, { revenue: 2 }]);
    expect((await store.list('kpi-actuals')).map((r) => r.data).sort((x, y) => (x.revenue as number) - (y.revenue as number))).toEqual([
      { revenue: 1 },
      { revenue: 2 },
    ]);
    expect(many).toHaveLength(2);
    // 控え → 全部入れ替えの復元: 封緘はそのまま入り、自分の名前で開く
    const exported = await store.exportAll();
    await store.importAll(exported, { replace: true });
    expect((await store.get(a.id))?.data).toEqual({ amount: 1_000_000, note: 'A 社 (直した)' });
  });
});

describe('★ 最新を比べて書く 2 つの口も、書いた行の名前に結び付ける', () => {
  it('insertIfLatest で足した行は、暗号化していても読み戻せる', async () => {
    const store = getRecordStore();
    store.configureCipher(await createPassphraseRecordCipher('pw', randomSaltB64()));
    const res = await store.insertIfLatest('sales-entries', null, { amount: 5, note: 'C 社' });
    expect(res.status).toBe('saved');
    if (res.status !== 'saved') return;
    expect(isSealedData((await rawRows())[0]!.data)).toBe(true);
    expect((await store.get(res.record.id))?.data).toEqual({ amount: 5, note: 'C 社' });
  });

  it('replaceLatestIfUnchanged で置き換えた行は、暗号化していても読み戻せる', async () => {
    const { store, b } = await encryptedStore();
    const res = await store.replaceLatestIfUnchanged('sales-entries', { id: b.id, updatedAt: b.updatedAt }, { amount: 99, note: 'B 社' });
    expect(res.status).toBe('saved');
    expect((await store.get(b.id))?.data).toEqual({ amount: 99, note: 'B 社' });
  });
});

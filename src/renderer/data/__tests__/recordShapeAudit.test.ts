/**
 * 形の合わないレコードの点検と削除 (`data/recordShapeAudit.ts`) —— 実物の record store で。
 * 種は `insert` で入れる (書く側は型で守られているので形の検査は無く、形違いを実際に置ける)。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getRecordStore, _resetRecordStoreForTests } from '../store';
import { createPassphraseRecordCipher } from '../recordCipher';
import { randomSaltB64 } from '../../security/dataCrypto';
import { SALES_COLLECTION } from '../sales';
import { KPI_ACTUALS_COLLECTION } from '../kpiActuals';
import { auditRecordShapes, deleteRecords, deleteResultMessage, summarizeMalformed } from '../recordShapeAudit';

async function resetDb(): Promise<void> {
  _resetRecordStoreForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

const GOOD = { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1, note: '' };
const BAD = { date: '2026-04-02', channel: 'amazon', amount: 'abc', orders: 1, note: '' };

beforeEach(resetDb);

describe('auditRecordShapes', () => {
  it('★ 形の合わないレコードを collection ごとに見つけ、知らない collection は見ない', async () => {
    const store = getRecordStore();
    await store.insert(SALES_COLLECTION, GOOD);
    const bad = await store.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    const badKpi = await store.insert(KPI_ACTUALS_COLLECTION, { period: 2026 } as unknown as Record<string, unknown>);
    await store.insert('some-future-collection', { anything: 'x' });
    const r = await auditRecordShapes(store);
    expect(r.checked).toBe(3);
    expect(r.skippedSealed).toBe(0);
    expect(r.unreadable).toEqual([]);
    expect(r.malformed).toEqual([
      { id: bad.id, collection: SALES_COLLECTION },
      { id: badKpi.id, collection: KPI_ACTUALS_COLLECTION },
    ]);
    expect(summarizeMalformed(r.malformed)).toBe('sales-entries 1 件 / kpi-actuals 1 件');
  });

  it('対照: 合うレコードだけなら 0 件', async () => {
    const store = getRecordStore();
    await store.insert(SALES_COLLECTION, GOOD);
    const r = await auditRecordShapes(store);
    expect(r).toEqual({ checked: 1, skippedSealed: 0, unreadable: [], malformed: [] });
    expect(summarizeMalformed(r.malformed)).toBe('');
  });

  it('★ 暗号化されたレコードを既定の cipher で読むと list が投げる → その collection は「読めなかった」で、消す対象にならない', async () => {
    const sealedStore = getRecordStore();
    sealedStore.configureCipher(await createPassphraseRecordCipher('pw', randomSaltB64()));
    await sealedStore.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    // 別の (既定の) cipher で読む = 封緘が解けず list が投げる
    _resetRecordStoreForTests();
    const store = getRecordStore();
    const r = await auditRecordShapes(store);
    expect(r.unreadable).toEqual([SALES_COLLECTION]);
    expect(r.checked).toBe(0);
    expect(r.malformed).toEqual([]);
    expect(await store.count(SALES_COLLECTION)).toBe(1);
  });

  it('★ 封緘のまま返ってきた中身は判定しない (鍵が違うだけかもしれない — 素通しする cipher への備え)', async () => {
    const cipher = await createPassphraseRecordCipher('pw', randomSaltB64());
    const sealed = await cipher.encrypt(BAD as unknown as Record<string, unknown>);
    const passthrough = {
      list: async (collection: string) =>
        collection === SALES_COLLECTION
          ? [{ id: 's1', collection, createdAt: 1, updatedAt: 1, data: sealed as unknown as Record<string, unknown> }, { id: 'p1', collection, createdAt: 1, updatedAt: 1, data: BAD as unknown as Record<string, unknown> }]
          : [],
    };
    const r = await auditRecordShapes(passthrough);
    expect(r.skippedSealed).toBe(1);
    expect(r.checked).toBe(1);
    expect(r.malformed).toEqual([{ id: 'p1', collection: SALES_COLLECTION }]);
  });

  it('読み出しに失敗した collection は「読めなかった」に数え、消す対象にしない', async () => {
    const failing = {
      list: async (collection: string) => {
        if (collection === SALES_COLLECTION) throw new Error('boom');
        return [];
      },
    };
    const r = await auditRecordShapes(failing);
    expect(r.unreadable).toEqual([SALES_COLLECTION]);
    expect(r.malformed).toEqual([]);
    expect(r.checked).toBe(0);
  });
});

describe('deleteRecords', () => {
  it('★ 指定した id だけ消し、消した数を返す。再点検で 0 件', async () => {
    const store = getRecordStore();
    const good = await store.insert(SALES_COLLECTION, GOOD);
    const bad1 = await store.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    const bad2 = await store.insert(SALES_COLLECTION, { ...BAD, date: 5 } as unknown as Record<string, unknown>);
    const r = await auditRecordShapes(store);
    expect(r.malformed.map((m) => m.id).sort()).toEqual([bad1.id, bad2.id].sort());
    expect(await deleteRecords(store, r.malformed.map((m) => m.id))).toEqual({ deleted: 2, skipped: 0 });
    expect((await store.list(SALES_COLLECTION)).map((x) => x.id)).toEqual([good.id]);
    expect((await auditRecordShapes(store)).malformed).toEqual([]);
  });

  /**
   * **渡された一覧は「点検した時点」の物である** (2026-09-23 · パス 433)。
   *
   * 点検から押すまでの間に中身が変わりうる —— この画面のすぐ下でバックアップを復元すれば
   * 同じ id が `put` で置き換わる。直す前の `deleteRecords` は渡された id を無条件に消したので、
   * **復元したばかりの正しい記録**が「形式の合わないレコード」として消えた (元に戻せない)。
   */
  it('★ 点検の後に形が合うようになった id は消さない (復元で置き換わった場合)', async () => {
    const store = getRecordStore();
    const bad1 = await store.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    const bad2 = await store.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    const audit = await auditRecordShapes(store);
    expect(audit.malformed).toHaveLength(2);

    // 良いバックアップをマージ復元する (importAll は id ごとの upsert)。
    await store.importAll([
      { id: bad1.id, collection: SALES_COLLECTION, createdAt: 1, updatedAt: 999, data: GOOD },
      { id: bad2.id, collection: SALES_COLLECTION, createdAt: 1, updatedAt: 999, data: { ...GOOD, amount: 2000 } },
    ]);
    expect((await auditRecordShapes(store)).malformed, '復元で形は合うようになった').toEqual([]);

    // 画面が持っている古い一覧で消しにいく。
    expect(await deleteRecords(store, audit.malformed.map((m) => m.id))).toEqual({ deleted: 0, skipped: 2 });
    expect((await store.list(SALES_COLLECTION)).map((x) => x.id).sort(), '2 件とも残る').toEqual([bad1.id, bad2.id].sort());
  });

  it('★ 混ざっていれば、今も合わない分だけ消す', async () => {
    const store = getRecordStore();
    const bad1 = await store.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    const bad2 = await store.insert(SALES_COLLECTION, BAD as unknown as Record<string, unknown>);
    const audit = await auditRecordShapes(store);
    await store.importAll([{ id: bad1.id, collection: SALES_COLLECTION, createdAt: 1, updatedAt: 999, data: GOOD }]);
    expect(await deleteRecords(store, audit.malformed.map((m) => m.id))).toEqual({ deleted: 1, skipped: 1 });
    expect((await store.list(SALES_COLLECTION)).map((x) => x.id), '直った側だけ残る').toEqual([bad1.id]);
    expect(bad2.id).not.toBe(bad1.id);
  });

  it('★ 消さなかった分は理由つきで言う (黙って少なく消さない)', () => {
    expect(deleteResultMessage({ deleted: 2, skipped: 0 })).toBe('2 件を削除しました。再読み込みで反映されます。');
    expect(deleteResultMessage({ deleted: 1, skipped: 1 })).toBe(
      '1 件を削除しました。1 件は消す直前に形が合うようになっていたので残しました。再読み込みで反映されます。',
    );
    // 針が的に当たる標本: 0 件のときは理由の句が出ない。
    expect(deleteResultMessage({ deleted: 0, skipped: 0 })).not.toContain('残しました');
  });

  it('消す途中で失敗したら投げる (半端に消えた分は再点検で分かる)', async () => {
    let calls = 0;
    // 点検が a / b / c を「形が合わない」と答える store (消す側だけを失敗させる)。
    const rows = ['a', 'b', 'c'].map((id) => ({ id, data: BAD as unknown as Record<string, unknown> }));
    const store = {
      list: async (collection: string) => (collection === SALES_COLLECTION ? rows : []),
      remove: async (id: string) => {
        calls += 1;
        if (id === 'b') throw new Error('remove failed');
      },
    };
    await expect(deleteRecords(store, ['a', 'b', 'c'])).rejects.toThrow('remove failed');
    expect(calls).toBe(2);
  });
});

/**
 * 台帳に無い collection の記録 —— 見えて・消せて・数えられる (2026-10-15 · パス 522 · threat: T-050)。
 *
 * 復元の入口は collection 名の字だけを見る (将来の版の記録を落とさないため)。直す前は、
 * バックアップに書かれた `zz-not-a-collection` の記録が入ると **どの画面にも出ず・点検に映らず・
 * 平文の書き出しの確認にも数えられず・以後のバックアップ全部に乗り続けた** (実測: 2 MB の blob 1 件で
 * 点検は「調べた 0 件に形式の合わないレコードはありません」と言い、次の控えは 2 MB 増えた)。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetRecordStoreForTests, getRecordStore } from '../store';
import { auditRecordShapes, deleteRecords } from '../recordShapeAudit';
import { plaintextBackupConfirmMessage, plaintextExposure } from '../backup';
import { SALES_COLLECTION } from '../sales';

const GOOD = { date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 1, note: '' };
const ORPHAN = 'zz-not-a-collection';

beforeEach(async () => {
  _resetRecordStoreForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

describe('台帳に無い collection の記録 (threat: T-050)', () => {
  it('★ 点検が `unknown` として見つけ、形式不正とは混ぜない (threat: T-050)', async () => {
    const store = getRecordStore();
    await store.insert(SALES_COLLECTION, GOOD);
    const orphan = await store.insert(ORPHAN, { blob: 'x'.repeat(10_000) });
    const r = await auditRecordShapes(store);
    expect(r.malformed).toEqual([]);
    expect(r.unknown).toEqual([{ id: orphan.id, collection: ORPHAN }]);
    expect(r.checked).toBe(1);
  });

  it('対照: exportAll を持たない読み手では unknown は空 (点検だけの代役を壊さない)', async () => {
    const r = await auditRecordShapes({ list: async () => [] });
    expect(r.unknown).toEqual([]);
  });

  it('★ deleteRecords は unknown の id も消す (唯一の出口)', async () => {
    const store = getRecordStore();
    const keep = await store.insert(SALES_COLLECTION, GOOD);
    const orphan = await store.insert(ORPHAN, { blob: 'x' });
    const out = await deleteRecords(store, [orphan.id]);
    expect(out).toEqual({ deleted: 1, skipped: 0 });
    expect((await store.exportAll()).map((x) => x.id)).toEqual([keep.id]);
  });

  it('★ 平文の書き出しの確認は、台帳に無い種類の記録を「持ち出すと困るかもしれない」側に数える', () => {
    const exposure = plaintextExposure([
      { collection: SALES_COLLECTION },
      { collection: ORPHAN },
      { collection: ORPHAN },
    ]);
    expect(exposure.total).toBe(2);
    expect(exposure.parts).toEqual([{ collection: ORPHAN, label: `台帳に無い種類の記録 (${ORPHAN})`, count: 2 }]);
    expect(plaintextBackupConfirmMessage(exposure)).toContain(`台帳に無い種類の記録 (${ORPHAN}) 2 件`);
  });

  it('対照: 台帳に在る自社の数値だけなら今までどおり確認しない', () => {
    expect(plaintextBackupConfirmMessage(plaintextExposure([{ collection: SALES_COLLECTION }]))).toBeNull();
  });
});

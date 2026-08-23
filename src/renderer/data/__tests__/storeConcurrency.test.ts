/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { getRecordStore, _resetRecordStoreForTests } from '../store';

/*
 * **同じ record への書き換えが重なると、片方が黙って消えていた。**
 *
 * `update` は「読む → 復号 → 混ぜる → 暗号化 → 書く」で、暗号化が非同期な
 * ため読みと書きが**別のトランザクション**になる (await を挟むと IndexedDB
 * のトランザクションは勝手に閉じるので、1 つに収められない)。
 *
 * 直す前の実測:
 *
 *   Promise.all([update(id, {a:2}), update(id, {b:3})])  → {base:1, b:3}
 *   Promise.all([update(id, {a:2}), remove(id)])         → 消えたはずが復活
 *
 * **どちらも呼んだ側には成功として返る。** 失われたことに気付く手立てが無い。
 * ここは業務データの保存層で、上に載っている画面 (RealEstatePage /
 * TeamPage / ManualDataSection / ShigyoConsole) はすべてこの `update` を
 * `edit` として使う。
 */

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

describe('同じ record への同時書き換えで、書いたものが消えない', () => {
  it('2 つの update が重なっても両方の patch が残る', async () => {
    const store = getRecordStore();
    const rec = await store.insert('t', { base: 1 });
    await Promise.all([
      store.update(rec.id, { a: 2 } as never),
      store.update(rec.id, { b: 3 } as never),
    ]);
    const after = await store.get(rec.id);
    expect(after?.data, '片方の patch が消えている (lost update)').toEqual({ base: 1, a: 2, b: 3 });
  });

  it('多数の update が重なっても 1 つも落ちない', async () => {
    const store = getRecordStore();
    const rec = await store.insert('t', { base: 0 });
    const N = 12;
    await Promise.all(
      Array.from({ length: N }, (_, i) => store.update(rec.id, { [`k${i}`]: i } as never)),
    );
    const after = await store.get(rec.id);
    const keys = Object.keys(after?.data ?? {}).filter((k) => k.startsWith('k'));
    expect(keys, `${N} 件のうち ${keys.length} 件しか残っていない`).toHaveLength(N);
  });

  it('remove と重なった update が record を復活させない', async () => {
    const store = getRecordStore();
    const rec = await store.insert('t', { base: 1 });
    await Promise.all([store.update(rec.id, { a: 2 } as never), store.remove(rec.id)]);
    expect(await store.get(rec.id), '消したはずの record が復活している').toBeNull();
    expect(await store.list('t'), '一覧にも残っている').toHaveLength(0);
  });

  it('別の record は互いに待たされない (直列化の巻き添えが無い)', async () => {
    const store = getRecordStore();
    const a = await store.insert('t', { n: 1 });
    const b = await store.insert('t', { n: 2 });
    await Promise.all([
      store.update(a.id, { tag: 'a' } as never),
      store.update(b.id, { tag: 'b' } as never),
    ]);
    expect((await store.get(a.id))?.data).toEqual({ n: 1, tag: 'a' });
    expect((await store.get(b.id))?.data).toEqual({ n: 2, tag: 'b' });
  });

  it('失敗した update が、後続の update を巻き込まない', async () => {
    const store = getRecordStore();
    const rec = await store.insert('t', { base: 1 });
    const bad = store.update(rec.id, 'not an object' as never).catch((e: unknown) => e);
    const good = store.update(rec.id, { ok: true } as never);
    await Promise.all([bad, good]);
    expect((await store.get(rec.id))?.data, '後続が巻き添えで落ちている').toEqual({ base: 1, ok: true });
  });

  it('存在しない id の update は null を返す (鎖に載せても変わらない)', async () => {
    const store = getRecordStore();
    expect(await store.update('no-such-id', { a: 1 } as never)).toBeNull();
    expect(await store.update('', { a: 1 } as never)).toBeNull();
  });
});

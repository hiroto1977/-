/**
 * `store.insertIfLatest` —— 最新の 1 件が開いた時の行のままなら 1 件足す (2026-09-28 · パス 500)。
 *
 * 「最新の 1 件を採用する」collection (水耕栽培の設定・しきい値・提出者情報・運転の設定・品目一覧) は、
 * 保存のたびに**全部の欄**を 1 件の新しい行として足す。欄を開いた後に別の保存が入っていれば、
 * 素の `insert` はその保存を黙って古い値で覆う (lost update —— 実測は `useLatestForm.ts` の docblock)。
 *
 * 背骨は 3 つ:
 *  1. **答えの 2 通り** —— 足した / 開いた後に変わっていた。足さなかったときは**何も書かず、何も知らせない**。
 *  2. **比べてから足すまでが 1 つの取引** —— 同じ基準で 2 つ投げたら、足せるのは 1 つだけ。
 *  3. **足した行は必ず新しい最新** —— この端末の時計より新しい `createdAt` の行が最新でも、その後ろに足す。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRecordStore, latestTokenOf } from '../store';
import type { RecordCipher } from '../recordCipher';
import { latestRecord } from '../latestRecord';
import { subscribeCollection, _resetCollectionSubscribersForTests } from '../collectionChange';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';

// 形の検査 (`importAll` の関門) を通る標本にする —— 同点や未来の時刻は `importAll` でしか作れない。
const C = 'highlight-settings';
const A = { declineWarnStreak: 2, declineCriticalStreak: 3, laborShareWarnPct: 60 };
const B = { ...A, laborShareWarnPct: 61 };

let fired = 0;

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  fired = 0;
  subscribeCollection(C, () => {
    fired++;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function latestNow() {
  return latestRecord(await getRecordStore().list(C));
}

describe('insertIfLatest —— 答えの 2 通り', () => {
  it('★ まだ何も無い collection に、何も無いと思って足す → 足した行が最新', async () => {
    const r = await getRecordStore().insertIfLatest(C, null, { ...A });
    expect(r.status).toBe('saved');
    const now = await latestNow();
    expect(r.status === 'saved' && r.record.id).toBe(now?.id);
    expect(now?.data).toEqual(A);
    expect(fired, '足したのに知らせていない').toBe(1);
  });

  it('★ 開いた時の最新のままなら足し、足した行が新しい最新になる', async () => {
    const store = getRecordStore();
    const first = await store.insert(C, { ...A });
    fired = 0;
    const r = await store.insertIfLatest(C, latestTokenOf(first), { ...B });
    expect(r.status).toBe('saved');
    expect((await latestNow())?.data).toEqual(B);
    expect(await store.count(C)).toBe(2);
    expect(fired).toBe(1);
  });

  it('★ 開いた後に別の保存が入っていたら、何も書かずに今の最新を返す (lost update を作らない)', async () => {
    const store = getRecordStore();
    const opened = await store.insert(C, { ...A });
    const other = await store.insert(C, { ...A, singleChannelWarnPct: 55 }); // 別のタブの保存
    fired = 0;
    const r = await store.insertIfLatest(C, latestTokenOf(opened), { ...A, declineCriticalStreak: 5 });
    expect(r.status).toBe('changed');
    expect(r.status === 'changed' && r.current?.id).toBe(other.id);
    expect(r.status === 'changed' && r.current?.data).toEqual({ ...A, singleChannelWarnPct: 55 });
    expect(await store.count(C), '断ったのに足した').toBe(2);
    expect((await latestNow())?.id, '別のタブの保存が最新でなくなった').toBe(other.id);
    expect(fired, '中身が動いていないのに知らせた').toBe(0);
  });

  it('★ 何も無いと思って開いたが、実は保存が在った (読みが届く前に開いた欄) → changed', async () => {
    const store = getRecordStore();
    const saved = await store.insert(C, { ...A });
    const r = await store.insertIfLatest(C, null, { ...B });
    expect(r.status).toBe('changed');
    expect(r.status === 'changed' && r.current?.id).toBe(saved.id);
    expect(await store.count(C)).toBe(1);
  });

  it('開いた時の最新が消えて何も無くなっていたら changed (current は null)', async () => {
    const store = getRecordStore();
    const opened = await store.insert(C, { ...A });
    await store.remove(opened.id);
    const r = await store.insertIfLatest(C, latestTokenOf(opened), { ...B });
    expect(r).toEqual({ status: 'changed', current: null });
    expect(await store.count(C)).toBe(0);
  });

  it('★ 同じ行が書き換えられていたら (id は同じで updatedAt が違う) changed', async () => {
    const store = getRecordStore();
    const opened = await store.insert(C, { ...A });
    await store.update(opened.id, { laborShareWarnPct: 70 });
    const r = await store.insertIfLatest(C, latestTokenOf(opened), { ...B });
    expect(r.status).toBe('changed');
    expect(r.status === 'changed' && r.current?.data.laborShareWarnPct).toBe(70);
  });

  it('★ 別の collection の保存は比較に入らない', async () => {
    const store = getRecordStore();
    const opened = await store.insert(C, { ...A });
    await store.insert('hydroponics-crops', { crops: [] });
    const r = await store.insertIfLatest(C, latestTokenOf(opened), { ...B });
    expect(r.status).toBe('saved');
  });
});

describe('insertIfLatest —— 比べてから足すまでが 1 つの取引', () => {
  it('★ 同じ基準で 2 つ投げたら、足せるのは 1 つだけ (2 つ目は 1 つ目の行を見る)', async () => {
    const store = getRecordStore();
    const opened = await store.insert(C, { ...A });
    const [x, y] = await Promise.all([
      store.insertIfLatest(C, latestTokenOf(opened), { ...A, singleChannelWarnPct: 1 }),
      store.insertIfLatest(C, latestTokenOf(opened), { ...A, singleChannelWarnPct: 2 }),
    ]);
    expect([x.status, y.status]).toEqual(['saved', 'changed']);
    expect(y.status === 'changed' && x.status === 'saved' && y.current?.id).toBe(x.status === 'saved' ? x.record.id : '');
    expect(await store.count(C)).toBe(2);
  });

  it('★ 何も無いと思った 2 つを同時に投げても、足せるのは 1 つだけ', async () => {
    const store = getRecordStore();
    const [x, y] = await Promise.all([
      store.insertIfLatest(C, null, { ...A }),
      store.insertIfLatest(C, null, { ...B }),
    ]);
    expect([x.status, y.status].sort()).toEqual(['changed', 'saved']);
    expect(await store.count(C)).toBe(1);
  });
});

describe('insertIfLatest —— 最新の選び方は latestRecord と同じ', () => {
  it('★ createdAt が同じ 2 行なら、一覧で先の行が最新 (latestRecord(list) と同じ行を比べる)', async () => {
    const store = getRecordStore();
    const t = 1_700_000_000_000;
    await store.importAll([
      { id: 'b-row', collection: C, createdAt: t, updatedAt: t, data: { ...A } },
      { id: 'a-row', collection: C, createdAt: t, updatedAt: t, data: { ...B } },
    ]);
    const chosen = await latestNow();
    const other = chosen?.id === 'a-row' ? 'b-row' : 'a-row';
    const refused = await store.insertIfLatest(C, { id: other, updatedAt: t }, { ...A });
    expect(refused.status, '一覧で後ろの行を最新として扱った').toBe('changed');
    const saved = await store.insertIfLatest(C, latestTokenOf(chosen), { ...A });
    expect(saved.status).toBe('saved');
  });
});

describe('insertIfLatest —— 足した行は必ず新しい最新', () => {
  it('★ 最新の createdAt がこの端末の今と同じでも、その後ろに足す', async () => {
    const store = getRecordStore();
    const at = 4_000_000_000_000; // この端末の時計より先 —— 足す時刻 (monotonicNow) はちょうどこの値になる
    vi.spyOn(Date, 'now').mockReturnValue(at);
    // 同点になったとき一覧で先に来る id (新しい行の uuid より前に並ぶ) —— 「後ろに足す」が効いていないと、
    // 足した行は同点のまま後ろに並び、最新にならない。
    const first = '00000000-0000-4000-8000-000000000000';
    await store.importAll([{ id: first, collection: C, createdAt: at, updatedAt: at, data: { ...A } }]);
    const opened = await latestNow();
    const r = await store.insertIfLatest(C, latestTokenOf(opened), { ...B });
    expect(r.status === 'saved' && r.record.createdAt).toBeGreaterThan(at);
    expect((await latestNow())?.data, '足した行が同点のまま後ろに並び、最新にならなかった').toEqual(B);
  });

  it('★ この端末の時計より新しい createdAt の行が最新でも、その後ろに足す (保存が黙って効かない形を作らない)', async () => {
    const store = getRecordStore();
    // 時計の進んだ端末の控えを復元した。この端末の時計 (`monotonicNow` —— 同じファイルの前の検査が
    // 4e12 まで進めうる) より十分先に置く —— 近いと「後ろに足す」を通らずに通ってしまう。
    const future = 8_000_000_000_000;
    await store.importAll([{ id: 'from-other-device', collection: C, createdAt: future, updatedAt: future, data: { ...A } }]);
    const opened = await latestNow();
    const r = await store.insertIfLatest(C, latestTokenOf(opened), { ...B });
    expect(r.status).toBe('saved');
    expect(r.status === 'saved' && r.record.createdAt).toBeGreaterThan(future);
    expect((await latestNow())?.data, '足した行が最新にならず、画面は前の値のまま').toEqual(B);
  });
});

describe('insertIfLatest —— 封緘と関門', () => {
  const WRAP: RecordCipher = {
    encrypt: async (d) => ({ wrapped: JSON.stringify(d) }),
    decrypt: async (d) => JSON.parse((d as { wrapped: string }).wrapped) as Record<string, unknown>,
  };

  it('★ 封緘した collection でも、足した行と changed の current は平文で返す', async () => {
    const store = getRecordStore();
    store.configureCipher(WRAP);
    const opened = await store.insert(C, { ...A });
    const saved = await store.insertIfLatest(C, latestTokenOf(opened), { ...B });
    expect(saved.status === 'saved' && saved.record.data).toEqual(B);
    const stale = await store.insertIfLatest(C, latestTokenOf(opened), { ...A });
    expect(stale.status === 'changed' && stale.current?.data).toEqual(B);
    // 保管層には包んだ物が入る (平文で書いていない)。
    const raw = (await store.exportAll()).find((r) => saved.status === 'saved' && r.id === saved.record.id);
    expect(raw?.data).toEqual({ wrapped: JSON.stringify(B) });
  });

  it('collection が不正なら投げる (insert と同じ関門)', async () => {
    await expect(getRecordStore().insertIfLatest('Bad Name', null, { ...A })).rejects.toThrow(new Error('collection が不正です'));
  });

  it('data が素のオブジェクトでなければ投げる (insert と同じ関門)', async () => {
    await expect(getRecordStore().insertIfLatest(C, null, [] as never)).rejects.toThrow(
      new Error('data はプレーンなオブジェクトである必要があります'),
    );
    expect(await getRecordStore().count(C)).toBe(0);
  });
});

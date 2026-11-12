/**
 * `store.replaceLatestIfUnchanged` —— 最新の 1 件が開いた時の行のその版なら、その行の中身を置き換える
 * (2026-09-28 · パス 500)。
 *
 * 最新 1 件を**書き換える**記録 (数値パラメータの上書き) のための口。`insertIfLatest` と同じ目印 (id と
 * updatedAt) で比べ、行は増やさない。直す前の書き換え (`updateIfUnchanged`) は**その行**の中身しか比べず、
 * 読んだ後・書く前に別の行が新しい最新として入ると、古い行へ書いて「済んだ」と答えた —— 実測は
 * `store.ts` の docblock と `parameterOverrides.test.ts` の ★。
 *
 * 背骨は 3 つ:
 *  1. **答えの 2 通り** —— 置き換えた / 開いた後に変わっていた (新しい行・同じ行の新しい版・消えた)。
 *     置き換えなかったときは**何も書かず、何も知らせない**。
 *  2. **比べてから書くまでが 1 つの取引** —— 同じ目印で 2 つ投げたら、書けるのは 1 つだけ。
 *  3. **版は必ず進む** —— この端末の時計より新しい `updatedAt` の行でも、その後ろの時刻にする
 *     (進まないと、次の比較が「同じ版」と取り違える)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { getRecordStore, latestTokenOf } from '../store';
import type { RecordCipher } from '../recordCipher';
import { latestRecord } from '../latestRecord';
import { subscribeCollection, _resetCollectionSubscribersForTests } from '../collectionChange';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';

// 形の検査 (`importAll` の関門) を通る標本 —— 同点や未来の時刻は `importAll` でしか作れない。
const C = 'highlight-settings';
const A = { declineWarnStreak: 2, declineCriticalStreak: 3, laborShareWarnPct: 60 };
const B = { ...A, laborShareWarnPct: 61 };
const D = { ...A, laborShareWarnPct: 62 };

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

async function rows() {
  return getRecordStore().list(C);
}

/**
 * **この attempt の時計の状態から**、次の `monotonicNow()` がちょうど返す値を組む。
 *
 * 固定の値 (9e12 など) を置くと、CI の `retry: 2` (vitest.config.ts) の 2 回目は 1 回目が進めた
 * 時計 (`_lastTs`) の後ろから始まり、期待した同点にならないまま通ってしまう —— 同点の判定を `>` へ
 * 倒した変異体を retry が癒やし、変異検査が「生存」と報せる (GitHub の全掃引で実測)。
 * 時計を 0 に固定して探りの行を 1 件足すと、その行の `createdAt` が今の `_lastTs + 1` になる。
 * そこから十分先を `at` にして時計を固定すれば、以後の `monotonicNow()` はちょうど `at` を返す
 * (`max(_lastTs + 1, at)` = `at`)。attempt ごとに組み直すので、何度目でも同じ同点になる。
 */
async function clockAt(): Promise<{ at: number; clock: MockInstance<() => number> }> {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(0);
  const probe = await getRecordStore().insert('clock-probe', {});
  const at = probe.createdAt + 1_000_000;
  clock.mockReturnValue(at);
  return { at, clock };
}

describe('replaceLatestIfUnchanged —— 答えの 2 通り', () => {
  it('★ 開いた時の最新のままなら、その行の中身を置き換える (行は増えない・id と createdAt は保つ・版は進む)', async () => {
    const store = getRecordStore();
    const opened = await store.insert(C, { ...A });
    fired = 0;
    const r = await store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...B });
    expect(r.status).toBe('saved');
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(opened.id);
    expect(all[0]!.createdAt).toBe(opened.createdAt);
    expect(all[0]!.updatedAt).toBeGreaterThan(opened.updatedAt);
    expect(all[0]!.data).toEqual(B);
    expect(r.status === 'saved' && r.record.updatedAt).toBe(all[0]!.updatedAt);
    expect(fired, '置き換えたのに知らせていない').toBe(1);
  });

  it('★ 読んだ後に別の行が新しい最新として入っていたら、何も書かずに今の最新を返す (古い行へ書かない)', async () => {
    const store = getRecordStore();
    const opened = await store.insert(C, { ...A });
    const newer = await store.insertIfLatest(C, latestTokenOf(opened), { ...B });
    expect(newer.status).toBe('saved');
    fired = 0;
    const r = await store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...D });
    expect(r.status).toBe('changed');
    expect(r.status === 'changed' && r.current?.id).toBe(newer.status === 'saved' ? newer.record.id : '');
    // 古い行も新しい行も書き換わっていない。
    const byId = new Map((await rows()).map((x) => [x.id, x.data]));
    expect(byId.get(opened.id)).toEqual(A);
    expect(newer.status === 'saved' && byId.get(newer.record.id)).toEqual(B);
    expect(fired, '書かなかったのに知らせた').toBe(0);
  });

  it('★ 同じ行が書き換えられていたら (id は同じで updatedAt が違う) changed', async () => {
    const store = getRecordStore();
    const opened = await store.insert(C, { ...A });
    await store.update(opened.id, { laborShareWarnPct: 70 });
    const r = await store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...D });
    expect(r.status).toBe('changed');
    expect(r.status === 'changed' && r.current?.data).toEqual({ ...A, laborShareWarnPct: 70 });
    expect((await rows())[0]!.data, '書き換えた版を読んだ時の中身で覆った').toEqual({ ...A, laborShareWarnPct: 70 });
  });

  it('開いた時の最新が消えて何も無くなっていたら changed (current は null) —— 行を作り直さない', async () => {
    const store = getRecordStore();
    const opened = await store.insert(C, { ...A });
    await store.remove(opened.id);
    const r = await store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...B });
    expect(r).toEqual({ status: 'changed', current: null });
    expect(await store.count(C)).toBe(0);
  });

  it('開いた時の最新が消え、古い行が残っていたら changed (current は残った最新) —— 古い行へ書かない', async () => {
    const store = getRecordStore();
    const older = await store.insert(C, { ...A });
    const opened = await store.insert(C, { ...B });
    await store.remove(opened.id);
    const r = await store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...D });
    expect(r.status === 'changed' && r.current?.id).toBe(older.id);
    expect((await rows())[0]!.data).toEqual(A);
  });

  it('★ 別の collection の行は比較に入らない', async () => {
    const store = getRecordStore();
    const opened = await store.insert(C, { ...A });
    await store.insert('bank-submission-settings', { profile: {}, format: {} });
    const r = await store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...B });
    expect(r.status).toBe('saved');
  });
});

describe('replaceLatestIfUnchanged —— 比べてから書くまでが 1 つの取引', () => {
  it('★ 同じ目印で 2 つ投げたら、書けるのは 1 つだけ (2 つ目は 1 つ目の版を見る)', async () => {
    const store = getRecordStore();
    const opened = await store.insert(C, { ...A });
    const [x, y] = await Promise.all([
      store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...B }),
      store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...D }),
    ]);
    expect([x.status, y.status]).toEqual(['saved', 'changed']);
    expect(y.status === 'changed' && y.current?.data).toEqual(B);
    expect((await rows()).map((r) => r.data)).toEqual([B]);
  });

  it('★ 置き換えと足すを同じ目印で同時に投げても、通るのは 1 つだけ', async () => {
    const store = getRecordStore();
    const opened = await store.insert(C, { ...A });
    const [x, y] = await Promise.all([
      store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...B }),
      store.insertIfLatest(C, latestTokenOf(opened), { ...D }),
    ]);
    expect([x.status, y.status].sort()).toEqual(['changed', 'saved']);
  });
});

describe('replaceLatestIfUnchanged —— 最新の選び方は latestRecord と同じ・版は必ず進む', () => {
  it('★ createdAt が同じ 2 行なら、一覧で先の行が最新 (latestRecord(list) と同じ行を比べる)', async () => {
    const store = getRecordStore();
    const t = 1_700_000_000_000;
    await store.importAll([
      { id: 'b-row', collection: C, createdAt: t, updatedAt: t, data: { ...A } },
      { id: 'a-row', collection: C, createdAt: t, updatedAt: t, data: { ...B } },
    ]);
    const chosen = latestRecord(await rows());
    const other = chosen?.id === 'a-row' ? 'b-row' : 'a-row';
    const refused = await store.replaceLatestIfUnchanged(C, { id: other, updatedAt: t }, { ...D });
    expect(refused.status, '一覧で後ろの行を最新として扱った').toBe('changed');
    const saved = await store.replaceLatestIfUnchanged(C, latestTokenOf(chosen)!, { ...D });
    expect(saved.status).toBe('saved');
  });

  it('★ この端末の時計より新しい updatedAt の行でも、版はその後ろへ進む (次の比較が同じ版と取り違えない)', async () => {
    const store = getRecordStore();
    const future = 8_000_000_000_000;
    await store.importAll([{ id: 'from-other-device', collection: C, createdAt: future, updatedAt: future, data: { ...A } }]);
    const opened = latestRecord(await rows());
    const r = await store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...B });
    expect(r.status === 'saved' && r.record.updatedAt).toBeGreaterThan(future);
    // 置き換える前の目印ではもう書けない (版が進んだ)。
    const stale = await store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...D });
    expect(stale.status).toBe('changed');
  });

  /*
   * 索引は同じ collection の中を **id の順**に返す (最新の順ではない)。先に並ぶ行が古いとき、並びの
   * 先頭を最新と取り違えると、最新 (新しい行) を開いた書き換えは断られ、古い行を開いた書き換えが
   * 古い行へ通る —— パス 500 が直した「古い行に書いて済んだと言う」そのもの。id を選んで並びを固定する
   * (uuid だと並びが偶然で決まり、変異検査で「最新を選ぶ比較を消す」が生き残っていた)。
   */
  it('★ 索引 (id の順) で先に並ぶ行が古くても、createdAt の新しい行を最新として比べる', async () => {
    const store = getRecordStore();
    const t = 1_700_000_000_000;
    await store.importAll([
      { id: 'a-older', collection: C, createdAt: t, updatedAt: t, data: { ...A } },
      { id: 'b-newer', collection: C, createdAt: t + 10, updatedAt: t + 10, data: { ...B } },
    ]);
    const refused = await store.replaceLatestIfUnchanged(C, { id: 'a-older', updatedAt: t }, { ...D });
    expect(refused.status, '索引で先に並ぶ古い行を最新として扱い、古い行へ書いた').toBe('changed');
    expect(refused.status === 'changed' && refused.current?.id).toBe('b-newer');
    const saved = await store.replaceLatestIfUnchanged(C, { id: 'b-newer', updatedAt: t + 10 }, { ...D });
    expect(saved.status, '最新 (新しい行) を開いた書き換えを断った').toBe('saved');
    const byId = new Map((await rows()).map((x) => [x.id, x.data]));
    expect(byId.get('a-older')).toEqual(A);
    expect(byId.get('b-newer')).toEqual(D);
  });

  /*
   * 版の時刻がこの端末の今と**ちょうど同じ**でも進める。「今のほうが新しいときだけ今にする」
   * (`>`) だと、ちょうど同じときに版が進まず、置き換える前の目印がそのまま通る (変異検査の生存 ——
   * 未来の時刻の行だけを見る検査では、`>` と `>=` の差が出なかった)。
   */
  it('★ 最新の updatedAt がこの端末の今とちょうど同じでも、版はその後ろへ進む', async () => {
    const store = getRecordStore();
    // この端末の時計より先 —— 置き換える時刻 (monotonicNow) はちょうどこの値になる (attempt ごとに組む)。
    const { at } = await clockAt();
    await store.importAll([{ id: 'same-clock', collection: C, createdAt: at, updatedAt: at, data: { ...A } }]);
    const opened = latestRecord(await rows());
    const r = await store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...B });
    // ちょうど 1 ms 後 (同点の判定を `>` へ倒すと版は `at` のまま進まない)
    expect(r.status === 'saved' && r.record.updatedAt, '版が進まず、置き換える前の目印と同じ版のまま').toBe(at + 1);
    const stale = await store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...D });
    expect(stale.status, '置き換える前の目印で、置き換えた行をもう 1 度書き換えられた').toBe('changed');
    expect((await rows())[0]!.data).toEqual(B);
  });

  /*
   * 追い越す規則は**時計が遅れているときだけ**効く。時計が先の版より進んでいれば、置き換えた版の時刻は
   * 置き換えた時刻 —— `update` / `updateIfUnchanged` と同じ意味の `updatedAt` (バックアップにも載る)。
   * 常に「先の版の 1 ms 後」にすると、3 日前の保存の直後に書き換えたことになる (変異検査の生存 ——
   * 「版が進んだか」だけを見る検査では見えなかった)。
   */
  it('★ 時計が先の版より進んでいれば、置き換えた版の時刻は置き換えた時刻 (先の版の 1 ms 後ではない)', async () => {
    const store = getRecordStore();
    // この端末の時計 (前の検査が 9e12 まで進めうる) より先に置く。
    const t0 = 9_100_000_000_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(t0);
    const opened = await store.insert(C, { ...A });
    expect(opened.updatedAt).toBe(t0);
    clock.mockReturnValue(t0 + 60_000);
    const r = await store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...B });
    expect(r.status === 'saved' && r.record.updatedAt, '置き換えた版の時刻が、先の版の 1 ms 後になった').toBe(t0 + 60_000);
    expect(r.status === 'saved' && r.record.createdAt, '作った時刻まで動かした').toBe(t0);
  });
});

describe('replaceLatestIfUnchanged —— 封緘と関門', () => {
  const WRAP: RecordCipher = {
    encrypt: async (d) => ({ wrapped: JSON.stringify(d) }),
    decrypt: async (d) => JSON.parse((d as { wrapped: string }).wrapped) as Record<string, unknown>,
  };

  it('★ 封緘した collection でも、置き換えた行と changed の current は平文で返し、保管層には包んだ物が入る', async () => {
    const store = getRecordStore();
    store.configureCipher(WRAP);
    const opened = await store.insert(C, { ...A });
    const saved = await store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...B });
    expect(saved.status === 'saved' && saved.record.data).toEqual(B);
    const stale = await store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, { ...A });
    expect(stale.status === 'changed' && stale.current?.data).toEqual(B);
    const raw = (await store.exportAll()).find((r) => r.id === opened.id);
    expect(raw?.data).toEqual({ wrapped: JSON.stringify(B) });
  });

  it('collection が不正なら投げる (insert と同じ関門)', async () => {
    await expect(getRecordStore().replaceLatestIfUnchanged('Bad Name', { id: 'x', updatedAt: 1 }, { ...A })).rejects.toThrow(
      new Error('collection が不正です'),
    );
  });

  it('data が素のオブジェクトでなければ投げ、何も書かない (insert と同じ関門)', async () => {
    const store = getRecordStore();
    const opened = await store.insert(C, { ...A });
    await expect(store.replaceLatestIfUnchanged(C, latestTokenOf(opened)!, [] as never)).rejects.toThrow(
      new Error('data はプレーンなオブジェクトである必要があります'),
    );
    expect((await rows()).map((r) => r.data)).toEqual([A]);
  });
});

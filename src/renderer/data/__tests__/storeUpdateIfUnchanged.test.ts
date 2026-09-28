/**
 * `store.updateIfUnchanged` —— 欄を開いた時の中身のままなら書く (2026-09-27 · パス 499)。
 *
 * 直す前、実体を丸ごと編集する 3 画面 (投資信託・不動産・士業の連絡先) は `update` で
 * **全部の欄**を書いていた。欄を開いた後に別のタブが直した欄も、開いた時の値へ黙って戻る
 * (実測は `useCollection.ts` の `editIfUnchanged` の docblock)。
 *
 * この検査の背骨は 2 つ:
 *  1. **答えの 3 通り** —— 書いた / 相手が無い / 書き換えられていた。書かなかった 2 つは
 *     **何も書かず、何も知らせない** (中身が動いていないので、読み直させる理由が無い)。
 *  2. **比べてから書くまでが 1 つの鎖の中** —— 画面の側で `get` → `update` と 2 手に分けると、
 *     その間に別の書き込みが挟まる。同じ基準で 2 つ投げたら、書けるのは 1 つだけ。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getRecordStore } from '../store';
import type { RecordCipher } from '../recordCipher';
import { subscribeCollection, _resetCollectionSubscribersForTests } from '../collectionChange';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';

/** 形は保管層の 1 行 (`as const` にしない —— 欄を書き換える検査なので、欄の型は広いままにする)。 */
const HOLDING: { name: string; units: number; nav: number; valuation: number } = {
  name: 'eMAXIS Slim 全世界株式',
  units: 100,
  nav: 3000,
  valuation: 300000,
};

let fired = 0;

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  fired = 0;
  subscribeCollection('mutualfund-holdings', () => {
    fired++;
  });
});

describe('updateIfUnchanged —— 答えの 3 通り', () => {
  it('★ 欄を開いた時の中身のままなら書き、書いた行を返す', async () => {
    const store = getRecordStore();
    const rec = await store.insert('mutualfund-holdings', { ...HOLDING });
    fired = 0;
    const result = await store.updateIfUnchanged(rec.id, rec.data, { name: '改名した銘柄' });
    expect(result.status).toBe('saved');
    expect(result.status === 'saved' && result.record.data).toEqual({ ...HOLDING, name: '改名した銘柄' });
    expect((await store.get(rec.id))?.data).toEqual({ ...HOLDING, name: '改名した銘柄' });
    expect(fired, '書いたのに知らせていない').toBe(1);
  });

  it('★ 欄を開いた後に書き換えられていたら、何も書かずに今の行を返す (lost update を作らない)', async () => {
    const store = getRecordStore();
    const rec = await store.insert('mutualfund-holdings', { ...HOLDING });
    const base = rec.data; // 欄を開いた時の中身
    // 別のタブが評価額を直した (実測した欠陥の形: 300,000 → 500,000)。
    await store.update(rec.id, { valuation: 500000 });
    const before = await store.get(rec.id);
    fired = 0;
    // このタブは古い欄から組んだ全部の欄 (評価額 300,000 を含む) を書こうとする。
    const result = await store.updateIfUnchanged(rec.id, base, { ...HOLDING, name: '名前だけ直した' });
    expect(result.status).toBe('changed');
    expect(result.status === 'changed' && result.current.data).toEqual({ ...HOLDING, valuation: 500000 });
    const after = await store.get(rec.id);
    expect(after?.data.valuation, '別のタブの 500,000 が古い欄の 300,000 に戻された').toBe(500000);
    expect(after?.updatedAt, '書いていないのに更新時刻が動いた').toBe(before?.updatedAt);
    expect(fired, '中身が動いていないのに知らせた').toBe(0);
  });

  it('★ 相手の行が無ければ、何も書かずに vanished (消された行を作り直さない)', async () => {
    const store = getRecordStore();
    const rec = await store.insert('mutualfund-holdings', { ...HOLDING });
    await store.remove(rec.id);
    fired = 0;
    const result = await store.updateIfUnchanged(rec.id, rec.data, { name: 'x' });
    expect(result).toEqual({ status: 'vanished' });
    expect(await store.get(rec.id)).toBeNull();
    expect(await store.list('mutualfund-holdings')).toHaveLength(0);
    expect(fired).toBe(0);
  });

  it('空の id は vanished (投げない)', async () => {
    expect(await getRecordStore().updateIfUnchanged('', { a: 1 }, { a: 2 })).toEqual({ status: 'vanished' });
  });

  it('patch が素のオブジェクトでなければ投げる (update と同じ関門)', async () => {
    const store = getRecordStore();
    const rec = await store.insert('mutualfund-holdings', { ...HOLDING });
    await expect(store.updateIfUnchanged(rec.id, rec.data, [] as never)).rejects.toThrow(
      new Error('patch はプレーンなオブジェクトである必要があります'),
    );
    expect((await store.get(rec.id))?.data).toEqual(HOLDING);
  });

  it('基準が素のオブジェクトでなければ changed へ倒れる (書かない)', async () => {
    const store = getRecordStore();
    const rec = await store.insert('mutualfund-holdings', { ...HOLDING });
    const result = await store.updateIfUnchanged(rec.id, undefined as unknown as typeof HOLDING, { name: 'x' });
    expect(result.status).toBe('changed');
    expect((await store.get(rec.id))?.data).toEqual(HOLDING);
  });
});

describe('updateIfUnchanged —— 比べてから書くまでが 1 つの鎖の中', () => {
  it('★ 同じ基準で 2 つ投げたら、書けるのは 1 つだけ (2 つ目は 1 つ目の書き込みを見る)', async () => {
    const store = getRecordStore();
    const rec = await store.insert('mutualfund-holdings', { ...HOLDING });
    const [a, b] = await Promise.all([
      store.updateIfUnchanged(rec.id, rec.data, { name: 'A が直した' }),
      store.updateIfUnchanged(rec.id, rec.data, { name: 'B が直した' }),
    ]);
    expect([a.status, b.status]).toEqual(['saved', 'changed']);
    expect(b.status === 'changed' && b.current.data.name).toBe('A が直した');
    expect((await store.get(rec.id))?.data.name).toBe('A が直した');
  });

  it('★ 先に投げた update は、後から投げた updateIfUnchanged の比較に入る', async () => {
    const store = getRecordStore();
    const rec = await store.insert('mutualfund-holdings', { ...HOLDING });
    const [, second] = await Promise.all([
      store.update(rec.id, { valuation: 500000 }),
      store.updateIfUnchanged(rec.id, rec.data, { ...HOLDING }),
    ]);
    expect(second.status).toBe('changed');
    expect((await store.get(rec.id))?.data.valuation).toBe(500000);
  });

  it('先に投げた remove の後なら vanished', async () => {
    const store = getRecordStore();
    const rec = await store.insert('mutualfund-holdings', { ...HOLDING });
    const [, second] = await Promise.all([
      store.remove(rec.id),
      store.updateIfUnchanged(rec.id, rec.data, { name: 'x' }),
    ]);
    expect(second).toEqual({ status: 'vanished' });
    expect(await store.get(rec.id)).toBeNull();
  });

  it('★ changed を受けて基準を今の行へ移せば、次は書ける (知ったうえで上書きする道)', async () => {
    const store = getRecordStore();
    const rec = await store.insert('mutualfund-holdings', { ...HOLDING });
    await store.update(rec.id, { valuation: 500000 });
    const first = await store.updateIfUnchanged(rec.id, rec.data, { ...HOLDING, name: '直した' });
    expect(first.status).toBe('changed');
    if (first.status !== 'changed') return;
    const second = await store.updateIfUnchanged(rec.id, first.current.data, { ...HOLDING, name: '直した' });
    expect(second.status).toBe('saved');
    expect((await store.get(rec.id))?.data).toEqual({ ...HOLDING, name: '直した' });
  });
});

describe('updateIfUnchanged —— 封緘した記録は平文で比べる', () => {
  /** 保管層には包んだ物が入り、読むと平文に戻る —— 本物の暗号化の代わり。 */
  const WRAP: RecordCipher = {
    encrypt: async (d) => ({ wrapped: JSON.stringify(d) }),
    decrypt: async (d) => JSON.parse((d as { wrapped: string }).wrapped) as Record<string, unknown>,
  };

  it('★ 欄を開いた時の平文と比べて書く (包んだ物と比べると永久に changed になる)', async () => {
    const store = getRecordStore();
    store.configureCipher(WRAP);
    const rec = await store.insert('mutualfund-holdings', { ...HOLDING });
    const result = await store.updateIfUnchanged(rec.id, rec.data, { name: '直した' });
    expect(result.status).toBe('saved');
    expect((await store.get(rec.id))?.data).toEqual({ ...HOLDING, name: '直した' });
  });
});

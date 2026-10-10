/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { getRecordStore, _resetRecordStoreForTests } from '../store';
import type { RecordCipher } from '../recordCipher';

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

  /*
   * **鎖の掃除が、鎖そのものを切ってはいけない。**
   *
   * `serialize` は最後尾を `perId` に覚え、決着したら「自分がまだ最後尾なら」
   * 外す (地図を無制限に育てないため)。この **「まだ最後尾なら」** の判定が
   * 測られていなかった (実測 2026-08-31: 3 変異体が生存)。
   *
   * 上の `Promise.all` 群では捕まらない —— 12 件を一度に投げると全部が
   * 先に繋がってしまうので、途中で地図を消しても順番は変わらない。
   * **決着した後に新しい操作が来る**形にして初めて差が出る:
   *
   *   A 決着 → (無条件に消すと) B の記録まで消える
   *          → 直後の C は「誰も走っていない」と判断して B と同時に走る
   *          → B と C が同じ値を読み、片方の patch が消える
   */
  it('★ 決着した操作の掃除が、後続の鎖を切らない', async () => {
    const store = getRecordStore();
    const rec = await store.insert('t', { base: 0 });
    // 各操作を遅くして、A が決着しても B がまだ走っている状態を作る。
    store.configureCipher({
      encrypt: async (d) => {
        await new Promise((r) => setTimeout(r, 15));
        return { ...d };
      },
      decrypt: async (d) => {
        await new Promise((r) => setTimeout(r, 15));
        return { ...d };
      },
    });

    const a = store.update(rec.id, { a: 1 } as never);
    const b = store.update(rec.id, { b: 2 } as never);
    await a; // ここで掃除が走る
    const c = store.update(rec.id, { c: 3 } as never);
    await Promise.all([b, c]);

    const after = await store.get(rec.id);
    expect(after?.data, '掃除が鎖を切って patch が消えた (lost update)').toEqual({
      base: 0,
      a: 1,
      b: 2,
      c: 3,
    });
  });

  it('存在しない id の update は null を返す (鎖に載せても変わらない)', async () => {
    const store = getRecordStore();
    expect(await store.update('no-such-id', { a: 1 } as never)).toBeNull();
    expect(await store.update('', { a: 1 } as never)).toBeNull();
  });

  /*
   * **移行 (`reencryptAll`) は写しを書き戻す。** 一覧を 1 回読んでから
   * 1 件ずつ書き直すので、隙が「移行の全体」になる。直す前の実測
   * (20 件を遅い cipher で移行しながら 19 番目を触る):
   *
   *   移行中の update → `edited: true` が消える (update は成功を返す)
   *   移行中の remove → 消したはずの record が写しから復活する
   */
  describe('移行の途中に入った書き換えを、写しで踏み潰さない', () => {
    /** 各操作に間を入れて、移行の途中に他の書き込みが差し込めるようにする。 */
    const slowCipher = (): RecordCipher => ({
      encrypt: async (d) => {
        await new Promise((r) => setTimeout(r, 5));
        return { ...d };
      },
      decrypt: async (d) => {
        await new Promise((r) => setTimeout(r, 5));
        return { ...d };
      },
    });

    /** 移行がまだ届いていない後ろの方の id を触る。 */
    async function seed(n: number): Promise<{ store: ReturnType<typeof getRecordStore>; ids: string[] }> {
      const store = getRecordStore();
      const ids: string[] = [];
      for (let i = 0; i < n; i++) ids.push((await store.insert('t', { n: i })).id);
      store.configureCipher(slowCipher());
      return { store, ids };
    }

    it('移行中の update が写しに踏み潰されない', async () => {
      const { store, ids } = await seed(20);
      const migrating = store.reencryptAll();
      await new Promise((r) => setTimeout(r, 1));
      await store.update(ids[19]!, { edited: true } as never);
      await migrating;
      expect((await store.get(ids[19]!))?.data, '移行が古い写しで上書きした').toEqual({
        n: 19,
        edited: true,
      });
    });

    it('移行中に消した record が復活しない', async () => {
      const { store, ids } = await seed(20);
      const migrating = store.reencryptAll();
      await new Promise((r) => setTimeout(r, 1));
      await store.remove(ids[18]!);
      await migrating;
      expect(await store.get(ids[18]!), '移行が写しから書き戻した').toBeNull();
    });

    it('触られなかった record は普通に移行される (数え落としが無い)', async () => {
      const { store, ids } = await seed(8);
      const migrated = await store.reencryptAll();
      expect(migrated, '移行件数が合わない').toBe(8);
      for (let i = 0; i < ids.length; i++) {
        expect((await store.get(ids[i]!))?.data).toEqual({ n: i });
      }
    });

    it('消された分は移行件数から外れる', async () => {
      const { store, ids } = await seed(6);
      await store.remove(ids[0]!);
      expect(await store.reencryptAll(), '消えた分を数えている').toBe(5);
    });
  });

  /*
   * **全件を入れ替える操作は id ごとの鎖に載らない。**
   *
   * `importAll({ replace: true })` (バックアップの復元) は 1 つの
   * トランザクションで全消し + 書き直しをする。それ自体は原子的だが、
   * 進行中の `update` が「読んだ後・書く前」で挟まると、復元で消えた
   * はずの record を書き戻す。直す前の実測: 復元後の一覧に、復元
   * ファイルに無い古い record が残った。
   */
  describe('復元 (importAll replace) を、進行中の書き換えが巻き戻さない', () => {
    const slowCipher = (): RecordCipher => ({
      encrypt: async (d) => {
        await new Promise((r) => setTimeout(r, 8));
        return { ...d };
      },
      decrypt: async (d) => {
        await new Promise((r) => setTimeout(r, 8));
        return { ...d };
      },
    });

    it('復元中に走っていた update が、消えた record を書き戻さない', async () => {
      const store = getRecordStore();
      const old = await store.insert('t', { n: 1 });
      store.configureCipher(slowCipher());
      const updating = store.update(old.id, { edited: true } as never);
      await new Promise((r) => setTimeout(r, 2));
      await store.importAll(
        [{ id: 'fresh', collection: 't', createdAt: 1, updatedAt: 1, data: { restored: true } }],
        { replace: true },
      );
      expect(await updating, '消えた id への update は null を返す').toBeNull();
      const ids = (await store.exportAll()).map((r) => r.id);
      expect(ids, '復元ファイルに無い record が残っている').toEqual(['fresh']);
    });

    it('復元と無関係な update は普通に通る (締めすぎていない)', async () => {
      const store = getRecordStore();
      const rec = await store.insert('t', { n: 1 });
      expect((await store.update(rec.id, { edited: true } as never))?.data).toEqual({
        n: 1,
        edited: true,
      });
    });

    it('clearCollection は消した件数を正しく返す', async () => {
      const store = getRecordStore();
      for (let i = 0; i < 3; i++) await store.insert('c', { i });
      expect(await store.clearCollection('c')).toBe(3);
      expect(await store.list('c')).toHaveLength(0);
    });
  });
});

/*
 * **鎖はこの JS 文脈の中だけの物だった。**
 *
 * 上の実測は 1 つの文脈での話で、`perId` はメモリの Map なので、
 * **タブを 2 枚開けば同じ失敗がそのまま戻る** (別タブは別の鎖を持つ)。
 * ブラウザ版は 1 枚の HTML を開くだけなので、2 枚目は普通に開かれる。
 *
 * そこで Web Locks (`navigator.locks`) があればオリジン単位の錠で囲む。
 * 実際のタブ 2 枚の挙動は**ここでは試せない** (jsdom に錠も窓も無い) ので、
 * 確かめるのは (1) 錠があれば書き換えごとに正しい名前で取る、
 * (2) 錠の中で操作が失敗しても**再実行しない** (2 回書かない)、
 * (3) 錠が取れない環境では今までどおり鎖だけで進む、の 3 点。
 *
 * (2) が要点である。`locks.request(name, cb)` は cb の失敗もそのまま
 * reject するので、素朴に catch して呼び直すと**錠の中で 1 回書いた後に
 * もう 1 回走る**。取り違えると、データ損失を直す変更がデータ破損を作る。
 */
describe('タブをまたぐ直列化 (Web Locks)', () => {
  type Req = { name: string };
  const withLocks = async (
    impl: (name: string, cb: () => Promise<unknown>) => Promise<unknown>,
    body: (calls: Req[]) => Promise<void>,
  ): Promise<void> => {
    const calls: Req[] = [];
    const nav = globalThis.navigator as unknown as { locks?: unknown };
    const had = Object.prototype.hasOwnProperty.call(nav, 'locks');
    const prev = nav.locks;
    Object.defineProperty(nav, 'locks', {
      configurable: true,
      value: {
        request: (name: string, cb: () => Promise<unknown>) => {
          calls.push({ name });
          return impl(name, cb);
        },
      },
    });
    try {
      await body(calls);
    } finally {
      if (had) Object.defineProperty(nav, 'locks', { configurable: true, value: prev });
      else delete (nav as { locks?: unknown }).locks;
    }
  };

  it('★ 錠があれば、書き換えは record の id を名前にした錠の中で走る', async () => {
    await withLocks(
      (_name, cb) => cb(),
      async (calls) => {
        const store = getRecordStore();
        const rec = await store.insert('sales-entries', { base: 1 });
        await store.update(rec.id, { a: 2 });
        await store.remove(rec.id);
        // insert は id が決まる前なので鎖に載らない。update / remove の 2 回。
        expect(calls.map((c) => c.name)).toEqual([
          `servicehub.record.${rec.id}`,
          `servicehub.record.${rec.id}`,
        ]);
      },
    );
  });

  it('★ 錠の中で操作が失敗しても、もう一度走らせない (2 回書かない)', async () => {
    await withLocks(
      // 実装どおり cb の失敗をそのまま reject する錠。
      (_name, cb) => cb(),
      async () => {
        const store = getRecordStore();
        const rec = await store.insert('sales-entries', { base: 1 });
        let encrypts = 0;
        const cipher: RecordCipher = {
          encrypt: async (d) => {
            encrypts += 1;
            if (encrypts === 1) throw new Error('封緘に失敗');
            return { ...d };
          },
          decrypt: async (d) => ({ ...d }),
        };
        store.configureCipher(cipher);
        await expect(store.update(rec.id, { a: 2 })).rejects.toThrow('封緘に失敗');
        // 再実行していれば encrypt は 2 回呼ばれ、2 回目は成功して書き込まれてしまう。
        expect(encrypts).toBe(1);
        expect((await store.get(rec.id))?.data).toEqual({ base: 1 });
      },
    );
  });

  it('★ 錠が取れない環境では、鎖だけで直列化を保つ (壊れるより遅れるほうを選ぶ)', async () => {
    await withLocks(
      () => Promise.reject(new Error('この環境では錠が使えません')),
      async () => {
        const store = getRecordStore();
        const rec = await store.insert('sales-entries', { base: 1 });
        await Promise.all([store.update(rec.id, { a: 2 }), store.update(rec.id, { b: 3 })]);
        // 錠なしでも鎖が効くので、両方の欄が残る (上の節と同じ保証)。
        expect((await store.get(rec.id))?.data).toEqual({ base: 1, a: 2, b: 3 });
      },
    );
  });

  it('★ navigator そのものが無い実行環境でも書き換えできる (Node の古い版・worker)', async () => {
    const had = Object.prototype.hasOwnProperty.call(globalThis, 'navigator');
    const prev = (globalThis as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined });
    try {
      const store = getRecordStore();
      const rec = await store.insert('sales-entries', { base: 1 });
      await store.update(rec.id, { a: 2 });
      expect((await store.get(rec.id))?.data).toEqual({ base: 1, a: 2 });
    } finally {
      if (had) Object.defineProperty(globalThis, 'navigator', { configurable: true, value: prev });
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });

  it('★ navigator.locks が在っても request が関数でなければ鎖だけで進む', async () => {
    const nav = globalThis.navigator as unknown as { locks?: unknown };
    const had = Object.prototype.hasOwnProperty.call(nav, 'locks');
    const prev = nav.locks;
    // 「錠の口はあるが呼べない」形 (別実装・polyfill の崩れ)。呼べば TypeError になる。
    Object.defineProperty(nav, 'locks', { configurable: true, value: {} });
    try {
      const store = getRecordStore();
      const rec = await store.insert('sales-entries', { base: 1 });
      await store.update(rec.id, { a: 2 });
      expect((await store.get(rec.id))?.data).toEqual({ base: 1, a: 2 });
    } finally {
      if (had) Object.defineProperty(nav, 'locks', { configurable: true, value: prev });
      else delete (nav as { locks?: unknown }).locks;
    }
  });

  it('対照: navigator.locks が無くても今までどおり動く (jsdom の既定)', async () => {
    expect((globalThis.navigator as unknown as { locks?: unknown }).locks).toBeUndefined();
    const store = getRecordStore();
    const rec = await store.insert('sales-entries', { base: 1 });
    await Promise.all([store.update(rec.id, { a: 2 }), store.update(rec.id, { b: 3 })]);
    expect((await store.get(rec.id))?.data).toEqual({ base: 1, a: 2, b: 3 });
  });
});

/** @vitest-environment jsdom */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import {
  MAX_LATEST_ATTEMPTS,
  useCollection,
  _collectionSubscriberCountForTests,
  _resetCollectionSubscribersForTests,
  type UseCollection,
} from '../useCollection';
import { _resetRecordStoreForTests, getRecordStore, latestTokenOf } from '../store';
import { latestRecord } from '../latestRecord';

// React 18 の act() が警告を出さないようにする。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = Record<string, unknown> & { name: string };

/**
 * useCollection を最小コンポーネントに描画し、最新の戻り値を ref で公開する。
 * `col` プロップを差し替えて再描画できるので、useCallback / useEffect の依存配列
 * (collection / reload) 変異を撃墜できる。
 */
function setup(initial: string) {
  const ref: { current: UseCollection<Row> } = { current: null as unknown as UseCollection<Row> };
  function Harness({ col }: { col: string }) {
    ref.current = useCollection<Row>(col);
    return null;
  }
  const container = document.createElement('div');
  let root!: Root;
  return {
    ref,
    /** 描画のみ (初回 reload は待たない) — loading の初期状態を観測するため。 */
    async render(col = initial) {
      await act(async () => {
        root = createRoot(container);
        root.render(createElement(Harness, { col }));
      });
    },
    async mount(col = initial) {
      await this.render(col);
      await act(async () => {
        await ref.current.reload();
      });
    },
    /** 別コレクションへ差し替えて再描画し、自動 reload を反映させる。 */
    async rerender(col: string) {
      await act(async () => {
        root.render(createElement(Harness, { col }));
      });
      await act(async () => {
        await ref.current.reload();
      });
    },
    /** 手動 reload を呼ばずに再描画のみ — マウント effect の自動 reload に依存させる。 */
    async rerenderOnly(col: string) {
      await act(async () => {
        root.render(createElement(Harness, { col }));
      });
    },
    /** loading が落ちる (= 自動 reload 完了) まで非同期を回す。 */
    async settle() {
      for (let i = 0; i < 25 && ref.current.loading; i += 1) {
        await act(async () => {
          await new Promise<void>((r) => setTimeout(r, 0));
        });
      }
    },
    async run(fn: () => Promise<unknown>) {
      await act(async () => {
        await fn();
      });
    },
    unmount() {
      act(() => root.unmount());
    },
  };
}

beforeEach(async () => {
  _resetRecordStoreForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-data');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

describe('useCollection', () => {
  it('is loading on first render and clears it only after the reload resolves', async () => {
    const h = setup('sales');
    await h.render(); // describe-effect が reload を起動するが await しない
    // 初期 useState(true) + 起動時 setLoading(true) → まだ true。
    expect(h.ref.current.loading).toBe(true);
    expect(h.ref.current.records).toEqual([]);
    await act(async () => {
      await h.ref.current.reload();
    });
    expect(h.ref.current.loading).toBe(false);
    h.unmount();
  });

  it('starts empty and finishes loading after the initial reload', async () => {
    const h = setup('sales');
    await h.mount();
    expect(h.ref.current.records).toEqual([]);
    expect(h.ref.current.loading).toBe(false);
    h.unmount();
  });

  it('add inserts and reflects locally without a manual reload', async () => {
    const h = setup('sales');
    await h.mount();
    await h.run(() => h.ref.current.add({ name: 'A' }));
    expect(h.ref.current.records.map((r) => r.data.name)).toEqual(['A']);
    expect(h.ref.current.records[0]!.collection).toBe('sales');
    h.unmount();
  });

  it('addMany bulk-inserts and edit shallow-merges by id', async () => {
    const h = setup('customers');
    await h.mount();
    await h.run(() => h.ref.current.addMany([{ name: 'B' }, { name: 'C' }]));
    expect(h.ref.current.records).toHaveLength(2);
    const target = h.ref.current.records.find((r) => r.data.name === 'B')!;
    await h.run(() => h.ref.current.edit(target.id, { name: 'B2' }));
    expect(h.ref.current.records.find((r) => r.id === target.id)!.data.name).toBe('B2');
    h.unmount();
  });

  /**
   * **`edit` は書けたかを答える** (2026-09-27 · パス 498)。`store.update` は相手の行が無ければ投げずに
   * `null` を返す —— 直す前の `edit` はそれを捨てて `Promise<void>` を返し、別のタブで消された行を
   * 編集した保存は**何も書かないまま済んだ形**になった。無いときも一覧は読み直す (消えた行を画面から落とす)。
   */
  it('edit は相手の行が在れば true、無ければ何も書かずに false を返し、どちらも一覧を読み直す (パス 498)', async () => {
    const h = setup('sales');
    await h.mount();
    await h.run(() => h.ref.current.add({ name: 'A' }));
    const id = h.ref.current.records[0]!.id;
    let answer: boolean | undefined;
    await h.run(async () => {
      answer = await h.ref.current.edit(id, { name: 'A2' });
    });
    expect(answer).toBe(true);
    expect(h.ref.current.records.map((r) => r.data.name)).toEqual(['A2']);

    // 実在しない id —— 何も書かない (行を作り直さない)。
    await h.run(async () => {
      answer = await h.ref.current.edit('no-such-id', { name: 'ghost' });
    });
    expect(answer).toBe(false);
    expect(h.ref.current.records.map((r) => r.data.name)).toEqual(['A2']);

    // 別のタブで消された行: 購読を外してから保管層で消すと、この画面の写しは消えたことを知らない。
    _resetCollectionSubscribersForTests();
    await getRecordStore().remove(id);
    expect(h.ref.current.records, '前提: 写しはまだ消えたことを知らない').toHaveLength(1);
    await h.run(async () => {
      answer = await h.ref.current.edit(id, { name: 'A3' });
    });
    expect(answer).toBe(false);
    expect(await getRecordStore().list('sales'), '消えた行を作り直していない').toEqual([]);
    expect(h.ref.current.records, '答えが false でも一覧は読み直す').toEqual([]);
    h.unmount();
  });

  it('remove deletes the row and resyncs local state', async () => {
    const h = setup('sales');
    await h.mount();
    await h.run(() => h.ref.current.add({ name: 'X' }));
    const id = h.ref.current.records[0]!.id;
    await h.run(() => h.ref.current.remove(id));
    expect(h.ref.current.records).toEqual([]);
    h.unmount();
  });

  it('scopes records to their own collection', async () => {
    const a = setup('col-a');
    await a.mount();
    await a.run(() => a.ref.current.add({ name: 'in-a' }));
    const b = setup('col-b');
    await b.mount();
    expect(b.ref.current.records).toEqual([]); // 別コレクションには漏れない
    await b.run(() => b.ref.current.add({ name: 'in-b' }));
    expect(a.ref.current.records.map((r) => r.data.name)).toEqual(['in-a']);
    expect(b.ref.current.records.map((r) => r.data.name)).toEqual(['in-b']);
    a.unmount();
    b.unmount();
  });

  it('re-binds to a new collection prop and auto-reloads it (reload / effect deps)', async () => {
    const h = setup('first');
    await h.mount();
    await h.run(() => h.ref.current.add({ name: 'one' }));
    expect(h.ref.current.records.map((r) => r.data.name)).toEqual(['one']);
    // コレクション差し替え → reload が作り直され mount effect が再 reload して空になる。
    await h.rerender('second');
    expect(h.ref.current.records).toEqual([]);
    h.unmount();
  });

  it('add / addMany / edit / remove target the CURRENT collection after a prop change (callback deps)', async () => {
    const h = setup('left');
    await h.mount();
    await h.run(() => h.ref.current.add({ name: 'L' }));
    await h.rerender('right');
    // add は新コレクションへ。スコープが left のままなら撃墜される依存配列変異を検出。
    await h.run(() => h.ref.current.add({ name: 'R1' }));
    expect(h.ref.current.records.map((r) => r.data.name)).toEqual(['R1']);
    expect(h.ref.current.records.every((r) => r.collection === 'right')).toBe(true);
    // addMany も新コレクションへ。
    await h.run(() => h.ref.current.addMany([{ name: 'R2' }]));
    expect(h.ref.current.records.map((r) => r.data.name).sort()).toEqual(['R1', 'R2']);
    // edit / remove は id ベースだが、stale な reload を使うと left を読み戻して壊れる。
    const r1 = h.ref.current.records.find((r) => r.data.name === 'R1')!;
    await h.run(() => h.ref.current.edit(r1.id, { name: 'R1b' }));
    expect(h.ref.current.records.find((r) => r.id === r1.id)!.data.name).toBe('R1b');
    await h.run(() => h.ref.current.remove(r1.id));
    expect(h.ref.current.records.map((r) => r.data.name)).toEqual(['R2']);
    // 旧コレクション left は影響を受けない。
    const left = setup('left');
    await left.mount();
    expect(left.ref.current.records.map((r) => r.data.name)).toEqual(['L']);
    h.unmount();
    left.unmount();
  });

  it('editIfUnchanged も差し替え後の collection を読み直す (callback deps・パス 499)', async () => {
    const h = setup('left');
    await h.mount();
    await h.run(() => h.ref.current.add({ name: 'L' }));
    await h.rerender('right');
    await h.run(() => h.ref.current.add({ name: 'R' }));
    const r = h.ref.current.records.find((x) => x.data.name === 'R')!;
    let status: string | undefined;
    await h.run(async () => {
      status = (await h.ref.current.editIfUnchanged(r.id, r.data, { name: 'R2' })).status;
    });
    expect(status).toBe('saved');
    // 依存配列が空だと、最初の描画の reload (left に束ねたまま) で読み直し、一覧が left の行になる。
    expect(h.ref.current.records.map((x) => x.data.name)).toEqual(['R2']);
    h.unmount();
  });

  it('auto-loads on mount without a manual reload (mount effect body)', async () => {
    // 事前に store へ直接投入し、effect の自動 reload だけで反映されることを確認する。
    // effect 本体を {} に潰す変異だと loading が落ちず records も空のまま → 撃墜。
    await getRecordStore().insert('auto', { name: 'seed' });
    const h = setup('auto');
    await h.render();
    await h.settle();
    expect(h.ref.current.loading).toBe(false);
    expect(h.ref.current.records.map((r) => r.data.name)).toEqual(['seed']);
    h.unmount();
  });

  it('auto-reloads when the collection prop changes, without a manual reload (effect deps)', async () => {
    await getRecordStore().insert('aa', { name: 'a-seed' });
    await getRecordStore().insert('bb', { name: 'b-seed' });
    const h = setup('aa');
    await h.render();
    await h.settle();
    expect(h.ref.current.records.map((r) => r.data.name)).toEqual(['a-seed']);
    // コレクション差し替え。依存配列を [] に潰す変異だと effect が再実行されず aa のままになる。
    await h.rerenderOnly('bb');
    await h.settle();
    expect(h.ref.current.records.map((r) => r.data.name)).toEqual(['b-seed']);
    h.unmount();
  });

  it('does not update state after unmount (alive guard / cleanup)', async () => {
    const h = setup('sales');
    await h.mount();
    await h.run(() => h.ref.current.add({ name: 'keep' }));
    const snapshot = h.ref.current.records;
    // アンマウント後に reload を解決させても state 更新は行われない (例外も出ない)。
    h.unmount();
    await act(async () => {
      await h.ref.current.reload();
    });
    // 参照が変わっていない = setRecords が呼ばれていない。
    expect(h.ref.current.records).toBe(snapshot);
  });
});

/**
 * 同じ collection を 2 つの component が見ている状況。
 *
 * 2026-08 に実際に踏んだ形: 画面共通の手入力欄が値を保存しても、その値を使う
 * ページ側は古い records のままで、入力欄には「手入力」と印が付くのに画面の
 * 数字が変わらなかった。単体では両方とも正しく見えるので、2 つ描かないと出ない。
 */
describe('useCollection — 同じ collection を見る別インスタンス', () => {
  function setupPair(col: string) {
    const a: { current: UseCollection<Row> } = { current: null as unknown as UseCollection<Row> };
    const b: { current: UseCollection<Row> } = { current: null as unknown as UseCollection<Row> };
    function Harness({ mounted }: { mounted: boolean }) {
      a.current = useCollection<Row>(col);
      const second = useCollection<Row>(col);
      b.current = second;
      return mounted ? null : null;
    }
    const container = document.createElement('div');
    let root!: Root;
    return {
      a,
      b,
      async mount() {
        await act(async () => {
          root = createRoot(container);
          root.render(createElement(Harness, { mounted: true }));
        });
        await act(async () => {
          await a.current.reload();
          await b.current.reload();
        });
      },
      unmount() {
        act(() => {
          root.unmount();
        });
      },
      /**
       * 他インスタンスへの反映は非同期 (書いた側を待たせないため)。
       * 保留中のマイクロタスクを数回回して落ち着かせる。
       */
      async flush() {
        for (let i = 0; i < 10; i += 1) {
          await act(async () => {
            await Promise.resolve();
          });
        }
      },
    };
  }

  beforeEach(() => {
    _resetCollectionSubscribersForTests();
  });

  it('片方が追加すると、もう片方にも反映される', async () => {
    const h = setupPair('shared');
    await h.mount();
    expect(h.a.current.records).toHaveLength(0);
    expect(h.b.current.records).toHaveLength(0);

    await act(async () => {
      await h.a.current.add({ name: 'from-a' });
    });
    await h.flush();
    expect(h.a.current.records.map((r) => r.data.name)).toEqual(['from-a']);
    expect(h.b.current.records.map((r) => r.data.name)).toEqual(['from-a']);
    h.unmount();
  });

  it('片方が編集・削除しても、もう片方に反映される', async () => {
    const h = setupPair('shared2');
    await h.mount();
    await act(async () => {
      await h.a.current.add({ name: 'x' });
    });
    await h.flush();
    const id = h.b.current.records[0]?.id ?? '';
    expect(id).not.toBe('');

    await act(async () => {
      await h.b.current.edit(id, { name: 'edited' });
    });
    await h.flush();
    expect(h.a.current.records[0]?.data.name).toBe('edited');

    await act(async () => {
      await h.a.current.remove(id);
    });
    await h.flush();
    expect(h.b.current.records).toHaveLength(0);
    h.unmount();
  });

  it('まとめて追加でも反映される', async () => {
    const h = setupPair('shared3');
    await h.mount();
    await act(async () => {
      await h.a.current.addMany([{ name: 'p' }, { name: 'q' }]);
    });
    await h.flush();
    expect(h.b.current.records).toHaveLength(2);
    h.unmount();
  });

  it('別の collection には伝わらない', async () => {
    const one = setupPair('coll-a');
    await one.mount();
    const other = setupPair('coll-b');
    await other.mount();
    await act(async () => {
      await one.a.current.add({ name: 'only-a' });
    });
    await one.flush();
    await other.flush();
    expect(one.b.current.records).toHaveLength(1);
    expect(other.a.current.records).toHaveLength(0);
    one.unmount();
    other.unmount();
  });

  // 解除しないと購読者が溜まり続ける。件数で直接見る — 動作だけ見ていると
  // 「解除しなくても壊れない」ので、漏れに気付けない。
  it('マウントで購読し、アンマウントで解除する', async () => {
    expect(_collectionSubscriberCountForTests('counted')).toBe(0);
    const h = setupPair('counted');
    await h.mount();
    expect(_collectionSubscriberCountForTests('counted')).toBe(2);
    h.unmount();
    expect(_collectionSubscriberCountForTests('counted')).toBe(0);
  });

  it('別の collection の購読者数は影響を受けない', async () => {
    const h = setupPair('counted-a');
    await h.mount();
    expect(_collectionSubscriberCountForTests('counted-a')).toBe(2);
    expect(_collectionSubscriberCountForTests('counted-b')).toBe(0);
    h.unmount();
  });

  // 購読者が 0 の collection へ通知が飛ぶ経路。アンマウント後に完了する
  // 書き込みがこれに当たる (落ちずに素通りすること)。
  it('購読者が居なくなった後の書き込みでも落ちない', async () => {
    const h = setupPair('after-unmount');
    await h.mount();
    const write = h.a.current;
    h.unmount();
    expect(_collectionSubscriberCountForTests('after-unmount')).toBe(0);
    await act(async () => {
      await write.add({ name: 'late' });
    });
    await h.flush();
    expect(_collectionSubscriberCountForTests('after-unmount')).toBe(0);
  });

  it('collection を差し替えると購読先も移る', async () => {
    const s = setup('from');
    await s.mount();
    expect(_collectionSubscriberCountForTests('from')).toBe(1);
    expect(_collectionSubscriberCountForTests('to')).toBe(0);
    await s.rerender('to');
    expect(_collectionSubscriberCountForTests('from')).toBe(0);
    expect(_collectionSubscriberCountForTests('to')).toBe(1);
  });

  it('テスト用リセットで購読者が空になる', async () => {
    const h = setupPair('resettable');
    await h.mount();
    expect(_collectionSubscriberCountForTests('resettable')).toBe(2);
    _resetCollectionSubscribersForTests();
    expect(_collectionSubscriberCountForTests('resettable')).toBe(0);
    h.unmount();
  });

  // 購読を解除しないと、アンマウント済みの component へ通知が飛び続ける。
  it('アンマウントすると購読が外れる', async () => {
    const gone = setupPair('shared4');
    await gone.mount();
    gone.unmount();
    const fresh = setupPair('shared4');
    await fresh.mount();
    await act(async () => {
      await fresh.a.current.add({ name: 'after' });
    });
    await fresh.flush();
    expect(fresh.b.current.records).toHaveLength(1);
    fresh.unmount();
  });
});

/**
 * **最新の 1 件を採用する collection への書き込み** (パス 500)。`addIfLatest` は開いた時の最新のままなら
 * 足し、`applyToLatest` は今の最新に変更を当てて足す (挟まれたら当て直す)。`replaceLatest` は最新 1 件を
 * 書き換える記録 (数値パラメータ) のために、最新がまだ開いた時の版なら置き換える。仕組みの実測は
 * `store.insertIfLatest` と `useLatestForm.ts` の docblock。
 */
describe('useCollection —— addIfLatest / applyToLatest / replaceLatest (パス 500)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('★ addIfLatest: 開いた時の最新のままなら足し、一覧を読み直す', async () => {
    const h = setup('latest-a');
    await h.mount();
    await h.run(() => h.ref.current.add({ name: 'first' }));
    const opened = latestRecord(h.ref.current.records);
    let status = '';
    await h.run(async () => {
      status = (await h.ref.current.addIfLatest(latestTokenOf(opened), { name: 'second' })).status;
    });
    expect(status).toBe('saved');
    expect(latestRecord(h.ref.current.records)?.data.name).toBe('second');
    h.unmount();
  });

  it('★ addIfLatest: 開いた後に別の保存が入っていたら書かずに今の最新を返し、一覧はその保存を映す', async () => {
    const h = setup('latest-b');
    await h.mount();
    await h.run(() => h.ref.current.add({ name: 'first' }));
    const opened = latestRecord(h.ref.current.records);
    await getRecordStore().insert('latest-b', { name: 'other-tab' });
    let current: string | undefined;
    await h.run(async () => {
      const r = await h.ref.current.addIfLatest(latestTokenOf(opened), { name: 'mine' });
      current = r.status === 'changed' ? r.current?.data.name : 'saved?';
    });
    expect(current).toBe('other-tab');
    expect(h.ref.current.records.map((r) => r.data.name).sort()).toEqual(['first', 'other-tab']);
    h.unmount();
  });

  it('★ applyToLatest: 今の最新に当てて足し、当てた行を basedOn で返す', async () => {
    const h = setup('latest-c');
    await h.mount();
    await h.run(() => h.ref.current.add({ name: 'a' }));
    let basedOn: string | undefined;
    await h.run(async () => {
      const r = await h.ref.current.applyToLatest((cur) => ({ name: `${cur?.data.name ?? ''}+b` }));
      basedOn = r.status === 'saved' ? r.basedOn?.data.name : r.status;
    });
    expect(basedOn).toBe('a');
    expect(latestRecord(h.ref.current.records)?.data.name).toBe('a+b');
    h.unmount();
  });

  it('★ applyToLatest: 当てて足す前に別の保存が挟まれば、挟まった最新に当て直す (その保存を消さない)', async () => {
    const h = setup('latest-d');
    await h.mount();
    await h.run(() => h.ref.current.add({ name: 'a' }));
    const store = getRecordStore();
    const original = store.insertIfLatest.bind(store);
    let fired = false;
    vi.spyOn(store, 'insertIfLatest').mockImplementation((async (...args: Parameters<typeof store.insertIfLatest>) => {
      if (!fired) {
        fired = true;
        await store.insert('latest-d', { name: 'other' }); // 読みの後・書く前に、別のタブ
      }
      return original(...args);
    }) as typeof store.insertIfLatest);
    await h.run(async () => {
      await h.ref.current.applyToLatest((cur) => ({ name: `${cur?.data.name ?? ''}+mine` }));
    });
    expect(latestRecord(h.ref.current.records)?.data.name, '挟まった保存に当て直していない').toBe('other+mine');
    h.unmount();
  });

  it('★ applyToLatest: 当てるたびに挟まれたら、上限の回数で止めて busy (何も書かない)', async () => {
    const h = setup('latest-e');
    await h.mount();
    await h.run(() => h.ref.current.add({ name: 'a' }));
    const store = getRecordStore();
    const original = store.insertIfLatest.bind(store);
    const spy = vi.spyOn(store, 'insertIfLatest').mockImplementation((async (...args: Parameters<typeof store.insertIfLatest>) => {
      await store.insert('latest-e', { name: `other-${spy.mock.calls.length}` });
      return original(...args);
    }) as typeof store.insertIfLatest);
    let status = '';
    await h.run(async () => {
      status = (await h.ref.current.applyToLatest(() => ({ name: 'mine' }))).status;
    });
    expect(status).toBe('busy');
    expect(spy).toHaveBeenCalledTimes(MAX_LATEST_ATTEMPTS);
    expect(MAX_LATEST_ATTEMPTS).toBe(2);
    expect(h.ref.current.records.some((r) => r.data.name === 'mine')).toBe(false);
    h.unmount();
  });

  it('★ applyToLatest: 保管層が読めなければ unreadable (何も書かない —— 「0 件」と混ぜない)', async () => {
    const h = setup('latest-f');
    await h.mount();
    const store = getRecordStore();
    vi.spyOn(store, 'list').mockRejectedValueOnce(new Error('unreadable'));
    const insert = vi.spyOn(store, 'insertIfLatest');
    let status = '';
    await h.run(async () => {
      status = (await h.ref.current.applyToLatest(() => ({ name: 'mine' }))).status;
    });
    expect(status).toBe('unreadable');
    expect(insert).not.toHaveBeenCalled();
    h.unmount();
  });

  it('★ applyToLatest: change が null なら書かずに declined、一覧は読み直す', async () => {
    const h = setup('latest-g');
    await h.mount();
    await getRecordStore().insert('latest-g', { name: 'arrived' }); // 知らせの届く前に入った保存
    let status = '';
    await h.run(async () => {
      status = (await h.ref.current.applyToLatest(() => null)).status;
    });
    expect(status).toBe('declined');
    expect(h.ref.current.records.map((r) => r.data.name), '断ったのに一覧を読み直していない').toEqual(['arrived']);
    h.unmount();
  });

  it('★ replaceLatest: 最新がまだ開いた時の版なら置き換え (行は増えない)、違えば書かずに今の最新を返す', async () => {
    const h = setup('latest-r');
    await h.mount();
    await h.run(() => h.ref.current.add({ name: 'a' }));
    const opened = latestRecord(h.ref.current.records)!;
    let first = '';
    await h.run(async () => {
      first = (await h.ref.current.replaceLatest(latestTokenOf(opened)!, { name: 'b' })).status;
    });
    expect(first).toBe('saved');
    expect(h.ref.current.records.map((r) => r.data.name), '置き換えたのに一覧を読み直していない').toEqual(['b']);
    // 開いた時の目印はもう古い (版が進んだ) —— 同じ目印で 2 度目は書かない。
    let second: string | undefined;
    await h.run(async () => {
      const r = await h.ref.current.replaceLatest(latestTokenOf(opened)!, { name: 'c' });
      second = r.status === 'changed' ? r.current?.data.name : 'saved?';
    });
    expect(second).toBe('b');
    expect(h.ref.current.records.map((r) => r.data.name)).toEqual(['b']);
    h.unmount();
  });

  it('addIfLatest / applyToLatest も差し替え後の collection へ書く (callback deps)', async () => {
    const h = setup('latest-left');
    await h.mount();
    await h.rerender('latest-right');
    await h.run(async () => {
      await h.ref.current.addIfLatest(null, { name: 'R1' });
    });
    await h.run(async () => {
      await h.ref.current.applyToLatest((cur) => ({ name: `${cur?.data.name ?? ''}+R2` }));
    });
    expect(h.ref.current.records.map((r) => r.data.name).sort()).toEqual(['R1', 'R1+R2']);
    expect(await getRecordStore().count('latest-left')).toBe(0);
    h.unmount();
  });

  it('replaceLatest も差し替え後の collection を読み直す (callback deps)', async () => {
    const h = setup('latest-left-r');
    await h.mount();
    await h.run(() => h.ref.current.add({ name: 'L' }));
    await h.rerender('latest-right-r');
    await h.run(() => h.ref.current.add({ name: 'R' }));
    const r = latestRecord(h.ref.current.records)!;
    let status = '';
    await h.run(async () => {
      status = (await h.ref.current.replaceLatest(latestTokenOf(r)!, { name: 'R2' })).status;
    });
    expect(status).toBe('saved');
    // 依存配列が空だと、最初の描画の collection (left) へ書こうとして right の最新を見つけられない。
    expect(h.ref.current.records.map((x) => x.data.name)).toEqual(['R2']);
    h.unmount();
  });
});

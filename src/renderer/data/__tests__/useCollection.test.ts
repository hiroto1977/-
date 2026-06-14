/** @vitest-environment jsdom */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useCollection, type UseCollection } from '../useCollection';
import { _resetRecordStoreForTests } from '../store';

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
    async run(fn: () => Promise<void>) {
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

  it('auto-loads on mount without a manual reload (mount effect body)', async () => {
    // 事前に store へ直接投入し、effect の自動 reload だけで反映されることを確認する。
    // effect 本体を {} に潰す変異だと loading が落ちず records も空のまま → 撃墜。
    const { getRecordStore } = await import('../store');
    await getRecordStore().insert('auto', { name: 'seed' });
    const h = setup('auto');
    await h.render();
    await h.settle();
    expect(h.ref.current.loading).toBe(false);
    expect(h.ref.current.records.map((r) => r.data.name)).toEqual(['seed']);
    h.unmount();
  });

  it('auto-reloads when the collection prop changes, without a manual reload (effect deps)', async () => {
    const { getRecordStore } = await import('../store');
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

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

/** useCollection を最小コンポーネントに描画し、最新の戻り値を ref で公開する。 */
function setup(collection: string) {
  const ref: { current: UseCollection<Row> } = { current: null as unknown as UseCollection<Row> };
  function Harness() {
    ref.current = useCollection<Row>(collection);
    return null;
  }
  const container = document.createElement('div');
  let root!: Root;
  return {
    ref,
    async mount() {
      await act(async () => {
        root = createRoot(container);
        root.render(createElement(Harness));
      });
      // 初回 reload (IndexedDB 経由・非同期) を明示的に待って state に反映させる。
      await act(async () => {
        await ref.current.reload();
      });
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
});

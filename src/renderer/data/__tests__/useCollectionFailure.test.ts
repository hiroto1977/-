/** @vitest-environment jsdom */
/**
 * **端末が断ったら、入口が必ず報せる。**
 *
 * `useCollection` の書き込み (add / addMany / edit / remove) は拒否された
 * Promise を返すが、実測 (2026-09-06) では呼び出し 13 か所のうち 10 か所が
 * それを受け取っていなかった (`void add()` / `onClick={async () => { await onSave() }}`)。
 * 読みの側はもっと静かで、マウント effect の `reload()` は誰も受け取らない ——
 * `indexedDB` が開けない端末では**全コレクションが空**になり、
 * 「まだ何も入力していない」画面と見分けが付かない。
 *
 * 13 か所へ同じ try/catch を配って回る代わりに、**入口が 1 本の経路へ写す**。
 * ここで留めるのは「どの操作が、どの名前で報せるか」と、
 * **成功したときは何も報せないこと** (対照)。
 *
 * 併せて、いちばん間違えやすい所を留める: **書けたのに読み直しで失敗したときは
 * 「保存できませんでした」と言わない** (書けているので嘘になる)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const h = vi.hoisted(() => ({
  /** 失敗させる操作名。テストごとに入れ替える。 */
  failOn: new Set<string>(),
  rows: [] as { id: string; collection: string; createdAt: number; updatedAt: number; data: Record<string, unknown> }[],
}));

vi.mock('../store', () => {
  function boom(op: string): void {
    if (!h.failOn.has(op)) return;
    const e = new Error('device refused');
    e.name = 'QuotaExceededError';
    throw e;
  }
  const store = {
    async list(collection: string) {
      boom('list');
      return h.rows.filter((r) => r.collection === collection);
    },
    async insert(collection: string, data: Record<string, unknown>) {
      boom('insert');
      const row = { id: `r${h.rows.length + 1}`, collection, createdAt: 1, updatedAt: 1, data };
      h.rows.push(row);
      return row;
    },
    async insertMany(collection: string, rows: readonly Record<string, unknown>[]) {
      boom('insertMany');
      return rows.map((data) => {
        const row = { id: `r${h.rows.length + 1}`, collection, createdAt: 1, updatedAt: 1, data };
        h.rows.push(row);
        return row;
      });
    },
    async update(id: string, patch: Record<string, unknown>) {
      boom('update');
      const row = h.rows.find((r) => r.id === id);
      if (row === undefined) return null;
      Object.assign(row.data, patch);
      return row;
    },
    async remove(id: string) {
      boom('remove');
      h.rows = h.rows.filter((r) => r.id !== id);
    },
  };
  return { getRecordStore: () => store };
});

import { useCollection, _resetCollectionSubscribersForTests, type UseCollection } from '../useCollection';
import { _resetRecordStoreFailureForTests, currentRecordStoreFailure } from '../recordStoreFailure';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = Record<string, unknown> & { name: string };

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
      await act(async () => {
        await ref.current.reload();
      });
    },
    async run(fn: () => Promise<unknown>) {
      let thrown: unknown;
      await act(async () => {
        try {
          await fn();
        } catch (e) {
          thrown = e;
        }
      });
      return thrown;
    },
    unmount() {
      act(() => root.unmount());
    },
  };
}

beforeEach(() => {
  h.failOn.clear();
  h.rows = [];
  _resetRecordStoreFailureForTests();
  _resetCollectionSubscribersForTests();
});
afterEach(() => {
  _resetRecordStoreFailureForTests();
});

describe('書き込みが断られたとき', () => {
  it('★ add: save として報せ、呼び出し側へも投げ直す', async () => {
    const t = setup('sales-entries');
    await t.mount();
    h.failOn.add('insert');
    const thrown = await t.run(() => t.ref.current.add({ name: 'a' }));
    expect(thrown).toBeInstanceOf(Error);
    const f = currentRecordStoreFailure();
    expect(f?.op).toBe('save');
    expect(f?.collection).toBe('sales-entries');
    expect(f?.message).toContain('打ち込んだ内容は画面に残っています');
    t.unmount();
  });

  it('★ addMany: 一括取り込みも save', async () => {
    const t = setup('kpi-actuals');
    await t.mount();
    h.failOn.add('insertMany');
    const thrown = await t.run(() => t.ref.current.addMany([{ name: 'a' }, { name: 'b' }]));
    expect(thrown).toBeInstanceOf(Error);
    expect(currentRecordStoreFailure()?.op).toBe('save');
    t.unmount();
  });

  it('★ edit: 書き換えも save', async () => {
    const t = setup('members');
    await t.mount();
    await t.run(() => t.ref.current.add({ name: 'a' }));
    h.failOn.add('update');
    const thrown = await t.run(() => t.ref.current.edit('r1', { name: 'b' }));
    expect(thrown).toBeInstanceOf(Error);
    expect(currentRecordStoreFailure()?.op).toBe('save');
    t.unmount();
  });

  it('★ remove: 削除は delete (「一覧はそのまま」と言う)', async () => {
    const t = setup('members');
    await t.mount();
    await t.run(() => t.ref.current.add({ name: 'a' }));
    h.failOn.add('remove');
    const thrown = await t.run(() => t.ref.current.remove('r1'));
    expect(thrown).toBeInstanceOf(Error);
    const f = currentRecordStoreFailure();
    expect(f?.op).toBe('delete');
    expect(f?.message).toContain('一覧はそのままです');
    t.unmount();
  });

  it('★ 書けたのに読み直しで失敗したときは read として報せる (保存の失敗と言わない)', async () => {
    const t = setup('sales-entries');
    await t.mount();
    h.failOn.add('list');
    const thrown = await t.run(() => t.ref.current.add({ name: 'a' }));
    // 書き込みは通っているので、呼び出し側へは成功として返る。
    expect(thrown).toBeUndefined();
    expect(h.rows).toHaveLength(1);
    const f = currentRecordStoreFailure();
    expect(f?.op).toBe('read');
    expect(f?.message).not.toContain('保存できませんでした');
    t.unmount();
  });

  it('対照: 断られなければ何も報せない', async () => {
    const t = setup('sales-entries');
    await t.mount();
    await t.run(() => t.ref.current.add({ name: 'a' }));
    await t.run(() => t.ref.current.edit('r1', { name: 'b' }));
    await t.run(() => t.ref.current.remove('r1'));
    expect(currentRecordStoreFailure()).toBeNull();
    t.unmount();
  });
});

describe('読めなかったとき', () => {
  it('★ マウント時に読めなければ read として報せる (投げない)', async () => {
    h.failOn.add('list');
    const t = setup('sales-entries');
    await t.mount(); // 投げたらここで落ちる
    const f = currentRecordStoreFailure();
    expect(f?.op).toBe('read');
    expect(f?.message).toContain('記録が消えたとは限りません');
    t.unmount();
  });

  it('★ 読めなかった回は「読み込み中」を解く (永遠に読み込み中にしない)', async () => {
    h.failOn.add('list');
    const t = setup('sales-entries');
    await t.mount();
    expect(t.ref.current.loading).toBe(false);
    t.unmount();
  });

  it('★ 読めなかった回は、今持っている一覧を空に置き換えない', async () => {
    const t = setup('sales-entries');
    await t.mount();
    await t.run(() => t.ref.current.add({ name: '4 月の売上' }));
    expect(t.ref.current.records).toHaveLength(1);

    h.failOn.add('list');
    await t.run(() => t.ref.current.reload());
    // 「消えた」画面にしない —— 出ているのは前回読めた一覧。
    expect(t.ref.current.records).toHaveLength(1);
    expect(currentRecordStoreFailure()?.op).toBe('read');
    t.unmount();
  });
});

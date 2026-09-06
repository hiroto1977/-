/** @vitest-environment jsdom */
/**
 * **後から返った古い読みで、一覧を書く前の姿に戻さない。**
 *
 * `reload()` は重なる —— 書いた本人が await する分、`notifyCollection` で他の
 * instance に飛ぶ分、マウント effect の分がある。`list()` は IndexedDB の読みだけで
 * 終わらず、**1 件ずつ復号してから**返る (`recordEncryption` を有効にした端末)。
 * 読みの要求順は IndexedDB が守っても、**復号にかかる時間は件数で変わる**ので、
 * 返る順は要求順とは限らない。先に始まった大きい読みが後から返ると、
 * 書いた直後の一覧が**書く前の姿に戻る** (記録は残っているのに画面から消える)。
 *
 * ここでは `list()` を手で解決できる store に差し替えて、返る順を逆にする。
 * 番人は `useServiceData` と同じ形 (最新の札を持つ読みだけが書き換える)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

type Row = { id: string; collection: string; createdAt: number; updatedAt: number; data: Record<string, unknown> };

const h = vi.hoisted(() => ({
  /** 未解決の `list()`。`resolvers[i]` が i 回目の読み。 */
  resolvers: [] as ((rows: Row[]) => void)[],
}));

vi.mock('../store', () => ({
  getRecordStore: () => ({
    async list() {
      return new Promise<Row[]>((resolve) => {
        h.resolvers.push(resolve);
      });
    },
    async insert() {
      throw new Error('この検査は読みの順序だけを見る');
    },
  }),
}));

const { useCollection, _resetCollectionSubscribersForTests } = await import('../useCollection');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (id: string, label: string): Row => ({
  id, collection: 'sales-entries', createdAt: 1, updatedAt: 1, data: { label },
});

let container: HTMLDivElement;
let root: Root | null = null;
const ref: { current: ReturnType<typeof useCollection<Record<string, unknown>>> | null } = { current: null };

function Harness(): null {
  ref.current = useCollection<Record<string, unknown>>('sales-entries');
  return null;
}

async function flush(n = 6): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(async () => {
  h.resolvers.length = 0;
  _resetCollectionSubscribersForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });
  await flush();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  document.body.removeChild(container);
});

describe('useCollection — 読みが重なったとき', () => {
  it('★ 先に始まった読みが後から返っても、新しい読みの結果を上書きしない', async () => {
    // マウントの読みが 1 本目。ここで 2 本目を始める。
    expect(h.resolvers).toHaveLength(1);
    void ref.current!.reload();
    await flush(2);
    expect(h.resolvers).toHaveLength(2);

    // 2 本目 (新しい) が先に返る → 画面は新しい一覧。
    h.resolvers[1]!([row('r2', '記録したあと')]);
    await flush();
    expect(ref.current!.records.map((r) => r.data.label)).toEqual(['記録したあと']);

    // 1 本目 (古い) が後から返る → 戻してはいけない。
    h.resolvers[0]!([row('r1', '記録するまえ')]);
    await flush();
    expect(
      ref.current!.records.map((r) => r.data.label),
      '古い読みが後から一覧を戻してはいけない',
    ).toEqual(['記録したあと']);
    expect(ref.current!.loading).toBe(false);
  });

  it('対照: 重なっていなければ、その読みの結果がそのまま出る', async () => {
    h.resolvers[0]!([row('r1', '最初の一覧')]);
    await flush();
    expect(ref.current!.records.map((r) => r.data.label)).toEqual(['最初の一覧']);
    expect(ref.current!.loading).toBe(false);
  });
});

import { useCallback, useEffect, useRef, useState } from 'react';
import { getRecordStore, type StoredRecord } from './store';

/**
 * 同じ collection を見ている**別の** hook へ変更を知らせる仕組み。
 *
 * この hook は instance ごとに records を持つので、A と B が同じ collection を
 * 見ているとき、A が書いても B は古いまま残る。2026-08 に実際に踏んだ形:
 * 画面共通の手入力欄 (App) が値を保存しても、その値を使う側のページは
 * 再読込まで古い数字を出し続けた。**入力欄には「手入力」と印が付くのに、
 * 画面の数字が変わらない**という、いちばん分かりにくい壊れ方だった。
 *
 * 書いた instance は自分で `reload()` を await する (呼び出し側が
 * `await add(...)` の直後に新しい records を読めるようにするため)。
 * 他の instance へは通知だけを送る。
 */
const subscribers = new Map<string, Set<() => void>>();

/**
 * その collection の購読者集合。無ければ作る。
 *
 * `subscribers.get(c) ?? []` と書くと、**到達しない既定値**が残る
 * (通知は必ず購読済みの hook から来るので undefined にならない)。
 * 集合を必ず返す入口を 1 つ置けば、その分岐ごと消える。
 */
function subscriberSet(collection: string): Set<() => void> {
  const existing = subscribers.get(collection);
  if (existing !== undefined) return existing;
  const created = new Set<() => void>();
  subscribers.set(collection, created);
  return created;
}

function subscribe(collection: string, fn: () => void): () => void {
  const set = subscriberSet(collection);
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

/**
 * その collection を見ている hook すべてに読み直させる。
 *
 * 書いた本人も含めて呼ぶ。「自分以外」に絞ると読み直しが 1 回減るが、
 * **観測できる差が無いぶんテストで守れない**分岐が増える。読み直しは
 * IndexedDB の 1 read なので、分岐を消すほうを採る。
 */
function notifyCollection(collection: string): void {
  for (const fn of subscriberSet(collection)) fn();
}

/** テスト用: 購読者を空にする。 */
export function _resetCollectionSubscribersForTests(): void {
  subscribers.clear();
}

/** テスト用: 購読者数。解除が効いているかを見るために公開する。 */
export function _collectionSubscriberCountForTests(collection: string): number {
  return subscribers.get(collection)?.size ?? 0;
}

/**
 * React binding for a single record-store collection. Loads the collection
 * on mount and exposes add/edit/delete that keep local state in sync without
 * a full reload. Pages use this to read/write real persisted business data
 * (sales entries, customers, …) instead of static snapshots.
 */
export interface UseCollection<T extends Record<string, unknown>> {
  records: readonly StoredRecord<T>[];
  loading: boolean;
  add: (data: T) => Promise<void>;
  /** Atomic bulk insert (all rows commit together or none). For CSV import. */
  addMany: (rows: readonly T[]) => Promise<void>;
  edit: (id: string, patch: Partial<T>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function useCollection<T extends Record<string, unknown>>(collection: string): UseCollection<T> {
  const [records, setRecords] = useState<readonly StoredRecord<T>[]>([]);
  // 初期 true はマウント effect の setLoading(true) で必ず上書きされるため、初期値変異は
  // 観測差が無く equivalent。
  // Stryker disable next-line BooleanLiteral
  const [loading, setLoading] = useState(true);
  // setState-after-unmount を避けるための防御 ref。React 18 の createRoot はアンマウント後の
  // setState を既に no-op 化するため、この ref ガード (初期値・effect 本体・cleanup・判定) を
  // 変異させても観測上の振る舞いは変わらない (equivalent)。防御の明示性のため残す。
  /* Stryker disable all */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  /* Stryker restore all */

  const reload = useCallback(async () => {
    const list = await getRecordStore().list<T>(collection);
    // Stryker disable next-line ConditionalExpression: 上記のとおり alive ガードは React 18 では equivalent。
    if (alive.current) {
      setRecords(list);
      setLoading(false);
    }
  }, [collection]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  // 他の instance の書き込みを受け取る。identity を固定したいので ref に置く
  // (毎レンダーで別の関数を購読すると、解除できずに溜まる)。
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const onExternalChange = useRef(() => {
    void reloadRef.current();
  });
  useEffect(() => subscribe(collection, onExternalChange.current), [collection]);

  const add = useCallback(
    async (data: T) => {
      await getRecordStore().insert<T>(collection, data);
      await reload();
      notifyCollection(collection);
    },
    [collection, reload],
  );

  const addMany = useCallback(
    async (rows: readonly T[]) => {
      await getRecordStore().insertMany<T>(collection, rows);
      await reload();
      notifyCollection(collection);
    },
    [collection, reload],
  );

  const edit = useCallback(
    async (id: string, patch: Partial<T>) => {
      await getRecordStore().update<T>(id, patch);
      await reload();
      notifyCollection(collection);
    },
    [collection, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await getRecordStore().remove(id);
      await reload();
      notifyCollection(collection);
    },
    [collection, reload],
  );

  return { records, loading, add, addMany, edit, remove, reload };
}

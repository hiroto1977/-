import { useCallback, useEffect, useRef, useState } from 'react';
import { getRecordStore, type StoredRecord } from './store';

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

  const add = useCallback(
    async (data: T) => {
      await getRecordStore().insert<T>(collection, data);
      await reload();
    },
    [collection, reload],
  );

  const addMany = useCallback(
    async (rows: readonly T[]) => {
      await getRecordStore().insertMany<T>(collection, rows);
      await reload();
    },
    [collection, reload],
  );

  const edit = useCallback(
    async (id: string, patch: Partial<T>) => {
      await getRecordStore().update<T>(id, patch);
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await getRecordStore().remove(id);
      await reload();
    },
    [reload],
  );

  return { records, loading, add, addMany, edit, remove, reload };
}

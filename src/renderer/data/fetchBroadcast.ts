/**
 * **まとめて取り直した内容を、開いている画面へ知らせる。** (2026-11-27 · `refreshAll.ts`)
 *
 * 「まとめて取り直す」は画面の外で取るので、開いている画面の `useServiceData` は知らないままになる。
 * 取れた内容を 1 件ずつここへ流し、その連携先を描いている画面が自分の表示を差し替える。
 * 同じタブの中だけの知らせで、どこへも送らない (中身はメモリの中を渡るだけ)。
 */
import type { ServiceId } from '../../preload/bridgeTypes';

type Listener = (data: unknown) => void;

const listeners = new Map<ServiceId, Set<Listener>>();

/** その連携先の新しい内容を受け取る。戻り値で解除する。 */
export function subscribeFetched(id: ServiceId, listener: Listener): () => void {
  let set = listeners.get(id);
  if (set === undefined) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

/** その連携先の新しい内容を、受け取っている画面すべてへ渡す。 */
export function publishFetched(id: ServiceId, data: unknown): void {
  for (const listener of listeners.get(id) ?? []) listener(data);
}

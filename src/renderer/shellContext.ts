import { createContext, useContext } from 'react';
import type { ServiceId } from '../shared/serviceId';

/**
 * シェル (サイドバー・トップバー) が持つ状態を、画面へ**読ませる**ための文脈 (パス 322)。
 *
 * ホームの「お気に入り / 最近使った」のジャンプ列は、サイドバーが `localStorage` から
 * 読んで積んでいる並びと**同じ物**を映す。画面側でもう 1 度 `localStorage` を読むと
 * 読み手が 2 つになり (保存の台帳 `lint:storage` の規則 3 / 12 が増える)、サイドバーで
 * ♥ を押した直後にホームの列が古いまま残る。だから並びの出所は App 1 つで、画面は
 * この文脈から受け取る。
 *
 * `services.ts` が `HomePage` を import するので、`HomePage` から `SERVICES` は読めない
 * (循環)。id と表示に要る最小の欄だけを App が解いて渡す。
 */
export interface ShellService {
  id: ServiceId;
  label: string;
  icon: string;
  description: string;
}

export interface ShellState {
  /** お気に入り (登録順)。現存するサービスだけ。 */
  favorites: readonly ShellService[];
  /** 最近開いた物 (新しい順・今開いている画面を含む)。現存するサービスだけ。 */
  recents: readonly ShellService[];
  toggleFavorite: (id: ServiceId) => void;
}

/** 文脈の外 (単体検査で画面だけを描くとき) の既定: 空の並びと no-op。 */
export const EMPTY_SHELL: ShellState = Object.freeze({
  favorites: [],
  recents: [],
  toggleFavorite: () => undefined,
});

export const ShellContext = createContext<ShellState>(EMPTY_SHELL);

export function useShell(): ShellState {
  return useContext(ShellContext);
}

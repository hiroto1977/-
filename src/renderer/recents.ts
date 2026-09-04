import type { ServiceId } from '../shared/serviceId';

/**
 * 「最近使った」「お気に入り」サービスのリスト変換 (純関数 — DOM 非依存)。
 *
 * 63 サービスがカテゴリ折りたたみに埋もれる中、頻用サービスへの即アクセスを
 * サイドバー上部に提供する。永続化 (localStorage) は App.tsx が行い、ここでは
 * 副作用のないリスト操作のみを担う (単体テスト + Stryker mutation の対象)。
 */

/** 既定の「最近使った」表示件数。 */
export const RECENTS_MAX = 5;

/**
 * 最近使ったリストへ id を追加する。
 * 先頭に置き、重複を除き、最大 `max` 件に切り詰める (most-recent-first)。
 */
export function pushRecent(
  list: readonly ServiceId[],
  id: ServiceId,
  max: number = RECENTS_MAX,
): ServiceId[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

/** お気に入りのトグル: あれば外し、無ければ末尾に追加する。 */
export function toggleFavorite(list: readonly ServiceId[], id: ServiceId): ServiceId[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/**
 * 既知のサービス集合に含まれる id だけを順序を保って残す。
 * 保存後にサービスが削除/改名された場合の stale id を弾く。
 */
export function keepKnown(
  list: readonly ServiceId[],
  known: ReadonlySet<ServiceId>,
): ServiceId[] {
  return list.filter((id) => known.has(id));
}

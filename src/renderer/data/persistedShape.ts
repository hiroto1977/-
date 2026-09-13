/**
 * 端末に残した JSON (localStorage) は型が守らない。
 *
 * `JSON.parse(raw) as Shape` は「前の版がこの形で書いたはず」という願いで、古い版・新しい版・
 * 手で直した JSON・同じオリジンの別コードが書いた値には効かない。2026-09-05 に書類スタジオで
 * 実際に踏んだ (`kessanSheet: 'foo'` で画面が開くたびに落ち、localStorage を消すまで直らない)。
 * ここに置くのは**読むたびに形を確かめる**ための小道具だけ。保存先 (キー) はここでは触らない ——
 * 保存先の台帳は `scripts/lint-storage-ledger.cjs` が各モジュールの `localStorage.getItem` で数える。
 */

/** 配列でも null でもないオブジェクト。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 文字列の値だけを残した辞書。オブジェクトでなければ空。 */
export function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) if (typeof v === 'string') out[k] = v;
  return out;
}

/** 配列なら形の合う要素だけ、配列でなければ空。 */
export function arrayOf<T>(value: unknown, is: (item: unknown) => item is T): T[] {
  return Array.isArray(value) ? value.filter(is) : [];
}

/**
 * 保存した会話履歴。`role` が許した値で `text` が文字列の要素だけを、末尾 `max` 件残す。
 * 通った要素はそのまま返す (関連サービスなど追加の欄を落とさない)。
 */
export function chatMessages<T extends { readonly role: string; readonly text: string }>(
  value: unknown,
  roles: readonly T['role'][],
  max: number,
): T[] {
  const allowed: readonly string[] = roles;
  return arrayOf(value, (item): item is T => isRecord(item) && typeof item.role === 'string' && allowed.includes(item.role) && typeof item.text === 'string').slice(-max);
}

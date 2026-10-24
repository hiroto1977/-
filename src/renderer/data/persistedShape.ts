import { displayField } from '../../shared/apiResponse';

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
 * 保存した会話履歴の、`role` / `text` 以外の欄の読み手。欄ごとに「読めた値」か `undefined`
 * (= **その欄だけ**落とす) を返す。
 *
 * **型が「全部の欄に読み手を置け」と要求する** (`-?`) —— 会話の型に欄を 1 つ足して画面が描き始めたのに
 * 読み手を書き忘れると `tsc` が落ちる。2026-09-26 (パス 489) まで、この関数は「通った要素は
 * そのまま返す (関連サービスなど追加の欄を落とさない)」形で、`role` / `text` 以外を 1 つも
 * 検めていなかった。実測: `provider: {a:1}` の 1 件で AI アシスタントの画面が
 * 「Objects are not valid as a React child」で落ち (その画面の「🗑 消去」ごと消える)、
 * `routedThrough: {a:1}` の 1 件で**AI コンシェルジュを開いた瞬間にアプリ全体が白くなった**
 * (浮いた部品は画面の境界の外に在るので、React がツリーごと外す)。
 */
export type ChatFieldReaders<T> = {
  readonly [K in Exclude<keyof T, 'role' | 'text'>]-?: (value: unknown) => T[K] | undefined;
};

/**
 * 保存した会話履歴。`role` が許した値で `text` が文字列の要素だけを、末尾 `max` 件残す。
 *
 * **返すのは新しく組んだ物** —— `role` と `text` と、`readers` が読めた欄だけ。読めない欄は
 * **その欄だけ**を落とし、行は残す (1 つの欄が壊れているだけで会話の 1 件を消すと、その分の
 * 記録を黙って失う)。`readers` に無い欄は持ち込まない (次の版が描き始めた欄が、検めないまま届く形にしない)。
 */
export function chatMessages<T extends { readonly role: string; readonly text: string }>(
  value: unknown,
  roles: readonly T['role'][],
  max: number,
  readers: ChatFieldReaders<T>,
): T[] {
  // `role` は許可リストとの一致だけで決める。許可リストは文字列なので、非文字列の `role` は
  // 型を見なくても一致しない —— `typeof item.role !== 'string'` を別に置くと、それを消す変異体が
  // 答えを 1 つも変えない (変異検査が「等価」と報告した・2026-09-26 パス 489)。行ごと pragma で
  // 黙らせると、同じ行の本物の 2 つ (許可リスト / `text` の型) まで測られなくなるので、検査を持たない形にした。
  const allowed: readonly unknown[] = roles;
  const out: T[] = [];
  for (const item of arrayOf(value, isRecord)) {
    if (!allowed.includes(item.role) || typeof item.text !== 'string') continue;
    const msg: Record<string, unknown> = { role: item.role, text: item.text };
    for (const [key, read] of Object.entries(readers) as [string, (v: unknown) => unknown][]) {
      if (!Object.hasOwn(item, key)) continue;
      const got = read(item[key]);
      if (got !== undefined) msg[key] = got;
    }
    out.push(msg as T);
  }
  return out.slice(-max);
}

/**
 * 画面に札として出す短い文字列 (「via …」「🪪 …」)。文字列でなければ・空なら読めない。
 * 長さは `displayField` の天井 (256 字) で切る —— 保存値は型だけでなく長さも守らない。
 */
export function storedLabel(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return displayField(value);
}

/** 真のときだけ意味を持つ印 (`offline` ほか)。`true` 以外は「無い」と同じなので落とす。 */
export function storedTrue(value: unknown): true | undefined {
  return value === true ? true : undefined;
}

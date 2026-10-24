import { COLLECTION_SHAPES, hasCollectionShape } from '../data/collectionShapes';

/**
 * **形の判定 (`COLLECTION_SHAPES`) が拒む行を、形自身の欄の一覧から導く** ——
 * 手書きの候補表だと、たまたま当たらなかった collection が「拒めない」に見える
 * (パス 360 の最初の計測がそれで `highlight-settings` を取り違えた)。
 *
 * ここは `__tests__/` の中の**検査ではない**ファイル (`jsdomWait.ts` /
 * `recordStoreHarness.ts` と同じ形)。2026-09-23 (パス 432) まで
 * `malformedStoreRenders.test.ts` の中に在り、2 本目の読み手
 * (`restorePlanMatchesImport.test.ts`) が要ったので出した ——
 * 検査ファイルから import すると、その describe が 2 度登録される。
 */
/** 形の判定が拒む行 —— 4 通りの壊し方。 */
export type Family = 'missing' | 'wrong-type' | 'wrong-type-str-all' | 'wrong-type-num-all';

/** 4 家系ぜんぶ (`it.each` と床が同じ 1 つを読む —— 家系を 2 か所に書かない)。 */
export const FAMILIES: readonly Family[] = ['missing', 'wrong-type', 'wrong-type-str-all', 'wrong-type-num-all'];

/**
 * **全欄**に同じ型違いの値を置いた行。`wrongTypedRow` が「最初に拒まれた 1 欄」しか
 * 壊さないので、並びの後ろの欄 (販売記録の `note` など) に当たらない —— パス 417 の
 * 欠陥はそこに居た。2 方向要る: **数の欄に文字列**を置くと `.toFixed` が、
 * **文字列の欄に数**を置くと `.trim` / `.slice` が落ちる。
 */
export function allFieldsRow(collection: string, v: unknown): Record<string, unknown> | null {
  const shape = COLLECTION_SHAPES[collection];
  if (shape === undefined) return null;
  const row: Record<string, unknown> = {};
  for (const field of shape.fields) row[field] = v;
  return hasCollectionShape(collection, row) ? null : row;
}

/**
 * 欄が在って型が違う行を、**形自身の欄の一覧から導く** (手書きの候補表だと、
 * たまたま当たらなかった collection が「拒めない」に見える —— パス 360 の
 * 最初の計測がそれで `highlight-settings` を取り違えた)。
 *
 * `Symbol` は入れない —— IndexedDB の structured clone が通さないので、
 * **保存値として存在し得ない** (実測: `DataCloneError`)。
 */
export function wrongTypedRow(collection: string): Record<string, unknown> | null {
  const shape = COLLECTION_SHAPES[collection];
  if (shape === undefined) return null;
  const sentinels: unknown[] = ['bad', -1 / 0, null, true, { z: 1 }, [1]];
  for (const field of shape.fields) {
    for (const v of sentinels) {
      const row = { [field]: v } as Record<string, unknown>;
      if (!hasCollectionShape(collection, row)) return row;
    }
  }
  return null;
}

/** その壊し方で実際に拒まれる行 (拒まれないなら `null` = その collection は対象外)。 */
export function malformedRow(collection: string, family: Family): Record<string, unknown> | null {
  if (family === 'missing') return hasCollectionShape(collection, {}) ? null : {};
  if (family === 'wrong-type-str-all') return allFieldsRow(collection, '1000');
  if (family === 'wrong-type-num-all') return allFieldsRow(collection, -987654.321);
  return wrongTypedRow(collection);
}

/**
 * **正しい行 + 1 欄だけ壊した行** (2026-09-24 · パス 441)。
 *
 * 上の 4 家系はどれも**行の全欄**を壊す (`{}` / 最初に拒まれた 1 欄 / 全欄に文字列 /
 * 全欄に数)。**「正しい日付 + 1 欄だけ壊れている」という一番現実的な形がどれにも無く**、
 * パス 417 の欠陥 (販売記録のメモが非文字列で売上集計と経営サマリーが投げる) は
 * そこに居た —— 対照で測ると `malformedStoreRenders.test.ts` は **9 件すべて緑のまま**
 * だった (`allFieldsRow` が `date` も壊すので `readableSalesRows` が読む前に行が落ちる)。
 *
 * 正しい行の側は `data/__tests__/collectionSamples.ts` の標本を使う ——
 * **形の台帳と両方向に突き合わされている**ので、23 個目の collection が
 * 足された日はそちらが先に落ちる (パス 439)。
 *
 * 値は **6 形**要る。文字列と数の 2 形だけでは足りないことを実測した (パス 441):
 * `.trim` / `.toFixed` を落とすのは数と文字列だが、**物と配列は JSX が
 * 「Objects are not valid as a React child」で落とす**し、`null` は
 * `?? ` を通り抜けた先で `.trim` を落とす —— どれも別の壊れ方で、
 * **どれも保管層に実在しうる** (`structuredClone` が通す値である)。
 * 形が受けてしまう組 (任意の欄で型が合う等) は `null` を返して母集団から外す。
 */
export const ONE_FIELD_VALUES: readonly [string, unknown][] = [
  ['str', '1000'],
  ['num', -987654.321],
  ['obj', { z: 1 }],
  ['arr', [1]],
  ['bool', true],
  ['null', null],
];

export function oneFieldRow(
  collection: string,
  field: string,
  value: unknown,
  good: Record<string, unknown>,
): Record<string, unknown> | null {
  const shape = COLLECTION_SHAPES[collection];
  if (shape === undefined) return null;
  if (!shape.fields.includes(field)) return null;
  const row = { ...good, [field]: value };
  return hasCollectionShape(collection, row) ? null : row;
}

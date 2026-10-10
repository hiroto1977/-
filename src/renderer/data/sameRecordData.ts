/**
 * 2 つの記録の中身 (`data`) が同じか —— 「欄を開いた時の中身のままか」を決める判定 (2026-09-27 · パス 499)。
 *
 * 呼ぶのは `store.ts` の `updateIfUnchanged` ただ 1 つで、そこが「書いてよいか」を決める。
 * だから**向きの非対称**を持つ:
 *
 * | 誤り | 起きること |
 * | --- | --- |
 * | 違う物を「同じ」と言う | 別のタブの書き換えを**黙って上書きする** (直している欠陥そのもの) |
 * | 同じ物を「違う」と言う | 保存を断る。断りの文が「もう一度押せば上書き」と言うので、**2 度押せば通る** |
 *
 * 前者は取り返せず、後者は 1 手で済む —— **迷ったら「違う」へ倒す**。
 *
 * ## 何を比べるか
 *
 * 保管層の約束は「値は plain JSON (structured-clone できる物)」(`store.ts` の冒頭)。
 * 比べるのはその範囲で、**構造の同一性**を見る:
 *
 *  - 素の値 (文字列・数・真偽・null・undefined) は `Object.is` ——
 *    **自分自身とは必ず同じ**でなければならない (`NaN === NaN` は false なので、
 *    `===` で比べると NaN を持つ記録は**何度押しても「違う」になり、永久に保存できない**)。
 *  - 配列は長さと要素を順に。
 *  - 素のオブジェクトは**鍵の集合**と各値。鍵の**順序は見ない** —— 同じ中身でも
 *    書き方で順序は変わりうる (`{...existing.data, ...patch}` は patch に無い鍵を先に並べる)。
 *  - **それ以外 (Date・Map・クラスの実体・関数) は「違う」** —— 鍵を持たない Date 2 つを
 *    鍵の集合で比べると、日時が違っても「同じ」になる (上の表の 1 行目)。保管層は
 *    そういう値を受けない約束なので、ここへ来たら約束の外であり、倒す向きは「違う」である。
 *
 * 保証すること (検査が持つ): **保管層から読んだ物は、その structured clone と必ず「同じ」**
 * —— そうでなければ、誰も触っていない記録の保存が永久に断られる。
 */
export function sameRecordData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => sameRecordData(v, b[i]));
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((k) => Object.hasOwn(b, k) && sameRecordData(a[k], b[k]));
}

/** 素のオブジェクト (リテラル / `Object.create(null)`) か。配列は呼ぶ前に分けている。 */
function isPlainObject(v: object): v is Record<string, unknown> {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * **孤立サロゲートを自分で判定する。** (2026-09-13 · パス 195 / 2026-09-14 · パス 252 で 1 つにまとめた)
 *
 * `String.prototype.isWellFormed()` (ES2024) はこの tsconfig の `lib` に無く、
 * 出荷先のブラウザにも在るとは限らない。**「割れていない」の意味をここで書く** ——
 * 上位半分 (U+D800–U+DBFF) の直後は必ず下位半分 (U+DC00–U+DFFF)、
 * 下位半分が単独で現れてはいけない。
 *
 * 2026-09-14 まで同じ関数が `inputCeiling.test.ts` と `safeErrorMessage.test.ts` に
 * **2 つ**在り、パス 252 が 3 つ目を書きかけた (`isWellFormed` を使って `tsc` に
 * 止められた)。判定の道具は検査ではないので、ここへ出す。
 */
export function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : -1;
      if (next < 0xdc00 || next > 0xdfff) return true;
      i++; // 対で消費する
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true; // 下位半分が単独で来た
    }
  }
  return false;
}

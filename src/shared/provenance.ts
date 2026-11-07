/**
 * **出典の強さ** —— 「どこまで確かめたか」を型で持つための語彙。
 *
 * 2026-08-27 に `talent.ts` で導入した。動画・書籍・記事から取った主張を
 * 社内基準として配るとき、**確かめた物と読み解いた物を混ぜない**ための区別で、
 * 画面にも札として出る。曖昧なまま配られると困るので、落とせない形にしてある。
 *
 * ここへ切り出したのは 2026-08-29 —— 2 つ目の利用者 (動画の取り込み) が
 * できたため。それまで `talent.ts` が定義を持ち、`TalentPage.tsx` が**同じ
 * union を書き写していた**。判定の本体が写っていないことは
 * `talentParity.test.ts` が留めていたが、**語彙が写っていることは誰も見て
 * いなかった** —— 「同じ判断の 2 実装」を探していて、型は数えていなかった。
 *
 * ## それぞれの意味
 *
 * - `confirmed` —— 本人の発言・原文に当たって確かめた。逐語の引用が取れる。
 * - `secondary` —— 第三者の解説で確認した。原文には当たれていない。
 * - `gloss`     —— **当方の読み解き**。原文にその言い方は無い。
 *
 * `gloss` を軽く見ないこと。2026-08-27 に組織病 3 件の語釈を名前から推測で
 * 書き、**3 つとも間違っていた**。読み解きは読み解きとして出す。
 */
export type SourceStrength = 'confirmed' | 'secondary' | 'gloss';

/** 強い順。並べ替えや「これ以上弱いものは載せない」の判定に使う。 */
export const SOURCE_STRENGTH_ORDER: readonly SourceStrength[] = ['confirmed', 'secondary', 'gloss'];

/** 未知の文字列を受け付けない。取り込み経路 (外から来る JSON) で使う。 */
export function isSourceStrength(v: unknown): v is SourceStrength {
  return typeof v === 'string' && (SOURCE_STRENGTH_ORDER as readonly string[]).includes(v);
}

/**
 * `a` は `b` と同じかそれより強いか。
 *
 * 「この節には `secondary` 以上しか載せない」のような下限を書くための述語。
 * 添字の大小で比べる —— **`SOURCE_STRENGTH_ORDER` が並び順の唯一の出典**で、
 * ここに二つ目の順序表を作らない。
 */
export function atLeastAsStrong(a: SourceStrength, b: SourceStrength): boolean {
  return SOURCE_STRENGTH_ORDER.indexOf(a) <= SOURCE_STRENGTH_ORDER.indexOf(b);
}

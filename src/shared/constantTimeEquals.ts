/**
 * 秘密の文字列どうしの**定時間**比較 —— アプリ全体で 1 つだけ持つ
 * (2026-09-20 · パス 331)。
 *
 * ## なぜ 1 つに寄せるか
 *
 * 2026-09-20 まで同じ判定が **main と renderer に 1 つずつ**在った
 * (`main/oauth.ts` と `renderer/oauth/pkce.ts` の `safeStateEquals`)。
 * renderer 側の docblock はそれを
 * 「Equivalent to `oauth.ts:safeStateEquals` (main process); we reimplement
 *  here because main↔renderer can't share modules.」
 * と説明していたが、**2 つとも偽である**:
 *
 * 1. **共有できる。** `src/shared/` は両ビルドが読む —— このリポジトリの
 *    構造そのもので、CLAUDE.md も「両ビルドに同じ判定を 2 度書かない」と
 *    規約に書いている。
 * 2. **等価ではない。** main は `Buffer.from(s, 'utf8')` に変換してから
 *    `timingSafeEqual` に渡す。UTF-8 への変換は**孤立サロゲートを
 *    すべて U+FFFD へ潰す**ので、`'\uD800'` と `'\uDC00'` は
 *    **別の文字列なのに main では等しい**と答える。実測 (2026-09-20):
 *
 *    ```
 *      サロゲート帯を跨ぐ 1 文字の総当たり  4,330,561 組 → 食い違い 4,192,256 組 (96.8%)
 *      base64url の字だけ                      4,096 組 → 食い違い         0 組
 *    ```
 *
 * **今日この差から攻撃は成立しない。** 比較の片側 (`expectedState`) は
 * 必ずこのアプリが作った base64url で、孤立サロゲートを含みえないからである。
 * 直す理由は、**守りの正しさが「片側は必ず自分が作った値」という別の前提に
 * 依っている**ことと、1 つに寄せれば前提ごと不要になることである
 * (パス 291 / 325 と同じ家系)。
 *
 * ## なぜ `timingSafeEqual` を使わないか
 *
 * `node:crypto` の `timingSafeEqual` はブラウザに無いので、共有するなら
 * どちらかに揃える必要がある。**バイト列へ変換する側は上記のとおり
 * 別の文字列を等しいと答える**ので、揃える先は UTF-16 コード単位を
 * そのまま XOR する側にした —— こちらは潰れが無く、かつ
 * **早期 return が無い**ので定時間性は同じである。
 * `docs/SECURITY_AUDIT.md` の P1-5 が求めているのは「定時間比較」であって
 * 特定の API ではない (原文も「防御深層原則として `timingSafeEqual` 推奨」)。
 *
 * ## 長さで早期に返してよい理由 —— **両ビルドの実測値を書く**
 *
 * 長さの不一致で即 false を返すと、長さは漏れる。漏れてよいのは
 * 長さが秘密でないときだけで、このアプリの `state` は固定長である:
 *
 * ```
 *   main     `base64url(randomBytes(16))`              → 22 字 (128 bit)
 *   renderer `base64UrlEncode(getRandomValues(32))`    → 43 字 (256 bit)
 * ```
 *
 * **この 2 行は 2026-09-20 に測って書いた。** それまで main の注記は
 * 「state は 32 バイト乱数の base64url で固定長」と書いていたが、
 * main の実物は **16 バイト**である —— renderer 側の注記 (そちらでは正しい)
 * が写され、写した先の値と突き合わせられていなかった。結論
 * (固定長だから長さは秘密でない) は両方で成り立つが、**根拠として
 * 挙げた数が実物と違っていた**。
 *
 * 2 つの版で byte 数が違うことに理由は書かれていない。どちらも CSRF の
 * state として十分 (128 bit 以上) なので**値は動かしていない**。
 * 隣に在った同じ形 (`MAX_RESPONSE_BYTES` が 2 MiB / 10 MiB に割れていた) は
 * 2026-09-20 (パス 336) に実測して **2 MiB へ揃えた** ので、
 * 「分かる人が決めること」として残っているのはこの乱数の byte 数だけである。
 */

/**
 * `a` と `b` が等しいか。**長さが同じなら、内容による時間差を作らない。**
 *
 * 長さが違えば即 false (上記のとおり長さは秘密ではない)。長さが同じなら
 * **全コード単位を必ず走査する** —— 途中で return しない。
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  // Stryker disable next-line EqualityOperator: 長さが等しいことは上で確認済みなので、
  // 1 つ余分に回っても両側とも `charCodeAt(len)` が NaN になり `NaN ^ NaN === 0` で
  // diff が変わらない (等価変異)。境界を 1 つ越えても結果は同じ。
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

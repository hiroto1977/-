/**
 * **ヘッダ値になれる文字列か** — WHATWG Fetch の `Headers` が実際に課す規則を 1 か所に置く。
 *
 * 2026-09-16 (パス 296) まで、この知識はアプリの中で **3 通りに割れていた**:
 *
 * | 場所 | 規則 | 落としていた物 |
 * |---|---|---|
 * | `renderer/network/proxy.ts` (応答側・パス 295) | Latin1 かつ NUL/CR/LF なし | — |
 * | `shared/tokenInput.ts` (資格情報の入口) | C0/DEL なし | **非 Latin1** |
 * | `shared/proxyEndpoint.ts` (共有秘密) | 型と長さだけ | **全部** |
 *
 * そして**どれも「黙って剥がされる」を見ていなかった**。`Headers` は 2 つのことをする:
 *
 * 1. **ByteString (Latin1 = 0x00-0xff) を要求する。** 非 Latin1 (≥0x100) は
 *    `Cannot convert argument to a ByteString because the character at index N has a
 *    value of 12354 which is greater than 255` を投げる。`[^\r\n\0]` のような
 *    「CR/LF/NUL でなければ良い」規則はこれを通すので、**関門は通るのに送れない**。
 * 2. **前後の HTTP 空白 (0x09 TAB / 0x0a LF / 0x0d CR / 0x20 SP) を黙って落とす。**
 *    つまり値は受理されるが、**保存した物と送る物が違う**。実測で 8 例中 4 例
 *    (末尾 LF・先頭空白・末尾 TAB・末尾 CR) がこれに当たり、末尾 LF は
 *    ファイルや端末から貼ったときに最も普通に混ざる形である。
 *
 * だから呼び出し側は **`normalizeHeaderValue` → `isHeaderValue` の順**に通す。
 * 正規化してから検査すると、プラットフォームの振る舞いをそのまま写せる:
 * 末尾の LF は落ちて通り (`Headers` も通す)、**途中**の CRLF は残って弾かれる
 * (`Headers` も投げる)。`headerValue.test.ts` がこの一致を実物の `new Headers()`
 * と表で突き合わせている —— 規則を人が言い直すのではなく、機械に照合させる。
 *
 * 正規表現の文字クラスで書くと eslint の `no-control-regex` に当たる。
 * `shared/controlChars.ts` が既に「ルールを黙らせるより、走査で同じことをする方が
 * 読み手にも明確」と決めているので、ここも走査で書く (パス 295 が置いた
 * `eslint-disable-next-line` はこの共有で消えた)。
 */

/**
 * ヘッダ**名**として使えるか — RFC 9110 の token。
 *
 * 規則そのものはパス 295 より前から `renderer/network/proxy.ts` に在り、実測すると
 * **ASCII 全域 + 非 ASCII 4 例の 132 符号位置すべてでプラットフォームと一致していた**
 * (食い違い 0)。つまり名前側は元から正しく、値側だけが誤っていた。
 *
 * それでもここへ移したのは、**一致を留めている物が何も無かった**から。値と同じ表で
 * `new Headers()` と突き合わせれば、名前の側を将来ずらしたときにも鳴る。
 */
const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function isHeaderName(name: string): boolean {
  return HEADER_NAME_RE.test(name);
}

/** `Headers` が前後から黙って落とす HTTP 空白 (WHATWG Fetch の定義)。 */
const HTTP_WHITESPACE = new Set([0x09, 0x0a, 0x0d, 0x20]);

/**
 * `Headers` が**実際に送る**形へ揃える — 前後の HTTP 空白を落とす。
 *
 * `String.prototype.trim()` ではない: trim は Unicode 空白すべてを落とすので、
 * `Headers` が保つ NBSP (U+00A0・Latin1) まで消してしまう。ここが写すのは
 * プラットフォームの規則そのものであって、似た規則ではない。
 */
export function normalizeHeaderValue(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && HTTP_WHITESPACE.has(value.charCodeAt(start))) start += 1;
  while (end > start && HTTP_WHITESPACE.has(value.charCodeAt(end - 1))) end -= 1;
  return value.slice(start, end);
}

/**
 * `Headers` がこの値を受理するか — Latin1 (0x00-0xff) で、NUL/CR/LF を含まないこと。
 *
 * コード単位で走査する: サロゲート対は 0xd800-0xdfff の 2 単位になり、どちらも
 * 0x100 以上なので絵文字は弾かれる (`Headers` も弾く)。`codePointAt` を使うと
 * 戻り値が `number | undefined` になり、到達しない分岐が 1 つ増える。
 */
export function isHeaderValue(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c > 0xff) return false;
    if (c === 0x00 || c === 0x0a || c === 0x0d) return false;
  }
  return true;
}

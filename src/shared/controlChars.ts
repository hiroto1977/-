/**
 * 制御文字の判定 — アプリ全体で 1 つだけ持つ。
 *
 * 利用者が入れた URL を解析する前に落とすために使う。制御文字は
 * ヘッダや URL の分断に使われうるので、`new URL()` に渡す前に弾く。
 *
 * 独立した小さなモジュールにしてあるのは、**同じ判定が 2 つ目を作りかけた**
 * ため。`shared/atlassianSite.ts` が持っていたものを `shared/aiEndpoint.ts` が
 * 書き直そうとして、この形（同じ判断の写経）が今セッションだけで
 * エスケープ・色・エスケープ再びと繰り返し出ていることに合わせて共有した。
 * 「0x1f まで」か「0x20 未満」か、0x7f を入れるか — どれも一見して差が
 * 出ないので、片方だけ緩んでも気付けない。
 *
 * 正規表現の文字クラスで書くと eslint の `no-control-regex` に当たる。
 * ルールを黙らせるより、走査で同じことをする方が読み手にも明確。
 */
export function hasControlChar(s: string): boolean {
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

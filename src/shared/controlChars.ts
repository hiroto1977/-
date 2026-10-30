// 生成物 —— src/shared/controlChars.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
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
 *
 * ## Mamori で書いてある (2026-10-30 · パス 564)
 *
 * 元は TypeScript で、Mamori 0.3 (16 進の数) を足して書き直した。判定は 1 つも変えていない。
 * ここに効く規則は M0 と M6 —— 制御文字の関門から `as`・`.constructor`・宣言していない外の名前が書けない。
 */

/** 制御文字 (C0 と DEL) を 1 つでも含むか。 */
export function hasControlChar(s: string): boolean {
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

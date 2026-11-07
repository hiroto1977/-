/**
 * **WebCrypto が使えないときに、利用者が次の手を打てる 1 文** (2026-09-12 · パス 169)。
 *
 * ## 実測した欠陥
 *
 * `SettingsPage` の Google OAuth の節は `await generatePkce()` を**素のまま**呼んでいた。
 * `onClick={start}` は `async` なので、`generatePkce` が投げると**拒否が宙に浮き、画面には
 * 何も出ない** —— ボタンを押しても文が 1 つも増えず、認可 URL も出ず、一時秘密も作られない。
 * 実測 (2026-09-12): 押した後の画面の文は 1 段目のまま・`openExternal` 0 回・
 * `readPkceSession()` は `null`。**押しても何も起きないボタン**である。
 *
 * 厄介なのは、**その 2 行下に同じ守りが既に在った**こと —— パス 157 が
 * `savePkceSession` について「投げたまま抜けると拒否が宙に浮き画面には何も出ない」と
 * 書いて `try/catch` を付けている。**隣の `await` は素のまま残っていた** (パス 66 / 168 と
 * 同じ「母集団のうち 1 か所だけ直す」形)。
 *
 * ## なぜ「暗号が使えない」が起きるのか
 *
 * `crypto.subtle` は**安全なコンテキスト (secure context) でしか存在しない**。
 * ブラウザ版は単一 HTML なので置き方が自由で、`https://` / `localhost` /
 * ファイルを直接開く場合は在るが、**平文の `http://` で社内サーバや LAN の IP から
 * 配ると `crypto.subtle` は `undefined`** になり、触った時点で `TypeError` になる。
 *
 * そのとき出る素の文は `Cannot read properties of undefined (reading 'digest')` で、
 * 内部 API の名前しか言わない —— 読んだ人に打てる手が無い。ここは
 * **何が使えないのか・どうすれば使えるのか**を 1 文で言う。
 *
 * ## 置き場所について
 *
 * いまの読み手は `SettingsPage` (OAuth の節) だけ。`LockScreen` も同じ理由で
 * 素の `TypeError` を見せうるが、あちらは**完全性チェーンの保護対象**なので、
 * 配線は台帳を採掘する別のパスで行う (この文面はそのとき共有される)。
 */

/** `crypto.subtle` が使えるか。**触らずに見る** —— 触ると投げる形で欠けている。 */
function hasSubtle(): boolean {
  const c = (globalThis as { crypto?: { subtle?: unknown } }).crypto;
  if (c == null) return false;
  // `subtle` が在っても `digest` が無い実装 (古い WebView) を「在る」と言わない。
  const s = c.subtle as { digest?: unknown } | undefined;
  return s != null && typeof s.digest === 'function';
}

/**
 * WebCrypto が使えない理由 (使えるなら `null`)。
 *
 * 文は**原因の候補と次の手**を持つ。原因を 1 つに断定しないのは、
 * ここから分かるのは「無い」ことだけで、なぜ無いかは端末の事情だから。
 */
export function webCryptoUnavailableReason(): string | null {
  if (hasSubtle()) return null;
  return (
    'この端末のブラウザでは暗号処理 (WebCrypto) が使えないため、この操作はできません。'
    + '平文の http:// で開いている場合は、https:// か localhost、'
    + 'またはファイル (standalone.html) を直接開く形にすると使えるようになります。'
  );
}

/**
 * 暗号処理の失敗を、画面に出す 1 文にする。
 *
 * **WebCrypto そのものが無いときは、その説明を優先する** —— 素の
 * `TypeError: Cannot read properties of undefined` は内部 API の名前しか言わない。
 * 在るのに失敗したときは、原因が端末側とは限らないので**元の文も残す**
 * (消すと調べる手がかりが無くなる)。
 */
export function describeCryptoFailure(e: unknown): string {
  const missing = webCryptoUnavailableReason();
  if (missing !== null) return missing;
  const detail = e instanceof Error ? e.message : String(e);
  return `暗号処理に失敗しました: ${detail}`;
}

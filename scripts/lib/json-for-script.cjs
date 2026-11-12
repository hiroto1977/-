'use strict';

/*
 * jsonForScript — safely embed a JS value inside an inline <script> block.
 *
 * `JSON.stringify` does NOT escape `<`, so any dataset string containing
 * `</script>` terminates the inline script early: the rest of the JSON spills
 * into the DOM as markup and the page's JS dies — the "a wall of code instead of
 * the app" failure this repo already hit once via inject-pwa (2026-07). Escaping
 * `<` as `<` keeps the value byte-identical at runtime (a JS string literal
 * `<` IS `<`) while making the sequence invisible to the HTML tokenizer.
 * `\u2028` / `\u2029` are escaped too: they are valid JSON but illegal raw in a
 * JS string literal in older parsers.
 *
 * Also exposes `replaceToken`, because `String.prototype.replace(str, str)`
 * interprets `$&`, `$1`, `` $` `` … in the replacement — a dataset value
 * containing `$&` would silently corrupt the embedded JSON. Passing a function
 * disables that substitution entirely.
 */

/** JSON-serialize `value` for safe inclusion in an inline <script>. */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Replace `token` in `source` with `value`, never interpreting `$` patterns. */
function replaceToken(source, token, value) {
  if (!source.includes(token)) {
    throw new Error(`replaceToken: ${token} が見つかりません`);
  }
  return source.replace(token, () => value);
}

/**
 * インラインの `<script>` に**コード**を埋めるときの退避。
 *
 * `jsonForScript` はデータ (JSON) 用で、`<` を `\u003c` にする。埋めるのが
 * **コード**のときはそれができない —— JSON 文字列ではないので `\u003c` は
 * ただの 6 文字になる。代わりに `</script` の `/` を `\/` にする。
 * JS の文字列リテラル・正規表現・コメントのどこに現れても意味は変わらず
 * (`\/` は識別エスケープ)、HTML のトークナイザからは `</script` に見えなくなる。
 *
 * **なぜここに置くか**: この 1 行はデモ生成器 3 本に**同じ形で写されていた**
 * (`build-research-demo` / `build-deliberation-demo` / `build-counseling-demo`)。
 * 2026-08-24 に数えたら、写しの無い生成器が 1 本あった
 * (`build-integration-demo` —— 埋めているのが補間ゼロの静的コードなので
 * **今は**要らない)。次に生成器が増えたとき写し忘れるのが目に見えているので、
 * データ側の退避と同じ場所へ寄せる。
 */
function scriptSafeJs(js) {
  // 一致した字面をそのまま戻す。写されていた実装は置換先を小文字で
  // 固定していたので、`</SCRIPT>` を含む**文字列リテラルの中身が
  // 小文字に化けていた** (2026-08-24 に寄せる過程で判明)。
  // 置換は関数形にする —— 文字列形だと `$&` が特別扱いされる。
  return String(js).replace(/<(\/script)/gi, (_m, tag) => `<\\${tag}`);
}

/** Convenience: replace `token` with `jsonForScript(value)`. */
function replaceJsonToken(source, token, value) {
  return replaceToken(source, token, jsonForScript(value));
}

module.exports = { jsonForScript, scriptSafeJs, replaceToken, replaceJsonToken };

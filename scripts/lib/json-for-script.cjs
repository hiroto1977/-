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

/** Convenience: replace `token` with `jsonForScript(value)`. */
function replaceJsonToken(source, token, value) {
  return replaceToken(source, token, jsonForScript(value));
}

module.exports = { jsonForScript, replaceToken, replaceJsonToken };

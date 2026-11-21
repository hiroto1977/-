'use strict';

/**
 * **`escapeMarkdownInline` の逆** (2026-09-26 · パス 484)。
 *
 * チャットボットは要望を `- [ ] ${escapeMarkdownInline(text)} _(受付: …)_` の形で
 * 書き出す (`ChatbotWidget.tsx` の `requestsMarkdown`)。取り込み口
 * (`orchestrate.cjs import-requests`) は 2026-09-26 まで**書き出した綴りをそのまま**
 * 題名にしており、利用者が打った文と台帳の題名が別物になっていた。
 * 実測 (書き出し → 取り込みの往復): **10 標本のうち 6 標本が変わり、うち 4 標本は
 * 書き出しの逃がしが残った形** (下の 4 行)。残る 2 標本 —— 改行が空白になる・前後の空白が
 * 落ちる —— は題名が 1 行であることによる意図した正規化で、直した後も変わる:
 *
 * ```
 *   A|B の切替が欲しい          → A\|B の切替が欲しい
 *   C:\Users\me のパスを覚えて  → C:\\Users\\me のパスを覚えて
 *   <b>太字</b> で出して         → &lt;b>太字&lt;/b> で出して
 *   末尾が \                    → 末尾が \\
 * ```
 *
 * 取り込み口は `.cjs` で `shared/escape.ts` を読めないので、逆はここに 1 つ置き、
 * **往復の一致は `importRequestsPath.test.ts` が本物の書き出し (`requestsMarkdown`) を
 * 通して**縛る (写しを縛るパリティ検査の形 · パス 418 / 452)。
 *
 * ## 何を戻すか
 *
 * `escapeMarkdownInline` は 4 つの変換をする —— `\` → `\\` / `|` → `\|` /
 * 改行 → 空白 / `<` → `&lt;`。戻せるのは 3 つで、**左から 1 度だけ**読む:
 *
 * - `\\` → `\`、`\|` → `|` —— 書き出しは `\` を必ず 2 字にするので、書き出した綴りの
 *   `\` は必ず組の頭である。組にならない `\` (手で書いた行) はそのまま残す。
 * - `&lt;` → `<`
 * - 改行は戻さない —— 題名は 1 行である (空白のまま)。
 *
 * ## 戻せない形が 1 つ在る (正直に書く)
 *
 * 書き出しは `&` を逃がさない (`escape.test.ts` が理由を持つ —— 実体参照は CommonMark で
 * 文字として描かれるので、逃がすと素の viewer で `&amp;` が見えるだけ損)。
 * そのため**利用者が `&lt;` と 4 字で打った文**と `<` と打った文は同じ綴りになり、
 * 取り込むと `<` に戻る。検査はこの 1 形を「既知の単射でない形」として標本に留める。
 *
 * @param {string} s 書き出した綴り (1 行)
 * @returns {string} 利用者が打った文
 */
function unescapeMarkdownInline(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];
    if (c === '\\' && (next === '\\' || next === '|')) {
      out += next;
      i += 2;
    } else if (c === '&' && s.startsWith('&lt;', i)) {
      out += '<';
      i += 4;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

module.exports = { unescapeMarkdownInline };

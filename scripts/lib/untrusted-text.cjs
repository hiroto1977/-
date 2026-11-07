'use strict';

/**
 * **外から来た 1 行の文を、端末と台帳へ渡す前に検める** (2026-09-26 · パス 484)。
 *
 * `orchestrate.cjs import-requests` は、チャットボット (AI コンシェルジュ) が書き出した
 * 要望の Markdown を読み、1 行を 1 つの backlog の題名にする。その Markdown は
 * **人へ渡る前提の成果物**で (`ChatbotWidget.tsx` の `downloadRequests`)、取り込む側から
 * 見れば**外から来たファイル**である —— 取り込み口は信用の境界にあたる。
 *
 * ## 何が起きていたか (実測 2026-09-26)
 *
 * chromium の `<input type="text">` は、貼り付け (`insertText`) で入った ESC (U+001B)・
 * BEL (U+0007)・RLO (U+202E) を**そのまま値に残す** (実測 —— 落とすのは改行だけ)。
 * チャットボットは `text.trim()` しか掛けずに記録し、書き出しの `escapeMarkdownInline`
 * はそれらに触れない。取り込み口はそれを**素のまま**端末へ刷り、台帳へ書き、
 * `dispatch` がまた刷っていた (直す前の HEAD で、この 1 行を取り込んで測った):
 *
 * ```
 *   要望 ESC ]0;PWNED BEL ESC [2K 隠す RLO 逆
 *     import-requests --dry-run   → 端末へ素の ESC 2 / BEL 1 / RLO 1 (窓の題名を書き換え・行を消す)
 *     (割当先が決まらない断り)     → 断りの文が要望を引用し、同じく素の ESC 2 / BEL 1 / RLO 1
 *     import-requests             → exit 0。台帳の題名に入る (ESC / BEL は JSON の \u001b /
 *                                   \u0007 として、RLO は素のまま) —— 門は exit 0 だった
 *     dispatch                    → 題名を 2 か所 (論点の行と Agent の成果物) に刷り、
 *                                   素の ESC 4 / BEL 2 / RLO 2
 * ```
 *
 * ★ **`lint:charset` はこの台帳の ESC を見ない** —— ファイルの字を読むゲートなので、
 * `JSON.stringify` が `\u001b` という 6 字の綴りへ逃がした C0 は映らない (実測: RLO は
 * `registry.json:8297` で鳴るが、ESC と BEL だけの題名では exit 0)。だから台帳の題名は
 * 宣言の `pattern` と門が持ち、端末は刷る口が持つ —— どれも「ファイルの字」には頼らない。
 *
 * 端末の制御列 (CWE-150) は、取り込みを確かめている開発者の画面を書き換えられる ——
 * 行を消して「取り込んだ物」を見えなくする・窓の題名やクリップボード (OSC 52 を
 * 許す端末) を書き換える。RLO は表示の向きを反転させ、読める物と台帳に在る物を別にする
 * (`lint:charset` が Trojan Source として落とす当の字)。
 *
 * ## 字の群は 1 つ
 *
 * 危ない字の群は `lint:charset` の `INVISIBLE_RANGES` を**そのまま**使う (C0/DEL・C1・
 * 双方向制御・不可視文字) —— 写すと「ゲートが鳴らす字」と「取り込み口が断る字」が
 * 別々に古びる。ただし 1 行の文では **Tab / LF / CR も通さない** (`lint:charset` は
 * ソースのために Tab と LF を意図して外している)。ZWJ / ZWNJ は絵文字の連結に要るので
 * 通す (`lint:charset` と同じ判断)。
 *
 * 台帳の宣言 (`orchestration/registry.schema.json` の backlog の題名の `pattern`) は
 * JSON なのでこの群を読めず、同じ集合を字で書いている。**その写しは
 * `registrySchemaEnforced.test.ts` が BMP の全コードポイントで突き合わせる**。
 */

const { INVISIBLE_RANGES } = require('../lint-charset.cjs');

/** 1 行の文には現れない字 (lint:charset はソースのため Tab と LF を外している)。 */
const LINE_BREAKS_AND_TAB = { name: '改行・タブ (1 行の文には現れない)', re: /[\t\n\r]/g };

/** 危ない字の群。すべて `g` つき —— `.test()` では使わない (lastIndex を持ち越す)。 */
const UNSAFE_GROUPS = [...INVISIBLE_RANGES, LINE_BREAKS_AND_TAB];

const hex = (c) => c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');

/**
 * 文が含む危ない字を群ごとに返す (空の配列なら安全)。
 *
 * `String#match` は `g` つきの正規表現なら毎回 0 から数え直すので、群の正規表現を
 * 使い回してよい (`RegExp#test` は lastIndex を持ち越すので使わない)。
 *
 * @param {string} text
 * @returns {{ name: string, codePoints: string[] }[]}
 */
function unsafeCharsIn(text) {
  const found = [];
  for (const { name, re } of UNSAFE_GROUPS) {
    const m = String(text).match(re);
    if (m) found.push({ name, codePoints: [...new Set(m)].map((c) => `U+${hex(c)}`) });
  }
  return found;
}

/**
 * 端末へ出す前に、危ない字を**見える形** (`\u{1B}`) へ置き換える。
 *
 * 台帳の題名は門 (`verify:orchestration`) がこの群を通さないので、門を通った台帳から
 * 読む文は置き換える物を持たない —— それでも刷る所では必ず通す。`dispatch` は門を
 * 走らせずに台帳を読むので、手で書き換えた台帳でも端末は守る。
 *
 * @param {unknown} text
 * @returns {string}
 */
function printable(text) {
  let out = String(text);
  for (const { re } of UNSAFE_GROUPS) out = out.replace(re, (c) => `\\u{${hex(c)}}`);
  return out;
}

/**
 * **複数行の文を端末へ刷る形** —— 改行 (LF) だけは行の区切りとして残し、他の危ない字は
 * `printable` と同じく見える形へ。
 *
 * **端末へ刷る口 (`orchestrate.cjs` の `say` / `die`・`verify-orchestration.cjs` の
 * `say` / `fail`) はすべてここを通る** (2026-09-26 · パス 484)。台帳の欄ごとに
 * `printable` を掛ける形だと、刷る欄が 1 つ増えた日にその欄だけが素で出る ——
 * 実測で、題名と成果物にだけ `printable` を掛けた `dispatch` は、管理職の `title` に
 * 入れた ESC を**素で 1 つ**刷っていた。守るのは欄ではなく口である。
 *
 * @param {unknown} text
 * @returns {string}
 */
function printableLines(text) {
  return String(text).split('\n').map(printable).join('\n');
}

/**
 * **JSON を端末へ刷る形** —— 値は 1 つも変えずに (`JSON.parse` すれば同じ値に戻る)、
 * 危ない字を JSON の `\uXXXX` へ逃がす。
 *
 * `JSON.stringify` は C0 を逃がすが、DEL・C1・双方向制御・不可視文字は**素のまま**出す
 * (`--json` を端末で開けば RLO はそこで効く)。整形の改行は構造なので残す —— 文字列の中の
 * 改行は `JSON.stringify` が `\n` へ逃がしているので、素の LF は構造の側にしか無い。
 * 危ない字はすべて BMP に在るので、4 桁の `\uXXXX` で足りる。
 *
 * @param {unknown} value
 * @returns {string}
 */
function jsonForTerminal(value) {
  let out = String(JSON.stringify(value, null, 2));
  for (const { re } of UNSAFE_GROUPS) out = out.replace(re, (c) => (c === '\n' ? c : `\\u${hex(c)}`));
  return out;
}

module.exports = { unsafeCharsIn, printable, printableLines, jsonForTerminal, UNSAFE_GROUPS };

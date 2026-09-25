'use strict';
/**
 * 行コメント・ブロックコメント・文字列リテラル・正規表現のリテラルを落として
 * 実コードだけ残す。**`.cjs` の側の唯一の実装** (2026-09-24 · パス 452)。
 *
 * ## なぜここに在るか
 *
 * `.cjs` からは `.ts` を require できないので、`src/shared/__tests__/stripNonCode.ts`
 * の写しは避けられない (前例: `scripts/inject-pwa.cjs` の色の正規表現・パス 363)。
 * ところがパス 418 の時点で写しは**ゲートごとに 1 つずつ**在り、
 * `lint-collection-time-tests.cjs` と `lint-test-coverage.cjs` が同じ 100 行を
 * 別々に持っていた。**3 人目の消費者 (`lint-credential-use.cjs`) が要ったとき、
 * 素直に写すと 4 つ目になる** —— だから写す代わりにここへ出した。
 * これで写しは **2 つ** (`.ts` 1 + `.cjs` 1) で、
 * `src/shared/__tests__/stripNonCodeParity.test.ts` が同じ標本を両方に通して
 * 出力が 1 字も違わないことを見る (台帳は両方向)。
 *
 * ## 契約
 *
 * - **改行は保つ** —— 行番号で報告する走査が在る (`lint-collection-time-tests`)。
 * - **`${…}` は文字列ではなく式なので残す** (2026-09-23 · パス 418)。補間を落とす形だと、
 *   このリポジトリが利用者に見せる文を組む場所 —— つまり最も危ない式が並ぶ所 ——
 *   がどの走査にも映らない (パス 417 の実測)。
 * - **正規表現のリテラルも落とす** (2026-09-24 · パス 451) —— 引用符を含む正規表現
 *   (`["']` ほか) を見ると文字列モードへ入り、**次の同じ引用符までを飲んでいた**
 *   (実測: `src` の 63 本 / コード 5,226 行が走査から消えていた)。
 * - **失敗の向きを選んでいる** —— `/` が行内で閉じなければ「割り算だった」として
 *   今までの振る舞いへ倒れるので、新しい飲み込みは生まれない。
 * - `opts.keepQuoteChars` —— 引用符そのものは残す (字面の境界が消えると
 *   `new Date('x').getHours()` のような形が繋がって見える · パス 188)。
 *
 * ## `stripComments` —— 注記だけを落とす (2026-09-25 · パス 463)
 *
 * **文字列・テンプレート・正規表現の中身は残す。** 探している綴りがリテラルの中に
 * 在る走査 (「この行は `readFileSync(` を呼ぶか」「この画面は `'#ef4444'` を直書き
 * するか」) は `stripNonCode` では答えを失う —— あちらは中身を落とすので、
 * 針そのものが消えて**どの入力でも通る走査**になる。
 *
 * 走査器は 1 つで、`keepLiterals` で分ける。**`.ts` 側の `stripComments` と
 * 1 字も違わない** ことを `src/shared/__tests__/stripNonCodeParity.test.ts` が
 * 同じ標本を両モードで通して見る。
 */

/**
 * 走査器の本体。`keepLiterals` ならリテラルの**中身を残す** (= `stripComments`)。
 * @param {string} src  @param {{keepQuoteChars?: boolean, keepLiterals?: boolean}} opts
 */
function scan(src, opts) {
  const keep = opts.keepLiterals === true;
  let out = '';
  let i = 0;
  let mode = 'code';
  /** 戻り先と、そのとき保留にした `{}` の深さ (入れ子のテンプレートに耐えるため)。 */
  const stack = [];
  /** 今の code フレームの `{}` の深さ。0 で `}` を見たら補間の終わり。 */
  let depth = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (mode === 'code') {
      if (two === '//') { mode = 'line'; i += 2; continue; }
      if (two === '/*') { mode = 'block'; i += 2; continue; }
      if (src[i] === "'") { stack.push({ mode, depth }); mode = 'sq'; if (keep) out += src[i]; i += 1; continue; }
      if (src[i] === '"') { stack.push({ mode, depth }); mode = 'dq'; if (keep) out += src[i]; i += 1; continue; }
      if (src[i] === '`') { stack.push({ mode, depth }); mode = 'tpl'; if (keep) out += src[i]; i += 1; continue; }
      if (src[i] === '/' && startsRegex(out)) {
        const end = skipRegex(src, i);
        if (end > i) {
          // 正規表現のリテラル —— 中身は落とし、区切りの空白だけ出す (パス 451)。
          // `keepLiterals` ならそのまま出す —— 探している綴りが中に在りうる。
          out += keep ? src.slice(i, end) : ' ';
          i = end;
          continue;
        }
      }
      if (src[i] === '{') { depth += 1; out += '{'; i += 1; continue; }
      if (src[i] === '}') {
        const frame = depth === 0 ? stack.pop() : undefined;
        if (frame !== undefined) {
          out += keep ? '}' : ' ';
          mode = frame.mode;
          depth = frame.depth;
        } else {
          if (depth > 0) depth -= 1;
          out += '}';
        }
        i += 1;
        continue;
      }
      out += src[i];
      i += 1;
      continue;
    }
    if (mode === 'line') {
      if (src[i] === '\n') { mode = 'code'; out += '\n'; }
      i += 1;
      continue;
    }
    if (mode === 'block') {
      if (two === '*/') { mode = 'code'; i += 2; continue; }
      if (src[i] === '\n') out += '\n';
      i += 1;
      continue;
    }
    // 文字列の中: 改行だけ残して行番号を保つ。エスケープは 1 文字飛ばす。
    if (src[i] === '\\') { if (keep) out += src.slice(i, i + 2); i += 2; continue; }
    if (mode === 'tpl' && two === '${') {
      // **補間は式** —— code として出す (区切りの空白つき)。
      out += keep ? '${' : ' ';
      stack.push({ mode, depth });
      mode = 'code';
      depth = 0;
      i += 2;
      continue;
    }
    if ((mode === 'sq' && src[i] === "'") || (mode === 'dq' && src[i] === '"') || (mode === 'tpl' && src[i] === '`')) {
      if (keep) out += src[i];
      else if (opts.keepQuoteChars === true) out += `${src[i]}${src[i]}`;
      const frame = stack.pop();
      mode = frame === undefined ? 'code' : frame.mode;
      if (frame !== undefined) depth = frame.depth;
    } else if (keep || src[i] === '\n') {
      out += src[i];
    }
    i += 1;
  }
  return out;
}

/**
 * `/` が正規表現の始まりか。**直前の意味のある字**で決める (パス 451)。
 * 読み違えた場合は「割り算」へ倒れ、今までと同じ振る舞いになる。
 */
function startsRegex(emitted) {
  let j = emitted.length - 1;
  while (j >= 0 && /\s/.test(emitted[j])) j -= 1;
  if (j < 0) return true;
  const c = emitted[j];
  if (c === ')' || c === ']') return false;
  if (/[\w$]/.test(c)) {
    let k = j;
    while (k >= 0 && /[\w$]/.test(emitted[k])) k -= 1;
    return isRegexPrecedingKeyword(emitted.slice(k + 1, j + 1));
  }
  return true;
}

/**
 * この語の直後の `/` は正規表現である。**`const` の集合にはしない** ——
 * 写し先の本 (`lint-test-coverage.cjs`) は読み込みの時点で `main()` を走らせるので、
 * 末尾の `const` は TDZ で落ちる (2026-09-24 · パス 451 で実際に落ちた ——
 * パス 371 と同じ罠の 2 度目)。関数宣言は巻き上げられる。
 */
function isRegexPrecedingKeyword(word) {
  switch (word) {
    case 'return': case 'typeof': case 'case': case 'in': case 'of':
    case 'instanceof': case 'new': case 'delete': case 'void':
    case 'do': case 'else': case 'yield': case 'await':
      return true;
    default:
      return false;
  }
}

/** 正規表現のリテラルを読み飛ばす。行内で閉じなければ `start` を返す。 */
function skipRegex(src, start) {
  let j = start + 1;
  let inClass = false;
  while (j < src.length) {
    const c = src[j];
    if (c === '\n') return start;
    if (c === '\\') { j += 2; continue; }
    if (inClass) {
      if (c === ']') inClass = false;
    } else if (c === '[') {
      inClass = true;
    } else if (c === '/') {
      j += 1;
      while (j < src.length && /[a-z]/.test(src[j])) j += 1;
      return j;
    }
    j += 1;
  }
  return start;
}

/** 中身は落とす (文字列・テンプレート・正規表現)。 */
/** @param {string} src  @param {{keepQuoteChars?: boolean}} [opts] */
function stripNonCode(src, opts = {}) {
  return scan(src, { keepQuoteChars: opts.keepQuoteChars === true });
}

/** 注記だけを落とす —— リテラルの中身は残す (上の docblock に理由)。 */
/** @param {string} src */
function stripComments(src) {
  return scan(src, { keepLiterals: true });
}

module.exports = { stripNonCode, stripComments };

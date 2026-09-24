/**
 * **数える前にコメントと文字列を落とす。** (2026-09-12 · パス 174 / 2026-09-14 · パス 252 で切り出した)
 *
 * 走査が散文の中の引用を掴むのは、この一族の定番の罠である (パス 85 の 0 倒し census が
 * 最初に踏み、パス 174 も踏んだ)。**行番号は保つ** —— 落とした行の分だけ改行を残すので、
 * 掴んだ位置をそのまま実物の行として報せられる。
 *
 * 2026-09-14 まで `ceilingLiteralCensus.test.ts` が export していたが、**検査ファイルを
 * import すると中の describe がもう一度走る** (実測: 14 件と報告された)。走査の道具は
 * 検査ではないので、ここへ出す。
 *
 * ## 正規表現のリテラルも**コードではない** (2026-09-24 · パス 451)
 *
 * 2026-09-24 まで正規表現を知らず、`/^(["'])([\\s\\S]*)\\1$/` のように**引用符を含む
 * 正規表現**を見ると文字の所で文字列へ入り、**次の同じ引用符までを丸ごと飲んだ** ——
 * 多くの場合ファイルの末尾までである。実測 (2026-09-24 · 直す前 · `src` の 1,428 本):
 *
 * | 盲点 | ファイル | 飲まれたコード行 |
 * | ---: | --- | ---: |
 * | **79.5%** | `main/clients/skills.ts` | **194** |
 * | **79.7%** | `shared/api/google.ts` | **267** |
 * | **85.2%** | `renderer/data/voiceCommand.ts` | **327** |
 * | —— | **10% 以上の盲点を持つ 63 本の合計** | **5,226** |
 *
 * ★ **見つけ方は、この道具を使った針が偽を返したこと** —— パス 451 の census が
 * 「`skills` は `ctx.token` を読まない」と答えた。実物の 466 行目は
 * `'x-api-key': ctx.token,` で、**同じ形の `stocks` / `business` は数えられていた**。
 * 差は 90 行目の正規表現 1 つだった。
 *
 * ★ **落とすのが正しい** —— 正規表現は文字列と同じリテラルで、その中身はコードではない。
 * 区切りの空白を出す (`x.match(/a/)` の前後が地続きにならないように)。
 * **行内で閉じなければコードへ戻す** —— 割り算を正規表現と読み違えたときに
 * ファイルを飲まないための、失敗の向きの選び方である。
 *
 * ★ **`/` が正規表現か割り算かは前の字で決める** —— 直前の意味のある字が
 * 識別子・`)`・`]` なら割り算 (今までと同じ扱い)、それ以外 (`(` `,` `=` `:` `!` `&` `|`
 * `return` の後ほか) なら正規表現。**読み違えたときに今までの振る舞いへ倒れる**ので、
 * この向きなら新しい飲み込みは生まれない。
 *
 * ## `${…}` は文字列ではなく**式**である (2026-09-22 · パス 417)
 *
 * 2026-09-22 まで `tpl` は閉じのバッククォートまで丸ごと落としており、**中の
 * `${…}` も一緒に消えていた**。このリポジトリは利用者に見せる文をテンプレートで
 * 組むので、そこは「散文」ではなく**最も危ない式が並ぶ場所**である。
 *
 * 実測でその死角に落ちていた物 (パス 417):
 *
 * | 実物 | 見えていたか |
 * | --- | --- |
 * | `sales.ts` の `` return `…|${salesNoteText(e)}`; `` | **見えない** (3 / 4 件しか数えられなかった) |
 * | 同じ行を `` `…|${(e.note ?? '').trim()}` `` へ戻す | **見えない** —— 針は**両方向**に盲目だった |
 *
 * 落とした側を数える針にとって、これは「0 件だから健全」を作る形である
 * (法則 `mention-vs-declaration` の裏 —— 宣言を見落とす側)。`${` で code へ戻り、
 * 対応する `}` で文字列へ帰る (入れ子のテンプレートに耐えるため戻り先を積む)。
 * **区切りに空白を出す** —— `` `a${x}b${y}` `` の `x` と `y` が地続きになると、
 * 実物に無い綴り (`xy`) を針が掴む。
 */
type Mode = 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl';

/**
 * `keepQuoteChars`: 中身は落とすが**引用符そのものは残す** (既定 false)。
 *
 * `timestampPrintCensus` がこれを要る —— 字面の境界が消えると
 * `new Date('x').getHours()` のような形が**繋がって見える** (パス 188 が実測した)。
 * そこは 2026-09-23 (パス 418) まで**自前の写し**を持っており、
 * その写しだけが補間を落とす古い形のまま残っていた。
 */
export interface StripOptions {
  readonly keepQuoteChars?: boolean;
}

export function stripNonCode(src: string, opts: StripOptions = {}): string {
  let out = '';
  let i = 0;
  let mode: Mode = 'code';
  /** 戻り先と、そのとき保留にした `{}` の深さ (入れ子のテンプレートに耐えるため)。 */
  const stack: { mode: Mode; depth: number }[] = [];
  /** 今の code フレームの `{}` の深さ。0 で `}` を見たら補間の終わり。 */
  let depth = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (mode === 'code') {
      if (two === '//') { mode = 'line'; i += 2; continue; }
      if (two === '/*') { mode = 'block'; i += 2; continue; }
      if (src[i] === "'") { stack.push({ mode, depth }); mode = 'sq'; i += 1; continue; }
      if (src[i] === '"') { stack.push({ mode, depth }); mode = 'dq'; i += 1; continue; }
      if (src[i] === '`') { stack.push({ mode, depth }); mode = 'tpl'; i += 1; continue; }
      if (src[i] === '/' && startsRegex(out)) {
        const end = skipRegex(src, i);
        if (end > i) {
          // 正規表現のリテラル —— 中身は落とし、区切りの空白だけ出す。
          out += ' ';
          i = end;
          continue;
        }
        // 行内で閉じなかった (= 割り算だったか、壊れた綴り)。今までどおりコードとして出す。
      }
      if (src[i] === '{') { depth += 1; out += '{'; i += 1; continue; }
      if (src[i] === '}') {
        const frame = depth === 0 ? stack.pop() : undefined;
        if (frame !== undefined) {
          // 補間の終わり —— 文字列へ帰る。区切りの空白で隣の補間と地続きにしない。
          out += ' ';
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
    if (src[i] === '\\') { i += 2; continue; }
    if (mode === 'tpl' && two === '${') {
      // **補間は式** —— code として出す (区切りの空白つき)。
      out += ' ';
      stack.push({ mode, depth });
      mode = 'code';
      depth = 0;
      i += 2;
      continue;
    }
    if ((mode === 'sq' && src[i] === "'") || (mode === 'dq' && src[i] === '"') || (mode === 'tpl' && src[i] === '`')) {
      if (opts.keepQuoteChars === true) out += `${src[i]!}${src[i]!}`;
      const frame = stack.pop();
      mode = frame === undefined ? 'code' : frame.mode;
      if (frame !== undefined) depth = frame.depth;
    } else if (src[i] === '\n') {
      out += '\n';
    }
    i += 1;
  }
  return out;
}

/**
 * `/` が正規表現の始まりか。**直前の意味のある字**で決める (上の docblock に理由)。
 * 読み違えた場合は「割り算」へ倒れ、今までと同じ振る舞いになる。
 */
function startsRegex(emitted: string): boolean {
  let j = emitted.length - 1;
  while (j >= 0 && /\s/.test(emitted[j]!)) j -= 1;
  if (j < 0) return true;
  const c = emitted[j]!;
  // 識別子・`)`・`]` の後ろは割り算。ただし予約語 (`return` / `typeof` ほか) の後ろは
  // 正規表現なので、識別子のときだけ語を取り出して見る。
  if (c === ')' || c === ']') return false;
  if (/[\w$]/.test(c)) {
    let k = j;
    while (k >= 0 && /[\w$]/.test(emitted[k]!)) k -= 1;
    const word = emitted.slice(k + 1, j + 1);
    return isRegexPrecedingKeyword(word);
  }
  return true;
}

/**
 * この語の直後の `/` は正規表現である (値ではなく演算子・文の一部なので)。
 *
 * **`const` の集合にはしない** —— `.cjs` の写しは読み込みの時点で `main()` を走らせるので、
 * ファイル末尾の `const` は TDZ で `ReferenceError` になる (2026-09-24 · パス 451 で
 * `lint:test-coverage` が実際に落ちた。パス 371 で同じ罠を踏んでおり **2 度目**)。
 * **関数宣言は巻き上げられる**ので、3 つの写しで同じ形にできる。
 */
function isRegexPrecedingKeyword(word: string): boolean {
  switch (word) {
    case 'return': case 'typeof': case 'case': case 'in': case 'of':
    case 'instanceof': case 'new': case 'delete': case 'void':
    case 'do': case 'else': case 'yield': case 'await':
      return true;
    default:
      return false;
  }
}

/**
 * 正規表現のリテラルを読み飛ばし、**閉じた位置の次**を返す。
 * 行内で閉じなければ `-1` ではなく `i` を返す (呼び手が「正規表現ではなかった」と扱う)。
 */
function skipRegex(src: string, start: number): number {
  let j = start + 1;
  let inClass = false;
  while (j < src.length) {
    const c = src[j]!;
    if (c === '\n') return start; // 行内で閉じない
    if (c === '\\') { j += 2; continue; }
    if (inClass) {
      if (c === ']') inClass = false;
    } else if (c === '[') {
      inClass = true;
    } else if (c === '/') {
      j += 1;
      // フラグ
      while (j < src.length && /[a-z]/.test(src[j]!)) j += 1;
      return j;
    }
    j += 1;
  }
  return start;
}

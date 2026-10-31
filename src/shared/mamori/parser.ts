/**
 * Mamori の字句解析と構文解析 (2026-10-30 · パス 560 · threat: T-221)。言語の仕様は `docs/MAMORI.md`。
 *
 * 文法は**閉じている** —— 知らない綴りは読み飛ばさずに断る。とくに次の 2 つは字句の段で断る:
 *
 * - `as` (型の書き換え) —— 印を偽造する唯一の道なので言語に置かない。印を作るのは `mint` だけで、
 *   `mint` は検査器が `gate` 関数の中にしか置かせない。
 * - `any` —— 型の検査を丸ごと外す綴り。
 *
 * 失敗は `MamoriError` (行と桁つき) で投げる。1 つ目の誤りで止める —— 構文の誤りの後に続く誤りは
 * 当てにならないので、並べて見せても読み手を迷わせるだけである。
 */
import type { Comments, Doc, Expr, Item, Member, Module, Param, Pos, Prop, Stmt, SwitchCase, TypeRef } from './ast';

export class MamoriError extends Error {
  constructor(
    readonly file: string,
    readonly pos: Pos,
    readonly reason: string,
  ) {
    super(`${file}:${pos.line}:${pos.col}: ${reason}`);
    this.name = 'MamoriError';
  }
}

type TokKind = 'ident' | 'string' | 'number' | 'regex' | 'punct' | 'header' | 'doc' | 'comment' | 'eof';

interface Tok {
  readonly kind: TokKind;
  readonly text: string;
  readonly pos: Pos;
}

/** 字句の段で断る綴り。理由は利用者が読む文 (何の代わりに何を使うか)。 */
export const FORBIDDEN_WORDS: Readonly<Record<string, string>> = {
  as: '`as` (型の書き換え) は Mamori に在りません —— 印は gate 関数の中で `mint 型名(値)` と書いて作ります',
  any: '`any` は Mamori に在りません —— 型が分からない値は `unknown` で受けます',
  eval: '`eval` は Mamori に在りません (文字列をコードとして走らせる口は持ちません)',
};

/**
 * `.` の後ろに置けない名前 (2026-10-30 · パス 563 · threat: T-224)。理由は利用者が読む文。
 *
 * **0.1 はここを持たず、`eval` を禁じながら同じことができた** —— `String.constructor(code)()` と
 * `''.constructor.constructor(code)()` は関数の constructor (`Function`) に届き、Mamori のコンパイラも
 * 変換後の `tsc` も通し、node で実行すると文字列がコードとして走った (実測: `'return 6*7'` が 42 を返す)。
 * `Function` という名前は M6 が断るが、メンバの連鎖はどの名前も経由しない。`prototype` / `__proto__` は
 * 組み込みの原型 (`String.prototype` ほか) に届く —— 書き換えると、他のモジュールの関門の判定まで変わる。
 */
export const FORBIDDEN_MEMBERS: Readonly<Record<string, string>> = {
  constructor: '`.constructor` は Mamori に在りません —— 関数の constructor (`Function`) は文字列をコードとして走らせる口で、`eval` を禁じても `String.constructor(code)()` で同じことができてしまいます',
  prototype: '`.prototype` は Mamori に在りません —— 組み込みの原型を書き換えると、他のモジュールの関門の判定まで変わります',
  // ★ 計算した鍵で書く —— 字面の `__proto__: …` は欄ではなく**原型の差し替え**で、表に入らない
  // (この表を初めて書いたとき、そうなって `.__proto__` が素通りした。Mamori の字面が `__proto__` の鍵を断る理由そのもの)。
  ['__proto__']: '`.__proto__` は Mamori に在りません —— 原型に届く道で、`.prototype` と同じ理由で断ります',
};

const PUNCT = [
  '===', '!==', '...', '->', '=>', '&&', '||', '??', '<=', '>=',
  '(', ')', '{', '}', '[', ']', '<', '>', ',', ';', ':', '.', '=', '!', '+', '-', '*', '/', '%', '?', '|', '&',
];

/** この直後に来る `/` は割り算ではなく正規表現の始まり。 */
function regexAllowedAfter(prev: Tok | undefined): boolean {
  if (prev === undefined) return true;
  if (prev.kind === 'punct') return !(prev.text === ')' || prev.text === ']' || prev.text === '}');
  // 名前以外の字句 (数・文字列・正規表現) の綴りは return / typeof / await にならないので、この判定を外しても
  // 下の綴りの比べで同じ false になる (等価)。
  // Stryker disable next-line ConditionalExpression: 上の注記のとおり等価 (名前でない字句の綴りは予約語にならない)
  if (prev.kind === 'ident') return prev.text === 'return' || prev.text === 'typeof' || prev.text === 'await';
  return false;
}

/**
 * 字句が記号 `texts` のどれかか。**記号の綴りを持てるのは記号の字句だけ**で (名前・数・文字列は記号を綴りに持てない)、
 * 注記の字句 (綴りが `)` の注記など) は構文の段がどの位置でも先に断るので、種類の判定を外す変異体は等価になる。
 * 判定をここ 1 か所に集め、等価の理由を 1 度だけ書く。
 */
export function isPunctTok(t: Tok, ...texts: readonly string[]): boolean {
  // Stryker disable next-line ConditionalExpression: 上の注記のとおり等価 (記号の綴りを持つ字句は記号か、構文の段が断る注記だけ)
  return t.kind === 'punct' && texts.includes(t.text);
}

/** 行注記の本体 (JS の行終端 LF / CR / U+2028 / U+2029 の手前まで)。sticky なので `lastIndex` から読む。 */
const LINE_COMMENT_BODY = /[^\n\r\u2028\u2029]*/y;

export function lex(file: string, src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const at = (): Pos => ({ line, col });
  const advance = (n: number): void => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };
  const significant = (): Tok | undefined => {
    for (let k = out.length - 1; k >= 0; k--) {
      const t = out[k]!;
      if (t.kind !== 'comment' && t.kind !== 'doc' && t.kind !== 'header') return t;
    }
    return undefined;
  };
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      advance(1);
      continue;
    }
    const pos = at();
    if (src.startsWith('//', i)) {
      // 行注記は **JS が行を終える字すべて** (LF / CR / U+2028 / U+2029) で終わる (0.4 · T-233)。
      // `\n` だけで終えると、注記の中の U+2028 / U+2029 / 単独の CR のあとの字は Mamori には注記の続き (検めない) だが、
      // 生成した TypeScript では行が終わっていて**コードとして走る**。検めを受けないコードが生成物へ入る道だった。
      LINE_COMMENT_BODY.lastIndex = i;
      const stop = i + (LINE_COMMENT_BODY.exec(src)?.[0].length ?? 0);
      const raw = src.slice(i, stop);
      const kind: TokKind = raw.startsWith('//!') ? 'header' : raw.startsWith('///') ? 'doc' : 'comment';
      const rest = kind === 'comment' ? raw.slice(2) : raw.slice(3);
      out.push({ kind, text: rest.startsWith(' ') ? rest.slice(1) : rest, pos });
      advance(stop - i);
      continue;
    }
    if (src.startsWith('/*', i)) {
      throw new MamoriError(file, pos, '`/* … */` の注記は在りません —— `//` の行で書きます (TypeScript へそのまま運ぶため)');
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      // 終わりの 1 つ先 (src[length] は undefined) まで回っても、閉じていない文字列は下で同じく断る (等価)。
      // Stryker disable next-line EqualityOperator: 上の注記のとおり等価 (閉じない文字列は下の門が同じ文で断る)
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\n') throw new MamoriError(file, pos, '文字列が行の内で閉じていません');
        j += src[j] === '\\' ? 2 : 1;
      }
      if (j >= src.length) throw new MamoriError(file, pos, '文字列が閉じていません');
      out.push({ kind: 'string', text: src.slice(i, j + 1), pos });
      advance(j + 1 - i);
      continue;
    }
    if (ch === '`') {
      throw new MamoriError(file, pos, 'テンプレート文字列は在りません —— `+` で繋ぎます (補間の中に式を隠させない)');
    }
    if (/[0-9]/.test(ch)) {
      // 先頭の 1 字は数字だと上で確かめたので、一致は必ず先頭から始まる (錨 `^` は要らない —— 書くと消す変異体が等価になる)
      // 16 進 (`0x20`) は 0.3 から (パス 564) —— 制御文字やビットの境目は 16 進で書くほうが読み手が確かめやすい。
      const m = /0[xX][0-9a-fA-F]*|[0-9][0-9_]*(\.[0-9]+)?/.exec(src.slice(i))!;
      if (m[0] === '0x' || m[0] === '0X') throw new MamoriError(file, pos, '`' + m[0] + '` の後に 16 進の数字 (0-9 / a-f) が要ります');
      out.push({ kind: 'number', text: m[0], pos });
      advance(m[0].length);
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      // 先頭の 1 字は名前の頭だと上で確かめたので、一致は必ず先頭から始まる (錨は要らない)
      const m = /[A-Za-z_$][\w$]*/.exec(src.slice(i))!;
      const word = m[0];
      // 表は自分の鍵だけで引く (`toString` などの prototype の鍵を禁止語と読まない)。
      if (Object.hasOwn(FORBIDDEN_WORDS, word)) throw new MamoriError(file, pos, FORBIDDEN_WORDS[word]!);
      out.push({ kind: 'ident', text: word, pos });
      advance(word.length);
      continue;
    }
    if (ch === '/' && regexAllowedAfter(significant())) {
      let j = i + 1;
      let inClass = false;
      // 終わりの 1 つ先まで回っても、閉じない正規表現は下の門が同じ文で断る (等価)。
      // Stryker disable next-line EqualityOperator: 上の注記のとおり等価 (閉じない正規表現は下の門が断る)
      while (j < src.length) {
        const c = src[j]!;
        if (c === '\n') throw new MamoriError(file, pos, '正規表現が行の内で閉じていません');
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
        j++;
      }
      // ★ ファイルの終わりまで閉じなかった (2026-10-30 まで黙って正規表現の字句にしていた —— 変異検査が教えた)
      if (j >= src.length) throw new MamoriError(file, pos, '正規表現が閉じていません');
      j++;
      while (j < src.length && /[a-z]/.test(src[j]!)) j++;
      out.push({ kind: 'regex', text: src.slice(i, j), pos });
      advance(j - i);
      continue;
    }
    const p = PUNCT.find((s) => src.startsWith(s, i));
    if (p === undefined) throw new MamoriError(file, pos, `知らない文字です: ${JSON.stringify(ch)}`);
    out.push({ kind: 'punct', text: p, pos });
    advance(p.length);
  }
  // 終わりの字句の綴りは誰も読まない (describe は種類で「ファイルの終わり」と言い、比べる所は種類を先に見る)。
  // Stryker disable next-line StringLiteral: 上の注記のとおり等価 (終わりの字句の綴りは読まれない)
  out.push({ kind: 'eof', text: '', pos: at() });
  return out;
}

const STOP_WORDS = new Set(['true', 'false', 'null', 'undefined', 'unknown', 'string', 'number', 'boolean', 'void']);

/** `case` の本体を終えてよい文 (次の case へ落ちる形を書かせない)。 */
const CASE_ENDS: ReadonlySet<Stmt['kind']> = new Set(['return', 'throw', 'jump']);

export function parse(file: string, src: string): Module {
  const toks = lex(file, src);
  let k = 0;
  // 先読みは終わりの字句で止める。構文の段は終わりの字句より先を読まない (どの先読みも終わりで止まる) ので、
  // 上限を 1 つ外へずらしても答えは変わらない (等価)。
  // Stryker disable next-line ArithmeticOperator: 上の注記のとおり等価 (終わりの字句より先は読まれない)
  const peek = (n = 0): Tok => toks[Math.min(k + n, toks.length - 1)]!;
  const fail = (t: Tok, reason: string): never => {
    throw new MamoriError(file, t.pos, reason);
  };
  const isP = (text: string, n = 0): boolean => isPunctTok(peek(n), text);
  // 語の綴りを持つ字句は名前か注記で、注記は文・項目の位置で先に読み飛ばすか断るので、種類の判定を外しても等価。
  // Stryker disable next-line ConditionalExpression: 上の注記のとおり等価 (語の位置に注記は届かない)
  const isW = (text: string, n = 0): boolean => peek(n).kind === 'ident' && peek(n).text === text;
  const next = (): Tok => toks[k++]!;
  /** その語が在れば読んで true。 */
  const take = (word: string): boolean => {
    if (!isW(word)) return false;
    next();
    return true;
  };
  const expectP = (text: string): Tok => (isP(text) ? next() : fail(peek(), `\`${text}\` が要ります (在ったのは ${describe(peek())})`));
  const expectW = (text: string): Tok => (isW(text) ? next() : fail(peek(), `\`${text}\` が要ります (在ったのは ${describe(peek())})`));
  const ident = (): string => (peek().kind === 'ident' ? next().text : fail(peek(), `名前が要ります (在ったのは ${describe(peek())})`));
  /** `.` の後ろの名前。原型・Function へ届く名前は断る (T-224)。表は自分の鍵だけで引く。 */
  const memberName = (): string => {
    const t = peek();
    const name = ident();
    if (Object.hasOwn(FORBIDDEN_MEMBERS, name)) fail(t, FORBIDDEN_MEMBERS[name]!);
    return name;
  };
  /** for の深さ (continue が置ける) と、for か switch の深さ (break が置ける)。 */
  let loops = 0;
  let breakables = 0;
  const str = (): string => {
    const t = peek();
    if (t.kind !== 'string') fail(t, `文字列が要ります (在ったのは ${describe(t)})`);
    next();
    return JSON.parse(t.text.startsWith("'") ? `"${t.text.slice(1, -1).replace(/"/g, '\\"')}"` : t.text) as string;
  };

  const takeLeading = (kinds: readonly TokKind[]): string[] => {
    const lines: string[] = [];
    while (kinds.includes(peek().kind)) lines.push(next().text);
    return lines;
  };
  /** 文の位置に在る注記 (`//`) を集める。`///` をここに置くのは誤り (説明は項目に付ける)。 */
  const comments = (): Comments => {
    if (peek().kind === 'doc') fail(peek(), '`///` は関数・定数の前に置きます (文の前は `//`)');
    return takeLeading(['comment']);
  };

  /** 型の綴りを、深さ 0 の終端まで写す。 */
  const typeRef = (terminators: readonly string[]): TypeRef => {
    const start = peek();
    const parts: Tok[] = [];
    let depth = 0;
    for (;;) {
      const t = peek();
      if (t.kind === 'eof') fail(t, '型が閉じていません');
      if (t.kind === 'comment' || t.kind === 'doc' || t.kind === 'header') fail(t, '型の途中に注記は置けません');
      if (depth === 0 && isPunctTok(t, ...terminators)) break;
      if (isPunctTok(t, '<', '(', '[', '{')) depth++;
      if (isPunctTok(t, '>', ')', ']', '}')) depth--;
      if (depth < 0) fail(t, '型の括弧が合いません');
      parts.push(next());
    }
    if (parts.length === 0) fail(start, '型が要ります');
    let text = '';
    parts.forEach((t, idx) => {
      const prev = parts[idx - 1];
      const tight = prev !== undefined && (t.text === '<' || t.text === '>' || t.text === '[' || t.text === ']' || t.text === ',' || prev.text === '<' || prev.text === '[' || prev.text === '(' || t.text === ')' || t.text === '.' || prev.text === '.' || t.text === ':' || t.text === ';');
      text += prev === undefined ? t.text : tight ? t.text : ` ${t.text}`;
      if (t.text === ',') text += ' ';
    });
    text = text.replace(/ {2,}/g, ' ').replace(/, \]/g, ',]');
    const names = parts.filter((t) => t.kind === 'ident' && !STOP_WORDS.has(t.text)).map((t) => t.text);
    return { text, names, pos: start.pos };
  };

  const params = (): Param[] => {
    expectP('(');
    const out: Param[] = [];
    while (!isP(')')) {
      const pos = peek().pos;
      const name = ident();
      let type: TypeRef | null = null;
      if (isP(':')) {
        next();
        type = typeRef([',', ')', '=']);
      }
      let init: Expr | null = null;
      if (isP('=')) {
        next();
        init = expr();
      }
      out.push({ name, type, init, pos });
      if (!isP(')')) expectP(',');
    }
    expectP(')');
    return out;
  };

  const block = (): Stmt[] => {
    expectP('{');
    const out: Stmt[] = [];
    for (;;) {
      const cs = comments();
      if (isP('}')) {
        if (cs.length > 0) out.push({ kind: 'comment', comments: cs, pos: peek().pos });
        break;
      }
      out.push(stmt(cs));
    }
    expectP('}');
    return out;
  };

  const stmt = (cs: Comments): Stmt => {
    const t = peek();
    if (isW('const') || isW('let')) {
      const mutable = next().text === 'let';
      const name = ident();
      let type: TypeRef | null = null;
      if (isP(':')) {
        next();
        type = typeRef(['=', ';']);
      }
      let init: Expr | null = null;
      if (isP('=')) {
        next();
        init = expr();
      } else if (!mutable) {
        fail(peek(), '`const` には値が要ります');
      }
      expectP(';');
      return { kind: 'let', mutable, name, type, init, comments: cs, pos: t.pos };
    }
    if (isW('return')) {
      next();
      const value = isP(';') ? null : expr();
      expectP(';');
      return { kind: 'return', value, comments: cs, pos: t.pos };
    }
    if (isW('throw')) {
      next();
      const value = expr();
      expectP(';');
      return { kind: 'throw', value, comments: cs, pos: t.pos };
    }
    if (isW('break') || isW('continue')) {
      const word = next().text as 'break' | 'continue';
      if (word === 'continue' ? loops <= 0 : breakables <= 0) fail(t, `\`${word}\` は ${word === 'continue' ? 'for' : 'for か switch'} の中にだけ置けます`);
      expectP(';');
      return { kind: 'jump', word, comments: cs, pos: t.pos };
    }
    if (isW('for')) {
      next();
      expectP('(');
      expectW('const');
      const name = ident();
      expectW('of');
      const iterable = expr();
      expectP(')');
      loops++;
      breakables++;
      const body = block();
      loops--;
      breakables--;
      return { kind: 'for', name, iterable, body, comments: cs, pos: t.pos };
    }
    if (isW('switch')) {
      next();
      expectP('(');
      const test = expr();
      expectP(')');
      expectP('{');
      breakables++;
      const cases: SwitchCase[] = [];
      let pending = comments();
      while (!isP('}')) {
        const start = peek();
        const tests: (Expr | null)[] = [];
        while (isW('case') || isW('default')) {
          if (next().text === 'case') tests.push(expr());
          else tests.push(null);
          expectP(':');
          // 注記の次がまた label なら、それは積んだ label の間の注記 (本体の先頭の注記なら次は文)。
          let n = 0;
          while (peek(n).kind === 'comment') n++;
          if (n > 0 && (isW('case', n) || isW('default', n))) fail(peek(), '積んだ label の間に注記は置けません (注記は最初の label の前へ)');
        }
        if (tests.length === 0) fail(start, `\`case\` か \`default\` が要ります (在ったのは ${describe(start)})`);
        const body: Stmt[] = [];
        let cs2 = comments();
        while (!(isW('case') || isW('default') || isP('}'))) {
          body.push(stmt(cs2));
          cs2 = comments();
        }
        const last = body[body.length - 1];
        if (last === undefined || !CASE_ENDS.has(last.kind)) fail(start, 'case の本体は return / throw / break で終えます (次の case へ落ちる形は書けません)');
        cases.push({ tests, body, comments: pending, pos: start.pos });
        pending = cs2;
      }
      if (pending.length > 0) fail(peek(), 'switch の終わりの前に注記は置けません');
      breakables--;
      expectP('}');
      return { kind: 'switch', test, cases, comments: cs, pos: t.pos };
    }
    if (isW('if')) {
      next();
      expectP('(');
      const test = expr();
      expectP(')');
      const then = block();
      let otherwise: Stmt[] | null = null;
      if (isW('else')) {
        next();
        otherwise = isW('if') ? [stmt([])] : block();
      }
      return { kind: 'if', test, then, otherwise, comments: cs, pos: t.pos };
    }
    if (isW('try')) {
      next();
      const body = block();
      expectW('catch');
      const handler = block();
      return { kind: 'try', body, handler, comments: cs, pos: t.pos };
    }
    if (isP('{')) fail(t, '文の頭に `{` は置けません (オブジェクトの字面だけの文は何もしないので書かない)');
    if (peek().kind === 'ident' && isP('=', 1)) {
      const target = ident();
      next();
      const value = expr();
      expectP(';');
      return { kind: 'assign', target, value, comments: cs, pos: t.pos };
    }
    const e = expr();
    expectP(';');
    return { kind: 'expr', expr: e, comments: cs, pos: t.pos };
  };

  const BINARY: readonly (readonly string[])[] = [
    ['??'],
    ['||'],
    ['&&'],
    ['===', '!=='],
    ['<', '>', '<=', '>='],
    ['+', '-'],
    ['*', '/', '%'],
  ];

  const expr = (): Expr => {
    if (isArrowAhead()) return arrow();
    const test = binary(0);
    if (!isP('?')) return test;
    const q = next();
    const then = expr();
    expectP(':');
    const otherwise = expr();
    return { kind: 'cond', test, then, otherwise, pos: q.pos };
  };

  const binary = (level: number): Expr => {
    if (level >= BINARY.length) return unary();
    let left = binary(level + 1);
    while (isPunctTok(peek(), ...BINARY[level]!)) {
      const op = next();
      const right = binary(level + 1);
      left = { kind: 'binary', op: op.text, left, right, pos: op.pos };
    }
    return left;
  };

  const unary = (): Expr => {
    const t = peek();
    if (isP('!') || isP('-')) {
      next();
      return { kind: 'unary', op: t.text as '!' | '-', operand: unary(), pos: t.pos };
    }
    if (isW('typeof') || isW('await')) {
      next();
      return { kind: 'unary', op: t.text as 'typeof' | 'await', operand: unary(), pos: t.pos };
    }
    return postfix();
  };

  const args = (): Expr[] => {
    expectP('(');
    const out: Expr[] = [];
    while (!isP(')')) {
      out.push(expr());
      if (!isP(')')) expectP(',');
    }
    expectP(')');
    return out;
  };

  const postfix = (): Expr => {
    let e = primary();
    for (;;) {
      if (isP('.')) {
        const dot = next();
        e = { kind: 'member', object: e, prop: memberName(), pos: dot.pos };
      } else if (isP('(')) {
        const pos = peek().pos;
        e = { kind: 'call', callee: e, args: args(), pos };
      } else {
        return e;
      }
    }
  };

  const primary = (): Expr => {
    const t = peek();
    if (t.kind === 'string' || t.kind === 'number' || t.kind === 'regex') {
      next();
      return { kind: t.kind, raw: t.text, pos: t.pos };
    }
    if (isP('(')) {
      next();
      const e = expr();
      expectP(')');
      return e;
    }
    if (isP('{')) {
      next();
      const props: Prop[] = [];
      while (!isP('}')) {
        const kt = peek();
        if (isP('...')) fail(kt, '`...` (展開) は在りません —— 欄を 1 つずつ書きます (何が入るかを字面で見えるようにする)');
        if (isP('[')) fail(kt, '計算した鍵 (`[k]: v`) は在りません —— 鍵は名前か文字列で書きます');
        const quoted = kt.kind === 'string';
        const key = quoted ? str() : ident();
        // `{ __proto__: x }` は欄ではなく**原型を差し替える** (文字列で書いても同じ)。
        if (key === '__proto__') fail(kt, '鍵 `__proto__` は在りません —— オブジェクトの字面では欄ではなく原型を差し替えます');
        if (isP(':')) {
          next();
          props.push({ key, quoted, value: expr(), shorthand: false, pos: kt.pos });
        } else {
          if (quoted) fail(peek(), `文字列の鍵 ${JSON.stringify(key)} には \`:\` と値が要ります`);
          if (RESERVED.has(key) || STOP_WORDS.has(key)) fail(kt, `\`${key}\` は省略形の欄 (\`{ 名前 }\`) にできません`);
          props.push({ key, quoted, value: { kind: 'ident', name: key, pos: kt.pos }, shorthand: true, pos: kt.pos });
        }
        if (!isP('}')) expectP(',');
      }
      expectP('}');
      return { kind: 'object', props, pos: t.pos };
    }
    if (isP('[')) {
      next();
      const items: Expr[] = [];
      while (!isP(']')) {
        items.push(expr());
        if (!isP(']')) expectP(',');
      }
      expectP(']');
      return { kind: 'array', items, pos: t.pos };
    }
    if (t.kind === 'ident') {
      if (t.text === 'true' || t.text === 'false' || t.text === 'null' || t.text === 'undefined') {
        next();
        return { kind: 'literal', value: t.text, pos: t.pos };
      }
      if (t.text === 'new') {
        next();
        let callee: Expr = { kind: 'ident', name: ident(), pos: peek().pos };
        while (isP('.')) {
          const dot = next();
          callee = { kind: 'member', object: callee, prop: memberName(), pos: dot.pos };
        }
        return { kind: 'new', callee, args: args(), pos: t.pos };
      }
      if (t.text === 'field') {
        next();
        const object = primary();
        expectP('.');
        return { kind: 'field', object, prop: memberName(), pos: t.pos };
      }
      if (t.text === 'mint') {
        next();
        const vetted = ident();
        expectP('(');
        const value = expr();
        expectP(')');
        return { kind: 'mint', vetted, value, pos: t.pos };
      }
      if (RESERVED.has(t.text)) fail(t, `\`${t.text}\` はここに置けません`);
      next();
      return { kind: 'ident', name: t.text, pos: t.pos };
    }
    return fail(t, `式が要ります (在ったのは ${describe(t)})`);
  };

  /** `(a, b) => …` / `() => …` / `x => …` が始まるか。 */
  const isArrowAhead = (): boolean => {
    if (peek().kind === 'ident' && isP('=>', 1)) return true;
    if (!isP('(')) return false;
    let depth = 0;
    for (let n = 0; ; n++) {
      const t = peek(n);
      if (t.kind === 'eof') return false;
      if (isPunctTok(t, '(')) depth++;
      if (isPunctTok(t, ')')) {
        depth--;
        if (depth === 0) return isP('=>', n + 1);
      }
    }
  };

  const arrow = (): Expr => {
    const pos = peek().pos;
    const ps: Param[] = peek().kind === 'ident' ? [{ name: ident(), type: null, init: null, pos }] : params();
    expectP('=>');
    return { kind: 'arrow', params: ps, body: expr(), pos };
  };

  const item = (doc: Doc): Item => {
    const t = peek();
    if (isW('use')) {
      next();
      const typeOnly = take('type');
      let defaultName: string | null = null;
      const names: { name: string; alias: string | null }[] = [];
      if (isW('default')) {
        next();
        defaultName = ident();
      } else {
        expectP('{');
        while (!isP('}')) {
          const name = ident();
          let alias: string | null = null;
          if (isW('alias')) {
            next();
            alias = ident();
          }
          names.push({ name, alias });
          if (!isP('}')) expectP(',');
        }
        expectP('}');
      }
      expectW('from');
      const from = str();
      expectP(';');
      return { kind: 'use', typeOnly, names, defaultName, from, doc, pos: t.pos };
    }
    if (isW('extern')) {
      next();
      const a = ident();
      if (a !== 'sink' && a !== 'pure') fail(t, '`extern` の後には `sink` か `pure` を書きます (その値が危ない口か)');
      const authority = a as 'sink' | 'pure';
      if (isW('global')) {
        next();
        const name = ident();
        expectP(';');
        return { kind: 'extern', authority, names: [name], from: null, doc, pos: t.pos };
      }
      expectP('{');
      const names: string[] = [];
      while (!isP('}')) {
        names.push(ident());
        if (!isP('}')) expectP(',');
      }
      expectP('}');
      expectW('from');
      const from = str();
      expectP(';');
      return { kind: 'extern', authority, names, from, doc, pos: t.pos };
    }
    const exported = take('export');
    if (isW('vetted')) {
      next();
      const name = ident();
      expectP('=');
      const label = str();
      expectP(';');
      return { kind: 'vetted', exported, name, label, doc, pos: t.pos };
    }
    if (isW('type')) {
      next();
      const name = ident();
      expectP('=');
      const multiline = isP('|');
      if (multiline) next();
      const type = typeRef([';']);
      expectP(';');
      return { kind: 'type', exported, name, type, multiline, doc, pos: t.pos };
    }
    if (isW('interface')) {
      next();
      const name = ident();
      expectP('{');
      const members: Member[] = [];
      for (;;) {
        if (peek().kind === 'comment') fail(peek(), 'interface の中は `///` の説明だけ置けます (`//` は置けません)');
        const mdoc = takeLeading(['doc']);
        if (isP('}')) {
          if (mdoc.length > 0) fail(peek(), '`///` の後に欄がありません');
          break;
        }
        const mpos = peek().pos;
        const ro = take('readonly');
        const mname = ident();
        const optional = isP('?');
        if (optional) next();
        expectP(':');
        const mtype = typeRef([';']);
        expectP(';');
        members.push({ name: mname, readonly: ro, optional, type: mtype, doc: mdoc, pos: mpos });
      }
      expectP('}');
      return { kind: 'interface', exported, name, members, doc, pos: t.pos };
    }
    if (isW('const')) {
      next();
      const name = ident();
      let type: TypeRef | null = null;
      if (isP(':')) {
        next();
        type = typeRef(['=']);
      }
      expectP('=');
      const init = expr();
      expectP(';');
      return { kind: 'const', exported, name, type, init, doc, pos: t.pos };
    }
    // 'plain' は「gate でも sink でもない」の意味だけを持つ (検査器も変換も 'gate' / 'sink' と比べるだけ) —— 等価。
    // Stryker disable next-line StringLiteral: 上の注記のとおり等価 (役割は 'gate' / 'sink' と比べられるだけ)
    let role: 'gate' | 'sink' | 'plain' = 'plain';
    if (isW('gate') || isW('sink')) role = next().text as 'gate' | 'sink';
    const isAsync = take('async');
    if (!isW('fn')) fail(peek(), `項目が要ります —— use / extern / vetted / type / interface / const / fn (在ったのは ${describe(peek())})`);
    next();
    const name = ident();
    const ps = params();
    expectP('->');
    const returns = typeRef(['{']);
    const body = block();
    return { kind: 'fn', exported, role, async: isAsync, name, params: ps, returns, body, doc, pos: t.pos };
  };

  const header = takeLeading(['header']);
  const items: Item[] = [];
  for (;;) {
    takeLeading(['comment']);
    const doc = takeLeading(['doc']);
    takeLeading(['comment']);
    if (peek().kind === 'header') fail(peek(), '`//!` はファイルの先頭だけに置きます');
    if (peek().kind === 'eof') {
      if (doc.length > 0) fail(peek(), '`///` の後に項目がありません');
      break;
    }
    items.push(item(doc));
  }
  return { header, items };
}

const RESERVED = new Set([
  'use', 'extern', 'vetted', 'export', 'const', 'let', 'fn', 'gate', 'sink', 'return', 'if', 'else', 'try', 'catch', 'mint', 'from', 'alias',
  // 0.2 (パス 563)
  'throw', 'for', 'of', 'break', 'continue', 'switch', 'case', 'default', 'field', 'type', 'interface',
]);

function describe(t: Tok): string {
  if (t.kind === 'eof') return 'ファイルの終わり';
  return `\`${t.text}\``;
}

/**
 * **AegisLang —— 外へ何も出さない小さな言語の、字句解析・構文解析・実行。** (2026-10-26)
 *
 * 利用者が以前貼った Python のプロトタイプ AegisLang / AegisVM の**考え方**
 * (小さな言語を持ち、実行の前に安全を検め、違反を直す道を示す) だけを移した純ロジックである。
 * 画面には配線していない (UI は後で決める)。保存先も持たない。
 *
 * ## 意図して移さなかった物
 *
 * 原型には「AI チームを召喚してコードを自動修正し、ソースファイルを書き換えて再実行する」
 * 自己進化があった。**ここには無い** —— LLM・ネットワーク・ファイルの読み書き・動的なコード実行・
 * 子プロセス・動的な読み込みを、このモジュールは 1 つも持たない (検査が原文でそれを見る)。
 * 代わりの**規則ベースの修復の提案**は `aegisLangSafety.ts` が返す (適用は呼び手が決める)。
 *
 * ## 文法 (EBNF)
 *
 * ```
 * program    = { function | statement } ;
 * function   = "fn" IDENT "(" [ IDENT { "," IDENT } ] ")" block ;   (* 最上位だけ *)
 * statement  = "let" IDENT "=" expr ";"
 *            | IDENT "=" expr ";"
 *            | "if" expr block [ "else" block ]
 *            | "while" expr block                (* 反復の上限つき *)
 *            | "return" expr ";"
 *            | "emit" expr ";"                   (* 出力はこれだけ。結果の配列へ積むだけで外へは出ない *)
 *            | expr ";" ;
 * block      = "{" { statement } "}" ;
 * expr       = or ;   or = and { "||" and } ;   and = eq { "&&" eq } ;
 * eq         = cmp { ( "==" | "!=" ) cmp } ;    cmp = add { ( "<" | "<=" | ">" | ">=" ) add } ;
 * add        = mul { ( "+" | "-" ) mul } ;      mul = unary { ( "*" | "/" | "%" ) unary } ;
 * unary      = ( "-" | "!" ) unary | call ;
 * call       = primary | IDENT "(" [ expr { "," expr } ] ")" ;
 * primary    = NUMBER | STRING | "true" | "false" | IDENT | "(" expr ")" ;
 * 注記       = "#" から行末まで
 * ```
 *
 * 型は 数 / 文字列 / 真偽 の 3 つ。**条件は真偽だけ** (真偽でない値は断る・暗黙の変換をしない)。
 * 異なる型の `+` は断る (`str()` で文字列にする)。環境は不変の `Map` で、代入のたびに新しい
 * `Map` を作る。関数は最上位の変数を見ない (引数だけを見る)。
 *
 * ## 天井 (全部、超えたら**切らずに断る**)
 *
 * 名前のある定数に集めた。境界ちょうどは通り、+1 で断る (検査が踏む)。
 * ソースの大きさは**文字**で数える (`moreThanChars` —— コード単位ではない)。
 */
import { countChars, moreThanChars } from '../../shared/inputCeiling';
import { readNumeric } from '../../shared/readNumeric';

/** ソースの大きさ (文字)。 */
export const MAX_SOURCE_CHARS = 10_000;
/** 字句の数。 */
export const MAX_TOKENS = 2_000;
/** 括弧・ブロック・単項演算の入れ子の深さ。 */
export const MAX_NESTING_DEPTH = 16;
/** 式の木の高さ (長い `a+b+c+…` も高さに数える。実行の再帰を有限に保つ)。 */
export const MAX_EXPRESSION_DEPTH = 32;
/** 関数の数。 */
export const MAX_FUNCTIONS = 16;
/** 関数 1 つの引数の数 (呼び出しの実引数の数も同じ天井)。 */
export const MAX_PARAMS = 8;
/** 実行する文と関数呼び出しと反復の条件確認の合計。 */
export const MAX_STEPS = 20_000;
/** 1 つの `while` が回してよい回数。 */
export const MAX_LOOP_ITERATIONS = 1_000;
/** 関数呼び出しの入れ子。 */
export const MAX_CALL_DEPTH = 16;
/** 出力の行数。 */
export const MAX_OUTPUT_LINES = 100;
/** 出力の合計文字数。 */
export const MAX_OUTPUT_CHARS = 2_000;
/** 文字列 1 つの文字数 (リテラルも連結の結果も)。 */
export const MAX_STRING_CHARS = 500;
/** 同時に持てる変数の数。 */
export const MAX_VARIABLES = 64;
/** 数の絶対値の上限 (これを超える結果は断る)。 */
export const MAX_ABS_NUMBER = 1_000_000_000_000_000;

export type AegisLimitName =
  | 'MAX_SOURCE_CHARS'
  | 'MAX_TOKENS'
  | 'MAX_NESTING_DEPTH'
  | 'MAX_EXPRESSION_DEPTH'
  | 'MAX_FUNCTIONS'
  | 'MAX_PARAMS'
  | 'MAX_STEPS'
  | 'MAX_LOOP_ITERATIONS'
  | 'MAX_CALL_DEPTH'
  | 'MAX_OUTPUT_LINES'
  | 'MAX_OUTPUT_CHARS'
  | 'MAX_STRING_CHARS'
  | 'MAX_VARIABLES'
  | 'MAX_ABS_NUMBER';

export type AegisValue = number | string | boolean;

export type AegisErrorKind = 'lex' | 'parse' | 'runtime' | 'limit' | 'unsafe' | 'internal';

/** 失敗は例外ではなく結果の型で返す。`message` は利用者に見せる日本語、`line` は 1 始まり。 */
export interface AegisFailure {
  readonly ok: false;
  readonly kind: Exclude<AegisErrorKind, 'unsafe'>;
  readonly message: string;
  readonly line: number;
  /** `kind` が `limit` のとき、超えた天井の名前。 */
  readonly limit?: AegisLimitName;
}

export interface AegisSuccess {
  readonly ok: true;
  /** `return` した値 (無ければ `null`)。 */
  readonly value: AegisValue | null;
  readonly output: readonly string[];
  readonly steps: number;
  /** 終わったときの最上位の変数 (不変の Map)。 */
  readonly env: ReadonlyMap<string, AegisValue>;
}

export type AegisResult = AegisSuccess | AegisFailure;

/** 実行時の天井を**締めるだけ**の指定 (天井より大きい・読めない値は天井のまま)。 */
export interface AegisRunOptions {
  readonly maxSteps?: number;
  readonly maxLoopIterations?: number;
  readonly maxCallDepth?: number;
  readonly maxOutputLines?: number;
  readonly maxOutputChars?: number;
  readonly maxStringChars?: number;
  readonly maxVariables?: number;
}

// ───────────────────────────── 字句 ─────────────────────────────

export type TokenType = 'num' | 'str' | 'ident' | 'kw' | 'op' | 'eof';

export interface Token {
  readonly type: TokenType;
  readonly text: string;
  readonly value?: number | string;
  readonly line: number;
  /** ソース上の位置 (UTF-16 の添字・終端は含まない)。修復の提案が範囲を切り出すのに使う。 */
  readonly start: number;
  readonly end: number;
}

export const KEYWORDS: readonly string[] = ['let', 'if', 'else', 'while', 'fn', 'return', 'emit', 'true', 'false'];

const TWO_CHAR_OPS: readonly string[] = ['==', '!=', '<=', '>=', '&&', '||'];
const ONE_CHAR_OPS = '+-*/%<>!=(){},;';

/** 内部の中断。外へは出さず、公開の関数が結果の型へ直す。 */
class Abort extends Error {
  readonly failure: AegisFailure;
  constructor(failure: AegisFailure) {
    super(failure.message);
    this.failure = failure;
  }
}

function abort(kind: AegisFailure['kind'], message: string, line: number, limit?: AegisLimitName): never {
  throw new Abort(limit === undefined ? { ok: false, kind, message, line } : { ok: false, kind, message, line, limit });
}

function limitAbort(limit: AegisLimitName, message: string, line: number): never {
  return abort('limit', message, line, limit);
}

const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isIdentStart = (c: string): boolean => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isIdentPart = (c: string): boolean => isIdentStart(c) || isDigit(c);
/** 開始位置から読む識別子と数 (sticky: `lastIndex` から始まる)。 */
const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER = /[0-9]+(?:\.[0-9]+)?/y;

/** 字句に分ける。失敗は結果の型で返す。 */
export function lexAegis(source: string): { readonly ok: true; readonly tokens: readonly Token[] } | AegisFailure {
  try {
    return { ok: true, tokens: lexOrAbort(source) };
  } catch (e) {
    return failureOf(e);
  }
}

function lexOrAbort(source: string): Token[] {
  if (moreThanChars(source, MAX_SOURCE_CHARS)) {
    limitAbort('MAX_SOURCE_CHARS', `ソースが長すぎます (上限 ${MAX_SOURCE_CHARS} 文字)。分けて書いてください。`, 1);
  }
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const push = (type: TokenType, text: string, start: number, value?: number | string): void => {
    // 終端 (eof) は数えない: 天井は「書かれた字句」の数である。
    if (type !== 'eof' && tokens.length >= MAX_TOKENS) {
      limitAbort('MAX_TOKENS', `字句が多すぎます (上限 ${MAX_TOKENS} 個)。分けて書いてください。`, line);
    }
    const base = { type, text, line, start, end: start + text.length };
    tokens.push(value === undefined ? base : { ...base, value });
  };
  while (i < source.length) {
    const c = source.charAt(i);
    if (c === '\n') {
      line += 1;
      i += 1;
    } else if (c === ' ' || c === '\t' || c === '\r') {
      i += 1;
    } else if (c === '#') {
      const eol = source.indexOf('\n', i);
      i = eol === -1 ? source.length : eol;
    } else if (isDigit(c)) {
      i = lexNumber(source, i, line, push);
    } else if (isIdentStart(c)) {
      IDENT.lastIndex = i;
      const word = IDENT.exec(source)![0];
      push(KEYWORDS.includes(word) ? 'kw' : 'ident', word, i);
      i += word.length;
    } else if (c === '"') {
      i = lexString(source, i, line, push);
    } else {
      i = lexOperator(source, i, line, push);
    }
  }
  push('eof', '', source.length);
  return tokens;
}

type Push = (type: TokenType, text: string, start: number, value?: number | string) => void;

function lexNumber(source: string, start: number, line: number, push: Push): number {
  NUMBER.lastIndex = start;
  const text = NUMBER.exec(source)![0];
  const i = start + text.length;
  const next = source.charAt(i);
  if (next === '.' || isIdentPart(next)) {
    abort('lex', '数の形が正しくありません。数は 12 や 3.5 のように書きます。', line);
  }
  // 数の読みは共有の 1 つ (readNumeric) を通す —— 自前の読みは書かない。
  const n = readNumeric(text);
  // 読めない数 (桁があふれる物) は利用者の入力そのままを echo しない (最長 1 万文字になりうる)。
  if (n === null) abort('lex', '数として読めません。桁が多すぎます。', line);
  if (n > MAX_ABS_NUMBER) {
    limitAbort('MAX_ABS_NUMBER', `数が大きすぎます (絶対値の上限 ${MAX_ABS_NUMBER})。`, line);
  }
  push('num', text, start, n);
  return i;
}

function lexString(source: string, start: number, line: number, push: Push): number {
  let i = start + 1;
  let out = '';
  for (;;) {
    const c = source[i]; // 終わりの外は undefined
    if (c === undefined) abort('lex', '文字列が閉じていません。「"」で閉じてください。', line);
    if (c === '"') break;
    if (c === '\n') abort('lex', '文字列の途中で行が終わっています。改行は「\\n」と書きます。', line);
    if (c === '\\') {
      const e = source.charAt(i + 1);
      if (e === 'n') out += '\n';
      else if (e === '"') out += '"';
      else if (e === '\\') out += '\\';
      else abort('lex', `「\\${e}」は使えない書き方です。使えるのは \\n \\" \\\\ だけです。`, line);
      i += 2;
    } else {
      out += c;
      i += 1;
    }
    if (moreThanChars(out, MAX_STRING_CHARS)) {
      limitAbort('MAX_STRING_CHARS', `文字列が長すぎます (上限 ${MAX_STRING_CHARS} 文字)。`, line);
    }
  }
  push('str', source.slice(start, i + 1), start, out);
  return i + 1;
}

function lexOperator(source: string, i: number, line: number, push: Push): number {
  const two = source.slice(i, i + 2);
  if (TWO_CHAR_OPS.includes(two)) {
    push('op', two, i);
    return i + 2;
  }
  const c = source.charAt(i);
  if (ONE_CHAR_OPS.includes(c)) {
    push('op', c, i);
    return i + 1;
  }
  if (c === '&' || c === '|') {
    abort('lex', `「${c}」は単独では使えません。論理積は「&&」、論理和は「||」です。`, line);
  }
  if (c === '@') {
    abort('lex', '「@」は使えません。この言語に自己書き換えの印はありません。', line);
  }
  abort('lex', `「${c}」は使えない文字です。`, line);
}

// ───────────────────────────── 構文 ─────────────────────────────

export type Expr =
  | { readonly k: 'num'; readonly v: number; readonly line: number; readonly h: number }
  | { readonly k: 'str'; readonly v: string; readonly line: number; readonly h: number }
  | { readonly k: 'bool'; readonly v: boolean; readonly line: number; readonly h: number }
  | { readonly k: 'var'; readonly name: string; readonly line: number; readonly h: number }
  | { readonly k: 'un'; readonly op: '-' | '!'; readonly e: Expr; readonly line: number; readonly h: number }
  | { readonly k: 'bin'; readonly op: string; readonly l: Expr; readonly r: Expr; readonly line: number; readonly h: number }
  | { readonly k: 'call'; readonly name: string; readonly args: readonly Expr[]; readonly line: number; readonly h: number };

export type Stmt =
  | { readonly k: 'let' | 'set'; readonly name: string; readonly e: Expr; readonly line: number }
  | { readonly k: 'if'; readonly c: Expr; readonly then: readonly Stmt[]; readonly otherwise: readonly Stmt[] | null; readonly line: number }
  | { readonly k: 'while'; readonly c: Expr; readonly body: readonly Stmt[]; readonly line: number }
  | { readonly k: 'return' | 'emit' | 'expr'; readonly e: Expr; readonly line: number };

export interface FnDecl {
  readonly name: string;
  readonly params: readonly string[];
  readonly body: readonly Stmt[];
  readonly line: number;
}

export interface Program {
  readonly fns: readonly FnDecl[];
  readonly body: readonly Stmt[];
}

/** 言語が持つ組み込み関数 (台帳)。**入出力・ファイル・ネットワークの物は 1 つも無い。** */
export const BUILTIN_FUNCTIONS: Readonly<Record<string, { readonly arity: number; readonly why: string }>> = {
  len: { arity: 1, why: '文字列の長さ (文字数)' },
  str: { arity: 1, why: '値を文字列にする' },
  abs: { arity: 1, why: '絶対値' },
  min: { arity: 2, why: '小さいほう' },
  max: { arity: 2, why: '大きいほう' },
  floor: { arity: 1, why: '切り捨て' },
};

const isBuiltin = (name: string): boolean => Object.hasOwn(BUILTIN_FUNCTIONS, name);

const heightOf = (...children: readonly Expr[]): number => 1 + Math.max(...children.map((c) => c.h));

/** 構文木にする。失敗は結果の型で返す。 */
export function parseAegis(source: string): { readonly ok: true; readonly program: Program } | AegisFailure {
  try {
    return { ok: true, program: parseOrAbort(lexOrAbort(source)) };
  } catch (e) {
    return failureOf(e);
  }
}

function parseOrAbort(tokens: readonly Token[]): Program {
  let p = 0;
  let depth = 0;
  const peek = (): Token => tokens[p]!;
  const next = (): Token => tokens[p++]!;
  // 文字列の字句の text は引用符つきなので、演算子・予約語の綴りと取り違えることは無い。
  const isOp = (t: Token, text: string): boolean => t.text === text;
  const isKw = (t: Token, text: string): boolean => t.text === text;
  const describe = (t: Token): string => (t.type === 'eof' ? 'プログラムの終わり' : `「${t.text}」`);

  const expectOp = (text: string): Token => {
    const t = peek();
    if (!isOp(t, text)) abort('parse', `「${text}」が必要です。ここには${describe(t)}があります。`, t.line);
    return next();
  };
  const expectIdent = (what: string): Token => {
    const t = peek();
    if (t.type !== 'ident') abort('parse', `${what}が必要です。ここには${describe(t)}があります。`, t.line);
    return next();
  };
  const enter = (line: number): void => {
    depth += 1;
    if (depth > MAX_NESTING_DEPTH) {
      limitAbort('MAX_NESTING_DEPTH', `入れ子が深すぎます (上限 ${MAX_NESTING_DEPTH} 段)。式や処理を分けてください。`, line);
    }
  };
  const leave = (): void => {
    depth -= 1;
  };
  const checkHeight = (e: Expr): Expr => {
    if (e.h > MAX_EXPRESSION_DEPTH) {
      limitAbort('MAX_EXPRESSION_DEPTH', `式が長すぎます (式の高さの上限 ${MAX_EXPRESSION_DEPTH})。途中の結果を変数に分けてください。`, e.line);
    }
    return e;
  };

  const parsePrimary = (): Expr => {
    const t = next();
    if (t.type === 'num') return { k: 'num', v: t.value as number, line: t.line, h: 1 };
    if (t.type === 'str') return { k: 'str', v: t.value as string, line: t.line, h: 1 };
    if (isKw(t, 'true') || isKw(t, 'false')) return { k: 'bool', v: t.text === 'true', line: t.line, h: 1 };
    if (t.type === 'ident') {
      if (!isOp(peek(), '(')) return { k: 'var', name: t.text, line: t.line, h: 1 };
      next();
      enter(t.line);
      const args: Expr[] = [];
      if (!isOp(peek(), ')')) {
        for (;;) {
          args.push(parseExpr());
          if (args.length > MAX_PARAMS) {
            limitAbort('MAX_PARAMS', `引数が多すぎます (上限 ${MAX_PARAMS} 個)。`, t.line);
          }
          if (!isOp(peek(), ',')) break;
          next();
        }
      }
      expectOp(')');
      leave();
      return checkHeight({ k: 'call', name: t.text, args, line: t.line, h: 1 + Math.max(0, ...args.map((a) => a.h)) });
    }
    if (isOp(t, '(')) {
      enter(t.line);
      const e = parseExpr();
      expectOp(')');
      leave();
      return e;
    }
    return abort('parse', `式が必要です。ここには${describe(t)}があります。`, t.line);
  };

  const parseUnary = (): Expr => {
    const t = peek();
    if (isOp(t, '-') || isOp(t, '!')) {
      next();
      enter(t.line);
      const e = parseUnary();
      leave();
      return checkHeight({ k: 'un', op: t.text as '-' | '!', e, line: t.line, h: heightOf(e) });
    }
    return parsePrimary();
  };

  const binaryLevel = (ops: readonly string[], sub: () => Expr): (() => Expr) => (): Expr => {
    let l = sub();
    while (ops.includes(peek().text)) {
      const op = next();
      const r = sub();
      l = checkHeight({ k: 'bin', op: op.text, l, r, line: op.line, h: heightOf(l, r) });
    }
    return l;
  };
  const parseMul = binaryLevel(['*', '/', '%'], parseUnary);
  const parseAdd = binaryLevel(['+', '-'], parseMul);
  const parseCmp = binaryLevel(['<', '<=', '>', '>='], parseAdd);
  const parseEq = binaryLevel(['==', '!='], parseCmp);
  const parseAnd = binaryLevel(['&&'], parseEq);
  const parseOr = binaryLevel(['||'], parseAnd);
  function parseExpr(): Expr {
    return parseOr();
  }

  const parseBlock = (): Stmt[] => {
    const open = expectOp('{');
    enter(open.line);
    const body: Stmt[] = [];
    while (!isOp(peek(), '}')) {
      if (peek().type === 'eof') abort('parse', '「}」が閉じていません。', open.line);
      body.push(parseStatement());
    }
    next();
    leave();
    return body;
  };

  function parseStatement(): Stmt {
    const t = peek();
    // 最上位の `fn` は下の本体の走査が先に拾うので、ここへ来る `fn` はブロックの中の物である。
    if (isKw(t, 'fn')) abort('parse', '関数は最上位でだけ定義できます。', t.line);
    if (isKw(t, 'let')) {
      next();
      const name = expectIdent('変数の名前');
      expectOp('=');
      const e = parseExpr();
      expectOp(';');
      return { k: 'let', name: name.text, e, line: t.line };
    }
    if (isKw(t, 'if')) {
      next();
      const c = parseExpr();
      const then = parseBlock();
      let otherwise: Stmt[] | null = null;
      if (isKw(peek(), 'else')) {
        next();
        otherwise = parseBlock();
      }
      return { k: 'if', c, then, otherwise, line: t.line };
    }
    if (isKw(t, 'while')) {
      next();
      const c = parseExpr();
      return { k: 'while', c, body: parseBlock(), line: t.line };
    }
    if (isKw(t, 'return') || isKw(t, 'emit')) {
      next();
      const e = parseExpr();
      expectOp(';');
      return { k: t.text as 'return' | 'emit', e, line: t.line };
    }
    if (t.type === 'ident' && isOp(tokens[p + 1]!, '=')) {
      next();
      next();
      const e = parseExpr();
      expectOp(';');
      return { k: 'set', name: t.text, e, line: t.line };
    }
    const e = parseExpr();
    expectOp(';');
    return { k: 'expr', e, line: t.line };
  }

  const parseFunction = (): FnDecl => {
    const kw = next();
    const name = expectIdent('関数の名前');
    if (isBuiltin(name.text)) abort('parse', `「${name.text}」は組み込みの関数名なので使えません。`, name.line);
    expectOp('(');
    const params: string[] = [];
    if (!isOp(peek(), ')')) {
      for (;;) {
        const param = expectIdent('引数の名前');
        if (params.includes(param.text)) abort('parse', `引数「${param.text}」が重複しています。`, param.line);
        params.push(param.text);
        if (params.length > MAX_PARAMS) {
          limitAbort('MAX_PARAMS', `引数が多すぎます (上限 ${MAX_PARAMS} 個)。`, param.line);
        }
        if (!isOp(peek(), ',')) break;
        next();
      }
    }
    expectOp(')');
    return { name: name.text, params, body: parseBlock(), line: kw.line };
  };

  const fns: FnDecl[] = [];
  const body: Stmt[] = [];
  while (peek().type !== 'eof') {
    if (isKw(peek(), 'fn')) {
      const fn = parseFunction();
      if (fns.some((f) => f.name === fn.name)) abort('parse', `関数「${fn.name}」が重複して定義されています。`, fn.line);
      if (fns.length >= MAX_FUNCTIONS) {
        limitAbort('MAX_FUNCTIONS', `関数が多すぎます (上限 ${MAX_FUNCTIONS} 個)。`, fn.line);
      }
      fns.push(fn);
    } else {
      body.push(parseStatement());
    }
  }
  return { fns, body };
}

// ───────────────────────────── 実行 ─────────────────────────────

type Env = ReadonlyMap<string, AegisValue>;

interface Limits {
  readonly maxSteps: number;
  readonly maxLoopIterations: number;
  readonly maxCallDepth: number;
  readonly maxOutputLines: number;
  readonly maxOutputChars: number;
  readonly maxStringChars: number;
  readonly maxVariables: number;
}

/** 締めるだけ: 天井以下の非負の整数だけを採り、それ以外 (読めない値・小数・負) は天井のまま。 */
function tighten(requested: number | undefined, ceiling: number): number {
  // `Number.isInteger` は数でない値・NaN・無限・小数を偽にする。
  return Number.isInteger(requested) && requested! >= 0 ? Math.min(requested!, ceiling) : ceiling;
}

function resolveLimits(o: AegisRunOptions): Limits {
  return {
    maxSteps: tighten(o.maxSteps, MAX_STEPS),
    maxLoopIterations: tighten(o.maxLoopIterations, MAX_LOOP_ITERATIONS),
    maxCallDepth: tighten(o.maxCallDepth, MAX_CALL_DEPTH),
    maxOutputLines: tighten(o.maxOutputLines, MAX_OUTPUT_LINES),
    maxOutputChars: tighten(o.maxOutputChars, MAX_OUTPUT_CHARS),
    maxStringChars: tighten(o.maxStringChars, MAX_STRING_CHARS),
    maxVariables: tighten(o.maxVariables, MAX_VARIABLES),
  };
}

interface Ctx {
  steps: number;
  readonly output: string[];
  outputChars: number;
  readonly fns: ReadonlyMap<string, FnDecl>;
  readonly lim: Limits;
  callDepth: number;
}

interface Flow {
  readonly env: Env;
  readonly returned: boolean;
  readonly value?: AegisValue;
}

function typeName(v: AegisValue): string {
  switch (typeof v) {
    case 'number':
      return '数';
    case 'string':
      return '文字列';
    default:
      return '真偽';
  }
}

const showValue = (v: AegisValue): string => String(v);

function tick(ctx: Ctx, line: number): void {
  ctx.steps += 1;
  if (ctx.steps > ctx.lim.maxSteps) {
    limitAbort('MAX_STEPS', `実行ステップが上限 (${ctx.lim.maxSteps}) を超えました。処理を軽くしてください。`, line);
  }
}

/** 数の結果の関門。非有限と天井超えは断り、`-0` は `0` にそろえる。 */
function checkNumber(n: number, line: number): number {
  if (!Number.isFinite(n) || Math.abs(n) > MAX_ABS_NUMBER) {
    limitAbort('MAX_ABS_NUMBER', `数が大きすぎます (絶対値の上限 ${MAX_ABS_NUMBER})。`, line);
  }
  // `-0` に 0 を足すと `+0` になる (画面に「-0」と出さない)。
  return n + 0;
}

function bind(env: Env, name: string, v: AegisValue, ctx: Ctx, line: number): Env {
  if (!env.has(name) && env.size >= ctx.lim.maxVariables) {
    limitAbort('MAX_VARIABLES', `変数が多すぎます (上限 ${ctx.lim.maxVariables} 個)。`, line);
  }
  return new Map(env).set(name, v);
}

function condition(e: Expr, env: Env, ctx: Ctx): boolean {
  const v = evalExpr(e, env, ctx);
  if (typeof v !== 'boolean') {
    abort('runtime', `条件は true か false でなければなりません。ここは${typeName(v)}です。`, e.line);
  }
  return v;
}

function execBlock(stmts: readonly Stmt[], start: Env, ctx: Ctx): Flow {
  let env = start;
  for (const s of stmts) {
    const f = execStmt(s, env, ctx);
    if (f.returned) return f;
    env = f.env;
  }
  return { env, returned: false };
}

function execStmt(s: Stmt, env: Env, ctx: Ctx): Flow {
  if (s.k === 'while') return execWhile(s, env, ctx);
  tick(ctx, s.line);
  switch (s.k) {
    case 'let': {
      if (env.has(s.name)) abort('runtime', `「${s.name}」はすでに定義されています。値を変えるときは「${s.name} = …;」と書きます。`, s.line);
      return { env: bind(env, s.name, evalExpr(s.e, env, ctx), ctx, s.line), returned: false };
    }
    case 'set': {
      if (!env.has(s.name)) abort('runtime', `「${s.name}」は定義されていません。先に「let ${s.name} = …;」と書いてください。`, s.line);
      return { env: bind(env, s.name, evalExpr(s.e, env, ctx), ctx, s.line), returned: false };
    }
    case 'if': {
      const branch = condition(s.c, env, ctx) ? s.then : s.otherwise;
      return branch === null ? { env, returned: false } : execBlock(branch, env, ctx);
    }
    case 'return':
      return { env, returned: true, value: evalExpr(s.e, env, ctx) };
    case 'emit': {
      addOutput(ctx, showValue(evalExpr(s.e, env, ctx)), s.line);
      return { env, returned: false };
    }
    default: {
      // 式文。関数が値を返さなくてもよい (値を使う所だけが断る)。
      if (s.e.k === 'call') callFunction(s.e, env, ctx);
      else evalExpr(s.e, env, ctx);
      return { env, returned: false };
    }
  }
}

function execWhile(s: Extract<Stmt, { k: 'while' }>, start: Env, ctx: Ctx): Flow {
  let env = start;
  let iterations = 0;
  for (;;) {
    tick(ctx, s.line);
    if (!condition(s.c, env, ctx)) return { env, returned: false };
    iterations += 1;
    if (iterations > ctx.lim.maxLoopIterations) {
      limitAbort('MAX_LOOP_ITERATIONS', `ループが上限 (${ctx.lim.maxLoopIterations} 回) を超えました。終わる条件を確かめてください。`, s.line);
    }
    const f = execBlock(s.body, env, ctx);
    if (f.returned) return f;
    env = f.env;
  }
}

function addOutput(ctx: Ctx, text: string, line: number): void {
  if (ctx.output.length + 1 > ctx.lim.maxOutputLines) {
    limitAbort('MAX_OUTPUT_LINES', `出力が上限 (${ctx.lim.maxOutputLines} 行) を超えました。`, line);
  }
  const chars = ctx.outputChars + countChars(text);
  if (chars > ctx.lim.maxOutputChars) {
    limitAbort('MAX_OUTPUT_CHARS', `出力が上限 (${ctx.lim.maxOutputChars} 文字) を超えました。`, line);
  }
  ctx.output.push(text);
  ctx.outputChars = chars;
}

function evalExpr(e: Expr, env: Env, ctx: Ctx): AegisValue {
  switch (e.k) {
    case 'num':
    case 'str':
    case 'bool':
      return e.v;
    case 'var': {
      const v = env.get(e.name);
      if (v === undefined) {
        const hint = ctx.fns.has(e.name) || isBuiltin(e.name) ? '関数は「名前(…)」の形で呼び出します。' : '先に「let」で定義してください。';
        abort('runtime', `「${e.name}」は定義されていません。${hint}`, e.line);
      }
      return v;
    }
    case 'un': {
      const v = evalExpr(e.e, env, ctx);
      if (e.op === '!') {
        if (typeof v !== 'boolean') abort('runtime', `「!」は true / false に使います。ここは${typeName(v)}です。`, e.line);
        return !v;
      }
      if (typeof v !== 'number') abort('runtime', `「-」は数に使います。ここは${typeName(v)}です。`, e.line);
      return checkNumber(-v, e.line);
    }
    case 'bin':
      return evalBinary(e, env, ctx);
    case 'call': {
      const v = callFunction(e, env, ctx);
      if (v === undefined) abort('runtime', `関数「${e.name}」は値を返しません。値を使うには「return …;」で返してください。`, e.line);
      return v;
    }
  }
}

function evalBinary(e: Extract<Expr, { k: 'bin' }>, env: Env, ctx: Ctx): AegisValue {
  if (e.op === '&&' || e.op === '||') {
    const l = evalExpr(e.l, env, ctx);
    if (typeof l !== 'boolean') abort('runtime', `「${e.op}」は true / false に使います。左側は${typeName(l)}です。`, e.line);
    if (e.op === '&&' ? !l : l) return l;
    const r = evalExpr(e.r, env, ctx);
    if (typeof r !== 'boolean') abort('runtime', `「${e.op}」は true / false に使います。右側は${typeName(r)}です。`, e.line);
    return r;
  }
  const l = evalExpr(e.l, env, ctx);
  const r = evalExpr(e.r, env, ctx);
  if (e.op === '==') return l === r;
  if (e.op === '!=') return l !== r;
  if (typeof l === 'string' && typeof r === 'string') {
    if (e.op === '+') {
      const joined = l + r;
      if (moreThanChars(joined, ctx.lim.maxStringChars)) {
        limitAbort('MAX_STRING_CHARS', `文字列が長すぎます (上限 ${ctx.lim.maxStringChars} 文字)。`, e.line);
      }
      return joined;
    }
    if (e.op === '<') return l < r;
    if (e.op === '<=') return l <= r;
    if (e.op === '>') return l > r;
    if (e.op === '>=') return l >= r;
    abort('runtime', `「${e.op}」は文字列には使えません。`, e.line);
  }
  if (typeof l !== 'number' || typeof r !== 'number') {
    const hint = e.op === '+' ? '数と文字列をつなぐときは str() で文字列にします。' : '';
    abort('runtime', `「${e.op}」は同じ型どうしに使います。左は${typeName(l)}、右は${typeName(r)}です。${hint}`, e.line);
  }
  switch (e.op) {
    case '+':
      return checkNumber(l + r, e.line);
    case '-':
      return checkNumber(l - r, e.line);
    case '*':
      return checkNumber(l * r, e.line);
    case '/':
      if (r === 0) abort('runtime', '0 で割ることはできません。', e.line);
      return checkNumber(l / r, e.line);
    case '%':
      if (r === 0) abort('runtime', '0 で割った余りは求められません。', e.line);
      return checkNumber(l % r, e.line);
    case '<':
      return l < r;
    case '<=':
      return l <= r;
    case '>':
      return l > r;
    default:
      return l >= r;
  }
}

/** 呼び出し。値を返さない関数は `undefined`。 */
function callFunction(e: Extract<Expr, { k: 'call' }>, env: Env, ctx: Ctx): AegisValue | undefined {
  tick(ctx, e.line);
  const args = e.args.map((a) => evalExpr(a, env, ctx));
  if (isBuiltin(e.name)) return callBuiltin(e.name, args, e.line);
  const fn = ctx.fns.get(e.name);
  if (fn === undefined) abort('runtime', `関数「${e.name}」は定義されていません。`, e.line);
  if (args.length !== fn.params.length) {
    abort('runtime', `関数「${e.name}」は引数を ${fn.params.length} 個受け取ります。${args.length} 個渡されました。`, e.line);
  }
  if (ctx.callDepth + 1 > ctx.lim.maxCallDepth) {
    limitAbort('MAX_CALL_DEPTH', `関数の呼び出しが深すぎます (上限 ${ctx.lim.maxCallDepth} 段)。自分自身を呼ぶ関数は終わる条件を確かめてください。`, e.line);
  }
  // 関数は最上位の変数を見ない: 引数だけの新しい環境で動く。
  let local: Env = new Map();
  fn.params.forEach((name, i) => {
    local = bind(local, name, args[i]!, ctx, e.line);
  });
  ctx.callDepth += 1;
  const flow = execBlock(fn.body, local, ctx);
  ctx.callDepth -= 1;
  return flow.returned ? flow.value : undefined;
}

function callBuiltin(name: string, args: readonly AegisValue[], line: number): AegisValue {
  const need = BUILTIN_FUNCTIONS[name]!.arity;
  if (args.length !== need) abort('runtime', `「${name}」は引数を ${need} 個受け取ります。${args.length} 個渡されました。`, line);
  const a = args[0]!;
  const b = args[1];
  if (name === 'len') {
    if (typeof a !== 'string') abort('runtime', `「len」は文字列に使います。ここは${typeName(a)}です。`, line);
    return countChars(a);
  }
  if (name === 'str') return showValue(a);
  if (typeof a !== 'number' || (b !== undefined && typeof b !== 'number')) {
    abort('runtime', `「${name}」は数に使います。`, line);
  }
  if (name === 'abs') return checkNumber(Math.abs(a), line);
  if (name === 'floor') return checkNumber(Math.floor(a), line);
  return name === 'min' ? Math.min(a, b as number) : Math.max(a, b as number);
}

function failureOf(e: unknown): AegisFailure {
  if (e instanceof Abort) return e.failure;
  return { ok: false, kind: 'internal', message: '内部のエラーのため実行を止めました。', line: 0 };
}

/**
 * 実行する (**走査はしない** —— 規則の走査を通す入口は `aegisLangSafety.ts` の `runAegis`)。
 * ここが持つ天井と、組み込みに外へ出る物が無いことが、実行の安全の本体である。
 */
export function executeAegis(source: string, options: AegisRunOptions = {}): AegisResult {
  try {
    const program = parseOrAbort(lexOrAbort(source));
    const ctx: Ctx = {
      steps: 0,
      output: [],
      outputChars: 0,
      fns: new Map(program.fns.map((f) => [f.name, f])),
      lim: resolveLimits(options),
      callDepth: 0,
    };
    const flow = execBlock(program.body, new Map(), ctx);
    return {
      ok: true,
      value: flow.value ?? null, // `value` は return したときだけ在る
      output: ctx.output,
      steps: ctx.steps,
      env: flow.env,
    };
  } catch (e) {
    return failureOf(e);
  }
}

import { describe, expect, it } from 'vitest';
import {
  BUILTIN_FUNCTIONS,
  KEYWORDS,
  MAX_ABS_NUMBER,
  MAX_CALL_DEPTH,
  MAX_EXPRESSION_DEPTH,
  MAX_FUNCTIONS,
  MAX_LOOP_ITERATIONS,
  MAX_NESTING_DEPTH,
  MAX_OUTPUT_CHARS,
  MAX_OUTPUT_LINES,
  MAX_PARAMS,
  MAX_SOURCE_CHARS,
  MAX_STEPS,
  MAX_STRING_CHARS,
  MAX_TOKENS,
  MAX_VARIABLES,
  executeAegis,
  lexAegis,
  parseAegis,
  type AegisFailure,
  type AegisSuccess,
} from '../aegisLang';

/** 成功だけを取り出す (失敗なら理由を刷って落とす)。 */
function ok(source: string): AegisSuccess {
  const r = executeAegis(source);
  if (!r.ok) throw new Error(`失敗した: ${r.kind} / ${r.message} / 行 ${r.line}`);
  return r;
}

/** 失敗だけを取り出す (成功したら落とす)。 */
function bad(source: string, options?: Parameters<typeof executeAegis>[1]): AegisFailure {
  const r = executeAegis(source, options);
  if (r.ok) throw new Error(`成功してしまった: ${JSON.stringify(r.output)}`);
  return r;
}

const out = (source: string): readonly string[] => ok(source).output;
const msg = (source: string, options?: Parameters<typeof executeAegis>[1]): string => bad(source, options).message;

describe('字句解析', () => {
  it('数・文字列・識別子・予約語・記号に分け、行番号と位置を持つ', () => {
    const r = lexAegis('let x = 12.5; # 注記\r\nemit "a\\nb";');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens.map((t) => [t.type, t.text, t.line])).toEqual([
      ['kw', 'let', 1],
      ['ident', 'x', 1],
      ['op', '=', 1],
      ['num', '12.5', 1],
      ['op', ';', 1],
      ['kw', 'emit', 2],
      ['str', '"a\\nb"', 2],
      ['op', ';', 2],
      ['eof', '', 2],
    ]);
    expect(r.tokens[3]!.value).toBe(12.5);
    expect(r.tokens[6]!.value).toBe('a\nb');
    // 位置はソースの UTF-16 添字 (終端は含まない)
    const src = 'let x = 12.5;';
    const lexed = lexAegis(src);
    const t = lexed.ok ? lexed.tokens[3] : undefined;
    expect(t && src.slice(t.start, t.end)).toBe('12.5');
  });

  it('二文字の演算子を一文字より先に読む', () => {
    const r = lexAegis('a == b != c <= d >= e && f || g < h > i');
    expect(r.ok && r.tokens.filter((t) => t.type === 'op').map((t) => t.text)).toEqual(['==', '!=', '<=', '>=', '&&', '||', '<', '>']);
  });

  it('予約語の台帳は 9 語で、予約語は識別子にならない', () => {
    expect(KEYWORDS).toEqual(['let', 'if', 'else', 'while', 'fn', 'return', 'emit', 'true', 'false']);
    const r = lexAegis('letter let');
    expect(r.ok && r.tokens.map((t) => t.type)).toEqual(['ident', 'kw', 'eof']);
  });

  it('文字列のエスケープは \\n \\" \\\\ だけ', () => {
    expect(out('emit "a\\"b\\\\c\\nd";')).toEqual(['a"b\\c\nd']);
    const r = bad('emit "a\\tb";');
    expect(r.kind).toBe('lex');
    expect(r.message).toContain('使えない書き方');
  });

  it.each([
    ['@optimize_self', '@', 1],
    ['\n\nlet a = 1 & 2;', '&', 3],
    ['let a = 1 | 2;', '|', 1],
    ['let a = $x;', '$', 1],
    ['let a = "abc;', '閉じていません', 1],
    ['let a = 1;\nlet b = "x\ny";', '行が終わっています', 2],
    ['let a = 1.;', '数の形', 1],
    ['let a = 1.2.3;', '数の形', 1],
    ['let a = 3x;', '数の形', 1],
  ])('字句の誤りは lex の結果で、行番号を持つ: %j', (source, needle, line) => {
    const r = bad(source);
    expect(r.kind).toBe('lex');
    expect(r.message).toContain(needle);
    expect(r.line).toBe(line);
  });

  it('日本語の識別子は使えない (ASCII だけ)', () => {
    const r = bad('let 変数 = 1;');
    expect(r.kind).toBe('lex');
    expect(r.message).toContain('使えない文字');
  });

  it('★ MAX_TOKENS: 境界ちょうどは通り、+1 で断る (終端は数えない)', () => {
    const exactly = lexAegis(';'.repeat(MAX_TOKENS));
    expect(exactly.ok && exactly.tokens.length).toBe(MAX_TOKENS + 1);
    const over = lexAegis(';'.repeat(MAX_TOKENS + 1));
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.kind).toBe('limit');
    expect(over.limit).toBe('MAX_TOKENS');
  });

  it('★ MAX_SOURCE_CHARS: 文字で数える (絵文字は 1 文字)・ちょうどは通り +1 で断る', () => {
    const exactly = '#' + '😀'.repeat(MAX_SOURCE_CHARS - 1); // コード単位では約 2 倍
    expect(exactly.length).toBeGreaterThan(MAX_SOURCE_CHARS);
    expect(lexAegis(exactly).ok).toBe(true);
    const over = lexAegis(exactly + '😀');
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.limit).toBe('MAX_SOURCE_CHARS');
    expect(over.line).toBe(1);
  });

  it('★ MAX_STRING_CHARS: 文字列リテラルは文字で数える・ちょうどは通り +1 で断る', () => {
    expect(out(`emit "${'😀'.repeat(MAX_STRING_CHARS)}";`)).toHaveLength(1);
    const r = bad(`emit "${'😀'.repeat(MAX_STRING_CHARS + 1)}";`);
    expect(r.kind).toBe('limit');
    expect(r.limit).toBe('MAX_STRING_CHARS');
  });

  it('★ MAX_ABS_NUMBER: 数リテラルは境界ちょうどが通り、+1 で断る', () => {
    expect(out(`emit ${MAX_ABS_NUMBER};`)).toEqual([String(MAX_ABS_NUMBER)]);
    const r = bad(`emit ${MAX_ABS_NUMBER + 2};`);
    expect(r.kind).toBe('limit');
    expect(r.limit).toBe('MAX_ABS_NUMBER');
  });

  it('数の読みは共有の readNumeric を通す (007 は 7・桁があふれる数は断る)', () => {
    expect(out('emit 007;')).toEqual(['7']);
    const r = bad(`emit ${'9'.repeat(400)};`);
    expect(r.kind).toBe('lex');
  });
});

describe('構文解析', () => {
  it('関数と文を最上位に並べて読める', () => {
    const r = parseAegis('fn add(a, b) { return a + b; }\nlet x = add(1, 2);\nif x == 3 { emit "ok"; } else { emit "ng"; }');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.program.fns.map((f) => [f.name, f.params])).toEqual([['add', ['a', 'b']]]);
    expect(r.program.body.map((s) => s.k)).toEqual(['let', 'if']);
  });

  it.each([
    ['let a = 1', '「;」が必要です', 1],
    ['let a = 1;\nlet b = ;', '式が必要です', 2],
    ['let = 1;', '変数の名前が必要です', 1],
    ['if true { emit 1;', '「}」が閉じていません', 1],
    ['\n\nwhile true emit 1;', '「{」が必要です', 3],
    ['fn f(1) { }', '引数の名前が必要です', 1],
    ['emit (1 + 2;', '「)」が必要です', 1],
  ])('構文の誤りは parse の結果で、日本語の説明と行番号を持つ: %j', (source, needle, line) => {
    const r = bad(source);
    expect(r.kind).toBe('parse');
    expect(r.message).toContain(needle);
    expect(r.line).toBe(line);
  });

  it('プログラムの終わりで誤ったときはそう言う', () => {
    expect(bad('let a =').message).toContain('プログラムの終わり');
  });

  it('関数は最上位でだけ・重複・組み込み名・引数の重複は断る', () => {
    expect(bad('if true { fn f() { } }').message).toContain('最上位でだけ');
    expect(bad('fn f() { }\nfn f() { }').message).toContain('重複して定義');
    expect(bad('fn len(a) { return 1; }').message).toContain('組み込みの関数名');
    expect(bad('fn f(a, a) { }').message).toContain('重複');
  });

  it('★ MAX_NESTING_DEPTH: ブロックは 16 段まで・17 段で断る', () => {
    const nest = (n: number): string => 'if true { '.repeat(n) + '}'.repeat(n);
    expect(parseAegis(nest(MAX_NESTING_DEPTH)).ok).toBe(true);
    const r = parseAegis(nest(MAX_NESTING_DEPTH + 1));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.limit).toBe('MAX_NESTING_DEPTH');
  });

  it('★ MAX_NESTING_DEPTH: 括弧・単項演算・呼び出しの引数も同じ天井で数える', () => {
    const parens = (n: number): string => `emit ${'('.repeat(n)}1${')'.repeat(n)};`;
    const unary = (n: number): string => `emit ${'-'.repeat(n)}1;`;
    const calls = (n: number): string => `emit ${'abs('.repeat(n)}1${')'.repeat(n)};`;
    for (const build of [parens, unary, calls]) {
      expect(parseAegis(build(MAX_NESTING_DEPTH)).ok).toBe(true);
      const r = parseAegis(build(MAX_NESTING_DEPTH + 1));
      expect(r.ok).toBe(false);
      expect(!r.ok && r.limit).toBe('MAX_NESTING_DEPTH');
    }
  });

  it('★ MAX_EXPRESSION_DEPTH: 式の木の高さは 32 まで (長い a+b+… も数える)', () => {
    const chain = (terms: number): string => `emit ${Array.from({ length: terms }, () => '1').join(' + ')};`;
    expect(parseAegis(chain(MAX_EXPRESSION_DEPTH)).ok).toBe(true);
    const r = parseAegis(chain(MAX_EXPRESSION_DEPTH + 1));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.limit).toBe('MAX_EXPRESSION_DEPTH');
    // 単項演算が高さを押し上げる分も数える
    const unaryChain = `emit ${'-'.repeat(MAX_NESTING_DEPTH)}1 ${'+ 1 '.repeat(MAX_EXPRESSION_DEPTH - MAX_NESTING_DEPTH)};`;
    expect(parseAegis(unaryChain).ok).toBe(false);
  });

  it('★ MAX_FUNCTIONS / MAX_PARAMS: 境界ちょうどは通り +1 で断る', () => {
    const fns = (n: number): string => Array.from({ length: n }, (_, i) => `fn f${i}() { }`).join('\n');
    expect(parseAegis(fns(MAX_FUNCTIONS)).ok).toBe(true);
    const over = parseAegis(fns(MAX_FUNCTIONS + 1));
    expect(!over.ok && over.limit).toBe('MAX_FUNCTIONS');
    const params = (n: number): string => `fn f(${Array.from({ length: n }, (_, i) => `p${i}`).join(', ')}) { }`;
    expect(parseAegis(params(MAX_PARAMS)).ok).toBe(true);
    const overP = parseAegis(params(MAX_PARAMS + 1));
    expect(!overP.ok && overP.limit).toBe('MAX_PARAMS');
    const args = (n: number): string => `f(${Array.from({ length: n }, () => '1').join(', ')});`;
    expect(parseAegis(args(MAX_PARAMS)).ok).toBe(true);
    const overA = parseAegis(args(MAX_PARAMS + 1));
    expect(!overA.ok && overA.limit).toBe('MAX_PARAMS');
  });
});

describe('実行 —— 式', () => {
  it('演算子の優先順位と結合 (掛け算が先・左結合・括弧)', () => {
    expect(out('emit 1 + 2 * 3; emit (1 + 2) * 3; emit 10 - 3 - 2; emit 7 % 4; emit 8 / 4 / 2;')).toEqual(['7', '9', '5', '3', '1']);
    expect(out('emit -2 * -3; emit - -2;')).toEqual(['6', '2']);
  });

  it('比較・論理・等価 (型が違えば等しくない)', () => {
    expect(out('emit 1 < 2; emit 2 <= 2; emit 3 > 4; emit 3 >= 4; emit 1 == 1; emit 1 != 2;')).toEqual(['true', 'true', 'false', 'false', 'true', 'true']);
    expect(out('emit "a" == "a"; emit "a" < "b"; emit 1 == "1"; emit true != false;')).toEqual(['true', 'true', 'false', 'true']);
    expect(out('emit true && false; emit true || false; emit !true; emit !false && true;')).toEqual(['false', 'true', 'false', 'true']);
  });

  it('&& と || は短絡する (右側を評価しない)', () => {
    expect(out('emit false && 1 / 0 > 0; emit true || 1 / 0 > 0;')).toEqual(['false', 'true']);
    expect(bad('emit true && 1 / 0 > 0;').message).toContain('0 で割る');
  });

  it('文字列の連結・比較。型が違う + は断り、str() を案内する', () => {
    expect(out('emit "ab" + "cd"; emit "ab" == "ab" + "";')).toEqual(['abcd', 'true']);
    const r = bad('emit "a" + 1;');
    expect(r.kind).toBe('runtime');
    expect(r.message).toContain('str()');
    expect(out('emit "a" + str(1) + str(true);')).toEqual(['a1true']);
    expect(bad('emit "a" * "b";').message).toContain('文字列には使えません');
  });

  it('演算子の型の誤りは runtime の結果', () => {
    expect(bad('emit -"a";').message).toContain('数に使います');
    expect(bad('emit !1;').message).toContain('true / false');
    expect(bad('emit 1 && true;').message).toContain('左側');
    expect(bad('emit true && 1;').message).toContain('右側');
    expect(bad('emit true < 1;').message).toContain('同じ型どうし');
  });

  it('0 で割る・余りを求めるのは断る', () => {
    expect(bad('emit 1 / 0;').message).toContain('0 で割る');
    expect(bad('emit 1 % 0;').message).toContain('余り');
    expect(bad('emit 1 / 0;').line).toBe(1);
  });

  it('★ MAX_ABS_NUMBER: 計算結果が天井ちょうどは通り、+1 で断る (負の側も)', () => {
    expect(out(`emit ${MAX_ABS_NUMBER - 1} + 1; emit -${MAX_ABS_NUMBER};`)).toEqual([String(MAX_ABS_NUMBER), String(-MAX_ABS_NUMBER)]);
    for (const src of [`emit ${MAX_ABS_NUMBER} + 1;`, `emit -${MAX_ABS_NUMBER} - 1;`, `emit ${MAX_ABS_NUMBER} * 2;`, `emit -(${MAX_ABS_NUMBER}) * 3;`]) {
      const r = bad(src);
      expect(r.kind).toBe('limit');
      expect(r.limit).toBe('MAX_ABS_NUMBER');
    }
    // 掛け算を重ねて天井を越える (Infinity になる前に止まる)
    expect(bad('let x = 1000000; x = x * x; x = x * x; x = x * x;').limit).toBe('MAX_ABS_NUMBER');
  });

  it('-0 は 0 にそろえる (画面に -0 を出さない)', () => {
    expect(out('emit 0 * -1; emit -0; emit floor(-0.5 * 0);')).toEqual(['0', '0', '0']);
  });

  it('組み込み関数: len は文字数・str・abs・min・max・floor', () => {
    expect(out('emit len("あ😀a"); emit str(12); emit abs(-3); emit min(2, 5); emit max(2, 5); emit floor(-0.5); emit floor(2.7);')).toEqual([
      '3',
      '12',
      '3',
      '2',
      '5',
      '-1',
      '2',
    ]);
    expect(bad('emit len(1);').message).toContain('文字列に使います');
    expect(bad('emit abs("a");').message).toContain('数に使います');
    expect(bad('emit min(1, "a");').message).toContain('数に使います');
    expect(bad('emit abs(1, 2);').message).toContain('引数を 1 個');
  });

  it('組み込みの台帳に、入出力・ファイル・ネットワークの物は無い', () => {
    expect(Object.keys(BUILTIN_FUNCTIONS).sort()).toEqual(['abs', 'floor', 'len', 'max', 'min', 'str']);
    for (const [name, spec] of Object.entries(BUILTIN_FUNCTIONS)) {
      expect(spec.why.length, name).toBeGreaterThanOrEqual(2);
    }
  });

  it('prototype の鍵 (constructor / toString) は関数としても変数としても特別扱いしない', () => {
    expect(out('let constructor = 1; emit constructor;')).toEqual(['1']);
    expect(bad('emit constructor(1);').message).toContain('定義されていません');
    expect(bad('emit toString(1);').message).toContain('定義されていません');
  });
});

describe('実行 —— 文・環境・関数', () => {
  it('let / 代入・if / else・環境は結果に返る (不変の Map)', () => {
    const r = ok('let x = 1; let y = "a"; x = x + 1; if x == 2 { y = "b"; } else { y = "c"; }');
    expect(r.env.get('x')).toBe(2);
    expect(r.env.get('y')).toBe('b');
    expect(r.env instanceof Map).toBe(true);
    // 結果の Map を書き換えても、同じソースの次の実行には影響しない (実行ごとに新しい環境)
    (r.env as Map<string, unknown>).set('x', 99);
    expect(ok('let x = 1;').env.get('x')).toBe(1);
  });

  it('let の二重定義・未定義への代入・未定義の読みは断る (理由と直し方を言う)', () => {
    expect(bad('let a = 1;\nlet a = 2;').message).toContain('すでに定義');
    expect(bad('let a = 1;\nlet a = 2;').line).toBe(2);
    expect(bad('a = 1;').message).toContain('定義されていません');
    expect(bad('emit zzz;').message).toContain('定義されていません');
    expect(bad('fn f() { }\nemit f;').message).toContain('名前(…)');
  });

  it('条件は真偽だけ (数・文字列は断る)', () => {
    expect(bad('if 1 { }').message).toContain('true か false');
    expect(bad('while "a" { }').message).toContain('文字列です');
  });

  it('while: 条件が偽になれば終わる。return は最上位でも関数でも値を持つ', () => {
    expect(out('let i = 0; while i < 3 { emit i; i = i + 1; }')).toEqual(['0', '1', '2']);
    expect(ok('let i = 0; while true { i = i + 1; if i == 5 { return i * 2; } }').value).toBe(10);
    expect(ok('let a = 1;').value).toBeNull();
    expect(ok('return false;').value).toBe(false);
    expect(ok('return 0;').value).toBe(0);
  });

  it('関数: 再帰・複数引数・最上位の変数は見えない・引数を書き換えても呼び手は変わらない', () => {
    expect(ok('fn fact(n) { if n <= 1 { return 1; } return n * fact(n - 1); } return fact(10);').value).toBe(3628800);
    expect(ok('fn pow(b, e) { let r = 1; let i = 0; while i < e { r = r * b; i = i + 1; } return r; } return pow(2, 10);').value).toBe(1024);
    expect(bad('let secret = 1; fn peek() { return secret; } emit peek();').message).toContain('「secret」は定義されていません');
    expect(ok('fn bump(n) { n = n + 1; return n; } let a = 1; let b = bump(a); return a * 10 + b;').value).toBe(12);
  });

  it('関数の呼び出しの誤り: 未定義・引数の数・値を返さない関数の値を使う', () => {
    expect(bad('emit nope(1);').message).toContain('関数「nope」は定義されていません');
    expect(bad('fn f(a) { return a; } emit f(1, 2);').message).toContain('引数を 1 個受け取ります。2 個');
    expect(bad('fn f() { let a = 1; } emit f();').message).toContain('値を返しません');
    // 文として呼ぶなら、値を返さなくてもよい
    expect(out('fn f() { emit "side"; } f();')).toEqual(['side']);
  });

  it('★ エラーの行番号は、誤りのある文の行 (複数行・関数の中・ループの中)', () => {
    expect(bad('let a = 1;\nlet b = 2;\nemit a / 0;').line).toBe(3);
    expect(bad('fn f(n) {\n  let k = 1;\n  return k / n;\n}\nemit f(0);').line).toBe(3);
    expect(bad('let i = 0;\nwhile i < 3 {\n  i = i + 1;\n  emit "x" + i;\n}').line).toBe(4);
    expect(bad('# 注記\n\n\nemit missing;').line).toBe(4);
  });

  it('★ MAX_VARIABLES: 境界ちょうどは通り、+1 で断る', () => {
    const lets = (n: number): string => Array.from({ length: n }, (_, i) => `let v${i} = ${i};`).join('\n');
    expect(ok(lets(MAX_VARIABLES)).env.size).toBe(MAX_VARIABLES);
    const r = bad(lets(MAX_VARIABLES + 1));
    expect(r.limit).toBe('MAX_VARIABLES');
    expect(r.line).toBe(MAX_VARIABLES + 1);
    // 既にある変数への代入は数を増やさない
    expect(ok(`${lets(MAX_VARIABLES)}\nv0 = 5;`).env.get('v0')).toBe(5);
  });
});

describe('実行 —— 天井と無限ループ', () => {
  const loopOf = (name: string, n: number): string => `let ${name} = 0; while ${name} < ${n} { ${name} = ${name} + 1; }`;

  it('文と条件確認の数え方: let 1 + 条件 (K+1) + 本体 K = 2K+2', () => {
    for (const k of [0, 1, 7, 100]) expect(ok(loopOf('i', k)).steps).toBe(2 * k + 2);
    expect(ok('emit 1;').steps).toBe(1);
    // 関数の呼び出しも 1 歩 (呼び出し 1 + 本体の return 1 + 呼び手の let 1)
    expect(ok('fn f() { return 1; } let a = f();').steps).toBe(3);
  });

  it('★ MAX_STEPS: 境界ちょうど (20000) は通り、+1 で断る', () => {
    // 2002 歩のループを 9 本 + 1982 歩のループ 1 本 = 20000 歩
    const base = [...Array.from({ length: 9 }, (_, i) => loopOf(`a${i}`, 1000)), loopOf('b', 990)].join('\n');
    const exactly = ok(base);
    expect(exactly.steps).toBe(MAX_STEPS);
    const r = bad(`${base}\nemit 1;`);
    expect(r.kind).toBe('limit');
    expect(r.limit).toBe('MAX_STEPS');
    expect(r.message).toContain(String(MAX_STEPS));
    expect(r.line).toBe(11);
  });

  it('★ MAX_LOOP_ITERATIONS: 1000 回は通り、1001 回目で断る', () => {
    expect(ok(loopOf('i', MAX_LOOP_ITERATIONS)).env.get('i')).toBe(MAX_LOOP_ITERATIONS);
    const r = bad(loopOf('i', MAX_LOOP_ITERATIONS + 1));
    expect(r.kind).toBe('limit');
    expect(r.limit).toBe('MAX_LOOP_ITERATIONS');
    expect(r.line).toBe(1);
  });

  it('★ 無限ループは止まる (空の本体も・return の無い関数の中も・入れ子も)', () => {
    for (const src of ['while true { }', 'fn spin() { while true { } } spin();', 'while true { while true { } }']) {
      const r = bad(src);
      expect(r.kind, src).toBe('limit');
      expect(r.limit, src).toBe('MAX_LOOP_ITERATIONS');
    }
  });

  it('★ 外側の反復と内側の反復の積は、各ループが上限以内でも MAX_STEPS で止まる', () => {
    const r = bad('let i = 0; let j = 0; while i < 1000 { j = 0; while j < 1000 { j = j + 1; } i = i + 1; }');
    expect(r.kind).toBe('limit');
    expect(r.limit).toBe('MAX_STEPS');
  });

  it('★ MAX_CALL_DEPTH: 呼び出しの入れ子は 16 段まで・17 段で断る (無限再帰も止まる)', () => {
    const rec = 'fn f(n) { if n == 0 { return 0; } return f(n - 1); }';
    expect(ok(`${rec} return f(${MAX_CALL_DEPTH - 1});`).value).toBe(0);
    const r = bad(`${rec} return f(${MAX_CALL_DEPTH});`);
    expect(r.limit).toBe('MAX_CALL_DEPTH');
    expect(bad('fn f() { return f(); } f();').limit).toBe('MAX_CALL_DEPTH');
  });

  it('★ MAX_OUTPUT_LINES: 100 行は通り、101 行目で断る (切らずに断る)', () => {
    const lines = (n: number): string => Array.from({ length: n }, () => 'emit 1;').join('');
    expect(ok(lines(MAX_OUTPUT_LINES)).output).toHaveLength(MAX_OUTPUT_LINES);
    const r = bad(lines(MAX_OUTPUT_LINES + 1));
    expect(r.limit).toBe('MAX_OUTPUT_LINES');
  });

  it('★ MAX_OUTPUT_CHARS: 合計 2000 文字は通り、+1 文字で断る (文字で数える)', () => {
    const big = (c: string, n: number): string => `emit "${c.repeat(n)}";`;
    const exactly = ok(`${big('😀', 500)}${big('😀', 500)}${big('😀', 500)}${big('😀', 500)}`);
    expect(exactly.output.join('').length).toBeGreaterThan(MAX_OUTPUT_CHARS); // コード単位では超えている
    const r = bad(`${big('a', 500)}${big('a', 500)}${big('a', 500)}${big('a', 500)}emit "b";`);
    expect(r.limit).toBe('MAX_OUTPUT_CHARS');
    expect(r.line).toBe(1);
  });

  it('★ MAX_STRING_CHARS: 連結の結果が 500 文字ちょうどは通り、+1 で断る', () => {
    const half = 'あ'.repeat(MAX_STRING_CHARS / 2);
    expect(ok(`let s = "${half}"; s = s + "${half}"; return len(s);`).value).toBe(MAX_STRING_CHARS);
    const r = bad(`let s = "${half}"; s = s + "${half}"; s = s + "b";`);
    expect(r.limit).toBe('MAX_STRING_CHARS');
  });

  it('★ ソースの天井は実行の入口でも効く (走査を通らなくても)', () => {
    const r = bad('#' + 'x'.repeat(MAX_SOURCE_CHARS));
    expect(r.limit).toBe('MAX_SOURCE_CHARS');
  });

  describe('実行時の天井は「締めるだけ」(広げられない)', () => {
    it('小さい値は効く (境界ちょうどは通り +1 で断る)', () => {
      expect(ok('emit 1; emit 1; emit 1;').steps).toBe(3);
      expect(bad('emit 1; emit 1; emit 1;', { maxSteps: 2 }).limit).toBe('MAX_STEPS');
            expect(executeAegis('emit 1; emit 1; emit 1;', { maxSteps: 3 }).ok).toBe(true);
      expect(bad(loopOf('i', 3), { maxLoopIterations: 2 }).limit).toBe('MAX_LOOP_ITERATIONS');
      expect(executeAegis(loopOf('i', 3), { maxLoopIterations: 3 }).ok).toBe(true);
      expect(bad('fn f() { return 1; } emit f();', { maxCallDepth: 0 }).limit).toBe('MAX_CALL_DEPTH');
      expect(bad('emit 1; emit 1;', { maxOutputLines: 1 }).limit).toBe('MAX_OUTPUT_LINES');
      expect(bad('emit "ab";', { maxOutputChars: 1 }).limit).toBe('MAX_OUTPUT_CHARS');
      expect(bad('emit "ab" + "c";', { maxStringChars: 2 }).limit).toBe('MAX_STRING_CHARS');
      expect(bad('let a = 1; let b = 2;', { maxVariables: 1 }).limit).toBe('MAX_VARIABLES');
    });

    it('天井より大きい値・負・小数・非有限・NaN は天井のまま', () => {
      const over = `${[...Array.from({ length: 9 }, (_, i) => loopOf(`a${i}`, 1000)), loopOf('b', 990)].join('\n')}\nemit 1;`;
      for (const v of [MAX_STEPS + 1, 10 ** 12, -1, 1.5, Infinity, Number.NaN]) {
        expect(bad(over, { maxSteps: v }).limit, String(v)).toBe('MAX_STEPS');
      }
      // 0 は「1 歩も許さない」(有効な締め方)
      expect(bad('emit 1;', { maxSteps: 0 }).limit).toBe('MAX_STEPS');
    });
  });

  it('予期しない内部の例外も、例外ではなく結果の型で返す', () => {
    const hostile = {
      get maxSteps(): number {
        throw new TypeError('敵対的な指定');
      },
    };
    const r = executeAegis('emit 1;', hostile);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe('internal');
    expect(r.message).toContain('内部のエラー');
  });
});

describe('字句 —— 細部', () => {
  it('空白はスペース・タブ・復帰で、どれも区切りになる (他の字は使えない)', () => {
    expect(out('let\tx\r=\t1;\remit x;')).toEqual(['1']);
    expect(out('let   x   =   2  ;  emit   x ;')).toEqual(['2']);
  });

  it('識別子は A-Z a-z _ で始まり、数字も続けられる (境界の字: A Z a z _)', () => {
    for (const name of ['A', 'Z', 'a', 'z', '_', 'A1', 'z9', '_x0', 'Za_9']) {
      expect(ok(`let ${name} = 1; return ${name};`).value, name).toBe(1);
    }
    // 境界の外の字は識別子にならない ('@' は 'A' の 1 つ前・'[' は 'Z' の 1 つ後ろ・'`' は 'a' の 1 つ前・'{' は 'z' の 1 つ後ろ)
    for (const c of ['@', '[', '`']) expect(bad(`let ${c} = 1;`).kind, c).toBe('lex');
    expect(bad('let { = 1;').kind).toBe('parse');
  });

  it('識別子と数の読みは長い最後まで (1 字で切らない)', () => {
    expect(ok('let abc_DEF123 = 45678; return abc_DEF123;').value).toBe(45678);
    expect(ok('return 12.375;').value).toBe(12.375);
    expect(out('emit 0.5 + 0.25;')).toEqual(['0.75']);
  });

  it('注記は行末まで (次の行は読む)・ソースの終わりまででもよい', () => {
    expect(out('# 1 行目\nemit 1; # 末尾の注記\nemit 2;')).toEqual(['1', '2']);
    expect(ok('emit 1; # 終わりまで注記').output).toEqual(['1']);
    expect(ok('# だけ').steps).toBe(0);
  });

  it('字句は、値を持つ物 (数・文字列) にだけ value を持つ', () => {
    const r = lexAegis('let a = 1; emit "s";');
    expect(r.ok && r.tokens.map((t) => 'value' in t)).toEqual([false, false, false, true, false, false, true, false, false]);
  });

  it('天井でない失敗は limit を持たない (limit は天井の名前だけ)', () => {
    expect('limit' in bad('let a = $;')).toBe(false);
    expect('limit' in bad('let = 1;')).toBe(false);
    expect('limit' in bad('emit 1 / 0;')).toBe(false);
    expect('limit' in bad('while true { }')).toBe(true);
  });
});

describe('構文木の種類', () => {
  it('文の種類 (let / set / if / while / return / emit / expr) と式の種類が読める', () => {
    const r = parseAegis('let a = 1; a = 2; if true { } while false { } emit a; return a; a + 1;');
    expect(r.ok && r.program.body.map((s) => s.k)).toEqual(['let', 'set', 'if', 'while', 'emit', 'return', 'expr']);
    const e = parseAegis('emit f(-1, "s", true, x + 2);');
    const stmt = e.ok ? e.program.body[0] : undefined;
    const call = stmt && stmt.k === 'emit' ? stmt.e : undefined;
    expect(call && call.k === 'call' && call.args.map((a) => a.k)).toEqual(['un', 'str', 'bool', 'bin']);
  });

  it('★ MAX_EXPRESSION_DEPTH: 呼び出しの引数の式の高さも数える (関数の分 1 段)', () => {
    const chain = (n: number): string => Array.from({ length: n }, () => '1').join(' + ');
    expect(parseAegis(`emit abs(${chain(MAX_EXPRESSION_DEPTH - 1)});`).ok).toBe(true);
    const r = parseAegis(`emit abs(${chain(MAX_EXPRESSION_DEPTH)});`);
    expect(!r.ok && r.limit).toBe('MAX_EXPRESSION_DEPTH');
    // 引数が無い呼び出しは葉と同じ高さ 1: いちばん深い葉が f() の左深い式は、足し算の数 + 1 の高さ
    const deepest = (n: number): string => `emit f()${' + 1'.repeat(n)};`;
    expect(parseAegis(deepest(MAX_EXPRESSION_DEPTH - 1)).ok).toBe(true);
    const over = parseAegis(deepest(MAX_EXPRESSION_DEPTH));
    expect(!over.ok && over.limit).toBe('MAX_EXPRESSION_DEPTH');
  });

  it('式文は何でもよく、値は捨てる (途中で終わらない)', () => {
    expect(out('1; 1 + 2; "a"; emit 3;')).toEqual(['3']);
    expect(ok('1 + 2;').steps).toBe(1);
  });

  it('「x = …」は識別子だけが代入になる (数や文字列の左辺は構文の誤り)', () => {
    expect(bad('1 = 2;').kind).toBe('parse');
    expect(bad('"a" = 2;').kind).toBe('parse');
    expect(bad('f(1) = 2;').kind).toBe('parse');
  });
});

describe('実行 —— 比較と型 (全部の組)', () => {
  it('数の比較は境界 (等しい・1 つ違い) で 6 演算子とも正しい', () => {
    const cmp = (l: number, op: string, r: number): string => out(`emit ${l} ${op} ${r};`)[0]!;
    const table: [string, boolean, boolean, boolean][] = [
      // op, 1 op 2, 2 op 2, 3 op 2
      ['<', true, false, false],
      ['<=', true, true, false],
      ['>', false, false, true],
      ['>=', false, true, true],
      ['==', false, true, false],
      ['!=', true, false, true],
    ];
    for (const [op, lt, eq, gt] of table) {
      expect(cmp(1, op, 2), `1 ${op} 2`).toBe(String(lt));
      expect(cmp(2, op, 2), `2 ${op} 2`).toBe(String(eq));
      expect(cmp(3, op, 2), `3 ${op} 2`).toBe(String(gt));
    }
  });

  it('文字列の比較も境界で 4 演算子とも正しい (順序は文字コード順)', () => {
    const cmp = (l: string, op: string, r: string): string => out(`emit "${l}" ${op} "${r}";`)[0]!;
    const table: [string, boolean, boolean, boolean][] = [
      ['<', true, false, false],
      ['<=', true, true, false],
      ['>', false, false, true],
      ['>=', false, true, true],
      ['==', false, true, false],
      ['!=', true, false, true],
    ];
    for (const [op, lt, eq, gt] of table) {
      expect(cmp('a', op, 'b'), `a ${op} b`).toBe(String(lt));
      expect(cmp('b', op, 'b'), `b ${op} b`).toBe(String(eq));
      expect(cmp('c', op, 'b'), `c ${op} b`).toBe(String(gt));
    }
  });

  it('型の違う == は偽・!= は真、真偽どうしは比べられる', () => {
    expect(out('emit 1 == "1"; emit 1 != "1"; emit true == true; emit true == false;')).toEqual(['false', 'true', 'true', 'false']);
  });

  it('式文の中の演算が、副作用 (出力の順) を保って左から右へ評価される', () => {
    expect(out('fn a() { emit "a"; return 1; } fn b() { emit "b"; return 2; } emit a() + b();')).toEqual(['a', 'b', '3']);
  });

  it('★ -0 は +0 にそろう (値としても)', () => {
    const r = ok('let x = 0 * -1; let y = -0; let z = 0 - 0; let w = abs(-0);');
    for (const name of ['x', 'y', 'z', 'w']) expect(Object.is(r.env.get(name), 0), name).toBe(true);
  });

  it('式文の関数呼び出しの失敗も、行番号つきで返る', () => {
    expect(bad('fn f(a) { }\nf();').message).toBe('関数「f」は引数を 1 個受け取ります。0 個渡されました。');
    expect(bad('fn f(a) { }\nf();').line).toBe(2);
  });

  it('★ return は最初の 1 つで止まる。後ろの文は走らない (ループの中でも関数の中でも)', () => {
    expect(out('emit 1; return 0; emit 2;')).toEqual(['1']);
    expect(ok('fn f() { while true { return 7; } emit "x"; } return f() + 1;').value).toBe(8);
    expect(out('fn f() { if true { return 1; } emit "no"; } emit f();')).toEqual(['1']);
  });

  it('return の値を持たない最上位は null・値を返した偽の値 (false / 0 / 空文字) は null にならない', () => {
    expect(ok('emit 1;').value).toBeNull();
    expect(ok('return "";').value).toBe('');
    expect(ok('return false;').value).toBe(false);
  });
});

describe('★ 利用者に見せる日本語 (そのまま留める)', () => {
  const CASES: [string, string, 'lex' | 'parse' | 'runtime', number][] = [
    ['let a = "x;', '文字列が閉じていません。「"」で閉じてください。', 'lex', 1],
    ['let a = "x\ny";', '文字列の途中で行が終わっています。改行は「\\n」と書きます。', 'lex', 1],
    ['emit "a\\tb";', '「\\t」は使えない書き方です。使えるのは \\n \\" \\\\ だけです。', 'lex', 1],
    ['let a = 1 & 2;', '「&」は単独では使えません。論理積は「&&」、論理和は「||」です。', 'lex', 1],
    ['let a = 1 | 2;', '「|」は単独では使えません。論理積は「&&」、論理和は「||」です。', 'lex', 1],
    ['@x', '「@」は使えません。この言語に自己書き換えの印はありません。', 'lex', 1],
    ['let a = $;', '「$」は使えない文字です。', 'lex', 1],
    ['let a = 1.;', '数の形が正しくありません。数は 12 や 3.5 のように書きます。', 'lex', 1],
    [`emit ${'9'.repeat(400)};`, '数として読めません。桁が多すぎます。', 'lex', 1],
    ['let a = 1', '「;」が必要です。ここにはプログラムの終わりがあります。', 'parse', 1],
    ['let = 1;', '変数の名前が必要です。ここには「=」があります。', 'parse', 1],
    ['emit (1 + 2;', '「)」が必要です。ここには「;」があります。', 'parse', 1],
    ['if true { emit 1;', '「}」が閉じていません。', 'parse', 1],
    ['while true emit 1;', '「{」が必要です。ここには「emit」があります。', 'parse', 1],
    ['fn f(1) { }', '引数の名前が必要です。ここには「1」があります。', 'parse', 1],
    ['fn 1() { }', '関数の名前が必要です。ここには「1」があります。', 'parse', 1],
    ['if true { fn f() { } }', '関数は最上位でだけ定義できます。', 'parse', 1],
    ['fn f() { }\nfn f() { }', '関数「f」が重複して定義されています。', 'parse', 2],
    ['fn len(a) { return 1; }', '「len」は組み込みの関数名なので使えません。', 'parse', 1],
    ['fn f(a, a) { }', '引数「a」が重複しています。', 'parse', 1],
    ['emit ;', '式が必要です。ここには「;」があります。', 'parse', 1],
    ['let a =', '式が必要です。ここにはプログラムの終わりがあります。', 'parse', 1],
    ['let a = 1;\nlet a = 2;', '「a」はすでに定義されています。値を変えるときは「a = …;」と書きます。', 'runtime', 2],
    ['a = 1;', '「a」は定義されていません。先に「let a = …;」と書いてください。', 'runtime', 1],
    ['emit zzz;', '「zzz」は定義されていません。先に「let」で定義してください。', 'runtime', 1],
    ['fn f() { }\nemit f;', '「f」は定義されていません。関数は「名前(…)」の形で呼び出します。', 'runtime', 2],
    ['emit len;', '「len」は定義されていません。関数は「名前(…)」の形で呼び出します。', 'runtime', 1],
    ['if 1 { }', '条件は true か false でなければなりません。ここは数です。', 'runtime', 1],
    ['while "a" { }', '条件は true か false でなければなりません。ここは文字列です。', 'runtime', 1],
    ['emit -"a";', '「-」は数に使います。ここは文字列です。', 'runtime', 1],
    ['emit !1;', '「!」は true / false に使います。ここは数です。', 'runtime', 1],
    ['emit 1 && true;', '「&&」は true / false に使います。左側は数です。', 'runtime', 1],
    ['emit true && 1;', '「&&」は true / false に使います。右側は数です。', 'runtime', 1],
    ['emit false || 1;', '「||」は true / false に使います。右側は数です。', 'runtime', 1],
    ['emit 1 || true;', '「||」は true / false に使います。左側は数です。', 'runtime', 1],
    ['emit true < 1;', '「<」は同じ型どうしに使います。左は真偽、右は数です。', 'runtime', 1],
    ['emit "a" + 1;', '「+」は同じ型どうしに使います。左は文字列、右は数です。数と文字列をつなぐときは str() で文字列にします。', 'runtime', 1],
    ['emit 1 + "a";', '「+」は同じ型どうしに使います。左は数、右は文字列です。数と文字列をつなぐときは str() で文字列にします。', 'runtime', 1],
    ['emit 1 - "a";', '「-」は同じ型どうしに使います。左は数、右は文字列です。', 'runtime', 1],
    ['emit "a" * "b";', '「*」は文字列には使えません。', 'runtime', 1],
    ['emit "a" - "b";', '「-」は文字列には使えません。', 'runtime', 1],
    ['emit 1 / 0;', '0 で割ることはできません。', 'runtime', 1],
    ['emit 1 % 0;', '0 で割った余りは求められません。', 'runtime', 1],
    ['emit nope(1);', '関数「nope」は定義されていません。', 'runtime', 1],
    ['fn f(a) { return a; } emit f(1, 2);', '関数「f」は引数を 1 個受け取ります。2 個渡されました。', 'runtime', 1],
    ['fn f() { let a = 1; } emit f();', '関数「f」は値を返しません。値を使うには「return …;」で返してください。', 'runtime', 1],
    ['emit len(1);', '「len」は文字列に使います。ここは数です。', 'runtime', 1],
    ['emit len(true);', '「len」は文字列に使います。ここは真偽です。', 'runtime', 1],
    ['emit abs("a");', '「abs」は数に使います。', 'runtime', 1],
    ['emit min(1, "a");', '「min」は数に使います。', 'runtime', 1],
    ['emit abs(1, 2);', '「abs」は引数を 1 個受け取ります。2 個渡されました。', 'runtime', 1],
    ['emit len();', '「len」は引数を 1 個受け取ります。0 個渡されました。', 'runtime', 1],
  ];
  it.each(CASES)('%j', (source, message, kind, line) => {
    const r = bad(source);
    expect(r.message).toBe(message);
    expect(r.kind).toBe(kind);
    expect(r.line).toBe(line);
  });

  it('天井の断りは、超えた天井の数をそのまま言う', () => {
    expect(msg(`emit ${MAX_ABS_NUMBER + 2};`)).toBe(`数が大きすぎます (絶対値の上限 ${MAX_ABS_NUMBER})。`);
    expect(msg(`emit ${MAX_ABS_NUMBER} + 1;`)).toBe(`数が大きすぎます (絶対値の上限 ${MAX_ABS_NUMBER})。`);
    expect(msg('#'.repeat(MAX_SOURCE_CHARS + 1))).toBe(`ソースが長すぎます (上限 ${MAX_SOURCE_CHARS} 文字)。分けて書いてください。`);
    expect(msg(';'.repeat(MAX_TOKENS + 1))).toBe(`字句が多すぎます (上限 ${MAX_TOKENS} 個)。分けて書いてください。`);
    expect(msg(`emit "${'a'.repeat(MAX_STRING_CHARS + 1)}";`)).toBe(`文字列が長すぎます (上限 ${MAX_STRING_CHARS} 文字)。`);
    expect(msg('if true { '.repeat(MAX_NESTING_DEPTH + 1) + '}'.repeat(MAX_NESTING_DEPTH + 1))).toBe(
      `入れ子が深すぎます (上限 ${MAX_NESTING_DEPTH} 段)。式や処理を分けてください。`,
    );
    expect(msg(`emit ${Array.from({ length: MAX_EXPRESSION_DEPTH + 1 }, () => '1').join('+')};`)).toBe(
      `式が長すぎます (式の高さの上限 ${MAX_EXPRESSION_DEPTH})。途中の結果を変数に分けてください。`,
    );
    expect(msg(Array.from({ length: MAX_FUNCTIONS + 1 }, (_, i) => `fn f${i}() { }`).join('\n'))).toBe(`関数が多すぎます (上限 ${MAX_FUNCTIONS} 個)。`);
    expect(msg('fn f(a,b,c,d,e,f,g,h,i) { }')).toBe(`引数が多すぎます (上限 ${MAX_PARAMS} 個)。`);
    expect(msg('f(1,2,3,4,5,6,7,8,9);')).toBe(`引数が多すぎます (上限 ${MAX_PARAMS} 個)。`);
    expect(msg('fn f() { return f(); } f();')).toBe(
      `関数の呼び出しが深すぎます (上限 ${MAX_CALL_DEPTH} 段)。自分自身を呼ぶ関数は終わる条件を確かめてください。`,
    );
    expect(msg('while true { }')).toBe(`ループが上限 (${MAX_LOOP_ITERATIONS} 回) を超えました。終わる条件を確かめてください。`);
    expect(msg('let i = 0; let j = 0; while i < 1000 { j = 0; while j < 1000 { j = j + 1; } i = i + 1; }')).toBe(
      `実行ステップが上限 (${MAX_STEPS}) を超えました。処理を軽くしてください。`,
    );
    expect(msg('emit 1;'.repeat(MAX_OUTPUT_LINES + 1))).toBe(`出力が上限 (${MAX_OUTPUT_LINES} 行) を超えました。`);
    expect(msg(`${`emit "${'a'.repeat(500)}";`.repeat(4)}emit "b";`)).toBe(`出力が上限 (${MAX_OUTPUT_CHARS} 文字) を超えました。`);
    expect(msg(`let s = "${'a'.repeat(300)}"; s = s + s;`)).toBe(`文字列が長すぎます (上限 ${MAX_STRING_CHARS} 文字)。`);
    expect(msg(Array.from({ length: MAX_VARIABLES + 1 }, (_, i) => `let v${i} = 1;`).join(''))).toBe(`変数が多すぎます (上限 ${MAX_VARIABLES} 個)。`);
  });

  it('締めた天井の断りは、締めた数を言う (天井の定数ではない)', () => {
    expect(msg('emit 1;', { maxSteps: 0 })).toBe('実行ステップが上限 (0) を超えました。処理を軽くしてください。');
    expect(msg('while true { }', { maxLoopIterations: 3 })).toBe('ループが上限 (3 回) を超えました。終わる条件を確かめてください。');
    expect(msg('fn f() { return 1; } f();', { maxCallDepth: 0 })).toContain('上限 0 段');
    expect(msg('emit 1;', { maxOutputLines: 0 })).toBe('出力が上限 (0 行) を超えました。');
    expect(msg('emit "ab";', { maxOutputChars: 1 })).toBe('出力が上限 (1 文字) を超えました。');
    expect(msg('emit "ab" + "c";', { maxStringChars: 2 })).toBe('文字列が長すぎます (上限 2 文字)。');
    expect(msg('let a = 1;', { maxVariables: 0 })).toBe('変数が多すぎます (上限 0 個)。');
  });
});

describe('実行時の天井の指定 —— 天井として読めない値は天井のまま', () => {
  it('★ 負・小数・NaN・無限・数でない値は無視され、普通のプログラムは通る (締まった値だと落ちてしまう形)', () => {
    for (const v of [-1, 1.5, Number.NaN, Infinity, -Infinity, '0' as unknown as number]) {
      const r = executeAegis('emit 1; emit 2; emit 3;', { maxSteps: v, maxOutputLines: v, maxVariables: v });
      expect(r.ok, String(v)).toBe(true);
    }
  });

  it('★ NaN・無限・負は天井を外すのではなく、天井のまま (無限ループを天井が止める)', () => {
    for (const v of [Number.NaN, Infinity, -5, 1.5]) {
      expect(bad('while true { }', { maxLoopIterations: v }).limit, String(v)).toBe('MAX_LOOP_ITERATIONS');
    }
  });

  it('0 は有効な締め方 (1 回も許さない)・天井ちょうども通る', () => {
    expect(bad('while true { }', { maxLoopIterations: 0 }).limit).toBe('MAX_LOOP_ITERATIONS');
    expect(executeAegis('let i = 0; while i < 1000 { i = i + 1; }', { maxLoopIterations: MAX_LOOP_ITERATIONS }).ok).toBe(true);
    expect(bad('while true { }', { maxLoopIterations: MAX_LOOP_ITERATIONS + 1 }).limit).toBe('MAX_LOOP_ITERATIONS');
  });
});

describe('実行 —— 状態が文をまたいで保たれる', () => {
  it('式文のあとも環境は残る (式文の結果が環境を壊さない)', () => {
    expect(out('let a = 1; a + 1; emit a;')).toEqual(['1']);
    expect(ok('let a = 1; a + 1;').env.get('a')).toBe(1);
    expect(ok('fn f() { return 1; } let a = 5; f();').env.get('a')).toBe(5);
  });

  it('★ 呼び出しの深さは戻れば元に戻る (順に何度呼んでも入れ子にはならない)', () => {
    const calls = (n: number): string => `fn f() { return 1; } ${'f(); '.repeat(n)}`;
    expect(executeAegis(calls(MAX_CALL_DEPTH * 3)).ok).toBe(true);
    expect(ok('fn f(n) { return n; } let i = 0; while i < 100 { f(i); i = i + 1; }').env.get('i')).toBe(100);
    // 入れ子の式の中の呼び出しも戻る
    expect(ok(`fn g(n) { return n + 1; } return ${Array.from({ length: 10 }, () => 'g(1)').join(' + ')};`).value).toBe(20);
  });
});

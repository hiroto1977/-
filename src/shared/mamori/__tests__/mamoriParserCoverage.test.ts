import { describe, expect, it } from 'vitest';
import { lex, parse, MamoriError } from '../parser';
import { compileProject, formatDiagnostic } from '../compile';
import type { Item, Stmt } from '../ast';

/*
 * **構文の誤りの文と、字句の境目を 1 つずつ留める** (2026-10-30 · パス 560 続き · threat: T-221)。
 *
 * 変異検査 (Stryker · parser.ts) を初めて当てると **78.51% / 生存 190 + 未到達 38** だった。生存の大半は
 * 構文の誤りを断る枝で、mamoriRules.test.ts は「M0 で断る」ことしか見ておらず**文と場所を見ていなかった**
 * (文を空にしても、場所を 0 にしても通る)。Mamori の誤りの文は利用者が自分の書いた物を直す唯一の手掛かり
 * なので、文と行・列を 1 字ずつ留める。字句の側は、正規表現と割り算の取り違え・文字列の閉じ・数の形・
 * 型の綴りの写し方 (生成物にそのまま出る) を表で留める。
 */

/** 1 つのモジュールを変換し、誤りを `file:line:col: [M0] 文` の 1 行で返す。 */
function m0(source: string): string {
  const r = compileProject([{ path: 'src/x/m.mamori', source }]);
  if (r.ok) return 'ok';
  return r.diagnostics.map(formatDiagnostic).join('\n');
}
const at = (line: number, col: number, reason: string): string => `src/x/m.mamori:${line}:${col}: [M0] ${reason}`;
const FN = (body: string): string => `fn f(x: string) -> unknown {\n${body}\n}\n`;

describe('字句の誤りは文と場所を名乗る', () => {
  const CASES: readonly [string, string, string][] = [
    ['閉じない文字列 (ファイルの終わり)', "const A = 'abc", at(1, 11, '文字列が閉じていません')],
    ['行を跨ぐ文字列', "const A = 'ab\ncd';\n", at(1, 11, '文字列が行の内で閉じていません')],
    ['/* */ の注記', 'const A = 1; /* x */\n', at(1, 14, '`/* … */` の注記は在りません —— `//` の行で書きます (TypeScript へそのまま運ぶため)')],
    ['テンプレート文字列', 'const A = `x`;\n', at(1, 11, 'テンプレート文字列は在りません —— `+` で繋ぎます (補間の中に式を隠させない)')],
    ['知らない文字', 'const A = 1 @ 2;\n', at(1, 13, '知らない文字です: "@"')],
    ['行を跨ぐ正規表現', FN('  return /ab\n/;'), at(2, 10, '正規表現が行の内で閉じていません')],
    ['ファイルの終わりで閉じない正規表現', 'const A = /ab', at(1, 11, '正規表現が閉じていません')],
  ];
  for (const [name, src, want] of CASES) {
    it(`★ ${name}`, () => expect(m0(src)).toBe(want));
  }

  it('★ MamoriError は名前と、場所つきの文を持つ', () => {
    let caught: unknown;
    try {
      lex('src/y.mamori', "\n  'x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MamoriError);
    const e = caught as MamoriError;
    expect(e.name).toBe('MamoriError');
    expect(e.message).toBe('src/y.mamori:2:3: 文字列が閉じていません');
    expect([e.file, e.pos.line, e.pos.col, e.reason]).toEqual(['src/y.mamori', 2, 3, '文字列が閉じていません']);
  });
});

describe('字句の境目', () => {
  const kinds = (src: string): string[] => lex('x', src).filter((t) => t.kind !== 'eof').map((t) => `${t.kind}:${t.text}`);

  it('★ 割り算と正規表現を、直前の字句で見分ける', () => {
    expect(kinds('a / b')).toEqual(['ident:a', 'punct:/', 'ident:b']);
    expect(kinds('(a) / b')).toEqual(['punct:(', 'ident:a', 'punct:)', 'punct:/', 'ident:b']);
    expect(kinds('[1] / 2')).toEqual(['punct:[', 'number:1', 'punct:]', 'punct:/', 'number:2']);
    expect(kinds('} / 2')).toEqual(['punct:}', 'punct:/', 'number:2']);
    expect(kinds('1 / 2')).toEqual(['number:1', 'punct:/', 'number:2']);
    expect(kinds("'s' / 2")).toEqual(["string:'s'", 'punct:/', 'number:2']);
    expect(kinds('return /a/g')).toEqual(['ident:return', 'regex:/a/g']);
    expect(kinds('typeof /a/')).toEqual(['ident:typeof', 'regex:/a/']);
    expect(kinds('await /a/')).toEqual(['ident:await', 'regex:/a/']);
    expect(kinds('= /a/')).toEqual(['punct:=', 'regex:/a/']);
    expect(kinds('(/a/')).toEqual(['punct:(', 'regex:/a/']);
    expect(kinds('/a/')).toEqual(['regex:/a/']);
    // 注記は直前の字句に数えない (注記の後の / は、注記の前の字句で決まる)
    expect(kinds('x // c\n/ 2')).toEqual(['ident:x', 'comment:c', 'punct:/', 'number:2']);
    expect(kinds('= /// d\n/a/')).toEqual(['punct:=', 'doc:d', 'regex:/a/']);
    expect(kinds('//! h\n/a/')).toEqual(['header:h', 'regex:/a/']);
    // 注記の前の字句が正規表現を許すなら、注記を挟んでも正規表現 (注記を直前の字句に数えると割り算になる)
    expect(kinds('= // c\n/a/')).toEqual(['punct:=', 'comment:c', 'regex:/a/']);
  });

  it('★ 正規表現の中の [ ] と \\/ は閉じに数えない・旗は小文字だけ', () => {
    expect(kinds('= /[/]x/g')).toEqual(['punct:=', 'regex:/[/]x/g']);
    expect(kinds('= /a\\/b/')).toEqual(['punct:=', 'regex:/a\\/b/']);
    expect(kinds('= /[a]/b/')).toEqual(['punct:=', 'regex:/[a]/b', 'punct:/']);
    expect(kinds('= /a/gim;')).toEqual(['punct:=', 'regex:/a/gim', 'punct:;']);
    expect(kinds('= /a/G')).toEqual(['punct:=', 'regex:/a/', 'ident:G']);
    // 旗で終わるファイルの終わりの位置 (旗の読みが 1 字先へ行き過ぎない)
    const eof = lex('x', '/a/g').at(-1)!;
    expect([eof.kind, eof.pos.line, eof.pos.col]).toEqual(['eof', 1, 5]);
  });

  it('★ 文字列の中の \\ は次の 1 字を飛ばす・逆の引用符は閉じない', () => {
    expect(kinds("'a\\'b'")).toEqual(["string:'a\\'b'"]);
    expect(kinds('"a\'b"')).toEqual(['string:"a\'b"']);
    expect(kinds("'a\"b' 'c'")).toEqual(["string:'a\"b'", "string:'c'"]);
  });

  it('★ 数は 1 つの字句 (桁の区切り _ と小数を含む・小数点の後に数字が無ければ数ではない)', () => {
    expect(kinds('1_000.25')).toEqual(['number:1_000.25']);
    expect(kinds('12')).toEqual(['number:12']);
    expect(kinds('1.x')).toEqual(['number:1', 'punct:.', 'ident:x']);
    expect(kinds('a1 $b _c')).toEqual(['ident:a1', 'ident:$b', 'ident:_c']);
  });

  it('★ 注記の頭の空白は 1 つだけ落とす', () => {
    expect(kinds('//  two')).toEqual(['comment: two']);
    expect(kinds('///x')).toEqual(['doc:x']);
    expect(kinds('//!')).toEqual(['header:']);
  });

  it('★ 長い記号を先に読む (=== と = = = を取り違えない)', () => {
    expect(kinds('a === b !== c => d -> e ... ?? <= >= && ||')).toEqual([
      'ident:a', 'punct:===', 'ident:b', 'punct:!==', 'ident:c', 'punct:=>', 'ident:d', 'punct:->', 'ident:e',
      'punct:...', 'punct:??', 'punct:<=', 'punct:>=', 'punct:&&', 'punct:||',
    ]);
  });

  it('★ 行と列は改行で数え直す (タブ・CR も 1 列)', () => {
    const t = lex('x', 'a\n\tb\r\n  c').filter((x) => x.kind === 'ident');
    expect(t.map((x) => [x.text, x.pos.line, x.pos.col])).toEqual([['a', 1, 1], ['b', 2, 2], ['c', 3, 3]]);
    const eof = lex('x', 'a\nbc').at(-1)!;
    expect([eof.kind, eof.pos.line, eof.pos.col]).toEqual(['eof', 2, 3]);
  });
});

describe('構文の誤りは文と場所を名乗る', () => {
  const CASES: readonly [string, string, string][] = [
    ['関数の名前が無い', 'fn (x) -> void {\n}\n', at(1, 4, '名前が要ります (在ったのは `(`)')],
    ['区切りが無い', 'use { a b } from "x";\n', at(1, 9, '`,` が要ります (在ったのは `b`)')],
    ['from の後が文字列でない', 'use { a } from x;\n', at(1, 16, '文字列が要ります (在ったのは `x`)')],
    ['catch が無い', FN('  try {\n    return 1;\n  } finally {\n  }'), at(4, 5, '`catch` が要ります (在ったのは `finally`)')],
    ['; が無い (ファイルの終わり)', 'const A = 1', at(1, 12, '`;` が要ります (在ったのは ファイルの終わり)')],
    ['式が無い', FN('  return );'), at(2, 10, '式が要ります (在ったのは `)`)')],
    ['予約語を式に置く', FN('  return use;'), at(2, 10, '`use` はここに置けません')],
    ['const に値が無い', FN('  const y;'), at(2, 10, '`const` には値が要ります')],
    ['文の前の ///', FN('  /// 説明\n  return 1;'), at(2, 3, '`///` は関数・定数の前に置きます (文の前は `//`)')],
    ['型が閉じない', 'fn f(x: Array<string', at(1, 21, '型が閉じていません')],
    ['型の途中の注記', 'fn f(x: Array< // c\nstring>) -> void {\n}\n', at(1, 16, '型の途中に注記は置けません')],
    ['型の途中の ///', 'fn f(x: Array< /// d\nstring>) -> void {\n}\n', at(1, 16, '型の途中に注記は置けません')],
    ['型の途中の //!', 'fn f(x: Array< //! h\nstring>) -> void {\n}\n', at(1, 16, '型の途中に注記は置けません')],
    ['名前でない物への代入', FN('  1 = 2;'), at(2, 5, '`;` が要ります (在ったのは `=`)')],
    ['arrow の頭が名前でない', FN("  return 'a' => 1;"), at(2, 14, '`;` が要ります (在ったのは `=>`)')],
    ['extern の名前の区切りが無い', 'extern sink { a b } from "x";\n', at(1, 17, '`,` が要ります (在ったのは `b`)')],
    ['型の括弧が合わない', 'fn f(x: a>) -> void {\n}\n', at(1, 10, '型の括弧が合いません')],
    ['括弧が閉じない (arrow の先読みはファイルの終わりで止まる)', FN('  return (x'), at(3, 1, '`)` が要ります (在ったのは `}`)')],
    ['型が無い', 'fn f(x: ) -> void {\n}\n', at(1, 9, '型が要ります')],
    ['extern の権限が無い', 'extern foo { a } from "x";\n', at(1, 1, '`extern` の後には `sink` か `pure` を書きます (その値が危ない口か)')],
    ['項目でない語', 'export banana;\n', at(1, 8, '項目が要ります —— use / extern / vetted / type / interface / const / fn (在ったのは `banana`)')],
    ['項目の途中でファイルが終わる', 'export', at(1, 7, '項目が要ります —— use / extern / vetted / type / interface / const / fn (在ったのは ファイルの終わり)')],
    ['先頭でない //!', 'const A = 1;\n//! 後ろ\n', at(2, 1, '`//!` はファイルの先頭だけに置きます')],
    ['/// の後に項目が無い', 'const A = 1;\n/// 説明\n', at(3, 1, '`///` の後に項目がありません')],
  ];
  for (const [name, src, want] of CASES) {
    it(`★ ${name}`, () => expect(m0(src)).toBe(want));
  }

  it('対照: let は値が無くてよい・注記は項目の間に置ける', () => {
    expect(m0(FN('  let y;\n  return y;'))).toBe('ok');
    expect(m0('// 項目の前の注記\n/// 説明\n// 説明と項目の間の注記\nconst A = 1;\n')).toBe('ok');
  });
});

describe('構文木の形', () => {
  const items = (src: string): readonly Item[] => parse('x', src).items;
  const body = (src: string): readonly Stmt[] => {
    const it = items(src)[0]!;
    if (it.kind !== 'fn') throw new Error('fn ではない');
    return it.body;
  };

  it('★ 型の綴りは TypeScript の書き方へ写す (生成物にそのまま出る)', () => {
    const fn = items('fn f(a: Promise<Array<string>>, b: readonly string[], c: Record<string, number>, d: string | null, e: (x: string) => void, g: Map<string, [number, string]>, h: a.B<C>, k: { a: string; b: number }) -> void {\n}\n')[0]!;
    if (fn.kind !== 'fn') throw new Error('fn ではない');
    expect(fn.params.map((p) => p.type!.text)).toEqual([
      'Promise<Array<string>>',
      'readonly string[]',
      'Record<string, number>',
      'string | null',
      '(x: string) => void',
      'Map<string, [number, string]>',
      'a.B<C>',
      '{ a: string; b: number }',
    ]);
    // 型の綴りが名乗る名前 (組み込みの語は除く) —— 印の型を見つけるのに使う
    expect(fn.params.map((p) => p.type!.names)).toEqual([
      ['Promise', 'Array'], ['readonly'], ['Record'], [], ['x'], ['Map'], ['a', 'B', 'C'], ['a', 'b'],
    ]);
  });

  it('★ 末尾の , は型の綴りでも詰める', () => {
    const fn = items('fn f(a: [string,]) -> void {\n}\n')[0]!;
    if (fn.kind === 'fn') expect(fn.params[0]!.type!.text).toBe('[string,]');
  });

  it('★ 代入と比べる式を取り違えない (x = 1 は代入・x === 1 は式)', () => {
    expect(body(FN('  x = 1;\n  x === 1;')).map((s) => s.kind)).toEqual(['assign', 'expr']);
  });

  it('★ 本体の末尾の注記は注記の文として残る・中ほどの注記は次の文に付く', () => {
    const b = body(FN('  // 前\n  return 1;\n  // 後'));
    expect(b.map((s) => [s.kind, s.comments])).toEqual([['return', ['前']], ['comment', ['後']]]);
  });

  it('★ else if は if の文 1 つを else に持つ (注記は持たない)', () => {
    const b = body(FN('  if (x) {\n    return 1;\n  } else if (x) {\n    return 2;\n  }'));
    const s = b[0]!;
    if (s.kind !== 'if') throw new Error('if ではない');
    expect(s.otherwise!.map((x) => [x.kind, x.comments])).toEqual([['if', []]]);
  });

  it('★ arrow は括弧の対で先読みする (括弧つきの式は arrow ではない)', () => {
    const e = (src: string) => {
      const s = body(FN(`  return ${src};`))[0]!;
      if (s.kind !== 'return') throw new Error('return ではない');
      return s.value!;
    };
    expect(e('(x) + 1').kind).toBe('binary');
    expect(e('(x: (string), y) => x').kind).toBe('arrow');
    expect(e('x => x').kind).toBe('arrow');
    expect(e('((x))').kind).toBe('ident');
    expect(e('(x)').kind).toBe('ident');
  });

  it('★ true / false / null / undefined は字面 (名前ではない)', () => {
    for (const w of ['true', 'false', 'null', 'undefined']) {
      const s = body(FN(`  return ${w};`))[0]!;
      if (s.kind !== 'return' || s.value === null) throw new Error('return ではない');
      expect([s.value.kind, s.value.kind === 'literal' ? s.value.value : null]).toEqual(['literal', w]);
    }
    const s = body(FN('  return truthy;'))[0]!;
    if (s.kind === 'return') expect(s.value?.kind).toBe('ident');
  });

  it('★ new は名前とメンバの鎖を呼ぶ側に取る', () => {
    const s = body(FN('  return new a.b.C(1);'))[0]!;
    if (s.kind !== 'return' || s.value === null || s.value.kind !== 'new') throw new Error('new ではない');
    expect(s.value.callee.kind).toBe('member');
    expect(s.value.args).toHaveLength(1);
  });

  it('★ 演算子の強さの段 (同じ段は左から・下の段ほど強い)', () => {
    const s = body(FN('  return a ?? b || c && d === e < f + g * h;'))[0]!;
    if (s.kind !== 'return' || s.value === null) throw new Error('return ではない');
    const ops: string[] = [];
    let v = s.value;
    while (v.kind === 'binary') {
      ops.push(v.op);
      v = v.right;
    }
    expect(ops).toEqual(['??', '||', '&&', '===', '<', '+', '*']);
    const t = body(FN('  return a - b - c;'))[0]!;
    if (t.kind === 'return' && t.value?.kind === 'binary') expect(t.value.left.kind).toBe('binary');
  });
});

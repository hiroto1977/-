import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.38 —— 字面の語 (`true` / `false` / `null` / `undefined`) は名前にできない。型の語は型・import の名前にできない**
 * (2026-11-16 · MG-076 · 言語の穴探し · threat: T-275)。
 *
 * 0.37 までの構文の段は、名前の位置でどの語でも受けた。`true` / `false` / `null` は JavaScript の予約語なので生成物を `tsc` が構文で断るが、
 * **`undefined` は予約語ではない** —— 束縛の名前に書け、`tsc` (strict) も通す。検査器は式の `undefined` を「値を持たない字面」と読み、
 * 生成物の TypeScript はその場の束縛を引く。**検めた物と走る物が別**になる:
 *
 *   gate fn forge(x: string) -> VU | null {
 *     const undefined = JSON.parse(x);     // 型は any
 *     return undefined;                    // 検査器: 「null / undefined を返す」(M1 を通る)。走るのは束縛の中身
 *   }
 *
 * 同じ綴りで、印を受ける関数を検めなしで呼べ (`sink fn undefined(u: 印)` を `undefined(JSON.parse(x))` —— 呼ぶ側が名前ではないので M4 が見ない)、
 * 計算した鍵の添字の結果 (inert) と、関数の結果を置いた直下の const (0.37 · T-274) を「字面」として持ち出せた。
 *
 * 標本のうち ★ の付いた形は、直す前は Mamori と `tsc` (strict) の両方を通った (手元の足場で実測)。
 */

function diagnostics(...sources: string[]): string[] {
  const r = compileProject(sources.map((source, i) => ({ path: `src/x/m${i}.mamori`, source })));
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}

const LITERAL = (w: string): string => `[M0] \`${w}\` は名前にできません —— Mamori は式の \`${w}\` を値の字面として読みますが、TypeScript はその場の同名の束縛を引くので、検めた値と走る値が食い違います`;
const TYPE = (w: string): string => `[M0] \`${w}\` は型・import の名前にできません —— Mamori は型の綴りを語で読むので`;
/** 断りが、m0 のその位置の、その 1 件だけであること。 */
const only = (line: number, col: number, message: string): unknown[] => [expect.stringContaining(`src/x/m0.mamori:${line}:${col}: ${message}`)];

const BASE = 'export vetted VU = "u";\nextern sink { rawOpen } from "./host";\nexport sink fn open(u: VU) -> void {\n  rawOpen(u);\n}\n';
const ATTACK = 'export fn attack(evil: string) -> void {\n  const v = forge(evil);\n  if (v !== null) {\n    open(v);\n  }\n}\n';
const gate = (body: string, pre = ''): string => `${BASE}${pre}export gate fn forge(x: string) -> VU | null {\n${body}}\n${ATTACK}`;

describe('0.38: 字面の語は名前にできない (threat: T-275)', () => {
  it('★ 関門の中で `undefined` と名付けた束縛を返す形を断る —— mint を通らない値が関門から出た (threat: T-275)', () => {
    // 直す前: 4 形とも Mamori と tsc を通り、`forge(evil)` の結果 (JSON.parse の any) が印 VU を名乗って open へ届いた
    expect(diagnostics(gate('  const undefined = JSON.parse(x);\n  return undefined;\n'))).toEqual(only(7, 9, LITERAL('undefined')));
    expect(diagnostics(gate('  for (const undefined of [JSON.parse(x)]) {\n    return undefined;\n  }\n  return null;\n'))).toEqual(only(7, 14, LITERAL('undefined')));
    expect(diagnostics(gate('  const { undefined } = JSON.parse(x);\n  return undefined;\n'))).toEqual(only(7, 11, LITERAL('undefined')));
    expect(diagnostics(gate('  let undefined = JSON.parse(x);\n  undefined = JSON.parse(x);\n  return undefined;\n'))).toEqual(only(7, 7, LITERAL('undefined')));
    // module 直下の const に置いた any を、どの関門からも `return undefined;` で返せた
    expect(diagnostics(gate('  return x.length > 0 ? undefined : null;\n', 'const undefined = JSON.parse("\\"javascript:alert(1)\\"");\n'))).toEqual(only(6, 7, LITERAL('undefined')));
    // 断りは、検めた値と走る値が食い違うことと、関門の例を名指しする
    const d = diagnostics(gate('  const undefined = JSON.parse(x);\n  return undefined;\n'));
    expect(d[0]).toContain('(`const undefined = JSON.parse(x); return undefined;` は、関門から mint を通らない値を返します)');
  });

  it('★ 印を受ける関数を `undefined` と名付けて、検めなしで呼ぶ形を断る (threat: T-275)', () => {
    // 直す前: 呼ぶ側 `undefined` は名前ではなく字面なので、外形 (印を受ける引数) を引かず、M4 が何も言わなかった
    const src = 'export vetted VU = "u";\nextern sink { rawOpen } from "./host";\nsink fn undefined(u: VU) -> void {\n  rawOpen(u);\n}\nexport fn attack(evil: string) -> void {\n  undefined(JSON.parse(evil));\n}\n';
    expect(diagnostics(src)).toEqual(only(3, 9, LITERAL('undefined')));
    // 対照: 同じ形を別の名前で書けば、M4 が印の無い値を断る (名前だけが違う)
    expect(diagnostics(src.replaceAll('undefined', 'send'))).toEqual([expect.stringContaining('[M4] send の引数 1 は印 VU を持つ値だけを受けます')]);
  });

  it('★ 計算した鍵の添字の結果と、関数の結果を置いた直下の const を「字面」として持ち出す形を断る (threat: T-275)', () => {
    // 直す前: `return undefined;` は字面の戻り値なので、inert の検め (T-257) も、関数の結果の const の検め (T-274) も通らなかった
    expect(diagnostics('export fn f(xs: readonly unknown[], k: number) -> unknown {\n  const undefined = xs[k];\n  return undefined;\n}\n')).toEqual(only(2, 9, LITERAL('undefined')));
    expect(diagnostics('export fn f(xs: readonly unknown[], k: number) -> unknown {\n  try {\n    throw xs[k];\n  } catch (undefined) {\n    return undefined;\n  }\n}\n')).toEqual(only(4, 12, LITERAL('undefined')));
    const ADDER = 'fn make() -> (x: string) => readonly string[] {\n  const xs = ["https://ok/"];\n  return (x: string) => {\n    xs.push(x);\n    return xs;\n  };\n}\n';
    expect(diagnostics(ADDER + 'const undefined = make();\nexport fn attack(evil: string) -> readonly string[] {\n  return undefined(evil);\n}\n')).toEqual(only(8, 7, LITERAL('undefined')));
    // 対照: 同じ 2 形を別の名前で書けば、それぞれの規則が断る
    expect(diagnostics('export fn f(xs: readonly unknown[], k: number) -> unknown {\n  const v = xs[k];\n  return v;\n}\n')).toEqual([expect.stringContaining('[M6] 計算した鍵の添字の結果は戻り値に入れられません')]);
    expect(diagnostics(ADDER + 'const ADD = make();\nexport fn attack(evil: string) -> readonly string[] {\n  return ADD(evil);\n}\n')).toEqual([expect.stringContaining('[M6] ADD は、関数の呼び出しの結果を置いたモジュール直下の const なので、Mamori の中では読めません')]);
  });

  it('★ 名前を読む位置はどこでも同じ —— 4 つの語 × 束縛・宣言・鍵・メンバの 37 の位置 (threat: T-275)', () => {
    const forms = (w: string): readonly (readonly [string, string, number, number])[] => [
      ['関数の引数', `export fn f(${w}: string) -> string {\n  return "a";\n}\n`, 1, 13],
      ['既定値つきの引数', `export fn f(${w} = 1) -> number {\n  return 1;\n}\n`, 1, 13],
      ['省ける引数', `export fn f(${w}?: string) -> number {\n  return 1;\n}\n`, 1, 13],
      ['局所の const', `export fn f(x: string) -> number {\n  const ${w} = x;\n  return 1;\n}\n`, 2, 9],
      ['局所の let', `export fn f(x: string) -> number {\n  let ${w} = x;\n  return 1;\n}\n`, 2, 7],
      ['catch の束縛', `export fn f(x: string) -> number {\n  try {\n    throw x;\n  } catch (${w}) {\n    return 1;\n  }\n}\n`, 4, 12],
      ['for の回す変数', `export fn f(xs: string[]) -> number {\n  for (const ${w} of xs) {\n    return 1;\n  }\n  return 0;\n}\n`, 2, 14],
      ['分割代入の名前', `export fn f(o: Record<string, unknown>) -> number {\n  const { ${w} } = o;\n  return 1;\n}\n`, 2, 11],
      ['分割代入の別名', `export fn f(o: Record<string, unknown>) -> number {\n  const { a: ${w} } = o;\n  return 1;\n}\n`, 2, 14],
      ['分割代入の鍵', `export fn f(o: Record<string, unknown>) -> unknown {\n  const { ${w}: a } = o;\n  return a;\n}\n`, 2, 11],
      ['括弧つきの arrow の引数', `export fn f() -> unknown {\n  return (${w}: string) => 1;\n}\n`, 2, 11],
      ['module 直下の const', `const ${w} = 1;\n`, 1, 7],
      ['module 直下の let', `let ${w}: number = 1;\n`, 1, 5],
      ['module 直下の fn', `fn ${w}() -> number {\n  return 1;\n}\n`, 1, 4],
      ['gate fn', `export vetted VU = "u";\ngate fn ${w}(x: string) -> VU {\n  return mint VU(x);\n}\n`, 2, 9],
      ['クラス', `class ${w} extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\n`, 1, 7],
      ['型の別名', `type ${w} = string;\n`, 1, 6],
      ['interface', `interface ${w} {\n  readonly a: string;\n}\n`, 1, 11],
      ['interface の基底', `interface A {\n  readonly a: string;\n}\ninterface B extends ${w} {\n  readonly b: string;\n}\n`, 4, 21],
      ['印', `export vetted ${w} = "u";\n`, 1, 15],
      ['型引数', `export fn f<${w}>(x: string) -> string {\n  return x;\n}\n`, 1, 13],
      ['use の名前', `use { ${w} } from "./host";\n`, 1, 7],
      ['use の別名', `use { rawOpen alias ${w} } from "./host";\n`, 1, 21],
      ['use type の別名', `use type { AnyFn alias ${w} } from "./host";\n`, 1, 24],
      ['use default', `use default ${w} from "./host";\n`, 1, 13],
      ['extern pure', `extern pure { ${w} } from "./host";\n`, 1, 15],
      ['extern sink global', `extern sink global ${w};\n`, 1, 20],
      ['再輸出', `use { rawOpen } from "./m1";\nexport { ${w} };\n`, 2, 10],
      ['mint の印の名前', `export vetted VU = "u";\ngate fn g(x: string) -> VU {\n  return mint ${w}(x);\n}\n`, 3, 15],
      ['new の相手', `export fn f() -> unknown {\n  return new ${w}();\n}\n`, 2, 14],
      ['オブジェクトの鍵', `export fn f() -> unknown {\n  return { ${w}: 1 };\n}\n`, 2, 12],
      ['メンバの名前', `export fn f(o: Record<string, unknown>) -> unknown {\n  return o.${w};\n}\n`, 2, 12],
      ['field の欄', `export fn f(o: unknown) -> unknown {\n  return field o.${w};\n}\n`, 2, 18],
      ['代入の相手', `export fn f(x: string) -> void {\n  let y = x;\n  y = x;\n  ${w} = x;\n}\n`, 4, 3],
      ['欄への代入の相手', `export fn f(x: string) -> void {\n  ${w}.k = x;\n}\n`, 2, 3],
      ['括弧なしの arrow の引数', `export fn f() -> unknown {\n  return ${w} => 1;\n}\n`, 2, 10],
      ['async の括弧なしの arrow の引数', `export fn f() -> unknown {\n  return async ${w} => 1;\n}\n`, 2, 16],
    ];
    for (const w of ['true', 'false', 'null', 'undefined']) {
      const table = forms(w);
      expect(table).toHaveLength(37);
      for (const [where, src, line, col] of table) {
        const d = diagnostics(src);
        // 名前の位置で断る形は、その位置の、その 1 件 (構文の段は最初の誤りで止まる)。式として先に読まれる 4 形 (代入・arrow の頭) は別の断りになる。
        const asExpression = ['代入の相手', '欄への代入の相手', '括弧なしの arrow の引数', 'async の括弧なしの arrow の引数'].includes(where);
        if (asExpression) {
          expect(d, `${w} / ${where}`).toHaveLength(1);
          expect(d[0], `${w} / ${where}`).toContain(`src/x/m0.mamori:${line}:`);
          expect(d[0], `${w} / ${where}`).toContain('[M0]');
        } else {
          expect(d, `${w} / ${where}`).toEqual(only(line, col, LITERAL(w)));
        }
      }
    }
  });

  it('★ 型の語は、型・import の名前にできない —— 9 語 × 型を指す宣言の 11 の位置 (threat: T-275)', () => {
    // どれも tsc が断る形 (TS2457 / TS2427 / TS2414 / TS2368 / TS2438) —— 検査器は型の綴りを語で読むので、構文の段でも断る (守りを tsc の 1 層に預けない)
    const forms = (w: string): readonly (readonly [string, string, number, number])[] => [
      ['クラス', `class ${w} extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\n`, 1, 7],
      ['型の別名', `type ${w} = string;\n`, 1, 6],
      ['interface', `interface ${w} {\n  readonly a: string;\n}\n`, 1, 11],
      ['印', `export vetted ${w} = "u";\n`, 1, 15],
      ['型引数', `export fn f<${w}>(x: string) -> string {\n  return x;\n}\n`, 1, 13],
      ['use の名前', `use { ${w} } from "./host";\n`, 1, 7],
      ['use の別名', `use { rawOpen alias ${w} } from "./host";\n`, 1, 21],
      ['use type の別名', `use type { AnyFn alias ${w} } from "./host";\n`, 1, 24],
      ['use default', `use default ${w} from "./host";\n`, 1, 13],
      ['extern pure', `extern pure { ${w} } from "./host";\n`, 1, 15],
      ['extern sink global', `extern sink global ${w};\n`, 1, 20],
    ];
    const words = ['unknown', 'never', 'number', 'bigint', 'boolean', 'string', 'symbol', 'void', 'object'];
    for (const w of words) {
      const table = forms(w);
      expect(table).toHaveLength(11);
      for (const [where, src, line, col] of table) expect(diagnostics(src), `${w} / ${where}`).toEqual(only(line, col, TYPE(w)));
    }
    // 断りは、語で読む 2 つの判定 (数と分かる鍵・印を運ぶ型) を名指しする
    expect(diagnostics('type number = string;\n')[0]).toContain('(`k: number` は数と分かる鍵・`印 | undefined` は印を運ぶ型)、その語が別の型を指すと、検めた型と走る型が食い違います');
    // 数と分かる鍵の検め (0.8) は `number` の綴りを信じる —— その語が別の型を指す宣言が 1 つも書けないことが、その検めの前提
    expect(diagnostics('type number = string;\nexport fn f(xs: readonly unknown[], k: number) -> boolean {\n  return xs[k] === 1;\n}\n')).toEqual(only(1, 6, TYPE('number')));
  });

  it('対照: 字面は値として今までどおり書ける・型の語は値の名前に使える・鍵は文字列で書ける', () => {
    // 式の位置の字面と、型の位置の null / undefined
    expect(diagnostics('export fn f(x: string | null | undefined) -> unknown {\n  if (x === undefined || x === null) {\n    return [true, false, null, undefined];\n  }\n  return x;\n}\n')).toEqual([]);
    // 関門が undefined を返す形 (束縛が無ければ字面のまま —— M1 が通す)
    expect(diagnostics('export vetted VU = "u";\nexport gate fn g(x: string) -> VU | undefined {\n  if (x.length > 0) {\n    return mint VU(x);\n  }\n  return undefined;\n}\n')).toEqual([]);
    // 型の語は値の名前 (引数・局所の const / let) に使える —— 値の名前は型を指さない
    expect(
      diagnostics('export fn f(string: string, number: number, unknown: string, object: string) -> string {\n  const boolean = string + unknown + object;\n  let symbol = boolean;\n  symbol = symbol + String(number);\n  return symbol;\n}\n'),
    ).toEqual([]);
    expect(diagnostics('const string = "a";\nfn number() -> number {\n  return 1;\n}\nexport fn f() -> string {\n  return string + String(number());\n}\n')).toEqual([]);
    // 字面の語と同じ綴りの鍵は、文字列で書く (欄を読むのは字面の添字)
    expect(diagnostics('export fn f(o: Record<string, unknown>) -> unknown {\n  return [{ "null": 1, "undefined": 2, "true": 3, "false": 4 }, o["null"], o["undefined"]];\n}\n')).toEqual([]);
    // 字面の語を含むだけの名前は別の名前
    expect(diagnostics('export fn f(undefined2: string, isNull: boolean, trueValue: number) -> unknown {\n  return [undefined2, isNull, trueValue];\n}\n')).toEqual([]);
  });
});

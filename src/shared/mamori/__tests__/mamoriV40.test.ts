import { describe, expect, it } from 'vitest';
import { transformSync } from 'esbuild';
import ts from 'typescript';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.40 —— JavaScript の文法に無い綴りを、構文の段で断る 3 つの締め** (2026-11-17 · MG-078 · 穴ではなく、守りの層を足す周)。
 *
 * 0.39 まで、次の 3 つは Mamori の構文の段を通っていた。どれも「検めた木と走る木が食い違う」形ではない (穴ではない) が、
 * 読み手が JavaScript の規則を当てにできない綴りか、守りが生成物の側 (`tsc`) の 1 層だけに在る綴りだった:
 *
 *  1. `a ?? b || c` —— JavaScript は `??` と `||` / `&&` を括弧なしで混ぜさせない。Mamori は `??` をいちばん弱い演算子として読み、
 *     変換が括弧を足して出していた (`a ?? (b || c)`)。読み手が `(a ?? b) || c` と読むと、検めた式と読んだ式が違う。
 *  2. 数の綴り `08` / `00` / `0_1` / `1_` / `1__0` / `1_.5` —— 字句が数として受け、生成物を `tsc` が構文の誤りで断っていた。
 *  3. 束縛・宣言の名前に JavaScript の予約語 (`const var = 1;`・引数 `enum`・`arguments`) —— 生成物を `tsc` が断っていた。
 *
 * メンバ (`m.delete(k)`) と鍵 (`{ default: 1 }`) は JavaScript が予約語を書かせる位置なので、今までどおり書ける。
 */

function compile(source: string): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs][0]![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}

const FN = (body: string, sig = 'a: number, b: number, c: number, d: number'): string => `export fn t(${sig}) -> unknown {\n${body}}\n`;
const only = (line: number, col: number, message: string): unknown[] => [`src/x/m0.mamori:${line}:${col}: ${message}`];
const MIX = '[M0] `??` と `||` / `&&` は括弧なしで混ぜられません —— JavaScript の文法に無い並びです (`(a || b) ?? c` か `a || (b ?? c)` と括ります)';
const NUM = (n: string): string => '[M0] 数の綴り `' + n + '` は書けません —— 先頭の 0 (`08`)・連続した `_` (`1__0`)・末尾の `_` (`1_`) は JavaScript の数の文法に在りません';
const BIND = (w: string): string => `[M0] \`${w}\` は束縛・宣言の名前にできません —— JavaScript の予約語 (と、モジュールで束縛にできない \`arguments\`) です。メンバ (\`x.${w}\`) と鍵 (\`{ ${w}: … }\`) には書けます`;

/** TypeScript の構文の段が挙げる誤りの数 (生成物がこの綴りだったら `tsc` が止まるか)。 */
function tsSyntaxErrors(text: string): number {
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.ES2022, true) as ts.SourceFile & { readonly parseDiagnostics: readonly unknown[] };
  return sf.parseDiagnostics.length;
}

describe('0.40: `??` と `||` / `&&` は括弧なしで混ぜられない (MG-078)', () => {
  it('★ 括らない混ぜ書きを断る —— 左の辺・右の辺・`&&`・続けた `??`・外側だけ括っていない形', () => {
    // 断る場所は `??` の字句 (2 行目。`  return ` の後ろが 10 桁目)
    expect(compile(FN('  return a ?? b || c;\n')).diagnostics).toEqual(only(2, 12, MIX));
    expect(compile(FN('  return a ?? b && c;\n')).diagnostics).toEqual(only(2, 12, MIX));
    expect(compile(FN('  return a || b ?? c;\n')).diagnostics).toEqual(only(2, 17, MIX));
    expect(compile(FN('  return a && b ?? c;\n')).diagnostics).toEqual(only(2, 17, MIX));
    // 続けた `??` の 2 つ目の辺・単項を挟んだ辺・内側だけ括った辺 (外側の `||` は括っていない)
    expect(compile(FN('  return a ?? b ?? c || d;\n')).diagnostics).toEqual(only(2, 17, MIX));
    expect(compile(FN('  return a ?? !b || c;\n')).diagnostics).toEqual(only(2, 12, MIX));
    expect(compile(FN('  return (a || b) || c ?? d;\n')).diagnostics).toEqual(only(2, 24, MIX));
  });

  it('対照: 括れば書ける・生成物は括弧を保つ・木の形は揃う', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['(a || b) ?? c', '(a || b) ?? c'],
      ['a ?? (b || c)', 'a ?? (b || c)'],
      ['a || (b ?? c)', 'a || (b ?? c)'],
      ['(a ?? b) && c', '(a ?? b) && c'],
      ['(a && b) ?? (c || d)', '(a && b) ?? (c || d)'],
      ['((a || b)) ?? c', '(a || b) ?? c'],
      // `??` どうし・`??` を含まない混ぜ書き・`??` の辺の足し算は、括弧なしで書ける (JavaScript の文法に在る)
      ['a ?? b ?? c', 'a ?? b ?? c'],
      ['a || b && c', 'a || b && c'],
      ['a ?? b + c', 'a ?? b + c'],
    ];
    for (const [source, emitted] of cases) {
      const src = FN(`  return ${source};\n`);
      const r = compile(src);
      expect(r.diagnostics, source).toEqual([]);
      expect(r.emitted, source).toContain(`  return ${emitted};\n`);
      expect(shapeMismatch('src/x/m0.mamori', src, r.emitted), source).toEqual([]);
    }
  });

  it('対照: 断った綴りは JavaScript の構文が断る並び・括った綴りは通る (esbuild で読む)', () => {
    const reads = (expr: string): boolean => {
      try {
        transformSync(`export const z = (a, b, c) => ${expr};`, { loader: 'js' });
        return true;
      } catch {
        return false;
      }
    };
    for (const mixed of ['a ?? b || c', 'a ?? b && c', 'a || b ?? c', 'a && b ?? c']) expect(reads(mixed), mixed).toBe(false);
    for (const fine of ['(a || b) ?? c', 'a ?? (b || c)', 'a ?? b ?? c', 'a || b && c']) expect(reads(fine), fine).toBe(true);
  });
});

describe('0.40: 数の綴りは JavaScript の文法どおりだけ (MG-078)', () => {
  /** 字句が数として切り出すが、JavaScript の数の文法に無い綴り。 */
  const REFUSED = ['08', '00', '007', '0_1', '1_', '1__0', '1_.5', '01.5'];

  it('★ 先頭の 0・連続した `_`・末尾の `_` を断る', () => {
    for (const n of REFUSED) expect(compile(FN(`  return ${n};\n`)).diagnostics, n).toEqual(only(2, 10, NUM(n)));
    // 式の頭でなくても同じ (引数の位置・足し算の右)
    expect(compile(FN('  return a + 08;\n')).diagnostics).toEqual(only(2, 14, NUM('08')));
  });

  it('対照: JavaScript の文法に在る綴りは今までどおり書ける (生成物へそのまま写る)', () => {
    for (const n of ['0', '7', '10', '100', '1_000', '12_345_678', '0.5', '0.25', '1_000.75', '0x1F', '0X0a']) {
      const r = compile(FN(`  return ${n};\n`));
      expect(r.diagnostics, n).toEqual([]);
      expect(r.emitted, n).toContain(`  return ${n};\n`);
      expect(tsSyntaxErrors(`export const z = ${n};`), n).toBe(0);
    }
    // 16 進の数字が 1 つも無い綴りは、前からの断り (0.3) のまま
    expect(compile(FN('  return 0x;\n')).diagnostics).toEqual(only(2, 10, '[M0] `0x` の後に 16 進の数字 (0-9 / a-f) が要ります'));
  });

  it('対照: 断った綴りは、生成物に写っていれば TypeScript が構文の誤りで止める綴り (0.39 までは tsc の 1 層だった)', () => {
    for (const n of REFUSED) expect(tsSyntaxErrors(`export const z = ${n};`), n).toBeGreaterThan(0);
  });
});

describe('0.40: JavaScript の予約語は束縛・宣言の名前にできない (MG-078)', () => {
  /** 束縛・宣言の名前にできない語。構文の段の表を写さず、ここに並べる (表が減れば落ちる)。`eval` は字句の段がどの位置でも先に断る。 */
  const WORDS = [
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'finally', 'for',
    'function', 'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with',
    'let', 'static', 'yield', 'implements', 'interface', 'package', 'private', 'protected', 'public', 'await', 'arguments',
  ];
  /** 値の束縛の位置 (12)。 */
  const VALUE_POSITIONS: Readonly<Record<string, (w: string) => string>> = {
    引数: (w) => `export fn t(${w}: number) -> number {\n  return 1;\n}\n`,
    'const (関数の中)': (w) => FN(`  const ${w} = a;\n  return 1;\n`),
    'let (関数の中)': (w) => FN(`  let ${w} = a;\n  return 1;\n`),
    '分割代入の省略形': (w) => FN(`  const { ${w} } = o;\n  return 1;\n`, 'o: { readonly k: number }'),
    '分割代入の付け替え': (w) => FN(`  const { k: ${w} } = o;\n  return 1;\n`, 'o: { readonly k: number }'),
    'for-of': (w) => FN(`  for (const ${w} of xs) {\n  }\n  return 1;\n`, 'xs: readonly number[]'),
    catch: (w) => FN(`  try {\n    return 1;\n  } catch (${w}) {\n    return 2;\n  }\n`),
    '矢印関数 (括弧なし)': (w) => FN(`  const g = ${w} => 1;\n  return g;\n`),
    '矢印関数 (括弧つき)': (w) => FN(`  const g = (${w}: number) => 1;\n  return g;\n`),
    'const (直下)': (w) => `const ${w} = 1;\n`,
    'let (直下)': (w) => `let ${w}: number = 1;\n`,
    関数の名前: (w) => `fn ${w}() -> number {\n  return 1;\n}\n`,
  };
  /** 型・import の名前の位置 (4)。`void` は型の語の断り (0.38) が先に答える。 */
  const TYPE_POSITIONS: Readonly<Record<string, (w: string) => string>> = {
    型の別名: (w) => `type ${w} = string;\n`,
    型引数の名前: (w) => `export fn f<${w}>(x: number) -> number {\n  return x;\n}\n`,
    'use の名前': (w) => `use { ${w} } from "./host";\n`,
    interface: (w) => `interface ${w} {\n  readonly a: string;\n}\n`,
  };

  it('★ 44 語 × 値の束縛の 12 の位置で断る', () => {
    expect(WORDS).toHaveLength(44);
    expect(Object.keys(VALUE_POSITIONS)).toHaveLength(12);
    for (const [where, form] of Object.entries(VALUE_POSITIONS)) {
      for (const w of WORDS) {
        const d = compile(form(w)).diagnostics;
        expect(d, `${w} / ${where}`).toHaveLength(1);
        expect(d[0], `${w} / ${where}`).toContain(BIND(w));
      }
    }
    // 断る場所は、その名前の字句
    expect(compile('export fn t(enum: number) -> number {\n  return 1;\n}\n').diagnostics).toEqual(only(1, 13, BIND('enum')));
    expect(compile(FN('  const var = a;\n  return 1;\n')).diagnostics).toEqual(only(2, 9, BIND('var')));
    expect(compile(FN('  const { delete } = o;\n  return 1;\n', 'o: { readonly k: number }')).diagnostics).toEqual(only(2, 11, BIND('delete')));
    expect(compile(FN('  const { k: arguments } = o;\n  return 1;\n', 'o: { readonly k: number }')).diagnostics).toEqual(only(2, 14, BIND('arguments')));
  });

  it('★ 型・import の名前の 4 つの位置でも断る (`void` は型の語の断りが先)', () => {
    for (const [where, form] of Object.entries(TYPE_POSITIONS)) {
      for (const w of WORDS) {
        const d = compile(form(w)).diagnostics;
        expect(d, `${w} / ${where}`).toHaveLength(1);
        expect(d[0], `${w} / ${where}`).toContain(w === 'void' ? '[M0] `void` は型・import の名前にできません' : BIND(w));
      }
    }
  });

  it('対照: メンバと鍵には予約語を書ける (JavaScript がその位置に書かせる)', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['export fn t(m: Map<string, number>) -> boolean {\n  return m.delete("k");\n}\n', '  return m.delete("k");\n'],
      [FN('  const v = { default: 1, class: 2, new: 3 };\n  return v.default + v.class;\n'), '  return v.default + v.class;\n'],
      [FN('  const { default: dflt } = o;\n  return dflt;\n', 'o: { readonly default: number }'), '  return dflt;\n'],
      ['interface I {\n  readonly default: string;\n  readonly delete: number;\n}\nexport fn t(i: I) -> string {\n  return i.default;\n}\n', '  return i.default;\n'],
      ['export fn t(p: Promise<number>) -> Promise<number> {\n  return p.catch((e) => 0).finally(() => undefined);\n}\n', '  return p.catch((e) => 0).finally(() => undefined);\n'],
    ];
    for (const [src, emitted] of cases) {
      const r = compile(src);
      expect(r.diagnostics, src).toEqual([]);
      expect(r.emitted, src).toContain(emitted);
    }
  });

  it('対照: 予約語でない名前は、同じ位置に今までどおり書ける', () => {
    for (const [where, form] of Object.entries(VALUE_POSITIONS)) {
      // 関数の名前・直下の束縛は、使われない宣言でも通る (検めるのは名前の読みだけ)
      const d = compile(form('value')).diagnostics;
      expect(d.filter((x) => x.includes('束縛・宣言の名前にできません')), where).toEqual([]);
    }
    expect(compile('export fn t(value: number) -> number {\n  return value;\n}\n').diagnostics).toEqual([]);
    expect(compile(FN('  const g = value => value;\n  return g;\n')).diagnostics).toEqual([]);
  });

  it('対照: 断った綴りは、生成物に写っていれば TypeScript が構文の誤りで止める綴り (0.39 までは tsc の 1 層だった)', () => {
    expect(tsSyntaxErrors('const var = 1;')).toBeGreaterThan(0);
    expect(tsSyntaxErrors('function f(enum: number) {}')).toBeGreaterThan(0);
    expect(tsSyntaxErrors('const { delete } = o;')).toBeGreaterThan(0);
    expect(tsSyntaxErrors('const value = 1;')).toBe(0);
  });
});

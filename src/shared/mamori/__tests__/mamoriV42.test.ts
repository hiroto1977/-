import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.42 —— 関数の型の引数の名前も、値の束縛と同じ決まりに従う** (2026-11-17 · MG-082 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * 0.40 / 0.41 は値の束縛・宣言の名前から JavaScript の予約語と Mamori 自身の語を外した。残っていたのは**型の綴りの中**の引数の名前で、
 * `type F = (return: number) => void;` は構文の段を通り、生成物を `tsc` が断っていた (検めた物と走る物は食い違わないが、守りが `tsc` の 1 層だった)。
 *
 * 決まりは 3 つ:
 *  1. JavaScript の予約語 (と `arguments`) は、関数の型の引数の名前にできない。表は値の束縛と同じ 1 つ (写さない)。
 *  2. `this` は TypeScript の `this` 引数の注釈なので、**先頭の引数に限って**書ける。2 つ目以降と `this?` は断る。
 *  3. Mamori 自身の語 (`type` / `from` ほか) は TypeScript の名前として正しいので断らない (実物の `autoLock.mamori` が `type: string` を使う)。
 *
 * どの決まりも TypeScript の答えと同じであることを、同じ検査の中で TypeScript に訊いて確かめる (表だけを信じない)。
 */

function compile(source: string): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs][0]![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}

const only = (line: number, col: number, message: string): unknown[] => [`src/x/m0.mamori:${line}:${col}: ${message}`];
const REFUSED = (w: string): string => `[M0] \`${w}\` は関数の型の引数の名前にできません —— JavaScript の予約語 (と、モジュールで束縛にできない \`arguments\`) です (先頭の引数の \`this\` だけは書けます)`;
const THIS_NOT_FIRST = '[M0] `this` は関数の型の先頭の引数にだけ書けます (TypeScript の `this` 引数の注釈) —— 2 つ目以降には置けません';
const THIS_OPTIONAL = '[M0] `this` の引数に `?` は付けられません (TypeScript の `this` 引数の注釈は省略できません)';

/** 値の束縛に使えない語から `this` を除いた物 (43 語)。表を写さず、ここに並べる (表が減れば「断らない」で落ち、増えれば下の値の束縛との突き合わせで落ちる)。 */
const WORDS = [
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
  'finally', 'for', 'function', 'if', 'import',
  'in', 'instanceof', 'new', 'return', 'super', 'switch', 'throw', 'try', 'typeof',
  'var', 'void', 'while', 'with', 'let', 'static', 'yield', 'implements', 'interface', 'package', 'private', 'protected', 'public',
  'await', 'arguments',
];
/** Mamori 自身の語のうち、JavaScript の予約語でない物 (0.41 の表と同じ 12 語)。 */
const MAMORI_WORDS = ['use', 'extern', 'vetted', 'fn', 'gate', 'sink', 'mint', 'from', 'alias', 'of', 'field', 'type'];

/** 関数の型を書ける位置 (7)。 */
const POSITIONS: Readonly<Record<string, (p: string) => string>> = {
  型の別名: (p) => `export type F = (${p}: number) => void;\n`,
  '省略できる引数': (p) => `export type F = (${p}?: number) => void;\n`,
  '2 つ目の引数': (p) => `export type F = (a: number, ${p}: number) => void;\n`,
  '関数の引数の型': (p) => `export fn t(cb: (${p}: number) => void) -> number {\n  return 1;\n}\n`,
  'interface の欄': (p) => `interface I {\n  readonly f: (${p}: number) => void;\n}\n`,
  '関数の型の中の関数の型': (p) => `export type F = (cb: (${p}: number) => void) => void;\n`,
  '関数の型の戻り': (p) => `export type F = (a: number) => (${p}: number) => void;\n`,
};

/** TypeScript (構文 + 意味・厳格モード・lib なし) がその綴りに付ける診断の番号。 */
function tsCodes(text: string): number[] {
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.ES2022, true);
  const host = ts.createCompilerHost({});
  host.getSourceFile = (f) => (f === 'x.ts' ? sf : undefined);
  host.fileExists = (f) => f === 'x.ts';
  const program = ts.createProgram(['x.ts'], { noLib: true, strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, host);
  return [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]
    .filter((d) => !/Cannot find global type/.test(ts.flattenDiagnosticMessageText(d.messageText, ' ')))
    .map((d) => d.code);
}
const tsType = (params: string): string => `export type F = (${params}) => void;`;

describe('0.42: 関数の型の引数の名前は、値の束縛と同じ決まりに従う (MG-082)', () => {
  it('前提: その 43 語は値の束縛の名前にできない語で、`this` を足すと値の側の表と同じになる', () => {
    expect(WORDS).toHaveLength(43);
    expect(new Set(WORDS).size).toBe(43);
    for (const w of [...WORDS, 'this']) {
      const d = compile(`export fn t(${w}: number) -> number {\n  return 1;\n}\n`).diagnostics;
      expect(d, w).toHaveLength(1);
      expect(d[0], w).toContain('JavaScript の予約語');
    }
    // 表に無い語は値の束縛に使える (上の「全部断る」が、何でも断る検査になっていないこと)
    for (const w of ['target', 'thisArg', 'returns', 'klass']) {
      expect(compile(`export fn t(${w}: number) -> number {\n  return ${w};\n}\n`).diagnostics, w).toEqual([]);
    }
  });

  it('★ 43 語 × 関数の型を書ける 7 つの位置で断る', () => {
    expect(Object.keys(POSITIONS)).toHaveLength(7);
    for (const [where, form] of Object.entries(POSITIONS)) {
      for (const w of WORDS) {
        const d = compile(form(w)).diagnostics;
        expect(d, `${w} / ${where}`).toHaveLength(1);
        expect(d[0], `${w} / ${where}`).toContain(REFUSED(w));
      }
    }
    // 断る場所は、その名前の字句
    expect(compile('export type F = (return: number) => void;\n').diagnostics).toEqual(only(1, 18, REFUSED('return')));
    expect(compile('export type F = (a: number, enum: number) => void;\n').diagnostics).toEqual(only(1, 29, REFUSED('enum')));
    expect(compile('interface I {\n  readonly f: (arguments?: number) => void;\n}\n').diagnostics).toEqual(only(2, 16, REFUSED('arguments')));
    expect(compile('export fn t(cb: (await: number) => void) -> number {\n  return 1;\n}\n').diagnostics).toEqual(only(1, 18, REFUSED('await')));
  });

  it('★ TypeScript も同じ 43 語を断る (表が TypeScript より広くも狭くもない)', () => {
    for (const w of WORDS) expect(tsCodes(tsType(`${w}: number`)).length, w).toBeGreaterThan(0);
    // 物差しが生きている: ふつうの名前・Mamori の語・先頭の `this` には診断が付かない
    for (const w of ['target', 'kind', ...MAMORI_WORDS, 'this']) expect(tsCodes(tsType(`${w}: number`)), w).toEqual([]);
  });

  it('★ `this` は先頭の引数にだけ書ける (2 つ目以降と `this?` は断る) —— TypeScript の答えと同じ', () => {
    // 先頭: 書ける (生成物へそのまま写る)
    for (const src of [
      'export type F = (this: number) => void;\n',
      'export type F = (this: number, a: string) => void;\n',
      'interface I {\n  readonly f: (this: string, n: number) => number;\n}\n',
      'export type F = (cb: (this: number) => void) => void;\n',
    ]) {
      const r = compile(src);
      expect(r.diagnostics, src).toEqual([]);
      expect(shapeMismatch('src/x/m0.mamori', src, r.emitted), src).toEqual([]);
    }
    expect(compile('export type F = (this: number, a: string) => void;\n').emitted).toContain('(this: number, a: string) => void');
    expect(tsCodes(tsType('this: number, a: string'))).toEqual([]);

    // 2 つ目以降: 断る
    expect(compile('export type F = (a: number, this: number) => void;\n').diagnostics).toEqual(only(1, 29, THIS_NOT_FIRST));
    expect(compile('export type F = (a: number, b: string, this: number) => void;\n').diagnostics).toEqual(only(1, 40, THIS_NOT_FIRST));
    expect(compile('export type F = (this: number, this: number) => void;\n').diagnostics).toEqual(only(1, 32, THIS_NOT_FIRST));
    expect(tsCodes(tsType('a: number, this: number')).length).toBeGreaterThan(0);
    expect(tsCodes(tsType('this: number, this: number')).length).toBeGreaterThan(0);

    // `this?`: 断る
    expect(compile('export type F = (this?: number) => void;\n').diagnostics).toEqual(only(1, 18, THIS_OPTIONAL));
    expect(tsCodes(tsType('this?: number')).length).toBeGreaterThan(0);
    // 2 つ目の `this?` は、位置の断りが先に答える
    expect(compile('export type F = (a: number, this?: number) => void;\n').diagnostics).toEqual(only(1, 29, THIS_NOT_FIRST));
  });

  it('対照: Mamori 自身の語・ふつうの名前・`?` つきの名前は、関数の型の引数の名前に書ける', () => {
    expect(MAMORI_WORDS).toHaveLength(12);
    for (const [where, form] of Object.entries(POSITIONS)) {
      for (const w of [...MAMORI_WORDS, 'target', 'thisArg', 'returns', 'inner']) {
        const src = form(w);
        const r = compile(src);
        expect(r.diagnostics, `${w} / ${where}`).toEqual([]);
        expect(shapeMismatch('src/x/m0.mamori', src, r.emitted), `${w} / ${where}`).toEqual([]);
      }
    }
    const src = 'interface L {\n  readonly add: (target: string, type: string, from?: number) => void;\n}\nexport fn t(l: L) -> L {\n  return l;\n}\n';
    const r = compile(src);
    expect(r.diagnostics).toEqual([]);
    // 生成物は `?` の前に空白を置く (TypeScript は同じ型として読む)
    expect(r.emitted).toContain('(target: string, type: string, from ?: number) => void');
  });

  it('対照: 物の型の欄の名前・括弧で囲んだ型には、この決まりを掛けない', () => {
    // 欄の名前は JavaScript の鍵なので、予約語を書ける (TypeScript も受け取る)
    const src = 'interface I {\n  readonly return: number;\n  readonly delete: (key: string) => boolean;\n  readonly default?: string;\n}\nexport fn t(i: I) -> number {\n  return i.return;\n}\n';
    const r = compile(src);
    expect(r.diagnostics).toEqual([]);
    expect(shapeMismatch('src/x/m0.mamori', src, r.emitted)).toEqual([]);
    expect(tsCodes('export interface I {\n  readonly return: number;\n  readonly delete: (key: string) => boolean;\n  readonly default?: string;\n}')).toEqual([]);
    // 括弧で囲んだ型 (引数の並びではない) は今までどおり
    expect(compile('export type U = (string | number)[];\n').diagnostics).toEqual([]);
    expect(compile('export type G = () => void;\n').diagnostics).toEqual([]);
  });
});

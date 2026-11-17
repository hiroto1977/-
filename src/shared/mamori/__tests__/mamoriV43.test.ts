import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.43 —— 同じ並びの中で、同じ名前を 2 度書かせない** (2026-11-17 · MG-083 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * 0.42 までは、同じ名前を 2 度書く並びが構文の段を通り、生成物を `tsc` が断っていた (検めた物と走る物は食い違わないが、
 * 守りが `tsc` の 1 層だった)。対象は 5 つの並び:
 *
 *  1. 引数の並び (fn / gate fn / arrow / constructor)                 —— `fn t(a: number, a: number)`
 *  2. 関数の型の引数の並び                                            —— `(a: number, a: number) => void`
 *  3. 分割代入の束縛                                                  —— `const { a, b: a } = x;`
 *  4. interface と物の型の欄                                          —— `{ a: number; 'a': string }`
 *  5. オブジェクトの字面の鍵                                          —— `{ a: 1, a: 2 }`
 *
 * 型引数 (`fn f<T, T>`) は 0.23 から、モジュール直下の宣言 (`fn a` を 2 つ) は M6 が断っている (この周は触らない)。
 * 入れ子の並びは別の並びである (`(a: number, cb: (a: number) => void)` は重なりではない)。
 *
 * どの断りも TypeScript の答えと同じであることを、同じ検査の中で TypeScript に訊いて確かめる。
 */

function compile(source: string): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs][0]![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}

const only = (line: number, col: number, message: string): unknown[] => [`src/x/m0.mamori:${line}:${col}: ${message}`];
const DUP = (what: string, name: string): string => `[M0] ${what} \`${name}\` が二重です —— 同じ並びに同じ名前は 1 度だけ書けます (TypeScript も断ります)`;

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

/** 断る形: [Mamori の綴り, 断りの文, 同じ形の TypeScript]。 */
interface Refused {
  readonly mamori: string;
  readonly message: string;
  readonly ts: string;
}
const fnBody = '{\n  return 1;\n}\n';

const REFUSED: Readonly<Record<string, Refused>> = {
  // 1. 引数の並び
  'fn の引数': { mamori: `export fn t(a: number, a: number) -> number ${fnBody}`, message: DUP('引数', 'a'), ts: 'export function t(a: number, a: number): number { return 1; }' },
  'fn の引数 (3 つ目が重なる)': { mamori: `export fn t(a: number, b: number, a: number) -> number ${fnBody}`, message: DUP('引数', 'a'), ts: 'export function t(a: number, b: number, a: number): number { return 1; }' },
  'fn の引数 (省ける引数と重なる)': { mamori: `export fn t(a: number, a?: number) -> number ${fnBody}`, message: DUP('引数', 'a'), ts: 'export function t(a: number, a?: number): number { return 1; }' },
  'fn の引数 (既定値つきと重なる)': { mamori: `export fn t(a: number, a: number = 1) -> number ${fnBody}`, message: DUP('引数', 'a'), ts: 'export function t(a: number, a: number = 1): number { return 1; }' },
  'async fn の引数': { mamori: 'export async fn t(a: number, a: number) -> Promise<number> {\n  return 1;\n}\n', message: DUP('引数', 'a'), ts: 'export function t(a: number, a: number): number { return 1; }' },
  'arrow の引数': { mamori: 'export fn t() -> number {\n  const f = (a: number, a: number) => 1;\n  return f(1, 2);\n}\n', message: DUP('引数', 'a'), ts: 'export function t(): number { const f = (a: number, a: number) => 1; return f(1, 2); }' },
  'arrow の引数 (ブロックの本体)': { mamori: 'export fn t() -> number {\n  const f = (a: number, a: number) => {\n    return 1;\n  };\n  return f(1, 2);\n}\n', message: DUP('引数', 'a'), ts: 'export function t(): number { const f = (a: number, a: number) => { return 1; }; return f(1, 2); }' },
  'arrow の引数 (型なし)': { mamori: 'export fn t(apply: (f: (p: number, q: number) => number) => number) -> number {\n  return apply((a, a) => 1);\n}\n', message: DUP('引数', 'a'), ts: 'export function t(apply: (f: (p: number, q: number) => number) => number): number { return apply((a, a) => 1); }' },
  'constructor の引数': { mamori: 'export class E extends Error {\n  constructor(a: string, a: string) {\n    super(a);\n  }\n}\n', message: DUP('引数', 'a'), ts: 'export class E { constructor(a: string, a: string) {} }' },
  // 2. 関数の型の引数の並び
  '関数の型': { mamori: 'export type F = (a: number, a: number) => void;\n', message: DUP('関数の型の引数', 'a'), ts: 'export type F = (a: number, a: number) => void;' },
  '関数の型 (省ける引数と重なる)': { mamori: 'export type F = (a: number, a?: number) => void;\n', message: DUP('関数の型の引数', 'a'), ts: 'export type F = (a: number, a?: number) => void;' },
  '関数の型 (先頭に this)': { mamori: 'export type F = (this: number, a: number, a: number) => void;\n', message: DUP('関数の型の引数', 'a'), ts: 'export type F = (this: number, a: number, a: number) => void;' },
  '関数の型 (interface の欄)': { mamori: 'interface I {\n  readonly f: (a: number, a: number) => void;\n}\n', message: DUP('関数の型の引数', 'a'), ts: 'export interface I { readonly f: (a: number, a: number) => void; }' },
  '関数の型 (引数の型)': { mamori: `export fn t(cb: (a: number, a: number) => void) -> number ${fnBody}`, message: DUP('関数の型の引数', 'a'), ts: 'export function t(cb: (a: number, a: number) => void): number { return 1; }' },
  '関数の型 (入れ子の内側)': { mamori: 'export type F = (x: number, cb: (a: number, a: number) => void) => void;\n', message: DUP('関数の型の引数', 'a'), ts: 'export type F = (x: number, cb: (a: number, a: number) => void) => void;' },
  '関数の型 (戻りの型)': { mamori: 'export type F = (x: number) => (a: number, a: number) => void;\n', message: DUP('関数の型の引数', 'a'), ts: 'export type F = (x: number) => (a: number, a: number) => void;' },
  // 3. 分割代入の束縛
  '分割代入 (省略形 2 つ)': { mamori: 'export fn t(x: { a: number }) -> number {\n  const { a, a } = x;\n  return a;\n}\n', message: DUP('分割代入の束縛', 'a'), ts: 'export function t(x: { a: number }): number { const { a, a } = x; return a; }' },
  '分割代入 (別名が重なる)': { mamori: 'export fn t(x: { a: number, b: number }) -> number {\n  const { a, b: a } = x;\n  return a;\n}\n', message: DUP('分割代入の束縛', 'a'), ts: 'export function t(x: { a: number, b: number }): number { const { a, b: a } = x; return a; }' },
  '分割代入 (別名の後ろの省略形)': { mamori: 'export fn t(x: { a: number, b: number }) -> number {\n  const { b: a, a } = x;\n  return a;\n}\n', message: DUP('分割代入の束縛', 'a'), ts: 'export function t(x: { a: number, b: number }): number { const { b: a, a } = x; return a; }' },
  '分割代入 (別名どうし)': { mamori: 'export fn t(x: { a: number, b: number }) -> number {\n  const { a: p, b: p } = x;\n  return p;\n}\n', message: DUP('分割代入の束縛', 'p'), ts: 'export function t(x: { a: number, b: number }): number { const { a: p, b: p } = x; return p; }' },
  // 4. interface と物の型の欄
  'interface の欄': { mamori: 'interface I {\n  readonly a: number;\n  readonly a: number;\n}\n', message: DUP('欄', 'a'), ts: 'export interface I { readonly a: number; readonly a: number; }' },
  'interface の欄 (省ける欄と重なる)': { mamori: 'interface I {\n  a: number;\n  a?: string;\n}\n', message: DUP('欄', 'a'), ts: 'export interface I { a: number; a?: string; }' },
  '物の型の欄': { mamori: 'export type T = { a: number; a: string };\n', message: DUP('欄', 'a'), ts: 'export type T = { a: number; a: string };' },
  '物の型の欄 (文字列の名前)': { mamori: "export type T = { a: number; 'a': number };\n", message: DUP('欄', 'a'), ts: "export type T = { a: number; 'a': number };" },
  '物の型の欄 (文字列どうし)': { mamori: "export type T = { 'a-b': number; readonly \"a-b\": number };\n", message: DUP('欄', 'a-b'), ts: "export type T = { 'a-b': number; readonly \"a-b\": number };" },
  '物の型の欄 (入れ子の内側)': { mamori: 'export type T = { x: number; inner: { a: number; a: number } };\n', message: DUP('欄', 'a'), ts: 'export type T = { x: number; inner: { a: number; a: number } };' },
  '物の型の欄 (引数の型)': { mamori: `export fn t(x: { a: number, a: number }) -> number ${fnBody}`, message: DUP('欄', 'a'), ts: 'export function t(x: { a: number, a: number }): number { return 1; }' },
  // 5. オブジェクトの字面の鍵
  '字面の鍵': { mamori: 'export fn t() -> number {\n  const o = { a: 1, a: 2 };\n  return o.a;\n}\n', message: DUP('鍵', 'a'), ts: 'export function t(): number { const o = { a: 1, a: 2 }; return o.a; }' },
  '字面の鍵 (文字列の鍵)': { mamori: 'export fn t() -> number {\n  const o = { a: 1, "a": 2 };\n  return o.a;\n}\n', message: DUP('鍵', 'a'), ts: 'export function t(): number { const o = { a: 1, "a": 2 }; return o.a; }' },
  '字面の鍵 (省略形と重なる)': { mamori: 'export fn t(a: number) -> number {\n  const o = { a, a: 2 };\n  return o.a;\n}\n', message: DUP('鍵', 'a'), ts: 'export function t(a: number): number { const o = { a, a: 2 }; return o.a; }' },
  '字面の鍵 (省略形が後ろ)': { mamori: 'export fn t(a: number) -> number {\n  const o = { a: 2, a };\n  return o.a;\n}\n', message: DUP('鍵', 'a'), ts: 'export function t(a: number): number { const o = { a: 2, a }; return o.a; }' },
  '字面の鍵 (展開の後ろ)': { mamori: 'export fn t(x: { a: number }) -> number {\n  const o = { ...x, a: 1, a: 2 };\n  return o.a;\n}\n', message: DUP('鍵', 'a'), ts: 'export function t(x: { a: number }): number { const o = { ...x, a: 1, a: 2 }; return o.a; }' },
  '字面の鍵 (入れ子の内側)': { mamori: 'export fn t() -> number {\n  const o = { x: 1, inner: { a: 1, a: 2 } };\n  return o.x;\n}\n', message: DUP('鍵', 'a'), ts: 'export function t(): number { const o = { x: 1, inner: { a: 1, a: 2 } }; return o.x; }' },
};

/** 受け取る形 (重なりではない): [Mamori の綴り, 同じ形の TypeScript]。 */
const ACCEPTED: Readonly<Record<string, readonly [string, string]>> = {
  '別々の名前の引数': [`export fn t(a: number, b: number, c?: number) -> number ${fnBody}`, 'export function t(a: number, b: number, c?: number): number { return 1; }'],
  '大文字と小文字は別の名前': [`export fn t(a: number, A: number) -> number ${fnBody}`, 'export function t(a: number, A: number): number { return 1; }'],
  '外の引数と arrow の引数 (別の並び)': ['export fn t(a: number) -> number {\n  const f = (a: number) => a;\n  return f(a);\n}\n', 'export function t(a: number): number { const f = (a: number) => a; return f(a); }'],
  '入れ子の arrow どうし (別の並び)': ['export fn t() -> number {\n  const f = (a: number) => (a: number) => a;\n  return f(1)(2);\n}\n', 'export function t(): number { const f = (a: number) => (a: number) => a; return f(1)(2); }'],
  '関数の型の入れ子 (別の並び)': ['export type F = (a: number, cb: (a: number) => void) => void;\n', 'export type F = (a: number, cb: (a: number) => void) => void;'],
  '関数の型の戻り (別の並び)': ['export type F = (a: number) => (a: number) => void;\n', 'export type F = (a: number) => (a: number) => void;'],
  '関数の型の引数と物の型の欄 (別の並び)': ['export type F = (a: number, o: { a: number }) => void;\n', 'export type F = (a: number, o: { a: number }) => void;'],
  '同じ鍵から別々の束縛': ['export fn t(x: { a: number }) -> number {\n  const { a: p, a: q } = x;\n  return p + q;\n}\n', 'export function t(x: { a: number }): number { const { a: p, a: q } = x; return p + q; }'],
  '別々の束縛の分割代入': ['export fn t(x: { a: number, b: number }) -> number {\n  const { a, b: c } = x;\n  return a + c;\n}\n', 'export function t(x: { a: number, b: number }): number { const { a, b: c } = x; return a + c; }'],
  '物の型の入れ子 (別の並び)': ['export type T = { a: number; b: { a: number } };\n', 'export type T = { a: number; b: { a: number } };'],
  '2 つの interface の同じ名前の欄': ['interface I {\n  readonly a: number;\n}\ninterface J {\n  readonly a: string;\n}\nexport fn t(i: I, j: J) -> number {\n  return i.a;\n}\n', 'interface I { readonly a: number; } interface J { readonly a: string; } export function t(i: I, j: J): number { return i.a; }'],
  '字面の入れ子 (別の並び)': ['export fn t() -> number {\n  const o = { a: 1, b: { a: 2 } };\n  return o.a + o.b.a;\n}\n', 'export function t(): number { const o = { a: 1, b: { a: 2 } }; return o.a + o.b.a; }'],
  '2 つの字面の同じ鍵': ['export fn t() -> number {\n  const o = { a: 1 };\n  const p = { a: 2 };\n  return o.a + p.a;\n}\n', 'export function t(): number { const o = { a: 1 }; const p = { a: 2 }; return o.a + p.a; }'],
  '展開の後ろの別々の鍵': ['export fn t(x: { a: number }) -> number {\n  const o = { ...x, b: 1, c: 2 };\n  return o.a;\n}\n', 'export function t(x: { a: number }): number { const o = { ...x, b: 1, c: 2 }; return o.a; }'],
};

describe('0.43: 同じ並びの中で、同じ名前を 2 度書かせない (MG-083)', () => {
  it('★ 5 つの並び (引数・関数の型の引数・分割代入・欄・字面の鍵) で、重なった名前を断る', () => {
    expect(Object.keys(REFUSED).length).toBeGreaterThanOrEqual(33);
    for (const [label, c] of Object.entries(REFUSED)) {
      const d = compile(c.mamori).diagnostics;
      expect(d, label).toHaveLength(1);
      expect(d[0], label).toContain(c.message);
    }
    // 5 つの断りの文が、どれも 1 度以上使われている (並びを 1 つ落としても、この検査が通ってしまわないこと)
    const whats = new Set(Object.values(REFUSED).map((c) => /^\[M0\] (.+?) `/.exec(c.message)![1]));
    expect([...whats].sort()).toEqual(['分割代入の束縛', '引数', '欄', '鍵', '関数の型の引数'].sort());
  });

  it('★ 断る場所は、2 度目に書いた名前の字句', () => {
    expect(compile(REFUSED['fn の引数']!.mamori).diagnostics).toEqual(only(1, 24, DUP('引数', 'a')));
    expect(compile(REFUSED['fn の引数 (3 つ目が重なる)']!.mamori).diagnostics).toEqual(only(1, 35, DUP('引数', 'a')));
    expect(compile(REFUSED['arrow の引数']!.mamori).diagnostics).toEqual(only(2, 25, DUP('引数', 'a')));
    expect(compile(REFUSED['constructor の引数']!.mamori).diagnostics).toEqual(only(2, 26, DUP('引数', 'a')));
    expect(compile(REFUSED['関数の型']!.mamori).diagnostics).toEqual(only(1, 29, DUP('関数の型の引数', 'a')));
    expect(compile(REFUSED['分割代入 (省略形 2 つ)']!.mamori).diagnostics).toEqual(only(2, 14, DUP('分割代入の束縛', 'a')));
    expect(compile(REFUSED['分割代入 (別名が重なる)']!.mamori).diagnostics).toEqual(only(2, 17, DUP('分割代入の束縛', 'a')));
    expect(compile(REFUSED['interface の欄']!.mamori).diagnostics).toEqual(only(3, 12, DUP('欄', 'a')));
    expect(compile(REFUSED['物の型の欄 (文字列の名前)']!.mamori).diagnostics).toEqual(only(1, 30, DUP('欄', 'a')));
    expect(compile(REFUSED['字面の鍵']!.mamori).diagnostics).toEqual(only(2, 21, DUP('鍵', 'a')));
    expect(compile(REFUSED['字面の鍵 (展開の後ろ)']!.mamori).diagnostics).toEqual(only(2, 27, DUP('鍵', 'a')));
  });

  it('★ TypeScript も同じ形を断り、受け取る形には診断を付けない (この決まりが TypeScript より広くも狭くもない)', () => {
    for (const [label, c] of Object.entries(REFUSED)) expect(tsCodes(c.ts).length, label).toBeGreaterThan(0);
    for (const [label, [, t]] of Object.entries(ACCEPTED)) expect(tsCodes(t), label).toEqual([]);
  });

  it('★ 3 つ以上重ねても、最初の重なり 1 つで断る (読み進めない)', () => {
    expect(compile(`export fn t(a: number, a: number, a: number) -> number ${fnBody}`).diagnostics).toEqual(only(1, 24, DUP('引数', 'a')));
    expect(compile('export type F = (a: number, b: number, b: number, a: number) => void;\n').diagnostics).toEqual(only(1, 40, DUP('関数の型の引数', 'b')));
    expect(compile('export fn t() -> number {\n  const o = { a: 1, b: 2, b: 3, a: 4 };\n  return o.a;\n}\n').diagnostics).toEqual(only(2, 27, DUP('鍵', 'b')));
  });

  it('対照: 関数の型の引数の名前の位置に、名前でない字句は置けない (前からの断りのまま)', () => {
    const NAME_NEEDED = '[M0] 型の綴りが 1 つの型として読めません (名前が要ります)';
    for (const src of [
      'export type F = (a: number, 1: number) => void;\n',
      'export type F = (a: number, "b": number) => void;\n',
      'export type F = (a: number, ) => void;\n',
      'export type F = (a: number, : number) => void;\n',
    ]) {
      const d = compile(src).diagnostics;
      expect(d, src).toHaveLength(1);
      expect(d[0], src).toContain(`src/x/m0.mamori:1:29: ${NAME_NEEDED}`);
    }
  });

  it('対照: 重なりでない形は今までどおり受け取り、生成物の形も変わらない', () => {
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(14);
    for (const [label, [src]] of Object.entries(ACCEPTED)) {
      const r = compile(src);
      expect(r.diagnostics, label).toEqual([]);
      expect(shapeMismatch('src/x/m0.mamori', src, r.emitted), label).toEqual([]);
    }
  });

  it('対照: 前からの断り (予約語・`this` の位置・型引数の重なり・直下の宣言の重なり) は、前の文のまま答える', () => {
    // 予約語の引数は、重なりより先に答える (名前そのものが書けない)
    expect(compile(`export fn t(return: number, return: number) -> number ${fnBody}`).diagnostics[0]).toContain('JavaScript の予約語');
    expect(compile('export type F = (return: number, return: number) => void;\n').diagnostics[0]).toContain('は関数の型の引数の名前にできません');
    // 2 つ目の `this` は、位置の断りが答える
    expect(compile('export type F = (this: number, this: number) => void;\n').diagnostics[0]).toContain('`this` は関数の型の先頭の引数にだけ書けます');
    // 型引数の重なり (0.23) と、直下の宣言の重なり (M6)
    expect(compile('export fn t<T, T>(a: T) -> T {\n  return a;\n}\n').diagnostics[0]).toContain('[M0] 型引数 T が二重です');
    expect(compile(`fn a() -> number ${fnBody}fn a() -> number ${fnBody}`).diagnostics[0]).toContain('[M6] 名前 a を 2 度宣言しています');
    // `__proto__` の鍵は、重なりより先に答える
    expect(compile('export fn t() -> number {\n  const o = { __proto__: 1, __proto__: 2 };\n  return 1;\n}\n').diagnostics[0]).toContain('鍵 `__proto__` は在りません');
  });
});

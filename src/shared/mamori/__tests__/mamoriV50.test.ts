import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.50 —— 構築できない名前を `new` の相手にさせない** (2026-11-28 · MG-090 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * `new 名前(…)` の名前が、このモジュールの局所の名前 (引数・const / let・回す変数・束ねた例外・直下の fn / const / let) か、
 * 別の Mamori の module から `use` で引いた名前 (関数・値・型 —— クラスは `use` で引けない) を指す形。どれも構築できない。
 * 0.49 までの検査器は受け取り、生成物を `tsc` が断っていた (2351 = 構築できない・7009 = 構築の署名が無い・18046 = unknown ——
 * 守りが `tsc` の 1 層。MG-089 が「次に直す側の周を回すなら、ここが候補」と残した 1 つ目)。
 * 0.50 は検査器 (M6) で断る。線引きは `instanceof` の右辺 (0.16) と同じ: 構築できるのは、隠れていない組み込み・
 * このモジュールのクラス・Mamori の外から宣言した名前 (`extern` / 外の module からの `use`) だけ。
 */

interface File {
  readonly path: string;
  readonly source: string;
}

function compileFiles(files: readonly File[]): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([...files]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs].find(([p]) => p.includes('m0'))![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}
const compile = (source: string): { ok: boolean; diagnostics: string[]; emitted: string } => compileFiles([{ path: 'src/x/m0.mamori', source }]);

const at = (line: number, col: number, message: string): string => `src/x/m0.mamori:${line}:${col}: ${message}`;
const HEAD = 'new の相手は組み込みか宣言した外の名前・このモジュールのクラスだけです';
const LOCAL = (name: string): string => `[M6] ${HEAD} —— ${name} はこのモジュールの局所の名前 (値・関数) で、構築できません (組み込みの名前を局所の名前で隠した形も同じ)`;
const FROM_MAMORI = (name: string): string => `[M6] ${HEAD} —— ${name} は別の Mamori の module から \`use\` で引いた名前 (関数・値・型) で、構築できません (クラスは \`use\` で引けません)`;
const UNDECLARED = (name: string): string => `[M6] 宣言していない名前 ${name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`;
const BEFORE = (name: string): string =>
  `[M6] 局所の名前 ${name} を、同じブロックの宣言より前で使っています —— 生成物ではこのブロックの ${name} を指すので、外側の同じ名前は読めず、宣言の文より前に走ると実行時に投げます (使うのは宣言の文の後にします)`;
const SINK_OUTSIDE = (name: string): string => `[M2] 危ない口 ${name} (extern sink) は sink 関数の中でだけ使えます`;

/**
 * TypeScript (構文 + 意味・厳格モード・lib なし) がその綴りに付ける診断の番号。見るのは「構築できない」の番号だけ
 * (2351 = 構築できない式・7009 = 構築の署名が無い `new`・18046 = unknown の値)。
 */
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
const CTOR_CODES: readonly number[] = [2351, 7009, 18046];
const ctorCodes = (text: string): number[] => tsCodes(text).filter((c) => CTOR_CODES.includes(c));

/** 断る形: [Mamori の綴り, 断りの全文 (場所つき), 同じ形の TypeScript]。 */
interface Refused {
  readonly mamori: string;
  readonly diagnostics: readonly string[];
  readonly ts: string;
}

/** 局所の名前を `new` の相手にする形 (TypeScript も断る: 2351 / 7009 / 18046)。場所は構築子の名前の頭 (0.49)。 */
const REFUSED: Readonly<Record<string, Refused>> = {
  '引数 (数)': { mamori: 'export fn t(make: number) -> number {\n  const v = new make();\n  return 0;\n}\n', diagnostics: [at(2, 17, LOCAL('make'))], ts: 'export function t(make: number): number { const v = new make(); return 0; }' },
  '引数 (関数の型)': { mamori: 'export fn t(make: () => number) -> number {\n  const v = new make();\n  return 0;\n}\n', diagnostics: [at(2, 17, LOCAL('make'))], ts: 'export function t(make: () => number): number { const v = new make(); return 0; }' },
  '引数 (unknown)': { mamori: 'export fn t(make: unknown) -> number {\n  const v = new make();\n  return 0;\n}\n', diagnostics: [at(2, 17, LOCAL('make'))], ts: 'export function t(make: unknown): number { const v = new make(); return 0; }' },
  '局所の const': { mamori: 'export fn t() -> number {\n  const k = 1;\n  const v = new k();\n  return 0;\n}\n', diagnostics: [at(3, 17, LOCAL('k'))], ts: 'export function t(): number { const k = 1; const v = new k(); return 0; }' },
  '局所の let': { mamori: 'export fn t() -> number {\n  let k = 1;\n  const v = new k();\n  return 0;\n}\n', diagnostics: [at(3, 17, LOCAL('k'))], ts: 'export function t(): number { let k = 1; const v = new k(); return 0; }' },
  '局所の arrow': { mamori: 'export fn t() -> number {\n  const k = () => 1;\n  const v = new k();\n  return 0;\n}\n', diagnostics: [at(3, 17, LOCAL('k'))], ts: 'export function t(): number { const k = () => 1; const v = new k(); return 0; }' },
  '束ねた例外': { mamori: 'export fn t() -> number {\n  try {\n    return 1;\n  } catch (e) {\n    const v = new e();\n    return 0;\n  }\n}\n', diagnostics: [at(5, 19, LOCAL('e'))], ts: 'export function t(): number { try { return 1; } catch (e) { const v = new e(); return 0; } }' },
  '分割代入の束縛': { mamori: 'export fn t(o: { a: number }) -> number {\n  const { a } = o;\n  const v = new a();\n  return 0;\n}\n', diagnostics: [at(3, 17, LOCAL('a'))], ts: 'export function t(o: { a: number }): number { const { a } = o; const v = new a(); return 0; }' },
  '直下の fn': { mamori: 'fn helper() -> number {\n  return 1;\n}\nexport fn t() -> number {\n  const v = new helper();\n  return 0;\n}\n', diagnostics: [at(5, 17, LOCAL('helper'))], ts: 'function helper(): number { return 1; } export function t(): number { const v = new helper(); return 0; }' },
  '自分自身 (fn)': { mamori: 'export fn t() -> number {\n  const v = new t();\n  return 0;\n}\n', diagnostics: [at(2, 17, LOCAL('t'))], ts: 'export function t(): number { const v = new t(); return 0; }' },
  '関門 (gate fn)': { mamori: 'vetted V = "v";\ngate fn g(s: string) -> V | null {\n  return mint V(s);\n}\nexport fn t() -> number {\n  const v = new g("x");\n  return 0;\n}\n', diagnostics: [at(6, 17, LOCAL('g'))], ts: 'function g(s: string): string | null { return s; } export function t(): number { const v = new g("x"); return 0; }' },
  '直下の const (数)': { mamori: 'const K: number = 1;\nexport fn t() -> number {\n  const v = new K();\n  return 0;\n}\n', diagnostics: [at(3, 17, LOCAL('K'))], ts: 'const K: number = 1; export function t(): number { const v = new K(); return 0; }' },
  '直下の const (arrow)': { mamori: 'const F = () => 1;\nexport fn t() -> number {\n  const v = new F();\n  return 0;\n}\n', diagnostics: [at(3, 17, LOCAL('F'))], ts: 'const F = () => 1; export function t(): number { const v = new F(); return 0; }' },
  '直下の let': { mamori: 'let N: number = 1;\nexport fn t() -> number {\n  const v = new N();\n  return 0;\n}\n', diagnostics: [at(3, 17, LOCAL('N'))], ts: 'let N: number = 1; export function t(): number { const v = new N(); return 0; }' },
  'arrow の引数': { mamori: 'export fn t(xs: readonly number[]) -> number {\n  const ys = xs.map((x: number) => new x());\n  return 0;\n}\n', diagnostics: [at(2, 40, LOCAL('x'))], ts: 'export function t(): number { const f = (x: number) => new x(); return 0; }' },
  '組み込みの名前を引数で隠す': { mamori: 'export fn t(Map: number) -> number {\n  const v = new Map();\n  return 0;\n}\n', diagnostics: [at(2, 17, LOCAL('Map'))], ts: 'export function t(Map: number): number { const v = new Map(); return 0; }' },
  '型引数と引数つき': { mamori: 'export fn t(make: number) -> number {\n  const v = new make<number>(1, 2);\n  return 0;\n}\n', diagnostics: [at(2, 17, LOCAL('make'))], ts: 'export function t(make: number): number { const v = new make<number>(1, 2); return 0; }' },
  'arrow の本体の中': { mamori: 'export fn t(make: number) -> number {\n  const f = () => new make();\n  return 0;\n}\n', diagnostics: [at(2, 23, LOCAL('make'))], ts: 'export function t(make: number): number { const f = () => new make(); return 0; }' },
  '直下の初期値で、前の fn を構築する': { mamori: 'fn helper() -> number {\n  return 1;\n}\nconst X: unknown = new helper();\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(4, 24, LOCAL('helper'))], ts: 'function helper(): number { return 1; } const X: unknown = new helper(); export function t(): number { return 0; }' },
  'throw の相手': { mamori: 'export fn t(E: number) -> number {\n  throw new E("x");\n}\n', diagnostics: [at(2, 13, LOCAL('E'))], ts: 'export function t(E: number): number { throw new E("x"); }' },
  '引数の式は今までどおり検める (宣言していない名前も断る)': { mamori: 'export fn t(make: number) -> number {\n  const v = new make(zz);\n  return 0;\n}\n', diagnostics: [at(2, 17, LOCAL('make')), at(2, 22, UNDECLARED('zz'))], ts: 'export function t(make: number): number { const v = new make(1); return 0; }' },
};

/** 局所の名前だが、同じ形の TypeScript を lib なしでは測れない形 (回す変数 —— `for … of` が lib の反復の型を要る)。 */
const REFUSED_UNMEASURED_TS: Readonly<Record<string, Omit<Refused, 'ts'>>> = {
  '回す変数': { mamori: 'export fn t(xs: readonly number[]) -> number {\n  for (const x of xs) {\n    const v = new x();\n  }\n  return 0;\n}\n', diagnostics: [at(3, 19, LOCAL('x'))] },
};

/** TypeScript は通すが、Mamori は断る形 (局所の名前が、宣言した外のクラスを運ぶ —— 検査器は局所の値の中身を追わない)。 */
const STRICTER: Readonly<Record<string, Refused>> = {
  '宣言した外の名前を局所の const に写して構築する': { mamori: 'extern pure { Thing } from "./host";\nexport fn t() -> number {\n  const C = Thing;\n  const v = new C();\n  return 0;\n}\n', diagnostics: [at(4, 17, LOCAL('C'))], ts: 'declare class Thing {} export function t(): number { const C = Thing; const v = new C(); return 0; }' },
  '宣言した外のクラスを引数で受けて構築する': { mamori: 'extern pure { Thing } from "./host";\nexport fn t(C: typeof Thing) -> number {\n  const v = new C();\n  return 0;\n}\n', diagnostics: [at(3, 17, LOCAL('C'))], ts: 'declare class Thing {} export function t(C: typeof Thing): number { const v = new C(); return 0; }' },
};

/** 別の Mamori の module から `use` で引いた名前を構築する形 (クラスは引けないので、どれも構築できない)。 */
const LIB = 'export fn helper() -> number {\n  return 1;\n}\nexport const K: number = 1;\nexport type Shape = { a: number };\nexport const F = () => 1;\n';
const useFrom = (names: string, body: string): readonly File[] => [
  { path: 'src/x/lib.mamori', source: LIB },
  { path: 'src/x/m0.mamori', source: `use { ${names} } from "./lib";\nexport fn t() -> number {\n  ${body}\n  return 0;\n}\n` },
];
const FROM_OTHER_MODULE: Readonly<Record<string, { readonly files: readonly File[]; readonly diagnostics: readonly string[] }>> = {
  '引いた関数': { files: useFrom('helper', 'const v = new helper();'), diagnostics: [at(3, 17, FROM_MAMORI('helper'))] },
  '引いた直下の const (数)': { files: useFrom('K', 'const v = new K();'), diagnostics: [at(3, 17, FROM_MAMORI('K'))] },
  '引いた直下の const (arrow)': { files: useFrom('F', 'const v = new F();'), diagnostics: [at(3, 17, FROM_MAMORI('F'))] },
  '型だけで引いた型': { files: useFrom('type Shape', 'const v = new Shape();'), diagnostics: [at(3, 17, FROM_MAMORI('Shape'))] },
};

/** 今までどおり受け取る形。 */
const ACCEPTED: Readonly<Record<string, string>> = {
  '隠れていない組み込み': 'export fn t() -> number {\n  const m = new Map<string, number>();\n  return m.size;\n}\n',
  'このモジュールのクラス': 'class Bad extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\nexport fn t() -> number {\n  const v = new Bad("x");\n  return 0;\n}\n',
  '組み込みの例外を投げる': 'export fn t() -> number {\n  throw new Error("x");\n}\n',
  '宣言した外の名前 (extern pure)': 'extern pure { Thing } from "./host";\nexport fn t() -> number {\n  const v = new Thing();\n  return 0;\n}\n',
  'Mamori の外の module から use で引いた名前': 'use { Thing } from "./host";\nexport fn t() -> number {\n  const v = new Thing();\n  return 0;\n}\n',
  '宣言した外の名前のメンバ': 'extern pure { ns } from "./host";\nexport fn t() -> number {\n  const v = new ns.Thing();\n  return 0;\n}\n',
  '局所の名前を呼ぶ (構築ではない)': 'export fn t(make: () => number) -> number {\n  return make();\n}\n',
  '直下の fn を呼ぶ (構築ではない)': 'fn helper() -> number {\n  return 1;\n}\nexport fn t() -> number {\n  return helper();\n}\n',
};

/** 前からの断りが、前の文のまま答える形 (より具体的な理由が先に答える)。 */
const UNCHANGED: Readonly<Record<string, { readonly mamori: string; readonly diagnostics: readonly string[] }>> = {
  '宣言していない名前を構築する': { mamori: 'export fn t() -> number {\n  const v = new Nope();\n  return 0;\n}\n', diagnostics: [at(2, 17, UNDECLARED('Nope'))] },
  '同じブロックの宣言より前で構築する (0.45 の文)': { mamori: 'export fn t(make: number, c: boolean) -> number {\n  if (c) {\n    const v = new make();\n    const make = 2;\n    return make;\n  }\n  return 0;\n}\n', diagnostics: [at(3, 19, BEFORE('make'))] },
  '危ない口を sink の外で構築する (M2)': { mamori: 'extern sink { RegExp } from "x";\nexport fn go(raw: string) -> boolean {\n  const r = new RegExp(raw);\n  return true;\n}\n', diagnostics: [at(3, 17, SINK_OUTSIDE('RegExp'))] },
};

describe('Mamori 0.50: 構築できない名前を new の相手にさせない (MG-090)', () => {
  it('★ 局所の名前を new の相手にする形を、場所と全文つきで断る', () => {
    for (const [name, form] of Object.entries({ ...REFUSED, ...REFUSED_UNMEASURED_TS })) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(REFUSED).length).toBeGreaterThanOrEqual(21);
  });

  it('★ 同じ形を TypeScript も断る (2351 / 7009 / 18046)', () => {
    for (const [name, form] of Object.entries(REFUSED)) {
      expect(ctorCodes(form.ts).length, `${name}: ${JSON.stringify(tsCodes(form.ts))}`).toBeGreaterThan(0);
    }
    // 対照: 物差しは、宣言したクラスの構築には「構築できない」の番号を付けない
    expect(ctorCodes('declare class Thing {} export function t(): number { const v = new Thing(); return 0; }')).toEqual([]);
  });

  it('★ 別の Mamori の module から use で引いた名前 (関数・値・型) も断る', () => {
    for (const [name, form] of Object.entries(FROM_OTHER_MODULE)) {
      const r = compileFiles(form.files);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(FROM_OTHER_MODULE).length).toBeGreaterThanOrEqual(4);
    // 対照: 同じ名前を呼ぶ形は通る (引いた関数は呼べる)
    expect(compileFiles(useFrom('helper', 'const v = helper();')).diagnostics).toEqual([]);
  });

  it('★ 局所の名前が外のクラスを運ぶ形は、TypeScript は通すが Mamori は断る (TypeScript より厳しい側 —— 宣言した名前を直に構築する)', () => {
    for (const [name, form] of Object.entries(STRICTER)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
      expect(ctorCodes(form.ts), name).toEqual([]);
    }
    expect(Object.keys(STRICTER).length).toBeGreaterThanOrEqual(2);
  });

  it('対照: 組み込み・このモジュールのクラス・宣言した外の名前の構築と、局所の名前を呼ぶ形は今までどおり通り、生成物の形も崩れない', () => {
    for (const [name, source] of Object.entries(ACCEPTED)) {
      const r = compile(source);
      expect(r.ok, `${name}: ${r.diagnostics.join(' | ')}`).toBe(true);
      expect(shapeMismatch('src/x/m0.mamori', source, r.emitted), name).toEqual([]);
    }
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(8);
  });

  it('対照: 前からの断り (宣言していない名前・宣言より前の使用・sink の外の危ない口) は、前の文のまま答える', () => {
    for (const [name, form] of Object.entries(UNCHANGED)) {
      expect(compile(form.mamori).diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(UNCHANGED).length).toBeGreaterThanOrEqual(3);
  });

  it('対照: 計算した鍵の結果 (0.12) と、関数の結果を置いた直下の const (0.37) は、より具体的な前の理由で断る', () => {
    const inert = compile('export fn t(xs: readonly unknown[], n: number) -> unknown {\n  const f = xs[n];\n  return new f();\n}\n').diagnostics;
    expect(inert).toHaveLength(1);
    expect(inert[0]).toContain('計算した鍵の添字の結果は new の相手にできません');
    const loaded = compile('fn make() -> unknown {\n  return 1;\n}\nconst ADD = make();\nexport fn go(x: string) -> unknown {\n  return new ADD(x);\n}\n').diagnostics;
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).not.toContain(HEAD);
    // 標本: 上の `not.toContain` の針は、0.50 の断りの文に実際に当たる
    expect(LOCAL('ADD')).toContain(HEAD);
  });
});

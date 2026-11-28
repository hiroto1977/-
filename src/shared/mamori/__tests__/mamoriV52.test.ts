import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PURE_GLOBALS } from '../checker';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.52 —— メンバの連なりの先を `new` の相手にさせない** (2026-11-28 · MG-092 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * `new a.b(…)` の先頭の名前が、このモジュールの局所の名前 (引数・const / let・束ねた例外・直下の fn / const / let)・
 * 別の Mamori の module から `use` で引いた名前・隠れていない組み込みを指す形。どれも構築できない
 * (Mamori の型は構築の署名を書けず、Mamori で使える組み込みのメンバに構築子は無い)。
 * 0.51 までの検査器は構築子の名前そのもの (`new o()` / `new Math()`) しか見ておらず、連なりの先は受け取って、生成物を `tsc` が断っていた
 * (2351 = 構築できない・7009 = 構築の署名が無い・18046 = unknown・2339 = その欄が無い —— 守りが `tsc` の 1 層。
 * MG-090 / MG-091 が「次に直す側の周を回すなら、ここが候補」と残した 1 つ)。0.52 は検査器 (M6) で断る。
 * 宣言した外の名前のメンバ (`new ns.Thing()`) は今までどおり。
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
const LOCAL_MEMBER = (name: string): string => `[M6] ${HEAD} —— ${name} はこのモジュールの局所の名前 (値・関数) で、そのメンバは構築できません (宣言した外のクラスは \`new 名前(…)\` と直に構築します)`;
const FROM_MAMORI_MEMBER = (name: string): string => `[M6] ${HEAD} —— ${name} は別の Mamori の module から \`use\` で引いた名前 (関数・値・型) で、そのメンバは構築できません (クラスは \`use\` で引けません)`;
const BUILTIN_MEMBER = (name: string): string => `[M6] 組み込みの ${name} のメンバは構築できません —— Mamori で使える組み込みのメンバに構築子は在りません (TypeScript も断ります)`;
const LOCAL_050 = (name: string): string => `[M6] ${HEAD} —— ${name} はこのモジュールの局所の名前 (値・関数) で、構築できません (組み込みの名前を局所の名前で隠した形も同じ)`;
const NO_NEW_051 = (name: string): string => `[M6] 組み込みの ${name} は構築できません —— 名前空間なので \`${name}.m(…)\` とメンバを直に使う形だけです (構築すると実行時に投げ、TypeScript も断ります)`;
const UNDECLARED = (name: string): string => `[M6] 宣言していない名前 ${name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`;
const SINK_OUTSIDE = (name: string): string => `[M2] 危ない口 ${name} (extern sink) は sink 関数の中でだけ使えます`;

/** 関数 1 つの本体に文を置いた Mamori の module (2 行目の先頭 2 桁が字下げ)。 */
const fn = (body: string, params = ''): string => `export fn t(${params}) -> unknown {\n  ${body}\n}\n`;
/** 同じ形の TypeScript。 */
const tsFn = (body: string, params = ''): string => `export function t(${params}): unknown { ${body} }`;

/**
 * TypeScript (厳格モード・**本物の lib** = ES2022 + DOM) が、綴りごとに付ける診断の番号。組み込みのメンバの形は lib の宣言が決めるので、
 * lib なしの物差しでは測れない。1 回の program に全部の綴りを入れて測る (lib の読み込みは 1 度)。
 */
function tsCodesByName(texts: Readonly<Record<string, string>>): Record<string, number[]> {
  const names = Object.keys(texts);
  const fileOf = (i: number): string => `/virtual/f${i}.ts`;
  const options: ts.CompilerOptions = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], types: [] };
  const host = ts.createCompilerHost(options);
  const real = host.getSourceFile.bind(host);
  const virtual = new Map(names.map((n, i) => [fileOf(i), ts.createSourceFile(fileOf(i), texts[n] ?? '', ts.ScriptTarget.ES2022, true)]));
  host.getSourceFile = (f, v) => virtual.get(f) ?? real(f, v);
  const realExists = host.fileExists.bind(host);
  host.fileExists = (f) => virtual.has(f) || realExists(f);
  const program = ts.createProgram([...virtual.keys()], options, host);
  const out: Record<string, number[]> = {};
  names.forEach((n, i) => {
    const sf = virtual.get(fileOf(i))!;
    out[n] = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)].map((d) => d.code);
  });
  return out;
}

/** 断る形: [Mamori の綴り, 断りの全文 (場所つき), 同じ形の TypeScript, TypeScript が付ける番号]。 */
interface Refused {
  readonly mamori: string;
  readonly diagnostics: readonly string[];
  readonly ts: string;
  readonly code: number;
}

/** 先頭が局所の名前の連なり。場所は先頭の名前の頭。 */
const LOCAL_HEAD: Readonly<Record<string, Refused>> = {
  '引数の欄': { mamori: fn('return new o.C();', 'o: { C: number }'), diagnostics: [at(2, 14, LOCAL_MEMBER('o'))], ts: tsFn('return new o.C();', 'o: { C: number }'), code: 2351 },
  '2 段の欄': { mamori: fn('return new o.a.b();', 'o: { a: { b: number } }'), diagnostics: [at(2, 14, LOCAL_MEMBER('o'))], ts: tsFn('return new o.a.b();', 'o: { a: { b: number } }'), code: 2351 },
  '局所の const': { mamori: fn('const o = { C: 1 };\n  return new o.C();'), diagnostics: [at(3, 14, LOCAL_MEMBER('o'))], ts: tsFn('const o = { C: 1 }; return new o.C();'), code: 2351 },
  '局所の let': { mamori: fn('let o = { C: 1 };\n  return new o.C();'), diagnostics: [at(3, 14, LOCAL_MEMBER('o'))], ts: tsFn('let o = { C: 1 }; return new o.C();'), code: 2351 },
  '文字列の length': { mamori: fn('return new s.length();', 's: string'), diagnostics: [at(2, 14, LOCAL_MEMBER('s'))], ts: tsFn('return new s.length();', 's: string'), code: 2351 },
  '直下の const': { mamori: 'const K = { C: 1 };\n' + fn('return new K.C();'), diagnostics: [at(3, 14, LOCAL_MEMBER('K'))], ts: 'const K = { C: 1 };\n' + tsFn('return new K.C();'), code: 2351 },
  '直下の fn': { mamori: 'fn helper() -> number {\n  return 1;\n}\n' + fn('return new helper.C();'), diagnostics: [at(5, 14, LOCAL_MEMBER('helper'))], ts: 'function helper(): number { return 1; }\n' + tsFn('return new helper.C();'), code: 2339 },
  '束ねた例外': { mamori: fn('try {\n    return 1;\n  } catch (e) {\n    return new e.C();\n  }'), diagnostics: [at(5, 16, LOCAL_MEMBER('e'))], ts: tsFn('try { return 1; } catch (e) { return new e.C(); }'), code: 18046 },
  '組み込みを隠した引数': { mamori: fn('return new Math.max();', 'Math: { max: number }'), diagnostics: [at(2, 14, LOCAL_MEMBER('Math'))], ts: tsFn('return new Math.max();', 'Math: { max: number }'), code: 2351 },
  '別の構築の引数の中': { mamori: fn('return new Map(new o.C());', 'o: { C: number }'), diagnostics: [at(2, 22, LOCAL_MEMBER('o'))], ts: tsFn('return new Map(new o.C());', 'o: { C: number }'), code: 2351 },
  '構築した結果のメンバを呼ぶ': { mamori: fn('return new o.f().x();', 'o: { f: number }'), diagnostics: [at(2, 14, LOCAL_MEMBER('o'))], ts: tsFn('return new o.f().x();', 'o: { f: number }'), code: 2351 },
  '型引数つき': { mamori: fn('return new o.C<number>();', 'o: { C: number }'), diagnostics: [at(2, 14, LOCAL_MEMBER('o'))], ts: tsFn('return new o.C<number>();', 'o: { C: number }'), code: 2351 },
};

/** 先頭が隠れていない組み込みの連なり (TypeScript: 7009 = 構築の署名が無い・2351 = 構築できない式・2339 = その欄が無い)。 */
const BUILTIN_HEAD: Readonly<Record<string, Refused>> = {
  'new Math.max()': { mamori: fn('return new Math.max();'), diagnostics: [at(2, 14, BUILTIN_MEMBER('Math'))], ts: tsFn('return new Math.max();'), code: 7009 },
  'new Math.PI()': { mamori: fn('return new Math.PI();'), diagnostics: [at(2, 14, BUILTIN_MEMBER('Math'))], ts: tsFn('return new Math.PI();'), code: 2351 },
  'new JSON.parse(…)': { mamori: fn('return new JSON.parse("1");'), diagnostics: [at(2, 14, BUILTIN_MEMBER('JSON'))], ts: tsFn('return new JSON.parse("1");'), code: 7009 },
  'new Number.parseInt(…)': { mamori: fn('return new Number.parseInt("1");'), diagnostics: [at(2, 14, BUILTIN_MEMBER('Number'))], ts: tsFn('return new Number.parseInt("1");'), code: 7009 },
  'new Array.isArray(…)': { mamori: fn('return new Array.isArray(1);'), diagnostics: [at(2, 14, BUILTIN_MEMBER('Array'))], ts: tsFn('return new Array.isArray(1);'), code: 7009 },
  'new String.fromCharCode(…)': { mamori: fn('return new String.fromCharCode(1);'), diagnostics: [at(2, 14, BUILTIN_MEMBER('String'))], ts: tsFn('return new String.fromCharCode(1);'), code: 7009 },
  'new Promise.resolve(…)': { mamori: fn('return new Promise.resolve(1);'), diagnostics: [at(2, 14, BUILTIN_MEMBER('Promise'))], ts: tsFn('return new Promise.resolve(1);'), code: 7009 },
  'new Object.keys(…)': { mamori: fn('return new Object.keys(1);'), diagnostics: [at(2, 14, BUILTIN_MEMBER('Object'))], ts: tsFn('return new Object.keys({});'), code: 7009 },
  'new URL.canParse(…)': { mamori: fn('return new URL.canParse("x");'), diagnostics: [at(2, 14, BUILTIN_MEMBER('URL'))], ts: tsFn('return new URL.canParse("x");'), code: 7009 },
  '在りもしない欄': { mamori: fn('return new Map.x();'), diagnostics: [at(2, 14, BUILTIN_MEMBER('Map'))], ts: tsFn('return new Map.x();'), code: 2339 },
  'モジュール直下の初期値': { mamori: 'const K = new Math.max();\nexport fn t() -> unknown {\n  return K;\n}\n', diagnostics: [at(1, 15, BUILTIN_MEMBER('Math'))], ts: 'const K = new Math.max(); export function t(): unknown { return K; }', code: 7009 },
};

/** TypeScript は通すが、Mamori は断る形 (局所の名前が、外のクラスを欄に持つ値を運ぶ —— 検査器は局所の値の中身を追わない)。 */
const STRICTER: Readonly<Record<string, Omit<Refused, 'code'>>> = {
  '宣言した外の名前を局所の const に写して、欄を構築する': { mamori: 'extern pure { ns } from "./host";\n' + fn('const o = ns;\n  return new o.Thing();'), diagnostics: [at(4, 14, LOCAL_MEMBER('o'))], ts: 'declare const ns: { Thing: new () => object };\n' + tsFn('const o = ns; return new o.Thing();') },
  '外の型の引数の欄を構築する': { mamori: 'use type { Host } from "./host";\n' + fn('return new o.Thing();', 'o: Host'), diagnostics: [at(3, 14, LOCAL_MEMBER('o'))], ts: 'declare class Thing {}\ninterface Host { Thing: typeof Thing }\n' + tsFn('return new o.Thing();', 'o: Host') },
};

/** 別の Mamori の module から `use` で引いた名前のメンバを構築する形。 */
const LIB = 'export fn helper() -> number {\n  return 1;\n}\nexport const K: number = 1;\nexport type Shape = { a: number };\nexport const F = () => 1;\n';
const importing = (names: string, body: string): readonly File[] => [
  { path: 'src/x/lib.mamori', source: LIB },
  { path: 'src/x/m0.mamori', source: `use { ${names} } from "./lib";\nexport fn t() -> number {\n  ${body}\n  return 0;\n}\n` },
];
const FROM_OTHER_MODULE: Readonly<Record<string, { readonly files: readonly File[]; readonly diagnostics: readonly string[] }>> = {
  '引いた関数': { files: importing('helper', 'const v = new helper.C();'), diagnostics: [at(3, 17, FROM_MAMORI_MEMBER('helper'))] },
  '引いた直下の const (数)': { files: importing('K', 'const v = new K.C();'), diagnostics: [at(3, 17, FROM_MAMORI_MEMBER('K'))] },
  '引いた直下の const (arrow)': { files: importing('F', 'const v = new F.C();'), diagnostics: [at(3, 17, FROM_MAMORI_MEMBER('F'))] },
  '型だけで引いた型': { files: importing('type Shape', 'const v = new Shape.C();'), diagnostics: [at(3, 17, FROM_MAMORI_MEMBER('Shape'))] },
};

/** 今までどおり受け取る形。 */
const ACCEPTED: Readonly<Record<string, string>> = {
  '宣言した外の名前のメンバ (extern pure)': 'extern pure { ns } from "./host";\nexport fn t() -> number {\n  const v = new ns.Thing();\n  return 0;\n}\n',
  '宣言した外の名前の 2 段のメンバ': 'extern pure { ns } from "./host";\nexport fn t() -> number {\n  const v = new ns.a.Thing();\n  return 0;\n}\n',
  'Mamori の外の module から use で引いた名前のメンバ': 'use { ns } from "./host";\nexport fn t() -> number {\n  const v = new ns.Thing();\n  return 0;\n}\n',
  '宣言した外の名前で隠した Math のメンバ': 'extern pure { Math } from "./host";\nexport fn t() -> number {\n  const v = new Math.max();\n  return 0;\n}\n',
  '型引数つきの外のメンバ': 'extern pure { ns } from "./host";\nexport fn t() -> number {\n  const v = new ns.Box<number>();\n  return 0;\n}\n',
  '局所の名前のメンバを呼ぶ (構築ではない)': 'export fn t(o: { f: () => number }) -> number {\n  return o.f();\n}\n',
  '組み込みのメンバを呼ぶ (構築ではない)': 'export fn t() -> number {\n  return Math.max(1, 2);\n}\n',
  '隠れていない組み込みを構築する': 'export fn t() -> number {\n  const m = new Map<string, number>();\n  return m.size;\n}\n',
};

/** 前からの断りが、前の文のまま答える形 (より具体的な理由が先に答える)。 */
const UNCHANGED: Readonly<Record<string, { readonly mamori: string; readonly diagnostics: readonly string[] }>> = {
  '先頭が宣言していない名前': { mamori: fn('return new nope.C();'), diagnostics: [at(2, 14, UNDECLARED('nope'))] },
  '先頭が sink の外の危ない口 (M2)': { mamori: 'extern sink { shell } from "x";\nexport fn go(raw: string) -> boolean {\n  const r = new shell.X(raw);\n  return true;\n}\n', diagnostics: [at(3, 17, SINK_OUTSIDE('shell'))] },
  '局所の名前そのもの (0.50 の文)': { mamori: fn('return new o();', 'o: number'), diagnostics: [at(2, 14, LOCAL_050('o'))] },
  '名前空間そのもの (0.51 の文)': { mamori: fn('return new Math();'), diagnostics: [at(2, 14, NO_NEW_051('Math'))] },
};

describe('Mamori 0.52: メンバの連なりの先を new の相手にさせない (MG-092)', () => {
  it('★ 先頭が局所の名前の連なりを、場所と全文つきで断る', () => {
    for (const [name, form] of Object.entries(LOCAL_HEAD)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(LOCAL_HEAD).length).toBeGreaterThanOrEqual(12);
  });

  it('★ 先頭が隠れていない組み込みの連なりを、場所と全文つきで断る', () => {
    for (const [name, form] of Object.entries(BUILTIN_HEAD)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(BUILTIN_HEAD).length).toBeGreaterThanOrEqual(11);
  });

  it('★ 宣言なしで使える組み込みは 1 つ残らず、メンバを構築する形を断る (母集団は検査器の一覧)', () => {
    for (const name of PURE_GLOBALS) {
      expect(compile(fn(`return new ${name}.x();`)).diagnostics, name).toEqual([at(2, 14, BUILTIN_MEMBER(name))]);
    }
    expect(PURE_GLOBALS.size).toBeGreaterThanOrEqual(15);
  });

  it('★ 同じ形を TypeScript も断る (本物の lib で測る · 2351 / 7009 / 18046 / 2339)', () => {
    const forms = { ...Object.fromEntries(Object.entries(LOCAL_HEAD).map(([k, v]) => [`局所: ${k}`, v])), ...Object.fromEntries(Object.entries(BUILTIN_HEAD).map(([k, v]) => [`組み込み: ${k}`, v])) };
    const stricter = Object.fromEntries(Object.entries(STRICTER).map(([k, v]) => [`厳しい側: ${k}`, v.ts]));
    const codes = tsCodesByName({ ...Object.fromEntries(Object.entries(forms).map(([k, v]) => [k, v.ts])), ...stricter });
    for (const [name, form] of Object.entries(forms)) expect(codes[name], name).toContain(form.code);
    // 厳しい側: TypeScript は 1 つも診断を付けない (正しい TypeScript だが、Mamori は断る)
    for (const name of Object.keys(stricter)) expect(codes[name], name).toEqual([]);
    expect(Object.keys(forms).length).toBeGreaterThanOrEqual(23);
  });

  it('★ 局所の名前が外のクラスを欄に運ぶ形は、TypeScript は通すが Mamori は断る (TypeScript より厳しい側 —— 宣言した名前を直に構築する)', () => {
    for (const [name, form] of Object.entries(STRICTER)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(STRICTER).length).toBeGreaterThanOrEqual(2);
  });

  it('★ 別の Mamori の module から use で引いた名前 (関数・値・型) のメンバも断る', () => {
    for (const [name, form] of Object.entries(FROM_OTHER_MODULE)) {
      const r = compileFiles(form.files);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(FROM_OTHER_MODULE).length).toBeGreaterThanOrEqual(4);
    // 対照: 同じ名前を呼ぶ形は通る (引いた関数は呼べる)
    expect(compileFiles(importing('helper', 'const v = helper();')).diagnostics).toEqual([]);
  });

  it('★ 断った形でも、引数の中は 1 度だけ検める (3 つの枝とも)', () => {
    expect(compile(fn('return new o.C(Nope);', 'o: { C: number }')).diagnostics).toEqual([at(2, 14, LOCAL_MEMBER('o')), at(2, 18, UNDECLARED('Nope'))]);
    expect(compile(fn('return new Math.max(Nope);')).diagnostics).toEqual([at(2, 14, BUILTIN_MEMBER('Math')), at(2, 23, UNDECLARED('Nope'))]);
    expect(compileFiles(importing('K', 'const v = new K.C(Nope);')).diagnostics).toEqual([at(3, 17, FROM_MAMORI_MEMBER('K')), at(3, 21, UNDECLARED('Nope'))]);
  });

  it('★ 実物の組み込みのメンバで構築できる物は、Mamori がメンバとして使わせない物だけ (文の「使えるメンバに構築子は無い」を実物で数える)', () => {
    // 構築できるかは `Reflect.construct` の newTarget で測る (相手を呼ばずに、構築子かどうかだけを見る)。
    const isConstructor = (v: unknown): boolean => {
      try {
        Reflect.construct(Object, [], v as new () => object);
        return true;
      } catch {
        return false;
      }
    };
    const host = globalThis as unknown as Record<string, Record<string, unknown>>;
    let checked = 0;
    const constructible: string[] = [];
    for (const name of PURE_GLOBALS) {
      // `.` で書ける鍵だけ (`RegExp["$&"]` のような鍵と記号の鍵は、Mamori の `new a.b()` では書けない)。
      for (const key of Object.getOwnPropertyNames(host[name]).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k))) {
        checked += 1;
        if (isConstructor(host[name]![key])) constructible.push(`${name}.${key}`);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(100);
    // 構築できる物が在る実行環境 (node は `URL.createObjectURL` ほかを普通の関数で持つ) では、その 1 つずつを Mamori がメンバとして断る。
    for (const member of constructible) {
      const r = compile(fn(`return ${member};`));
      expect(r.ok, member).toBe(false);
      expect(r.diagnostics.join(' | '), member).toMatch(/は使えません|は Mamori に在りません/);
    }
    // 標本: 物差しは、構築子を構築子と答え、ただの値と arrow を構築子でないと答える
    expect([isConstructor(Map), isConstructor(Math.max), isConstructor(1), isConstructor(() => 1)]).toEqual([true, false, false, false]);
  });

  it('対照: 宣言した外の名前のメンバの構築と、メンバを呼ぶ形は今までどおり通り、生成物の形も崩れない', () => {
    for (const [name, source] of Object.entries(ACCEPTED)) {
      const r = compile(source);
      expect(r.ok, `${name}: ${r.diagnostics.join(' | ')}`).toBe(true);
      expect(shapeMismatch('src/x/m0.mamori', source, r.emitted), name).toEqual([]);
    }
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(8);
  });

  it('対照: 前からの断り (宣言していない名前・sink の外の危ない口・0.50 / 0.51 の文) は、前の文のまま答える', () => {
    for (const [name, form] of Object.entries(UNCHANGED)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(UNCHANGED).length).toBeGreaterThanOrEqual(4);
  });

  it('対照: 関数の結果を置いた直下の const (0.37)・このモジュールのクラス・`.prototype` は、より具体的な前の理由で断る', () => {
    const loaded = compile('fn make() -> unknown {\n  return 1;\n}\nconst ADD = make();\nexport fn go(x: string) -> unknown {\n  return new ADD.C(x);\n}\n').diagnostics;
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toContain('関数の呼び出しの結果を置いたモジュール直下の const');
    expect(loaded[0]).not.toContain(HEAD);
    const cls = compile('class Bad extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\n' + fn('return new Bad.x();')).diagnostics;
    expect(cls).toHaveLength(1);
    expect(cls[0]).toContain('クラス Bad は `new Bad(…)` と `x instanceof Bad` の相手にだけ使えます');
    const proto = compile(fn('return new Map.prototype.constructor();')).diagnostics;
    expect(proto).toHaveLength(1);
    expect(proto[0]).toContain('`.prototype` は Mamori に在りません');
    // 標本: 上の `not.toContain` の針は、0.52 の断りの文に実際に当たる
    expect(LOCAL_MEMBER('ADD')).toContain(HEAD);
  });
});

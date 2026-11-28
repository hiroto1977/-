import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { BUILTIN_MEMBERS, BUILTIN_VALUE_FIELDS, PURE_GLOBALS } from '../checker';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.54 —— 組み込みの値の欄を呼ばせない** (2026-11-28 · MG-094 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * `Math.PI()` / `Number.EPSILON()` / `Array.length()` のように、隠れていない組み込みの**関数でない欄**を直に呼ぶ形。
 * どれも実行時に必ず投げる。0.53 までの検査器は、組み込みのメンバを直に呼ぶ形をどの欄でも受け取り、生成物を `tsc` が断っていた
 * (2349 = 呼べない —— 守りが `tsc` の 1 層。MG-092 / MG-093 が「次に直す側の周を回すなら、ここが候補」と残した 1 つ)。
 * 0.54 は検査器 (M6) で断る。読む形 (`Math.PI` / `Math.PI.toFixed(2)`) と、関数の欄を呼ぶ形 (`Math.max(1, 2)`) は今までどおり。
 */

function compile(source: string): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs].find(([p]) => p.includes('m0'))![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}

const at = (line: number, col: number, message: string): string => `src/x/m0.mamori:${line}:${col}: ${message}`;
const VALUE_FIELD = (name: string, field: string): string =>
  `[M6] 組み込みの ${name}.${field} は呼べません —— 値の欄で、関数ではありません (呼ぶと実行時に投げ、TypeScript も断ります)。読む形 (\`${name}.${field}\`) は書けます`;
const UNDECLARED = (name: string): string => `[M6] 宣言していない名前 ${name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`;

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

/** 断る形: 本体の文・断りの場所 (2 行目の桁) と相手。どれも TypeScript は 2349 で断る。 */
interface Refused {
  readonly body: string;
  readonly col: number;
  readonly name: string;
  readonly field: string;
}

const REFUSED: Readonly<Record<string, Refused>> = {
  'Math の定数を呼ぶ': { body: 'return Math.PI();', col: 14, name: 'Math', field: 'PI' },
  'Math の定数を引数つきで呼ぶ': { body: 'return Math.E(1);', col: 14, name: 'Math', field: 'E' },
  'Math の定数 (下線つきの綴り) を呼ぶ': { body: 'return Math.SQRT1_2();', col: 14, name: 'Math', field: 'SQRT1_2' },
  'Number の定数を呼ぶ': { body: 'return Number.MAX_SAFE_INTEGER();', col: 16, name: 'Number', field: 'MAX_SAFE_INTEGER' },
  'Number.NaN を呼ぶ': { body: 'return Number.NaN();', col: 16, name: 'Number', field: 'NaN' },
  'Number.EPSILON を呼ぶ': { body: 'return Number.EPSILON();', col: 16, name: 'Number', field: 'EPSILON' },
  '関数である組み込みの length を呼ぶ (Array)': { body: 'return Array.length();', col: 15, name: 'Array', field: 'length' },
  '関数である組み込みの name を呼ぶ (String)': { body: 'return String.name();', col: 16, name: 'String', field: 'name' },
  'Number の length を呼ぶ': { body: 'return Number.length();', col: 16, name: 'Number', field: 'length' },
  'Promise の length を呼ぶ': { body: 'return Promise.length();', col: 17, name: 'Promise', field: 'length' },
  'Map の name を呼ぶ': { body: 'return Map.name();', col: 13, name: 'Map', field: 'name' },
  'Set の length を呼ぶ': { body: 'return Set.length();', col: 13, name: 'Set', field: 'length' },
  'Boolean の name を呼ぶ': { body: 'return Boolean.name();', col: 17, name: 'Boolean', field: 'name' },
  '括弧で包んだ欄を呼ぶ': { body: 'return (Math.PI)();', col: 15, name: 'Math', field: 'PI' },
  '`?.` で読んだ欄を呼ぶ': { body: 'return Math?.PI();', col: 14, name: 'Math', field: 'PI' },
  '文の位置で呼ぶ': { body: 'Math.LN2(); return 1;', col: 7, name: 'Math', field: 'LN2' },
  '引数の中で呼ぶ': { body: 'return Math.max(1, Math.LOG2E());', col: 26, name: 'Math', field: 'LOG2E' },
  '呼んだ結果のメンバを読む': { body: 'return Number.MIN_VALUE().toFixed;', col: 16, name: 'Number', field: 'MIN_VALUE' },
  'arrow の中で呼ぶ': { body: 'const f = () => Math.SQRT2(); return f;', col: 23, name: 'Math', field: 'SQRT2' },
};

/** 今までどおり通る形: [本体, 引数]。 */
const ACCEPTED: Readonly<Record<string, readonly [string, string?]>> = {
  '値の欄を読む': ['return Math.PI;'],
  '値の欄のメソッドを呼ぶ': ['return Math.PI.toFixed(2);'],
  'Number の値の欄のメソッドを呼ぶ': ['return Number.MAX_VALUE.toString();'],
  '関数の欄を呼ぶ (Math)': ['return Math.max(1, 2);'],
  '関数の欄を呼ぶ (Number)': ['return Number.isFinite(1);'],
  '関数の欄を呼ぶ (String)': ['return String.fromCharCode(65);'],
  '関数の欄を呼ぶ (Promise)': ['return Promise.resolve(1);'],
  '関数の欄を呼ぶ (JSON)': ['return JSON.stringify(1);'],
  '関数の欄を呼ぶ (Array)': ['return Array.isArray(1);'],
  '関数の欄の length を読む': ['return Math.max.length;'],
  '組み込みの length を読む': ['return Array.length;'],
  '引数で隠した同じ綴りの欄を呼ぶ': ['return Math.PI();', 'Math: { PI: () => number }'],
  '引数で隠した同じ綴りの length を呼ぶ': ['return Array.length();', 'Array: { length: () => number }'],
  '局所の名前の同じ綴りの欄を呼ぶ': ['return o.PI() + o.length();', 'o: { PI: () => number; length: () => number }'],
  '呼び出しの結果を呼ぶ': ['return make()();', 'make: () => () => number'],
  '添字の先を呼ぶ': ['return xs[0]();', 'xs: (() => number)[]'],
};

/** 測って残した形 (Mamori は今も受け取り、TypeScript が断る): [本体, TypeScript の番号]。 */
const LEFT_TO_TSC: Readonly<Record<string, readonly [string, number]>> = {
  '関数の欄の値の欄を呼ぶ (連なりの 2 段目)': ['return Math.max.length();', 2349],
  '値の欄を局所の名前へ写してから呼ぶ': ['const f = Math.PI; return f();', 2349],
  '在りもしない欄を呼ぶ': ['return Math.nope();', 2339],
  '在りもしない欄を読む': ['return Number.nope;', 2339],
};

describe('Mamori 0.54: 組み込みの値の欄を呼ばせない (MG-094)', () => {
  it('★ 組み込みの値の欄を直に呼ぶ形を、場所と全文つきで断る', () => {
    for (const [name, form] of Object.entries(REFUSED)) {
      const r = compile(fn(form.body));
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual([at(2, form.col, VALUE_FIELD(form.name, form.field))]);
    }
    expect(Object.keys(REFUSED).length).toBeGreaterThanOrEqual(19);
  });

  it('★ 同じ形を TypeScript も断る (本物の lib で測る · 2349)', () => {
    const codes = tsCodesByName(Object.fromEntries(Object.entries(REFUSED).map(([name, form]) => [name, tsFn(form.body)])));
    for (const name of Object.keys(REFUSED)) expect(codes[name], name).toEqual([2349]);
    // 標本: 物差しは、通る形に番号を付けない
    expect(tsCodesByName({ ok: tsFn('return Math.PI.toFixed(2);') })['ok']).toEqual([]);
  });

  it('★ 表と実物の組み込みは両方向に一致する —— Mamori がメンバとして読ませる欄のうち、関数でない物だけを断る', () => {
    const host = globalThis as unknown as Record<string, Record<string, unknown>>;
    const refusedCall = (name: string, key: string): boolean => compile(fn(`return ${name}.${key}();`)).diagnostics.includes(at(2, 10 + name.length, VALUE_FIELD(name, key)));
    let values = 0;
    let functions = 0;
    for (const name of PURE_GLOBALS) {
      // `.` で書ける鍵だけ (`RegExp["$&"]` のような鍵と記号の鍵は、Mamori の `a.b()` では書けない)。
      for (const key of Object.getOwnPropertyNames(host[name]).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k))) {
        // Mamori がメンバとして読ませない欄 (`.prototype`・絞った組み込みの表の外) は、前からの理由で断るので数えない。
        if (!compile(fn(`return ${name}.${key};`)).ok) continue;
        const isFunction = typeof host[name]![key] === 'function';
        if (isFunction) functions += 1;
        else values += 1;
        expect(refusedCall(name, key), `${name}.${key}`).toBe(!isFunction);
        expect(BUILTIN_VALUE_FIELDS.get(name)?.has(key) === true, `${name}.${key}`).toBe(!isFunction);
      }
    }
    expect(values).toBeGreaterThanOrEqual(28);
    expect(functions).toBeGreaterThanOrEqual(60);
    // 逆向き: 表の欄は 1 つ残らず、実物に在る関数でない欄である (古びた行を置かない)。メンバを絞った組み込みは表に載せない。
    let rows = 0;
    for (const [name, fields] of BUILTIN_VALUE_FIELDS) {
      expect(name !== null && PURE_GLOBALS.has(name) && !BUILTIN_MEMBERS.has(name), String(name)).toBe(true);
      for (const field of fields) {
        rows += 1;
        expect(field !== null && Object.hasOwn(host[name!]!, field) && typeof host[name!]![field] !== 'function', `${name}.${field}`).toBe(true);
      }
    }
    expect(rows).toBe(values);
  });

  it('★ 断った形でも、引数の中は 1 度だけ検める', () => {
    expect(compile(fn('return Math.PI(Nope);')).diagnostics).toEqual([at(2, 14, VALUE_FIELD('Math', 'PI')), at(2, 18, UNDECLARED('Nope'))]);
    expect(compile(fn('return Array.length(Math.E());')).diagnostics).toEqual([at(2, 15, VALUE_FIELD('Array', 'length')), at(2, 27, VALUE_FIELD('Math', 'E'))]);
  });

  it('対照: 値の欄を読む形・関数の欄を呼ぶ形・隠した同じ綴りは今までどおり通り、生成物の形も崩れない', () => {
    for (const [name, [body, params]] of Object.entries(ACCEPTED)) {
      const source = fn(body, params ?? '');
      const r = compile(source);
      expect(r.ok, `${name}: ${r.diagnostics.join(' | ')}`).toBe(true);
      expect(shapeMismatch('src/x/m0.mamori', source, r.emitted), name).toEqual([]);
    }
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(16);
  });

  it('対照: 前からの断り (メンバを絞った組み込み・名前空間を呼ぶ形・宣言していない名前) は、前の文のまま答える', () => {
    expect(compile(fn('return Object.length();')).diagnostics).toEqual([at(2, 16, '[M6] Object.length は使えません —— 組み込みの Object で使えるのは hasOwn / keys / values / entries / fromEntries / freeze / isFrozen だけです (原型や既にある値を書き換えるメンバは、他のモジュールの関門の判定まで変える)')]);
    expect(compile(fn('return Math();')).diagnostics).toEqual([at(2, 10, '[M6] 組み込みの Math は呼べません —— 名前空間なので `Math.m(…)` とメンバを直に使う形だけです (呼ぶと実行時に投げ、TypeScript も断ります)')]);
    expect(compile(fn('return Nope.PI();')).diagnostics).toEqual([at(2, 10, UNDECLARED('Nope'))]);
    const regexp = compile(fn('return RegExp.length();')).diagnostics;
    expect(regexp).toHaveLength(1);
    expect(regexp[0]).toContain('[M6] RegExp.length は使えません');
  });

  it('測って残した形: 連なりの 2 段目・局所の名前へ写した欄・在りもしない欄は、今も TypeScript だけが断る', () => {
    const codes = tsCodesByName(Object.fromEntries(Object.entries(LEFT_TO_TSC).map(([name, [body]]) => [name, tsFn(body)])));
    for (const [name, [body, code]] of Object.entries(LEFT_TO_TSC)) {
      expect(compile(fn(body)).ok, name).toBe(true);
      expect(codes[name], name).toEqual([code]);
    }
  });
});

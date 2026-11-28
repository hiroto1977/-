import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PURE_GLOBALS } from '../checker';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.55 —— 組み込みから辿った先の length / name を呼ばせない** (2026-11-28 · MG-095 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * `Math.max.length()` / `Array.from.name()` / `Math.max.name.length()` のように、隠れていない組み込みから `.` だけで 2 段以上辿った先の
 * `length` / `name` を呼ぶ形。辿った先は関数・数・文字列のどれかで、その `length` / `name` は数・文字列 (か、無い) —— 実行時に必ず投げる。
 * 0.54 (MG-094) が見たのは組み込みの名前の直下の欄 (`Array.length()`) だけで、2 段目からは受け取り、生成物を `tsc` が断っていた
 * (2349 / 2339 —— 守りが `tsc` の 1 層。MG-094 が「連なりの 2 段目」として残した 1 つ)。0.55 は検査器 (M6) で断る。
 * 読む形 (`Math.max.length`) と、辿った先のメソッドを呼ぶ形 (`Math.max.name.toUpperCase()`) は今までどおり。
 */

function compile(source: string): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs].find(([p]) => p.includes('m0'))![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}

const at = (line: number, col: number, message: string): string => `src/x/m0.mamori:${line}:${col}: ${message}`;
const CHAIN_FIELD = (root: string, field: string): string =>
  `[M6] 組み込みの ${root} から辿った先の \`.${field}\` は呼べません —— 関数の length / name は値の欄で、関数ではありません (呼ぶと実行時に投げ、TypeScript も断ります)`;
const VALUE_FIELD = (name: string, field: string): string =>
  `[M6] 組み込みの ${name}.${field} は呼べません —— 値の欄で、関数ではありません (呼ぶと実行時に投げ、TypeScript も断ります)。読む形 (\`${name}.${field}\`) は書けます`;
const UNDECLARED = (name: string): string => `[M6] 宣言していない名前 ${name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`;

/** 関数 1 つの本体に文を置いた Mamori の module (2 行目の先頭 2 桁が字下げ)。 */
const fn = (body: string, params = ''): string => `export fn t(${params}) -> unknown {\n  ${body}\n}\n`;
/** 同じ形の TypeScript。 */
const tsFn = (body: string, params = ''): string => `export function t(${params}): unknown { ${body} }`;
/** 本体の中の綴り `token` が始まる桁 (2 行目 · 字下げ 2 桁)。 */
const colOf = (body: string, token: string): number => 3 + body.indexOf(token);

/** TypeScript (厳格モード・**本物の lib** = ES2022 + DOM) が、綴りごとに付ける診断の番号。1 回の program に全部の綴りを入れて測る。 */
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

/** 断る形: 本体の文・断りの場所を指す綴り (その先頭の桁)・頭の組み込み・呼んだ欄・TypeScript の番号。 */
interface Refused {
  readonly body: string;
  readonly token: string;
  readonly root: string;
  readonly field: string;
  readonly code: number;
}

const REFUSED: Readonly<Record<string, Refused>> = {
  '関数の欄の length を呼ぶ': { body: 'return Math.max.length();', token: '.length(', root: 'Math', field: 'length', code: 2349 },
  '関数の欄の name を呼ぶ': { body: 'return Math.max.name();', token: '.name(', root: 'Math', field: 'name', code: 2349 },
  '3 段目 (関数の name の length) を呼ぶ': { body: 'return Math.max.name.length();', token: '.length(', root: 'Math', field: 'length', code: 2349 },
  '3 段目 (メソッドの name) を呼ぶ': { body: 'return Math.max.toString.name();', token: '.name(', root: 'Math', field: 'name', code: 2349 },
  '4 段目 (値の欄のメソッドの length) を呼ぶ': { body: 'return Number.MAX_VALUE.toFixed.length();', token: '.length(', root: 'Number', field: 'length', code: 2349 },
  'JSON のメソッドの length を呼ぶ': { body: 'return JSON.stringify.length();', token: '.length(', root: 'JSON', field: 'length', code: 2349 },
  'Array のメソッドの name を呼ぶ': { body: 'return Array.from.name();', token: '.name(', root: 'Array', field: 'name', code: 2349 },
  'String のメソッドの name を呼ぶ': { body: 'return String.raw.name();', token: '.name(', root: 'String', field: 'name', code: 2349 },
  'Promise のメソッドの length を呼ぶ': { body: 'return Promise.resolve.length();', token: '.length(', root: 'Promise', field: 'length', code: 2349 },
  'メンバを絞った組み込み (Object) の使える欄の length を呼ぶ': { body: 'return Object.keys.length();', token: '.length(', root: 'Object', field: 'length', code: 2349 },
  'メンバを絞った組み込み (URL) の使える欄の name を呼ぶ': { body: 'return URL.canParse.name();', token: '.name(', root: 'URL', field: 'name', code: 2349 },
  '組み込みの name の length を呼ぶ': { body: 'return Set.name.length();', token: '.length(', root: 'Set', field: 'length', code: 2349 },
  '値の欄 (数) の length を呼ぶ —— 在りもしない欄': { body: 'return Math.PI.length();', token: '.length(', root: 'Math', field: 'length', code: 2339 },
  '`?.` で読んで呼ぶ': { body: 'return Math.max?.length();', token: '?.length(', root: 'Math', field: 'length', code: 2349 },
  '括弧で包んだ欄から呼ぶ': { body: 'return (Math.max).length();', token: '.length(', root: 'Math', field: 'length', code: 2349 },
  '文字列の鍵の添字で読んで呼ぶ': { body: 'return Math.max["length"]();', token: '["length"]', root: 'Math', field: 'length', code: 2349 },
  '文の位置で呼ぶ': { body: 'Math.max.length(); return 1;', token: '.length(', root: 'Math', field: 'length', code: 2349 },
  '引数の中で呼ぶ': { body: 'return Math.max(1, Math.min.length());', token: '.length(', root: 'Math', field: 'length', code: 2349 },
  '呼んだ結果のメンバを読む': { body: 'return Math.max.length().toFixed;', token: '.length(', root: 'Math', field: 'length', code: 2349 },
  'arrow の中で呼ぶ': { body: 'const f = () => Math.max.name(); return f;', token: '.name(', root: 'Math', field: 'name', code: 2349 },
};

/** 今までどおり通る形: [本体, 引数]。 */
const ACCEPTED: Readonly<Record<string, readonly [string, string?]>> = {
  '関数の欄の length を読む': ['return Math.max.length;'],
  '関数の欄の name の length を読む': ['return Math.max.name.length;'],
  '関数の欄の name のメソッドを呼ぶ': ['return Math.max.name.toUpperCase();'],
  '関数の欄の length のメソッドを呼ぶ': ['return Math.max.length.toFixed(2);'],
  '関数の欄のメソッドを呼ぶ': ['return Math.max.toString();'],
  '関数の欄を呼ぶ': ['return Math.max(1, 2);'],
  '引数で隠した同じ綴りから辿って呼ぶ': ['return Math.max.length();', 'Math: { max: { length: () => number } }'],
  '局所の名前から辿って呼ぶ': ['return o.f.length() + o.f.name().length;', 'o: { f: { length: () => number; name: () => string } }'],
  '呼び出しの結果から辿って呼ぶ': ['return make().f.length();', 'make: () => { f: { length: () => number } }'],
  '添字の先から辿って呼ぶ': ['return xs[0].f.name();', 'xs: { f: { name: () => string } }[]'],
};

/** 測って残した形 (Mamori は今も受け取り、TypeScript が断る): [本体, 引数, TypeScript の番号]。const へ写してから呼ぶ形 (`const f = Math.max.length; f()`) は 0.56 (MG-096) が断るようにした —— `mamoriV56.test.ts`。 */
const LEFT_TO_TSC: Readonly<Record<string, readonly [string, string, number]>> = {
  '辿った先の欄を let へ写してから呼ぶ': ['let f = Math.max.length; return f();', '', 2349],
  '局所の配列の length を呼ぶ': ['return xs.length();', 'xs: number[]', 2349],
  '辿った先の在りもしない欄を呼ぶ': ['return Math.max.nope();', '', 2339],
};

describe('Mamori 0.55: 組み込みから辿った先の length / name を呼ばせない (MG-095)', () => {
  it('★ 組み込みから 2 段以上辿った先の length / name を呼ぶ形を、場所と全文つきで断る', () => {
    for (const [name, form] of Object.entries(REFUSED)) {
      expect(form.body.indexOf(form.token), name).toBeGreaterThan(0);
      const r = compile(fn(form.body));
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual([at(2, colOf(form.body, form.token), CHAIN_FIELD(form.root, form.field))]);
    }
    expect(Object.keys(REFUSED).length).toBeGreaterThanOrEqual(20);
  });

  it('★ 同じ形を TypeScript も断る (本物の lib で測る · 2349 / 2339)', () => {
    const codes = tsCodesByName(Object.fromEntries(Object.entries(REFUSED).map(([name, form]) => [name, tsFn(form.body)])));
    for (const [name, form] of Object.entries(REFUSED)) expect(codes[name], name).toEqual([form.code]);
    // 標本: 物差しは、通る形に番号を付けない
    expect(tsCodesByName({ ok: tsFn('return Math.max.length.toFixed(2);') })['ok']).toEqual([]);
  });

  it('★ 実物の組み込みから辿れる先に、呼べる length / name は 1 つも無い —— Mamori が読ませる欄は、どれも length / name を呼ぶ形を断る', () => {
    const host = globalThis as unknown as Record<string, Record<string, unknown>>;
    const writable = (k: string): boolean => /^[A-Za-z_$][\w$]*$/.test(k);
    // Mamori がどの相手でも読ませないメンバ (原型へ届く)。辿る道から外す。
    const FORBIDDEN = new Set(['constructor', 'prototype', '__proto__']);
    const keysOf = (v: unknown): string[] => {
      const keys = new Set<string>();
      for (let o: unknown = Object(v); o !== null; o = Object.getPrototypeOf(o)) for (const k of Object.getOwnPropertyNames(o)) if (writable(k) && !FORBIDDEN.has(k)) keys.add(k);
      return [...keys];
    };
    const read = (v: unknown, k: string): unknown => {
      try {
        return (Object(v) as Record<string, unknown>)[k];
      } catch {
        return undefined; // 厳格な関数の `arguments` / `caller` は読むと投げる
      }
    };
    // 辿れる値の閉包 (物・関数は同一性、数・文字列・真偽は型と値で 1 度だけ)。
    const seen = new Set<unknown>();
    const queue: unknown[] = [];
    const visit = (v: unknown): void => {
      if (v === null || v === undefined) return;
      const key = typeof v === 'object' || typeof v === 'function' ? v : `${typeof v}:${String(v)}`;
      if (seen.has(key)) return;
      seen.add(key);
      queue.push(v);
    };
    let firstLevel = 0;
    for (const name of PURE_GLOBALS) {
      for (const key of Object.getOwnPropertyNames(host[name]).filter(writable)) {
        // Mamori がメンバとして読ませない欄 (`.prototype`・絞った組み込みの表の外) は、前からの理由で断るので辿らない。
        if (!compile(fn(`return ${name}.${key};`)).ok) continue;
        firstLevel += 1;
        visit(host[name]![key]);
        // Mamori の側: 読ませる欄の先の length / name を呼ぶ形は、どれも断る。
        for (const field of ['length', 'name']) {
          const body = `return ${name}.${key}.${field}();`;
          expect(compile(fn(body)).diagnostics, body).toContain(at(2, 10 + name.length + 1 + key.length, CHAIN_FIELD(name, field)));
        }
      }
    }
    let functions = 0;
    while (queue.length > 0) {
      const v = queue.shift();
      if (typeof v === 'function') functions += 1;
      // 実物の側: 辿った先のどの値も、呼べる length / name を持たない。
      for (const field of ['length', 'name']) expect(typeof read(v, field), `${String(v).slice(0, 40)}.${field}`).not.toBe('function');
      for (const k of keysOf(v)) visit(read(v, k));
    }
    expect(firstLevel).toBeGreaterThanOrEqual(88);
    expect(functions).toBeGreaterThanOrEqual(100);
    // 標本: 物差し (読む側) は、呼べる length を持つ物を見分ける
    expect(typeof read({ length: () => 1 }, 'length')).toBe('function');
  });

  it('★ 断った形でも、引数の中は 1 度だけ検める', () => {
    expect(compile(fn('return Math.max.length(Nope);')).diagnostics).toEqual([at(2, 18, CHAIN_FIELD('Math', 'length')), at(2, 26, UNDECLARED('Nope'))]);
    expect(compile(fn('return Math.max.length(Math.min.name());')).diagnostics).toEqual([at(2, 18, CHAIN_FIELD('Math', 'length')), at(2, 34, CHAIN_FIELD('Math', 'name'))]);
  });

  it('対照: 読む形・辿った先のメソッドを呼ぶ形・隠した同じ綴り・名前から始まらない連なりは今までどおり通り、生成物の形も崩れない', () => {
    for (const [name, [body, params]] of Object.entries(ACCEPTED)) {
      const source = fn(body, params ?? '');
      const r = compile(source);
      expect(r.ok, `${name}: ${r.diagnostics.join(' | ')}`).toBe(true);
      expect(shapeMismatch('src/x/m0.mamori', source, r.emitted), name).toEqual([]);
    }
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(10);
  });

  it('対照: 直下の欄を呼ぶ形 (0.54)・メンバを絞った組み込み・宣言していない名前は、前の文のまま 1 度だけ答える', () => {
    expect(compile(fn('return Array.length();')).diagnostics).toEqual([at(2, 15, VALUE_FIELD('Array', 'length'))]);
    expect(compile(fn('return Math.PI();')).diagnostics).toEqual([at(2, 14, VALUE_FIELD('Math', 'PI'))]);
    expect(compile(fn('return Nope.max.length();')).diagnostics).toEqual([at(2, 10, UNDECLARED('Nope'))]);
    const regexp = compile(fn('return RegExp.length();')).diagnostics;
    expect(regexp).toHaveLength(1);
    expect(regexp[0]).toContain('[M6] RegExp.length は使えません');
    // メンバを絞った組み込みの、使えない欄から辿る形: 辿った先の断りと、欄そのものの断りの両方が出る
    const error = compile(fn('return Error.name.length();')).diagnostics;
    expect(error).toHaveLength(2);
    expect(error[0]).toBe(at(2, 20, CHAIN_FIELD('Error', 'length')));
    expect(error[1]).toContain(':2:15: [M6] Error.name は使えません');
  });

  it('測って残した形: let へ写した欄・局所の名前の length・辿った先の在りもしない欄は、今も TypeScript だけが断る', () => {
    const codes = tsCodesByName(Object.fromEntries(Object.entries(LEFT_TO_TSC).map(([name, [body, params]]) => [name, tsFn(body, params)])));
    for (const [name, [body, params, code]] of Object.entries(LEFT_TO_TSC)) {
      expect(compile(fn(body, params)).ok, name).toBe(true);
      expect(codes[name], name).toEqual([code]);
    }
  });
});

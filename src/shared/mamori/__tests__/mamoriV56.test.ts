import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.56 —— 組み込みの値の欄を写した const を呼ばせない** (2026-11-28 · MG-096 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * `const f = Math.PI; f()` / `const f = Math.max.length; f()` のように、隠れていない組み込みの値の欄 (0.54 の直下の欄・0.55 の辿った先の
 * `length` / `name`) を `const` へ写してから、その名前を呼ぶ形。写した値は数・文字列なので、実行時に必ず投げる。
 * 0.55 までの検査器は受け取り、生成物を `tsc` が断っていた (2349 —— 守りが `tsc` の 1 層。MG-094 / MG-095 が「写してから呼ぶ形」として残した 1 つ)。
 * 0.56 は検査器 (M6) で断る。`const` の別名 (`const g = f;`)・モジュール直下の const・arrow の中からの呼び出しも同じ。
 * `let` は入れ直せる (`let f: number | (() => number) = Math.PI; f = () => 1; f()` は動く) ので数えない。
 * 呼ぶ形 (0.54 / 0.55) と写す形は、同じ 1 つの判定 (`builtinValueField`) を読む。
 */

function compile(source: string): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs].find(([p]) => p.includes('m0'))![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}

const at = (line: number, col: number, message: string): string => `src/x/m0.mamori:${line}:${col}: ${message}`;
const COPIED = (name: string, origin: string): string =>
  `[M6] ${name} は呼べません —— 組み込みの値の欄 (${origin}) を写した const で、関数ではありません (呼ぶと実行時に投げ、TypeScript も断ります)`;
const CHAIN_FIELD = (root: string, field: string): string =>
  `[M6] 組み込みの ${root} から辿った先の \`.${field}\` は呼べません —— 関数の length / name は値の欄で、関数ではありません (呼ぶと実行時に投げ、TypeScript も断ります)`;
const VALUE_FIELD = (name: string, field: string): string =>
  `[M6] 組み込みの ${name}.${field} は呼べません —— 値の欄で、関数ではありません (呼ぶと実行時に投げ、TypeScript も断ります)。読む形 (\`${name}.${field}\`) は書けます`;
const UNDECLARED = (name: string): string => `[M6] 宣言していない名前 ${name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`;

/** 関数 1 つの本体に文を置いた Mamori の module (2 行目の先頭 2 桁が字下げ)。`top` は関数より前に置く直下の宣言 (行ごと)。 */
const fn = (body: string, params = '', top = ''): string => `${top}export fn t(${params}) -> unknown {\n  ${body}\n}\n`;
/** 同じ形の TypeScript。 */
const tsFn = (body: string, params = '', top = ''): string => `${top}export function t(${params}): unknown { ${body} }`;

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

/** 断る形: 本体の文・直下の宣言 (Mamori / TypeScript)・断りの場所を指す綴り・呼んだ名前・写した元の綴り。TypeScript はどれも 2349。 */
interface Refused {
  readonly body: string;
  readonly top?: string;
  readonly tsTop?: string;
  readonly token: string;
  readonly name: string;
  readonly origin: string;
}

const REFUSED: Readonly<Record<string, Refused>> = {
  '直下の値の欄 (定数) を写して呼ぶ': { body: 'const f = Math.PI; return f();', token: 'f()', name: 'f', origin: 'Math.PI' },
  'Number の定数を写して呼ぶ': { body: 'const f = Number.EPSILON; return f();', token: 'f()', name: 'f', origin: 'Number.EPSILON' },
  '組み込みの length を写して呼ぶ': { body: 'const f = Array.length; return f();', token: 'f()', name: 'f', origin: 'Array.length' },
  '組み込みの name を写して呼ぶ': { body: 'const f = Set.name; return f();', token: 'f()', name: 'f', origin: 'Set.name' },
  '辿った先の length を写して呼ぶ': { body: 'const f = Math.max.length; return f();', token: 'f()', name: 'f', origin: 'Math から辿った先の .length' },
  '辿った先の name を写して呼ぶ': { body: 'const f = Math.max.name; return f();', token: 'f()', name: 'f', origin: 'Math から辿った先の .name' },
  '3 段目を写して呼ぶ': { body: 'const f = Math.max.name.length; return f();', token: 'f()', name: 'f', origin: 'Math から辿った先の .length' },
  'メンバを絞った組み込みの使える欄から辿って写す': { body: 'const f = Object.keys.length; return f();', token: 'f()', name: 'f', origin: 'Object から辿った先の .length' },
  '`?.` で読んで写す': { body: 'const f = Math.max?.length; return f();', token: 'f()', name: 'f', origin: 'Math から辿った先の .length' },
  '括弧で包んで写す': { body: 'const f = (Math.PI); return f();', token: 'f()', name: 'f', origin: 'Math.PI' },
  '型を書いた const へ写して呼ぶ': { body: 'const f: number = Math.PI; return f();', token: 'f()', name: 'f', origin: 'Math.PI' },
  '呼べる型を名乗る const へ写して呼ぶ': { body: 'const f: number | (() => number) = Math.PI; return f();', token: 'f()', name: 'f', origin: 'Math.PI' },
  'const の別名を呼ぶ': { body: 'const f = Math.PI; const g = f; return g();', token: 'g()', name: 'g', origin: 'Math.PI' },
  '別名の別名を呼ぶ': { body: 'const f = Math.max.name; const g = f; const h = g; return h();', token: 'h()', name: 'h', origin: 'Math から辿った先の .name' },
  '文の位置で呼ぶ': { body: 'const f = Math.PI; f(); return 1;', token: 'f()', name: 'f', origin: 'Math.PI' },
  '引数の中で呼ぶ': { body: 'const f = Math.PI; return Math.max(1, f());', token: 'f()', name: 'f', origin: 'Math.PI' },
  '呼んだ結果のメンバを読む': { body: 'const f = Math.PI; return f().toFixed;', token: 'f()', name: 'f', origin: 'Math.PI' },
  'arrow の中から呼ぶ': { body: 'const f = Math.PI; const g = () => f(); return g;', token: 'f()', name: 'f', origin: 'Math.PI' },
  '入れ子のブロックの中から呼ぶ': { body: 'const f = Math.PI; if (f > 3) { return f(); } return 0;', token: 'f()', name: 'f', origin: 'Math.PI' },
  '直下の const へ写して呼ぶ': { body: 'return F();', top: 'const F = Math.PI;\n', tsTop: 'const F = Math.PI;\n', token: 'F()', name: 'F', origin: 'Math.PI' },
  '型を書いた直下の const へ写して呼ぶ': { body: 'return F();', top: 'const F: number = Number.MAX_VALUE;\n', tsTop: 'const F: number = Number.MAX_VALUE;\n', token: 'F()', name: 'F', origin: 'Number.MAX_VALUE' },
  '直下の const の別名を呼ぶ': { body: 'return G();', top: 'const F = Math.max.length;\nconst G = F;\n', tsTop: 'const F = Math.max.length;\nconst G = F;\n', token: 'G()', name: 'G', origin: 'Math から辿った先の .length' },
  '直下の const を局所の const へ写して呼ぶ': { body: 'const g = F; return g();', top: 'const F = Math.PI;\n', tsTop: 'const F = Math.PI;\n', token: 'g()', name: 'g', origin: 'Math.PI' },
};

/** 今までどおり通る形: [本体, 引数, 直下の宣言 (Mamori)]。 */
const ACCEPTED: Readonly<Record<string, readonly [string, string?, string?]>> = {
  '関数の欄を写して呼ぶ': ['const f = Math.max; return f(1, 2);'],
  '写した値のメソッドを呼ぶ': ['const f = Math.PI; return f.toFixed(2);'],
  '写した値を読む': ['const f = Math.PI; const g = f; return f + g;'],
  '写した文字列のメソッドを呼ぶ': ['const f = Math.max.name; return f.toUpperCase();'],
  'let へ写して、呼べる値を入れ直してから呼ぶ': ['let f: number | (() => number) = Math.PI; f = () => 1; return f();'],
  '入れ直した let を const へ写して呼ぶ': ['let f: number | (() => number) = Math.PI; f = () => 1; const g = f; return g();'],
  '初期値の無い let に入れてから呼ぶ': ['let f: () => number; f = () => 1; return f();'],
  '内側のブロックで同じ名前を呼べる値で宣言し直す': ['const f = Math.PI; if (f > 3) { const f = () => 1; return f(); } return 0;'],
  '引数で隠した同じ綴りの欄を写して呼ぶ': ['const f = Math.PI; return f();', 'Math: { PI: () => number }'],
  '引数で隠した同じ綴りから辿って写して呼ぶ': ['const f = Math.max.length; return f();', 'Math: { max: { length: () => number } }'],
  '局所の名前の欄を写して呼ぶ': ['const f = o.length; const g = o.f.name; return f() + g().length;', 'o: { length: () => number; f: { name: () => string } }'],
  '呼び出しの結果から辿った欄を写して呼ぶ': ['const f = make().f.length; return f();', 'make: () => { f: { length: () => number } }'],
  '添字の先の欄を写して呼ぶ': ['const f = xs[0].f.name; return f();', 'xs: { f: { name: () => string } }[]'],
  '呼べる引数の別名を呼ぶ': ['const g = cb; return g();', 'cb: () => number'],
  '直下の const (関数の欄) を呼ぶ': ['return F(1, 2);', '', 'const F = Math.max;\n'],
  '直下の const (値の欄) を読む': ['return F.toFixed(2) + G.length;', '', 'const F = Math.PI;\nconst G = Math.max.name;\n'],
};

/** 測って残した形 (Mamori は今も受け取り、TypeScript が断る): [本体, 引数, 直下の宣言, TypeScript の番号の並び]。 */
const LEFT_TO_TSC: Readonly<Record<string, readonly [string, string, string, readonly number[]]>> = {
  'let へ写して、そのまま呼ぶ': ['let f = Math.PI; return f();', '', '', [2349]],
  '直下の let へ写して呼ぶ': ['return F();', '', 'let F: number = Math.PI;\n', [2349]],
  '数の字面を写して呼ぶ': ['const f = 1; return f();', '', '', [2349]],
  '数の引数を呼ぶ': ['return n();', 'n: number', '', [2349]],
  '局所の配列の length を写して呼ぶ': ['const f = xs.length; return f();', 'xs: number[]', '', [2349]],
  '文字列の字面の length を写して呼ぶ': ['const f = "x".length; return f();', '', '', [2349]],
  '写した文字列の length を呼ぶ': ['const f = Math.max.name; return f.length();', '', '', [2349]],
  '組み込みの在りもしない欄を写して呼ぶ': ['const f = JSON.name; return f();', '', '', [2339]],
  '式の中に置いた値の欄を写して呼ぶ': ['const f = Math.PI + 0; return f();', '', '', [2349]],
};

describe('Mamori 0.56: 組み込みの値の欄を写した const を呼ばせない (MG-096)', () => {
  it('★ 組み込みの値の欄を写した const を呼ぶ形を、場所と全文つきで断る', () => {
    for (const [name, form] of Object.entries(REFUSED)) {
      const top = form.top ?? '';
      const line = top.split('\n').length + 1;
      expect(form.body.indexOf(form.token), name).toBeGreaterThanOrEqual(0);
      const r = compile(fn(form.body, '', top));
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual([at(line, 3 + form.body.indexOf(form.token), COPIED(form.name, form.origin))]);
    }
    expect(Object.keys(REFUSED).length).toBeGreaterThanOrEqual(22);
  });

  it('★ 同じ形を TypeScript も断る (本物の lib で測る · 2349)', () => {
    const codes = tsCodesByName(Object.fromEntries(Object.entries(REFUSED).map(([name, form]) => [name, tsFn(form.body, '', form.tsTop ?? '')])));
    for (const name of Object.keys(REFUSED)) expect(codes[name], name).toEqual([2349]);
    // 標本: 物差しは、通る形に番号を付けない
    expect(tsCodesByName({ ok: tsFn('const f = Math.max; return f(1, 2);') })['ok']).toEqual([]);
  });

  it('★ 写した値は、実物でも呼べない (検査を回す実行環境の組み込みで測る)', () => {
    const origins: readonly unknown[] = [Math.PI, Number.EPSILON, Number.MAX_VALUE, Array.length, Set.name, Math.max.length, Math.max.name, Math.max.name.length, Object.keys.length];
    for (const v of origins) {
      expect(typeof v === 'number' || typeof v === 'string', String(v)).toBe(true);
      expect(() => (v as unknown as () => unknown)(), String(v)).toThrow(TypeError);
    }
    // 標本: 物差しは、呼べる値を投げない
    expect(() => (Math.max as unknown as () => unknown)()).not.toThrow();
  });

  it('★ 直下の const は、関数より後ろに書いても同じ答え', () => {
    const source = 'export fn t() -> unknown {\n  return F();\n}\nconst F = Math.PI;\n';
    expect(compile(source).diagnostics).toEqual([at(2, 10, COPIED('F', 'Math.PI'))]);
  });

  it('★ 断った形でも、引数の中は 1 度だけ検める', () => {
    expect(compile(fn('const f = Math.PI; return f(Nope);')).diagnostics).toEqual([at(2, 29, COPIED('f', 'Math.PI')), at(2, 31, UNDECLARED('Nope'))]);
    expect(compile(fn('const f = Math.PI; const g = Math.max.length; return f(g());')).diagnostics).toEqual([
      at(2, 56, COPIED('f', 'Math.PI')),
      at(2, 58, COPIED('g', 'Math から辿った先の .length')),
    ]);
  });

  it('対照: 関数の欄を写す形・写した値を読む形・入れ直せる let・隠した同じ綴り・名前から始まらない連なりは今までどおり通り、生成物の形も崩れない', () => {
    for (const [name, [body, params, top]] of Object.entries(ACCEPTED)) {
      const source = fn(body, params ?? '', top ?? '');
      const r = compile(source);
      expect(r.ok, `${name}: ${r.diagnostics.join(' | ')}`).toBe(true);
      expect(shapeMismatch('src/x/m0.mamori', source, r.emitted), name).toEqual([]);
    }
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(16);
  });

  it('対照: 通る形のうち TypeScript の型だけで書ける物は、TypeScript も通す (断るのは実行時に投げる形だけ)', () => {
    const codes = tsCodesByName({
      relet: tsFn('let f: number | (() => number) = Math.PI; f = () => 1; return f();'),
      realias: tsFn('let f: number | (() => number) = Math.PI; f = () => 1; const g = f; return g();'),
      shadow: tsFn('const f = Math.PI; if (f > 3) { const f = () => 1; return f(); } return 0;'),
    });
    expect(codes).toEqual({ relet: [], realias: [], shadow: [] });
  });

  it('対照: 呼ぶ形 (0.54 / 0.55)・宣言していない名前は、前の文のまま 1 度だけ答える (判定を 1 つに寄せても答えは同じ)', () => {
    expect(compile(fn('return Array.length();')).diagnostics).toEqual([at(2, 15, VALUE_FIELD('Array', 'length'))]);
    expect(compile(fn('return Math.PI();')).diagnostics).toEqual([at(2, 14, VALUE_FIELD('Math', 'PI'))]);
    expect(compile(fn('return Math.max.length();')).diagnostics).toEqual([at(2, 18, CHAIN_FIELD('Math', 'length'))]);
    expect(compile(fn('return Math.max.name.length();')).diagnostics).toEqual([at(2, 23, CHAIN_FIELD('Math', 'length'))]);
    expect(compile(fn('const f = Nope.max.length; return f();')).diagnostics).toEqual([at(2, 13, UNDECLARED('Nope'))]);
    expect(compile(fn('const f = Nope.PI; return f();')).diagnostics).toEqual([at(2, 13, UNDECLARED('Nope'))]);
  });

  it('対照 (測って残した形): let・字面・局所の値の欄・在りもしない欄を写して呼ぶ形は、Mamori は今も受け取り、TypeScript が断る', () => {
    const codes = tsCodesByName(Object.fromEntries(Object.entries(LEFT_TO_TSC).map(([name, [body, params, top]]) => [name, tsFn(body, params, top)])));
    for (const [name, [body, params, top, expected]] of Object.entries(LEFT_TO_TSC)) {
      const r = compile(fn(body, params, top));
      expect(r.ok, `${name}: ${r.diagnostics.join(' | ')}`).toBe(true);
      expect(codes[name], name).toEqual(expected);
    }
  });

  // 別の Mamori の module から `use` で引いた const を呼ぶ形は、0.57 (MG-097) が断るようにした —— `mamoriV57.test.ts`。
});

import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.57 —— 組み込みの値の欄を写した const を、module をまたいでも呼ばせない** (2026-11-28 · MG-097 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * 0.56 (MG-096) は、組み込みの値の欄を写した const を呼ぶ形 (`const F = Math.PI; F()`) を同じ module の中でだけ断った。
 * 別の Mamori の module から `use` で引いた同じ const (`use { F } from "./m1"; F()`) は受け取り、生成物を `tsc` が断っていた
 * (2349 —— 守りが `tsc` の 1 層。MG-096 が「module をまたぐ形」として残した 1 つ)。0.57 は、写した元の綴りを project の表
 * (`valueConsts`) で運び、引いた先でも検査器 (M6) で断る。別名 (`use { F alias G }`)・引いた名前を写した const・
 * 3 つの module をまたぐ別名の連なりも同じ。同じ module の中の答え (0.56) は、同じ表から読むので変わらない。
 */

type Files = readonly { readonly path: string; readonly source: string }[];
const mod = (name: string, source: string): { path: string; source: string } => ({ path: `src/x/${name}.mamori`, source });
function diagnose(files: Files): string[] {
  const r = compileProject(files);
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}

const at = (name: string, line: number, col: number, message: string): string => `src/x/${name}.mamori:${line}:${col}: ${message}`;
const COPIED = (name: string, origin: string): string =>
  `[M6] ${name} は呼べません —— 組み込みの値の欄 (${origin}) を写した const で、関数ではありません (呼ぶと実行時に投げ、TypeScript も断ります)`;
const NOT_EXPORTED = (target: string, name: string): string => `[M6] ${target} は ${name} を export していません (use で引けるのは export した名前だけ)`;

/** `名前()` を返す関数 1 つ (2 行: 関数の頭・本体)。 */
const callFn = (name: string, args = ''): string => `export fn t() -> unknown {\n  return ${name}(${args});\n}\n`;
const PI = mod('m1', 'export const F: number = Math.PI;\n');

/** TypeScript (厳格モード・本物の lib) が 1 つの綴りに付ける診断の番号。 */
function tsCodes(text: string): number[] {
  const file = '/virtual/f.ts';
  const options: ts.CompilerOptions = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], types: [] };
  const host = ts.createCompilerHost(options);
  const real = host.getSourceFile.bind(host);
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  host.getSourceFile = (f, v) => (f === file ? sf : real(f, v));
  const realExists = host.fileExists.bind(host);
  host.fileExists = (f) => f === file || realExists(f);
  const program = ts.createProgram([file], options, host);
  return [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)].map((d) => d.code);
}

/** 断る形: module の並び (渡す順のまま) と、ただ 1 つ出る断り。 */
const REFUSED: Readonly<Record<string, { readonly files: Files; readonly expected: string }>> = {
  '型を書いた const を引いて呼ぶ': { files: [PI, mod('m0', 'use { F } from "./m1";\n' + callFn('F'))], expected: at('m0', 3, 10, COPIED('F', 'Math.PI')) },
  '型を書いていない const (辿った先の length) を引いて呼ぶ': {
    files: [mod('m1', 'export const F = Math.max.length;\n'), mod('m0', 'use { F } from "./m1";\n' + callFn('F'))],
    expected: at('m0', 3, 10, COPIED('F', 'Math から辿った先の .length')),
  },
  '別名を付けて引いて呼ぶ': { files: [PI, mod('m0', 'use { F alias G } from "./m1";\n' + callFn('G'))], expected: at('m0', 3, 10, COPIED('G', 'Math.PI')) },
  '引いた名前を局所の const へ写して呼ぶ': {
    files: [PI, mod('m0', 'use { F } from "./m1";\nexport fn t() -> unknown {\n  const g = F;\n  return g();\n}\n')],
    expected: at('m0', 4, 10, COPIED('g', 'Math.PI')),
  },
  '引いた名前を直下の const へ写して呼ぶ': {
    files: [PI, mod('m0', 'use { F } from "./m1";\nconst G: number = F;\n' + callFn('G'))],
    expected: at('m0', 4, 10, COPIED('G', 'Math.PI')),
  },
  '引く側の module を先に並べる (表は並びに依らない)': {
    files: [mod('m0', 'use { F } from "./m1";\nconst G: number = F;\n' + callFn('G')), PI],
    expected: at('m0', 4, 10, COPIED('G', 'Math.PI')),
  },
  '3 つの module をまたぐ別名を呼ぶ': {
    files: [
      mod('m0', 'use { B } from "./m1";\n' + callFn('B')),
      mod('m1', 'use { A } from "./m2";\nexport const B: number = A;\n'),
      mod('m2', 'export const A: number = Number.EPSILON;\n'),
    ],
    expected: at('m0', 3, 10, COPIED('B', 'Number.EPSILON')),
  },
  '別名を付けて引いた名前を、直下の const へ写して出し、引いて呼ぶ': {
    files: [
      mod('m2', 'export const A = Set.name;\n'),
      mod('m1', 'use { A alias Z } from "./m2";\nexport const B = Z;\n'),
      mod('m0', 'use { B } from "./m1";\n' + callFn('B')),
    ],
    expected: at('m0', 3, 10, COPIED('B', 'Set.name')),
  },
  'use を const より後ろに書いた module の別名を呼ぶ': {
    files: [mod('m2', 'export const A: number = Number.EPSILON;\n'), mod('m1', 'export const B: number = A;\nuse { A } from "./m2";\n' + callFn('B'))],
    expected: at('m1', 4, 10, COPIED('B', 'Number.EPSILON')),
  },
  'arrow の中から、引いた名前を呼ぶ': {
    files: [PI, mod('m0', 'use { F } from "./m1";\nexport fn t() -> unknown {\n  const g = () => F();\n  return g;\n}\n')],
    expected: at('m0', 3, 19, COPIED('F', 'Math.PI')),
  },
  '同じ module の中 (0.56 の答えは同じ表から読む)': { files: [mod('m0', 'const F = Math.PI;\n' + callFn('F'))], expected: at('m0', 3, 10, COPIED('F', 'Math.PI')) },
  '同じ module の中の、直下の別名の別名': {
    files: [mod('m0', 'const F = Math.max.name;\nconst G = F;\nconst H = G;\n' + callFn('H'))],
    expected: at('m0', 5, 10, COPIED('H', 'Math から辿った先の .name')),
  },
  '関数より後ろに書いた直下の const': { files: [mod('m0', callFn('F') + 'const F = Math.PI;\n')], expected: at('m0', 2, 10, COPIED('F', 'Math.PI')) },
};

/** 今までどおり通る形。 */
const ACCEPTED: Readonly<Record<string, Files>> = {
  '関数の欄を写した const を引いて呼ぶ': [mod('m1', 'export const F = Math.max;\n'), mod('m0', 'use { F } from "./m1";\n' + callFn('F', '1, 2'))],
  '値の欄を写した const を引いて読む': [PI, mod('m0', 'use { F } from "./m1";\nexport fn t() -> unknown {\n  const g = F;\n  return F.toFixed(2) + g;\n}\n')],
  '関数を引いて呼ぶ': [mod('m1', 'export fn F() -> number {\n  return Math.PI;\n}\n'), mod('m0', 'use { F } from "./m1";\n' + callFn('F'))],
  '同じ名前の const を持つ別の module から引く (表は module ごと)': [
    PI,
    mod('m2', 'export const F = Math.max;\n'),
    mod('m0', 'use { F } from "./m2";\n' + callFn('F', '1, 2')),
  ],
  '引いた先で別の名前の const が値の欄を写している (表は名前ごと)': [
    mod('m1', 'export const Z: number = Math.PI;\nexport const F = Math.max;\n'),
    mod('m0', 'use { F } from "./m1";\n' + callFn('F', '1, 2')),
  ],
  '別名を付けて引いた名前と同じ綴りの、値の欄を写した const': [
    mod('m1', 'export const G: number = Math.PI;\nexport const F = Math.max;\n'),
    mod('m0', 'use { F alias G } from "./m1";\n' + callFn('G', '1, 2')),
  ],
  'Mamori でない module から引いた名前を呼ぶ': [mod('m0', 'use { F } from "./host";\n' + callFn('F'))],
  '直下の名前 (extern) で隠した同じ綴りの欄を写して呼ぶ': [mod('m0', 'extern pure { Math } from "./host";\nconst F = Math.PI;\n' + callFn('F'))],
  '後ろで宣言した直下の名前 (extern) で隠した同じ綴り': [mod('m0', 'const F = Math.max.length;\nextern pure { Math } from "./host";\n' + callFn('F'))],
  '直下の名前 (fn) で隠した同じ綴りから辿って写す': [mod('m0', 'fn Math() -> number {\n  return 1;\n}\nconst F = Math.max.length;\n' + callFn('F'))],
  '互いに写し合う 2 つの module (どちらも値の欄を読まない)': [
    mod('m1', 'use { B } from "./m2";\nexport const A: number = B;\n'),
    mod('m2', 'use { A } from "./m1";\nexport const B: number = A;\n' + callFn('B')),
  ],
};

describe('Mamori 0.57: 組み込みの値の欄を写した const を、module をまたいでも呼ばせない (MG-097)', () => {
  it('★ 別の module から引いた「値の欄を写した const」を呼ぶ形を、場所と全文つきで断る', () => {
    for (const [name, form] of Object.entries(REFUSED)) expect(diagnose(form.files), name).toEqual([form.expected]);
    expect(Object.keys(REFUSED).length).toBeGreaterThanOrEqual(13);
  });

  it('★ 同じ形を TypeScript も断る (引いた名前は、宣言した型の値 · 2349)', () => {
    expect(tsCodes('declare const F: number;\nexport function t(): unknown { return F(); }')).toEqual([2349]);
    expect(tsCodes('declare const F: string;\nexport function t(): unknown { const g = F; return g(); }')).toEqual([2349]);
    // 標本: 物差しは、通る形に番号を付けない
    expect(tsCodes('declare const F: (...xs: number[]) => number;\nexport function t(): unknown { return F(1, 2); }')).toEqual([]);
  });

  it('★ 断った形でも、引数の中は 1 度だけ検める', () => {
    const files: Files = [PI, mod('m0', 'use { F } from "./m1";\nexport fn t() -> unknown {\n  return F(F());\n}\n')];
    expect(diagnose(files)).toEqual([at('m0', 3, 10, COPIED('F', 'Math.PI')), at('m0', 3, 12, COPIED('F', 'Math.PI'))]);
  });

  it('対照: 関数の欄を写した const・読むだけの形・別の module の同じ名前・隠した同じ綴りは今までどおり通る', () => {
    for (const [name, files] of Object.entries(ACCEPTED)) expect(diagnose(files), name).toEqual([]);
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(11);
  });

  it('対照: 後ろの const の別名は運ばない —— 宣言より前で使う形 (0.46) の断り 1 つだけ', () => {
    const d = diagnose([mod('m0', 'const G: number = F;\nconst F: number = Math.PI;\n' + callFn('G'))]);
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('src/x/m0.mamori:1:19: [M6] モジュール直下の名前 F を、宣言より前で使っています');
  });

  it('対照: export していない const を引く形は、前の断り (export していない) と、呼ぶ形の断りが 1 度ずつ並ぶ', () => {
    const files: Files = [mod('m1', 'const F: number = Math.PI;\nexport const Z: number = 1;\n'), mod('m0', 'use { F } from "./m1";\n' + callFn('F'))];
    expect(diagnose(files)).toEqual([at('m0', 1, 1, NOT_EXPORTED('src/x/m1.mamori', 'F')), at('m0', 3, 10, COPIED('F', 'Math.PI'))]);
  });
});

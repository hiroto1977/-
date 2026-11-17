import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.44 —— 同じブロックの中で、同じ名前を 2 度宣言させない** (2026-11-17 · MG-084 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * 0.43 までは、同じブロックで同じ名前を 2 度宣言する形が検査器を通り、生成物を `tsc` が断っていた
 * (守りが `tsc` の 1 層だった)。対象は 3 つ:
 *
 *  1. 同じブロックの const / let / 分割代入の束縛           —— `const a = 1; const a = 2;`
 *  2. 頭 (引数・catch の束縛) と、本体の直下                 —— `fn t(a: number) { const a = 1; }` / `catch (e) { const e = 1; }`
 *  3. 同じ switch の別々の case                              —— 生成物では case の本体は 1 つのブロックを共有する
 *
 * 入れ子のブロック・for の本体・別の関数は別のブロックなので、今までどおり同じ名前を置ける (JavaScript の決まりと同じ)。
 * どの断りも TypeScript の答えと同じであることを、同じ検査の中で TypeScript に訊いて確かめる。
 */

function compile(source: string): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs][0]![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}

const at = (line: number, col: number, message: string): string => `src/x/m0.mamori:${line}:${col}: ${message}`;
const BLOCK = (name: string): string =>
  `[M6] 局所の名前 ${name} を同じブロックで 2 度宣言しています —— 引数・catch の束縛・const / let・分割代入の束縛は、同じブロックの中で名前を重ねられません (TypeScript も断ります)`;
const SWITCH = (name: string): string =>
  `[M6] 局所の名前 ${name} を同じ switch の別の case でも宣言しています —— 生成物では case の本体は 1 つのブロックを共有するので、名前を重ねられません (TypeScript も断ります)`;

/**
 * TypeScript (構文 + 意味・厳格モード・lib なし) がその綴りに付ける診断の番号。
 * lib を読まないので、配列を `for … of` で回すと 2488 (反復子が無い) が付く —— 名前の重なりとは別の話なので落とす。
 */
function tsCodes(text: string): number[] {
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.ES2022, true);
  const host = ts.createCompilerHost({});
  host.getSourceFile = (f) => (f === 'x.ts' ? sf : undefined);
  host.fileExists = (f) => f === 'x.ts';
  const program = ts.createProgram(['x.ts'], { noLib: true, strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, host);
  return [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]
    .filter((d) => !/Cannot find global type/.test(ts.flattenDiagnosticMessageText(d.messageText, ' ')))
    .map((d) => d.code)
    .filter((c) => c !== 2488);
}

/** 断る形: [Mamori の綴り, 断りの全文 (場所つき), 同じ形の TypeScript]。 */
interface Refused {
  readonly mamori: string;
  readonly diagnostics: readonly string[];
  readonly ts: string;
}

const REFUSED: Readonly<Record<string, Refused>> = {
  // 1. 同じブロックの const / let / 分割代入
  'const と const': { mamori: 'export fn t() -> number {\n  const a = 1;\n  const a = 2;\n  return a;\n}\n', diagnostics: [at(3, 3, BLOCK('a'))], ts: 'export function t(): number { const a = 1; const a = 2; return a; }' },
  'let と let': { mamori: 'export fn t() -> number {\n  let a = 1;\n  let a = 2;\n  return a;\n}\n', diagnostics: [at(3, 3, BLOCK('a'))], ts: 'export function t(): number { let a = 1; let a = 2; return a; }' },
  'const と let': { mamori: 'export fn t() -> number {\n  const a = 1;\n  let a = 2;\n  return a;\n}\n', diagnostics: [at(3, 3, BLOCK('a'))], ts: 'export function t(): number { const a = 1; let a = 2; return a; }' },
  'let と const': { mamori: 'export fn t() -> number {\n  let a = 1;\n  const a = 2;\n  return a;\n}\n', diagnostics: [at(3, 3, BLOCK('a'))], ts: 'export function t(): number { let a = 1; const a = 2; return a; }' },
  'const と分割代入': { mamori: 'export fn t(x: { a: number }) -> number {\n  const a = 1;\n  const { a } = x;\n  return a;\n}\n', diagnostics: [at(3, 3, BLOCK('a'))], ts: 'export function t(x: { a: number }): number { const a = 1; const { a } = x; return a; }' },
  '分割代入と const': { mamori: 'export fn t(x: { a: number }) -> number {\n  const { a } = x;\n  const a = 1;\n  return a;\n}\n', diagnostics: [at(3, 3, BLOCK('a'))], ts: 'export function t(x: { a: number }): number { const { a } = x; const a = 1; return a; }' },
  '分割代入どうし': { mamori: 'export fn t(x: { a: number }) -> number {\n  const { a } = x;\n  const { a } = x;\n  return a;\n}\n', diagnostics: [at(3, 3, BLOCK('a'))], ts: 'export function t(x: { a: number }): number { const { a } = x; const { a } = x; return a; }' },
  '分割代入の別名と const': { mamori: 'export fn t(x: { a: number }) -> number {\n  const { a: p } = x;\n  const p = 1;\n  return p;\n}\n', diagnostics: [at(3, 3, BLOCK('p'))], ts: 'export function t(x: { a: number }): number { const { a: p } = x; const p = 1; return p; }' },
  '間に別の文を挟む': { mamori: 'export fn t(x: boolean) -> number {\n  const a = 1;\n  if (x) {\n    return a;\n  }\n  const a = 2;\n  return a;\n}\n', diagnostics: [at(6, 3, BLOCK('a'))], ts: 'export function t(x: boolean): number { const a = 1; if (x) { return a; } const a = 2; return a; }' },
  '3 度宣言する (2 度目と 3 度目の両方)': { mamori: 'export fn t() -> number {\n  const a = 1;\n  const a = 2;\n  const a = 3;\n  return a;\n}\n', diagnostics: [at(3, 3, BLOCK('a')), at(4, 3, BLOCK('a'))], ts: 'export function t(): number { const a = 1; const a = 2; const a = 3; return a; }' },
  // 入れ子のブロックの中の重なり (どのブロックでも同じ決まり)
  'if の本体': { mamori: 'export fn t(x: boolean) -> number {\n  if (x) {\n    const a = 1;\n    const a = 2;\n    return a;\n  }\n  return 0;\n}\n', diagnostics: [at(4, 5, BLOCK('a'))], ts: 'export function t(x: boolean): number { if (x) { const a = 1; const a = 2; return a; } return 0; }' },
  'else の本体': { mamori: 'export fn t(x: boolean) -> number {\n  if (x) {\n    return 0;\n  } else {\n    const a = 1;\n    const a = 2;\n    return a;\n  }\n}\n', diagnostics: [at(6, 5, BLOCK('a'))], ts: 'export function t(x: boolean): number { if (x) { return 0; } else { const a = 1; const a = 2; return a; } }' },
  'while の本体': { mamori: 'export fn t(x: boolean) -> number {\n  while (x) {\n    const a = 1;\n    const a = 2;\n    return a;\n  }\n  return 0;\n}\n', diagnostics: [at(4, 5, BLOCK('a'))], ts: 'export function t(x: boolean): number { while (x) { const a = 1; const a = 2; return a; } return 0; }' },
  'for の本体': { mamori: 'export fn t(xs: readonly number[]) -> number {\n  for (const x of xs) {\n    const a = x;\n    const a = 2;\n    return a;\n  }\n  return 0;\n}\n', diagnostics: [at(4, 5, BLOCK('a'))], ts: 'export function t(xs: readonly number[]): number { for (const x of xs) { const a = x; const a = 2; return a; } return 0; }' },
  'try の本体': { mamori: 'export fn t() -> number {\n  try {\n    const a = 1;\n    const a = 2;\n    return a;\n  } catch {\n    return 0;\n  }\n}\n', diagnostics: [at(4, 5, BLOCK('a'))], ts: 'export function t(): number { try { const a = 1; const a = 2; return a; } catch { return 0; } }' },
  'catch の本体 (束縛なし)': { mamori: 'export fn t() -> number {\n  try {\n    return 1;\n  } catch {\n    const a = 1;\n    const a = 2;\n    return a;\n  }\n}\n', diagnostics: [at(6, 5, BLOCK('a'))], ts: 'export function t(): number { try { return 1; } catch { const a = 1; const a = 2; return a; } }' },
  'finally の本体': { mamori: 'export fn t() -> number {\n  try {\n    return 1;\n  } finally {\n    const a = 1;\n    const a = 2;\n  }\n}\n', diagnostics: [at(6, 5, BLOCK('a'))], ts: 'export function t(): number { try { return 1; } finally { const a = 1; const a = 2; } }' },
  'arrow のブロックの本体': { mamori: 'export fn t() -> number {\n  const f = () => {\n    const a = 1;\n    const a = 2;\n    return a;\n  };\n  return f();\n}\n', diagnostics: [at(4, 5, BLOCK('a'))], ts: 'export function t(): number { const f = () => { const a = 1; const a = 2; return a; }; return f(); }' },
  '同じ case の中': { mamori: 'export fn t(x: number) -> number {\n  switch (x) {\n    case 1:\n      const a = 1;\n      const a = 2;\n      return a;\n    default:\n      return 2;\n  }\n}\n', diagnostics: [at(5, 7, BLOCK('a'))], ts: 'export function t(x: number): number { switch (x) { case 1: const a = 1; const a = 2; return a; default: return 2; } }' },
  // 2. 頭 (引数・catch の束縛) と、本体の直下
  '引数と const': { mamori: 'export fn t(a: number) -> number {\n  const a = 1;\n  return a;\n}\n', diagnostics: [at(2, 3, BLOCK('a'))], ts: 'export function t(a: number): number { const a = 1; return a; }' },
  '引数と let': { mamori: 'export fn t(a: number) -> number {\n  let a = 1;\n  return a;\n}\n', diagnostics: [at(2, 3, BLOCK('a'))], ts: 'export function t(a: number): number { let a = 1; return a; }' },
  '2 つ目の引数と const': { mamori: 'export fn t(x: number, a: number) -> number {\n  const a = x;\n  return a;\n}\n', diagnostics: [at(2, 3, BLOCK('a'))], ts: 'export function t(x: number, a: number): number { const a = x; return a; }' },
  '引数と分割代入': { mamori: 'export fn t(x: { a: number }, a: number) -> number {\n  const { a } = x;\n  return a;\n}\n', diagnostics: [at(2, 3, BLOCK('a'))], ts: 'export function t(x: { a: number }, a: number): number { const { a } = x; return a; }' },
  'async fn の引数と const': { mamori: 'export async fn t(a: number) -> Promise<number> {\n  const a = 1;\n  return a;\n}\n', diagnostics: [at(2, 3, BLOCK('a'))], ts: 'export function t(a: number): number { const a = 1; return a; }' },
  'arrow の引数と const': { mamori: 'export fn t() -> number {\n  const f = (a: number) => {\n    const a = 1;\n    return a;\n  };\n  return f(1);\n}\n', diagnostics: [at(3, 5, BLOCK('a'))], ts: 'export function t(): number { const f = (a: number) => { const a = 1; return a; }; return f(1); }' },
  'arrow の引数と分割代入': { mamori: 'export fn t(x: { a: number }) -> number {\n  const f = (a: number) => {\n    const { a } = x;\n    return a;\n  };\n  return f(1);\n}\n', diagnostics: [at(3, 5, BLOCK('a'))], ts: 'export function t(x: { a: number }): number { const f = (a: number) => { const { a } = x; return a; }; return f(1); }' },
  'catch の束縛と const': { mamori: 'export fn t() -> number {\n  try {\n    return 1;\n  } catch (e) {\n    const e = 2;\n    return e;\n  }\n}\n', diagnostics: [at(5, 5, BLOCK('e'))], ts: 'export function t(): number { try { return 1; } catch (e) { const e = 2; return e; } }' },
  'catch の束縛と let': { mamori: 'export fn t() -> number {\n  try {\n    return 1;\n  } catch (e) {\n    let e = 2;\n    return e;\n  }\n}\n', diagnostics: [at(5, 5, BLOCK('e'))], ts: 'export function t(): number { try { return 1; } catch (e) { let e = 2; return e; } }' },
  'catch の束縛と分割代入': { mamori: 'export fn t(x: { e: number }) -> number {\n  try {\n    return 1;\n  } catch (e) {\n    const { e } = x;\n    return e;\n  }\n}\n', diagnostics: [at(5, 5, BLOCK('e'))], ts: 'export function t(x: { e: number }): number { try { return 1; } catch (e) { const { e } = x; return e; } }' },
  // 3. 同じ switch の別々の case
  'case と default': { mamori: 'export fn t(x: number) -> number {\n  switch (x) {\n    case 1:\n      const a = 1;\n      return a;\n    default:\n      const a = 2;\n      return a;\n  }\n}\n', diagnostics: [at(7, 7, SWITCH('a'))], ts: 'export function t(x: number): number { switch (x) { case 1: const a = 1; return a; default: const a = 2; return a; } }' },
  'case と case (let)': { mamori: 'export fn t(x: number) -> number {\n  switch (x) {\n    case 1:\n      let a = 1;\n      return a;\n    case 2:\n      let a = 2;\n      return a;\n    default:\n      return 0;\n  }\n}\n', diagnostics: [at(7, 7, SWITCH('a'))], ts: 'export function t(x: number): number { switch (x) { case 1: let a = 1; return a; case 2: let a = 2; return a; default: return 0; } }' },
  'case と case (分割代入)': { mamori: 'export fn t(x: number, o: { a: number }) -> number {\n  switch (x) {\n    case 1:\n      const { a } = o;\n      return a;\n    case 2:\n      const { a } = o;\n      return a;\n    default:\n      return 0;\n  }\n}\n', diagnostics: [at(7, 7, SWITCH('a'))], ts: 'export function t(x: number, o: { a: number }): number { switch (x) { case 1: const { a } = o; return a; case 2: const { a } = o; return a; default: return 0; } }' },
  'case の const と別の case の分割代入の別名': { mamori: 'export fn t(x: number, o: { b: number }) -> number {\n  switch (x) {\n    case 1:\n      const a = 1;\n      return a;\n    default:\n      const { b: a } = o;\n      return a;\n  }\n}\n', diagnostics: [at(7, 7, SWITCH('a'))], ts: 'export function t(x: number, o: { b: number }): number { switch (x) { case 1: const a = 1; return a; default: const { b: a } = o; return a; } }' },
  '1 つ目と 3 つ目の case': { mamori: 'export fn t(x: number) -> number {\n  switch (x) {\n    case 1:\n      const a = 1;\n      return a;\n    case 2:\n      return 2;\n    default:\n      const a = 3;\n      return a;\n  }\n}\n', diagnostics: [at(9, 7, SWITCH('a'))], ts: 'export function t(x: number): number { switch (x) { case 1: const a = 1; return a; case 2: return 2; default: const a = 3; return a; } }' },
  '3 つの case すべて (2 つ目と 3 つ目の両方)': { mamori: 'export fn t(x: number) -> number {\n  switch (x) {\n    case 1:\n      const a = 1;\n      return a;\n    case 2:\n      const a = 2;\n      return a;\n    default:\n      const a = 3;\n      return a;\n  }\n}\n', diagnostics: [at(7, 7, SWITCH('a')), at(10, 7, SWITCH('a'))], ts: 'export function t(x: number): number { switch (x) { case 1: const a = 1; return a; case 2: const a = 2; return a; default: const a = 3; return a; } }' },
};

/** 受け取る形 (別々のブロック): [Mamori の綴り, 同じ形の TypeScript]。 */
const ACCEPTED: Readonly<Record<string, readonly [string, string]>> = {
  '入れ子の if が外の const と同じ名前': ['export fn t(x: boolean) -> number {\n  const a = 1;\n  if (x) {\n    const a = 2;\n    return a;\n  }\n  return a;\n}\n', 'export function t(x: boolean): number { const a = 1; if (x) { const a = 2; return a; } return a; }'],
  '入れ子の if が引数と同じ名前': ['export fn t(a: number, x: boolean) -> number {\n  if (x) {\n    const a = 2;\n    return a;\n  }\n  return a;\n}\n', 'export function t(a: number, x: boolean): number { if (x) { const a = 2; return a; } return a; }'],
  'if と else がそれぞれ同じ名前': ['export fn t(x: boolean) -> number {\n  if (x) {\n    const a = 1;\n    return a;\n  } else {\n    const a = 2;\n    return a;\n  }\n}\n', 'export function t(x: boolean): number { if (x) { const a = 1; return a; } else { const a = 2; return a; } }'],
  'try と catch と finally がそれぞれ同じ名前': ['export fn t() -> number {\n  try {\n    const a = 1;\n    return a;\n  } catch {\n    const a = 2;\n    return a;\n  } finally {\n    const a = 3;\n  }\n}\n', 'export function t(): number { try { const a = 1; return a; } catch { const a = 2; return a; } finally { const a = 3; } }'],
  'catch の束縛を handler で読む': ['export fn t() -> number {\n  try {\n    return 1;\n  } catch (e) {\n    throw e;\n  }\n}\n', 'export function t(): number { try { return 1; } catch (e) { throw e; } }'],
  'catch の束縛と、handler の入れ子の同じ名前': ['export fn t(x: boolean) -> number {\n  try {\n    return 1;\n  } catch (e) {\n    if (x) {\n      const e = 2;\n      return e;\n    }\n    return 0;\n  }\n}\n', 'export function t(x: boolean): number { try { return 1; } catch (e) { if (x) { const e = 2; return e; } return 0; } }'],
  'catch の束縛が外の const と同じ名前': ['export fn t() -> number {\n  const e = 1;\n  try {\n    return e;\n  } catch (e) {\n    throw e;\n  }\n}\n', 'export function t(): number { const e = 1; try { return e; } catch (e) { throw e; } }'],
  'for の回す変数と、本体の同じ名前': ['export fn t(xs: readonly number[]) -> number {\n  for (const x of xs) {\n    const x = 1;\n    return x;\n  }\n  return 0;\n}\n', 'export function t(xs: readonly number[]): number { for (const x of xs) { const x = 1; return x; } return 0; }'],
  'for の回す変数が外の const と同じ名前': ['export fn t(xs: readonly number[]) -> number {\n  const x = 0;\n  for (const x of xs) {\n    return x;\n  }\n  return x;\n}\n', 'export function t(xs: readonly number[]): number { const x = 0; for (const x of xs) { return x; } return x; }'],
  'arrow の引数が外の const と同じ名前': ['export fn t() -> number {\n  const a = 1;\n  const f = (a: number) => a;\n  return f(a);\n}\n', 'export function t(): number { const a = 1; const f = (a: number) => a; return f(a); }'],
  'arrow の本体が外の const と同じ名前を置き、外の別の名前を読む': ['export fn t() -> number {\n  const a = 1;\n  const b = 10;\n  const f = (p: number) => {\n    const a = 2;\n    return a + b + p;\n  };\n  return f(1) + a;\n}\n', 'export function t(): number { const a = 1; const b = 10; const f = (p: number) => { const a = 2; return a + b + p; }; return f(1) + a; }'],
  'case の const が外の const と同じ名前': ['export fn t(x: number) -> number {\n  const a = 0;\n  switch (x) {\n    case 1:\n      const a = 1;\n      return a;\n    default:\n      return 2;\n  }\n}\n', 'export function t(x: number): number { const a = 0; switch (x) { case 1: const a = 1; return a; default: return 2; } }'],
  '別々の case が別々の名前を宣言する': ['export fn t(x: number, o: { c: number }) -> number {\n  switch (x) {\n    case 1:\n      const a = 1;\n      return a;\n    case 2:\n      let b = 2;\n      return b;\n    default:\n      const { c } = o;\n      return c;\n  }\n}\n', 'export function t(x: number, o: { c: number }): number { switch (x) { case 1: const a = 1; return a; case 2: let b = 2; return b; default: const { c } = o; return c; } }'],
  'case の const と、別の case の入れ子の同じ名前': ['export fn t(x: number, y: boolean) -> number {\n  switch (x) {\n    case 1:\n      const a = 1;\n      return a;\n    default:\n      if (y) {\n        const a = 2;\n        return a;\n      }\n      return 0;\n  }\n}\n', 'export function t(x: number, y: boolean): number { switch (x) { case 1: const a = 1; return a; default: if (y) { const a = 2; return a; } return 0; } }'],
  '2 つの switch がそれぞれ同じ名前': ['export fn t(x: number) -> number {\n  switch (x) {\n    case 1:\n      const a = 1;\n      return a;\n    default:\n      break;\n  }\n  switch (x) {\n    case 2:\n      const a = 2;\n      return a;\n    default:\n      return 0;\n  }\n}\n', 'export function t(x: number): number { switch (x) { case 1: const a = 1; return a; default: break; } switch (x) { case 2: const a = 2; return a; default: return 0; } }'],
  '2 つの関数がそれぞれ同じ名前': ['export fn t(a: number) -> number {\n  const b = a;\n  return b;\n}\nexport fn u(a: number) -> number {\n  const b = a + 1;\n  return b;\n}\n', 'export function t(a: number): number { const b = a; return b; } export function u(a: number): number { const b = a + 1; return b; }'],
  '引数を本体の直下で読んで別の名前に置く': ['export fn t(a: number) -> number {\n  const b = a;\n  let c = b;\n  c = c + a;\n  return c;\n}\n', 'export function t(a: number): number { const b = a; let c = b; c = c + a; return c; }'],
};

describe('0.44: 同じブロックの中で、同じ名前を 2 度宣言させない (MG-084)', () => {
  it('★ 同じブロック・頭と本体・同じ switch の別の case で、重なった宣言を断る (場所と文は全文で一致)', () => {
    expect(Object.keys(REFUSED).length).toBeGreaterThanOrEqual(35);
    for (const [label, c] of Object.entries(REFUSED)) expect(compile(c.mamori).diagnostics, label).toEqual(c.diagnostics);
    // 2 つの断りの文が、どちらも使われている (片方の決まりを落としても、この検査が通ってしまわないこと)
    const all = Object.values(REFUSED).flatMap((c) => c.diagnostics);
    expect(all.filter((d) => d.includes('同じブロックで 2 度宣言しています')).length).toBeGreaterThanOrEqual(30);
    expect(all.filter((d) => d.includes('同じ switch の別の case でも宣言しています')).length).toBeGreaterThanOrEqual(7);
  });

  it('★ TypeScript も同じ形を断り、受け取る形には診断を付けない (この決まりが TypeScript より広くも狭くもない)', () => {
    for (const [label, c] of Object.entries(REFUSED)) expect(tsCodes(c.ts).length, label).toBeGreaterThan(0);
    for (const [label, [, t]] of Object.entries(ACCEPTED)) expect(tsCodes(t), label).toEqual([]);
  });

  it('★ 受け取る形の生成物を TypeScript に掛けても、診断は付かない (検めた物と走る物が同じ答え)', () => {
    for (const [label, [src]] of Object.entries(ACCEPTED)) {
      const r = compile(src);
      expect(r.ok, label).toBe(true);
      expect(tsCodes(r.emitted), label).toEqual([]);
    }
  });

  it('対照: 別々のブロックの同じ名前は今までどおり受け取り、生成物の形も変わらない', () => {
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(17);
    for (const [label, [src]] of Object.entries(ACCEPTED)) {
      const r = compile(src);
      expect(r.diagnostics, label).toEqual([]);
      expect(shapeMismatch('src/x/m0.mamori', src, r.emitted), label).toEqual([]);
    }
  });

  it('対照: 直下の名前を隠す断り (T-251) は前の文のまま答え、重なりの断りはその後ろに並ぶ', () => {
    const HIDES = '[M6] 局所の名前 k は、モジュール直下の同名の宣言 (use・extern・fn・定数) を隠します —— 呼び出しの外形 (印) は名前で引くので、別の名前にしてください';
    const src = 'const k: number = 1;\nexport fn t() -> number {\n  const k = 2;\n  const k = 3;\n  return k;\n}\n';
    expect(compile(src).diagnostics).toEqual([at(3, 3, HIDES), at(4, 3, HIDES), at(4, 3, BLOCK('k'))]);
  });

  it('対照: 同じ並びの重なり (0.43 · 構文の段) は、ブロックの重なりより先に答える', () => {
    // 引数の並びの重なりは構文の段で止まり、検査器まで届かない
    const d = compile('export fn t(a: number, a: number) -> number {\n  const a = 1;\n  return a;\n}\n').diagnostics;
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('[M0] 引数 `a` が二重です');
    // 1 つの分割代入の中の重なりも同じ
    const e = compile('export fn t(x: { a: number }) -> number {\n  const { a, a } = x;\n  const a = 1;\n  return a;\n}\n').diagnostics;
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('[M0] 分割代入の束縛 `a` が二重です');
  });

  it('対照: 頭と本体を 1 つのブロックにしても、引数と束ねた例外の扱いは変わらない (印・代入の断り)', () => {
    // 引数への代入は今までどおり断る (引数は let ではない)
    const assign = compile('export fn t(a: number) -> number {\n  a = 2;\n  return a;\n}\n').diagnostics;
    expect(assign).toHaveLength(1);
    expect(assign[0]).toContain('src/x/m0.mamori:2:3: [M');
    // 宣言していない名前は、頭と本体を 1 つにしても見つからないまま
    const undeclared = compile('export fn t(a: number) -> number {\n  return a + b;\n}\n').diagnostics;
    expect(undeclared).toHaveLength(1);
    expect(undeclared[0]).toContain('b');
    // 束ねた例外は handler の外では見えない
    const outside = compile('export fn t() -> number {\n  try {\n    return 1;\n  } catch (e) {\n    return 0;\n  } finally {\n    const x = e;\n  }\n}\n').diagnostics;
    expect(outside).toHaveLength(1);
    expect(outside[0]).toContain('src/x/m0.mamori:7:15: [M');
    // arrow の引数は arrow の外では見えない
    const arrow = compile('export fn t() -> number {\n  const f = (p: number) => {\n    return p;\n  };\n  return f(1) + p;\n}\n').diagnostics;
    expect(arrow).toHaveLength(1);
    expect(arrow[0]).toContain('src/x/m0.mamori:5:17: [M');
  });
});

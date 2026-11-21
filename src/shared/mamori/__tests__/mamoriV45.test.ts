import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.45 —— 同じブロックの宣言より前で、名前を使わせない** (2026-11-17 · MG-085 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * JavaScript のブロックの const / let は、ブロックの先頭から見え、宣言の文に届くまでは読むと投げる。
 * 0.44 までの検査器は、宣言の文に届く前の名前を「無い物」として外側へ引きに行っていた —— 外側に同じ名前が在ると
 * 検査器はそちらを読み、生成物は内側の宣言を指す (`tsc` は 2448 / 2454 で断る)。守りが `tsc` の 1 層で、
 * しかも検査器と生成物が、同じ綴りで別の束縛を見ていた。0.45 は 2 つの形を断る:
 *
 *  1. 同じブロックの宣言より前で使う              —— `const y = x; const x = 2;` (読む・呼ぶ・構築する・代入する・`instanceof`)
 *  2. 同じ switch の別の場所が宣言する名前を使う  —— 生成物では case の値と全部の case の本体が 1 つのブロックを共有する
 *
 * どちらも、入れ子のブロック・arrow の本体の中から使う形を含む (その名前を持つ、より内側のブロックが無いかぎり)。
 * arrow の中から後の宣言を読む形は TypeScript が通す (閉包は後で呼ぶかもしれない) が、検査器は本体を宣言の順に 1 度しか検めず、
 * 外側の同じ名前で答えることになるので、Mamori は断る (TypeScript より厳しい側)。
 */

function compile(source: string): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs][0]![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}

const at = (line: number, col: number, message: string): string => `src/x/m0.mamori:${line}:${col}: ${message}`;
const BEFORE = (name: string): string =>
  `[M6] 局所の名前 ${name} を、同じブロックの宣言より前で使っています —— 生成物ではこのブロックの ${name} を指すので、外側の同じ名前は読めず、宣言の文より前に走ると実行時に投げます (使うのは宣言の文の後にします)`;
const ACROSS = (name: string): string =>
  `[M6] 局所の名前 ${name} は、同じ switch の case の本体が宣言しています —— 生成物では case の値と全部の case の本体が 1 つのブロックを共有するので、ここで使うと外側の同じ名前ではなくその宣言を指し、宣言の文を通っていなければ実行時に投げます (名前を変えるか、switch の外で宣言します)`;
const REDECLARED = (name: string): string =>
  `[M6] 局所の名前 ${name} を同じブロックで 2 度宣言しています —— 引数・catch の束縛・const / let・分割代入の束縛は、同じブロックの中で名前を重ねられません (TypeScript も断ります)`;
const REDECLARED_IN_SWITCH = (name: string): string =>
  `[M6] 局所の名前 ${name} を同じ switch の別の case でも宣言しています —— 生成物では case の本体は 1 つのブロックを共有するので、名前を重ねられません (TypeScript も断ります)`;
const HIDES = (name: string): string =>
  `[M6] 局所の名前 ${name} は、モジュール直下の同名の宣言 (use・extern・fn・定数) を隠します —— 呼び出しの外形 (印) は名前で引くので、別の名前にしてください`;
const UNDECLARED = (name: string): string => `[M6] 宣言していない名前 ${name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`;

/**
 * TypeScript (構文 + 意味・厳格モード・lib なし) がその綴りに付ける診断の番号。
 * lib を読まないので、組み込み (`Math` / `Map` ほか) とそのメンバには別の番号 (2304 / 2339 / 2351 / 7053) も付く ——
 * 見るのは宣言の順の番号 (2448 = 宣言より前で使った・2454 = 代入の前に使った) だけ。
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

/** 宣言の順の番号 (TypeScript が「宣言より前で使った」「代入の前に使った」と断る)。 */
const ORDER_CODES: readonly number[] = [2448, 2454];
const orderCodes = (text: string): number[] => tsCodes(text).filter((c) => ORDER_CODES.includes(c));

/** 断る形: [Mamori の綴り, 断りの全文 (場所つき), 同じ形の TypeScript]。 */
interface Refused {
  readonly mamori: string;
  readonly diagnostics: readonly string[];
  readonly ts: string;
}

/** TypeScript も断る形 (2448 / 2454)。 */
const REFUSED: Readonly<Record<string, Refused>> = {
  '外に同じ名前が無い (0.44 までは「宣言していない名前」)': { mamori: 'export fn t() -> number {\n  const a = b;\n  const b = 1;\n  return a;\n}\n', diagnostics: [at(2, 13, BEFORE('b'))], ts: 'export function t(): number { const a = b; const b = 1; return a; }' },
  '引数を読んでから、入れ子のブロックで同じ名前を宣言': { mamori: 'export fn t(x: number) -> number {\n  if (x > 0) {\n    const y = x;\n    const x = 2;\n    return y + x;\n  }\n  return 0;\n}\n', diagnostics: [at(3, 15, BEFORE('x'))], ts: 'export function t(x: number): number { if (x > 0) { const y = x; const x = 2; return y + x; } return 0; }' },
  '外側の const を読んでから、入れ子で同じ名前を宣言': { mamori: 'export fn t(c: boolean) -> number {\n  const x = 1;\n  if (c) {\n    const y = x;\n    const x = 2;\n    return y + x;\n  }\n  return x;\n}\n', diagnostics: [at(4, 15, BEFORE('x'))], ts: 'export function t(c: boolean): number { const x = 1; if (c) { const y = x; const x = 2; return y + x; } return x; }' },
  '自分の初期値で自分を読む': { mamori: 'export fn t(x: number) -> number {\n  if (x > 0) {\n    const x = x + 1;\n    return x;\n  }\n  return 0;\n}\n', diagnostics: [at(3, 15, BEFORE('x'))], ts: 'export function t(x: number): number { if (x > 0) { const x = x + 1; return x; } return 0; }' },
  'let の宣言より前に代入する': { mamori: 'export fn t(c: boolean) -> number {\n  let x = 1;\n  if (c) {\n    x = 5;\n    let x = 2;\n    return x;\n  }\n  return x;\n}\n', diagnostics: [at(4, 5, BEFORE('x'))], ts: 'export function t(c: boolean): number { let x = 1; if (c) { x = 5; let x = 2; return x; } return x; }' },
  '入れ子のブロックの中から、外側のブロックの後の宣言を読む': { mamori: 'export fn t(x: number) -> number {\n  if (x > 0) {\n    if (x > 1) {\n      return x;\n    }\n    const x = 2;\n    return x;\n  }\n  return 0;\n}\n', diagnostics: [at(3, 9, BEFORE('x')), at(4, 14, BEFORE('x'))], ts: 'export function t(x: number): number { if (x > 0) { if (x > 1) { return x; } const x = 2; return x; } return 0; }' },
  'for の本体で、回す変数を読んでから同じ名前を宣言': { mamori: 'export fn t(xs: readonly number[]) -> number {\n  for (const x of xs) {\n    const y = x;\n    const x = 2;\n    return y + x;\n  }\n  return 0;\n}\n', diagnostics: [at(3, 15, BEFORE('x'))], ts: 'export function t(xs: readonly number[]): number { for (const x of xs) { const y = x; const x = 2; return y + x; } return 0; }' },
  'while の本体': { mamori: 'export fn t(x: number) -> number {\n  while (x > 0) {\n    const y = x;\n    const x = 0;\n    return y + x;\n  }\n  return 1;\n}\n', diagnostics: [at(3, 15, BEFORE('x'))], ts: 'export function t(x: number): number { while (x > 0) { const y = x; const x = 0; return y + x; } return 1; }' },
  'try の本体': { mamori: 'export fn t(x: number) -> number {\n  try {\n    const y = x;\n    const x = 2;\n    return y + x;\n  } catch {\n    return 0;\n  }\n}\n', diagnostics: [at(3, 15, BEFORE('x'))], ts: 'export function t(x: number): number { try { const y = x; const x = 2; return y + x; } catch { return 0; } }' },
  'catch の本体': { mamori: 'export fn t(x: number) -> number {\n  try {\n    return 1;\n  } catch (e) {\n    const y = x;\n    const x = 2;\n    return y + x;\n  }\n}\n', diagnostics: [at(5, 15, BEFORE('x'))], ts: 'export function t(x: number): number { try { return 1; } catch (e) { const y = x; const x = 2; return y + x; } }' },
  'finally の本体': { mamori: 'export fn t(x: number) -> number {\n  try {\n    return 1;\n  } finally {\n    const y = x;\n    const x = 2;\n  }\n}\n', diagnostics: [at(5, 15, BEFORE('x'))], ts: 'export function t(x: number): number { try { return 1; } finally { const y = x; const x = 2; } }' },
  'else の本体': { mamori: 'export fn t(x: number) -> number {\n  if (x > 0) {\n    return 1;\n  } else {\n    const y = x;\n    const x = 2;\n    return y + x;\n  }\n}\n', diagnostics: [at(5, 15, BEFORE('x'))], ts: 'export function t(x: number): number { if (x > 0) { return 1; } else { const y = x; const x = 2; return y + x; } }' },
  'arrow のブロックの本体': { mamori: 'export fn t(x: number) -> number {\n  const f = () => {\n    const y = x;\n    const x = 2;\n    return y + x;\n  };\n  return f();\n}\n', diagnostics: [at(3, 15, BEFORE('x'))], ts: 'export function t(x: number): number { const f = () => { const y = x; const x = 2; return y + x; }; return f(); }' },
  '分割代入の元': { mamori: 'export fn t(o: { a: number }) -> number {\n  if (o.a > 0) {\n    const { a } = o;\n    const o = { a: 2 };\n    return a + o.a;\n  }\n  return 0;\n}\n', diagnostics: [at(3, 19, BEFORE('o'))], ts: 'export function t(o: { a: number }): number { if (o.a > 0) { const { a } = o; const o = { a: 2 }; return a + o.a; } return 0; }' },
  '分割代入の束縛を、宣言より前に読む': { mamori: 'export fn t(o: { a: number }, a: number) -> number {\n  if (a > 0) {\n    const y = a;\n    const { a } = o;\n    return y + a;\n  }\n  return 0;\n}\n', diagnostics: [at(3, 15, BEFORE('a'))], ts: 'export function t(o: { a: number }, a: number): number { if (a > 0) { const y = a; const { a } = o; return y + a; } return 0; }' },
  '欄への代入': { mamori: 'export fn t(c: boolean) -> number {\n  const o = { a: 1 };\n  if (c) {\n    o.a = 3;\n    const o = { a: 2 };\n    return o.a;\n  }\n  return o.a;\n}\n', diagnostics: [at(4, 5, BEFORE('o'))], ts: 'export function t(c: boolean): number { const o = { a: 1 }; if (c) { o.a = 3; const o = { a: 2 }; return o.a; } return o.a; }' },
  '添字への代入': { mamori: 'export fn t(c: boolean) -> number {\n  const xs = [1];\n  if (c) {\n    xs[0] = 3;\n    const xs = [2];\n    return xs[0];\n  }\n  return xs[0];\n}\n', diagnostics: [at(4, 5, BEFORE('xs'))], ts: 'export function t(c: boolean): number { const xs = [1]; if (c) { xs[0] = 3; const xs = [2]; return xs[0]; } return xs[0]; }' },
  '名前を直に呼ぶ': { mamori: 'export fn t(c: boolean) -> number {\n  const f = () => 1;\n  if (c) {\n    const v = f();\n    const f = () => 2;\n    return v + f();\n  }\n  return f();\n}\n', diagnostics: [at(4, 15, BEFORE('f'))], ts: 'export function t(c: boolean): number { const f = () => 1; if (c) { const v = f(); const f = () => 2; return v + f(); } return f(); }' },
  'メンバを呼ぶ (受け手が後の宣言)': { mamori: 'export fn t(s: string) -> number {\n  if (s.length > 0) {\n    const n = s.trim().length;\n    const s = "x";\n    return n + s.length;\n  }\n  return 0;\n}\n', diagnostics: [at(3, 15, BEFORE('s'))], ts: 'export function t(s: string): number { if (s.length > 0) { const n = s.trim().length; const s = "x"; return n + s.length; } return 0; }' },
  'メンバを読む (受け手が後の宣言)': { mamori: 'export fn t(o: { a: number }, c: boolean) -> number {\n  if (c) {\n    const n = o.a;\n    const o = { a: 2 };\n    return n + o.a;\n  }\n  return 0;\n}\n', diagnostics: [at(3, 15, BEFORE('o'))], ts: 'export function t(o: { a: number }, c: boolean): number { if (c) { const n = o.a; const o = { a: 2 }; return n + o.a; } return 0; }' },
  '書き換えるメソッドの受け手 (断りは使う場所の 1 つだけ —— 外側の同じ名前の束縛では答えない)': { mamori: 'export fn t(xs: number[]) -> number {\n  if (xs.length > 0) {\n    xs.push(1);\n    const xs = [2];\n    return xs.length;\n  }\n  return 0;\n}\n', diagnostics: [at(3, 5, BEFORE('xs'))], ts: 'export function t(xs: number[]): number { if (xs.length > 0) { xs.push(1); const xs = [2]; return xs.length; } return 0; }' },
  '組み込みの名前のメンバを呼んでから、その名前を宣言': { mamori: 'export fn t() -> number {\n  const n = Math.floor(1.5);\n  const Math = 2;\n  return n + Math;\n}\n', diagnostics: [at(2, 13, BEFORE('Math'))], ts: 'export function t(): number { const n = Math.floor(1.5); const Math = 2; return n + Math; }' },
  '組み込みの名前のメンバを読んでから、その名前を宣言': { mamori: 'export fn t() -> number {\n  const n = Number.MAX_SAFE_INTEGER;\n  const Number = 2;\n  return n + Number;\n}\n', diagnostics: [at(2, 13, BEFORE('Number'))], ts: 'export function t(): number { const n = Number.MAX_SAFE_INTEGER; const Number = 2; return n + Number; }' },
  '組み込みを構築してから、その名前を宣言': { mamori: 'export fn t() -> number {\n  const m = new Map<string, number>();\n  const Map = 2;\n  return m.size + Map;\n}\n', diagnostics: [at(2, 17, BEFORE('Map'))], ts: 'export function t(): number { const m = new Map<string, number>(); const Map = 2; return m.size + Map; }' },
  '局所の名前を構築してから、その名前を宣言 (断りは 1 つだけ —— 構築子を名前の枝でもう 1 度検めない)': { mamori: 'export fn t(make: number, c: boolean) -> number {\n  if (c) {\n    const v = new make();\n    const make = 2;\n    return make;\n  }\n  return 0;\n}\n', diagnostics: [at(3, 19, BEFORE('make'))], ts: 'export function t(make: number, c: boolean): number { if (c) { const v = new make(); const make = 2; return make; } return 0; }' },
  'instanceof の右辺': { mamori: 'export fn t(e: unknown) -> number {\n  const hit = e instanceof Error;\n  const Error = 2;\n  return hit ? Error : 0;\n}\n', diagnostics: [at(2, 28, BEFORE('Error'))], ts: 'export function t(e: unknown): number { const hit = e instanceof Error; const Error = 2; return hit ? Error : 0; }' },
  '1 つの文で 2 度使う (2 つとも断る)': { mamori: 'export fn t(x: number) -> number {\n  if (x > 0) {\n    const y = x + x;\n    const x = 2;\n    return y + x;\n  }\n  return 0;\n}\n', diagnostics: [at(3, 15, BEFORE('x')), at(3, 19, BEFORE('x'))], ts: 'export function t(x: number): number { if (x > 0) { const y = x + x; const x = 2; return y + x; } return 0; }' },
  '構築の引数の中でも使う (呼ぶ側と引数の両方)': { mamori: 'export fn t(x: number) -> number {\n  if (x > 0) {\n    const m = new Map<number, number>([[x, 1]]);\n    const Map = 2;\n    const x = 3;\n    return m.size + Map + x;\n  }\n  return 0;\n}\n', diagnostics: [at(3, 19, BEFORE('Map')), at(3, 41, BEFORE('x'))], ts: 'export function t(x: number): number { if (x > 0) { const m = new Map<number, number>([[x, 1]]); const Map = 2; const x = 3; return m.size + Map + x; } return 0; }' },
  '呼び出しの引数の中でも使う (呼ぶ側と引数の両方)': { mamori: 'export fn t(x: number) -> number {\n  const f = (n: number) => n;\n  if (x > 0) {\n    const v = f(x);\n    const f = (n: number) => n + 1;\n    const x = 3;\n    return v + f(x);\n  }\n  return 0;\n}\n', diagnostics: [at(4, 15, BEFORE('f')), at(4, 17, BEFORE('x'))], ts: 'export function t(x: number): number { const f = (n: number) => n; if (x > 0) { const v = f(x); const f = (n: number) => n + 1; const x = 3; return v + f(x); } return 0; }' },
  '欄への代入の値の中でも使う (相手と値の両方)': { mamori: 'export fn t(x: number) -> number {\n  const o = { a: 1 };\n  if (x > 0) {\n    o.a = x;\n    const o = { a: 2 };\n    const x = 3;\n    return o.a + x;\n  }\n  return o.a;\n}\n', diagnostics: [at(4, 5, BEFORE('o')), at(4, 11, BEFORE('x'))], ts: 'export function t(x: number): number { const o = { a: 1 }; if (x > 0) { o.a = x; const o = { a: 2 }; const x = 3; return o.a + x; } return o.a; }' },
  '代入の値の中でも使う (値が先・相手が後)': { mamori: 'export fn t(x: number) -> number {\n  let v = 1;\n  if (x > 0) {\n    v = x;\n    let v = 2;\n    const x = 3;\n    return v + x;\n  }\n  return v;\n}\n', diagnostics: [at(4, 9, BEFORE('x')), at(4, 5, BEFORE('v'))], ts: 'export function t(x: number): number { let v = 1; if (x > 0) { v = x; let v = 2; const x = 3; return v + x; } return v; }' },
  'switch: 後の case が宣言する名前を、前の case が読む': { mamori: 'export fn t(x: number) -> number {\n  switch (x) {\n    case 1:\n      return x;\n    default:\n      const x = 2;\n      return x;\n  }\n}\n', diagnostics: [at(4, 14, ACROSS('x'))], ts: 'export function t(x: number): number { switch (x) { case 1: return x; default: const x = 2; return x; } }' },
  'switch: 前の case が宣言した名前を、後の case が読む': { mamori: 'export fn t(x: number) -> number {\n  switch (x) {\n    case 1:\n      const x = 2;\n      return x;\n    default:\n      return x;\n  }\n}\n', diagnostics: [at(7, 14, ACROSS('x'))], ts: 'export function t(x: number): number { switch (x) { case 1: const x = 2; return x; default: return x; } }' },
  'switch: case の値が、本体の宣言する名前を読む': { mamori: 'export fn t(x: number, k: number) -> number {\n  switch (x) {\n    case k:\n      const k = 2;\n      return k;\n    default:\n      return 0;\n  }\n}\n', diagnostics: [at(3, 10, ACROSS('k'))], ts: 'export function t(x: number, k: number): number { switch (x) { case k: const k = 2; return k; default: return 0; } }' },
  'switch: 後の case の値が、前の case の宣言する名前を読む': { mamori: 'export fn t(x: number, k: number) -> number {\n  switch (x) {\n    case 1:\n      const k = 2;\n      return k;\n    case k:\n      return 3;\n    default:\n      return 0;\n  }\n}\n', diagnostics: [at(6, 10, ACROSS('k'))], ts: 'export function t(x: number, k: number): number { switch (x) { case 1: const k = 2; return k; case k: return 3; default: return 0; } }' },
  'switch: 同じ case の中で、宣言より前に読む': { mamori: 'export fn t(x: number, k: number) -> number {\n  switch (x) {\n    case 1:\n      const y = k;\n      const k = 2;\n      return y + k;\n    default:\n      return 0;\n  }\n}\n', diagnostics: [at(4, 17, BEFORE('k'))], ts: 'export function t(x: number, k: number): number { switch (x) { case 1: const y = k; const k = 2; return y + k; default: return 0; } }' },
  'switch: 外に同じ名前が無い別の case の名前 (0.44 までは「宣言していない名前」)': { mamori: 'export fn t(x: number) -> number {\n  switch (x) {\n    case 1:\n      const a = 2;\n      return a;\n    default:\n      return a;\n  }\n}\n', diagnostics: [at(7, 14, ACROSS('a'))], ts: 'export function t(x: number): number { switch (x) { case 1: const a = 2; return a; default: return a; } }' },
};

/** TypeScript は通すが、Mamori は断る形 (arrow の中から、同じブロックの後の宣言を使う)。 */
const STRICTER: Readonly<Record<string, Refused>> = {
  'arrow が、同じブロックの後の宣言を読む (外側に同じ名前)': { mamori: 'export fn t(x: number) -> number {\n  if (x > 0) {\n    const f = () => x;\n    const x = 2;\n    return f() + x;\n  }\n  return 0;\n}\n', diagnostics: [at(3, 21, BEFORE('x'))], ts: 'export function t(x: number): number { if (x > 0) { const f = () => x; const x = 2; return f() + x; } return 0; }' },
  'arrow が、同じブロックの後の宣言を読む (外側に同じ名前が無い)': { mamori: 'export fn t() -> number {\n  const f = () => x;\n  const x = 2;\n  return f() + x;\n}\n', diagnostics: [at(2, 19, BEFORE('x'))], ts: 'export function t(): number { const f = () => x; const x = 2; return f() + x; }' },
  'arrow のブロックの本体が、外のブロックの後の宣言へ代入する': { mamori: 'export fn t(c: boolean) -> number {\n  let x = 1;\n  if (c) {\n    const f = () => {\n      x = 5;\n    };\n    let x = 2;\n    f();\n    return x;\n  }\n  return x;\n}\n', diagnostics: [at(5, 7, BEFORE('x'))], ts: 'export function t(c: boolean): number { let x = 1; if (c) { const f = () => { x = 5; }; let x = 2; f(); return x; } return x; }' },
};

/** 通す形 (JavaScript の決まりでも、宣言の後か、別のブロックの名前)。 */
const ACCEPTED: Readonly<Record<string, string>> = {
  '宣言の後で読む': 'export fn t() -> number {\n  const a = 1;\n  const b = a;\n  return a + b;\n}\n',
  '入れ子のブロックが先に同じ名前を持ち、外のブロックが後で宣言する': 'export fn t(c: boolean) -> number {\n  if (c) {\n    const x = 1;\n    return x;\n  }\n  const x = 2;\n  return x;\n}\n',
  '外側の名前を読むブロックが、その名前を宣言しない': 'export fn t(x: number) -> number {\n  if (x > 0) {\n    const y = x;\n    return y;\n  }\n  return 0;\n}\n',
  '入れ子で同じ名前を宣言してから読む (外側の名前を隠す)': 'export fn t(x: number) -> number {\n  if (x > 0) {\n    const x = 2;\n    const y = x;\n    return y;\n  }\n  return x;\n}\n',
  'ブロックを出た後で外側の名前を読む': 'export fn t(x: number) -> number {\n  if (x > 0) {\n    const x = 2;\n    return x;\n  }\n  const y = x;\n  return y;\n}\n',
  '隣のブロックが宣言する名前': 'export fn t(x: number) -> number {\n  if (x > 0) {\n    const y = x;\n    return y;\n  } else {\n    const x = 2;\n    return x;\n  }\n}\n',
  'while の条件は外の名前・本体が同じ名前を宣言': 'export fn t(x: number) -> number {\n  while (x > 0) {\n    const x = 0;\n    return x;\n  }\n  return 1;\n}\n',
  'for の回す相手は外の名前・本体が同じ名前を宣言': 'export fn t(xs: readonly number[]) -> number {\n  for (const v of xs) {\n    const xs = v;\n    return xs;\n  }\n  return 0;\n}\n',
  'if の条件は外の名前・本体が同じ名前を宣言': 'export fn t(x: number) -> number {\n  if (x > 0) {\n    const x = 2;\n    return x;\n  }\n  return 0;\n}\n',
  'for の回す変数を本体で読み、外のブロックが後で同じ名前を宣言する': 'export fn t(xs: readonly number[]) -> number {\n  for (const x of xs) {\n    return x;\n  }\n  const x = 2;\n  return x;\n}\n',
  'arrow の引数を本体 (式) で読み、外のブロックが後で同じ名前を宣言する': 'export fn t() -> number {\n  const f = (x: number) => x + 1;\n  const x = 2;\n  return f(x);\n}\n',
  'arrow の引数を本体 (ブロック) で読み、外のブロックが後で同じ名前を宣言する': 'export fn t() -> number {\n  const f = (x: number) => {\n    return x + 1;\n  };\n  const x = 2;\n  return f(x);\n}\n',
  '束ねた例外を handler で読み、外のブロックが後で同じ名前を宣言する': 'export fn t() -> number {\n  try {\n    return 1;\n  } catch (e) {\n    return e === null ? 2 : 3;\n  }\n  const e = 4;\n  return e;\n}\n',
  'arrow が、先に宣言した名前を読む': 'export fn t() -> number {\n  const x = 2;\n  const f = () => x;\n  return f();\n}\n',
  'arrow の引数の既定値は外の名前・本体が同じ名前を宣言': 'export fn t(x: number) -> number {\n  const f = (q = x) => {\n    const y = q;\n    return y;\n  };\n  return f();\n}\n',
  'let へ、宣言の後で代入する': 'export fn t() -> number {\n  let x = 1;\n  x = 2;\n  return x;\n}\n',
  '作った物の欄へ、宣言の後で代入する': 'export fn t() -> number {\n  const o = { a: 1 };\n  o.a = 2;\n  return o.a;\n}\n',
  '組み込みを使ってから、入れ子のブロックで同じ名前を宣言 (別のブロック)': 'export fn t(c: boolean) -> number {\n  const n = Math.floor(1.5);\n  if (c) {\n    const Math = 2;\n    return n + Math;\n  }\n  return n;\n}\n',
  'switch の主語は外の名前・case の本体が同じ名前を宣言': 'export fn t(x: number) -> number {\n  switch (x) {\n    case 1:\n      const x = 2;\n      return x;\n    default:\n      return 0;\n  }\n}\n',
  'switch: 自分の case の宣言を、宣言の後で読む': 'export fn t(x: number) -> number {\n  switch (x) {\n    case 1:\n      const a = 2;\n      const b = a;\n      return a + b;\n    default:\n      return 0;\n  }\n}\n',
  'switch: どの case も宣言しない外の名前を、値と本体で読む': 'export fn t(x: number, k: number) -> number {\n  switch (x) {\n    case k:\n      const a = k;\n      return a;\n    default:\n      return k;\n  }\n}\n',
  'switch: case の中の入れ子のブロックの宣言は、別の case から見えない': 'export fn t(x: number, k: number) -> number {\n  switch (x) {\n    case 1:\n      if (k > 0) {\n        const k = 2;\n        return k;\n      }\n      return 1;\n    default:\n      return k;\n  }\n}\n',
  'switch を出た後で、case が宣言した名前と同じ外の名前を読む': 'export fn t(x: number, k: number) -> number {\n  switch (x) {\n    case 1:\n      const k = 2;\n      return k;\n    default:\n      break;\n  }\n  return k;\n}\n',
  '2 つの switch が同じ名前を宣言・それぞれの中で読む': 'export fn t(x: number) -> number {\n  switch (x) {\n    case 1:\n      const a = 1;\n      return a;\n    default:\n      break;\n  }\n  switch (x) {\n    case 2:\n      const a = 2;\n      return a;\n    default:\n      return 0;\n  }\n}\n',
  '関数が、モジュールの後ろで宣言した const を読む': 'export fn t() -> number {\n  return b;\n}\nconst b: number = 1;\n',
  'catch の束縛を本体で読む': 'export fn t() -> string {\n  try {\n    return "a";\n  } catch (e) {\n    const m = e;\n    return m === null ? "b" : "c";\n  }\n}\n',
};

describe('Mamori 0.45: 同じブロックの宣言より前で、名前を使わせない (MG-085)', () => {
  it('★ 宣言より前で使う形・同じ switch の別の場所が宣言する名前を使う形を、場所と全文つきで断る', () => {
    for (const [name, form] of Object.entries(REFUSED)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    // 表が 2 つの断りの両方を持つ (片方の文面だけを見る検査にしない)
    const all = Object.values(REFUSED).flatMap((f) => f.diagnostics);
    expect(all.filter((d) => d.includes('同じブロックの宣言より前で使っています')).length).toBeGreaterThanOrEqual(30);
    expect(all.filter((d) => d.includes('同じ switch の case の本体が宣言しています')).length).toBeGreaterThanOrEqual(5);
  });

  it('★ 同じ形を TypeScript も断る (宣言の順の番号 2448 / 2454)', () => {
    for (const [name, form] of Object.entries(REFUSED)) {
      expect(orderCodes(form.ts).length, `${name}: ${JSON.stringify(tsCodes(form.ts))}`).toBeGreaterThan(0);
    }
    // 対照: 物差しは、宣言の後で使う形には宣言の順の番号を付けない
    expect(orderCodes('export function t(): number { const b = 1; const a = b; return a; }')).toEqual([]);
  });

  it('★ arrow の中から同じブロックの後の宣言を使う形は、TypeScript が通しても断る', () => {
    for (const [name, form] of Object.entries(STRICTER)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
      // TypeScript は通す (閉包は宣言の後で呼ぶかもしれない) —— 守りは Mamori の検査器の側に在る
      expect(tsCodes(form.ts), name).toEqual([]);
    }
    expect(Object.keys(STRICTER).length).toBe(3);
  });

  it('対照: 宣言の後で使う形・別のブロックの名前は今までどおり通り、生成物の形も宣言の順も崩れない', () => {
    for (const [name, source] of Object.entries(ACCEPTED)) {
      const r = compile(source);
      expect(r.ok, `${name}: ${r.diagnostics.join(' | ')}`).toBe(true);
      expect(shapeMismatch('src/x/m0.mamori', source, r.emitted), name).toEqual([]);
      expect(orderCodes(r.emitted), name).toEqual([]);
    }
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(26);
  });

  it('対照: どのブロックも宣言しない名前は、今までどおり「宣言していない名前」と答える', () => {
    expect(compile('export fn t() -> number {\n  return zz;\n}\n').diagnostics).toEqual([at(2, 10, UNDECLARED('zz'))]);
    // 別の関数のブロックが宣言する名前は、この関数からは宣言していない名前
    expect(compile('export fn a() -> number {\n  const zz = 1;\n  return zz;\n}\nexport fn t() -> number {\n  return zz;\n}\n').diagnostics).toEqual([at(6, 10, UNDECLARED('zz'))]);
    // 隣のブロック (if の本体) が宣言する名前も同じ
    expect(compile('export fn t(c: boolean) -> number {\n  if (c) {\n    const zz = 1;\n    return zz;\n  }\n  return zz;\n}\n').diagnostics).toEqual([at(6, 10, UNDECLARED('zz'))]);
  });

  it('対照: 0.44 の断り (同じ名前を 2 度宣言) は、宣言を通った名前には今までどおり 1 つだけ答える', () => {
    // 束ねた例外・引数は本体と同じブロックに**既に在る**ので、読むのは宣言の後 —— 断りは 2 度目の宣言の 1 つだけ
    expect(compile('export fn t() -> number {\n  try {\n    return 1;\n  } catch (e) {\n    const m = e;\n    const e = 2;\n    return e;\n  }\n}\n').diagnostics).toEqual([at(6, 5, REDECLARED('e'))]);
    expect(compile('export fn t(a: number) -> number {\n  const y = a;\n  const a = 2;\n  return y + a;\n}\n').diagnostics).toEqual([at(3, 3, REDECLARED('a'))]);
    // 2 つの case が同じ名前を宣言し、後の case が自分の宣言より前で読む: 0.45 の断り (使う場所) と 0.44 の断り (宣言の場所) の両方
    expect(compile('export fn t(x: number, k: number) -> number {\n  switch (x) {\n    case 1:\n      const k = 2;\n      return k;\n    default:\n      const y = k;\n      const k = 3;\n      return y + k;\n  }\n}\n').diagnostics).toEqual([
      at(7, 17, BEFORE('k')),
      at(8, 7, REDECLARED_IN_SWITCH('k')),
    ]);
  });

  it('対照: モジュールの名前を読んでから同じ名前の局所を宣言する形は、使う場所 (0.45) と宣言の場所 (T-251) の両方で断る', () => {
    expect(compile('const g: number = 1;\nexport fn t() -> number {\n  const y = g;\n  const g = 2;\n  return y + g;\n}\n').diagnostics).toEqual([at(3, 13, BEFORE('g')), at(4, 3, HIDES('g'))]);
  });
});

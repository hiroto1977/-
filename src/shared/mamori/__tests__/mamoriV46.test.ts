import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.46 —— モジュール直下の宣言より前で、名前を直に使わせない** (2026-11-17 · MG-086 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * モジュール直下の const / let / クラスは書いた順に作られ、宣言の文に届く前に読むと、モジュールを読み込んだ時点で投げる。
 * 0.45 までの検査器は、直下の名前を先に全部集めてから初期値を検めていたので、後ろの宣言を直に読む初期値
 * (`const a: number = b; const b: number = 1;`) が通り、生成物を `tsc` が断っていた (2448 / 2454・クラスは 2449 —— 守りが `tsc` の 1 層)。
 * 0.46 は、直下の const / let の初期値が、その宣言・後ろの宣言の const / let / クラスの名前を**直に**使う形を検査器 (M6) で断る。
 *
 * 関数・arrow の中から使う形は、呼ばれるのが読み込みの後なので今までどおり通る (TypeScript も通す)。関数 (`fn`) は巻き上がるので、
 * 後ろの関数を初期値で呼ぶ形も通る。
 */

function compile(source: string): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs][0]![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}

const at = (line: number, col: number, message: string): string => `src/x/m0.mamori:${line}:${col}: ${message}`;
const EARLY = (name: string): string =>
  `[M6] モジュール直下の名前 ${name} を、宣言より前で使っています —— 直下の const / let / クラスは書いた順に作られ、宣言の文に届く前に読むと読み込みの時点で投げます (使う宣言を先に置くか、関数・arrow の中から使います)`;
const BEFORE = (name: string): string =>
  `[M6] 局所の名前 ${name} を、同じブロックの宣言より前で使っています —— 生成物ではこのブロックの ${name} を指すので、外側の同じ名前は読めず、宣言の文より前に走ると実行時に投げます (使うのは宣言の文の後にします)`;
const UNDECLARED = (name: string): string => `[M6] 宣言していない名前 ${name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`;

/**
 * TypeScript (構文 + 意味・厳格モード・lib なし) がその綴りに付ける診断の番号。
 * lib を読まないので、組み込みとそのメンバには別の番号 (2304 / 2339 ほか) も付く —— 見るのは宣言の順の番号だけ
 * (2448 = 宣言より前で使った・2454 = 代入の前に使った・2449 = クラスを宣言より前で使った)。
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

const ORDER_CODES: readonly number[] = [2448, 2454, 2449];
const orderCodes = (text: string): number[] => tsCodes(text).filter((c) => ORDER_CODES.includes(c));

/** 断る形: [Mamori の綴り, 断りの全文 (場所つき), 同じ形の TypeScript]。 */
interface Refused {
  readonly mamori: string;
  readonly diagnostics: readonly string[];
  readonly ts: string;
}

/** 直下の初期値が、その宣言・後ろの宣言の名前を直に使う形 (TypeScript も断る)。 */
const REFUSED: Readonly<Record<string, Refused>> = {
  'const が、後ろの const を読む': { mamori: 'const a: number = b;\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 19, EARLY('b'))], ts: 'const a: number = b; const b: number = 1; export function t(): number { return 0; }' },
  'export const が、後ろの const を読む': { mamori: 'export const a: number = b;\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 26, EARLY('b'))], ts: 'export const a: number = b; const b: number = 1; export function t(): number { return 0; }' },
  '型を書いていない const が、後ろの const を読む': { mamori: 'const a = b;\nconst b = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 11, EARLY('b'))], ts: 'const a = b; const b = 1; export function t(): number { return 0; }' },
  'let が、後ろの const を読む': { mamori: 'let a: number = b;\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 17, EARLY('b'))], ts: 'let a: number = b; const b: number = 1; export function t(): number { return 0; }' },
  'const が、後ろの let を読む': { mamori: 'const a: number = b;\nlet b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 19, EARLY('b'))], ts: 'const a: number = b; let b: number = 1; export function t(): number { return 0; }' },
  'const が、自分の初期値で自分を読む': { mamori: 'const a: number = a;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 19, EARLY('a'))], ts: 'const a: number = a; export function t(): number { return 0; }' },
  'let が、自分の初期値で自分を読む': { mamori: 'let a: number = a;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 17, EARLY('a'))], ts: 'let a: number = a; export function t(): number { return 0; }' },
  '2 つ後ろの const を読む (間に別の宣言)': { mamori: 'const a: number = c;\nconst b: number = 1;\nconst c: number = 2;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 19, EARLY('c'))], ts: 'const a: number = c; const b: number = 1; const c: number = 2; export function t(): number { return 0; }' },
  '配列の中で読む': { mamori: 'const a: readonly number[] = [b];\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 31, EARLY('b'))], ts: 'const a: readonly number[] = [b]; const b: number = 1; export function t(): number { return 0; }' },
  'オブジェクトの欄の値で読む': { mamori: 'const a = { k: b };\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 16, EARLY('b'))], ts: 'const a = { k: b }; const b: number = 1; export function t(): number { return 0; }' },
  '条件演算子の中で読む': { mamori: 'const a: number = true ? b : 0;\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 26, EARLY('b'))], ts: 'const a: number = true ? b : 0; const b: number = 1; export function t(): number { return 0; }' },
  '二項演算の中で読む': { mamori: 'const a: number = b + 1;\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 19, EARLY('b'))], ts: 'const a: number = b + 1; const b: number = 1; export function t(): number { return 0; }' },
  '展開で読む': { mamori: 'const a: readonly number[] = [...xs];\nconst xs: readonly number[] = [1];\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 34, EARLY('xs'))], ts: 'const a: readonly number[] = [...xs]; const xs: readonly number[] = [1]; export function t(): number { return 0; }' },
  'メンバの受け手にする': { mamori: 'const n: number = o.a;\nconst o = { a: 1 };\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 19, EARLY('o'))], ts: 'const n: number = o.a; const o = { a: 1 }; export function t(): number { return 0; }' },
  'メンバを呼ぶ受け手にする': { mamori: 'const n: string = s.trim();\nconst s: string = "x";\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 19, EARLY('s'))], ts: 'const n: string = s.trim(); const s: string = "x"; export function t(): number { return 0; }' },
  '後ろの arrow の const を呼ぶ': { mamori: 'const v: number = f();\nconst f = () => 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 19, EARLY('f'))], ts: 'const v: number = f(); const f = () => 1; export function t(): number { return 0; }' },
  '後ろのクラスを構築する': { mamori: 'const e: Error = new Bad("x");\nclass Bad extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 25, EARLY('Bad'))], ts: 'const e: object = new Bad("x"); class Bad { constructor(m: string) {} } export function t(): number { return 0; }' },
  '後ろのクラスを instanceof の右辺に置く': { mamori: 'const hit: boolean = null instanceof Bad;\nclass Bad extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 38, EARLY('Bad'))], ts: 'const hit: boolean = ({} as object) instanceof Bad; class Bad { constructor(m: string) {} } export function t(): number { return 0; }' },
  '組み込みの構築の引数の中で読む': { mamori: 'const a: ReadonlyMap<string, number> = new Map([["k", b]]);\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 55, EARLY('b'))], ts: 'const a: object = new Bad([["k", b]]); class Bad { constructor(m: unknown) {} } const b: number = 1; export function t(): number { return 0; }' },
  '1 つの初期値で 2 つの後ろの名前を読む (2 つとも断る)': { mamori: 'const a: number = b + c;\nconst b: number = 1;\nconst c: number = 2;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 19, EARLY('b')), at(1, 23, EARLY('c'))], ts: 'const a: number = b + c; const b: number = 1; const c: number = 2; export function t(): number { return 0; }' },
  '2 つの宣言がそれぞれ後ろを読む': { mamori: 'const a: number = c;\nconst b: number = c;\nconst c: number = 2;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 19, EARLY('c')), at(2, 19, EARLY('c'))], ts: 'const a: number = c; const b: number = c; const c: number = 2; export function t(): number { return 0; }' },
};

/** 通す形 (前の宣言を使う・関数や arrow の中から使う・巻き上がる関数を呼ぶ)。 */
const ACCEPTED: Readonly<Record<string, string>> = {
  '前の const を読む': 'const b: number = 1;\nconst a: number = b;\nexport fn t() -> number {\n  return 0;\n}\n',
  '前の let を読む': 'let b: number = 1;\nconst a: number = b;\nexport fn t() -> number {\n  return 0;\n}\n',
  'arrow の中から、後ろの const を読む': 'const f = () => b;\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n',
  'arrow のブロックの本体から、後ろの const を読む': 'const f = () => {\n  return b;\n};\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n',
  'arrow の引数の既定値が、後ろの const を読む': 'const f = (q = b) => q;\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n',
  'オブジェクトの欄の arrow から、後ろの const を読む': 'const o = { f: () => b };\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n',
  '配列の中の arrow から、後ろの const を読む': 'const fs = [() => b];\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n',
  'arrow の中から、後ろの arrow を呼ぶ': 'const f = () => g();\nconst g = () => 1;\nexport fn t() -> number {\n  return 0;\n}\n',
  'arrow の中で、後ろのクラスを構築する': 'const mk = () => new Bad("x");\nclass Bad extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\nexport fn t() -> number {\n  return 0;\n}\n',
  '関数の本体が、後ろの const を読む': 'export fn t() -> number {\n  return b;\n}\nconst b: number = 1;\n',
  '関数の引数の既定値が、後ろの const を読む': 'export fn t(x: number = b) -> number {\n  return x;\n}\nconst b: number = 1;\n',
  'クラスの引数の既定値と super の引数が、後ろの const を読む': 'class Bad extends Error {\n  constructor(m: string = MSG) {\n    super(m + TAIL);\n  }\n}\nconst MSG: string = "x";\nconst TAIL: string = "y";\nexport fn t() -> number {\n  return 0;\n}\n',
  '後ろの fn を初期値で呼ぶ (関数は巻き上がる)': 'const v: number = g();\nfn g() -> number {\n  return 1;\n}\nexport fn t() -> number {\n  return 0;\n}\n',
  '前のクラスを構築する': 'class Bad extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\nconst e: Error = new Bad("x");\nexport fn t() -> number {\n  return 0;\n}\n',
  '組み込みを使う': 'const n: number = Math.max(1, 2);\nconst m: ReadonlyMap<string, number> = new Map([["k", 1]]);\nexport fn t() -> number {\n  return 0;\n}\n',
};

describe('Mamori 0.46: モジュール直下の宣言より前で、名前を直に使わせない (MG-086)', () => {
  it('★ 直下の初期値が、その宣言・後ろの宣言の const / let / クラスを直に使う形を、場所と全文つきで断る', () => {
    for (const [name, form] of Object.entries(REFUSED)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(REFUSED).length).toBeGreaterThanOrEqual(21);
  });

  it('★ 同じ形を TypeScript も断る (宣言の順の番号 2448 / 2454 / 2449)', () => {
    for (const [name, form] of Object.entries(REFUSED)) {
      expect(orderCodes(form.ts).length, `${name}: ${JSON.stringify(tsCodes(form.ts))}`).toBeGreaterThan(0);
    }
    // 対照: 物差しは、前の宣言を読む形・arrow の中から後ろを読む形には宣言の順の番号を付けない
    expect(orderCodes('const b: number = 1; const a: number = b; export function t(): number { return a; }')).toEqual([]);
    expect(orderCodes('const f = () => b; const b: number = 1; export function t(): number { return f(); }')).toEqual([]);
  });

  it('対照: 前の宣言を使う形・関数や arrow の中から使う形・巻き上がる関数を呼ぶ形は今までどおり通り、生成物の形も宣言の順も崩れない', () => {
    for (const [name, source] of Object.entries(ACCEPTED)) {
      const r = compile(source);
      expect(r.ok, `${name}: ${r.diagnostics.join(' | ')}`).toBe(true);
      expect(shapeMismatch('src/x/m0.mamori', source, r.emitted), name).toEqual([]);
      expect(orderCodes(r.emitted), name).toEqual([]);
    }
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(15);
  });

  it('対照: 関数の中から後ろの直下の const を使う形は、読む・arrow の中から読む・呼ぶのどれも通る', () => {
    expect(compile('export fn t() -> number {\n  const f = () => b;\n  return f() + b;\n}\nconst b: number = 1;\n').ok).toBe(true);
    expect(compile('export fn t() -> number {\n  return f();\n}\nconst f = () => 1;\n').ok).toBe(true);
  });

  it('対照: どこにも宣言していない名前は、直下の初期値でも今までどおり「宣言していない名前」と答える', () => {
    expect(compile('const a: number = zz;\nexport fn t() -> number {\n  return 0;\n}\n').diagnostics).toEqual([at(1, 19, UNDECLARED('zz'))]);
  });

  it('対照: 関数の中のブロックの宣言より前 (0.45) は、0.45 の文のまま答える (直下の名前の文と取り違えない)', () => {
    expect(compile('const b: number = 1;\nexport fn t(x: number) -> number {\n  if (x > 0) {\n    const y = x;\n    const x = 2;\n    return y + x + b;\n  }\n  return b;\n}\n').diagnostics).toEqual([at(4, 15, BEFORE('x'))]);
  });
});

import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.48 —— arrow の引数の既定値で、自分・右の引数を使わせない** (2026-11-17 · MG-088 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * 関数の引数は左から順に作られる。既定値の式が読めるのは左の引数だけで、自分・右の引数を読むと、呼んだ時に投げる。
 * 0.47 までの検査器は arrow の引数を全部先に束ねてから既定値を検めていたので、`(a: number = b, b: number = 1) => a + b` が通り、
 * 生成物を `tsc` が断っていた (2372 / 2373 —— 守りが `tsc` の 1 層)。外側に同じ名前の局所が在れば、検査器は引数を読み、実行時は投げる。
 * 0.48 は、既定値を検める間、自分と右の引数を「これから宣言する名前」として持ち、使った所で断る (M6)。
 *
 * 関数 (`fn`) とクラスの構築子の既定値は、前からどの引数も読めない (直下の名前だけを引く) ので、変わらない。
 */

function compile(source: string): { ok: boolean; diagnostics: string[]; emitted: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { ok: true, diagnostics: [], emitted: [...r.outputs][0]![1] } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic), emitted: '' };
}

const at = (line: number, col: number, message: string): string => `src/x/m0.mamori:${line}:${col}: ${message}`;
const EARLY_PARAM = (name: string): string => `[M6] arrow の引数 ${name} を、その引数が作られる前 (自分か、左の引数の既定値の中) で使っています —— 引数は左から順に作られ、既定値が読めるのは左の引数だけです (読むと、呼んだ時に投げます)`;
const UNDECLARED = (name: string): string => `[M6] 宣言していない名前 ${name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`;
const TWICE = (name: string): string => `[M6] 局所の名前 ${name} を同じブロックで 2 度宣言しています —— 引数・catch の束縛・const / let・分割代入の束縛は、同じブロックの中で名前を重ねられません (TypeScript も断ります)`;
const BEFORE = (name: string): string => `[M6] 局所の名前 ${name} を、同じブロックの宣言より前で使っています —— 生成物ではこのブロックの ${name} を指すので、外側の同じ名前は読めず、宣言の文より前に走ると実行時に投げます (使うのは宣言の文の後にします)`;
const DUP_PARAM = (name: string): string => `[M0] 引数 \`${name}\` が二重です —— 同じ並びに同じ名前は 1 度だけ書けます (TypeScript も断ります)`;
const SHADOWS = (name: string): string => `[M6] 局所の名前 ${name} は、モジュール直下の同名の宣言 (use・extern・fn・定数) を隠します —— 呼び出しの外形 (印) は名前で引くので、別の名前にしてください`;

/**
 * TypeScript (構文 + 意味・厳格モード・lib なし) がその綴りに付ける診断の番号。
 * lib を読まないので、組み込みとそのメンバには別の番号 (2304 / 2339 ほか) も付く —— 見るのは宣言の順の番号だけ
 * (2372 = 既定値が自分を読む・2373 = 既定値が右の引数を読む・2448 / 2454 = 宣言より前で使った)。
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

const ORDER_CODES: readonly number[] = [2372, 2373, 2448, 2454];
const orderCodes = (text: string): number[] => tsCodes(text).filter((c) => ORDER_CODES.includes(c));

/** 断る形: [Mamori の綴り, 断りの全文 (場所つき), 同じ形の TypeScript]。 */
interface Refused {
  readonly mamori: string;
  readonly diagnostics: readonly string[];
  readonly ts: string;
}

/** arrow の引数の既定値が、自分・右の引数を直に使う形 (TypeScript も断る: 2372 / 2373)。 */
const REFUSED: Readonly<Record<string, Refused>> = {
  '既定値が、右の引数を読む (式の本体)': { mamori: 'export fn t() -> number {\n  const f = (a: number = b, b: number = 1) => a + b;\n  return 0;\n}\n', diagnostics: [at(2, 26, EARLY_PARAM('b'))], ts: 'export function t(): number { const f = (a: number = b, b: number = 1) => a + b; return 0; }' },
  '既定値が、自分を読む': { mamori: 'export fn t() -> number {\n  const f = (a: number = a) => a;\n  return 0;\n}\n', diagnostics: [at(2, 26, EARLY_PARAM('a'))], ts: 'export function t(): number { const f = (a: number = a) => a; return 0; }' },
  '既定値が、右の引数を読む (ブロックの本体)': { mamori: 'export fn t() -> number {\n  const f = (a: number = b, b: number = 1) => {\n    return a + b;\n  };\n  return 0;\n}\n', diagnostics: [at(2, 26, EARLY_PARAM('b'))], ts: 'export function t(): number { const f = (a: number = b, b: number = 1) => { return a + b; }; return 0; }' },
  '1 番目の既定値が、3 番目の引数を読む': { mamori: 'export fn t() -> number {\n  const f = (a: number = c, b: number = 1, c: number = 2) => a + b + c;\n  return 0;\n}\n', diagnostics: [at(2, 26, EARLY_PARAM('c'))], ts: 'export function t(): number { const f = (a: number = c, b: number = 1, c: number = 2) => a + b + c; return 0; }' },
  '2 番目の既定値が、3 番目の引数を読む': { mamori: 'export fn t() -> number {\n  const f = (a: number, b: number = c, c: number = 2) => a + b + c;\n  return 0;\n}\n', diagnostics: [at(2, 37, EARLY_PARAM('c'))], ts: 'export function t(): number { const f = (a: number, b: number = c, c: number = 2) => a + b + c; return 0; }' },
  '2 番目の既定値が、自分を読む': { mamori: 'export fn t() -> number {\n  const f = (a: number, b: number = b + a) => a + b;\n  return 0;\n}\n', diagnostics: [at(2, 37, EARLY_PARAM('b'))], ts: 'export function t(): number { const f = (a: number, b: number = b + a) => a + b; return 0; }' },
  '二項演算の中で、右の引数を読む': { mamori: 'export fn t() -> number {\n  const f = (a: number = 1 + b, b: number = 1) => a + b;\n  return 0;\n}\n', diagnostics: [at(2, 30, EARLY_PARAM('b'))], ts: 'export function t(): number { const f = (a: number = 1 + b, b: number = 1) => a + b; return 0; }' },
  '配列の中で、右の引数を読む': { mamori: 'export fn t() -> number {\n  const f = (a: readonly number[] = [b], b: number = 1) => a.length + b;\n  return 0;\n}\n', diagnostics: [at(2, 38, EARLY_PARAM('b'))], ts: 'export function t(): number { const f = (a: readonly number[] = [b], b: number = 1) => a.length + b; return 0; }' },
  '条件演算子の中で、右の引数を読む': { mamori: 'export fn t() -> number {\n  const f = (a: number = true ? b : 0, b: number = 1) => a + b;\n  return 0;\n}\n', diagnostics: [at(2, 33, EARLY_PARAM('b'))], ts: 'export function t(): number { const f = (a: number = true ? b : 0, b: number = 1) => a + b; return 0; }' },
  '組み込みの呼び出しの引数で、右の引数を読む': { mamori: 'export fn t() -> number {\n  const f = (a: number = Math.max(b, 0), b: number = 1) => a + b;\n  return 0;\n}\n', diagnostics: [at(2, 35, EARLY_PARAM('b'))], ts: 'export function t(): number { const f = (a: number = Math.max(b, 0), b: number = 1) => a + b; return 0; }' },
  '右の引数を、メンバの受け手にする': { mamori: 'export fn t() -> number {\n  const f = (n: number = xs.length, xs: readonly number[] = [1]) => n + xs.length;\n  return 0;\n}\n', diagnostics: [at(2, 26, EARLY_PARAM('xs'))], ts: 'export function t(): number { const f = (n: number = xs.length, xs: readonly number[] = [1]) => n + xs.length; return 0; }' },
  '右の引数を呼ぶ': { mamori: 'export fn t() -> number {\n  const f = (a: number = g(), g: () => number = () => 1) => a + g();\n  return 0;\n}\n', diagnostics: [at(2, 26, EARLY_PARAM('g'))], ts: 'export function t(): number { const f = (a: number = g(), g: () => number = () => 1) => a + g(); return 0; }' },
  '外側の局所の名前と同じ名前の、右の引数を読む': { mamori: 'export fn t() -> number {\n  const b = 5;\n  const f = (a: number = b, b: number = 1) => a + b;\n  return 0;\n}\n', diagnostics: [at(3, 26, EARLY_PARAM('b'))], ts: 'export function t(): number { const b = 5; const f = (a: number = b, b: number = 1) => a + b; return 0; }' },
  'モジュール直下の arrow の const で': { mamori: 'const f = (a: number = b, b: number = 1) => a + b;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 24, EARLY_PARAM('b'))], ts: 'const f = (a: number = b, b: number = 1) => a + b; export function t(): number {  return 0; }' },
  'その場で呼ぶ arrow で': { mamori: 'export fn t() -> number {\n  const v = ((a: number = b, b: number = 1) => a + b)();\n  return 0;\n}\n', diagnostics: [at(2, 27, EARLY_PARAM('b'))], ts: 'export function t(): number { const v = ((a: number = b, b: number = 1) => a + b)(); return 0; }' },
  'async の arrow で': { mamori: 'export fn t() -> number {\n  const f = async (a: number = b, b: number = 1) => a + b;\n  return 0;\n}\n', diagnostics: [at(2, 32, EARLY_PARAM('b'))], ts: 'export function t(): number { const f = async (a: number = b, b: number = 1) => a + b; return 0; }' },
  '呼び戻しとして渡す arrow で': { mamori: 'export fn t() -> number {\n  const ys = [1].map((x: number = y, y: number = 1) => x + y);\n  return 0;\n}\n', diagnostics: [at(2, 35, EARLY_PARAM('y'))], ts: 'export function t(): number { const ys = [1].map((x: number = y, y: number = 1) => x + y); return 0; }' },
  '1 つの既定値で、自分と右の引数を読む (2 つとも断る)': { mamori: 'export fn t() -> number {\n  const f = (a: number = a + b, b: number = 1) => a + b;\n  return 0;\n}\n', diagnostics: [at(2, 26, EARLY_PARAM('a')), at(2, 30, EARLY_PARAM('b'))], ts: 'export function t(): number { const f = (a: number = a + b, b: number = 1) => a + b; return 0; }' },
  '2 つの既定値が、それぞれ右の引数を読む': { mamori: 'export fn t() -> number {\n  const f = (a: number = b, b: number = c, c: number = 1) => a + b + c;\n  return 0;\n}\n', diagnostics: [at(2, 26, EARLY_PARAM('b')), at(2, 41, EARLY_PARAM('c'))], ts: 'export function t(): number { const f = (a: number = b, b: number = c, c: number = 1) => a + b + c; return 0; }' },
};

/** TypeScript は通すが、Mamori は断る形 (既定値の中の arrow から、自分・右の引数を使う —— 検査器は既定値を 1 度しか検めない)。 */
const STRICTER: Readonly<Record<string, Refused>> = {
  '既定値の arrow の中から、右の引数を読む': { mamori: 'export fn t() -> number {\n  const f = (a: () => number = () => b, b: number = 1) => a() + b;\n  return 0;\n}\n', diagnostics: [at(2, 38, EARLY_PARAM('b'))], ts: 'export function t(): number { const f = (a: () => number = () => b, b: number = 1) => a() + b; return 0; }' },
  '既定値の arrow の中から、自分を呼ぶ': { mamori: 'export fn t() -> number {\n  const f = (a: () => number = () => a()) => a();\n  return 0;\n}\n', diagnostics: [at(2, 38, EARLY_PARAM('a'))], ts: 'export function t(): number { const f = (a: () => number = () => a()) => a(); return 0; }' },
};

/** 今までどおり受け取る形 (TypeScript も宣言の順の番号を付けない)。 */
const ACCEPTED: Readonly<Record<string, string>> = {
  '既定値が、左の引数を読む': 'export fn t() -> number {\n  const f = (a: number = 1, b: number = a) => a + b;\n  return 0;\n}\n',
  '既定値が、2 つ左の引数を読む': 'export fn t() -> number {\n  const f = (a: number, b: number = 1, c: number = a + b) => a + b + c;\n  return 0;\n}\n',
  '既定値が、外の局所の名前を読む': 'export fn t() -> number {\n  const k = 2;\n  const f = (a: number = k) => a;\n  return 0;\n}\n',
  '既定値が、モジュール直下の const を読む': 'const K: number = 2;\nexport fn t() -> number {\n  const f = (a: number = K) => a;\n  return 0;\n}\n',
  '既定値の arrow が、左の引数を読む': 'export fn t() -> number {\n  const f = (a: number = 1, g: () => number = () => a) => g();\n  return 0;\n}\n',
  '既定値の無い引数だけ': 'export fn t() -> number {\n  const f = (a: number, b: number) => a + b;\n  return 0;\n}\n',
  '本体が全部の引数を読む (ブロックの本体)': 'export fn t() -> number {\n  const f = (a: number = 1, b: number = 2) => {\n    const s = a + b;\n    return s;\n  };\n  return 0;\n}\n',
  '外側の局所の名前を既定値が読み、同じ名前の引数は無い': 'export fn t() -> number {\n  const b = 5;\n  const f = (a: number = b) => a;\n  return 0;\n}\n',
  '既定値が外の名前を読み、本体が同じ名前を宣言する': 'export fn t() -> number {\n  const y = 5;\n  const f = (q: number = y) => {\n    const y = 1;\n    return q + y;\n  };\n  return 0;\n}\n',
  'モジュール直下の arrow が、後ろの直下の const を既定値で読む': 'const f = (q: number = b) => q;\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n',
};

/** 前からの断りが、前の文のまま答える形。 */
const UNCHANGED: Readonly<Record<string, { readonly mamori: string; readonly diagnostics: readonly string[] }>> = {
  '宣言していない名前 (既定値)': { mamori: 'export fn t() -> number {\n  const f = (a: number = zz) => a;\n  return 0;\n}\n', diagnostics: [at(2, 26, UNDECLARED('zz'))] },
  '宣言していない名前 (既定値・網の名前 · T-244)': { mamori: 'export fn t() -> number {\n  const f = (q: unknown = fetch("x")) => q;\n  return 0;\n}\n', diagnostics: [at(2, 27, UNDECLARED('fetch'))] },
  '関数の既定値は、どの引数も読めない (前の文のまま)': { mamori: 'export fn t(a: number = b, b: number = 1) -> number {\n  return a + b;\n}\n', diagnostics: [at(1, 25, UNDECLARED('b'))] },
  '引数と同じ名前の const を本体の直下に置く (0.44 の文)': { mamori: 'export fn t() -> number {\n  const f = (a: number = 1) => {\n    const a = 2;\n    return a;\n  };\n  return 0;\n}\n', diagnostics: [at(3, 5, TWICE('a'))] },
  '本体の中のブロックの宣言より前 (0.45 の文)': { mamori: 'export fn t() -> number {\n  const f = (a: number = 1) => {\n    const y = x;\n    const x = a;\n    return y + x;\n  };\n  return 0;\n}\n', diagnostics: [at(3, 15, BEFORE('x'))] },
  '同じ名前の引数を 2 つ (0.43 の文)': { mamori: 'export fn t() -> number {\n  const f = (a: number = 1, a: number = 2) => a;\n  return 0;\n}\n', diagnostics: [at(2, 29, DUP_PARAM('a'))] },
  '引数が直下の名前を隠す (T-251) —— 既定値は直下の名前を読めない': { mamori: 'const b: number = 5;\nexport fn t() -> number {\n  const f = (a: number = b, b: number = 1) => a + b;\n  return 0;\n}\n', diagnostics: [at(3, 26, EARLY_PARAM('b')), at(3, 29, SHADOWS('b'))] },
};

describe('Mamori 0.48: arrow の引数の既定値で、自分・右の引数を使わせない (MG-088)', () => {
  it('★ 既定値が自分・右の引数を使う形を、場所と全文つきで断る', () => {
    for (const [name, form] of Object.entries(REFUSED)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(REFUSED).length).toBeGreaterThanOrEqual(19);
  });

  it('★ 同じ形を TypeScript も断る (2372 / 2373)', () => {
    for (const [name, form] of Object.entries(REFUSED)) {
      expect(orderCodes(form.ts).length, `${name}: ${JSON.stringify(tsCodes(form.ts))}`).toBeGreaterThan(0);
    }
    // 対照: 物差しは、左の引数を読む既定値には宣言の順の番号を付けない
    expect(orderCodes('export function t(): number { const f = (a: number = 1, b: number = a) => a + b; return f(); }')).toEqual([]);
  });

  it('★ 既定値の中の arrow から自分・右の引数を使う形は、TypeScript は通すが Mamori は断る (TypeScript より厳しい側)', () => {
    for (const [name, form] of Object.entries(STRICTER)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
      expect(orderCodes(form.ts), name).toEqual([]);
    }
    expect(Object.keys(STRICTER).length).toBeGreaterThanOrEqual(2);
  });

  it('対照: 左の引数・外の名前を読む既定値は今までどおり通り、生成物の形も宣言の順も崩れない', () => {
    for (const [name, source] of Object.entries(ACCEPTED)) {
      const r = compile(source);
      expect(r.ok, `${name}: ${r.diagnostics.join(' | ')}`).toBe(true);
      expect(shapeMismatch('src/x/m0.mamori', source, r.emitted), name).toEqual([]);
      expect(orderCodes(r.emitted), name).toEqual([]);
    }
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(10);
  });

  it('対照: 前からの断り (宣言していない名前・関数の既定値・同じ名前の重なり・ブロックの宣言より前・直下の名前を隠す引数) は、前の文のまま答える', () => {
    for (const [name, form] of Object.entries(UNCHANGED)) {
      expect(compile(form.mamori).diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(UNCHANGED).length).toBeGreaterThanOrEqual(7);
  });
});

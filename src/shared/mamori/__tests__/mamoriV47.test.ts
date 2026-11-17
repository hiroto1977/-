import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori 0.47 —— モジュール直下の初期値でその場で呼ぶ arrow の中でも、宣言より前の名前を使わせない** (2026-11-17 · MG-087 · 穴ではなく、守りの層を 1 つ足す周)。
 *
 * その場で呼ぶ arrow (`(() => b)()`) の本体は、呼び出しの式を評価した時に走る。モジュール直下の初期値の中で呼ぶなら、
 * モジュールを読み込んだ時点で走り、まだ作られていない直下の const / let / クラスを読むと投げる。
 * 0.46 は直に使う形だけを断り、arrow の本体は「後で呼ばれる物」として何も持たずに検めていたので、
 * `const a: number = (() => b)(); const b: number = 1;` が通り、生成物を `tsc` が断っていた (2448 / 2454・クラスは 2449 —— 守りが `tsc` の 1 層)。
 * 0.47 は、呼ぶ側の頭に直に書いた arrow の本体と引数の既定値を、呼んだ所と同じ「まだ作られていない名前」で検める (M6)。
 *
 * 値として置く arrow・その場で呼ぶ arrow が返す arrow・呼び戻しとして渡す arrow は、今までどおり何も持たない (TypeScript も通す)。
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
const SHADOWS = (name: string): string => `[M6] 局所の名前 ${name} は、モジュール直下の同名の宣言 (use・extern・fn・定数) を隠します —— 呼び出しの外形 (印) は名前で引くので、別の名前にしてください`;

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

/** 直下の初期値の中でその場で呼ぶ arrow が、その宣言・後ろの宣言の名前を使う形 (TypeScript も断る)。 */
const REFUSED: Readonly<Record<string, Refused>> = {
  'その場で呼ぶ arrow (式の本体) が、後ろの const を読む': { mamori: 'const a: number = (() => b)();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 26, EARLY('b'))], ts: 'const a: number = (() => b)(); const b: number = 1; export function t(): number { return 0; }' },
  'export const の初期値で': { mamori: 'export const a: number = (() => b)();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 33, EARLY('b'))], ts: 'export const a: number = (() => b)(); const b: number = 1; export function t(): number { return 0; }' },
  '型を書いていない const の初期値で': { mamori: 'const a = (() => b)();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 18, EARLY('b'))], ts: 'const a = (() => b)(); const b: number = 1; export function t(): number { return 0; }' },
  'let の初期値で': { mamori: 'let a: number = (() => b)();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 24, EARLY('b'))], ts: 'let a: number = (() => b)(); const b: number = 1; export function t(): number { return 0; }' },
  '後ろの let を読む': { mamori: 'const a: number = (() => c)();\nlet c: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 26, EARLY('c'))], ts: 'const a: number = (() => c)(); let c: number = 1; export function t(): number { return 0; }' },
  'ブロックの本体が、後ろの const を返す': { mamori: 'const a: number = (() => {\n  return b;\n})();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(2, 10, EARLY('b'))], ts: 'const a: number = (() => { return b; })(); const b: number = 1; export function t(): number { return 0; }' },
  '引数の既定値が、後ろの const を読む': { mamori: 'const a: number = ((q: number = b) => q)();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 33, EARLY('b'))], ts: 'const a: number = ((q: number = b) => q)(); const b: number = 1; export function t(): number { return 0; }' },
  '入れ子のその場の呼び出し': { mamori: 'const a: number = (() => (() => b)())();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 33, EARLY('b'))], ts: 'const a: number = (() => (() => b)())(); const b: number = 1; export function t(): number { return 0; }' },
  'async の arrow をその場で呼ぶ': { mamori: 'const p = (async () => b)();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 24, EARLY('b'))], ts: 'const p = (async () => b)(); const b: number = 1; export function t(): number { return 0; }' },
  '本体の中の if のブロック': { mamori: 'const a: number = (() => {\n  if (true) {\n    return b;\n  }\n  return 0;\n})();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(3, 12, EARLY('b'))], ts: 'const a: number = (() => { if (true) { return b; } return 0; })(); const b: number = 1; export function t(): number { return 0; }' },
  '本体の中の局所の const の初期値': { mamori: 'const a: number = (() => {\n  const c = b;\n  return c;\n})();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(2, 13, EARLY('b'))], ts: 'const a: number = (() => { const c = b; return c; })(); const b: number = 1; export function t(): number { return 0; }' },
  '本体の中の switch': { mamori: 'const a: number = (() => {\n  switch (1) {\n    case 1:\n      return b;\n    default:\n      return 0;\n  }\n})();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(4, 14, EARLY('b'))], ts: 'const a: number = (() => { switch (1) { case 1: return b; default: return 0; } })(); const b: number = 1; export function t(): number { return 0; }' },
  '本体の中の for の回す相手': { mamori: 'const a: number = (() => {\n  for (const x of [b]) {\n    return x;\n  }\n  return 0;\n})();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(2, 20, EARLY('b'))], ts: 'const a: number = (() => { for (const x of [b]) { return x; } return 0; })(); const b: number = 1; export function t(): number { return 0; }' },
  '本体の中の try': { mamori: 'const a: number = (() => {\n  try {\n    return b;\n  } catch (e) {\n    return 0;\n  }\n})();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(3, 12, EARLY('b'))], ts: 'const a: number = (() => { try { return b; } catch (e) { return 0; } })(); const b: number = 1; export function t(): number { return 0; }' },
  '本体の中で、後ろの let へ代入する': { mamori: 'const a: number = (() => {\n  c = 2;\n  return 0;\n})();\nlet c: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(2, 3, EARLY('c'))], ts: 'const a: number = (() => { c = 2; return 0; })(); let c: number = 1; export function t(): number { return 0; }' },
  '自分の初期値の中で、自分を読む': { mamori: 'const a: number = (() => a)();\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 26, EARLY('a'))], ts: 'const a: number = (() => a)(); export function t(): number { return 0; }' },
  '後ろのクラスを構築する': { mamori: 'const e: Error = (() => new Bad("x"))();\nclass Bad extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 32, EARLY('Bad'))], ts: 'const e: Error = (() => new Bad("x"))(); class Bad extends Error { constructor(m: string) { super(m); } } export function t(): number { return 0; }' },
  '後ろのクラスを instanceof の右辺に置く': { mamori: 'const hit: boolean = (() => null instanceof Bad)();\nclass Bad extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 45, EARLY('Bad'))], ts: 'const hit: boolean = (() => ({} as object) instanceof Bad)(); class Bad extends Error { constructor(m: string) { super(m); } } export function t(): number { return 0; }' },
  '後ろの arrow の const を呼ぶ': { mamori: 'const v: number = (() => f())();\nconst f = () => 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 26, EARLY('f'))], ts: 'const v: number = (() => f())(); const f = () => 1; export function t(): number { return 0; }' },
  '後ろの物をメンバの受け手にする': { mamori: 'const n: number = (() => o.a)();\nconst o = { a: 1 };\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 26, EARLY('o'))], ts: 'const n: number = (() => o.a)(); const o = { a: 1 }; export function t(): number { return 0; }' },
  '配列の中で、その場で呼ぶ': { mamori: 'const xs: readonly number[] = [(() => b)()];\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 39, EARLY('b'))], ts: 'const xs: readonly number[] = [(() => b)()]; const b: number = 1; export function t(): number { return 0; }' },
  'オブジェクトの欄の値で、その場で呼ぶ': { mamori: 'const o = { v: (() => b)() };\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 23, EARLY('b'))], ts: 'const o = { v: (() => b)() }; const b: number = 1; export function t(): number { return 0; }' },
  '二項演算の中で、その場で呼ぶ': { mamori: 'const a: number = 1 + (() => b)();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 30, EARLY('b'))], ts: 'const a: number = 1 + (() => b)(); const b: number = 1; export function t(): number { return 0; }' },
  '引数を取る arrow の本体で読む': { mamori: 'const a: number = ((q: number) => q + b)(1);\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 39, EARLY('b'))], ts: 'const a: number = ((q: number) => q + b)(1); const b: number = 1; export function t(): number { return 0; }' },
  'その場で呼ぶ arrow の引数に、その場で呼ぶ arrow': { mamori: 'const a: number = ((q: number) => q)((() => b)());\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 45, EARLY('b'))], ts: 'const a: number = ((q: number) => q)((() => b)()); const b: number = 1; export function t(): number { return 0; }' },
  '1 つの本体で 2 つの後ろの名前を読む (2 つとも断る)': { mamori: 'const a: number = (() => b + c)();\nconst b: number = 1;\nconst c: number = 2;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 26, EARLY('b')), at(1, 30, EARLY('c'))], ts: 'const a: number = (() => b + c)(); const b: number = 1; const c: number = 2; export function t(): number { return 0; }' },
  '2 つ後ろの const を読む (間に別の宣言)': { mamori: 'const a: number = (() => c)();\nconst b: number = 1;\nconst c: number = 2;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 26, EARLY('c'))], ts: 'const a: number = (() => c)(); const b: number = 1; const c: number = 2; export function t(): number { return 0; }' },
};

/** 今までどおり受け取る形 (TypeScript も宣言の順の番号を付けない)。 */
const ACCEPTED: Readonly<Record<string, string>> = {
  '前の const を、その場で呼ぶ arrow が読む': 'const b: number = 1;\nconst a: number = (() => b)();\nexport fn t() -> number {\n  return 0;\n}\n',
  '値として置く arrow の中の、その場の呼び出し': 'const f = () => (() => b)();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n',
  '関数の本体の中の、その場の呼び出し': 'export fn u() -> number {\n  return (() => b)();\n}\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n',
  'その場で呼ぶ arrow が返す arrow (呼ばない) が、後ろを読む': 'const f = (() => () => b)();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n',
  'その場で呼ぶ arrow が返す arrow を、さらに呼ぶ': 'const a: number = (() => () => b)()();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n',
  '本体の中で作って返す arrow が、後ろを読む': 'const f = (() => {\n  const g = () => b;\n  return g;\n})();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n',
  '返す arrow の中の、その場の呼び出し': 'const f = (() => () => (() => b)())();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n',
  '呼び戻しの arrow (メソッドの引数) が、後ろを読む': 'const xs: readonly number[] = [1].map((x) => x + b);\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n',
  '本体が前の const と組み込みだけを使う': 'const b: number = 1;\nconst a: number = (() => {\n  const c = Math.max(b, 2);\n  return c;\n})();\nexport fn t() -> number {\n  return 0;\n}\n',
  '引数と局所の名前だけを使う': 'const a: number = ((q: number) => {\n  const r = q + 1;\n  return r;\n})(1);\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n',
};

/** 前からの断りが、前の文のまま答える形 (直下の名前の文と取り違えない・足さない)。 */
const UNCHANGED: Readonly<Record<string, { readonly mamori: string; readonly diagnostics: readonly string[] }>> = {
  '引数が後ろの直下の名前を覆う (T-251 だけ)': { mamori: 'const a: number = ((b: number) => b)(1);\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 21, SHADOWS('b'))] },
  '局所の const が後ろの直下の名前を覆う (T-251 だけ)': { mamori: 'const a: number = (() => {\n  const b = 1;\n  return b;\n})();\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(2, 3, SHADOWS('b'))] },
  '本体の中のブロックの宣言より前 (0.45 の文)': { mamori: 'const a: number = (() => {\n  const y = x;\n  const x = 2;\n  return y + x;\n})();\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(2, 13, BEFORE('x'))] },
  '関数の中の、その場の呼び出しが同じブロックの後の宣言を読む (0.45 の文)': { mamori: 'export fn t() -> number {\n  const y = (() => x)();\n  const x = 2;\n  return y + x;\n}\n', diagnostics: [at(2, 20, BEFORE('x'))] },
  '宣言していない名前 (その場で呼ぶ本体)': { mamori: 'const a: number = (() => zz)();\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 26, UNDECLARED('zz'))] },
  'その場で呼ぶ arrow の引数に後ろ (0.46 のまま)': { mamori: 'const a: number = ((q: number) => q)(b);\nconst b: number = 1;\nexport fn t() -> number {\n  return 0;\n}\n', diagnostics: [at(1, 38, EARLY('b'))] },
};

describe('Mamori 0.47: 直下の初期値でその場で呼ぶ arrow の中でも、宣言より前の名前を使わせない (MG-087)', () => {
  it('★ その場で呼ぶ arrow の本体・引数の既定値が、その宣言・後ろの宣言の const / let / クラスを使う形を、場所と全文つきで断る', () => {
    for (const [name, form] of Object.entries(REFUSED)) {
      const r = compile(form.mamori);
      expect(r.ok, name).toBe(false);
      expect(r.diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(REFUSED).length).toBeGreaterThanOrEqual(27);
  });

  it('★ 同じ形を TypeScript も断る (宣言の順の番号 2448 / 2454 / 2449)', () => {
    for (const [name, form] of Object.entries(REFUSED)) {
      expect(orderCodes(form.ts).length, `${name}: ${JSON.stringify(tsCodes(form.ts))}`).toBeGreaterThan(0);
    }
    // 対照: 物差しは、返した arrow の中から後ろを読む形・値として置く arrow の中のその場の呼び出しには、宣言の順の番号を付けない
    expect(orderCodes('const f = (() => () => b)(); const b: number = 1; export function t(): number { return f(); }')).toEqual([]);
    expect(orderCodes('const f = () => (() => b)(); const b: number = 1; export function t(): number { return f(); }')).toEqual([]);
  });

  it('対照: 前の宣言を使う形・返す arrow や値として置く arrow の中から使う形・呼び戻しは今までどおり通り、生成物の形も宣言の順も崩れない', () => {
    for (const [name, source] of Object.entries(ACCEPTED)) {
      const r = compile(source);
      expect(r.ok, `${name}: ${r.diagnostics.join(' | ')}`).toBe(true);
      expect(shapeMismatch('src/x/m0.mamori', source, r.emitted), name).toEqual([]);
      expect(orderCodes(r.emitted), name).toEqual([]);
    }
    expect(Object.keys(ACCEPTED).length).toBeGreaterThanOrEqual(10);
  });

  it('対照: 前からの断り (局所の名前が直下の名前を隠す・同じブロックの宣言より前・宣言していない名前・直に使う形) は、前の文のまま 1 つだけ答える', () => {
    for (const [name, form] of Object.entries(UNCHANGED)) {
      expect(compile(form.mamori).diagnostics, name).toEqual(form.diagnostics);
    }
    expect(Object.keys(UNCHANGED).length).toBeGreaterThanOrEqual(6);
  });

  it('対照: その場で呼ぶ arrow の本体も、外側の役 (gate / sink) を引き継がない (T-245 のまま —— 持ち込むのは「まだ作られていない名前」だけ)', () => {
    const PRE = 'export vetted VU = "u";\nextern sink { shell } from "electron";\n';
    const minted = compile(`${PRE}export gate fn g(raw: string) -> VU {\n  const v = (() => mint VU(raw))();\n  return mint VU(raw);\n}\n`);
    expect(minted.diagnostics.join('\n')).toContain('印 VU を作れるのは gate 関数の中だけです');
    const leaked = compile(`${PRE}export sink fn leak(u: VU) -> unknown {\n  return (() => shell.openExternal(u))();\n}\n`);
    expect(leaked.diagnostics.join('\n')).toContain('危ない口 shell (extern sink) は sink 関数の中でだけ使えます');
  });
});

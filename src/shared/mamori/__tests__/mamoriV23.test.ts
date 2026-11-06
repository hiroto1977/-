import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { parse } from '../parser';

/*
 * **Mamori 0.23 —— 型引数を持つ関数宣言 `fn f<T, U>(…)` を足す** (2026-11-06 · MG-045)。
 *
 * 名前だけを並べる。**足す前に破った。** 型引数は「呼ぶ側が決める型」なので、(1) 型引数の名前に印の名前を使うと、`u: VettedUrl` が型引数の方を指して
 * 印を持たない値が印を名乗る引数に見える・(2) 制約 `T extends VettedUrl` は型を引数に取る関数が印の型を持てる口・(3) 既定の型 `T = X` は呼ぶ側が
 * 書かなかった型を関数の側が決める・(4) gate / sink を呼ぶ側の型で変えられる形にしない・(5) `typeof` / `import` を型引数の名前にすると、型の綴りの
 * それらと取り違えられる・(6) 型引数で値を包み直して印の無い値を印として通す (`id(raw)` を openUrl へ) ・(7) type / interface / arrow の型引数は 0.23 の外。
 * 0.23 は 1〜7 をすべて断る。
 */

const PRE =
  'extern sink { shell } from "electron";\nexport vetted VettedUrl = "url";\n' +
  'export sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
function compile(source: string): { diagnostics: string[]; output: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { diagnostics: [], output: [...r.outputs.values()][0]! } : { diagnostics: r.diagnostics.map(formatDiagnostic), output: '' };
}
const refused = (source: string): string => compile(source).diagnostics.join('\n');

describe('0.23: 型引数を持つ関数宣言 fn f<T>(…)', () => {
  it('名前を 1 つ・2 つ並べられ、変換は TypeScript の型引数になる', () => {
    expect(compile('export fn id<T>(x: T) -> T {\n  return x;\n}\n').output).toContain('export function id<T>(x: T): T {');
    expect(compile('export fn pair<A, B>(a: A, b: B) -> A {\n  return a;\n}\n').output).toContain('export function pair<A, B>(a: A, b: B): A {');
    expect(compile('fn id<T>(x: T) -> T {\n  return x;\n}\nexport fn go(s: string) -> string {\n  return id<string>(s);\n}\n').diagnostics).toEqual([]);
  });

  it('型引数の無い関数の変換は 0.22 までと変わらない', () => {
    const out = compile('export fn plain(x: string) -> string {\n  return x;\n}\n').output;
    expect(out).toContain('export function plain(x: string): string {');
    expect(out).not.toContain('<');
  });

  it('async の関数にも置ける', () => {
    expect(compile('export async fn f<T>(x: T) -> Promise<T> {\n  return x;\n}\n').output).toContain('export async function f<T>(x: T): Promise<T> {');
  });

  it('構文木は型引数の名前を持つ (無ければ空)', () => {
    const m = parse('src/x/m0.mamori', 'fn f<A, B>(a: A, b: B) -> A {\n  return a;\n}\nfn g(x: string) -> string {\n  return x;\n}\n');
    const fns = m.items.filter((i) => i.kind === 'fn');
    expect(fns.map((f) => (f.kind === 'fn' ? f.typeParams.map((p) => p.name) : null))).toEqual([['A', 'B'], []]);
  });

  it('制約 (extends) は断る', () => {
    expect(refused('fn f<T extends string>(x: T) -> T {\n  return x;\n}\n')).toContain('制約');
    expect(refused(PRE + 'fn f<T extends VettedUrl>(x: T) -> T {\n  return x;\n}\n')).toContain('制約');
  });

  it('既定の型 (= X) は断る', () => {
    expect(refused('fn f<T = string>(x: T) -> T {\n  return x;\n}\n')).toContain('既定の型');
  });

  it('型引数の名前が二重なら断る', () => {
    expect(refused('fn f<T, T>(x: T) -> T {\n  return x;\n}\n')).toContain('型引数 T が二重です');
  });

  it('空の <> と末尾のカンマは断る', () => {
    expect(refused('fn f<>(x: string) -> string {\n  return x;\n}\n')).toContain('名前が要ります');
    expect(refused('fn f<T,>(x: T) -> T {\n  return x;\n}\n')).toContain('名前が要ります');
  });

  it('型引数の名前に印の名前は使えない (M4) —— 印を持たない値が印を名乗る引数に見える', () => {
    const d = refused(PRE + 'fn f<VettedUrl>(u: VettedUrl) -> Promise<void> {\n  return openUrl(u);\n}\n');
    expect(d).toContain('[M4]');
    expect(d).toContain('型引数 VettedUrl は印の名前です');
  });

  it('型引数の名前に typeof / import は使えない (M4)', () => {
    expect(refused('fn f<typeof>(x: number) -> number {\n  return x;\n}\n')).toContain('型引数の名前に `typeof` は置けません');
    expect(refused('fn f<import>(x: number) -> number {\n  return x;\n}\n')).toContain('型引数の名前に `import` は置けません');
  });

  it('gate 関数と sink 関数は型引数を持てない (M4)', () => {
    const g = refused(PRE + 'gate fn g<T>(x: T) -> VettedUrl {\n  return mint VettedUrl("a");\n}\n');
    expect(g).toContain('gate 関数 g は型引数を持てません');
    const s = refused('extern sink { shell } from "electron";\nexport vetted VettedUrl = "url";\nsink fn s<T>(u: VettedUrl, x: T) -> Promise<void> {\n  return shell.openExternal(u);\n}\n');
    expect(s).toContain('sink 関数 s は型引数を持てません');
  });

  it('型引数で包み直しても印は作れない —— 戻り値は印を持たない値のまま (M4)', () => {
    const idFn = 'fn id<T>(x: T) -> T {\n  return x;\n}\n';
    expect(refused(PRE + idFn + 'export fn go(raw: string) -> Promise<void> {\n  return openUrl(id(raw));\n}\n')).toContain('[M4]');
    expect(refused(PRE + idFn + 'export fn go(raw: string) -> unknown {\n  const w: VettedUrl = id(raw);\n  return w;\n}\n')).toContain('[M4]');
    expect(refused(PRE + 'fn f<T>(x: T) -> VettedUrl {\n  return x;\n}\n')).toContain('[M1]');
    expect(refused(PRE + 'fn f<T>(x: T) -> Promise<void> {\n  return openUrl(x);\n}\n')).toContain('[M4]');
  });

  it('型引数に印を置いて呼ぶのは 0.21 から断っている', () => {
    expect(refused(PRE + 'fn id<T>(x: T) -> T {\n  return x;\n}\nexport fn go(raw: string) -> unknown {\n  return id<VettedUrl>(raw);\n}\n')).toContain('型引数に印 VettedUrl は置けません');
  });

  it('type / interface / arrow の型引数は 0.23 の外 (構文の段で断る)', () => {
    expect(refused('type Box<T> = T[];\n')).toContain('[M0]');
    expect(refused('interface B<T> {\n  v: T;\n}\n')).toContain('[M0]');
    expect(refused('export const f = <T>(x: T) => x;\n')).toContain('[M0]');
  });

  it('関数名の直後の < を比較と取り違えない (式の側の < は今までどおり比較)', () => {
    expect(compile('export fn lt(a: number, b: number) -> boolean {\n  return a < b;\n}\n').output).toContain('return a < b;');
  });
});

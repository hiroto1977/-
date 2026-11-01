import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.9 —— ブロックの本体を持つ arrow `(x) => { … }` を足す** (2026-11-01 · MG-008) と、その周で見つけた穴 (T-245)。
 *
 * 足す前に破った (break-first): 本体が文の並びになると、外側の関数の役 (gate / sink) を**引き継いだまま**文が書ける。
 * 0.8 までの式の arrow も同じ穴を持っていた —— sink 関数が危ない口を包んだ閉包を値として返せ、gate の中の arrow で mint も通った (T-245)。
 * 塞ぎ方: arrow の本体 (式もブロックも) と引数の既定値は、外側がどの役でも **plain の役**で検める。これで危ない口 (M2)・印の鋳造 (M1)・
 * 印を返す約束 (戻り値の印) は arrow の中では使えない。break / continue は arrow を跨げない (arrow はループの外の関数)。
 */

const PRE = 'extern sink { shell } from "electron";\nexport vetted VettedUrl = "url";\nexport sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
function compile(source: string): { diagnostics: string[]; output: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { diagnostics: [], output: [...r.outputs.values()][0]! } : { diagnostics: r.diagnostics.map(formatDiagnostic), output: '' };
}
const go = (body: string): string => `${PRE}export fn go(xs: string[], n: number) -> unknown {\n${body}\n}\n`;

describe('0.9: ブロックの本体を持つ arrow', () => {
  it('文の並びを本体に持てる (let / return / if / for / 入れ子の arrow)', () => {
    const r = compile(go('  return xs.map((x) => {\n    let y = x.trim();\n    if (y.length > n) { return y; }\n    for (const c of xs) { y = y + c; }\n    const g = (k: number) => { return k + 1; };\n    return g(n);\n  });'));
    expect(r.diagnostics).toEqual([]);
    expect(r.output).toContain('xs.map((x) => {');
    expect(r.output).toContain('const g = (k: number) => {');
    expect(r.output).toContain('return g(n);');
  });
  it('空の本体も書ける', () => {
    const r = compile(go('  return xs.map((x) => {});'));
    expect(r.diagnostics).toEqual([]);
    expect(r.output).toContain('xs.map((x) => {');
  });
  it('`=> (` は式の arrow のまま・`=> {` は常にブロック (オブジェクトを返すなら括弧で包む)', () => {
    const o = compile(go('  return xs.map((x) => ({ a: x }));'));
    expect(o.diagnostics).toEqual([]);
    expect(o.output).toContain('(x) => ({ a: x })');
    const b = compile(go('  return xs.map((x) => { a: x });'));
    expect(b.diagnostics.length).toBeGreaterThan(0);
  });
  it('引数と引数の既定値は arrow の枠に入る (前の引数を参照できる・外の名前は検められる)', () => {
    expect(compile(go('  return (a: number, b: number = a) => { return b; };')).diagnostics).toEqual([]);
    expect(compile(go('  return (a: number = fetch("x")) => { return a; };')).diagnostics.join('\n')).toContain('宣言していない名前 fetch');
  });
  it('引数へ代入できない (let ではない)', () => {
    expect(compile(go('  return xs.map((x) => { x = "a"; return x; });')).diagnostics.join('\n')).toContain('x は let ではないので代入できません');
  });
  it('break / continue は arrow を跨げない', () => {
    const r = compile(go('  for (const x of xs) { const f = () => { break; }; }\n  return 1;'));
    expect(r.diagnostics.join('\n')).toContain('`break` は for か switch の中にだけ置けます');
    const c = compile(go('  for (const x of xs) { const f = () => { continue; }; }\n  return 1;'));
    expect(c.diagnostics.join('\n')).toContain('continue');
  });
  it('arrow の外のループの break は今までどおり書ける', () => {
    expect(compile(go('  for (const x of xs) { const f = () => { return 1; }; break; }\n  return 1;')).diagnostics).toEqual([]);
  });
  it('宣言していない名前は本体の中でも断られる (M6)', () => {
    expect(compile(go('  return xs.map((x) => { return fetch(x); });')).diagnostics.join('\n')).toContain('宣言していない名前 fetch');
  });
  it('数と宣言した arrow の引数は添字の鍵に使える', () => {
    const r = compile(go('  return (i: number) => { return xs[i]; };'));
    expect(r.diagnostics).toEqual([]);
    expect(r.output).toContain('xs[+(i)]');
  });
});

describe('T-245: arrow の本体は外側の役 (gate / sink) を引き継がない', () => {
  it('★ sink 関数が危ない口を包んだ閉包を返せない・gate の中の arrow で mint できない (threat: T-245)', () => {
    // ブロックの本体
    const leakBlock = compile(`${PRE}export sink fn leak(u: VettedUrl) -> unknown {\n  return () => { return shell.openExternal(u); };\n}\n`);
    expect(leakBlock.diagnostics.join('\n')).toContain('危ない口 shell (extern sink) は sink 関数の中でだけ使えます');
    // 式の本体 (0.2〜0.8 から在った同じ穴)
    const leakExpr = compile(`${PRE}export sink fn leak(u: VettedUrl) -> unknown {\n  return () => shell.openExternal(u);\n}\n`);
    expect(leakExpr.diagnostics.join('\n')).toContain('危ない口 shell (extern sink) は sink 関数の中でだけ使えます');
    // gate の中の arrow での mint (ブロックと式)
    const mintBlock = compile(`${PRE}export gate fn g(raw: string) -> VettedUrl {\n  const f = () => { return mint VettedUrl(raw); };\n  return mint VettedUrl(raw);\n}\n`);
    expect(mintBlock.diagnostics.join('\n')).toContain('印 VettedUrl を作れるのは gate 関数の中だけです');
    const mintExpr = compile(`${PRE}export gate fn g(raw: string) -> VettedUrl {\n  const f = () => mint VettedUrl(raw);\n  return mint VettedUrl(raw);\n}\n`);
    expect(mintExpr.diagnostics.join('\n')).toContain('印 VettedUrl を作れるのは gate 関数の中だけです');
  });
  it('対照: gate / sink 関数の本体そのものは今までどおり mint / 危ない口を使える', () => {
    expect(compile(`${PRE}export gate fn g(raw: string) -> VettedUrl {\n  return mint VettedUrl(raw);\n}\n`).diagnostics).toEqual([]);
    expect(compile(PRE).diagnostics).toEqual([]);
  });
});

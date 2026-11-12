import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { parse } from '../parser';

/*
 * **Mamori 0.22 —— 省ける引数 `x?: T` を足す** (2026-11-05 · MG-043)。
 *
 * 呼ぶ側が省ける引数。省いた引数の値は `undefined`。fn の引数と arrow の引数の両方に置ける。
 *
 * **足す前に破った。** 省ける引数は「値が無いかもしれない」口なので、(1) 印の型を名乗る引数を省ければ、印を受ける口へ**印の無い値 (undefined)** を
 * 渡せる (T-238 は「印を受ける引数を渡さない呼び出し」を断る検めで、省ける引数はその裏口になる)・(2) `x?: VettedUrl | null` のように印を
 * 含む綴りも同じ・(3) 省ける `number` は静的に数とは言えない (添字の鍵に使えない)・(4) `x?` に型が無いと暗黙の any・(5) `x?: T = v` は意味が二重・
 * (6) 省けない引数を省ける引数の後ろに置くと、位置で渡す呼び出しの意味がずれる。0.22 は 1〜6 をすべて断る。
 */

const PRE =
  'extern sink { shell } from "electron";\nexport vetted VettedUrl = "url";\n' +
  'export sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
function compile(source: string): { diagnostics: string[]; output: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { diagnostics: [], output: [...r.outputs.values()][0]! } : { diagnostics: r.diagnostics.map(formatDiagnostic), output: '' };
}
const withFn = (sig: string, body = '  return 1;'): string => `${PRE}export fn go(${sig}) -> unknown {\n${body}\n}\n`;

describe('0.22: 省ける引数 x?: T', () => {
  it('fn の引数に置け、生成物は `x?: T` のまま出る', () => {
    const a = compile(withFn('a: string, b?: number, c?: string[]'));
    expect(a.diagnostics).toEqual([]);
    expect(a.output).toContain('export function go(a: string, b?: number, c?: string[]): unknown');
  });

  it('arrow の引数にも置ける', () => {
    const a = compile(withFn('xs: string[]', '  return xs.map((x, i?: number) => x);'));
    expect(a.diagnostics).toEqual([]);
    expect(a.output).toContain('(x, i?: number) =>');
  });

  it('名前だけの arrow `x => x` の引数は省ける引数ではない (生成物に `?` が出ない)', () => {
    const a = compile(withFn('xs: string[]', '  return xs.map(x => x);'));
    expect(a.diagnostics).toEqual([]);
    expect(a.output).toContain('xs.map((x) => x)');
    expect(a.output).not.toContain('x?');
  });

  it('省ける引数が無い関数の生成物は 0.21 までと変わらない', () => {
    const a = compile(withFn('a: string, b: number'));
    expect(a.output).toContain('go(a: string, b: number)');
    expect(a.output).not.toContain('?:');
  });

  it('既定値つきの引数 (x: T = v) は今までどおり通り、省ける引数とは別', () => {
    const a = compile(withFn('a: string, b: number = 1'));
    expect(a.diagnostics).toEqual([]);
    expect(a.output).toContain('b: number = 1');
  });

  it('印の型を名乗る引数は省けない (M4) —— 省けば印の無い undefined が印を受ける口へ届く', () => {
    const d = compile(withFn('u?: VettedUrl', '  return openUrl(u);')).diagnostics.join('\n');
    expect(d).toContain('M4');
    expect(d).toContain('省ける引数 u?: は印 VettedUrl を名乗れません');
    // 印を含む綴り (null / 配列 / 入れ子) も同じ
    expect(compile(withFn('u?: VettedUrl | null')).diagnostics.join('\n')).toContain('M4');
    expect(compile(withFn('u?: VettedUrl[]')).diagnostics.join('\n')).toContain('M4');
    expect(compile(withFn('a: string, u?: Array<VettedUrl>')).diagnostics.join('\n')).toContain('M4');
  });

  it('arrow の省ける引数が印の型を名乗る形も断る', () => {
    const d = compile(withFn('xs: string[]', '  return xs.map((u?: VettedUrl) => openUrl(u));')).diagnostics.join('\n');
    expect(d).toContain('M4');
  });

  it('sink 関数の行き先 (第 1 引数) も省けない', () => {
    const src = 'extern sink { shell } from "electron";\nexport vetted VettedUrl = "url";\nexport sink fn openUrl(u?: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
    const d = compile(src).diagnostics.join('\n');
    expect(d).toContain('M4');
  });

  it('省ける number は静的に数と分からない (添字の鍵にできない)', () => {
    // 必須の number は鍵にできる (0.8)
    expect(compile(withFn('xs: string[], n: number', '  return xs[n] === "a";')).diagnostics).toEqual([]);
    // 省ける number は undefined かもしれない
    expect(compile(withFn('xs: string[], n?: number', '  return xs[n] === "a";')).diagnostics.join('\n')).toContain('M6');
  });

  it('型の無い省ける引数 `x?` は断る', () => {
    const d = compile(withFn('a?')).diagnostics.join('\n');
    expect(d).toContain('省ける引数 `x?` には型が要ります');
  });

  it('省ける引数に既定値は置けない', () => {
    const d = compile(withFn('a?: number = 1')).diagnostics.join('\n');
    expect(d).toContain('省ける引数 `x?: T` に既定値');
  });

  it('省ける引数の後ろに省けない引数は置けない (既定値つきなら置ける)', () => {
    expect(compile(withFn('a?: number, b: string')).diagnostics.join('\n')).toContain('省ける引数 `x?: T` の後ろに、省けない引数は置けません');
    expect(compile(withFn('a?: number, b?: string')).diagnostics).toEqual([]);
    expect(compile(withFn('a?: number, b: string = "x"')).diagnostics).toEqual([]);
  });

  it('構文木の optional は引数ごと (省ける引数と省けない引数が混ざる)', () => {
    const m = parse('src/x/m0.mamori', withFn('a: string, b?: number, c?: string'));
    const fn = m.items.find((it) => it.kind === 'fn' && it.name === 'go');
    expect(JSON.stringify(fn)).toContain('"params":[{"name":"a","optional":false');
    expect(JSON.stringify(fn)).toContain('"name":"b","optional":true');
    expect(JSON.stringify(fn)).toContain('"name":"c","optional":true');
  });

  it('三項演算子 `a ? b : c` は省ける引数と読まれない', () => {
    const a = compile(withFn('c: boolean, n: number, m: number', '  return c ? n : m;'));
    expect(a.diagnostics).toEqual([]);
    expect(a.output).toContain('c ? n : m');
  });
});

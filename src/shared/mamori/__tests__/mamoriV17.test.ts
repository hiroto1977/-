import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.17 —— 欄への代入 `o.k = v;` (MG-033)。** 足す前に破った。
 *
 * 書けるのは、この関数の中で `const o = { … }` と作った物の欄だけ。塞いだ道は 8 つ:
 *   ① 引数・外の名前・組み込みの欄への代入 —— 他のモジュールと共有している物を書き換えると、他の関門の判定まで変わる
 *   ② `let` の物 —— 別の物 (引数) を入れ直せるので、作った物とは限らない
 *   ③ 別名 (`const p = o; p.k = 1`) ・分割代入・回す変数・モジュール直下の const
 *   ④ 欄の名前が `constructor` / `prototype` / `__proto__` (T-224 の表)
 *   ⑤ 入れ子・計算した左辺・`?.` の左辺 (`a.b.c = v` `f().k = v` `o?.k = v`)
 *   ⑥ 計算した鍵の添字の結果を値にする (T-257 —— 入れ物へ包むと取り出した側で inert の印が消える)
 *   ⑦ 印の型の物は object で作れない (M4) ので owned にならない
 *   ⑧ 宣言していない名前の欄
 *
 * 同じ周で、足す前の破りで **T-257** が出た: 0.12 の inert (計算した鍵の添字の結果) は、オブジェクト・配列・戻り値・呼び出しの引数・
 * 添字への代入・for の相手・arrow の戻り値・`??` / `||` / `&&` の片方に包むと、取り出した側で印が消え `o.g(1)` と呼べた (5 形 + 4 形)。
 */
function diag(source: string): string[] {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
function ts(source: string): string {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return [...r.outputs.values()][0]!;
}
const fn = (body: string): string => `export fn f(p: { k: number }, xs: Array<number>, n: number) -> number {\n${body}\n  return 1;\n}\n`;

describe('0.17 欄への代入 (threat: T-256)', () => {
  it('★ 作った const のオブジェクトの欄へは書ける (生成物は TypeScript の代入そのまま)', () => {
    const out = ts(fn('  const o = { a: 1 };\n  o.a = n + 1;\n  o.b = 2;'));
    expect(out).toContain('o.a = n + 1;');
    expect(out).toContain('o.b = 2;');
  });

  it('★ 引数の欄・外の名前の欄・組み込みの欄へは書けない (共有の物を書き換えない)', () => {
    expect(diag(fn('  p.k = 2;')).join('\n')).toMatch(/M6.*p の欄へは代入できません/);
    expect(diag(fn('  Math.max = 2;')).join('\n')).toMatch(/M6/);
    expect(diag(fn('  JSON.parse = 2;')).join('\n')).toMatch(/M6/);
    expect(diag(fn('  Object.prototype = 2;')).join('\n')).not.toEqual('');
    expect(diag(fn('  zzz.k = 2;')).join('\n')).toMatch(/M6.*宣言していない名前 zzz/);
  });

  it('★ let の物・別名・分割代入の物・回す変数・モジュール直下の const へは書けない', () => {
    expect(diag(fn('  let o = { a: 1 };\n  o.a = 2;')).join('\n')).toMatch(/M6.*o の欄へは代入できません/);
    expect(diag(fn('  const o = { a: 1 };\n  const q = o;\n  q.a = 2;')).join('\n')).toMatch(/M6.*q の欄へは代入できません/);
    expect(diag(fn('  const { k } = p;\n  k.x = 2;')).join('\n')).toMatch(/M6.*k の欄へは代入できません/);
    expect(diag(fn('  for (const e of xs) {\n    e.k = 2;\n  }')).join('\n')).toMatch(/M6.*e の欄へは代入できません/);
    expect(diag(`const shared = { a: 1 };\nexport fn f() -> number {\n  shared.a = 2;\n  return 1;\n}\n`).join('\n')).toMatch(/M6.*shared の欄へは代入できません/);
  });

  it('★ 欄の名前が constructor / prototype / __proto__ なら断る (T-224 の表)', () => {
    for (const k of ['constructor', 'prototype', '__proto__']) {
      expect(diag(fn(`  const o = { a: 1 };\n  o.${k} = 2;`)).join('\n'), k).toMatch(/Mamori に在りません|置けません|書けません/);
    }
  });

  it('★ 入れ子・計算した左辺・?. の左辺は断る', () => {
    expect(diag(fn('  const o = { a: { b: 1 } };\n  o.a.b = 2;')).join('\n')).toMatch(/M0.*欄への代入は/);
    expect(diag(fn('  const o = { a: 1 };\n  o?.a = 2;')).join('\n')).toMatch(/M0/);
    expect(diag(fn('  Math.abs(1).k = 2;')).join('\n')).toMatch(/M0/);
  });

  it('★ 計算した鍵の添字の結果を欄へ入れられない (inert の洗浄)', () => {
    expect(diag(fn('  const o = { a: 1 };\n  o.a = xs[n];')).join('\n')).toMatch(/M6.*欄への代入に入れられません/);
    expect(diag(fn('  const o = { a: 1 };\n  const g = xs[n];\n  o.a = g;')).join('\n')).toMatch(/M6.*欄への代入に入れられません/);
  });

  it('★ 欄の値も他の式と同じ検めを通る (宣言していない名前・危ない口)', () => {
    expect(diag(fn('  const o = { a: 1 };\n  o.a = zzz;')).join('\n')).toMatch(/M6.*宣言していない名前 zzz/);
    const withSink = 'extern sink global window;\nexport fn f() -> number {\n  const o = { a: 1 };\n  o.a = window.open;\n  return 1;\n}\n';
    expect(diag(withSink).join('\n')).toMatch(/M2/);
  });

  it('★ 印の型の物を object で作ろうとすると M4 が先に断る (印を持つ物は owned にならない)', () => {
    const src = 'export vetted VettedUrl = "url";\nexport fn f() -> number {\n  const u: VettedUrl = { a: 1 };\n  u.a = 2;\n  return 1;\n}\n';
    expect(diag(src).join('\n')).toMatch(/M4/);
  });
});

describe('0.17 T-257 計算した鍵の添字の結果を入れ物・戻り値・引数へ包めない (threat: T-257)', () => {
  const H = 'export fn f(xs: Array<(a: number) => number>, n: number, d: (a: number) => number) -> number {\n';
  const wrap = (body: string): string => `${H}${body}\n}\n`;

  it('★ オブジェクト・配列・添字への代入・for の相手・arrow の戻り値に入れられない', () => {
    expect(diag(wrap('  const o = { g: xs[n] };\n  return o.g(1);')).join('\n')).toMatch(/M6.*オブジェクトに入れられません/);
    expect(diag(wrap('  const a = [xs[n]];\n  return a[0](1);')).join('\n')).toMatch(/M6.*配列に入れられません/);
    expect(diag(wrap('  const out = [d];\n  out[0] = xs[n];\n  return out[0](1);')).join('\n')).toMatch(/M6.*配列の添字への代入に入れられません/);
    expect(diag(wrap('  for (const g of xs[n]) {\n    return g(1);\n  }\n  return 0;')).join('\n')).toMatch(/M6.*for の回す相手に入れられません/);
    expect(diag(wrap('  const h = () => xs[n];\n  return 1;')).join('\n')).toMatch(/M6.*arrow の戻り値に入れられません/);
    expect(diag(wrap('  const a = [...xs[n]];\n  return 1;')).join('\n')).toMatch(/M6/);
  });

  it('★ 戻り値・呼び出しの引数・new の引数に入れられない', () => {
    expect(diag('fn pick(ys: Array<(a: number) => number>, k: number) -> (a: number) => number {\n  return ys[k];\n}\nexport fn f() -> number {\n  return 1;\n}\n').join('\n')).toMatch(/M6.*戻り値に入れられません/);
    expect(diag('fn id(g: (a: number) => number) -> (a: number) => number {\n  return g;\n}\nexport fn f(xs: Array<(a: number) => number>, n: number) -> number {\n  const g = id(xs[n]);\n  return g(1);\n}\n').join('\n')).toMatch(/M6.*呼び出しの引数に入れられません/);
    expect(diag(wrap('  const e = new Error(xs[n]);\n  return 1;')).join('\n')).toMatch(/M6.*`new` の引数に入れられません/);
  });

  it('★ ?? / || / && の片方になっても inert は消えない (呼べない)', () => {
    for (const op of ['??', '||', '&&']) {
      expect(diag(wrap(`  const g = xs[n] ${op} d;\n  return g(1);`)).join('\n'), op).toMatch(/M6.*計算した鍵の添字の結果は呼び出せません/);
    }
  });

  it('★ 数・文字列・真偽だけになる組み込みへの引数・比較・算術・条件の中は今までどおり通る (対照)', () => {
    expect(diag('export fn f(xs: Array<number>, n: number) -> number {\n  return Math.max(xs[n], 0) + Number(xs[n]) + (xs[n] > 1 ? 1 : 0) + String(xs[n]).length;\n}\n')).toEqual([]);
    expect(diag('export fn f(xs: Array<number>, n: number) -> number {\n  const v = xs[n];\n  if (v > 2) {\n    return v + 1;\n  }\n  return 0;\n}\n')).toEqual([]);
    // 束縛をそのまま返すのは断る (戻り値に包むのと同じ)
    expect(diag('export fn f(xs: Array<number>, n: number) -> number {\n  const v = xs[n];\n  return v;\n}\n').join('\n')).toMatch(/M6.*戻り値に入れられません/);
  });
});

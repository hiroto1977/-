import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { parse } from '../parser';

/*
 * **Mamori 0.21 —— 型引数つきの呼び出し `f<T>(…)` と `new C<T>(…)` を足す** (2026-11-05 · MG-041)。
 *
 * **足す前に破った。** 型引数は**型の綴りを生成物へそのまま運ぶ**ので、(1) 型を引数に取る関数 (`fromJson<T>(s): T`) へ
 * 印の型を渡すと、tsc は戻り値を印を名乗る値として扱い `mint` を通らずに印が出来る (M4 と同じ穴)・(2) `typeof u` は
 * 印を持つ値の型を名指しできる・(3) `import("…")` は別の module の型を名指しできる・(4) 型の綴りに式を隠す (T-250)。
 * 0.21 は型引数に印の型・`typeof`・`import` を置く形を断り、型の綴りは宣言の型と同じ `typeRef` (許可表と括弧の突き合わせ) を通す。
 * 比較 `a < b` と見分けるため、型引数として読めて**直後に `(` が来る**ときだけ呼び出しと読む (TypeScript と同じ解き方)。
 */

const PRE =
  'extern sink { shell } from "electron";\nextern pure { fromJson } from "./h";\nexport vetted VettedUrl = "url";\n' +
  'export sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
function compile(source: string): { diagnostics: string[]; output: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { diagnostics: [], output: [...r.outputs.values()][0]! } : { diagnostics: r.diagnostics.map(formatDiagnostic), output: '' };
}
const go = (body: string, params = 'xs: string[], n: number, m: number, c: boolean, raw: string'): string =>
  `${PRE}export fn go(${params}) -> unknown {\n${body}\n}\n`;
const diag = (body: string, params?: string): string[] => compile(go(body, params)).diagnostics;
const out = (body: string): string => compile(go(body)).output;

describe('0.21: 型引数つきの呼び出し', () => {
  it('f<T>(x) と new C<T>(x) が通り、生成物は型引数をそのまま出す', () => {
    const a = compile(go('  const v = fromJson<string>(raw);\n  const s = new Set<string>(xs);\n  return [v, s];'));
    expect(a.diagnostics).toEqual([]);
    expect(a.output).toContain('fromJson<string>(raw)');
    expect(a.output).toContain('new Set<string>(xs)');
  });

  it('型引数が複数・入れ子でも通る (`>>` は 2 つの `>`)', () => {
    const a = compile(go('  const v = fromJson<Map<string, number[]>, boolean>(raw);\n  return v;'));
    expect(a.diagnostics).toEqual([]);
    expect(a.output).toContain('fromJson<Map<string, number[]>, boolean>(raw)');
    const b = compile(go('  const v = fromJson<Array<Array<number>>>(raw);\n  return v;'));
    expect(b.diagnostics).toEqual([]);
    expect(b.output).toContain('fromJson<Array<Array<number>>>(raw)');
  });

  it('メンバの呼び出しにも型引数を付けられる', () => {
    const a = compile(go('  const v = xs.map<number>((x) => n);\n  return v;'));
    expect(a.diagnostics).toEqual([]);
    expect(a.output).toContain('xs.map<number>(');
  });

  it('比較 `a < b` は今までどおり比較のまま (型引数と読まない)', () => {
    expect(out('  return n < m;')).toContain('n < m');
    // T-260: 式の中の `<` の比べは必ず括る (TypeScript が `a < b, c > (d)` を型引数つきの呼び出しと読まないように)
    expect(out('  return n < m && m > n;')).toContain('(n < m) && m > n');
    // `a < b > (c)` は型引数つきの呼び出しと読む (TypeScript と同じ)
    expect(out('  return n < m > (c);')).toContain('n<m>(c)');
  });

  it('`>=` は型引数の閉じにならず、比較として読まれる', () => {
    expect(out('  return n < m >= n;')).toContain('(n < m) >= n');
  });

  it('型引数なしの呼び出しの生成物は 0.20 までと変わらない', () => {
    const a = compile(go('  const s = new Set(xs);\n  return s;'));
    expect(a.diagnostics).toEqual([]);
    expect(a.output).toContain('new Set(xs)');
    expect(a.output).not.toContain('Set<');
  });

  it('型引数に印の型を置く形は断る (M4)', () => {
    const d = diag('  return fromJson<VettedUrl>(raw);');
    expect(d.join('\n')).toContain('型引数に印 VettedUrl は置けません');
    expect(diag('  return fromJson<VettedUrl | null>(raw);').join('\n')).toContain('M4');
    expect(diag('  return fromJson<Array<VettedUrl>>(raw);').join('\n')).toContain('M4');
    expect(diag('  return fromJson<string, VettedUrl>(raw);').join('\n')).toContain('M4');
    expect(diag('  return new Set<VettedUrl>(xs);').join('\n')).toContain('M4');
  });

  it('型引数の `typeof` / `import` は断る (印を持つ値の型・別 module の型を名指しできる)', () => {
    expect(diag('  const u = raw;\n  return fromJson<typeof u>(raw);').join('\n')).toMatch(/M4.*型引数に `typeof` は置けません/);
    // T-260: `import("./h").T` は 1 つの型として読めない (型の文法に `import(…)` は無い) ので、型引数の試し読みが外れて
    // 比べ `fromJson < import(…)…` として読まれ、宣言していない名前 `import` で断られる (TypeScript が型引数と読む形を Mamori が通すことは無い)。
    expect(diag('  return fromJson<import("./h").T>(raw);').join('\n')).toMatch(/M6.*宣言していない名前 import/);
    expect(diag('  return new Set<typeof raw>(xs);').join('\n')).toContain('`typeof`');
  });

  it('型の綴りに式・文を隠す形は型の段で断る (T-250 と同じ許可表)', () => {
    // `;` は文の切れ目 / `=` や `{ … }` の外の式の記号は型に要らない
    expect(diag('  return fromJson<Array<number>= 1; 2 >(raw);')).not.toEqual([]);
    expect(diag('  return fromJson<string; raw>(raw);')).not.toEqual([]);
  });

  it('型引数は `,` で区切って 1 つずつ読む (構文木の typeArgs)', () => {
    const m = parse('src/x/m0.mamori', go('  return fromJson<Map<string, number[]>, boolean>(raw);'));
    const fn = m.items.find((it) => it.kind === 'fn' && it.name === 'go');
    const ret = JSON.stringify(fn);
    expect(ret).toContain('"text":"Map<string, number[]>"');
    expect(ret).toContain('"text":"boolean"');
    expect(ret).not.toContain('"text":"Map<string, number[]>, boolean"');
    // 3 つ目以降も `,` で区切る
    const three = JSON.stringify(parse('src/x/m0.mamori', go('  return fromJson<string, number, boolean>(raw);')).items.find((it) => it.kind === 'fn' && it.name === 'go'));
    expect(three).toContain('"text":"number"');
    expect(three).toContain('"text":"boolean"');
    expect(three).not.toContain('"text":"number, boolean"');
    const n = parse('src/x/m0.mamori', go('  return new Map<string, number>();'));
    expect(JSON.stringify(n.items.find((it) => it.kind === 'fn' && it.name === 'go'))).toContain('"typeArgs":[{"text":"string"');
  });

  it('呼ぶ側が名前でもメンバでもなければ `<` は比較のまま (添字・呼び出しの結果に型引数は付けない)', () => {
    // T-260: 生成物は `(xs[0] < n) > m` —— 括らない `xs[0] < n > (m === 1)` は TypeScript が `xs[0]<n>(m === 1)` (呼び出し) と読む
    expect(out('  return xs[0] < n > (m);')).toContain('(xs[0] < n) > m');
    expect(out('  return fromJson(raw) < n > (m);')).toContain('(fromJson(raw) < n) > m');
  });

  it('型引数の直後が `(` でなければ呼び出しではない (比較の途中を型引数と読み違えない)', () => {
    expect(out('  return xs.length < n && n > m;')).toContain('(xs.length < n) && n > m');
  });

  it('引数の並びの中の `a < b, c > (d)` は TypeScript と同じく型引数つきの呼び出しと読む', () => {
    expect(out('  return fromJson(n < m, c > (raw));')).toContain('fromJson(n<m, c>(raw))');
  });
});

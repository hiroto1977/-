import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.12 —— 計算した鍵の添字を inert にし、添字への代入を足す** (2026-11-03 · MG-016 · threat: T-250 / T-251)。
 *
 * 0.8 は添字を足すとき、文字列になりうる鍵を断り、字面の識別子は `.name` に畳んだ。残っていたのは次の 2 つ。
 *
 * 1. **計算した鍵の結果** (`xs[n]`・`xs[n - 1]`) を、呼び出し・`new`・メンバ・次の添字の相手にできた。
 *    `const f = xs[n]; f(…)` も通った (束縛が印を洗す)。T-250。
 * 2. **代入 `out[i] = v` が無かった。** 足すなら、字面の鍵は禁じた名前の表を通し、計算した鍵は数だけにする。
 *    そうしないと `out["__proto__"] = v` と `out[k] = v` が原型を差し替える。T-251。
 *
 * 字面の鍵 (`xs[0]`・`o["content-type"]`) の結果は inert ではない。禁じた名前は字面の時点で断っている。
 */

const PRE = 'extern sink { shell } from "electron";\nexport vetted VettedUrl = "url";\nexport sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
function compile(source: string): { diagnostics: string[]; output: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { diagnostics: [], output: [...r.outputs.values()][0]! } : { diagnostics: r.diagnostics.map(formatDiagnostic), output: '' };
}
const go = (body: string, params = 'u: string, o: Record<string, string>, xs: string[], n: number, out: number[]'): string =>
  `${PRE}export fn go(${params}) -> unknown {\n${body}\n}\n`;
const diag = (body: string, params?: string): string[] => compile(go(body, params)).diagnostics;

describe('0.12: 計算した鍵の結果は inert (threat: T-250)', () => {
  it('★ 計算した鍵の結果は、呼び出し・new・メンバ・次の添字の相手にできない (threat: T-250)', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['return xs[n]();', '呼び出せません'],
      ['const f = xs[n];\n  return new f();', 'new の相手にできません'],
      ['return xs[n].length;', 'メンバの相手にできません'],
      ['return xs[n][0];', '次の添字の相手にできません'],
      ['return xs[n - 1].length;', 'メンバの相手にできません'],
      ['return xs[xs.length - 1]();', '呼び出せません'],
    ];
    for (const [body, text] of cases) {
      const d = diag(`  ${body}`);
      expect(d, body).toHaveLength(1);
      expect(d[0], body).toContain('[M6]');
      expect(d[0], body).toContain(text);
    }
  });

  it('★ 束縛へ写しても印は残る。条件の片方と await と、もう一段の名前も (threat: T-250)', () => {
    expect(diag('  const f = xs[n];\n  return f();')[0]).toContain('呼び出せません');
    expect(diag('  const f = xs[n];\n  const g = f;\n  return g();')[0]).toContain('呼び出せません');
    expect(diag('  const f = n === 0 ? xs[0] : xs[n];\n  return f();')[0]).toContain('呼び出せません');
    expect(diag('  const f = n === 0 ? xs[n] : xs[0];\n  return f();')[0]).toContain('呼び出せません');
    expect(diag('  let f = xs[0];\n  f = xs[n];\n  return f();')[0]).toContain('呼び出せません');
    expect(diag('  let f = xs[n];\n  f = xs[0];\n  return f();')[0]).toContain('呼び出せません');
    const awaited = compile(`${PRE}export async fn go(xs: string[], n: number) -> unknown {\n  const f = await xs[n];\n  return f();\n}\n`);
    expect(awaited.diagnostics[0]).toContain('呼び出せません');
    expect(diag('  const row = xs[n];\n  return row.length;')[0]).toContain('メンバの相手にできません');
    expect(diag('  const row = xs[n];\n  return row[0];')[0]).toContain('次の添字の相手にできません');
  });

  it('字面の鍵の結果は呼び出せる。識別子にならない文字列も、数の初期値の const も', () => {
    expect(diag('  return xs[0]();')).toEqual([]);
    expect(diag('  return xs[0].length;')).toEqual([]);
    expect(diag('  return xs[0][1];')).toEqual([]);
    expect(diag('  const f = xs[0];\n  return f();')).toEqual([]);
    expect(diag('  return o["content-type"].length;')).toEqual([]);
    expect(diag('  const f = n === 0 ? xs[0] : xs[1];\n  return f();')).toEqual([]);
    expect(diag('  const f = xs[0];\n  return new f();')).toEqual([]);
    expect(diag('  const f = !xs[n];\n  return f;')).toEqual([]);
    const awaited = compile(`${PRE}export async fn go(xs: string[], n: number) -> unknown {\n  const f = await xs[0];\n  return f();\n}\n`);
    expect(awaited.diagnostics).toEqual([]);
    expect(compile('const N = 1;\nconst XS = ["a", "b"];\nconst F = XS[N];\nexport fn go() -> unknown {\n  return F();\n}\n').diagnostics[0]).toContain('呼び出せません');
  });

  it('内側の let へ付けた印は、外側の同名の名前へ漏れない', () => {
    const d = diag('  let f = xs[0];\n  if (n === 0) {\n    let f = xs[0];\n    f = xs[n];\n    return f();\n  }\n  return 1;');
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('呼び出せません');
  });

  it('内側の if から外側の let へ代入しても印は付く。モジュールの const を一段写しても残る', () => {
    expect(diag('  let f = xs[0];\n  if (n === 0) {\n    f = xs[n];\n  }\n  return f();')[0]).toContain('呼び出せません');
    const mod = compile('const N = 1;\nconst XS = ["a", "b"];\nconst F = XS[N];\nconst G = F;\nexport fn go() -> unknown {\n  return G();\n}\n');
    expect(mod.diagnostics[0]).toContain('呼び出せません');
  });

  it('単項の ! は印を運ばない。添字の中の宣言していない名前は、呼び出しを断ったあとでも名指しする', () => {
    expect(diag('  const f = !xs[n];\n  return f();')).toEqual([]);
    expect(diag('  return xs[missing]();').join('\n')).toContain('宣言していない名前 missing');
    expect(diag('  return xs[missing].length;').join('\n')).toContain('宣言していない名前 missing');
  });
});

describe('0.12: 添字への代入 (threat: T-251)', () => {
  it('数リテラルと数と分かる鍵は通り、生成物は数に寄せる', () => {
    expect(compile(go('  out[0] = 1;\n  return out;')).output).toContain('out[0] = 1;');
    expect(compile(go('  out[i] = 1;\n  return out;', 'out: number[], i: number')).output).toContain('out[+(i)] = 1;');
    expect(compile(go('  out[n - 1] = n;\n  return out;')).output).toContain('out[+(n - 1)] = n;');
    expect(compile(go('  out["content-type"] = 1;\n  return out;')).output).toContain('out["content-type"] = 1;');
    expect(diag('  out[0] = 1;\n  return out;')).toEqual([]);
  });

  it('★ 計算した文字列の鍵・欄への代入・禁じた名前は断る (threat: T-251)', () => {
    const dynamic = diag('  out[u] = 1;\n  return out;');
    expect(dynamic).toHaveLength(1);
    expect(dynamic[0]).toContain('[M6]');
    expect(dynamic[0]).toContain('添字への代入の鍵は');
    expect(diag('  out[u + "x"] = 1;\n  return out;')[0]).toContain('添字への代入の鍵は');
    const member = diag('  o.f = u;\n  return o;');
    expect(member[0]).toContain('欄への代入');
    for (const k of ['"__proto__"', '"constructor"', '"prototype"', '"\\u0063onstructor"']) {
      const d = diag(`  out[${k}] = 1;\n  return out;`);
      expect(d, k).toHaveLength(1);
      expect(d[0], k).toContain('[M0]');
    }
  });

  it('★ 計算した鍵の結果を、代入の相手にできない (threat: T-250)', () => {
    const nested = diag('  xs[n][0] = u;\n  return xs;');
    expect(nested[0]).toContain('[M6]');
    expect(nested[0]).toContain('代入できません');
    expect(diag('  const row = xs[n];\n  row[0] = u;\n  return row;')[0]).toContain('代入できません');
    expect(diag('  const row = xs[0];\n  row[0] = u;\n  return row;')).toEqual([]);
  });

  it('代入の相手・鍵・値に隠した宣言していない名前を落とさない', () => {
    expect(diag('  missing[0] = 1;\n  return 1;').join('\n')).toContain('宣言していない名前 missing');
    expect(diag('  out[missing.length] = 1;\n  return out;').join('\n')).toContain('宣言していない名前 missing');
    expect(diag('  out[0] = missing;\n  return out;').join('\n')).toContain('宣言していない名前 missing');
    expect(diag('  const f = xs[n];\n  return new f(missing);').join('\n')).toContain('宣言していない名前 missing');
  });

  it('複合代入と `?.[` は、代入を足しても無い', () => {
    expect(diag('  out[0] += 1;\n  return out;').length).toBeGreaterThan(0);
    expect(compile(go('  return out?.[0];')).diagnostics[0]).toContain('`?.[`');
  });
});

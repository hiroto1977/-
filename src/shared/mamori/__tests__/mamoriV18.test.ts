import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.18 —— 共有の配列を書き換えさせない** (2026-11-05 · MG-034 · threat: T-258)。
 *
 * 0.17 は欄への代入を「この関数の中で `const o = { … }` と作った物」だけにしたが、**配列には同じ規則が掛かっていなかった**。
 * 添字への代入 (`HOSTS[0] = "evil"`) と、配列を書き換えるメソッド (`HOSTS.push("evil")`) は、モジュール直下の許可リスト・
 * 引数で渡された配列・import した配列に通り、別の関数が読む許可リスト (関門の判定) を書き換えられた。
 * 0.18 は、この 2 つの受け手も「この関数の中で `const a = [ … ]` と作った配列」だけにする。
 */

function diagnostics(source: string): string[] {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
const fn = (body: string, params = 'xs: string[]'): string => `export fn go(${params}) -> unknown {\n${body}\n}\n`;
const MUTATORS = ['push("x")', 'pop()', 'shift()', 'unshift("x")', 'splice(0, 1)', 'sort()', 'reverse()', 'fill("x")', 'copyWithin(0, 1)'];

describe('0.18: 共有の配列は書き換えられない (threat: T-258)', () => {
  it('★ モジュール直下の許可リストへの添字の代入・メソッドを断る (threat: T-258)', () => {
    const decl = 'const HOSTS: string[] = ["a"];\n';
    const idx = diagnostics(`${decl}${fn('  HOSTS[0] = "evil";\n  return HOSTS;', '')}`);
    expect(idx).toHaveLength(1);
    expect(idx[0]).toContain('[M6]');
    expect(idx[0]).toContain('作った配列だけ');
    for (const call of MUTATORS) {
      const d = diagnostics(`${decl}${fn(`  HOSTS.${call};\n  return HOSTS;`, '')}`);
      expect(d, call).toHaveLength(1);
      expect(d[0], call).toContain('作った配列だけ');
    }
  });

  it('★ 引数で渡された配列・let・入れ子の欄の配列も書き換えられない (threat: T-258)', () => {
    expect(diagnostics(fn('  xs[0] = "evil";\n  return xs;'))[0]).toContain('作った配列だけ');
    expect(diagnostics(fn('  xs.push("evil");\n  return xs;'))[0]).toContain('作った配列だけ');
    expect(diagnostics(fn('  let ys: string[] = ["a"];\n  ys.push("b");\n  return ys;'))[0]).toContain('作った配列だけ');
    expect(diagnostics(fn('  let ys: string[] = ["a"];\n  ys[0] = "b";\n  return ys;'))[0]).toContain('作った配列だけ');
    // 欄の中の配列 (`o.list`) は、作った入れ物の物でも名前が無いので書き換えられない
    expect(diagnostics(fn('  const o = { list: ["a"] };\n  o.list.push("b");\n  return o;'))[0]).toContain('作った配列だけ');
    // 別名を作っても作った物にはならない
    expect(diagnostics(fn('  const ys = xs;\n  ys.push("b");\n  return ys;'))[0]).toContain('作った配列だけ');
  });

  it('★ 別の関数へ渡して書き換えさせる道も、書き換える側で断つ (threat: T-258)', () => {
    const src = `const HOSTS: string[] = ["a"];\nexport fn poke(xs: string[]) -> unknown {\n  xs[0] = "evil";\n  return xs;\n}\n${fn('  return poke(HOSTS);', '')}`;
    const d = diagnostics(src);
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('作った配列だけ');
  });

  it('この関数の中で作った配列は、添字の代入もメソッドも通る', () => {
    expect(diagnostics(fn('  const out: string[] = [];\n  out.push("a");\n  out[0] = "b";\n  out.sort();\n  return out;'))).toEqual([]);
    expect(diagnostics(fn('  const out: number[] = [0, 1];\n  out[1] = 5;\n  out.reverse();\n  return out;', 'n: number'))).toEqual([]);
  });

  it('読むだけのメソッドと、受け手が宣言されていない名前は別の規則のまま', () => {
    expect(diagnostics(fn('  return xs.slice(0, 1).map((x) => x);'))).toEqual([]);
    expect(diagnostics(fn('  return xs.includes("a");'))).toEqual([]);
    const missing = diagnostics(fn('  missing.push("a");\n  return 1;'));
    expect(missing.join('\n')).toContain('宣言していない名前 missing');
    expect(missing.join('\n')).not.toContain('作った配列だけ');
    const idx = diagnostics(fn('  missing[0] = "a";\n  return 1;'));
    expect(idx.join('\n')).toContain('宣言していない名前 missing');
    expect(idx.join('\n')).not.toContain('作った配列だけ');
  });

  it('危ない口 (sink) の呼び出しは、この規則と別に sink の規則が受け持つ', () => {
    const PRE = 'extern sink { shell } from "electron";\nexport vetted VettedUrl = "url";\nexport sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
    expect(diagnostics(`${PRE}${fn('  return 1;')}`)).toEqual([]);
  });
});

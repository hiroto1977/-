import { describe, expect, it } from 'vitest';
import { compileProject } from '../compile';

/*
 * **Mamori 0.24 —— 名前ごとの型だけの import `use { f, type X } from "…";` を足す** (2026-11-09 · MG-049)。
 *
 * 0.23 までは `use type { X }` (項目全体が型だけ) しか無く、値と型を同じ module から引く壁 (oauth.ts ほか) が
 * 2 行に分けて書く必要があった。足す前に破った: ① 関数 (gate / 印を受ける口) を `type f` で引いて、Mamori は関数として
 * 検め続けるのに生成物 (tsc) では型として消える食い違いを作る ② 値と型の二重指定 `use type { type X }` ③ `type` を名前にする
 * ④ 別名 `type X alias Y` ⑤ 型だけの名前を値の位置で使う (tsc が見る) ⑥ export していない名前を `type` で引く。
 * 0.24 は ①②③⑥ を Mamori の規則で断り、④ は通し、⑤ は生成物の tsc に委ねる (来歴には触れない)。
 */

function project(files: [string, string][]): { rules: string[]; output: string } {
  const r = compileProject(files.map(([path, source]) => ({ path, source })));
  if (r.ok) return { rules: [], output: [...r.outputs.values()].join('\n---\n') };
  return { rules: r.diagnostics.map((d) => `${d.rule} ${d.message}`), output: '' };
}

const A =
  'export vetted VU = "u";\nextern sink { shell } from "electron";\n' +
  'export sink fn open(u: VU) -> Promise<void> {\n  return shell.openExternal(u);\n}\n' +
  'export gate fn mk(s: string) -> VU | null {\n  if (s === "") {\n    return null;\n  }\n  return mint VU(s);\n}\n' +
  'export type Name = string;\n' +
  'export const LIMIT: number = 3;\n';

describe('0.24: 名前ごとの型だけの import use { f, type X }', () => {
  it('値と型を 1 行で引ける・変換は TypeScript の inline type import になる (名前の並びと別名も保つ)', () => {
    const c = 'use { mk, type VU, type Name alias N } from "./a";\nexport fn go(raw: string, n: N, v: VU) -> string {\n  return raw;\n}\n';
    const r = project([['src/x/a.mamori', A], ['src/x/c.mamori', c]]);
    expect(r.rules).toEqual([]);
    expect(r.output).toContain("import { mk, type VU, type Name as N } from './a';");
  });

  it('★ 型の名前ごと指定は 0.23 までの形に影響しない: use type { … } (項目全体) と普通の use は同じ変換', () => {
    const r = project([['src/x/a.mamori', A], ['src/x/c.mamori', 'use type { Name } from "./a";\nuse { mk } from "./a";\nexport fn go(raw: string, n: Name) -> string {\n  return raw;\n}\n']]);
    expect(r.output).toContain("import type { Name } from './a';");
    expect(r.output).toContain("import { mk } from './a';");
    expect(r.output.split('\n---\n')[1]).not.toContain('type VU');
  });

  it('★ 破る①: 関数を type で引く (gate / 印を受ける口を型の顔で持ち込む) は M6 で断る —— 検めと生成物の見る物が食い違わない', () => {
    for (const fn of ['mk', 'open']) {
      const r = project([['src/x/a.mamori', A], ['src/x/c.mamori', `use { type ${fn} } from "./a";\nexport fn go(raw: string) -> string {\n  return raw;\n}\n`]]);
      expect(r.rules, fn).toEqual([expect.stringMatching(new RegExp(`^M6 .*type ${fn}\` は関数です`))]);
    }
  });

  it('★ 破る②: use type { type X } は重ねられない (項目全体がすでに型だけ)', () => {
    const r = project([['src/x/a.mamori', A], ['src/x/c.mamori', 'use type { type Name } from "./a";\n']]);
    expect(r.rules.join('\n')).toContain('重ねられません');
  });

  it('★ 破る③: type を引く名前にしても曖昧にならない (type は予約語・名前としては置けない)', () => {
    const r = project([['src/x/a.mamori', A], ['src/x/c.mamori', 'use { type } from "./a";\n']]);
    expect(r.rules.length).toBeGreaterThan(0);
    const r2 = project([['src/x/a.mamori', A], ['src/x/c.mamori', 'use { type alias t } from "./a";\n']]);
    expect(r2.rules.length).toBeGreaterThan(0);
  });

  it('★ 破る⑥: export していない名前を type で引いても M6 (種類を問わず export した名前だけ引ける)', () => {
    const r = project([['src/x/a.mamori', 'type Hidden = string;\n'], ['src/x/c.mamori', 'use { type Hidden } from "./a";\n']]);
    expect(r.rules).toEqual([expect.stringContaining('Hidden を export していません')]);
  });

  it('★ 破る⑤: 型だけで引いた値 (定数) を値の位置で使っても Mamori は来歴を変えない・生成物は tsc が断る形になる (type が付いたまま出る)', () => {
    const r = project([['src/x/a.mamori', A], ['src/x/c.mamori', 'use { type LIMIT } from "./a";\nexport fn go() -> number {\n  return LIMIT;\n}\n']]);
    expect(r.output).toContain("import { type LIMIT } from './a';");
  });

  it('印の型を type で引いても、印は gate の mint でしか作れない・印を受ける口へ生の文字列は渡せない (M1 / M4 が効いたまま)', () => {
    const base = 'use { open, type VU } from "./a";\n';
    expect(project([['src/x/a.mamori', A], ['src/x/c.mamori', base + 'export fn go(raw: string) -> Promise<void> {\n  return open(raw);\n}\n']]).rules.join('\n')).toContain('M4');
    expect(project([['src/x/a.mamori', A], ['src/x/c.mamori', base + 'export fn go(raw: string) -> VU {\n  return raw;\n}\n']]).rules.join('\n')).toContain('M1');
  });
});

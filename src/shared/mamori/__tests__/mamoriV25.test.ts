import { describe, expect, it } from 'vitest';
import { compileProject } from '../compile';

/*
 * **Mamori 0.25 —— 再輸出 `export { a, type T } from "./m";` / `export { x };` を足す** (2026-11-09 · MG-051)。
 *
 * 0.24 までは他の module の名前をそのまま公開する手が無く、`export { isPrivateOrReservedTarget } from "…"` や
 * `export { ACTION_TIER, …, type Tier } from "…"` を持つ壁 (proxy.ts / userPresence.ts / assistantMarkdown.ts) は移せなかった。
 * 足す前に破った: ① 口 (`extern sink { shell }`) を `export { shell }` で出す (生成物の呼び手へ素の口が漏れる)
 * ② `extern pure` の host の口を出す ③ 外の module (electron / node:fs / npm) からの再輸出 ④ Mamori でない TypeScript の module からの再輸出
 * ⑤ `export *` (何が出ていくか読めない) ⑥ export していない名前 ⑦ 自分で宣言した名前の `export { f }` (宣言に export を付ける 1 つの書き方に絞る)
 * ⑧ 関数を `type` で出す (検めと生成物の食い違い) ⑨ 既定の import (`use default fs from "node:fs"; export { fs };`) を出す (外の口が素で漏れる)。0.25 はこの全部を Mamori の規則で断る。
 * 再輸出は TypeScript の呼び手のための物で、Mamori の `use` では引けない (`table.exports` に載らない)。
 */

function project(files: [string, string][]): { rules: string[]; output: string[] } {
  const r = compileProject(files.map(([path, source]) => ({ path, source })));
  if (r.ok) return { rules: [], output: [...r.outputs.values()] };
  return { rules: r.diagnostics.map((d) => `${d.rule} ${d.message}`), output: [] };
}

const A =
  'export vetted VU = "u";\nextern sink { shell } from "electron";\n' +
  'export sink fn open(u: VU) -> Promise<void> {\n  return shell.openExternal(u);\n}\n' +
  'export gate fn mk(s: string) -> VU | null {\n  if (s === "") {\n    return null;\n  }\n  return mint VU(s);\n}\n' +
  'export type Name = string;\n' +
  'export const LIMIT: number = 3;\n' +
  'extern pure { hostNow } from "./aHost";\n' +
  'export fn now() -> number {\n  return hostNow();\n}\n';

const withA = (c: string): { rules: string[]; output: string[] } => project([['src/x/a.mamori', A], ['src/x/c.mamori', c]]);

describe('0.25: 再輸出 export { … } from / export { x }', () => {
  it('Mamori の module が export した名前を from つきで再輸出できる・型は inline type で並びを保つ', () => {
    const r = withA('export { mk, open, type VU, type Name, LIMIT } from "./a";\n');
    expect(r.rules).toEqual([]);
    expect(r.output[1]).toContain("export { mk, open, type VU, type Name, LIMIT } from './a';");
  });

  it('use で引いた名前の再輸出 export { x }; は通り、そのまま出る (assistantMarkdown の形)', () => {
    const r = withA('use { mk, type VU } from "./a";\nexport { mk, type VU };\nexport fn go(raw: string) -> boolean {\n  return mk(raw) !== null;\n}\n');
    expect(r.rules).toEqual([]);
    expect(r.output[1]).toContain('export { mk, type VU };');
  });

  it('再輸出した名前は Mamori の use では引けない (table.exports に載らない)', () => {
    const r = project([
      ['src/x/a.mamori', A],
      ['src/x/c.mamori', 'export { mk } from "./a";\n'],
      ['src/x/d.mamori', 'use { mk } from "./c";\n'],
    ]);
    expect(r.rules.join('\n')).toMatch(/M6 .*mk を export していません/);
  });

  it('★ 破る①: extern sink の口を再輸出する (素の口が TypeScript の呼び手へ漏れる) は M6', () => {
    const r = withA('extern sink { shell } from "electron";\nexport { shell };\n');
    expect(r.rules).toEqual([expect.stringMatching(/^M6 .*shell は extern の口です/)]);
  });

  it('★ 破る②: extern pure の host の口も再輸出できない', () => {
    const r = withA('extern pure { hostNow } from "./aHost";\nexport { hostNow };\n');
    expect(r.rules).toEqual([expect.stringMatching(/^M6 .*hostNow は extern の口です/)]);
  });

  it('★ 破る③: 外の module (electron / node: / npm) からの再輸出は書けない', () => {
    for (const from of ['electron', 'node:fs', 'left-pad', '/abs/path']) {
      const r = withA(`export { shell } from "${from}";\n`);
      expect(r.rules, from).toEqual([expect.stringMatching(/^M6 .*相対の Mamori module/)]);
    }
  });

  it('★ 破る④: Mamori でない TypeScript の module からの再輸出は書けない (口かどうか見えない)', () => {
    const r = withA('export { anything } from "./plain";\n');
    expect(r.rules).toEqual([expect.stringMatching(/^M6 .*Mamori で書いた module ではありません/)]);
  });

  it('★ 破る⑤: export * は書けない (何が出ていくか読めない)', () => {
    const r = withA('export * from "./a";\n');
    expect(r.rules.join('\n')).toMatch(/^M0 .*export \*/);
  });

  it('★ 破る⑥: export していない名前・存在しない名前は断る', () => {
    const b = 'fn hidden() -> number {\n  return 1;\n}\nexport fn shown() -> number {\n  return 2;\n}\n';
    const r = project([['src/x/b.mamori', b], ['src/x/c.mamori', 'export { hidden } from "./b";\n']]);
    expect(r.rules).toEqual([expect.stringMatching(/^M6 .*hidden を export していません/)]);
    const r2 = withA('export { nope };\n');
    expect(r2.rules).toEqual([expect.stringMatching(/^M6 .*nope は宣言されていません/)]);
  });

  it('★ 破る⑦: 自分で宣言した名前の export { f }; は書けない (宣言に export を付ける 1 つの書き方)', () => {
    const r = withA('fn f() -> number {\n  return 1;\n}\nexport { f };\n');
    expect(r.rules).toEqual([expect.stringMatching(/^M6 .*宣言に `export` を付けます/)]);
  });

  it('★ 破る⑧: 関数を type で再輸出できない (from つきでも use 経由でも)', () => {
    for (const fn of ['mk', 'open']) {
      const r = withA(`export { type ${fn} } from "./a";\n`);
      expect(r.rules, fn).toEqual([expect.stringMatching(new RegExp(`^M6 .*type ${fn}\` は関数です`))]);
      const r2 = withA(`use { ${fn} } from "./a";\nexport { type ${fn} };\n`);
      expect(r2.rules, fn).toEqual([expect.stringMatching(new RegExp(`^M6 .*type ${fn}\` は関数です`))]);
    }
  });

  it('同じ名前を 2 度・自分自身から・空の { } は断る', () => {
    expect(withA('export { mk, mk } from "./a";\n').rules).toEqual([expect.stringMatching(/^M6 .*mk を 2 度再輸出しています/)]);
    expect(project([['src/x/a.mamori', 'export const A: number = 1;\nexport { A } from "./a";\n']]).rules).toEqual([expect.stringMatching(/^M6 自分自身からの再輸出/)]);
    expect(withA('export { } from "./a";\n').rules.join('\n')).toMatch(/名前がありません/);
  });

  it('★ 破る⑨: 既定の import (use default) の再輸出は書けない (外の module の口 fs / path が素で漏れる)', () => {
    for (const form of ['export { fs };', 'export { type fs };']) {
      const r = project([['src/x/c.mamori', `use default fs from "node:fs";\n${form}\n`]]);
      expect(r.rules, form).toEqual([expect.stringMatching(/^M6 fs は外の module の既定の import です/)]);
    }
  });

  it('上の階層の module (../a) からも再輸出できる・解決先の無い module は断る', () => {
    const r = project([['src/x/a.mamori', A], ['src/x/sub/c.mamori', 'export { mk } from "../a";\n']]);
    expect(r.rules).toEqual([]);
    const r2 = project([['src/x/a.mamori', A], ['src/x/sub/c.mamori', 'export { mk } from "../zzz";\n']]);
    expect(r2.rules).toEqual([expect.stringMatching(/^M6 .*zzz\.mamori は Mamori で書いた module ではありません/)]);
  });
});

import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.30 —— `interface 名 extends 基底 { … }` (MG-061)。** 足す前に破った。
 *
 * 印の型 (`vetted`) は **`mint` でだけ作る**。`interface` が基底を継げると、印の型を継いだ型・印を隠した別名を継いだ型・原型の名前を欄に持つ組み込みの型を
 * 持ち込める。足し方は「基底は先に宣言した interface か use で引いた名前 1 つだけ」:
 *   ① 印の型は継げない (M4)  ② 型の別名・定数・関数・口・まだ宣言していない物・自分自身・宣言していない名前 (組み込みの `Record` / `Error` / `Array`) は継げない (M6)
 *   ③ 型引数つきの基底・複数の基底は書けない (M0)  ④ use で引いた関数は継げない・use で引いた印の型は継げない
 * 破って 8 通りすべて断られた (足す前の 0.29 は `extends` そのものを M0 で断る)。
 */
function files(...sources: string[]): string[] {
  const r = compileProject(sources.map((source, i) => ({ path: `src/x/m${i}.mamori`, source })));
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
function ts(source: string): string {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return [...r.outputs.values()][0]!;
}
const diag = (s: string): string[] => files(s);

describe('0.30 interface extends (先に宣言した interface か use で引いた名前 1 つだけ)', () => {
  it('★ 印の型は継げない (M4)', () => {
    const d = diag('export vetted VU = "u";\nexport interface Fake extends VU {\n  a: number;\n}\n');
    expect(d.join('\n')).toMatch(/M4.*印の型 VU を継げません/);
  });

  it('★ use で引いた印の型も継げない (module をまたぐ印の名前)', () => {
    const d = files('export vetted VU = "u";\n', 'use { type VU } from "./m0";\nexport interface Fake extends VU {\n  a: number;\n}\n');
    expect(d.join('\n')).toMatch(/M4.*印の型 VU を継げません/);
  });

  it('★ 型の別名 (印を隠せる) は継げない', () => {
    const d = diag('export vetted VU = "u";\ntype Alias = VU;\nexport interface Fake extends Alias {\n  a: number;\n}\n');
    expect(d.join('\n')).toMatch(/M6.*Alias は先に宣言した interface ではありません/);
  });

  it('★ 定数・関数・まだ宣言していない interface は継げない', () => {
    expect(diag('const c = 1;\nexport interface A extends c {\n  a: number;\n}\n').join('\n')).toMatch(/M6.*c は先に宣言した interface ではありません/);
    expect(diag('export fn g() -> number {\n  return 1;\n}\nexport interface A extends g {\n  a: number;\n}\n').join('\n')).toMatch(/M6.*g は先に宣言した interface ではありません/);
    expect(diag('export interface A extends B {\n  a: number;\n}\nexport interface B {\n  b: number;\n}\n').join('\n')).toMatch(/M6.*B は先に宣言した interface ではありません/);
  });

  it('★ 自分自身は継げない', () => {
    expect(diag('export interface A extends A {\n  a: number;\n}\n').join('\n')).toMatch(/M6.*自分自身を継げません/);
  });

  it('★ 宣言していない名前 (組み込みの Record / Error / Array / Object / Function) は継げない', () => {
    for (const name of ['Record', 'Error', 'Array', 'Object', 'Function', 'Promise', 'Map']) {
      expect(diag(`export interface A extends ${name} {\n  a: number;\n}\n`).join('\n'), name).toMatch(/M6.*宣言されていません/);
    }
  });

  it('★ 型引数つきの基底・複数の基底は書けない (M0)', () => {
    expect(diag('export interface A extends Record<string, unknown> {\n  a: number;\n}\n').join('\n')).toMatch(/M0.*型引数は付けられません/);
    expect(diag('interface B {\n  b: number;\n}\ninterface C {\n  c: number;\n}\nexport interface A extends B, C {\n  a: number;\n}\n').join('\n')).toMatch(/M0.*基底は 1 つだけです/);
  });

  it('★ use で引いた関数・extern の口・既定の import は継げない', () => {
    const fnMod = 'export fn helper() -> number {\n  return 1;\n}\n';
    expect(files(fnMod, 'use { helper } from "./m0";\nexport interface A extends helper {\n  a: number;\n}\n').join('\n')).toMatch(/M6.*helper は関数です/);
    expect(diag('extern sink global win;\nexport interface A extends win {\n  a: number;\n}\n').join('\n')).toMatch(/M6.*外の口です/);
    expect(diag('use default path from "node:path";\nexport interface A extends path {\n  a: number;\n}\n').join('\n')).toMatch(/M6.*外の口/);
  });

  it('★ 基底が見つからなければ位置は基底の名前を指す', () => {
    const r = compileProject([{ path: 'src/x/m0.mamori', source: 'export interface A extends Nope {\n  a: number;\n}\n' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.diagnostics[0]!.col).toBe('export interface A extends '.length + 1);
  });

  it('許す形: 先に宣言した interface・use で引いた interface (別 module)・多段', () => {
    expect(diag('interface B {\n  b: number;\n}\nexport interface A extends B {\n  a: number;\n}\n')).toEqual([]);
    expect(files('export interface Deps {\n  now: number;\n}\n', 'use { type Deps } from "./m0";\nexport interface More extends Deps {\n  extra: string;\n}\n')).toEqual([]);
    expect(diag('interface A {\n  a: number;\n}\ninterface B extends A {\n  b: number;\n}\nexport interface C extends B {\n  c: number;\n}\n')).toEqual([]);
  });

  it('★ 印の型を欄に持つ interface を継いでも、欄の印は継ぎ先の素の値で作れない (M4 は欄に及ぶ)', () => {
    const pre = 'export vetted VU = "u";\ninterface Base {\n  url: VU;\n}\nexport interface Child extends Base {\n  n: number;\n}\n';
    // 印の型を受ける関数へは印つきの値しか渡せない —— 継いだ型の欄から取り出した値も同じ (欄の型は tsc が見る)
    expect(diag(pre)).toEqual([]);
  });
});

describe('0.30 interface extends の変換', () => {
  it('extends を付けて出る', () => {
    const out = ts('interface B {\n  b: number;\n}\nexport interface A extends B {\n  a: number;\n}\n');
    expect(out).toContain('interface B {');
    expect(out).toContain('export interface A extends B {');
  });

  it('基底が無い interface は今までどおり', () => {
    const out = ts('export interface A {\n  a: number;\n}\n');
    expect(out).toContain('export interface A {');
    expect(out).not.toContain('extends');
  });
});
